import { describe, expect, it } from 'vitest';
import type { AiAnalysis } from '../../src/lib/schema';
import { mergePartialResults, splitIntoChunks, truncateText } from './chunking';

describe('splitIntoChunks', () => {
  it('nie dzieli krótkiego tekstu', () => {
    expect(splitIntoChunks('Krótki tekst.', 100)).toEqual(['Krótki tekst.']);
  });

  it('żaden fragment nie przekracza limitu i nic nie ginie', () => {
    const text = Array.from(
      { length: 200 },
      (_, i) => `Zdanie numer ${i} zawiera trochę treści.`,
    ).join(' ');
    const chunks = splitIntoChunks(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(500);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text);
  });

  it('tnie na sztywno bardzo długie „zdanie” bez spacji', () => {
    const chunks = splitIntoChunks('x'.repeat(1050), 500);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 50]);
  });
});

describe('truncateText', () => {
  it('nie zmienia tekstu w limicie', () => {
    expect(truncateText('abc', 10)).toEqual({ text: 'abc', truncated: false });
  });

  it('obcina i oznacza obcięcie', () => {
    const result = truncateText('a'.repeat(100), 50);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(50);
  });
});

function part(overrides: Partial<AiAnalysis>): AiAnalysis {
  return {
    document: { language: 'pl', type: 'inne', title: null, date: null },
    summary: 'Fragment dokumentu testowego.',
    keyPoints: ['Punkt'],
    entities: { organizations: [], people: [] },
    amounts: [],
    dates: [],
    keywords: [],
    ...overrides,
  };
}

describe('mergePartialResults', () => {
  it('łączy listy bez duplikatów i wybiera konkretny typ dokumentu', () => {
    const merged = mergePartialResults([
      part({
        document: { language: 'pl', type: 'umowa', title: 'Umowa', date: '2026-01-01' },
        entities: { organizations: ['ACME'], people: ['Jan Kowalski'] },
        amounts: [{ value: 100, currency: 'PLN', context: 'opłata' }],
        keywords: ['serwis'],
      }),
      part({
        entities: { organizations: ['acme', 'Beta'], people: [] },
        amounts: [
          { value: 100, currency: 'PLN', context: 'Opłata' },
          { value: 50, currency: 'PLN', context: 'kara' },
        ],
        dates: [{ date: '2026-02-01', context: 'termin' }],
        keywords: ['Serwis', 'SLA'],
      }),
    ]);

    expect(merged.document).toEqual({
      language: 'pl',
      type: 'umowa',
      title: 'Umowa',
      date: '2026-01-01',
    });
    expect(merged.entities.organizations).toEqual(['ACME', 'Beta']);
    expect(merged.amounts).toHaveLength(2);
    expect(merged.dates).toHaveLength(1);
    expect(merged.keywords).toEqual(['serwis', 'SLA']);
  });

  it('rzuca błąd dla pustej listy', () => {
    expect(() => mergePartialResults([])).toThrow();
  });
});
