import type { AiAnalysis, DocumentType } from '../../src/lib/schema';
import { cleanStringList } from './normalize';

/** Obcina tekst do limitu, starając się nie przecinać zdania w połowie. */
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const slice = text.slice(0, maxChars);
  const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
  const cut = lastBreak > maxChars * 0.8 ? slice.slice(0, lastBreak + 1) : slice;
  return { text: cut.trimEnd(), truncated: true };
}

/**
 * Dzieli tekst na fragmenty o długości ≤ maxChars (F-08).
 * Najpierw próbuje ciąć na granicach akapitów, potem zdań, a w ostateczności „na sztywno”.
 */
export function splitIntoChunks(text: string, maxChars: number): string[] {
  if (maxChars <= 0) throw new RangeError('maxChars must be positive');
  const chunks: string[] = [];
  let current = '';

  const flush = (): void => {
    if (current.trim() !== '') chunks.push(current.trim());
    current = '';
  };

  const pieces = text.split(/(?<=\n\s*\n)|(?<=[.!?])\s+/);
  for (const piece of pieces) {
    if (piece.length > maxChars) {
      flush();
      for (let i = 0; i < piece.length; i += maxChars) {
        chunks.push(piece.slice(i, i + maxChars).trim());
      }
      continue;
    }
    const separator = current === '' || current.endsWith('\n') ? '' : ' ';
    if (current.length + separator.length + piece.length > maxChars) flush();
    current += (current === '' ? '' : separator) + piece;
  }
  flush();
  return chunks.filter((chunk) => chunk !== '');
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Łączy wyniki cząstkowe w jeden (bez podsumowania — to robi osobne wywołanie modelu).
 * Wszystko tutaj jest deterministyczne: unie list bez duplikatów i głosowanie większościowe.
 */
export function mergePartialResults(
  parts: AiAnalysis[],
): Omit<AiAnalysis, 'summary' | 'keyPoints'> {
  const first = parts[0];
  if (first === undefined) throw new RangeError('No partial results to merge');

  const specificTypes = parts
    .map((part) => part.document.type)
    .filter((type): type is DocumentType => type !== 'inne');

  const amountKeys = new Set<string>();
  const amounts = parts
    .flatMap((part) => part.amounts)
    .filter((amount) => {
      const key = `${amount.value}|${amount.currency ?? ''}|${amount.context.toLowerCase()}`;
      if (amountKeys.has(key)) return false;
      amountKeys.add(key);
      return true;
    });

  const dateKeys = new Set<string>();
  const dates = parts
    .flatMap((part) => part.dates)
    .filter((entry) => {
      const key = `${entry.date}|${entry.context.toLowerCase()}`;
      if (dateKeys.has(key)) return false;
      dateKeys.add(key);
      return true;
    });

  return {
    document: {
      language: mostCommon(parts.map((part) => part.document.language)) ?? first.document.language,
      type: mostCommon(specificTypes) ?? 'inne',
      title: parts.find((part) => part.document.title !== null)?.document.title ?? null,
      date: parts.find((part) => part.document.date !== null)?.document.date ?? null,
    },
    entities: {
      organizations: cleanStringList(parts.flatMap((part) => part.entities.organizations)),
      people: cleanStringList(parts.flatMap((part) => part.entities.people)),
    },
    amounts,
    dates,
    keywords: cleanStringList(
      parts.flatMap((part) => part.keywords),
      15,
    ),
  };
}
