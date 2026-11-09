import { useCallback, useRef, useState } from 'react';
import { AnalyzeError, analyzeDocument } from './api/analyze';
import { ErrorView } from './components/ErrorView';
import { FileDropzone } from './components/FileDropzone';
import { HistoryList } from './components/HistoryList';
import { ProgressView } from './components/ProgressView';
import { ResultView } from './components/ResultView';
import { validatePdfFile } from './lib/fileValidation';
import { addToHistory, clearHistory, loadHistory, type HistoryEntry } from './lib/history';
import { extractPdfText, PdfReadError } from './lib/pdf';
import type { Analysis } from './lib/schema';

type AppState =
  | { status: 'idle' }
  | { status: 'reading'; file: File }
  | { status: 'analyzing'; file: File }
  | { status: 'success'; analysis: Analysis; fromHistory: boolean }
  | { status: 'error'; message: string; details?: string | undefined; file: File | null };

function toUserMessage(error: unknown): string {
  if (error instanceof PdfReadError || error instanceof AnalyzeError) return error.message;
  return 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.';
}

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'idle' });
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  // Identyfikator bieżącej analizy — wynik starszej (np. po „Analizuj kolejny”) jest ignorowany.
  const runIdRef = useRef(0);

  const runAnalysis = useCallback(async (file: File) => {
    const runId = ++runIdRef.current;
    const isCurrent = () => runId === runIdRef.current;

    try {
      setState({ status: 'reading', file });
      const { text, pages, hiddenFragments } = await extractPdfText(file);
      if (!isCurrent()) return;

      setState({ status: 'analyzing', file });
      const analysis = await analyzeDocument({
        fileName: file.name,
        pages,
        text,
        hiddenFragments,
      });
      if (!isCurrent()) return;

      setHistory(addToHistory(analysis));
      setState({ status: 'success', analysis, fromHistory: false });
    } catch (error) {
      if (!isCurrent()) return;
      // Błędy pliku (skan, hasło, uszkodzenie) nie znikną po ponowieniu — wtedy nie oferujemy retry.
      const retryable = !(error instanceof PdfReadError);
      setState({
        status: 'error',
        message: toUserMessage(error),
        details: error instanceof AnalyzeError ? error.details : undefined,
        file: retryable ? file : null,
      });
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const validation = validatePdfFile(file);
      if (!validation.ok) {
        runIdRef.current++;
        setState({ status: 'error', message: validation.message, file: null });
        return;
      }
      void runAnalysis(file);
    },
    [runAnalysis],
  );

  const reset = useCallback(() => {
    runIdRef.current++;
    setState({ status: 'idle' });
  }, []);

  const errorFile = state.status === 'error' ? state.file : null;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header className="app-header">
        <div className="container app-header__inner">
          <button type="button" className="logo" onClick={reset} aria-label="PDF Insight — start">
            <span className="logo__mark" aria-hidden="true">
              PI
            </span>
            <span className="logo__text">PDF Insight</span>
          </button>
          <p className="app-header__tagline">Podsumowanie i dane z dokumentu PDF w kilka sekund</p>
        </div>
      </header>

      <main id="main" className="container main">
        {state.status === 'idle' && (
          <>
            <section className="intro" aria-labelledby="intro-title">
              <h1 id="intro-title" className="intro__title">
                Wgraj PDF, a dostaniesz podsumowanie i uporządkowane dane
              </h1>
              <p className="intro__lead">
                Faktura, umowa, oferta czy raport — PDF Insight wyciągnie najważniejsze fakty,
                kwoty, daty i strony dokumentu, a wynik pobierzesz jako plik JSON.
              </p>
            </section>
            <FileDropzone onFileSelected={handleFile} />
            <p className="privacy">
              <strong>Prywatność:</strong> tekst wyciągnięty z pliku zostanie wysłany do
              zewnętrznego modelu AI (Cloudflare Workers AI, awaryjnie Groq) w celu analizy. Sam
              plik PDF nie opuszcza Twojej przeglądarki. Wynik analizy jest przechowywany na
              serwerze przez 7 dni, żeby ponowna analiza tego samego dokumentu była natychmiastowa.
              Nie wgrywaj dokumentów zawierających dane poufne.
            </p>
            <HistoryList
              entries={history}
              onOpen={(entry) => {
                runIdRef.current++;
                setState({ status: 'success', analysis: entry.analysis, fromHistory: true });
              }}
              onClear={() => {
                clearHistory();
                setHistory([]);
              }}
            />
          </>
        )}

        {(state.status === 'reading' || state.status === 'analyzing') && (
          <ProgressView fileName={state.file.name} step={state.status} />
        )}

        {state.status === 'error' && (
          <ErrorView
            message={state.message}
            details={state.details}
            onRetry={errorFile ? () => void runAnalysis(errorFile) : undefined}
            onReset={reset}
          />
        )}

        {state.status === 'success' && (
          <ResultView analysis={state.analysis} fromHistory={state.fromHistory} onReset={reset} />
        )}
      </main>

      <footer className="app-footer">
        <div className="container">
          PDF Insight · zadanie rekrutacyjne Vibe Coder ·{' '}
          <a href="https://github.com/sebastiangawlinski/pdf-insight">kod źródłowy</a>
        </div>
      </footer>
    </div>
  );
}
