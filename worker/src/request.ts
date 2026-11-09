import { z } from 'zod';
import { LIMITS } from './config';
import { ApiError } from './http';
import type { AnalyzeInput } from './analyze';

const requestSchema = z.object({
  fileName: z.string().trim().min(1).max(LIMITS.maxFileNameLength),
  pages: z.number().int().min(1).max(LIMITS.maxPages),
  text: z.string().trim().min(1),
  /** Liczba fragmentów ukrytego tekstu pominiętych przez frontend (tylko do raportu). */
  hiddenFragments: z.number().int().min(0).max(100_000).default(0),
});

/** Odczytuje i waliduje ciało żądania POST /analyze z limitem rozmiaru. */
export async function readAnalyzeRequest(request: Request): Promise<AnalyzeInput> {
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Oczekiwano danych w formacie JSON.');
  }

  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > LIMITS.maxBodyBytes) {
    throw new ApiError(413, 'payload_too_large', 'Treść dokumentu jest zbyt duża.');
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > LIMITS.maxBodyBytes) {
    throw new ApiError(413, 'payload_too_large', 'Treść dokumentu jest zbyt duża.');
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Niepoprawny format żądania.');
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid_request', 'Niepoprawne dane żądania.');
  }
  return parsed.data;
}
