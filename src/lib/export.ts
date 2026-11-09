import { toOrderedAnalysis, type Analysis } from './schema';

export function analysisToJson(analysis: Analysis): string {
  return JSON.stringify(toOrderedAnalysis(analysis), null, 2);
}

/** "Umowa serwisowa.pdf" → "Umowa serwisowa.analysis.json" */
export function jsonFileName(pdfFileName: string): string {
  const base = pdfFileName
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  return `${base || 'dokument'}.analysis.json`;
}

/** Pobranie pliku .json (F-05) — bez serwera, przez Blob i tymczasowy link. */
export function downloadAnalysis(analysis: Analysis): void {
  const blob = new Blob([analysisToJson(analysis)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = jsonFileName(analysis.document.fileName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
