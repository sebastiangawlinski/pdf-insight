import { z } from 'zod';

/**
 * Schemat wyniku analizy (sekcja 04 briefu).
 * Ten sam plik importuje frontend (walidacja przed wyświetleniem) i Worker
 * (walidacja odpowiedzi modelu), więc obie strony zawsze mają tę samą definicję.
 */

export const DOCUMENT_TYPES = ['faktura', 'umowa', 'oferta', 'raport', 'inne'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Data w formacie ISO 8601 (RRRR-MM-DD), która faktycznie istnieje w kalendarzu. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data musi mieć format RRRR-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Nieistniejąca data');

/** Kod języka ISO 639-1, np. "pl", "en". */
const languageSchema = z.string().regex(/^[a-z]{2}$/, 'Język musi być kodem ISO 639-1');

/** Kod waluty ISO 4217, np. "PLN", "EUR". */
const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Waluta musi być kodem ISO 4217');

const nonEmptyText = z.string().trim().min(1);

export const amountSchema = z.object({
  value: z.number(), // w Zod 4 liczba zawsze jest skończona (bez Infinity/NaN)
  currency: currencySchema.nullable(),
  context: nonEmptyText,
});

export const dateEntrySchema = z.object({
  date: isoDateSchema,
  context: nonEmptyText,
});

/**
 * Część wyniku, którą generuje model AI.
 * Pola fileName i pages NIE pochodzą od modelu — aplikacja zna je sama
 * (nazwa pliku i liczba stron z pdf.js), więc model nie ma szansy ich zmyślić.
 */
export const aiAnalysisSchema = z.object({
  document: z.object({
    language: languageSchema,
    type: z.enum(DOCUMENT_TYPES),
    title: nonEmptyText.nullable(),
    date: isoDateSchema.nullable(),
  }),
  summary: z.string().trim().min(20, 'Podsumowanie jest za krótkie').max(2000),
  keyPoints: z.array(nonEmptyText).min(1).max(7),
  entities: z.object({
    organizations: z.array(nonEmptyText),
    people: z.array(nonEmptyText),
  }),
  amounts: z.array(amountSchema),
  dates: z.array(dateEntrySchema),
  keywords: z.array(nonEmptyText),
});

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

/** Raport z zabezpieczeń przed prompt injection — co zostało pominięte przed analizą i dlaczego. */
export const securityReportSchema = z.object({
  /** Fragmenty tekstu niewidoczne dla czytelnika (mikroskopijna czcionka, poza stroną). */
  hiddenFragmentsRemoved: z.number().int().nonnegative(),
  /** Fragmenty wyglądające na polecenia dla AI. */
  suspiciousFragmentsRemoved: z.number().int().nonnegative(),
  /** Skróty usuniętych podejrzanych fragmentów — dla przejrzystości. */
  removedExcerpts: z.array(z.string()).max(10),
  /** Komunikaty dla użytkownika (po polsku). */
  notices: z.array(z.string()),
});

export type SecurityReport = z.infer<typeof securityReportSchema>;

/** Dodatkowe informacje techniczne (brief pozwala dodawać pola). */
export const analysisMetaSchema = z.object({
  model: z.string(),
  analyzedAt: z.iso.datetime(),
  chunks: z.number().int().positive(),
  truncated: z.boolean(),
  security: securityReportSchema,
});

/** Pełny wynik zwracany użytkownikowi i eksportowany do pliku .json. */
export const analysisSchema = z.object({
  document: aiAnalysisSchema.shape.document.extend({
    fileName: nonEmptyText,
    pages: z.number().int().positive(),
  }),
  summary: aiAnalysisSchema.shape.summary,
  keyPoints: aiAnalysisSchema.shape.keyPoints,
  entities: aiAnalysisSchema.shape.entities,
  amounts: aiAnalysisSchema.shape.amounts,
  dates: aiAnalysisSchema.shape.dates,
  keywords: aiAnalysisSchema.shape.keywords,
  meta: analysisMetaSchema,
});

export type Analysis = z.infer<typeof analysisSchema>;

/** Kolejność kluczy w eksportowanym JSON — taka jak w briefie. */
export function toOrderedAnalysis(analysis: Analysis): Analysis {
  const { document, summary, keyPoints, entities, amounts, dates, keywords, meta } = analysis;
  return {
    document: {
      fileName: document.fileName,
      pages: document.pages,
      language: document.language,
      type: document.type,
      title: document.title,
      date: document.date,
    },
    summary,
    keyPoints,
    entities,
    amounts,
    dates,
    keywords,
    meta,
  };
}

/** Zamienia błędy Zod na krótki, czytelny opis (do logów i do ponownej próby modelu). */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
