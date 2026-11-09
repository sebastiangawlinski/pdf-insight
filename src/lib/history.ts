import { z } from 'zod';
import { analysisSchema, type Analysis } from './schema';

/**
 * Historia analiz w localStorage (F-09).
 * Dane z localStorage traktujemy jak niezaufane: przy odczycie walidujemy je schematem,
 * a błędy (brak miejsca, tryb prywatny, uszkodzone dane) po cichu ignorujemy.
 */

const STORAGE_KEY = 'pdf-insight:history:v1';
export const HISTORY_LIMIT = 5;

const historyEntrySchema = z.object({ id: z.string(), analysis: analysisSchema });
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadHistory(storage: StorageLike | null = getStorage()): HistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => historyEntrySchema.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function addToHistory(
  analysis: Analysis,
  storage: StorageLike | null = getStorage(),
): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${analysis.meta.analyzedAt}-${analysis.document.fileName}`,
    analysis,
  };
  const next = [entry, ...loadHistory(storage).filter((item) => item.id !== entry.id)].slice(
    0,
    HISTORY_LIMIT,
  );
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Brak miejsca lub zablokowany storage — historia jest tylko udogodnieniem.
  }
  return next;
}

export function clearHistory(storage: StorageLike | null = getStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignorujemy
  }
}
