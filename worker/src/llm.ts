import { LIMITS, type Env } from './config';
import { ApiError } from './http';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * Wywołanie dowolnego API zgodnego z OpenAI Chat Completions (Groq, OpenRouter, Gemini
 * przez endpoint OpenAI, Ollama...). Zmiana dostawcy = zmiana LLM_BASE_URL i LLM_MODEL.
 * Zwraca surowy tekst odpowiedzi modelu (oczekujemy JSON).
 */
export async function callLlm(env: Env, messages: ChatMessage[]): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${env.LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: LIMITS.maxOutputTokens,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(LIMITS.llmTimeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(
        504,
        'llm_timeout',
        'Model AI nie odpowiedział na czas. Spróbuj ponownie.',
      );
    }
    throw new ApiError(502, 'llm_unreachable', 'Nie udało się połączyć z usługą AI.');
  }

  if (response.status === 429) {
    throw new ApiError(
      429,
      'llm_rate_limited',
      'Limit darmowego API AI został chwilowo wyczerpany. Spróbuj ponownie za minutę.',
    );
  }
  if (response.status === 413) {
    throw new ApiError(413, 'llm_too_large', 'Dokument jest zbyt długi dla modelu AI.');
  }
  if (!response.ok) {
    throw new ApiError(502, 'llm_error', `Usługa AI zwróciła błąd (${response.status}).`);
  }

  const data: ChatCompletionResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new ApiError(502, 'llm_empty', 'Model AI zwrócił pustą odpowiedź.');
  }
  return content;
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
