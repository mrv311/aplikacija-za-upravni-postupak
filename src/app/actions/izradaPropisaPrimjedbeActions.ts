'use server';

import fs from 'fs';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { generateText } from 'ai';
import { google } from '@/lib/google';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { searchKnowledge, formatZakoni, formatPraksa } from '@/lib/rag';
import {
  getPropisProject,
  listPropisDocuments,
  listPrimjedbe,
  savePrimjedbe,
} from '@/lib/izrada-propisa-storage';
import {
  parseExistingPrimjedbeFromDocxBuffer,
  parseExistingPrimjedbeFromMarkdown,
  detectSenderFromText,
} from '@/lib/izrada-propisa-parser';
import { articleSortRank } from '@/lib/propis-article-parser';
import type {
  ArticleDiffItem,
  PrimjedbaItem,
  PrimjedbaKategorijaTijela,
  PrimjedbaStatus,
} from '@/lib/izrada-propisa-types';

function extractJsonArray<T = any>(raw: string): T[] {
  const cleaned = (raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(slice);
  return Array.isArray(parsed) ? parsed : [];
}

function extractJsonObject<T = Record<string, any>>(raw: string): T {
  const cleaned = (raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as T;
}

const VALID_STATUSES = new Set<PrimjedbaStatus>([
  'Prihvaća se',
  'Djelomično se prihvaća',
  'Ne prihvaća se',
  'Prima se na znanje',
  'Na razmatranju',
]);

const VALID_KATEGORIJE = new Set<PrimjedbaKategorijaTijela>([
  'UZZ',
  'TDU',
  'JLS / Udruge',
  'Gospodarstvo / Dionici',
  'Ostalo',
]);

/**
 * Lokalni uvoz postojeće Word tablice primjedbi (0 AI troška).
 */
export async function importExistingPrimjedbeDocxAction(projectId: string, docId: string) {
  const docs = await listPropisDocuments(projectId);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return { error: 'Dokument nije pronađen.' };

  try {
    let extracted: Omit<PrimjedbaItem, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    if (doc.lokalnaPutanja && fs.existsSync(doc.lokalnaPutanja) && doc.ekstenzija === 'docx') {
      const buf = fs.readFileSync(doc.lokalnaPutanja);
      extracted = await parseExistingPrimjedbeFromDocxBuffer(buf, doc.id, doc.prikazniNaziv);
    }

    if (extracted.length === 0) {
      extracted = parseExistingPrimjedbeFromMarkdown(doc.rawText, doc.id, doc.prikazniNaziv);
    }

    if (extracted.length === 0) {
      return {
        error:
          'U odabranom dokumentu nije pronađena prepoznatljiva tablica primjedbi (TDU/Dionici | Primjedbe | Prihvaćenost | Obrazloženje).',
      };
    }

    const existing = await listPrimjedbe(projectId);
    const now = new Date().toISOString();
    const added: PrimjedbaItem[] = extracted.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));

    const merged = [...existing, ...added].sort(
      (a, b) => articleSortRank(a.clanakOznaka) - articleSortRank(b.clanakOznaka)
    );
    await savePrimjedbe(projectId, merged);
    revalidatePath(`/izrada-propisa/${projectId}`);

    return { success: true, importedCount: added.length, primjedbe: merged };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri lokalnom uvozu Word tablice.' };
  }
}

/**
 * AI automatsko izdvajanje primjedbi po člancima iz učitanih mišljenja TDU-a/UZZ-a/dionika + prijedlozi odgovora.
 */
export async function extractPrimjedbeFromDocsAction(params: {
  projectId: string;
  docIds: string[];
  modelPreference?: 'flash' | 'pro';
}) {
  const project = await getPropisProject(params.projectId);
  if (!project) return { error: 'Projekt nije pronađen.' };

  const docs = await listPropisDocuments(params.projectId);
  const selectedDocs = docs.filter(
    (d) => params.docIds.includes(d.id) && d.rawText && d.rawText.trim().length > 20
  );
  if (selectedDocs.length === 0) {
    return { error: 'Odaberite barem jedno učitano mišljenje s čitljivim tekstom.' };
  }

  const aktualniNacrt = docs.find((d) => d.uloga === 'aktualni_nacrt');
  const aiModel = params.modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

  try {
    // Dohvati mjerodavne zakone i praksu radi kvalitetnih prijedloga odgovora
    const combinedOpinionsText = selectedDocs
      .map(
        (d, idx) =>
          `=== MIŠLJENJE #${idx + 1}: ${d.prikazniNaziv} (Pošiljatelj: ${
            d.posiljatelj || detectSenderFromText(d.naziv).label || 'utvrditi iz teksta'
          }) ===\n${d.rawText.slice(0, 14000)}`
      )
      .join('\n\n');

    const rag = await searchKnowledge(
      `${project.puniNazivAkta}\n${combinedOpinionsText.slice(0, 3000)}`,
      {
        zakoniCount: 8,
        praksaCount: 5,
        extraTextForRefs: `${aktualniNacrt?.rawText.slice(0, 15000) || ''}\n${combinedOpinionsText.slice(0, 10000)}`,
        casePodrucje: project.pravnoPodrucje || 'NUV',
        filterScope: 'sve',
      }
    );

    const systemPrompt = `Ti si viši stručni savjetnik i nomotehničar u Ministarstvu zaštite okoliša i zelene tranzicije RH.
Tvoj zadatak je pažljivo pročitati priložena mišljenja tijela državne uprave (TDU), Ureda za zakonodavstvo Vlade RH (UZZ) i dionika, te izdvojiti SVAKU pojedinačnu primjedbu/prijedlog razbijenu po člancima nacrta propisa, uz prijedlog statusa prihvaćenosti i stručnog obrazloženja (odgovora Ministarstva).

PRAVILA:
1. Ako neko tijelo ima 5 različitih primjedbi (npr. opću primjedbu o zagradama, primjedbu na čl. 1., čl. 5., čl. 7., čl. 8.), OBAVEZNO svaku izdvoji kao ZASEBNU stavku u JSON nizu!
2. Ako neko tijelo daje pozitivno mišljenje bez primjedbi (npr. "nema primjedbi", "suglasni smo"), upiši 1 stavku s clanakOznaka: "Opće primjedbe", status: "Prima se na znanje".
3. Za svaku primjedbu predloži realan status:
   - Nomotehničke i zakonite primjedbe UZZ-a u pravilu: "Prihvaća se"
   - Primjedbe koje bi narušile fiskalnu održivost ili zakonski okvir (ZFVG): "Ne prihvaća se" uz snažno pravno i činjenično obrazloženje.
4. Obrazloženje piši u službenom, odmjerenom i pravno preciznom stilu Tablice primjedbi za Vladu RH.

Vrati ISKLJUČIVO valjani JSON niz objekata (bez dodatnog teksta izvan JSON-a):
[
  {
    "docIndex": 1,
    "tijelo": "Puni službeni naziv tijela/dionika (npr. Ured za zakonodavstvo Vlade Republike Hrvatske)",
    "kategorijaTijela": "UZZ" | "TDU" | "JLS / Udruge" | "Gospodarstvo / Dionici" | "Ostalo",
    "clanakOznaka": "npr. Članak 5. st. 2. i 3. ili Opće primjedbe",
    "tekstPrimjedbe": "Vjerno i potpuno prenesena primjedba tijela",
    "status": "Prihvaća se" | "Djelomično se prihvaća" | "Ne prihvaća se" | "Prima se na znanje" | "Na razmatranju",
    "obrazlozenje": "Stručni prijedlog odgovora Ministarstva",
    "predlozenaIzmjena": "Konkretan prijedlog izmijenjenog teksta odredbe (ako se prihvaća ili djelomično prihvaća, inače prazan string)",
    "pravnaReferenca": "npr. čl. 20. st. 1. ZFVG-a, JMNP ili naziv presude iz prakse"
  }
]`;

    const userPrompt = `PROJEKT: ${project.puniNazivAkta}

AKTUALNI NACRT PROPISA:
${aktualniNacrt ? aktualniNacrt.rawText.slice(0, 26000) : '(Aktualni nacrt još nije učitan)'}

MJERODAVNI ZAKONI IZ BAZE:
${formatZakoni(rag.zakoni)}

RELEVANTNA PRAKSA IZ BAZE:
${formatPraksa(rag.praksa)}

ZAPRIMLJENA MIŠLJENJA ZA IZDVAJANJE:
${combinedOpinionsText}`;

    const { text } = await generateText({
      model: google(aiModel),
      system: systemPrompt,
      prompt: userPrompt,
    });

    const parsedArr = extractJsonArray<any>(text);
    if (parsedArr.length === 0) {
      return { error: 'AI nije uspio strukturirano izdvojiti primjedbe iz odabranih mišljenja.' };
    }

    const now = new Date().toISOString();
    const added: PrimjedbaItem[] = parsedArr.map((raw) => {
      const srcDoc =
        selectedDocs[(Number(raw.docIndex) || 1) - 1] || selectedDocs[0];
      const tijelo = String(raw.tijelo || srcDoc.posiljatelj || srcDoc.prikazniNaziv).trim();
      const rawKat = String(raw.kategorijaTijela || '').trim() as PrimjedbaKategorijaTijela;
      const kategorijaTijela = VALID_KATEGORIJE.has(rawKat)
        ? rawKat
        : detectSenderFromText(tijelo).category;
      const rawStatus = String(raw.status || '').trim() as PrimjedbaStatus;
      const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'Na razmatranju';

      return {
        id: crypto.randomUUID(),
        tijelo,
        kategorijaTijela,
        clanakOznaka: String(raw.clanakOznaka || 'Opće primjedbe').trim(),
        tekstPrimjedbe: String(raw.tekstPrimjedbe || '').trim(),
        status,
        obrazlozenje: String(raw.obrazlozenje || '').trim(),
        predlozenaIzmjena: String(raw.predlozenaIzmjena || '').trim() || undefined,
        pravnaReferenca: String(raw.pravnaReferenca || '').trim() || undefined,
        izvorniDokumentId: srcDoc.id,
        izvorniDokumentNaziv: srcDoc.prikazniNaziv,
        izvorUnosa: 'ai_ekstrakcija',
        createdAt: now,
        updatedAt: now,
      };
    });

    const existing = await listPrimjedbe(params.projectId);
    const merged = [...existing, ...added].sort(
      (a, b) => articleSortRank(a.clanakOznaka) - articleSortRank(b.clanakOznaka)
    );
    await savePrimjedbe(params.projectId, merged);
    revalidatePath(`/izrada-propisa/${params.projectId}`);

    return { success: true, extractedCount: added.length, primjedbe: merged };
  } catch (err: any) {
    console.error('extractPrimjedbeFromDocsAction error:', err);
    return { error: err?.message || 'Greška pri AI izdvajanju primjedbi.' };
  }
}

/**
 * AI prijedlog pravnog odgovora za pojedinu primjedbu (uz RAG iz Baze prakse i Baze zakona).
 */
export async function suggestSinglePrimjedbaResponseAction(params: {
  projectId: string;
  primjedbaId: string;
  zeljeniStatus?: PrimjedbaStatus;
  dodatnaUputa?: string;
  modelPreference?: 'flash' | 'pro';
}) {
  const project = await getPropisProject(params.projectId);
  if (!project) return { error: 'Projekt nije pronađen.' };

  const all = await listPrimjedbe(params.projectId);
  const item = all.find((p) => p.id === params.primjedbaId);
  if (!item) return { error: 'Primjedba nije pronađena.' };

  const docs = await listPropisDocuments(params.projectId);
  const aktualniNacrt = docs.find((d) => d.uloga === 'aktualni_nacrt');
  const aiModel = params.modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

  try {
    const rag = await searchKnowledge(
      `${item.clanakOznaka} ${item.tekstPrimjedbe}\n${project.puniNazivAkta}`,
      {
        zakoniCount: 8,
        praksaCount: 6,
        extraTextForRefs: `${aktualniNacrt?.rawText.slice(0, 16000) || ''}\n${item.tekstPrimjedbe}`,
        casePodrucje: project.pravnoPodrucje || 'NUV',
        filterScope: 'sve',
      }
    );

    const { text } = await generateText({
      model: google(aiModel),
      system: `Ti si viši upravni savjetnik i nomotehničar u Ministarstvu zaštite okoliša i zelene tranzicije RH.
Sastavi pravno besprijekoran, koncizan i uvjerljiv službeni odgovor (Obrazloženje) za Tablicu primjedbi na nacrt propisa.
Pozovi se na točne članke važećih zakona i relevantne odluke iz prakse kada potkrepljuju stajalište Ministarstva.

Vrati ISKLJUČIVO valjani JSON objekt:
{
  "status": "Prihvaća se" | "Djelomično se prihvaća" | "Ne prihvaća se" | "Prima se na znanje",
  "obrazlozenje": "Službeno obrazloženje za tablicu primjedbi",
  "predlozenaIzmjena": "Konkretan tekst izmijenjene odredbe (ako se prihvaća ili djelomično prihvaća, inače prazan string)",
  "pravnaReferenca": "Kratki popis korištenih članaka zakona i odluka prakse"
}`,
      prompt: `AKT: ${project.puniNazivAkta}
TIJELO: ${item.tijelo} (${item.kategorijaTijela})
ČLANAK / ODREDBA: ${item.clanakOznaka}
PRIMJEDBA: ${item.tekstPrimjedbe}
${params.zeljeniStatus ? `ŽELJENI SMJER ODLUKE: ${params.zeljeniStatus}` : ''}
${params.dodatnaUputa ? `DODATNA UPUTA SAVJETNIKA: ${params.dodatnaUputa}` : ''}

AKTUALNI NACRT:
${aktualniNacrt ? aktualniNacrt.rawText.slice(0, 22000) : '(Nema učitanog nacrta)'}

ZAKONI IZ BAZE:
${formatZakoni(rag.zakoni)}

PRAKSA IZ BAZE:
${formatPraksa(rag.praksa)}`,
    });

    const parsed = extractJsonObject<any>(text);
    const nextStatus = VALID_STATUSES.has(parsed.status)
      ? (parsed.status as PrimjedbaStatus)
      : params.zeljeniStatus || item.status;

    const updatedList = all.map((p) =>
      p.id === item.id
        ? {
            ...p,
            status: nextStatus,
            obrazlozenje: String(parsed.obrazlozenje || p.obrazlozenje).trim(),
            predlozenaIzmjena: String(parsed.predlozenaIzmjena || '').trim() || undefined,
            pravnaReferenca: String(parsed.pravnaReferenca || '').trim() || undefined,
            updatedAt: new Date().toISOString(),
          }
        : p
    );

    await savePrimjedbe(params.projectId, updatedList);
    revalidatePath(`/izrada-propisa/${params.projectId}`);
    return {
      success: true,
      item: updatedList.find((p) => p.id === item.id)!,
      primjedbe: updatedList,
    };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri generiranju prijedloga odgovora.' };
  }
}

export async function upsertPrimjedbaAction(
  projectId: string,
  payload: Omit<PrimjedbaItem, 'id' | 'createdAt' | 'updatedAt' | 'izvorUnosa'> & {
    id?: string;
    izvorUnosa?: PrimjedbaItem['izvorUnosa'];
  }
) {
  const all = await listPrimjedbe(projectId);
  const now = new Date().toISOString();

  let next: PrimjedbaItem[];
  if (payload.id) {
    next = all.map((p) =>
      p.id === payload.id
        ? {
            ...p,
            ...payload,
            id: p.id,
            updatedAt: now,
          }
        : p
    );
  } else {
    const created: PrimjedbaItem = {
      ...payload,
      id: crypto.randomUUID(),
      izvorUnosa: payload.izvorUnosa || 'rucno',
      createdAt: now,
      updatedAt: now,
    };
    next = [created, ...all];
  }

  next.sort((a, b) => articleSortRank(a.clanakOznaka) - articleSortRank(b.clanakOznaka));
  await savePrimjedbe(projectId, next);
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true, primjedbe: next };
}

export async function deletePrimjedbaAction(projectId: string, primjedbaId: string) {
  const all = await listPrimjedbe(projectId);
  const next = all.filter((p) => p.id !== primjedbaId);
  await savePrimjedbe(projectId, next);
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true, primjedbe: next };
}

export async function clearAllPrimjedbeAction(projectId: string) {
  await savePrimjedbe(projectId, []);
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true };
}

/**
 * Dohvaća važeći propis iz Supabase tablice `zakoni` (npr. Uredba o visini naknade za uređenje voda NN 82/10, 108/13)
 * za izravnu usporedbu (Diff) s aktualnim nacrtom!
 */
export async function getEnactedLawTextForDiffAction(nazivZakona: string): Promise<{
  label: string;
  rawText: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('zakoni')
      .select('clanak_broj, tekst')
      .eq('naziv_zakona', nazivZakona);

    if (error || !data || data.length === 0) {
      return {
        label: nazivZakona,
        rawText: '',
        error: `Propis „${nazivZakona}” nije pronađen u Bazi zakona.`,
      };
    }

    const sorted = [...data].sort(
      (a: any, b: any) => articleSortRank(a.clanak_broj) - articleSortRank(b.clanak_broj)
    );

    const assembled = sorted
      .map((row: any) => {
        const cleanArt = String(row.clanak_broj || '').trim();
        const heading = /^Članak/i.test(cleanArt) ? cleanArt : `Članak ${cleanArt}`;
        const normalizedHeading = heading.endsWith('.') ? heading : `${heading}.`;
        return `${normalizedHeading}\n${String(row.tekst || '').trim()}`;
      })
      .join('\n\n');

    return {
      label: `Važeći propis iz baze: ${nazivZakona}`,
      rawText: assembled,
    };
  } catch (err: any) {
    return {
      label: nazivZakona,
      rawText: '',
      error: err?.message || 'Greška pri dohvaćanju važećeg propisa.',
    };
  }
}

/**
 * Opcionalno: AI generira sažeta stručna obrazloženja promjena (4. stupac Tablice promjena) za izmijenjene članke.
 */
export async function generateDiffExplanationsAction(params: {
  puniNazivAkta: string;
  versionALabel: string;
  versionBLabel: string;
  changedItems: Pick<ArticleDiffItem, 'key' | 'oznaka' | 'status' | 'oldText' | 'newText'>[];
}) {
  if (!params.changedItems || params.changedItems.length === 0) {
    return { error: 'Nema izmijenjenih članaka za obrazloženje.' };
  }

  try {
    const payload = params.changedItems
      .map(
        (c) =>
          `[${c.key}] ${c.oznaka} (${c.status})\nSTARA VERZIJA:\n${c.oldText.slice(0, 2200)}\nNOVA VERZIJA:\n${c.newText.slice(0, 2200)}`
      )
      .join('\n\n---\n\n');

    const { text } = await generateText({
      model: google('gemini-3.8-flash'),
      system: `Ti si nomotehničar u Ministarstvu. Na temelju usporedbe dviju verzija nacrta propisa, za SVAKI izmijenjeni, dodani ili brisani članak napiši kratko, jasno i stručno obrazloženje promjene (1–3 rečenice) prikladno za 4. stupac službene „Tablice promjena” za sjednicu Povjerenstva ili Kabinet ministrice.
Vrati ISKLJUČIVO valjani JSON objekt u formatu: { "<key>": "Obrazloženje promjene..." }`,
      prompt: `AKT: ${params.puniNazivAkta}\nUSPOREDBA: ${params.versionALabel} -> ${params.versionBLabel}\n\n${payload}`,
    });

    const map = extractJsonObject<Record<string, string>>(text);
    return { success: true, explanations: map };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri generiranju obrazloženja promjena.' };
  }
}
