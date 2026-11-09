import { DEFAULT_WORKERS_AI_MODEL, LIMITS, type Env } from './config';
import { ApiError } from './http';

/**
 * Dostawcy modeli AI i łańcuch awaryjny.
 *
 * Kolejność: Cloudflare Workers AI (binding, bez klucza) → Groq (modele z LLM_MODELS).
 * Gdy dostawca zwróci błąd limitu, błąd serwera, nie odpowie na czas albo dokument jest
 * dla niego za duży — próbujemy następnego. Każdy dostawca ma osobny darmowy limit,
 * więc łańcuch sumuje dostępną liczbę analiz dziennie.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Provider {
  /** Nazwa dla ludzi, np. "Workers AI". */
  name: string;
  /** Identyfikator modelu u dostawcy. */
  model: string;
  /** Maksymalna szacowana liczba tokenów wejścia; null = bez dodatkowego limitu. */
  maxInputTokens: number | null;
  complete(messages: ChatMessage[]): Promise<string>;
}

export type ProviderFailure = 'rate_limit' | 'timeout' | 'unavailable' | 'too_large';

/** Błąd jednego dostawcy — nie przerywa analizy, tylko przełącza na następnego. */
export class ProviderError extends Error {
  readonly failure: ProviderFailure;

  constructor(failure: ProviderFailure, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.failure = failure;
  }
}

/** Szacunek liczby tokenów (ostrożnie: ~3 znaki na token dla polskiego tekstu). */
export function estimateTokens(messages: ChatMessage[]): number {
  return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 3);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderError('timeout', 'Przekroczono czas odpowiedzi'));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Wyciąga tekst odpowiedzi z różnych formatów zwracanych przez modele Workers AI. */
export function extractWorkersAiText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (typeof result !== 'object' || result === null) return '';
  const record = result as Record<string, unknown>;
  const response = record.response;
  if (typeof response === 'string') return response;
  // W trybie JSON część modeli zwraca od razu obiekt zamiast tekstu.
  if (typeof response === 'object' && response !== null) return JSON.stringify(response);
  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first: unknown = choices[0];
    if (typeof first === 'object' && first !== null) {
      const message = (first as { message?: { content?: unknown } }).message;
      if (typeof message?.content === 'string') return message.content;
    }
  }
  return '';
}

export function workersAiProvider(ai: Ai, model: string): Provider {
  return {
    name: 'Workers AI',
    model,
    maxInputTokens: null,
    async complete(messages) {
      let result: unknown;
      try {
        result = await withTimeout(
          // Typy bindingu znają tylko modele z katalogu w chwili wydania paczki typów,
          // a model jest konfigurowalny — stąd jawne rzutowanie nazwy i parametrów.
          (ai.run as (model: string, inputs: Record<string, unknown>) => Promise<unknown>)(model, {
            messages,
            max_tokens: LIMITS.maxOutputTokens,
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          LIMITS.llmTimeoutMs,
        );
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        // 3036 = wyczerpany dzienny darmowy limit neuronów, 3040 = brak mocy obliczeniowej
        const failure: ProviderFailure = /3036|3040|limit|capacity|429/i.test(message)
          ? 'rate_limit'
          : 'unavailable';
        throw new ProviderError(failure, `Workers AI: ${message.slice(0, 200)}`);
      }
      const text = extractWorkersAiText(result);
      if (text.trim() === '') throw new ProviderError('unavailable', 'Workers AI: pusta odpowiedź');
      return text;
    },
  };
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/** Dowolne API zgodne z OpenAI Chat Completions (tu: Groq). */
export function openAiCompatibleProvider(options: {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxInputTokens: number | null;
}): Provider {
  const { name, baseUrl, apiKey, model, maxInputTokens } = options;
  return {
    name,
    model,
    maxInputTokens,
    async complete(messages) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            max_tokens: LIMITS.maxOutputTokens,
            response_format: { type: 'json_object' },
            // modele gpt-oss „myślą” przed odpowiedzią — ograniczamy to, żeby zmieścić się w limicie
            ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
          }),
          signal: AbortSignal.timeout(LIMITS.llmTimeoutMs),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new ProviderError('timeout', `${name}: przekroczono czas odpowiedzi`);
        }
        throw new ProviderError('unavailable', `${name}: brak połączenia`);
      }

      if (response.status === 429) throw new ProviderError('rate_limit', `${name}: limit`);
      if (response.status === 413) throw new ProviderError('too_large', `${name}: za duże`);
      if (!response.ok) {
        throw new ProviderError('unavailable', `${name}: błąd ${response.status}`);
      }
      const data: ChatCompletionResponse = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new ProviderError('unavailable', `${name}: pusta odpowiedź`);
      }
      return content;
    },
  };
}

/** Buduje łańcuch dostawców z konfiguracji. */
export function buildProviders(env: Env): Provider[] {
  const providers: Provider[] = [];
  if (env.AI) {
    providers.push(workersAiProvider(env.AI, env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL));
  }
  if (env.LLM_API_KEY && env.LLM_BASE_URL) {
    for (const model of (env.LLM_MODELS ?? '').split(',')) {
      if (model.trim() === '') continue;
      providers.push(
        openAiCompatibleProvider({
          name: 'Groq',
          baseUrl: env.LLM_BASE_URL,
          apiKey: env.LLM_API_KEY,
          model: model.trim(),
          maxInputTokens: LIMITS.groqMaxInputTokens,
        }),
      );
    }
  }
  return providers;
}

export interface Completion {
  text: string;
  provider: Provider;
  /** Pozycja dostawcy w łańcuchu — ponowna próba zaczyna od tego samego dostawcy. */
  index: number;
}

/**
 * Wysyła zapytanie do pierwszego dostępnego dostawcy, zaczynając od `startIndex`.
 * Zwraca błąd dopiero, gdy zawiodą wszyscy.
 */
export async function completeWithFallback(
  providers: Provider[],
  messages: ChatMessage[],
  startIndex = 0,
): Promise<Completion> {
  if (providers.length === 0) {
    throw new ApiError(500, 'not_configured', 'Serwer nie ma skonfigurowanego dostawcy AI.');
  }

  const tokens = estimateTokens(messages);
  const failures: ProviderFailure[] = [];

  for (let index = startIndex; index < providers.length; index++) {
    const provider = providers[index];
    if (provider === undefined) continue;
    if (provider.maxInputTokens !== null && tokens > provider.maxInputTokens) {
      failures.push('too_large');
      continue;
    }
    try {
      return { text: await provider.complete(messages), provider, index };
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      failures.push(error.failure);
    }
  }

  if (failures.includes('rate_limit')) {
    throw new ApiError(
      429,
      'llm_rate_limited',
      'Dzienny limit darmowych usług AI został chwilowo wyczerpany. Spróbuj ponownie później.',
    );
  }
  if (failures.every((failure) => failure === 'too_large')) {
    throw new ApiError(413, 'llm_too_large', 'Dokument jest zbyt długi dla dostępnych modeli AI.');
  }
  if (failures.includes('timeout')) {
    throw new ApiError(504, 'llm_timeout', 'Model AI nie odpowiedział na czas. Spróbuj ponownie.');
  }
  throw new ApiError(502, 'llm_unavailable', 'Usługa AI jest chwilowo niedostępna.');
}

/**
 * Wyciąga obiekt JSON z odpowiedzi modelu. W trybie JSON odpowiedź powinna być czystym
 * obiektem, ale na wszelki wypadek tolerujemy otoczkę ```json ... ```.
 */
export function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError('Odpowiedź nie zawiera obiektu JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
