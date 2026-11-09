import { describe, expect, it } from 'vitest';
import type { AiAnalysis } from '../../src/lib/schema';
import { findDatesInText, findNumbersInText, groundInSource } from './grounding';

describe('findDatesInText', () => {
  it('rozpoznaje popularne zapisy dat (PL i EN)', () => {
    const text =
      'zawarta w dniu 12.03.2026 r., obowiązuje od 1 kwietnia 2026 r. do 2028-03-31; ' +
      'signed on March 5, 2026 and 7 May 2026.';
    expect([...findDatesInText(text)].sort()).toEqual([
      '2026-03-05',
      '2026-03-12',
      '2026-04-01',
      '2026-05-07',
      '2028-03-31',
    ]);
  });

  it('pomija nieistniejące daty', () => {
    expect(findDatesInText('31.02.2026').size).toBe(0);
  });
});

describe('findNumbersInText', () => {
  it('rozpoznaje kwoty z separatorami i mnożnikami', () => {
    const numbers = findNumbersInText(
      'kwota 184 500,00 zł, abonament 12 300,00 PLN, 2 150 EUR, wzrost o 4,2 mln zł',
    );
    expect(numbers.has(184500)).toBe(true);
    expect(numbers.has(12300)).toBe(true);
    expect(numbers.has(2150)).toBe(true);
    expect(numbers.has(4200000)).toBe(true);
  });
});

describe('groundInSource', () => {
  const base: AiAnalysis = {
    document: { language: 'pl', type: 'umowa', title: 'Umowa', date: '2026-03-12' },
    summary: 'Umowa wdrożeniowa. Zawiera harmonogram i wynagrodzenie.',
    keyPoints: ['Wynagrodzenie 184 500 zł'],
    entities: { organizations: [], people: [] },
    amounts: [
      { value: 184500, currency: 'PLN', context: 'wynagrodzenie' },
      { value: 999999, currency: 'PLN', context: 'zmyślona kwota' },
    ],
    dates: [
      { date: '2026-04-01', context: 'początek' },
      { date: '2030-01-01', context: 'zmyślona data' },
    ],
    keywords: [],
  };

  it('usuwa kwoty i daty, których nie ma w dokumencie', () => {
    const source = 'Umowa z dnia 12.03.2026. Od 1 kwietnia 2026 r. Wynagrodzenie 184 500,00 zł.';
    const grounded = groundInSource(base, source);
    expect(grounded.amounts.map((a) => a.value)).toEqual([184500]);
    expect(grounded.dates.map((d) => d.date)).toEqual(['2026-04-01']);
    expect(grounded.document.date).toBe('2026-03-12');
  });

  it('zeruje datę dokumentu, jeśli nie występuje w tekście', () => {
    expect(groundInSource(base, 'brak dat').document.date).toBeNull();
  });
});
