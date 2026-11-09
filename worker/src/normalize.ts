import {
  DOCUMENT_TYPES,
  isIsoCurrency,
  isoDateSchema,
  type DocumentType,
} from '../../src/lib/schema';

/**
 * Normalizacja surowej odpowiedzi modelu PRZED walidacją Zod.
 * Poprawiamy tylko drobne, jednoznaczne usterki formatu (spacje, wielkość liter, "zł" zamiast "PLN",
 * liczba jako tekst). Niczego nie dopisujemy — jeśli wartość jest niepoprawna, usuwamy ją
 * (null / pominięcie), zgodnie z zasadą „model nie zgaduje”.
 * Wszystko, co dalej nie spełnia schematu, odrzuci Zod i nastąpi ponowna próba.
 */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed === '' || /^(null|n\/a|brak|none|unknown)$/i.test(trimmed)) return null;
  return trimmed;
}

/** Lista unikalnych (bez względu na wielkość liter) niepustych tekstów. */
export function cleanStringList(value: unknown, max = 50): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanString(item);
    if (text === null) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result.slice(0, max);
}

const CURRENCY_ALIASES: Record<string, string> = {
  ZŁ: 'PLN',
  ZL: 'PLN',
  PLZ: 'PLN',
  '€': 'EUR',
  EURO: 'EUR',
  $: 'USD',
  US$: 'USD',
  '£': 'GBP',
};

export function normalizeCurrency(value: unknown): string | null {
  const text = cleanString(value);
  if (text === null) return null;
  const upper = text.toUpperCase().replace(/\.$/, '');
  const mapped = CURRENCY_ALIASES[upper] ?? upper;
  // nieznany lub wymyślony kod waluty → null (model nie zgaduje)
  return isIsoCurrency(mapped) ? mapped : null;
}

/** Zamienia "12 500,50" / "12,500.50" / "12500.5 zł" na liczbę. */
export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.replace(/[^\d,.-]/g, '');
  if (text === '') return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) {
    // przecinek jako separator dziesiętny (zapis polski)
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(/,/g, '');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDate(value: unknown): string | null {
  const text = cleanString(value);
  if (text === null) return null;
  const candidate = text.slice(0, 10);
  return isoDateSchema.safeParse(candidate).success ? candidate : null;
}

function normalizeType(value: unknown): DocumentType {
  const text = cleanString(value)?.toLowerCase();
  return DOCUMENT_TYPES.find((type) => type === text) ?? 'inne';
}

function normalizeLanguage(value: unknown): string | null {
  const text = cleanString(value)?.toLowerCase();
  if (text === undefined) return null;
  const code = text.slice(0, 2);
  return /^[a-z]{2}$/.test(code) ? code : null;
}

function normalizeAmounts(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const amount = parseAmount(record.value);
    const context = cleanString(record.context);
    if (amount === null || context === null) return [];
    return [{ value: amount, currency: normalizeCurrency(record.currency), context }];
  });
}

function normalizeDates(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const record = asRecord(item);
    const date = normalizeDate(record.date);
    const context = cleanString(record.context);
    if (date === null || context === null) return [];
    const key = `${date}|${context.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ date, context }];
  });
}

/** Normalizacja odpowiedzi etapu łączenia (tylko summary + keyPoints). */
export function normalizeMergedSummary(raw: unknown): unknown {
  const root = asRecord(raw);
  return { summary: cleanString(root.summary), keyPoints: cleanStringList(root.keyPoints, 7) };
}

export function normalizeAiResult(raw: unknown): unknown {
  const root = asRecord(raw);
  const document = asRecord(root.document);
  const entities = asRecord(root.entities);
  const summary = cleanString(root.summary);

  return {
    document: {
      language: normalizeLanguage(document.language),
      type: normalizeType(document.type),
      title: cleanString(document.title),
      date: normalizeDate(document.date),
    },
    summary,
    keyPoints: cleanStringList(root.keyPoints, 7),
    entities: {
      organizations: cleanStringList(entities.organizations),
      people: cleanStringList(entities.people),
    },
    amounts: normalizeAmounts(root.amounts),
    dates: normalizeDates(root.dates),
    keywords: cleanStringList(root.keywords, 15),
  };
}
