import type { ParsedArticle, ParsedDraftStructure } from './izrada-propisa-types';

/**
 * Deterministički parser normativnog teksta hrvatskog propisa (Uredba, Pravilnik, Zakon, Odluka).
 * 0 AI troška — razdvaja preambulu, naslov akta, pojedine članke (Članak 1., 2., 3.a...),
 * potpisni blok i eventualno priloženo OBRAZLOŽENJE na kraju dokumenta.
 */
export function parseNormativeDraft(rawText: string): ParsedDraftStructure {
  const normalized = (rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // 1. Provjeri postoji li zasebna sekcija OBRAZLOŽENJE na kraju nacrta
  let obrazlozenjeStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
    if (/^O\s*B\s*R\s*A\s*Z\s*L\s*O\s*Ž\s*E\s*N\s*J\s*E\s*:?$/i.test(trimmed)) {
      // Prihvati samo ako se nalazi nakon barem jednog članka (pažnja: \b ne radi s hrvatskim 'Č'!)
      const beforeText = lines.slice(0, i).join('\n');
      if (/Članak\s+\d+/i.test(beforeText)) {
        obrazlozenjeStartIdx = i;
        break;
      }
    }
  }

  const normativeLines =
    obrazlozenjeStartIdx >= 0 ? lines.slice(0, obrazlozenjeStartIdx) : lines;
  const obrazlozenje =
    obrazlozenjeStartIdx >= 0
      ? lines
          .slice(obrazlozenjeStartIdx + 1)
          .join('\n')
          .trim()
      : '';

  // 2. Pronađi sve naslove članaka na vlastitom retku: "Članak 1.", "Članak 12.a", "**Članak 3.**"
  const articleStartIndices: Array<{
    lineIndex: number;
    broj: string;
    key: string;
    oznaka: string;
    inlineRest: string;
  }> = [];

  for (let i = 0; i < normativeLines.length; i++) {
    const clean = normativeLines[i]
      .trim()
      .replace(/^#+\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim();

    const m = clean.match(/^Članak\s+(\d+\.?\s*[a-z]?)\.(?:\s+(.*))?$/i);
    if (m) {
      const rawBroj = m[1].replace(/\s+/g, '').replace(/\.$/, '');
      const key = rawBroj.toLowerCase();
      const oznaka = `Članak ${rawBroj}.`;
      articleStartIndices.push({
        lineIndex: i,
        broj: rawBroj,
        key,
        oznaka,
        inlineRest: (m[2] || '').trim(),
      });
    }
  }

  if (articleStartIndices.length === 0) {
    return {
      preambula: normativeLines.join('\n').trim(),
      naslovAkta: '',
      clanci: [],
      potpisniBlok: '',
      obrazlozenje,
    };
  }

  // 3. Preambula i naslov akta (sve prije prvog članka)
  const headerLines = normativeLines.slice(0, articleStartIndices[0].lineIndex);
  const preambula = headerLines.join('\n').trim();

  // Pokušaj izdvojiti naslov akta (npr. UREDBU O VISINI NAKNADE ZA UREĐENJE VODA)
  const titleMatch = preambula.match(
    /(UREDB[UA]|PRAVILNIK|ZAKON|ODLUK[AU])\s+[\s\S]{3,240}$/i
  );
  const naslovAkta = titleMatch
    ? titleMatch[0]
        .split('\n')
        .map((l) => l.replace(/\*\*/g, '').trim())
        .filter(Boolean)
        .join(' ')
    : '';

  // 4. Ekstrahiraj članke i eventualni potpisni blok na kraju zadnjeg članka
  const clanci: ParsedArticle[] = [];
  let potpisniBlok = '';

  for (let idx = 0; idx < articleStartIndices.length; idx++) {
    const curr = articleStartIndices[idx];
    const nextStart =
      idx + 1 < articleStartIndices.length
        ? articleStartIndices[idx + 1].lineIndex
        : normativeLines.length;

    let bodyLines = normativeLines.slice(curr.lineIndex + 1, nextStart);

    // Kod zadnjeg članka odvoji potpisni blok (KLASA / URBROJ / PREDSJEDNIK / MINISTAR / Zagreb,)
    if (idx === articleStartIndices.length - 1) {
      const sigIdx = bodyLines.findIndex((l) =>
        /^(KLASA:|URBROJ:|PREDSJEDNIK\b|MINISTAR\b|MINISTRICA\b|Zagreb,\s*\d)/i.test(
          l.replace(/\*\*/g, '').trim()
        )
      );
      if (sigIdx !== -1) {
        potpisniBlok = bodyLines.slice(sigIdx).join('\n').trim();
        bodyLines = bodyLines.slice(0, sigIdx);
      }
    }

    // Provjeri je li neposredno iznad članka kratki naslov članka (ako nije dio prethodnog stavka)
    let naslov: string | undefined;
    if (idx > 0 && curr.lineIndex - 1 > articleStartIndices[idx - 1].lineIndex) {
      const prevLine = normativeLines[curr.lineIndex - 1]?.replace(/\*\*/g, '').trim() || '';
      const prevPrev = normativeLines[curr.lineIndex - 2]?.trim() || '';
      if (
        prevLine &&
        prevLine.length <= 90 &&
        !/[.!?:;]$/.test(prevLine) &&
        !/^\|/.test(prevLine) &&
        !/^[-•*]/.test(prevLine) &&
        !prevPrev
      ) {
        naslov = prevLine;
      }
    }

    const joined = [curr.inlineRest, ...bodyLines]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const stavciMatches = joined.match(/^\(\d+\)/gm) || [];
    const imaTablicu = /^\|\s*[^|\n]+\|/m.test(joined);

    clanci.push({
      key: curr.key,
      broj: curr.broj,
      oznaka: curr.oznaka,
      naslov,
      tekst: joined,
      stavciCount: stavciMatches.length > 0 ? stavciMatches.length : joined ? 1 : 0,
      imaTablicu,
    });
  }

  return {
    preambula,
    naslovAkta,
    clanci,
    potpisniBlok,
    obrazlozenje,
  };
}

/**
 * Prirodni ključ za sortiranje članaka (Opće/uvodno -> 1 -> 2 -> 2. st. 10. -> 2a -> 3 ... -> Završne/Obrazloženje)
 */
export function articleSortRank(label: string): number {
  const lower = (label || '').toLowerCase().trim();
  if (
    !lower ||
    lower.includes('opć') ||
    lower.includes('opcen') ||
    lower.includes('uvod') ||
    lower.includes('preambul')
  ) {
    return 0;
  }
  if (lower.includes('obrazlo')) return 9999;
  const m = lower.match(/(?:član\w*\s*|čl\.?\s*)?(\d+)(?:\.?([a-z])(?![a-zčćžšđ]))?/i);
  if (!m) return 9000;
  const num = parseInt(m[1], 10);
  const letterBonus = m[2] ? (m[2].charCodeAt(0) - 96) * 0.01 : 0;
  const stavakMatch = lower.match(/(?:stavak|stavka|stavku|stavkom|stavke|st\.)\s*(\d+)/i);
  const stavakBonus = stavakMatch ? parseInt(stavakMatch[1], 10) * 0.0001 : 0;
  return num + letterBonus + stavakBonus;
}
