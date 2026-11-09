import { describe, expect, it } from 'vitest';
import { jsonFileName } from './export';
import { formatDate, pluralPages } from './format';

describe('pluralPages', () => {
  it.each([
    [1, '1 strona'],
    [2, '2 strony'],
    [4, '4 strony'],
    [5, '5 stron'],
    [12, '12 stron'],
    [22, '22 strony'],
    [25, '25 stron'],
  ])('%i → %s', (count, expected) => {
    expect(pluralPages(count)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('formatuje datę po polsku', () => {
    expect(formatDate('2026-09-01')).toBe('1 września 2026');
  });
});

describe('jsonFileName', () => {
  it('zamienia rozszerzenie i usuwa niedozwolone znaki', () => {
    expect(jsonFileName('Umowa serwisowa.PDF')).toBe('Umowa serwisowa.analysis.json');
    expect(jsonFileName('a:b?.pdf')).toBe('a_b_.analysis.json');
    expect(jsonFileName('.pdf')).toBe('dokument.analysis.json');
  });
});
