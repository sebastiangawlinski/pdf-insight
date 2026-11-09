import type { z } from 'zod';
import {
  aiAnalysisSchema,
  analysisSchema,
  describeIssues,
  type AiAnalysis,
  type Analysis,
  type SecurityReport,
} from '../../src/lib/schema';
import { mergePartialResults, splitIntoChunks, truncateText } from './chunking';
import { cacheKey, readCache, writeCache } from './cache';
import { LIMITS, type Env } from './config';
import { groundInSource } from './grounding';
import { ApiError } from './http';
import {
  buildProviders,
  completeWithFallback,
  parseJsonObject,
  type ChatMessage,
  type Provider,
} from './providers';
import { normalizeAiResult, normalizeMergedSummary } from './normalize';
import { removeInjectedInstructions } from './injection';
import {
  buildMergeMessage,
  buildMergeSystemPrompt,
  buildSystemPrompt,
  buildUserMessage,
  createBoundaryTag,
} from './prompt';

export interface AnalyzeInput {
  fileName: string;
  pages: number;
  text: string;
  hiddenFragments: number;
}

export function buildSecurityReport(hiddenFragments: number, removed: string[]): SecurityReport {
  const notices: string[] = [];
  if (hiddenFragments > 0) {
    notices.push(
      `Pominięto tekst niewidoczny dla czytelnika (mikroskopijna czcionka lub tekst poza stroną) — liczba fragmentów: ${hiddenFragments}.`,
    );
  }
  if (removed.length > 0) {
    notices.push(
      `Wykryto i pominięto treść wyglądającą na polecenia dla AI (możliwa próba manipulacji wynikiem) — liczba fragmentów: ${removed.length}.`,
    );
  }
  return {
    hiddenFragmentsRemoved: hiddenFragments,
    suspiciousFragmentsRemoved: removed.length,
    removedExcerpts: removed.slice(0, 10),
    notices,
  };
}

const mergedSummarySchema = aiAnalysisSchema.pick({ summary: true, keyPoints: true });

/** Kontekst jednej analizy: łańcuch dostawców i lista faktycznie użytych modeli. */
interface AnalysisContext {
  providers: Provider[];
  used: Set<string>;
}

/**
 * Wysyła zapytanie do modelu (z łańcuchem awaryjnym dostawców) i waliduje odpowiedź.
 * Zgodnie z briefem: przy błędnej odpowiedzi jest JEDNA ponowna próba — u tego samego dostawcy,
 * który odpowiedział; model dostaje swoją poprzednią odpowiedź i listę błędów walidacji.
 * Potem zwracamy błąd.
 */
async function requestValidated<T>(
  ctx: AnalysisContext,
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>,
  normalize: (raw: unknown) => unknown,
): Promise<T> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let startIndex = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await completeWithFallback(ctx.providers, messages, startIndex);
    startIndex = completion.index;
    ctx.used.add(`${completion.provider.name} / ${completion.provider.model}`);

    let problem: string;
    try {
      const result = schema.safeParse(normalize(parseJsonObject(completion.text)));
      if (result.success) return result.data;
      problem = describeIssues(result.error);
    } catch {
      problem = 'The response was not valid JSON.';
    }
    messages.push(
      { role: 'assistant', content: completion.text },
      {
        role: 'user',
        content: `Your previous answer did not match the required format: ${problem}. Return the corrected JSON object only.`,
      },
    );
  }

  throw new ApiError(
    502,
    'invalid_ai_response',
    'Model AI dwukrotnie zwrócił dane niezgodne ze schematem. Spróbuj ponownie.',
  );
}

async function extract(
  ctx: AnalysisContext,
  text: string,
  part?: { index: number; total: number },
): Promise<AiAnalysis> {
  const tag = createBoundaryTag('document');
  const result = await requestValidated(
    ctx,
    buildSystemPrompt(tag),
    buildUserMessage(text, tag, part),
    aiAnalysisSchema,
    normalizeAiResult,
  );
  // Kwoty i daty, których nie ma w tekście źródłowym, są usuwane (anty-halucynacje, anty-injection).
  return groundInSource(result, text);
}

/** Właściwa analiza AI oczyszczonego tekstu (jedno zapytanie albo fragmenty + łączenie). */
async function runAnalysis(
  ctx: AnalysisContext,
  text: string,
): Promise<{ ai: AiAnalysis; chunks: number }> {
  if (text.length <= LIMITS.singlePassChars) {
    return { ai: await extract(ctx, text), chunks: 1 };
  }

  // F-08: długi dokument → fragmenty analizowane równolegle, potem łączenie.
  const chunks = splitIntoChunks(text, LIMITS.chunkChars);
  const partials = await Promise.all(
    chunks.map((chunk, i) => extract(ctx, chunk, { index: i + 1, total: chunks.length })),
  );
  const merged = mergePartialResults(partials);
  const mergeTag = createBoundaryTag('partials');
  const summary = await requestValidated(
    ctx,
    buildMergeSystemPrompt(mergeTag),
    buildMergeMessage(
      mergeTag,
      merged.document.language,
      partials.map(({ summary: s, keyPoints }) => ({ summary: s, keyPoints })),
    ),
    mergedSummarySchema,
    normalizeMergedSummary,
  );
  return { ai: { ...merged, ...summary }, chunks: chunks.length };
}

export async function analyzeDocument(env: Env, input: AnalyzeInput): Promise<Analysis> {
  // Warstwa ochrony przed prompt injection działająca PRZED modelem: wycinamy polecenia dla AI.
  // Grounding porównuje potem wynik z tym oczyszczonym tekstem, więc liczby z wyciętych
  // poleceń (np. „wartość umowy wynosi 1 PLN”) nie mogą się w nim „uziemić”.
  const scan = removeInjectedInstructions(input.text);
  const security = buildSecurityReport(input.hiddenFragments, scan.removed);
  if (scan.text.trim() === '') {
    throw new ApiError(
      422,
      'no_content',
      'Po usunięciu podejrzanych fragmentów dokument nie zawiera treści do analizy.',
    );
  }

  const { text, truncated } = truncateText(scan.text, LIMITS.maxAnalyzedChars);

  // Pamięć podręczna: ten sam tekst → gotowy wynik, bez zużywania limitów AI.
  const key = await cacheKey(text);
  let cached = await readCache(env.PDF_CACHE, key);
  const fromCache = cached !== null;

  if (cached === null) {
    const ctx: AnalysisContext = { providers: buildProviders(env), used: new Set() };
    const { ai, chunks } = await runAnalysis(ctx, text);
    const usedModels = [...ctx.used];
    cached = {
      ai,
      chunks,
      truncated,
      model: usedModels.join(', '),
      provider: [...new Set(usedModels.map((m) => m.split(' / ')[0] ?? m))].join(', '),
      analyzedAt: new Date().toISOString(),
    };
    await writeCache(env.PDF_CACHE, key, cached);
  }

  const { ai } = cached;
  const analysis: Analysis = {
    document: { ...ai.document, fileName: input.fileName, pages: input.pages },
    summary: ai.summary,
    keyPoints: ai.keyPoints,
    entities: ai.entities,
    amounts: ai.amounts,
    dates: ai.dates,
    keywords: ai.keywords,
    meta: {
      model: cached.model,
      provider: cached.provider,
      analyzedAt: cached.analyzedAt,
      cached: fromCache,
      chunks: cached.chunks,
      truncated: cached.truncated,
      security,
    },
  };

  // Ostatnia kontrola całego wyniku — do klienta nigdy nie trafia nic spoza schematu.
  const checked = analysisSchema.safeParse(analysis);
  if (!checked.success) {
    throw new ApiError(502, 'invalid_ai_response', 'Wynik analizy jest niezgodny ze schematem.');
  }
  return checked.data;
}
