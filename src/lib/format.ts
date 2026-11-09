import type { DocumentType } from './schema';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  faktura: 'Faktura',
  umowa: 'Umowa',
  oferta: 'Oferta',
  raport: 'Raport',
  inne: 'Inny dokument',
};

export function formatAmount(value: number, currency: string | null): string {
  if (currency === null) {
    return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value);
  }
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value);
  } catch {
    // nieznany kod waluty — pokazujemy liczbę i kod
    return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

/** "2026-09-01" → "1 września 2026" */
export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['pl'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Polska odmiana: 1 strona, 2 strony, 5 stron. */
export function pluralPages(count: number): string {
  if (count === 1) return '1 strona';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} strony`;
  return `${count} stron`;
}
