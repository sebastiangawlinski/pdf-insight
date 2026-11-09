import { useEffect, useMemo, useRef } from 'react';
import { analysisToJson, downloadAnalysis } from '../lib/export';
import {
  DOCUMENT_TYPE_LABELS,
  formatAmount,
  formatDate,
  formatDateTime,
  languageName,
  pluralPages,
} from '../lib/format';
import type { Analysis } from '../lib/schema';
import { JsonPreview } from './JsonPreview';
import { SecurityNotice } from './SecurityNotice';

interface ResultViewProps {
  analysis: Analysis;
  fromHistory: boolean;
  onReset: () => void;
}

function EmptyNote() {
  return <p className="muted">Nie znaleziono w dokumencie.</p>;
}

/** Widok wyników (F-05). */
export function ResultView({ analysis, fromHistory, onReset }: ResultViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const json = useMemo(() => analysisToJson(analysis), [analysis]);
  const { document: doc, entities } = analysis;

  useEffect(() => {
    headingRef.current?.focus();
  }, [analysis]);

  return (
    <article className="result" aria-labelledby="result-title">
      <header className="panel result__header">
        <div className="result__heading">
          <span className="badge">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
          <h2 id="result-title" ref={headingRef} tabIndex={-1} className="result__title">
            {doc.title ?? doc.fileName}
          </h2>
          <dl className="facts">
            <div>
              <dt>Plik</dt>
              <dd>{doc.fileName}</dd>
            </div>
            <div>
              <dt>Objętość</dt>
              <dd>{pluralPages(doc.pages)}</dd>
            </div>
            <div>
              <dt>Język</dt>
              <dd>{languageName(doc.language)}</dd>
            </div>
            <div>
              <dt>Data dokumentu</dt>
              <dd>{doc.date ? formatDate(doc.date) : '—'}</dd>
            </div>
          </dl>
          {fromHistory && (
            <p className="muted small">
              Wynik z historii · analiza z {formatDateTime(analysis.meta.analyzedAt)}
            </p>
          )}
        </div>
        <div className="actions result__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              downloadAnalysis(analysis);
            }}
          >
            Pobierz JSON
          </button>
          <button type="button" className="button button--ghost" onClick={onReset}>
            Analizuj kolejny plik
          </button>
        </div>
      </header>

      <SecurityNotice report={analysis.meta.security} />

      {analysis.meta.truncated && (
        <p className="notice" role="note">
          Dokument jest bardzo długi — przeanalizowano jego początkową część.
        </p>
      )}

      <section className="panel" aria-labelledby="summary-title">
        <h3 id="summary-title" className="section-title">
          Podsumowanie
        </h3>
        <p className="summary" lang={doc.language}>
          {analysis.summary}
        </p>
      </section>

      <section className="panel" aria-labelledby="keypoints-title">
        <h3 id="keypoints-title" className="section-title">
          Kluczowe punkty
        </h3>
        <ul className="keypoints" lang={doc.language}>
          {analysis.keyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <div className="grid">
        <section className="panel" aria-labelledby="amounts-title">
          <h3 id="amounts-title" className="section-title">
            Kwoty
          </h3>
          {analysis.amounts.length === 0 ? (
            <EmptyNote />
          ) : (
            <ul className="data-list" lang={doc.language}>
              {analysis.amounts.map((amount, i) => (
                <li key={`${amount.value}-${amount.context}-${i}`}>
                  <span className="data-list__value">
                    {formatAmount(amount.value, amount.currency)}
                  </span>
                  <span className="data-list__context">{amount.context}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="dates-title">
          <h3 id="dates-title" className="section-title">
            Daty
          </h3>
          {analysis.dates.length === 0 ? (
            <EmptyNote />
          ) : (
            <ul className="data-list" lang={doc.language}>
              {analysis.dates.map((entry, i) => (
                <li key={`${entry.date}-${entry.context}-${i}`}>
                  <time className="data-list__value" dateTime={entry.date}>
                    {formatDate(entry.date)}
                  </time>
                  <span className="data-list__context">{entry.context}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="orgs-title">
          <h3 id="orgs-title" className="section-title">
            Organizacje
          </h3>
          {entities.organizations.length === 0 ? (
            <EmptyNote />
          ) : (
            <ul className="plain-list">
              {entities.organizations.map((org) => (
                <li key={org}>{org}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="people-title">
          <h3 id="people-title" className="section-title">
            Osoby
          </h3>
          {entities.people.length === 0 ? (
            <EmptyNote />
          ) : (
            <ul className="plain-list">
              {entities.people.map((person) => (
                <li key={person}>{person}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="keywords-title">
        <h3 id="keywords-title" className="section-title">
          Słowa kluczowe
        </h3>
        {analysis.keywords.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="chips" lang={doc.language}>
            {analysis.keywords.map((keyword) => (
              <li key={keyword} className="chip">
                {keyword}
              </li>
            ))}
          </ul>
        )}
      </section>

      <JsonPreview json={json} />

      <p className="muted small result__footnote">
        Wynik wygenerowany przez AI ({analysis.meta.model}
        {analysis.meta.chunks > 1 ? `, dokument podzielony na ${analysis.meta.chunks} części` : ''}
        {analysis.meta.cached
          ? `; z pamięci podręcznej — analiza z ${formatDateTime(analysis.meta.analyzedAt)}`
          : ''}
        ). Sprawdź ważne informacje w oryginalnym dokumencie.
      </p>
    </article>
  );
}
