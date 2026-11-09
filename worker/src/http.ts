/** Błąd z kodem HTTP i komunikatem po polsku, który można bezpiecznie pokazać użytkownikowi. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Szczegóły techniczne (np. co zawiodło u którego dostawcy AI) — pomagają w diagnozie. */
  readonly details: string | undefined;

  constructor(status: number, code: string, message: string, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

/**
 * Nagłówki CORS. Odpowiadamy Access-Control-Allow-Origin tylko dla originów z listy,
 * więc przeglądarka zablokuje wywołania z każdej innej strony.
 */
export function corsHeaders(origin: string | null, allowed: string[]): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  if (origin !== null && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

export function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function errorResponse(error: ApiError, headers: Headers): Response {
  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    },
    error.status,
    headers,
  );
}
