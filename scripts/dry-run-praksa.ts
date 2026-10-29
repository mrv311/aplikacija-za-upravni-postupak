import fs from 'fs/promises';
import path from 'path';

const USER_PROFILE = process.env.USERPROFILE || 'C:\\Users\\dinom';
const POSAO_DIR = path.join(
  USER_PROFILE,
  'OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije',
  'P O S A O'
);

interface TargetFolder {
  relPath: string;
  categoryTag: string;
}

const TARGETS: TargetFolder[] = [
  { relPath: 'ŽALBE NA VODNE NAKNADE/NAKNADA ZA ZAŠTITU VODA', categoryTag: 'Naknada za zaštitu voda' },
  { relPath: 'ŽALBE NA VODNE NAKNADE/NAKNADA ZA KORIŠTENJE VODA', categoryTag: 'Naknada za korištenje voda' },
  { relPath: 'NAKNADA ZA KONCESIJU', categoryTag: 'Naknada za koncesiju' },
  { relPath: 'PONIŠTAVANJE I UKIDANJE RJEŠENJA - NOVI ZUP_ČL_129 DO 132', categoryTag: 'Poništavanje i ukidanje rješenja (ZUP)' },
  { relPath: 'OGLAŠAVANJE RJEŠENJA NIŠTAVIM', categoryTag: 'Oglašavanje rješenja ništavim' },
  { relPath: 'OBNOVA POSTUPKA', categoryTag: 'Obnova postupka' },
  { relPath: 'RJEŠENJA PO PRIGOVORU', categoryTag: 'Rješenja po prigovoru' },
  { relPath: 'TROŠKOVI POSTUPKA', categoryTag: 'Troškovi postupka' },
  { relPath: 'ZAKLJUČCI - NOVI ZUP', categoryTag: 'Zaključci (ZUP)' },
  { relPath: 'ZAŠTITA OD POSTUPANJA PRUŽATELJA JAVNIH USLUGA_ČL_157 i 158_ZUP', categoryTag: 'Zaštita od postupanja pružatelja javnih usluga' },
  { relPath: 'ZAKUP JAVNOG VODNOG DOBRA - ŽALBE', categoryTag: 'Zakup javnog vodnog dobra' },
  { relPath: 'AKTI PO PRESUDAMA USTAVNOG SUDA', categoryTag: 'Akti po presudama Ustavnog suda' },
];

function getCanonicalDocKey(fileName: string): string {
  const ext = path.extname(fileName);
  let base = path.basename(fileName, ext);
  // Ukloni sufikse _boja, -boja, _pismohrana, -pismohrana, scan, potpis, boja1, itd.
  base = base.replace(/[_-]?(boja\d*|pismohran[ae]?\d*|scan\d*|potpis\d*)$/i, '');
  base = base.replace(/[_\s-]+$/g, '');
  // Ukloni završni brojač verzije ako se radi o duplikatu (npr. suda1, suda2)
  base = base.replace(/([a-zA-ZčćžšđČĆŽŠĐ])\d+$/i, '$1');
  return base.trim().toLowerCase();
}

function computeFileScore(fileName: string, ext: string): number {
  const nameLower = fileName.toLowerCase();
  let score = 0;
  // Boja ima najviši prioritet (glavni original u boji)
  if (nameLower.includes('boja')) {
    score += 100;
  } else if (!nameLower.includes('pismohran')) {
    score += 50;
  } else {
    // pismohrana je crno-bijeli s potpisima i parafima - rezervna opcija ako nema boje
    score += 10;
  }

  // Format datoteke: docx > doc > pdf > txt
  if (ext === '.docx') score += 30;
  else if (ext === '.doc') score += 20;
  else if (ext === '.pdf') score += 10;
  else if (ext === '.txt') score += 5;

  // Ako je boja1, boja2 - malo manji prioritet od čistog 'boja'
  if (/boja\d+/i.test(nameLower)) {
    score -= 5;
  }

  return score;
}

interface FileEntry {
  filePath: string;
  fileName: string;
  dirName: string;
  ext: string;
  score: number;
  size: number;
  mtime: number;
}

async function collectFilesRecursively(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await collectFilesRecursively(fullPath);
        results.push(...subFiles);
      } else if (entry.isFile() && /\.(doc|docx|pdf|txt)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (err: any) {
    console.warn(`Greška čitanja mape ${dir}: ${err.message}`);
  }
  return results;
}

async function runDryRun() {
  console.log('🔍 Pokrećem analizu novih kategorija i detekciju duplikata (DRY RUN)...\n');

  let grandTotalFiles = 0;
  let grandTotalChosen = 0;
  let grandTotalDuplicatesSkipped = 0;

  for (const target of TARGETS) {
    const targetPath = path.join(POSAO_DIR, target.relPath.replace(/\//g, path.sep));
    const allFiles = await collectFilesRecursively(targetPath);
    if (allFiles.length === 0) {
      console.log(`⚠️  [${target.categoryTag}] Nema datoteka na: ${targetPath}`);
      continue;
    }

    grandTotalFiles += allFiles.length;

    // Grupiraj po (direktorij, canonicalDocKey)
    const groups = new Map<string, FileEntry[]>();

    for (const fp of allFiles) {
      const fn = path.basename(fp);
      const ext = path.extname(fp).toLowerCase();
      const dirName = path.dirname(fp);
      const stat = await fs.stat(fp);
      const key = `${dirName}::${getCanonicalDocKey(fn)}`;

      const entry: FileEntry = {
        filePath: fp,
        fileName: fn,
        dirName,
        ext,
        score: computeFileScore(fn, ext),
        size: stat.size,
        mtime: stat.mtimeMs,
      };

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const chosen: FileEntry[] = [];
    const skipped: { skipped: string; chosen: string; reason: string }[] = [];

    for (const [, entries] of groups.entries()) {
      if (entries.length === 1) {
        chosen.push(entries[0]);
      } else {
        // Sort descending by score, then mtime, then size
        entries.sort((a, b) => b.score - a.score || b.mtime - a.mtime || b.size - a.size);
        const winner = entries[0];
        chosen.push(winner);
        for (let i = 1; i < entries.length; i++) {
          const item = entries[i];
          const isPismohrana = item.fileName.toLowerCase().includes('pismohran');
          const reason = isPismohrana
            ? 'pismohrana duplikat (odabrana verzija u boji/glavna)'
            : 'duplikat/starija verzija (odabrana viša kvaliteta)';
          skipped.push({ skipped: item.fileName, chosen: winner.fileName, reason });
        }
      }
    }

    grandTotalChosen += chosen.length;
    grandTotalDuplicatesSkipped += skipped.length;

    console.log(`====================================================`);
    console.log(`📁 [${target.categoryTag}]`);
    console.log(`   Ukupno datoteka na disku: ${allFiles.length}`);
    console.log(`   ✅ Odabrano za uvoz: ${chosen.length}`);
    console.log(`   ⏭️ Preskočeno duplikata: ${skipped.length}`);

    if (skipped.length > 0) {
      console.log(`   --- Primjeri riješenih duplikata: ---`);
      for (const s of skipped.slice(0, 5)) {
        console.log(`      • Preskočeno: "${s.skipped}"`);
        console.log(`        ↳ Odabrano: "${s.chosen}" (${s.reason})`);
      }
      if (skipped.length > 5) {
        console.log(`      ... i još ${skipped.length - 5} preskočenih duplikata.`);
      }
    }
    console.log('');
  }

  console.log('====================================================');
  console.log('📊 UKUPNI REZULTAT ANALIZE:');
  console.log(`   Ukupno pronađeno datoteka: ${grandTotalFiles}`);
  console.log(`   ⏭️  Ukupno eliminirano duplikata (pismohrana/blizanci): ${grandTotalDuplicatesSkipped}`);
  console.log(`   ✅ UKUPNO JEDINSTVENIH SPISA ZA UVOZ: ${grandTotalChosen}`);
  console.log('====================================================');
}

runDryRun().catch(console.error);
