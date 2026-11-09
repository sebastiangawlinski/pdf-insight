export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (F-01)

export type FileValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Walidacja pliku przed odczytem (F-01): tylko PDF, maks. 10 MB.
 * Typ sprawdzamy po rozszerzeniu/MIME, a dodatkowo po sygnaturze „%PDF-” (patrz hasPdfSignature),
 * bo przeglądarka ustala MIME tylko na podstawie rozszerzenia.
 */
export function validatePdfFile(file: Pick<File, 'name' | 'size' | 'type'>): FileValidationResult {
  const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) {
    return { ok: false, message: 'Obsługiwane są tylko pliki PDF.' };
  }
  if (file.size === 0) {
    return { ok: false, message: 'Plik jest pusty.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `Plik jest za duży (${formatFileSize(file.size)}). Maksymalny rozmiar to 10 MB.`,
    };
  }
  return { ok: true };
}

/** Każdy poprawny PDF zaczyna się od bajtów "%PDF-". */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return signature.every((byte, i) => bytes[i] === byte);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
