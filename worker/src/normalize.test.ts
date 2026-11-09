import { describe, expect, it } from 'vitest';
import { aiAnalysisSchema } from '../../src/lib/schema';
import { normalizeAiResult, normalizeCurrency, normalizeDate, parseAmount } from './normalize';

describe('parseAmount', () => {
  it.each([
    [12500, 12500],
    ['12 500,50', 12500.5],
    ['12.500,50 zł', 12500.5],
    ['12,500.50', 12500.5],
    ['1500', 1500],
  ])('%s → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('zwraca null dla wartości nieliczbowych', () => {
    expect(parseAmount('brak')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('normalizeCurrency', () => {
  it.each([
    ['zł', 'PLN'],
    ['pln', 'PLN'],
    ['€', 'EUR'],
    ['USD', 'USD'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeCurrency(input)).toBe(expected);
  });

  it('zwraca null dla nieznanych lub pustych wartości', () => {
    expect(normalizeCurrency('złotych polskich')).toBeNull();
    expect(normalizeCurrency('')).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
  });
});

describe('normalizeDate', () => {
  it('akceptuje ISO i obcina część czasu', () => {
    expect(normalizeDate('2026-09-01')).toBe('2026-09-01');
    expect(normalizeDate('2026-09-01T10:00:00Z')).toBe('2026-09-01');
  });

  it('zamienia niepoprawne daty na null (model nie zgaduje)', () => {
    expect(normalizeDate('01.09.2026')).toBeNull();
    expect(normalizeDate('2026-02-30')).toBeNull();
    expect(normalizeDate('null')).toBeNull();
  });
});

describe('normalizeAiResult', () => {
  it('naprawia drobne usterki formatu i wynik przechodzi walidację', () => {
    const raw = {
      document: { language: 'PL', type: 'Umowa', title: '  Umowa  serwisowa ', date: '' },
      summary: ' Umowa określa zasady serwisu. Obowiązuje rok. ',
      keyPoints: ['A', 'a', '', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      entities: { organizations: ['Firma', 'Firma'], people: 'Jan' },
      amounts: [
        { value: '12 500,00', currency: 'zł', context: 'wynagrodzenie' },
        { value: 'brak', currency: 'PLN', context: 'pominięta' },
      ],
      dates: [
        { date: '2026-10-01', context: 'termin' },
        { date: '1 października', context: 'pominięta' },
      ],
      keywords: ['serwis'],
    };

    const normalized = normalizeAiResult(raw);
    const result = aiAnalysisSchema.safeParse(normalized);

    expect(result.success).toBe(true);
    expect(normalized).toMatchObject({
      document: { language: 'pl', type: 'umowa', title: 'Umowa serwisowa', date: null },
      keyPoints: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      entities: { organizations: ['Firma'], people: [] },
      amounts: [{ value: 12500, currency: 'PLN', context: 'wynagrodzenie' }],
      dates: [{ date: '2026-10-01', context: 'termin' }],
    });
  });

  it('nieznany typ dokumentu → "inne"', () => {
    expect(normalizeAiResult({ document: { type: 'list motywacyjny' } })).toMatchObject({
      document: { type: 'inne' },
    });
  });

  it('nie zamienia śmieci w poprawny wynik (brak podsumowania → błąd walidacji)', () => {
    expect(aiAnalysisSchema.safeParse(normalizeAiResult('nie json')).success).toBe(false);
  });
});
