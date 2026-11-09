import type { SecurityReport } from '../lib/schema';

interface SecurityNoticeProps {
  report: SecurityReport;
}

/**
 * Informacja o pominiętych fragmentach (ukryty tekst, polecenia dla AI).
 * Usunięte fragmenty pokazujemy jako zwykły tekst — React go escapuje, więc są nieszkodliwe.
 */
export function SecurityNotice({ report }: SecurityNoticeProps) {
  if (report.notices.length === 0) return null;

  return (
    <section className="security" role="status" aria-labelledby="security-title">
      <h3 id="security-title" className="security__title">
        <span className="security__icon" aria-hidden="true">
          ⚠
        </span>
        Pominięto podejrzane fragmenty dokumentu
      </h3>
      <ul className="security__list">
        {report.notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
      <p className="security__note">
        Te fragmenty nie zostały przekazane do modelu AI i nie wpłynęły na wynik.
      </p>
      {report.removedExcerpts.length > 0 && (
        <details className="security__details">
          <summary>Pokaż pominięte polecenia</summary>
          <ul className="security__excerpts">
            {report.removedExcerpts.map((excerpt, i) => (
              <li key={`${String(i)}-${excerpt}`}>
                <q>{excerpt}</q>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
