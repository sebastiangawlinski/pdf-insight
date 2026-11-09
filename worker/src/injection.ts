/**
 * Wykrywanie fragmentów wyglądających na polecenia skierowane do AI (prompt injection).
 * Działa deterministycznie, PRZED wysłaniem tekstu do modelu — więc nie zależy od tego,
 * czy model „posłucha” instrukcji systemowej.
 *
 * To heurystyka: wyłapuje typowe sformułowania (PL i EN), ale nie wszystkie możliwe.
 * Dlatego jest jedną z kilku warstw (filtr ukrytego tekstu, losowy znacznik bloku,
 * instrukcja systemowa, walidacja schematu, grounding).
 */

/** Usuwa polskie znaki diakrytyczne i ujednolica spacje, żeby wzorce były prostsze. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Wzorce działają na tekście po foldText (małe litery, bez polskich znaków). */
const INJECTION_PATTERNS: RegExp[] = [
  // EN: "ignore all previous instructions", "disregard the above rules"
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|any|system|your)\b.{0,30}\b(instructions?|prompts?|rules?|directions?|guidelines?)\b/,
  // PL: "zignoruj wszystkie wcześniejsze polecenia", "pomiń poprzednie instrukcje"
  /\b(zignoruj|ignoruj|pomin|zapomnij|nie stosuj|nie przestrzegaj)\w*\b.{0,50}\b(instrukcj|polecen|regul|zasad|prompt|wytyczn)/,
  // PL: "instrukcja dla systemu AI", "polecenie dla modelu"
  /\b(instrukcj\w*|polecen\w*|wiadomosc\w*|notatk\w*) dla (systemu |modelu |asystenta )?(ai|sztucznej inteligencji|llm|modelu|asystenta|chatbota|gpt)\b/,
  // EN: "instructions for the AI", "note to the assistant"
  /\b(instructions?|message|note|command)s? (for|to) (the |any )?(ai|assistant|llm|language model|model|chatbot|gpt)\b/,
  // odgrywanie ról: "you are now a…", "jesteś teraz…", "act as"
  /\byou are now\b|\bfrom now on,? you\b|\bjestes teraz\b|\bod teraz jestes\b/,
  // wzmianki o prompcie systemowym
  /\bsystem prompt\b|\bprompt\w* systemow/,
  // ukrywanie manipulacji: "nie wspominaj o tej instrukcji", "do not mention this instruction"
  /\bnie (wspominaj|ujawniaj|informuj)\w*\b.{0,30}\b(instrukcj|polecen)|\bdo not (mention|reveal|disclose)\b.{0,30}\binstructions?\b/,
  // znaczniki ról jak w czacie: "SYSTEM:", "ASSISTANT:" na początku wiersza
  /^\s*(system|assistant|developer)\s*:/,
];

export function isSuspiciousLine(line: string): boolean {
  const folded = foldText(line);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(folded));
}

export interface InjectionScanResult {
  text: string;
  /** Usunięte fragmenty (skrócone) — pokazywane użytkownikowi dla przejrzystości. */
  removed: string[];
}

const MAX_EXCERPT_LENGTH = 160;

/** Ile kolejnych wierszy-kontynuacji usuwamy maksymalnie razem z podejrzanym wierszem. */
const MAX_CONTINUATION_LINES = 4;

/**
 * Usuwa wiersze zawierające podejrzane polecenia wraz z ich kontynuacją: jeśli wiersz nie kończy
 * się znakiem końca zdania, to zdanie jest złamane i ciągnie się w następnym wierszu (typowe
 * dla PDF). Dzięki temu wycinamy całe wstrzyknięte polecenie, a nie sąsiednią, prawdziwą treść.
 */
export function removeInjectedInstructions(text: string): InjectionScanResult {
  const lines = text.split('\n');
  const kept: string[] = [];
  const removed: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!isSuspiciousLine(line)) {
      kept.push(line);
      continue;
    }
    const block = [line];
    while (
      block.length <= MAX_CONTINUATION_LINES &&
      !/[.!?;]["”»)]?\s*$/.test(block[block.length - 1] ?? '') &&
      i + 1 < lines.length &&
      (lines[i + 1] ?? '').trim() !== ''
    ) {
      i++;
      block.push(lines[i] ?? '');
    }
    removed.push(excerpt(block.join(' ')));
  }

  return { text: kept.join('\n'), removed };
}

function excerpt(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_EXCERPT_LENGTH ? `${flat.slice(0, MAX_EXCERPT_LENGTH - 1)}…` : flat;
}
