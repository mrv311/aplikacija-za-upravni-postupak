'use server';

import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { generateText } from 'ai';
import { google } from '@/lib/google';
import {
  listPropisProjectSummaries,
  getPropisProject,
  createPropisProject,
  savePropisProject,
  deletePropisProject,
  listPropisDocuments,
  savePropisDocuments,
  addPropisDocument,
  updatePropisDocument,
  deletePropisDocument,
  readPropisChatHistory,
  writePropisChatHistory,
} from '@/lib/izrada-propisa-storage';
import {
  parsePropisBufferLocally,
  classifyPropisFile,
  scanLocalPropisFolder,
  detectSenderFromText,
  extractDateFromFileName,
  extractDateFromDocumentText,
  SUPPORTED_PROPIS_EXTENSIONS,
} from '@/lib/izrada-propisa-parser';
import { parseNormativeDraft } from '@/lib/propis-article-parser';
import {
  PROPIS_DOC_ROLE_MAP,
  type PropisDocRole,
  type PropisFazaPostupka,
  type PropisVrstaAkta,
  type PropisDocument,
  type LocalFolderScanEntry,
} from '@/lib/izrada-propisa-types';
import type { LegalUIMessage } from '@/lib/ai-types';

const RAW_UPLOADS_BASE = path.join(process.cwd(), 'data', 'izrada-propisa');

async function runGeminiOcrOnPdfBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const { text } = await generateText({
    model: google('gemini-3.8-flash'),
    system:
      'Ti si precizni pravni OCR sustav za hrvatske službene dokumente (mišljenja ministarstava, UZZ-a, zapisnike i nacrte propisa). Prepiši vjerno cjeloviti tekst dokumenta uključujući zaglavlja, naziv tijela, KLASU, URBROJ, datum, naslove, sve jezične, nomotehničke i sadržajne primjedbe, članke i tablice. Vrati isključivo pročitani tekst bez dodatnih komentara.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Prepiši cjeloviti tekst ovog skeniranog dokumenta (${fileName}):` },
          { type: 'file', data: buffer.toString('base64'), mediaType: 'application/pdf' },
        ],
      },
    ],
  });
  return (text || '').trim();
}

function saveRawUploadForOcr(projectId: string, fileName: string, buffer: Buffer): string | undefined {
  try {
    const safeProj = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = path.join(RAW_UPLOADS_BASE, safeProj, 'raw_uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
    const fullPath = path.join(dir, safeName);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  } catch {
    // Na Vercelu je filesystem read-only (EROFS) — tekst je već parsiran i pohranjen u Supabaseu
    return undefined;
  }
}

export async function listProjectsAction() {
  return listPropisProjectSummaries();
}

export async function createPropisProjectAction(input: {
  naziv: string;
  puniNazivAkta: string;
  vrstaAkta: PropisVrstaAkta;
  maticniPropisi: string[];
  pravnoPodrucje?: string;
  fazaPostupka?: PropisFazaPostupka;
  klasa?: string;
  urbroj?: string;
  strucniNositelj?: string;
  referentnaMapa?: string;
  opis?: string;
}) {
  if (!input.naziv?.trim()) {
    return { error: 'Naziv projekta je obavezan.' };
  }
  try {
    const project = await createPropisProject(input);
    revalidatePath('/izrada-propisa');
    return { success: true, project };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri kreiranju projekta.' };
  }
}

export async function updatePropisProjectAction(
  projectId: string,
  patch: {
    naziv?: string;
    puniNazivAkta?: string;
    vrstaAkta?: PropisVrstaAkta;
    maticniPropisi?: string[];
    pravnoPodrucje?: string;
    fazaPostupka?: PropisFazaPostupka;
    klasa?: string;
    urbroj?: string;
    strucniNositelj?: string;
    referentnaMapa?: string;
    opis?: string;
  }
) {
  const existing = await getPropisProject(projectId);
  if (!existing) return { error: 'Projekt nije pronađen.' };
  const updated = await savePropisProject({
    ...existing,
    ...patch,
    id: existing.id,
  });
  revalidatePath('/izrada-propisa');
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true, project: updated };
}

export async function deletePropisProjectAction(projectId: string) {
  const ok = await deletePropisProject(projectId);
  if (!ok) return { error: 'Projekt nije pronađen.' };
  revalidatePath('/izrada-propisa');
  return { success: true };
}

/**
 * Višestruki upload dokumenata s lokalnim parsiranjem (0 AI troška za tekstualne dokumente)
 * i automatskim in-memory AI OCR-om za skenirane PDF-ove bez tekstualnog sloja (radi i na Vercelu!).
 */
export async function uploadPropisDocumentsAction(formData: FormData) {
  const projectId = String(formData.get('projectId') || '').trim();
  const requestedRole = String(formData.get('uloga') || 'auto').trim();
  const customSender = String(formData.get('posiljatelj') || '').trim();
  const customDate = String(formData.get('datumVerzije') || '').trim();
  const autoOcr = String(formData.get('autoOcr') ?? 'true') !== 'false';
  const files = formData.getAll('files') as File[];

  if (!projectId) return { error: 'Nedostaje ID projekta.' };
  if (!files || files.length === 0) return { error: 'Niste odabrali nijednu datoteku.' };

  const added: PropisDocument[] = [];
  const errors: string[] = [];
  let ocrCount = 0;

  for (const file of files) {
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!SUPPORTED_PROPIS_EXTENSIONS.has(ext)) {
        errors.push(`${file.name}: nepodržan format (.${ext}). Podržani: .docx, .doc, .xlsx, .xls, .pdf, .txt`);
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const autoCls = classifyPropisFile(file.name);
      const role: PropisDocRole =
        requestedRole === 'auto'
          ? autoCls.role
          : (requestedRole as PropisDocRole);

      const parsed = await parsePropisBufferLocally(buffer, file.name, role);

      let finalRawText = parsed.rawText;
      let finalNeedsOcr = parsed.needsOcr;
      let finalIzvorTeksta: PropisDocument['izvorTeksta'] = 'lokalni_parser';
      let finalParsedDraft = parsed.parsedDraft;

      // Ako je PDF skeniran (bez tekstualnog sloja), odmah u memoriji odradi Gemini AI OCR — radi 100% i na Vercelu!
      if (parsed.needsOcr && ext === 'pdf' && autoOcr) {
        try {
          const ocrText = await runGeminiOcrOnPdfBuffer(buffer, file.name);
          if (ocrText.length >= 20) {
            finalRawText = ocrText;
            finalNeedsOcr = false;
            finalIzvorTeksta = 'rucni_ai_ocr';
            ocrCount++;
            if (role === 'aktualni_nacrt' || role === 'prethodna_verzija') {
              const candidate = parseNormativeDraft(ocrText);
              if (candidate.clanci.length > 0 || candidate.preambula.length > 0) {
                finalParsedDraft = candidate;
              }
            }
          }
        } catch (ocrErr: any) {
          errors.push(
            `${file.name}: automatski AI OCR nije uspio (${ocrErr?.message || 'nepoznata greška'}) — dokument je spremljen pa možete naknadno pokrenuti AI OCR.`
          );
        }
      }

      let savedRawPath: string | undefined;
      if (finalNeedsOcr || ext === 'docx') {
        savedRawPath = saveRawUploadForOcr(projectId, file.name, buffer);
      }

      const detectedSender =
        customSender ||
        autoCls.sender ||
        (role === 'misljenje' ? detectSenderFromText(finalRawText.slice(0, 1800)).label : undefined);
      const fileMtimeIso =
        file.lastModified && file.lastModified > 0
          ? new Date(file.lastModified).toISOString().slice(0, 10)
          : undefined;
      const detectedDate =
        customDate ||
        autoCls.date ||
        extractDateFromFileName(file.name) ||
        extractDateFromDocumentText(finalRawText) ||
        fileMtimeIso;

      const roleMeta = PROPIS_DOC_ROLE_MAP[role];
      const doc = await addPropisDocument(projectId, {
        naziv: file.name,
        prikazniNaziv: file.name.replace(/\.[^.]+$/, ''),
        uloga: role,
        posiljatelj: detectedSender,
        datumVerzije: detectedDate,
        ekstenzija: ext,
        velicinaBajta: file.size,
        izvorDatoteke: 'upload',
        lokalnaPutanja: savedRawPath,
        izvorTeksta: finalIzvorTeksta,
        needsOcr: finalNeedsOcr,
        includeInAiContext: roleMeta.defaultInAiContext && !finalNeedsOcr,
        rawText: finalRawText,
        htmlTablesCount: parsed.htmlTablesCount,
        parsedDraft: finalParsedDraft,
        excelSheets: parsed.excelSheets,
      });

      added.push(doc);
    } catch (err: any) {
      errors.push(`${file.name}: ${err?.message || 'Greška pri parsiranju datoteke.'}`);
    }
  }

  revalidatePath('/izrada-propisa');
  revalidatePath(`/izrada-propisa/${projectId}`);

  return {
    success: added.length > 0,
    added,
    ocrCount,
    errors,
  };
}

/**
 * Skenira lokalnu/OneDrive mapu projekta i vraća kategorizirani popis datoteka (0 AI troška).
 */
export async function scanProjectLocalFolderAction(
  projectId: string,
  overridePath?: string
): Promise<{
  folderPath: string;
  exists: boolean;
  entries: LocalFolderScanEntry[];
  error?: string;
}> {
  const project = await getPropisProject(projectId);
  if (!project) {
    return { folderPath: '', exists: false, entries: [], error: 'Projekt nije pronađen.' };
  }

  const targetPath = (overridePath ?? project.referentnaMapa ?? '').trim();
  if (!targetPath) {
    return {
      folderPath: '',
      exists: false,
      entries: [],
      error: 'Nije definirana referentna mapa za ovaj projekt.',
    };
  }

  if (process.env.VERCEL || !fs.existsSync(targetPath)) {
    return {
      folderPath: targetPath,
      exists: false,
      entries: [],
      error: process.env.VERCEL
        ? 'Izravno skeniranje lokalne OneDrive mape dostupno je kad aplikaciju pokrenete lokalno (localhost). Na web verziji (Vercel) jednostavno povucite datoteke u polje za prijenos — sve učitano automatski se sinkronizira preko baze na oba okruženja!'
        : `Mapa ne postoji ili nije dostupna na ovom računalu: ${targetPath}`,
    };
  }

  if (overridePath && overridePath.trim() && overridePath.trim() !== project.referentnaMapa) {
    await savePropisProject({ ...project, referentnaMapa: overridePath.trim() });
  }

  const existingDocs = await listPropisDocuments(projectId);
  const importedPaths = new Set(
    existingDocs
      .map((d) => d.lokalnaPutanja?.toLowerCase())
      .filter((p): p is string => Boolean(p))
  );

  const entries = scanLocalPropisFolder(targetPath, importedPaths);
  return {
    folderPath: targetPath,
    exists: true,
    entries,
  };
}

/**
 * Masovni lokalni uvoz odabranih datoteka iz OneDrive mape projekta (100% lokalno, 0 AI troška).
 */
export async function importFromLocalFolderAction(
  projectId: string,
  selections: Array<{
    fullPath: string;
    uloga: PropisDocRole;
    posiljatelj?: string;
    datumVerzije?: string;
  }>
) {
  if (!projectId || !selections || selections.length === 0) {
    return { error: 'Niste odabrali nijednu datoteku za uvoz.' };
  }

  const existingDocs = await listPropisDocuments(projectId);
  const importedSet = new Set(
    existingDocs
      .map((d) => d.lokalnaPutanja?.toLowerCase())
      .filter((p): p is string => Boolean(p))
  );

  const ordered = [...selections].sort((a, b) => {
    if (a.uloga === 'aktualni_nacrt' && b.uloga !== 'aktualni_nacrt') return 1;
    if (b.uloga === 'aktualni_nacrt' && a.uloga !== 'aktualni_nacrt') return -1;
    return 0;
  });

  const imported: PropisDocument[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const sel of ordered) {
    const fileName = path.basename(sel.fullPath);
    if (importedSet.has(sel.fullPath.toLowerCase())) {
      skipped.push(fileName);
      continue;
    }

    try {
      if (!fs.existsSync(sel.fullPath)) {
        errors.push(`${fileName}: datoteka više ne postoji na disku.`);
        continue;
      }

      const buffer = fs.readFileSync(sel.fullPath);
      const ext = (fileName.split('.').pop() || '').toLowerCase();
      const parsed = await parsePropisBufferLocally(buffer, fileName, sel.uloga);
      const detectedSender =
        sel.posiljatelj ||
        (sel.uloga === 'misljenje'
          ? detectSenderFromText(`${fileName}\n${parsed.rawText.slice(0, 1200)}`).label
          : undefined);
      const statMtime = (() => {
        try {
          return fs.statSync(sel.fullPath).mtime.toISOString().slice(0, 10);
        } catch {
          return undefined;
        }
      })();
      const detectedDate =
        sel.datumVerzije ||
        extractDateFromFileName(fileName) ||
        extractDateFromDocumentText(parsed.rawText) ||
        statMtime;
      const roleMeta = PROPIS_DOC_ROLE_MAP[sel.uloga];

      const doc = await addPropisDocument(projectId, {
        naziv: fileName,
        prikazniNaziv: fileName.replace(/\.[^.]+$/, ''),
        uloga: sel.uloga,
        posiljatelj: detectedSender,
        datumVerzije: detectedDate,
        ekstenzija: ext,
        velicinaBajta: buffer.length,
        izvorDatoteke: 'lokalna_mapa',
        lokalnaPutanja: sel.fullPath,
        izvorTeksta: 'lokalni_parser',
        needsOcr: parsed.needsOcr,
        includeInAiContext: roleMeta.defaultInAiContext && !parsed.needsOcr,
        rawText: parsed.rawText,
        htmlTablesCount: parsed.htmlTablesCount,
        parsedDraft: parsed.parsedDraft,
        excelSheets: parsed.excelSheets,
      });

      imported.push(doc);
      importedSet.add(sel.fullPath.toLowerCase());
    } catch (err: any) {
      errors.push(`${fileName}: ${err?.message || 'Greška pri lokalnom parsiranju.'}`);
    }
  }

  revalidatePath('/izrada-propisa');
  revalidatePath(`/izrada-propisa/${projectId}`);

  return {
    success: true,
    importedCount: imported.length,
    skippedCount: skipped.length,
    imported,
    errors,
  };
}

export async function updatePropisDocumentAction(
  projectId: string,
  docId: string,
  patch: {
    prikazniNaziv?: string;
    uloga?: PropisDocRole;
    posiljatelj?: string;
    datumVerzije?: string;
    includeInAiContext?: boolean;
    rawText?: string;
    biljeska?: string;
  }
) {
  const docs = await listPropisDocuments(projectId);
  const existing = docs.find((d) => d.id === docId);
  if (!existing) return { error: 'Dokument nije pronađen.' };

  const nextRole = patch.uloga ?? existing.uloga;
  const nextText = patch.rawText ?? existing.rawText;
  const textEdited = patch.rawText !== undefined && patch.rawText !== existing.rawText;

  let parsedDraft = existing.parsedDraft;
  if (
    (nextRole === 'aktualni_nacrt' || nextRole === 'prethodna_verzija') &&
    (textEdited || !existing.parsedDraft || patch.uloga !== undefined)
  ) {
    const candidate = parseNormativeDraft(nextText);
    parsedDraft = candidate.clanci.length > 0 || candidate.preambula.length > 0 ? candidate : undefined;
  }

  const updated = await updatePropisDocument(projectId, docId, {
    ...patch,
    parsedDraft,
    izvorTeksta: textEdited ? 'rucno_uredeno' : existing.izvorTeksta,
    needsOcr: textEdited && nextText.trim().length > 50 ? false : existing.needsOcr,
  });

  revalidatePath('/izrada-propisa');
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true, doc: updated };
}

export async function deletePropisDocumentAction(projectId: string, docId: string) {
  const ok = await deletePropisDocument(projectId, docId);
  if (!ok) return { error: 'Dokument nije pronađen.' };
  revalidatePath('/izrada-propisa');
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true };
}

/**
 * Opcionalni RUČNI AI OCR — ako je PDF na disku (lokalno), čita ga izravno; ako nije (Vercel),
 * vraća `needsFileReupload: true` kako bi klijent ponudio odabir PDF-a za in-memory AI OCR.
 */
export async function runManualOcrOnPropisDocAction(projectId: string, docId: string) {
  const docs = await listPropisDocuments(projectId);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return { error: 'Dokument nije pronađen.' };
  if (!doc.lokalnaPutanja || !fs.existsSync(doc.lokalnaPutanja)) {
    return {
      error:
        'Odaberite izvorni PDF s vašeg računala kako bi AI OCR odmah pročitao skenirani tekst.',
      needsFileReupload: true,
    };
  }

  try {
    const buffer = fs.readFileSync(doc.lokalnaPutanja);
    const clean = await runGeminiOcrOnPdfBuffer(buffer, doc.naziv);
    if (!clean) return { error: 'AI OCR nije uspio očitati tekst iz skena.' };

    const parsedDraft =
      doc.uloga === 'aktualni_nacrt' || doc.uloga === 'prethodna_verzija'
        ? parseNormativeDraft(clean)
        : doc.parsedDraft;
    const detectedSender =
      doc.posiljatelj ||
      (doc.uloga === 'misljenje' ? detectSenderFromText(clean.slice(0, 1800)).label : undefined);
    const detectedDate = doc.datumVerzije || extractDateFromDocumentText(clean);

    const updated = await updatePropisDocument(projectId, docId, {
      rawText: clean,
      izvorTeksta: 'rucni_ai_ocr',
      needsOcr: false,
      posiljatelj: detectedSender,
      datumVerzije: detectedDate,
      includeInAiContext: PROPIS_DOC_ROLE_MAP[doc.uloga].defaultInAiContext,
      parsedDraft,
    });

    revalidatePath(`/izrada-propisa/${projectId}`);
    return { success: true, doc: updated };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri AI OCR čitanju dokumenta.' };
  }
}

/**
 * In-memory AI OCR za već učitani skenirani PDF (radi 100% na Vercelu!):
 * korisnik ponovno odabere isti PDF s računala, server ga očita Gemini OCR-om i ažurira dokument u Supabaseu.
 */
export async function runManualOcrFromUploadAction(formData: FormData) {
  const projectId = String(formData.get('projectId') || '').trim();
  const docId = String(formData.get('docId') || '').trim();
  const file = formData.get('file') as File | null;

  if (!projectId || !docId) return { error: 'Nedostaje ID projekta ili dokumenta.' };
  if (!file) return { error: 'Niste odabrali PDF datoteku za AI OCR.' };

  const docs = await listPropisDocuments(projectId);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return { error: 'Dokument nije pronađen.' };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return { error: 'Odabrana PDF datoteka je prazna.' };

    const clean = await runGeminiOcrOnPdfBuffer(buffer, file.name || doc.naziv);
    if (!clean) return { error: 'AI OCR nije uspio očitati tekst iz skena.' };

    const parsedDraft =
      doc.uloga === 'aktualni_nacrt' || doc.uloga === 'prethodna_verzija'
        ? parseNormativeDraft(clean)
        : doc.parsedDraft;
    const detectedSender =
      doc.posiljatelj ||
      (doc.uloga === 'misljenje' ? detectSenderFromText(clean.slice(0, 1800)).label : undefined);
    const detectedDate = doc.datumVerzije || extractDateFromDocumentText(clean);

    const updated = await updatePropisDocument(projectId, docId, {
      rawText: clean,
      izvorTeksta: 'rucni_ai_ocr',
      needsOcr: false,
      posiljatelj: detectedSender,
      datumVerzije: detectedDate,
      includeInAiContext: PROPIS_DOC_ROLE_MAP[doc.uloga].defaultInAiContext,
      parsedDraft,
    });

    revalidatePath(`/izrada-propisa/${projectId}`);
    return { success: true, doc: updated };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri AI OCR čitanju poslane PDF datoteke.' };
  }
}

export async function getPropisChatHistoryAction(projectId: string): Promise<LegalUIMessage[]> {
  return readPropisChatHistory(projectId);
}

export async function savePropisChatHistoryAction(projectId: string, messages: LegalUIMessage[]) {
  try {
    await writePropisChatHistory(projectId, messages);
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || 'Greška pri spremanju razgovora.' };
  }
}

export async function clearPropisChatHistoryAction(projectId: string) {
  await writePropisChatHistory(projectId, []);
  return { success: true };
}

/**
 * Lokalno (0 AI troška) automatski prepoznaje i popunjava nedostajuće datume akata i pošiljatelje
 * iz naziva datoteke i zaglavlja već učitanih dokumenata u projektu.
 */
export async function backfillDocumentMetadataAction(projectId: string) {
  const [project, docs] = await Promise.all([
    getPropisProject(projectId),
    listPropisDocuments(projectId),
  ]);

  // Ako smo lokalno i postoji referentna mapa, izgradi mapu fileName -> mtime kao zadnji fallback
  const localMtimeByName = new Map<string, string>();
  if (!process.env.VERCEL && project?.referentnaMapa && fs.existsSync(project.referentnaMapa)) {
    try {
      const scanned = scanLocalPropisFolder(project.referentnaMapa, new Set());
      for (const s of scanned) {
        const key = s.fileName.toLowerCase();
        if (!localMtimeByName.has(key)) {
          localMtimeByName.set(key, s.modifiedAt.slice(0, 10));
        }
      }
    } catch {
      // Ignore fs errors
    }
  }

  let updatedDates = 0;
  let updatedRoles = 0;
  let updatedSenders = 0;
  const now = new Date().toISOString();

  const nextDocs = docs.map((d) => {
    let nextDate = d.datumVerzije;
    if (!nextDate) {
      const fromName = extractDateFromFileName(d.naziv) || extractDateFromFileName(d.prikazniNaziv);
      const fromText = extractDateFromDocumentText(d.rawText);
      const fromDisk = localMtimeByName.get(d.naziv.toLowerCase());
      const detected = fromName || fromText || fromDisk;
      if (detected) {
        nextDate = detected;
        updatedDates++;
      }
    }

    let nextRole = d.uloga;
    let nextParsedDraft = d.parsedDraft;
    // Ispravi nacrte "Nakon primjedbi TDU i dionika NP Uredbe..." ako su pogrešno upali u "misljenje"
    if (
      d.uloga === 'misljenje' &&
      /nakon\s+primjedbi\s+tdu.*np\s+uredbe/i.test(d.naziv)
    ) {
      nextRole = 'prethodna_verzija';
      const candidate = parseNormativeDraft(d.rawText);
      if (candidate.clanci.length > 0) nextParsedDraft = candidate;
      updatedRoles++;
    }

    let nextSender = d.posiljatelj;
    if (nextRole === 'misljenje' && !nextSender) {
      const s = detectSenderFromText(`${d.naziv}\n${d.rawText.slice(0, 1200)}`).label;
      if (s) {
        nextSender = s;
        updatedSenders++;
      }
    }

    if (
      nextDate !== d.datumVerzije ||
      nextRole !== d.uloga ||
      nextSender !== d.posiljatelj
    ) {
      return {
        ...d,
        datumVerzije: nextDate,
        uloga: nextRole,
        posiljatelj: nextSender,
        parsedDraft: nextParsedDraft,
        updatedAt: now,
      };
    }
    return d;
  });

  if (updatedDates > 0 || updatedRoles > 0 || updatedSenders > 0) {
    await savePropisDocuments(projectId, nextDocs);
    revalidatePath('/izrada-propisa');
    revalidatePath(`/izrada-propisa/${projectId}`);
  }

  return {
    success: true,
    updatedDates,
    updatedRoles,
    updatedSenders,
    docs: nextDocs,
  };
}
