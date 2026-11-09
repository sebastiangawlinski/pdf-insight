/** Zmienne środowiskowe Workera (wrangler.jsonc → "vars", sekrety → `wrangler secret put`). */
export interface Env {
  /** Sekret: klucz API dostawcy LLM. Nigdy nie trafia do frontendu ani do repozytorium. */
  LLM_API_KEY: string;
  /** Bazowy URL API zgodnego z OpenAI Chat Completions, np. https://api.groq.com/openai/v1 */
  LLM_BASE_URL: string;
  /** Identyfikator modelu u dostawcy. */
  LLM_MODEL: string;
  /** Lista dozwolonych originów (CORS), rozdzielona przecinkami. */
  ALLOWED_ORIGINS: string;
  /** Binding Cloudflare Rate Limiting — limit żądań na adres IP. */
  RATE_LIMITER?: RateLimit;
}

export const LIMITS = {
  /** Maksymalny rozmiar ciała żądania (sam tekst, nie plik PDF). */
  maxBodyBytes: 2_000_000,
  /** Maksymalna długość nazwy pliku. */
  maxFileNameLength: 255,
  /** Maksymalna liczba stron, jaką przyjmujemy. */
  maxPages: 2000,
  /** Ile znaków tekstu analizujemy maksymalnie (resztę obcinamy i oznaczamy w meta.truncated). */
  maxAnalyzedChars: 60_000,
  /** Tekst krótszy niż to idzie do modelu w jednym zapytaniu. */
  singlePassChars: 24_000,
  /** Docelowy rozmiar fragmentu przy dzieleniu długich dokumentów. */
  chunkChars: 16_000,
  /** Limit czasu jednego wywołania LLM. */
  llmTimeoutMs: 25_000,
  /** Maksymalna liczba tokenów odpowiedzi modelu. */
  maxOutputTokens: 2_500,
} as const;
