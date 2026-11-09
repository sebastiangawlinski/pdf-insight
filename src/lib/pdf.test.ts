import { describe, expect, it } from 'vitest';
import { dominantFontSize, isHiddenTextItem } from './pdf';

// strona A4: 595 × 842 pt; transform = [a, b, c, d, x, y]
const A4 = [595, 842] as const;
const at = (size: number, x = 56, y = 400) => [size, 0, 0, size, x, y];

describe('dominantFontSize', () => {
  it('wybiera rozmiar, którym zapisano najwięcej znaków', () => {
    expect(
      dominantFontSize([
        { size: 9.5, chars: 12000 },
        { size: 18, chars: 60 },
        { size: 5, chars: 185 },
      ]),
    ).toBe(9.5);
  });

  it('zwraca 0 dla pustego dokumentu', () => {
    expect(dominantFontSize([])).toBe(0);
  });
});

describe('isHiddenTextItem — dokument z tekstem 9,5 pt (jak testowa umowa)', () => {
  const doc = 9.5;

  it('zwykły tekst i przypis 6 pt są widoczne', () => {
    expect(isHiddenTextItem(at(9.5), ...A4, doc)).toBe(false);
    expect(isHiddenTextItem(at(6), ...A4, doc)).toBe(false);
  });

  it('wstawka 5 pt (ukryte polecenie) jest traktowana jako ukryta', () => {
    expect(isHiddenTextItem(at(4.99), ...A4, doc)).toBe(true);
  });

  it('tekst poza stroną jest traktowany jako ukryty', () => {
    expect(isHiddenTextItem(at(10, -500), ...A4, doc)).toBe(true);
    expect(isHiddenTextItem(at(10, 56, 2000), ...A4, doc)).toBe(true);
  });

  it('uwzględnia tekst obrócony (rozmiar liczony z macierzy)', () => {
    expect(isHiddenTextItem([0, 9.5, -9.5, 0, 300, 400], ...A4, doc)).toBe(false);
  });
});

describe('isHiddenTextItem — dokument w całości drobnym drukiem', () => {
  it('arkusz 4,5 pt („dopasuj do strony”) NIE jest odrzucany', () => {
    expect(isHiddenTextItem(at(4.5), ...A4, 4.5)).toBe(false);
  });

  it('ale tekst poniżej 1,5 pt jest ukryty zawsze', () => {
    expect(isHiddenTextItem(at(1), ...A4, 1)).toBe(true);
  });
});
