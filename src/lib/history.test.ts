import { describe, expect, it } from 'vitest';
import { addToHistory, clearHistory, HISTORY_LIMIT, loadHistory } from './history';
import type { Analysis } from './schema';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function analysis(fileName: string, analyzedAt: string): Analysis {
  return {
    document: { fileName, pages: 1, language: 'pl', type: 'inne', title: null, date: null },
    summary: 'Krótki dokument testowy. Zawiera dwa zdania.',
    keyPoints: ['Punkt 1', 'Punkt 2', 'Punkt 3'],
    entities: { organizations: [], people: [] },
    amounts: [],
    dates: [],
    keywords: [],
    meta: {
      model: 'm',
      provider: 'p',
      analyzedAt,
      cached: false,
      chunks: 1,
      truncated: false,
      security: {
        hiddenFragmentsRemoved: 0,
        suspiciousFragmentsRemoved: 0,
        removedExcerpts: [],
        notices: [],
      },
    },
  };
}

describe('history', () => {
  it('zapisuje i odczytuje analizy (najnowsza pierwsza)', () => {
    const storage = memoryStorage();
    addToHistory(analysis('a.pdf', '2026-11-09T10:00:00.000Z'), storage);
    addToHistory(analysis('b.pdf', '2026-11-09T11:00:00.000Z'), storage);
    expect(loadHistory(storage).map((e) => e.analysis.document.fileName)).toEqual([
      'b.pdf',
      'a.pdf',
    ]);
  });

  it(`przechowuje maksymalnie ${HISTORY_LIMIT} wpisów`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
      addToHistory(analysis(`${i}.pdf`, `2026-11-09T10:0${i}:00.000Z`), storage);
    }
    expect(loadHistory(storage)).toHaveLength(HISTORY_LIMIT);
  });

  it('ignoruje uszkodzone dane w localStorage', () => {
    const storage = memoryStorage();
    storage.setItem('pdf-insight:history:v1', '{nie-json');
    expect(loadHistory(storage)).toEqual([]);
    storage.setItem('pdf-insight:history:v1', JSON.stringify([{ id: 'x', analysis: {} }]));
    expect(loadHistory(storage)).toEqual([]);
  });

  it('czyści historię', () => {
    const storage = memoryStorage();
    addToHistory(analysis('a.pdf', '2026-11-09T10:00:00.000Z'), storage);
    clearHistory(storage);
    expect(loadHistory(storage)).toEqual([]);
  });

  it('działa bez dostępu do storage', () => {
    expect(loadHistory(null)).toEqual([]);
    expect(addToHistory(analysis('a.pdf', '2026-11-09T10:00:00.000Z'), null)).toHaveLength(1);
  });
});
