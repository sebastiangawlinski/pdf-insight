import type { HistoryEntry } from '../lib/history';
import { DOCUMENT_TYPE_LABELS, formatDateTime } from '../lib/format';

interface HistoryListProps {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onClear: () => void;
}

/** Ostatnie analizy zapisane w przeglądarce (F-09). */
export function HistoryList({ entries, onOpen, onClear }: HistoryListProps) {
  if (entries.length === 0) return null;

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history__header">
        <h2 id="history-title" className="history__title">
          Ostatnie analizy
        </h2>
        <button type="button" className="link-button" onClick={onClear}>
          Wyczyść historię
        </button>
      </div>
      <ul className="history__list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="history__item"
              onClick={() => {
                onOpen(entry);
              }}
            >
              <span className="history__name">{entry.analysis.document.fileName}</span>
              <span className="history__meta">
                {DOCUMENT_TYPE_LABELS[entry.analysis.document.type]} ·{' '}
                {formatDateTime(entry.analysis.meta.analyzedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="history__note">Historia jest zapisana tylko w tej przeglądarce.</p>
    </section>
  );
}
