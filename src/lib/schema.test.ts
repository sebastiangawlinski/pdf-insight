import { describe, expect, it } from 'vitest';
import { aiAnalysisSchema, analysisSchema, isoDateSchema, toOrderedAnalysis } from './schema';

/** Przykład z sekcji 04 briefu + pole meta. */
function validAnalysis() {
  return {
    document: {
      fileName: 'umowa.pdf',
      pages: 4,
      language: 'pl',
      type: 'umowa',
      title: 'Umowa serwisowa',
      date: '2026-09-01',
    },
    summary: 'Umowa określa zasady świadczenia usług serwisowych. Obowiązuje przez 12 miesięcy.',
    keyPoints: ['Okres umowy 12 mies.'],
    entities: { organizations: ['Przykład sp. z o.o.'], people: [] },
    amounts: [{ value: 12500.0, currency: 'PLN', context: 'wynagrodzenie' }],
    dates: [{ date: '2026-10-01', context: 'termin płatności' }],
    keywords: ['serwis', 'SLA'],
    meta: {
      model: 'test-model',
      analyzedAt: '2026-11-09T14:00:00.000Z',
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

describe('analysisSchema', () => {
  it('akceptuje przykład z briefu', () => {
    expect(analysisSchema.safeParse(validAnalysis()).success).toBe(true);
  });

  it('akceptuje null i puste listy, gdy brak informacji', () => {
    const data = validAnalysis();
    data.document.title = null as unknown as string;
    data.document.date = null as unknown as string;
    data.amounts = [];
    data.dates = [];
    data.entities = { organizations: [], people: [] };
    data.keywords = [];
    expect(analysisSchema.safeParse(data).success).toBe(true);
  });

  it.each(['document', 'summary', 'keyPoints', 'entities', 'amounts', 'dates', 'keywords'])(
    'odrzuca wynik bez wymaganego pola "%s"',
    (field) => {
      const data = Object.fromEntries(
        Object.entries(validAnalysis()).filter(([key]) => key !== field),
      );
      expect(analysisSchema.safeParse(data).success).toBe(false);
    },
  );

  it('odrzuca typ dokumentu spoza listy', () => {
    const data = validAnalysis();
    data.document.type = 'list';
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('wymaga kodu języka ISO 639-1', () => {
    const data = validAnalysis();
    data.document.language = 'polski';
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('wymaga kodu waluty ISO 4217', () => {
    const data = validAnalysis();
    data.amounts = [{ value: 100, currency: 'zł', context: 'opłata' }];
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('wymaga kwoty jako liczby', () => {
    const data = validAnalysis();
    data.amounts = [{ value: '12 500' as unknown as number, currency: 'PLN', context: 'x' }];
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('odrzuca więcej niż 7 kluczowych punktów', () => {
    const data = validAnalysis();
    data.keyPoints = Array.from({ length: 8 }, (_, i) => `Punkt ${i + 1}`);
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('odrzuca pustą listę kluczowych punktów', () => {
    const data = validAnalysis();
    data.keyPoints = [];
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('odrzuca niepoprawną liczbę stron', () => {
    const data = validAnalysis();
    data.document.pages = 0;
    expect(analysisSchema.safeParse(data).success).toBe(false);
  });

  it('pozwala dodawać pola (brief: „pola można dodawać”), ale je pomija', () => {
    const data = { ...validAnalysis(), extra: 'x' };
    const result = analysisSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('aiAnalysisSchema', () => {
  it('nie wymaga od modelu fileName ani pages', () => {
    const { document, ...rest } = validAnalysis();
    const aiOnly = {
      ...rest,
      document: {
        language: document.language,
        type: document.type,
        title: document.title,
        date: document.date,
      },
    };
    expect(aiAnalysisSchema.safeParse(aiOnly).success).toBe(true);
  });
});

describe('isoDateSchema', () => {
  it.each(['2026-09-01', '2024-02-29'])('akceptuje %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true);
  });

  it.each(['01.09.2026', '2026-9-1', '2026-02-30', '2025-02-29', '2026-13-01', ''])(
    'odrzuca %s',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('toOrderedAnalysis', () => {
  it('zachowuje kolejność kluczy z briefu', () => {
    const parsed = analysisSchema.parse(validAnalysis());
    expect(Object.keys(toOrderedAnalysis(parsed))).toEqual([
      'document',
      'summary',
      'keyPoints',
      'entities',
      'amounts',
      'dates',
      'keywords',
      'meta',
    ]);
    expect(Object.keys(toOrderedAnalysis(parsed).document)).toEqual([
      'fileName',
      'pages',
      'language',
      'type',
      'title',
      'date',
    ]);
  });
});
