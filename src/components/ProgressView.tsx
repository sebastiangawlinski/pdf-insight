import { useEffect, useState } from 'react';

export type ProgressStep = 'reading' | 'analyzing';

interface ProgressViewProps {
  fileName: string;
  step: ProgressStep;
}

const STEPS: { id: ProgressStep; label: string }[] = [
  { id: 'reading', label: 'Odczyt tekstu z PDF' },
  { id: 'analyzing', label: 'Analiza AI: podsumowanie i dane' },
];

/** Stan ładowania (F-06) z widocznymi krokami i licznikiem czasu. */
export function ProgressView({ fileName, step }: ProgressViewProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, [fileName]);

  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <section className="panel progress" aria-labelledby="progress-title" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <h2 id="progress-title" className="progress__title">
        Analizuję dokument
      </h2>
      <p className="progress__file">{fileName}</p>
      <ol className="progress__steps">
        {STEPS.map((s, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
          return (
            <li key={s.id} className={`progress__step progress__step--${state}`}>
              <span className="progress__marker" aria-hidden="true">
                {state === 'done' ? '✓' : index + 1}
              </span>
              {s.label}
              {state === 'active' && <span className="visually-hidden"> (w toku)</span>}
              {state === 'done' && <span className="visually-hidden"> (gotowe)</span>}
            </li>
          );
        })}
      </ol>
      <p className="progress__time" aria-live="polite">
        {seconds < 3 ? ' ' : `${seconds} s`}
      </p>
    </section>
  );
}
