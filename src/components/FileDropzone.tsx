import { useId, useState, type ChangeEvent, type DragEvent } from 'react';

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
}

/**
 * Wgrywanie PDF (F-01): przeciągnij i upuść albo wybór z dysku.
 * Prawdziwy <input type="file"> jest ukryty wizualnie, ale dostępny z klawiatury
 * (Tab + Enter/Spacja) i dla czytników ekranu.
 */
export function FileDropzone({ onFileSelected }: FileDropzoneProps) {
  const inputId = useId();
  const hintId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // reset, aby ponowny wybór tego samego pliku też wywołał zdarzenie
    event.target.value = '';
    if (file) onFileSelected(file);
  };

  return (
    <label
      htmlFor={inputId}
      className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-describedby={hintId}
        onChange={handleChange}
      />
      <svg className="dropzone__icon" viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M14 4h14l10 10v28a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M28 4v10h10" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M25 36V22m0 0-5.5 5.5M25 22l5.5 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="dropzone__title">
        {isDragging ? 'Upuść plik tutaj' : 'Przeciągnij plik PDF tutaj'}
      </span>
      <span className="dropzone__or">lub</span>
      <span className="button button--primary dropzone__button" aria-hidden="true">
        Wybierz plik z dysku
      </span>
      <span id={hintId} className="dropzone__hint">
        Tylko PDF z warstwą tekstową, maks. 10 MB
      </span>
    </label>
  );
}
