import { analyzeDocument } from './analyze';
import type { Env } from './config';
import { ApiError, corsHeaders, errorResponse, jsonResponse, parseAllowedOrigins } from './http';
import { readAnalyzeRequest } from './request';

/**
 * PDF Insight API — proxy między frontendem (GitHub Pages) a modelami AI.
 * Łączy się z Cloudflare Workers AI (binding, bez klucza) i awaryjnie z Groq (klucz w sekretach),
 * ogranicza CORS do domeny demo, limituje liczbę żądań na adres IP
 * i trzyma wyniki w pamięci podręcznej (KV).
 *
 *   GET  /health   → { ok: true }
 *   POST /analyze  → { fileName, pages, text } → wynik zgodny ze schematem
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, allowedOrigins);
    const originAllowed = origin !== null && allowedOrigins.includes(origin);

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return jsonResponse({ ok: true }, 200, cors);
      }

      if (url.pathname !== '/analyze') {
        throw new ApiError(404, 'not_found', 'Nie znaleziono.');
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
      }

      if (request.method !== 'POST') {
        throw new ApiError(405, 'method_not_allowed', 'Niedozwolona metoda.');
      }

      // CORS chroni przeglądarki, ale nie skrypty — dlatego sprawdzamy Origin także po stronie serwera.
      if (!originAllowed) {
        throw new ApiError(403, 'forbidden_origin', 'Brak dostępu z tej domeny.');
      }

      if (env.RATE_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const { success } = await env.RATE_LIMITER.limit({ key: ip });
        if (!success) {
          throw new ApiError(
            429,
            'rate_limited',
            'Zbyt wiele analiz w krótkim czasie. Odczekaj minutę i spróbuj ponownie.',
          );
        }
      }

      if (!env.LLM_API_KEY) {
        throw new ApiError(
          500,
          'not_configured',
          'Serwer nie jest skonfigurowany (brak klucza API).',
        );
      }

      const input = await readAnalyzeRequest(request);
      const analysis = await analyzeDocument(env, input);
      return jsonResponse(analysis, 200, cors);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error, cors);
      return errorResponse(
        new ApiError(500, 'internal_error', 'Wystąpił nieoczekiwany błąd serwera.'),
        cors,
      );
    }
  },
} satisfies ExportedHandler<Env>;
