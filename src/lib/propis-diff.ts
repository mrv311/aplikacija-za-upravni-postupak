import type {
  ArticleDiffItem,
  DiffSummaryResult,
  DiffToken,
  ParsedDraftStructure,
} from './izrada-propisa-types';
import { articleSortRank, parseNormativeDraft } from './propis-article-parser';

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  // Zadrži razmake i prijelome redaka radi čitljivog prikaza i točnog očuvanja tablica
  return text.match(/\S+|\s+/g) || [];
}

function normalizeForEquality(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Deterministički word-level LCS Diff bez vanjskih biblioteka i bez AI troška.
 * Za iznimno duge blokove (>1800 tokena) koristi pametni line-level fallback pa zatim word-level po retku
 * kako bi izvršavanje uvijek ostalo trenutno (<20ms).
 */
export function computeWordDiff(oldText: string, newText: string): {
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
} {
  const aNorm = normalizeForEquality(oldText);
  const bNorm = normalizeForEquality(newText);

  if (aNorm === bNorm) {
    return {
      tokens: aNorm ? [{ type: 'same', text: aNorm }] : [],
      addedWords: 0,
      removedWords: 0,
    };
  }

  if (!aNorm) {
    const words = bNorm.split(/\s+/).filter(Boolean).length;
    return {
      tokens: [{ type: 'added', text: bNorm }],
      addedWords: words,
      removedWords: 0,
    };
  }

  if (!bNorm) {
    const words = aNorm.split(/\s+/).filter(Boolean).length;
    return {
      tokens: [{ type: 'removed', text: aNorm }],
      addedWords: 0,
      removedWords: words,
    };
  }

  const aTokens = tokenizeWords(aNorm);
  const bTokens = tokenizeWords(bNorm);

  // Zaštita memorije za vrlo dugačke odlomke: linijski diff + word diff unutar izmijenjenih redaka
  if (aTokens.length * bTokens.length > 1_200_000) {
    return computeLineBasedDiff(aNorm, bNorm);
  }

  return runLcsDiff(aTokens, bTokens);
}

function runLcsDiff(a: string[], b: string[]): {
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
} {
  const m = a.length;
  const n = b.length;

  // Trim zajedničkog prefiksa i sufiksa za dodatno ubrzanje
  let prefix = 0;
  while (prefix < m && prefix < n && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    a[m - 1 - suffix] === b[n - 1 - suffix]
  ) {
    suffix++;
  }

  const aMid = a.slice(prefix, m - suffix);
  const bMid = b.slice(prefix, n - suffix);
  const lm = aMid.length;
  const ln = bMid.length;

  const dp = new Uint16Array((lm + 1) * (ln + 1));
  const width = ln + 1;

  for (let i = lm - 1; i >= 0; i--) {
    for (let j = ln - 1; j >= 0; j--) {
      if (aMid[i] === bMid[j]) {
        dp[i * width + j] = dp[(i + 1) * width + (j + 1)] + 1;
      } else {
        const down = dp[(i + 1) * width + j];
        const right = dp[i * width + (j + 1)];
        dp[i * width + j] = down >= right ? down : right;
      }
    }
  }

  const rawTokens: DiffToken[] = [];
  if (prefix > 0) {
    rawTokens.push({ type: 'same', text: a.slice(0, prefix).join('') });
  }

  let i = 0;
  let j = 0;
  while (i < lm && j < ln) {
    if (aMid[i] === bMid[j]) {
      rawTokens.push({ type: 'same', text: aMid[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      rawTokens.push({ type: 'removed', text: aMid[i] });
      i++;
    } else {
      rawTokens.push({ type: 'added', text: bMid[j] });
      j++;
    }
  }
  while (i < lm) {
    rawTokens.push({ type: 'removed', text: aMid[i++] });
  }
  while (j < ln) {
    rawTokens.push({ type: 'added', text: bMid[j++] });
  }

  if (suffix > 0) {
    rawTokens.push({ type: 'same', text: a.slice(m - suffix).join('') });
  }

  return mergeAndCountTokens(rawTokens);
}

function computeLineBasedDiff(aNorm: string, bNorm: string): {
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
} {
  const aLines = aNorm.split('\n');
  const bLines = bNorm.split('\n');
  const m = aLines.length;
  const n = bLines.length;

  const dp = new Uint16Array((m + 1) * (n + 1));
  const width = n + 1;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        dp[i * width + j] = dp[(i + 1) * width + (j + 1)] + 1;
      } else {
        const down = dp[(i + 1) * width + j];
        const right = dp[i * width + (j + 1)];
        dp[i * width + j] = down >= right ? down : right;
      }
    }
  }

  const rawTokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      rawTokens.push({ type: 'same', text: aLines[i] + '\n' });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      rawTokens.push({ type: 'removed', text: aLines[i] + '\n' });
      i++;
    } else {
      rawTokens.push({ type: 'added', text: bLines[j] + '\n' });
      j++;
    }
  }
  while (i < m) rawTokens.push({ type: 'removed', text: aLines[i++] + '\n' });
  while (j < n) rawTokens.push({ type: 'added', text: bLines[j++] + '\n' });

  return mergeAndCountTokens(rawTokens);
}

function mergeAndCountTokens(raw: DiffToken[]): {
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
} {
  const merged: DiffToken[] = [];
  for (const tok of raw) {
    if (!tok.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.type === tok.type) {
      prev.text += tok.text;
    } else {
      merged.push({ ...tok });
    }
  }

  let addedWords = 0;
  let removedWords = 0;
  for (const t of merged) {
    if (t.type === 'added') {
      addedWords += t.text.trim().split(/\s+/).filter(Boolean).length;
    } else if (t.type === 'removed') {
      removedWords += t.text.trim().split(/\s+/).filter(Boolean).length;
    }
  }

  return { tokens: merged, addedWords, removedWords };
}

/**
 * Uspoređuje dvije verzije nacrta propisa po člancima (Preambula + Članak 1..N + Obrazloženje).
 * 100% lokalno i deterministički (0 AI troška).
 */
export function compareDraftVersions(params: {
  versionALabel: string;
  versionAText: string;
  versionAStructure?: ParsedDraftStructure;
  versionBLabel: string;
  versionBText: string;
  versionBStructure?: ParsedDraftStructure;
}): DiffSummaryResult {
  const structA = params.versionAStructure || parseNormativeDraft(params.versionAText);
  const structB = params.versionBStructure || parseNormativeDraft(params.versionBText);

  const items: ArticleDiffItem[] = [];

  // 1. Preambula i naslov
  if (structA.preambula || structB.preambula) {
    const oldP = normalizeForEquality(structA.preambula);
    const newP = normalizeForEquality(structB.preambula);
    const diff = computeWordDiff(oldP, newP);
    items.push({
      key: 'preambula',
      oznaka: 'Preambula i naziv akta',
      status:
        oldP === newP
          ? 'nepromijenjeno'
          : !oldP
          ? 'dodano'
          : !newP
          ? 'brisano'
          : 'izmijenjeno',
      oldText: oldP,
      newText: newP,
      tokens: diff.tokens,
      addedWords: diff.addedWords,
      removedWords: diff.removedWords,
    });
  }

  // 2. Uparivanje članaka po ključu ("1", "2", "3a", ...)
  const mapA = new Map(structA.clanci.map((c) => [c.key, c]));
  const mapB = new Map(structB.clanci.map((c) => [c.key, c]));
  const allKeys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort(
    (k1, k2) => articleSortRank(k1) - articleSortRank(k2)
  );

  for (const key of allKeys) {
    const artA = mapA.get(key);
    const artB = mapB.get(key);
    const oznaka = artB?.oznaka || artA?.oznaka || `Članak ${key}.`;
    const oldText = normalizeForEquality(artA?.tekst || '');
    const newText = normalizeForEquality(artB?.tekst || '');

    let status: ArticleDiffItem['status'] = 'nepromijenjeno';
    if (!artA && artB) status = 'dodano';
    else if (artA && !artB) status = 'brisano';
    else if (oldText !== newText) status = 'izmijenjeno';

    const diff = computeWordDiff(oldText, newText);
    items.push({
      key,
      oznaka,
      status,
      oldText,
      newText,
      tokens: diff.tokens,
      addedWords: diff.addedWords,
      removedWords: diff.removedWords,
    });
  }

  // 3. Ugrađeno Obrazloženje (ako postoji u barem jednoj verziji)
  if (structA.obrazlozenje || structB.obrazlozenje) {
    const oldO = normalizeForEquality(structA.obrazlozenje);
    const newO = normalizeForEquality(structB.obrazlozenje);
    const diff = computeWordDiff(oldO, newO);
    items.push({
      key: 'obrazlozenje',
      oznaka: 'Obrazloženje (prilog nacrtu)',
      status:
        oldO === newO
          ? 'nepromijenjeno'
          : !oldO
          ? 'dodano'
          : !newO
          ? 'brisano'
          : 'izmijenjeno',
      oldText: oldO,
      newText: newO,
      tokens: diff.tokens,
      addedWords: diff.addedWords,
      removedWords: diff.removedWords,
    });
  }

  const stats = {
    total: items.length,
    unchanged: items.filter((i) => i.status === 'nepromijenjeno').length,
    modified: items.filter((i) => i.status === 'izmijenjeno').length,
    added: items.filter((i) => i.status === 'dodano').length,
    removed: items.filter((i) => i.status === 'brisano').length,
  };

  return {
    versionALabel: params.versionALabel,
    versionBLabel: params.versionBLabel,
    items,
    stats,
  };
}
