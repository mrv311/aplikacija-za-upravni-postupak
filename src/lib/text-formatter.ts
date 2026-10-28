export function normalizeExtractedLegalText(raw: string): string {
  if (!raw) return '';

  // 1. Spoji riječi prekinute crticom na kraju retka (npr. "obve-\nza" -> "obveza")
  let text = raw.replace(/(\b[a-zA-ZčćžšđČĆŽŠĐ]+)-\s*\r?\n\s*([a-zA-ZčćžšđČĆŽŠĐ]+\b)/g, '$1$2');

  const rawLines = text.split(/\r?\n/).map((l) => l.trim());

  const paragraphs: string[] = [];
  let currentWords: string[] = [];

  const isHeadingOrBreak = (line: string): boolean => {
    if (!line) return false;
    // Rimske ili arapske točke na početku: "I.", "II.", "1.", "2."
    if (/^([IVXLCDM]+|[0-9]{1,2})\.\s+/i.test(line)) return true;
    // Oznake akta i zaglavlja
    if (/^(KLASA|URBROJ|REPUBLIKA|HRVATSKE|MINISTARSTVO|ŽALB[AU]|RJEŠENJE|ODLUKA|PREDMET:)/i.test(line)) return true;
    // Znakovi nabrajanja (crtica ili točka)
    if (/^[-–•*]\s+/.test(line)) return true;
    return false;
  };

  const endsWithSentenceTerminal = (line: string): boolean => {
    if (!line) return false;
    // Završava točkom, upitnikom ili uskličnikom (ali ne skraćenica)
    if (!/[.!?]$/.test(line)) return false;
    // Provjeri uobičajene pravne skraćenice
    const isAbbr = /\b(god|br|st|čl|dr|tzv|k\.o|zk\.ul|npr|itd|sl|str|ing|dipl|iur|odv)\.$/i.test(line);
    return !isAbbr;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (!line) {
      if (currentWords.length > 0) {
        paragraphs.push(currentWords.join(' '));
        currentWords = [];
      }
      continue;
    }

    // Ako linija izgleda kao novi naslov/točka, zatvori prethodni odlomak
    if (isHeadingOrBreak(line) && currentWords.length > 0) {
      paragraphs.push(currentWords.join(' '));
      currentWords = [];
    }

    currentWords.push(line);

    // Ako linija završava rečeničnim znakom i nakupljeno je barem 4 riječi (ili linija ima preko 40 znakova)
    if (endsWithSentenceTerminal(line) && (currentWords.length >= 4 || line.length > 40)) {
      const nextLine = rawLines[i + 1];
      // Ako sljedeća linija ne postoji, ili počinje velikim slovom/brojem/zagradom, ili je prazna
      if (!nextLine || isHeadingOrBreak(nextLine) || /^[A-ZČĆŽŠĐ0-9„"'(]/.test(nextLine)) {
        // Ako je sljedeća linija kratka pojedinačna riječ, možda je još uvijek ista rečenica samo bez točke?
        // Ali ako trenutna linija završava točkom i nije skraćenica, to je legitiman kraj rečenice/odlomka
        paragraphs.push(currentWords.join(' '));
        currentWords = [];
      }
    }
  }

  if (currentWords.length > 0) {
    paragraphs.push(currentWords.join(' '));
  }

  // 2. Počisti višestruke razmake unutar svakog odlomka
  return paragraphs
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p.length > 0)
    .join('\n\n');
}

/**
 * Čisti generirani nacrt akta od neželjenih prijeloma redaka unutar navodnika žalbe
 * ili usred rečenica koje su nastale preslikavanjem PDF/OCR formata.
 */
export function cleanDraftActFormatting(draft: string): string {
  if (!draft) return '';

  let text = draft;

  // 1. Očisti navodnike žalbe „...“ ako sadrže rascjepkane linije od po jedne riječi
  text = text.replace(/„([^“]+)“/g, (match, inner) => {
    const lines = inner.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    const avgLen = lines.length > 0 ? inner.length / lines.length : 100;
    // Ako ima više od 3 retka i prosječna duljina retka je manja od 45 znakova
    if (lines.length > 2 && avgLen < 45) {
      return `„\n${normalizeExtractedLegalText(inner)}\n“`;
    }
    return match;
  });

  // 2. Ako igdje u tekstu postoje pojedinačne riječi u zasebnim redovima usred rečenice
  text = text.replace(/(\b[^\n.!?:\r\n]{1,30})\r?\n([a-zčćžšđ0-9„"'])/gi, '$1 $2');

  return text;
}
