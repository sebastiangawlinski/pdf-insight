import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { hasPdfSignature } from './fileValidation';

/**
 * Ekstrakcja tekstu z PDF w przeglądarce (F-02).
 * Plik nie opuszcza komputera użytkownika — do backendu trafia tylko wyciągnięty tekst.
 *
 * Worker pdf.js importujemy z sufiksem `?url`: Vite kopiuje go do dist/ i zwraca ścieżkę
 * uwzględniającą `base` (/pdf-insight/), więc działa również na GitHub Pages.
 */

export type PdfErrorCode = 'not_pdf' | 'password' | 'corrupted' | 'no_text';

export class PdfReadError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = 'PdfReadError';
    this.code = code;
  }
}

export interface ExtractedPdf {
  text: string;
  pages: number;
  /** Ile fragmentów niewidocznego tekstu pominięto (ochrona przed ukrytymi poleceniami dla AI). */
  hiddenFragments: number;
}

/**
 * Wykrywanie tekstu ukrytego przed czytelnikiem (np. polecenie dla AI zapisane białą czcionką 5 pt).
 *
 * Próg jest WZGLĘDNY: tekst uznajemy za ukryty, gdy jest wyraźnie mniejszy niż dominująca czcionka
 * dokumentu i jednocześnie mały w liczbach bezwzględnych. Dzięki temu dokument w całości pisany
 * drobnym drukiem (np. arkusz Excela wydrukowany z „dopasuj do strony”, 4–5 pt) jest analizowany
 * normalnie, a mikroskopijna wstawka w tekście 9–12 pt — pomijana.
 */
export const HIDDEN_TEXT_RULES = {
  /** Tekst musi być mniejszy niż ten ułamek dominującego rozmiaru... */
  relativeFactor: 0.6,
  /** ...i jednocześnie mniejszy niż tyle punktów (przypisy 6–8 pt zostają). */
  absoluteMaxPt: 6,
  /** Tekst poniżej tego rozmiaru jest nieczytelny zawsze, niezależnie od reszty dokumentu. */
  alwaysHiddenBelowPt: 1.5,
} as const;

export function fontSizeOf(transform: readonly number[]): number {
  const [, , c = 0, d = 0] = transform;
  return Math.hypot(c, d);
}

/**
 * Dominujący rozmiar czcionki dokumentu — rozmiar, którym zapisano najwięcej znaków
 * (rozmiary zaokrąglone do 0,5 pt). Zwraca 0 dla pustej listy.
 */
export function dominantFontSize(samples: readonly { size: number; chars: number }[]): number {
  const weights = new Map<number, number>();
  for (const { size, chars } of samples) {
    if (chars <= 0 || !Number.isFinite(size)) continue;
    const bucket = Math.round(size * 2) / 2;
    weights.set(bucket, (weights.get(bucket) ?? 0) + chars);
  }
  let best = 0;
  let bestWeight = 0;
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Czy fragment tekstu jest niewidoczny dla czytelnika: mikroskopijny względem reszty dokumentu
 * albo położony poza stroną. `transform` to macierz [a, b, c, d, x, y] z pdf.js
 * (współrzędne strony, 1 pt = 1 jednostka).
 */
export function isHiddenTextItem(
  transform: readonly number[],
  pageWidth: number,
  pageHeight: number,
  documentFontSize: number,
): boolean {
  const [, , , , x = 0, y = 0] = transform;
  const fontSize = fontSizeOf(transform);
  if (fontSize < HIDDEN_TEXT_RULES.alwaysHiddenBelowPt) return true;
  const tinyRelative =
    fontSize < HIDDEN_TEXT_RULES.absoluteMaxPt &&
    fontSize < documentFontSize * HIDDEN_TEXT_RULES.relativeFactor;
  if (tinyRelative) return true;
  return x < -fontSize || y < -fontSize || x > pageWidth || y > pageHeight + fontSize;
}

/** Poniżej tej liczby znaków uznajemy, że PDF nie ma warstwy tekstowej (np. skan). */
const MIN_TEXT_LENGTH = 30;

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfSignature(data)) {
    throw new PdfReadError('not_pdf', 'Ten plik nie jest poprawnym dokumentem PDF.');
  }

  // pdf.js ładujemy dopiero przy pierwszym użyciu, żeby nie spowalniać startu strony.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data });
  try {
    const pdf = await loadingTask.promise;

    // Przebieg 1: odczyt wszystkich stron (potrzebujemy dominującego rozmiaru czcionki całości).
    const pages: { width: number; height: number; items: TextItem[] }[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is TextItem => 'str' in item);
      pages.push({ width, height, items });
      page.cleanup();
    }

    const documentFontSize = dominantFontSize(
      pages.flatMap((page) =>
        page.items.map((item) => ({
          size: fontSizeOf(item.transform),
          chars: item.str.trim().length,
        })),
      ),
    );

    // Przebieg 2: składanie tekstu z pominięciem fragmentów niewidocznych dla czytelnika.
    const pageTexts: string[] = [];
    let hiddenFragments = 0;
    for (const { width, height, items } of pages) {
      let pageText = '';
      let inHiddenRun = false;
      for (const item of items) {
        if (
          item.str.trim() !== '' &&
          isHiddenTextItem(item.transform, width, height, documentFontSize)
        ) {
          // ciąg sąsiednich ukrytych elementów liczymy jako jeden fragment
          if (!inHiddenRun) hiddenFragments++;
          inHiddenRun = true;
          continue;
        }
        if (item.str.trim() !== '') inHiddenRun = false;
        pageText += item.str + (item.hasEOL ? '\n' : '');
      }
      pageTexts.push(pageText.replace(/[ \t]+/g, ' ').trim());
    }

    const text = pageTexts
      .filter((pageText) => pageText !== '')
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n');

    if (text.replace(/\s/g, '').length < MIN_TEXT_LENGTH) {
      throw new PdfReadError(
        'no_text',
        'Ten PDF nie zawiera warstwy tekstowej (prawdopodobnie to skan). Analiza skanów (OCR) nie jest obsługiwana.',
      );
    }

    return { text, pages: pdf.numPages, hiddenFragments };
  } catch (error) {
    if (error instanceof PdfReadError) throw error;
    if (error instanceof pdfjs.PasswordException) {
      throw new PdfReadError(
        'password',
        'Ten PDF jest zabezpieczony hasłem — nie można go odczytać.',
      );
    }
    throw new PdfReadError(
      'corrupted',
      'Nie udało się odczytać pliku PDF. Plik może być uszkodzony.',
    );
  } finally {
    void loadingTask.destroy();
  }
}
