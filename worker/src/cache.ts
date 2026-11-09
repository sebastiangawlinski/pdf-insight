import { z } from 'zod';
import { aiAnalysisSchema } from '../../src/lib/schema';
import { ANALYSIS_VERSION, LIMITS } from './config';

/**
 * Pamięć podręczna wyników (Cloudflare KV).
 * Ten sam (oczyszczony) tekst → ten sam wynik, bez ponownego wywołania modelu i bez zużywania
 * darmowych limitów. Wpisy wygasają automatycznie po 7 dniach.
 *
 * Kluczem jest skrót SHA-256 tekstu, a nie sam tekst. Nazwy pliku i liczby stron nie zapisujemy —
 * są dokładane do wyniku z bieżącego żądania.
 */

export const cachedAnalysisSchema = z.object({
  ai: aiAnalysisSchema,
  chunks: z.number().int().positive(),
  truncated: z.boolean(),
  model: z.string(),
  provider: z.string(),
  analyzedAt: z.iso.datetime(),
});

export type CachedAnalysis = z.infer<typeof cachedAnalysisSchema>;

export async function cacheKey(text: string): Promise<string> {
  const data = new TextEncoder().encode(`${ANALYSIS_VERSION}\n${text}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `analysis:${ANALYSIS_VERSION}:${hex}`;
}

/** Odczyt z pamięci podręcznej. Uszkodzony lub niezgodny ze schematem wpis = brak wpisu. */
export async function readCache(
  kv: KVNamespace | undefined,
  key: string,
): Promise<CachedAnalysis | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (raw === null) return null;
    const parsed = cachedAnalysisSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Zapis do pamięci podręcznej. Błąd zapisu nie psuje analizy — wynik i tak trafia do klienta. */
export async function writeCache(
  kv: KVNamespace | undefined,
  key: string,
  value: CachedAnalysis,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: LIMITS.cacheTtlSeconds });
  } catch {
    // ignorujemy — pamięć podręczna jest tylko optymalizacją
  }
}
