import type { z } from 'zod';
import {
  aiAnalysisSchema,
  analysisSchema,
  describeIssues,
  type AiAnalysis,
  type Analysis,
} from '../../src/lib/schema';
import { mergePartialResults, splitIntoChunks, truncateText } from './chunking';
import { LIMITS, type Env } from './config';
import { groundInSource } from './grounding';
import { ApiError } from './http';
import { callLlm, parseJsonObject } from './llm';
import { normalizeAiResult, normalizeMergedSummary } from './normalize';
import { buildMergeMessage, buildUserMessage, MERGE_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompt';

export interface AnalyzeInput {
  fileName: string;
  pages: number;
  text: string;
}

const mergedSummarySchema = aiAnalysisSchema.pick({ summary: true, keyPoints: true });

/**
 * Wysyła zapytanie do modelu i waliduje odpowiedź.
 * Zgodnie z briefem: przy błędnej odpowiedzi jest JEDNA ponowna próba — model dostaje
 * swoją poprzednią odpowiedź i listę błędów walidacji. Potem zwracamy błąd.
 */
async function requestValidated<T>(
  env: Env,
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>,
  normalize: (raw: unknown) => unknown,
): Promise<T> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callLlm(env, messages);
    let problem: string;
    try {
      const result = schema.safeParse(normalize(parseJsonObject(raw)));
      if (result.success) return result.data;
      problem = describeIssues(result.error);
    } catch {
      problem = 'The response was not valid JSON.';
    }
    messages.push(
      { role: 'assistant', content: raw },
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
  env: Env,
  text: string,
  part?: { index: number; total: number },
): Promise<AiAnalysis> {
  const result = await requestValidated(
    env,
    SYSTEM_PROMPT,
    buildUserMessage(text, part),
    aiAnalysisSchema,
    normalizeAiResult,
  );
  // Kwoty i daty, których nie ma w tekście źródłowym, są usuwane (anty-halucynacje, anty-injection).
  return groundInSource(result, text);
}

export async function analyzeDocument(env: Env, input: AnalyzeInput): Promise<Analysis> {
  const { text, truncated } = truncateText(input.text, LIMITS.maxAnalyzedChars);

  let ai: AiAnalysis;
  let chunkCount = 1;

  if (text.length <= LIMITS.singlePassChars) {
    ai = await extract(env, text);
  } else {
    // F-08: długi dokument → fragmenty analizowane równolegle, potem łączenie.
    const chunks = splitIntoChunks(text, LIMITS.chunkChars);
    chunkCount = chunks.length;
    const partials = await Promise.all(
      chunks.map((chunk, i) => extract(env, chunk, { index: i + 1, total: chunks.length })),
    );
    const merged = mergePartialResults(partials);
    const summary = await requestValidated(
      env,
      MERGE_SYSTEM_PROMPT,
      buildMergeMessage(
        merged.document.language,
        partials.map(({ summary: s, keyPoints }) => ({ summary: s, keyPoints })),
      ),
      mergedSummarySchema,
      normalizeMergedSummary,
    );
    ai = { ...merged, ...summary };
  }

  const analysis: Analysis = {
    document: { ...ai.document, fileName: input.fileName, pages: input.pages },
    summary: ai.summary,
    keyPoints: ai.keyPoints,
    entities: ai.entities,
    amounts: ai.amounts,
    dates: ai.dates,
    keywords: ai.keywords,
    meta: {
      model: env.LLM_MODEL,
      analyzedAt: new Date().toISOString(),
      chunks: chunkCount,
      truncated,
    },
  };

  // Ostatnia kontrola całego wyniku — do klienta nigdy nie trafia nic spoza schematu.
  const checked = analysisSchema.safeParse(analysis);
  if (!checked.success) {
    throw new ApiError(502, 'invalid_ai_response', 'Wynik analizy jest niezgodny ze schematem.');
  }
  return checked.data;
}
