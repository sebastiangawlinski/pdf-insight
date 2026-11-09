import { useState } from 'react';

interface JsonPreviewProps {
  json: string;
}

/** Podgląd JSON (F-05). Tekst renderuje React (bez dangerouslySetInnerHTML), więc jest bezpieczny. */
export function JsonPreview({ json }: JsonPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      () => {
        setCopied(false);
      },
    );
  };

  return (
    <details className="json-preview">
      <summary className="json-preview__summary">Podgląd JSON</summary>
      <div className="json-preview__body">
        <button type="button" className="button button--small" onClick={handleCopy}>
          {copied ? 'Skopiowano' : 'Kopiuj'}
        </button>
        <span className="visually-hidden" aria-live="polite">
          {copied ? 'Skopiowano JSON do schowka' : ''}
        </span>
        <pre className="json-preview__code" tabIndex={0} aria-label="Wynik w formacie JSON">
          <code>{json}</code>
        </pre>
      </div>
    </details>
  );
}
