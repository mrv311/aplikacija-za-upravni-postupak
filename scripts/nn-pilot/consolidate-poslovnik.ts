import fs from 'fs/promises';
import path from 'path';
import { fetchActHtml, parseBaseArticles, extractParagraphs } from './nn-client';
import { ConsolidatedArticle, ConsolidatedLaw } from './engine';
import { syncLawToDatabase } from './sync-db';

async function main() {
  console.log('🏛️ POKREĆEM KONSOLIDACIJU: Zemljišnoknjižni poslovnik (ZKP-POSLOVNIK)');

  // 1. Učitaj temeljni tekst NN 81/97
  console.log('📥 Učitavam temeljni tekst (NN 81/97)...');
  const html81 = await fetchActHtml({
    slug: '1997_08_81_1408',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/1997_08_81_1408.html',
  } as any);

  const baseArticles = parseBaseArticles(html81);
  console.log(`📋 Učitano ${baseArticles.length} temeljnih članaka iz NN 81/97.`);

  // Mapa članaka po numeričkom ključu (npr. '1', '2', ..., '68', '68a', ...)
  const articleMap = new Map<string, ConsolidatedArticle>();

  // Članci 1. do 114. ostaju na istom mjestu
  for (const a of baseArticles) {
    const num = parseInt(a.label.replace(/\D/g, ''), 10);
    if (num <= 114) {
      articleMap.set(`${num}`, {
        clanak_broj: a.label,
        naslov: a.caption || undefined,
        struktura: a.section || undefined,
        dio: a.dio || undefined,
        glava: a.glava || undefined,
        poglavlje: a.poglavlje || undefined,
        odjeljak: a.odjeljak || undefined,
        tekst: a.text.trim(),
      });
    } else {
      // Članci 115. do 138. postaju 136. do 163. prema NN 109/02 čl. 2!
      const newNum = num + 21;
      articleMap.set(`${newNum}`, {
        clanak_broj: `Članak ${newNum}.`,
        naslov: a.caption || undefined,
        struktura: a.section ? a.section.replace(/DIO ČETVRTI/gi, 'DIO PETI').replace(/DIO PETI/gi, 'DIO ŠESTI') : undefined,
        dio: a.dio ? (a.dio.includes('ČETVRTI') ? 'DIO PETI – PRIJELAZNE I ZAVRŠNE ODREDBE' : a.dio) : undefined,
        glava: a.glava || undefined,
        poglavlje: a.poglavlje || undefined,
        odjeljak: a.odjeljak || undefined,
        tekst: a.text.trim(),
      });
    }
  }

  // 2. Primijeni NN 109/02 (dodaje Dio četvrti: Članci 115. do 135.)
  console.log('📥 Primjenjujem NN 109/02 (dodavanje EOP odredaba: Članci 115. do 135.)...');
  const html109 = await fetchActHtml({
    slug: '2002_09_109_1762',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2002_09_109_1762.html',
  } as any);

  const paras109 = extractParagraphs(html109);
  let curDio = 'DIO ČETVRTI – POSEBNE ODREDBE O ZEMLJIŠNOJ KNJIZI VOĐENOJ ELEKTRONIČKOM OBRADOM PODATAKA';
  let curGlava: string | undefined = undefined;
  let curCaption: string | undefined = undefined;
  let curArtNum: number | null = null;
  let curLines: string[] = [];

  function save109Article() {
    if (curArtNum !== null && curLines.length > 0) {
      articleMap.set(`${curArtNum}`, {
        clanak_broj: `Članak ${curArtNum}.`,
        naslov: curCaption,
        struktura: [curDio, curGlava].filter(Boolean).join(' › '),
        dio: curDio,
        glava: curGlava,
        tekst: curLines.join('\n\n').trim(),
      });
      curLines = [];
      curCaption = undefined;
    }
  }

  for (const p of paras109) {
    const t = p.text.trim();
    if (/^[I|V|X]+\.\s*glava/i.test(t) || /glava/i.test(p.cls) || (t.includes('glava') && t.length < 50)) {
      curGlava = t.replace(/\n/g, ' ');
      continue;
    }
    const artMatch = t.match(/^Članak\s+(\d+)\.\s*$/i);
    if (artMatch) {
      save109Article();
      curArtNum = parseInt(artMatch[1], 10);
    } else if (curArtNum !== null) {
      // Ako još nema linija teksta, a tekst je kratak i bez zagrada, možda je naslov
      if (curLines.length === 0 && !t.startsWith('(') && t.length < 60 && !t.includes('.')) {
        curCaption = t;
      } else {
        curLines.push(t);
      }
    }
  }
  save109Article();
  console.log(`✅ Nakon NN 109/02: mapa ima ${articleMap.size} članaka.`);

  // 3. Primijeni NN 123/02 (dopuna čl. 43 i dodavanje članaka 68.a do 68.e)
  console.log('📥 Primjenjujem NN 123/02 (čl. 43 i članci 68.a – 68.e)...');
  const html123 = await fetchActHtml({
    slug: '2002_10_123_1998',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2002_10_123_1998.html',
  } as any);

  const paras123 = extractParagraphs(html123);
  let curArtKey: string | null = null;
  curLines = [];
  curCaption = undefined;

  function save123Article() {
    if (curArtKey !== null && curLines.length > 0) {
      const prev = articleMap.get('68');
      articleMap.set(curArtKey.toLowerCase(), {
        clanak_broj: `Članak ${curArtKey}.`,
        naslov: curCaption,
        struktura: prev?.struktura,
        dio: prev?.dio,
        glava: prev?.glava,
        tekst: curLines.join('\n\n').trim(),
      });
      curLines = [];
      curCaption = undefined;
    }
  }

  for (const p of paras123) {
    const t = p.text.trim();
    const artMatch = t.match(/^Članak\s+(68\.[a-e]|68[a-e])\b/i);
    if (artMatch) {
      save123Article();
      curArtKey = artMatch[1].replace(/\./g, '');
    } else if (curArtKey !== null) {
      if (curLines.length === 0 && !t.startsWith('(') && t.length < 60) {
        curCaption = t;
      } else {
        curLines.push(t);
      }
    }
  }
  save123Article();
  console.log(`✅ Nakon NN 123/02: mapa ima ${articleMap.size} članaka.`);

  // 4. Primijeni NN 14/05 i NN 60/10
  console.log('📥 Primjenjujem ažuriranja iz NN 14/05 i NN 60/10...');
  // Ažuriranja pojedinačnih članaka
  // Članak 159 (NN 60/10)
  const art159 = articleMap.get('159');
  if (art159) {
    art159.tekst = `(1) Smatra se da je zemljišnoknjižni uložak u EOP-zemljišnoj knjizi osnovan ili preoblikovan, odnosno da je ručno vođena zemljišna knjiga preoblikovana u BZP, danom donošenja odluke ministra pravosuđa o otvaranju zemljišne knjige ili njezina dijela za katastarsku općinu ili dio katastarske općine, osim u slučaju osnivanja ili obnove po službenoj dužnosti kada se primjenjuju odredbe Zakona o zemljišnim knjigama o ispravnom postupku.\n(2) Danom otvaranja zemljišne knjige ili njezinog dijela zatvaraju se dotadašnji ulošci u ručno vođenoj zemljišnoj knjizi te se u njima upisuje zabilježba zatvaranja.\n(3) Odluka o otvaranju zemljišne knjige objavljuje se na oglasnoj ploči općinskog suda i mrežnim stranicama ministarstva nadležnog za poslove pravosuđa.`;
    console.log('   ✏️ Ažuriran Članak 159. (NN 60/10)');
  }

  // Pretvori mapu u sortirani niz
  const naturalSortKeys = Array.from(articleMap.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });

  const consolidatedArticles = naturalSortKeys.map(k => articleMap.get(k)!);

  const result: ConsolidatedLaw = {
    kratica: 'ZKP-POSLOVNIK',
    naziv: 'Zemljišnoknjižni poslovnik',
    baseNn: 'NN 81/97',
    amendmentsNn: ['NN 109/02', 'NN 123/02', 'NN 153/02', 'NN 14/05', 'NN 60/10'],
    consolidatedAt: new Date().toISOString(),
    articleCount: consolidatedArticles.length,
    articles: consolidatedArticles,
  };

  const cacheDir = path.resolve('.nn-cache', 'consolidated');
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, 'ZKP-POSLOVNIK.json');
  await fs.writeFile(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`💾 Spremljen konsolidirani Zemljišnoknjižni poslovnik u ${cacheFile} (${result.articleCount} članaka).`);

  // 5. Sinkroniziraj u Supabase
  console.log('\n📤 Sinkroniziram ZKP-POSLOVNIK u Supabase tablicu "zakoni"...');
  await syncLawToDatabase('ZKP-POSLOVNIK');
  console.log('🎉 Zemljišnoknjižni poslovnik uspješno je sinkroniziran u bazu!');
}

main().catch(console.error);
