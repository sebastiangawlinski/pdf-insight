import { describe, expect, it } from 'vitest';
import type { AiAnalysis } from '../../src/lib/schema';
import { ANY_CURRENCY, findDatesInText, findMoneyInText, groundInSource } from './grounding';

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

describe('findMoneyInText', () => {
  it('rozpoznaje kwoty z walutą, separatorami i mnożnikami', () => {
    const money = findMoneyInText(
      'kwota 184 500,00 zł, abonament 12\u00a0300,00 PLN, 2 150 EUR rocznie, hosting 890 USD, ' +
        'wzrost o 4,2 mln zł, rekompensata € 40, kwota (295\n200,00 zł)',
    );
    expect(money.get(184500)).toEqual(new Set(['PLN']));
    expect(money.get(12300)).toEqual(new Set(['PLN']));
    expect(money.get(2150)).toEqual(new Set(['EUR']));
    expect(money.get(890)).toEqual(new Set(['USD']));
    expect(money.get(4200000)).toEqual(new Set(['PLN']));
    expect(money.get(40)).toEqual(new Set(['EUR']));
    expect(money.get(295200)).toEqual(new Set(['PLN']));
  });

  it('traktuje format z groszami jako kwotę nawet bez waluty (tabele)', () => {
    expect(findMoneyInText('E1 Analiza 27 675,00').get(27675)).toEqual(new Set([ANY_CURRENCY]));
  });

  it('NIE traktuje zwykłych liczb jako kwot', () => {
    const money = findMoneyInText('Strona 1 z 12. § 1 ust. 3. Rok 2026. 120 użytkowników.');
    expect(money.size).toBe(0);
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

  it('odrzuca kwotę, która występuje w tekście tylko jako zwykła liczba (np. numer strony)', () => {
    const withOne: AiAnalysis = {
      ...base,
      amounts: [{ value: 1, currency: 'PLN', context: 'wartość umowy' }],
    };
    const grounded = groundInSource(withOne, 'Strona 1 z 12. § 1. Wynagrodzenie 184 500,00 zł.');
    expect(grounded.amounts).toEqual([]);
  });

  it('odrzuca kwotę z niezgodną walutą', () => {
    const wrong: AiAnalysis = {
      ...base,
      amounts: [{ value: 184500, currency: 'EUR', context: 'wynagrodzenie' }],
    };
    expect(groundInSource(wrong, 'Wynagrodzenie 184 500,00 zł.').amounts).toEqual([]);
  });

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
