import { useEffect, useRef } from 'react';

interface ErrorViewProps {
  message: string;
  onRetry?: (() => void) | undefined;
  onReset: () => void;
}

/** Stan błędu z opcją ponowienia (F-06). */
export function ErrorView({ message, onRetry, onReset }: ErrorViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [message]);

  return (
    <section className="panel error" role="alert" aria-labelledby="error-title">
      <div className="error__icon" aria-hidden="true">
        !
      </div>
      <h2 id="error-title" ref={headingRef} tabIndex={-1} className="error__title">
        Nie udało się przeanalizować dokumentu
      </h2>
      <p className="error__message">{message}</p>
      <div className="actions">
        {onRetry && (
          <button type="button" className="button button--primary" onClick={onRetry}>
            Spróbuj ponownie
          </button>
        )}
        <button
          type="button"
          className={`button ${onRetry ? 'button--ghost' : 'button--primary'}`}
          onClick={onReset}
        >
          Wybierz inny plik
        </button>
      </div>
    </section>
  );
}
