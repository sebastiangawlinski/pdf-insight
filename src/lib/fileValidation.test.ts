import { describe, expect, it } from 'vitest';
import { hasPdfSignature, MAX_FILE_SIZE_BYTES, validatePdfFile } from './fileValidation';

describe('validatePdfFile', () => {
  it('akceptuje PDF do 10 MB', () => {
    expect(validatePdfFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' })).toEqual({
      ok: true,
    });
  });

  it('akceptuje PDF rozpoznany tylko po rozszerzeniu', () => {
    expect(validatePdfFile({ name: 'A.PDF', size: 1000, type: '' }).ok).toBe(true);
  });

  it('odrzuca inne typy plików', () => {
    expect(validatePdfFile({ name: 'a.docx', size: 1000, type: 'application/msword' }).ok).toBe(
      false,
    );
  });

  it('odrzuca plik większy niż 10 MB', () => {
    const result = validatePdfFile({
      name: 'a.pdf',
      size: MAX_FILE_SIZE_BYTES + 1,
      type: 'application/pdf',
    });
    expect(result.ok).toBe(false);
  });

  it('odrzuca pusty plik', () => {
    expect(validatePdfFile({ name: 'a.pdf', size: 0, type: 'application/pdf' }).ok).toBe(false);
  });
});

describe('hasPdfSignature', () => {
  it('rozpoznaje nagłówek %PDF-', () => {
    expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7\n...'))).toBe(true);
  });

  it('odrzuca plik bez nagłówka PDF', () => {
    expect(hasPdfSignature(new TextEncoder().encode('<html>'))).toBe(false);
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });
});
