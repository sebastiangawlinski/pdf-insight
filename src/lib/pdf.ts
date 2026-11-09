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
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        pageText += item.str + (item.hasEOL ? '\n' : '');
      }
      pageTexts.push(pageText.replace(/[ \t]+/g, ' ').trim());
      page.cleanup();
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

    return { text, pages: pdf.numPages };
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
