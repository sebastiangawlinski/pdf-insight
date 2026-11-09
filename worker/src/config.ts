/** Zmienne środowiskowe i bindingi Workera (wrangler.jsonc, sekrety → `wrangler secret put`). */
export interface Env {
  /** Binding Cloudflare Workers AI — główny dostawca, bez klucza API. */
  AI?: Ai;
  /** Model w Workers AI, np. "@cf/google/gemma-4-26b-a4b-it". */
  WORKERS_AI_MODEL?: string;

  /** Sekret: klucz API dostawcy zapasowego (Groq). Nigdy nie trafia do frontendu ani do repozytorium. */
  LLM_API_KEY?: string;
  /** Bazowy URL API zgodnego z OpenAI Chat Completions dostawcy zapasowego. */
  LLM_BASE_URL?: string;
  /** Modele dostawcy zapasowego w kolejności użycia, rozdzielone przecinkami. */
  LLM_MODELS?: string;

  /** Lista dozwolonych originów (CORS), rozdzielona przecinkami. */
  ALLOWED_ORIGINS: string;
  /** Binding Cloudflare Rate Limiting — limit żądań na adres IP. */
  RATE_LIMITER?: RateLimit;
  /** Binding Cloudflare KV — pamięć podręczna wyników analiz. */
  PDF_CACHE?: KVNamespace;
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
  /** Maksymalna liczba tokenów odpowiedzi modelu (krótsza odpowiedź = szybsza analiza). */
  maxOutputTokens: 1_500,
  /**
   * Groq (darmowy plan) ma limit 8 tys. tokenów na minutę, liczony z wejściem i wyjściem.
   * Większych zapytań w ogóle tam nie wysyłamy — od razu przechodzimy dalej.
   */
  groqMaxInputTokens: 4_500,
  /** Jak długo trzymamy wynik w pamięci podręcznej (7 dni). */
  cacheTtlSeconds: 7 * 24 * 60 * 60,
} as const;

/** Domyślny model Workers AI (jeśli nie ustawiono WORKERS_AI_MODEL). */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

/**
 * Wersja promptu i reguł analizy. Wchodzi do klucza pamięci podręcznej — zmiana promptu
 * unieważnia stare wyniki.
 */
export const ANALYSIS_VERSION = 'v3';
