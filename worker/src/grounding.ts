import type { AiAnalysis } from '../../src/lib/schema';
import { parseAmount } from './normalize';

/**
 * „Uziemienie” wyniku w tekście źródłowym — zabezpieczenie przed zmyśleniami i prompt injection.
 * Model może się pomylić albo dać się zmanipulować treścią dokumentu, dlatego kwoty i daty,
 * których NIE DA SIĘ znaleźć w tekście PDF, są usuwane z wyniku.
 * To deterministyczny kod, więc nie da się go „przekonać” treścią dokumentu.
 */

const MONTHS: Record<string, number> = {
  // polski (dopełniacz i mianownik)
  stycznia: 1, styczeń: 1, styczen: 1,
  lutego: 2, luty: 2,
  marca: 3, marzec: 3,
  kwietnia: 4, kwiecień: 4, kwiecien: 4,
  maja: 5, maj: 5,
  czerwca: 6, czerwiec: 6,
  lipca: 7, lipiec: 7,
  sierpnia: 8, sierpień: 8, sierpien: 8,
  września: 9, wrzesień: 9, wrzesnia: 9, wrzesien: 9,
  października: 10, październik: 10, pazdziernika: 10, pazdziernik: 10,
  listopada: 11, listopad: 11,
  grudnia: 12, grudzień: 12, grudzien: 12,
  // angielski
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
}; // prettier-ignore

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/** Wszystkie pełne daty (dzień, miesiąc, rok) zapisane w tekście, w formacie ISO. */
export function findDatesInText(text: string): Set<string> {
  const found = new Set<string>();
  const add = (value: string | null) => {
    if (value !== null) found.add(value);
  };

  // 2026-03-12
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    add(iso(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  // 12.03.2026, 12/03/2026, 12-03-2026
  for (const m of text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) {
    add(iso(Number(m[3]), Number(m[2]), Number(m[1])));
  }
  // 12 marca 2026, 1 kwietnia 2026 r., 12 March 2026
  for (const m of text.matchAll(/\b(\d{1,2})\.?\s+([\p{L}]{3,12})\.?,?\s+(\d{4})\b/gu)) {
    const month = MONTHS[(m[2] ?? '').toLowerCase()];
    if (month !== undefined) add(iso(Number(m[3]), month, Number(m[1])));
  }
  // March 12, 2026
  for (const m of text.matchAll(/\b([\p{L}]{3,12})\.?\s+(\d{1,2}),?\s+(\d{4})\b/gu)) {
    const month = MONTHS[(m[1] ?? '').toLowerCase()];
    if (month !== undefined) add(iso(Number(m[3]), month, Number(m[2])));
  }
  return found;
}

/** Waluta (kod ISO 4217) dla symboli i skrótów spotykanych w dokumentach. */
const CURRENCY_TOKENS: [RegExp, string][] = [
  [/^(zł|zl|pln|złotych|złote|złoty)$/i, 'PLN'],
  [/^(eur|euro|€)$/i, 'EUR'],
  [/^(usd|\$|us\$)$/i, 'USD'],
  [/^(gbp|£)$/i, 'GBP'],
  [/^chf$/i, 'CHF'],
];

function currencyOf(token: string | undefined): string | null {
  if (token === undefined) return null;
  for (const [pattern, code] of CURRENCY_TOKENS) if (pattern.test(token)) return code;
  return /^[A-Z]{3}$/.test(token) ? token : null;
}

/** Specjalna wartość: kwota w formacie pieniężnym (z groszami), ale bez waluty obok — np. w tabeli. */
export const ANY_CURRENCY = '*';

/**
 * Kwoty pieniężne zapisane w tekście: wartość (zaokrąglona do groszy) → zbiór walut.
 * Liczba jest kwotą, jeśli stoi obok waluty („184 500,00 zł”, „€ 40”, „4,2 mln zł”)
 * albo ma format pieniężny z dwoma miejscami po przecinku („27 675,00” w tabeli).
 * Same liczby („Strona 1 z 12”, „§ 1”, „2026”) NIE są kwotami — dzięki temu model nie może
 * „uziemić” zmyślonej kwoty w przypadkowej liczbie z dokumentu.
 */
export function findMoneyInText(text: string): Map<number, Set<string>> {
  const found = new Map<number, Set<string>>();
  const add = (value: number, currency: string) => {
    const key = round(value);
    const set = found.get(key) ?? new Set<string>();
    set.add(currency);
    found.set(key, set);
  };

  // liczba z ewentualnymi separatorami tysięcy (spacja, twarda spacja, złamanie wiersza, kropka,
  // przecinek) — \s obejmuje też twardą spację U+00A0
  const pattern = /\d{1,3}(?:[\s.,]\d{3}(?!\d))+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
  for (const m of text.matchAll(pattern)) {
    const base = parseAmount(m[0]);
    if (base === null) continue;
    const end = m.index + m[0].length;
    const after =
      /^\s{0,2}(mln|mld|tys\.?|million|billion|thousand|k)?\s{0,2}([\p{L}$€£]{1,8})/iu.exec(
        text.slice(end, end + 24),
      );
    const before = /([A-Z]{3}|[$€£])\s{0,2}$/u.exec(text.slice(Math.max(0, m.index - 6), m.index));

    let value = base;
    const multiplier = after?.[1]?.toLowerCase();
    if (multiplier === 'mln' || multiplier === 'million') value = base * 1_000_000;
    if (multiplier === 'mld' || multiplier === 'billion') value = base * 1_000_000_000;
    if (multiplier?.startsWith('tys') === true || multiplier === 'thousand' || multiplier === 'k') {
      value = base * 1_000;
    }

    const currency = currencyOf(after?.[2]) ?? currencyOf(before?.[1]);
    if (currency !== null) {
      add(value, currency);
    } else if (/[.,]\d{2}$/.test(m[0])) {
      add(base, ANY_CURRENCY);
    }
  }
  return found;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isGroundedAmount(
  money: Map<number, Set<string>>,
  value: number,
  currency: string | null,
): boolean {
  const currencies = money.get(round(value));
  if (currencies === undefined) return false;
  if (currency === null || currencies.has(ANY_CURRENCY)) return true;
  return currencies.has(currency);
}

export function groundInSource(result: AiAnalysis, sourceText: string): AiAnalysis {
  const money = findMoneyInText(sourceText);
  const dates = findDatesInText(sourceText);
  const documentDate = result.document.date;

  return {
    ...result,
    document: {
      ...result.document,
      date: documentDate !== null && dates.has(documentDate) ? documentDate : null,
    },
    amounts: result.amounts.filter((amount) =>
      isGroundedAmount(money, amount.value, amount.currency),
    ),
    dates: result.dates.filter((entry) => dates.has(entry.date)),
  };
}
