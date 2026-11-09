import { describe, expect, it } from 'vitest';
import { isHiddenTextItem } from './pdf';

// strona A4: 595 × 842 pt; transform = [a, b, c, d, x, y]
const A4 = [595, 842] as const;

describe('isHiddenTextItem', () => {
  it('zwykły tekst 9,5 pt jest widoczny', () => {
    expect(isHiddenTextItem([9.5, 0, 0, 9.5, 56, 400], ...A4)).toBe(false);
  });

  it('przypis 6 pt jest widoczny', () => {
    expect(isHiddenTextItem([6, 0, 0, 6, 56, 400], ...A4)).toBe(false);
  });

  it('mikroskopijny tekst 5 pt jest traktowany jako ukryty', () => {
    expect(isHiddenTextItem([4.99, 0, 0, 4.99, 56, 477], ...A4)).toBe(true);
  });

  it('tekst poza stroną jest traktowany jako ukryty', () => {
    expect(isHiddenTextItem([10, 0, 0, 10, -500, 400], ...A4)).toBe(true);
    expect(isHiddenTextItem([10, 0, 0, 10, 56, 2000], ...A4)).toBe(true);
  });

  it('uwzględnia tekst obrócony (rozmiar liczony z macierzy)', () => {
    expect(isHiddenTextItem([0, 9.5, -9.5, 0, 300, 400], ...A4)).toBe(false);
  });
});
