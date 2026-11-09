import { z } from 'zod';
import { analysisSchema, type Analysis } from '../lib/schema';

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Limit czasu po stronie przeglądarki (długie dokumenty = kilka wywołań modelu). */
const REQUEST_TIMEOUT_MS = 60_000;

export class AnalyzeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyzeError';
  }
}

const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export interface AnalyzeRequest {
  fileName: string;
  pages: number;
  text: string;
}

/**
 * Wysyła tekst dokumentu do backendu i waliduje odpowiedź schematem (F-04)
 * — do interfejsu trafia wyłącznie wynik zgodny ze schematem.
 */
export async function analyzeDocument(request: AnalyzeRequest): Promise<Analysis> {
  if (API_URL === '') {
    throw new AnalyzeError('Aplikacja nie ma skonfigurowanego adresu API (VITE_API_URL).');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new AnalyzeError('Analiza trwa zbyt długo. Spróbuj ponownie.');
    }
    throw new AnalyzeError(
      'Brak połączenia z serwerem analizy. Sprawdź internet i spróbuj ponownie.',
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    throw new AnalyzeError(
      parsedError.success
        ? parsedError.data.error.message
        : `Serwer analizy zwrócił błąd (${response.status}).`,
    );
  }

  const parsed = analysisSchema.safeParse(body);
  if (!parsed.success) {
    throw new AnalyzeError('Otrzymany wynik jest niezgodny ze schematem danych.');
  }
  return parsed.data;
}
