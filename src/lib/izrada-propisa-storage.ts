import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseServer as dbServer } from './supabase-server';
import { supabase as dbClient } from './supabase';
import {
  DEFAULT_UREDBA_NUV_MAPA,
  type PropisProject,
  type PropisProjectSummary,
  type PropisDocument,
  type PropisDocRole,
  type PrimjedbaItem,
  type StressTestReport,
  type DeliverableRecord,
} from './izrada-propisa-types';
import type { LegalUIMessage } from './ai-types';

const BASE_DIR = path.join(process.cwd(), 'data', 'izrada-propisa');
const PROJECTS_FILE = path.join(BASE_DIR, 'projects.json');
const SB_CATEGORY = 'SYSTEM_IZRADA_PROPISA';

function getDb() {
  return dbServer || dbClient;
}

function safeId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '');
}

function projectDir(projectId: string): string {
  return path.join(BASE_DIR, safeId(projectId));
}

function readLocalJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalJsonSafe(filePath: string, data: unknown): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Na Vercelu je filesystem read-only (EROFS) — sigurno ignoriramo jer je primarna pohrana u Supabaseu
  }
}

async function readStore<T>(
  supabaseKey: string,
  localFilePath: string,
  fallback: T
): Promise<T> {
  // 1. Pokušaj pročitati iz Supabase tablice `pravna_praksa` (radi i na Vercelu i lokalno)
  try {
    const db = getDb();
    if (db) {
      const { data, error } = await db
        .from('pravna_praksa')
        .select('sadrzaj')
        .eq('naslov', supabaseKey)
        .maybeSingle();

      if (!error && data?.sadrzaj) {
        const parsed = JSON.parse(data.sadrzaj) as T;
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`Supabase readStore (${supabaseKey}) fallback na lokalno:`, err);
  }

  // 2. Fallback na lokalnu datoteku (npr. lokalni dev bez zapisa u bazi)
  const local = readLocalJsonSafe<T>(localFilePath);
  if (local !== null) {
    return local;
  }

  return fallback;
}

async function writeStore(
  supabaseKey: string,
  localFilePath: string,
  data: unknown
): Promise<void> {
  // 1. Spremi u Supabase (`pravna_praksa`)
  try {
    const db = getDb();
    if (db) {
      const sadrzaj = JSON.stringify(data);
      const { data: existing } = await db
        .from('pravna_praksa')
        .select('id')
        .eq('naslov', supabaseKey)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await db
          .from('pravna_praksa')
          .update({ sadrzaj, kategorija: SB_CATEGORY })
          .eq('id', existing.id);
        if (error) console.error(`Supabase update (${supabaseKey}) greška:`, error.message);
      } else {
        const { error } = await db.from('pravna_praksa').insert({
          naslov: supabaseKey,
          kategorija: SB_CATEGORY,
          sadrzaj,
        });
        if (error) console.error(`Supabase insert (${supabaseKey}) greška:`, error.message);
      }
    }
  } catch (err) {
    console.error(`Supabase writeStore (${supabaseKey}) greška:`, err);
  }

  // 2. Zrcali lokalno ako je filesystem writable (ignorira EROFS na Vercelu)
  writeLocalJsonSafe(localFilePath, data);
}

async function deleteStoreKeys(supabaseKeys: string[], localDirToRemove?: string): Promise<void> {
  try {
    const db = getDb();
    if (db && supabaseKeys.length > 0) {
      await db.from('pravna_praksa').delete().in('naslov', supabaseKeys);
    }
  } catch (err) {
    console.warn('Supabase deleteStoreKeys upozorenje:', err);
  }

  if (localDirToRemove) {
    try {
      if (fs.existsSync(localDirToRemove)) {
        fs.rmSync(localDirToRemove, { recursive: true, force: true });
      }
    } catch {
      // Ignore EROFS on Vercel
    }
  }
}

function buildDefaultUredbaNuvProject(): PropisProject {
  const now = new Date().toISOString();
  return {
    id: 'uredba-nuv-2026',
    naziv: 'Uredba NUV 2026',
    puniNazivAkta: 'Nacrt prijedloga Uredbe o visini naknade za uređenje voda',
    vrstaAkta: 'Uredba',
    maticniPropisi: [
      'Jedinstvena metodološko-nomotehnička pravila za izradu akata koje donosi Hrvatski sabor',
      'Zakon o financiranju vodnoga gospodarstva',
      'Zakon o vodama',
      'Uredba o visini naknade za uređenje voda',
      'Pravilnik o obračunu i naplati naknade za uređenje voda',
      'Zakon o općem upravnom postupku',
      'Zakon o komunalnom gospodarstvu',
    ],
    pravnoPodrucje: 'NUV',
    fazaPostupka: 'Mišljenja TDU / UZZ',
    klasa: '011-02/25-01/3',
    urbroj: '517-05-02-26-',
    strucniNositelj: 'Ministarstvo zaštite okoliša i zelene tranzicije',
    referentnaMapa: DEFAULT_UREDBA_NUV_MAPA,
    opis:
      'Povjerenstvo za izradu Nacrta prijedloga nove Uredbe o visini naknade za uređenje voda (usklađenje tarifa nakon 2006., oslobođenja i olakšice, optimizacija naplate za JLS < 5.000 stanovnika te izvještavanje prema NKD-u i OIB-u).',
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// PROJEKTI
// ============================================================================

export async function listPropisProjects(): Promise<PropisProject[]> {
  const projects = await readStore<PropisProject[]>(
    'IZRADA_PROPISA_PROJECTS',
    PROJECTS_FILE,
    []
  );

  if (!Array.isArray(projects) || projects.length === 0) {
    const seeded = [buildDefaultUredbaNuvProject()];
    await writeStore('IZRADA_PROPISA_PROJECTS', PROJECTS_FILE, seeded);
    return seeded;
  }

  return [...projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getPropisProject(projectId: string): Promise<PropisProject | null> {
  const projects = await listPropisProjects();
  return projects.find((p) => p.id === projectId) || null;
}

export async function savePropisProject(project: PropisProject): Promise<PropisProject> {
  const projects = await listPropisProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  const updated: PropisProject = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) {
    projects[idx] = updated;
  } else {
    projects.unshift(updated);
  }
  await writeStore('IZRADA_PROPISA_PROJECTS', PROJECTS_FILE, projects);
  return updated;
}

export async function createPropisProject(input: {
  naziv: string;
  puniNazivAkta: string;
  vrstaAkta: PropisProject['vrstaAkta'];
  maticniPropisi?: string[];
  pravnoPodrucje?: string;
  fazaPostupka?: PropisProject['fazaPostupka'];
  klasa?: string;
  urbroj?: string;
  strucniNositelj?: string;
  referentnaMapa?: string;
  opis?: string;
}): Promise<PropisProject> {
  const baseSlug = input.naziv
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  const existing = await listPropisProjects();
  let id = baseSlug || `propis-${Date.now()}`;
  if (existing.some((p) => p.id === id)) {
    id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const now = new Date().toISOString();
  const project: PropisProject = {
    id,
    naziv: input.naziv.trim(),
    puniNazivAkta: input.puniNazivAkta.trim() || input.naziv.trim(),
    vrstaAkta: input.vrstaAkta,
    maticniPropisi:
      input.maticniPropisi && input.maticniPropisi.length > 0
        ? input.maticniPropisi
        : ['Zakon o financiranju vodnoga gospodarstva', 'Zakon o vodama'],
    pravnoPodrucje: input.pravnoPodrucje || 'NUV',
    fazaPostupka: input.fazaPostupka || 'Rad Povjerenstva',
    klasa: input.klasa?.trim() || undefined,
    urbroj: input.urbroj?.trim() || undefined,
    strucniNositelj:
      input.strucniNositelj?.trim() || 'Ministarstvo zaštite okoliša i zelene tranzicije',
    referentnaMapa: input.referentnaMapa?.trim() || undefined,
    opis: input.opis?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await savePropisProject(project);
  return project;
}

export async function deletePropisProject(projectId: string): Promise<boolean> {
  const projects = await listPropisProjects();
  const next = projects.filter((p) => p.id !== projectId);
  if (next.length === projects.length) return false;

  await writeStore('IZRADA_PROPISA_PROJECTS', PROJECTS_FILE, next);
  const sid = safeId(projectId);
  await deleteStoreKeys(
    [
      `IZRADA_PROPISA_DOCS_${sid}`,
      `IZRADA_PROPISA_PRIMJEDBE_${sid}`,
      `IZRADA_PROPISA_STRESS_${sid}`,
      `IZRADA_PROPISA_DELIVERABLES_${sid}`,
      `IZRADA_PROPISA_CHAT_${sid}`,
    ],
    projectDir(projectId)
  );
  return true;
}

async function touchProject(projectId: string) {
  const proj = await getPropisProject(projectId);
  if (proj) await savePropisProject(proj);
}

// ============================================================================
// DOKUMENTI PROJEKTA
// ============================================================================

export async function listPropisDocuments(projectId: string): Promise<PropisDocument[]> {
  const sid = safeId(projectId);
  const docs = await readStore<PropisDocument[]>(
    `IZRADA_PROPISA_DOCS_${sid}`,
    path.join(projectDir(projectId), 'documents.json'),
    []
  );
  return [...docs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function savePropisDocuments(projectId: string, docs: PropisDocument[]) {
  const sid = safeId(projectId);
  await writeStore(
    `IZRADA_PROPISA_DOCS_${sid}`,
    path.join(projectDir(projectId), 'documents.json'),
    docs
  );
  await touchProject(projectId);
}

export async function addPropisDocument(
  projectId: string,
  doc: Omit<PropisDocument, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
): Promise<PropisDocument> {
  const docs = await listPropisDocuments(projectId);
  const now = new Date().toISOString();

  if (doc.uloga === 'aktualni_nacrt') {
    for (const d of docs) {
      if (d.uloga === 'aktualni_nacrt') {
        d.uloga = 'prethodna_verzija';
        d.includeInAiContext = false;
        d.updatedAt = now;
      }
    }
  }

  const created: PropisDocument = {
    ...doc,
    id: crypto.randomUUID(),
    projectId,
    createdAt: now,
    updatedAt: now,
  };

  docs.unshift(created);
  await savePropisDocuments(projectId, docs);
  return created;
}

export async function updatePropisDocument(
  projectId: string,
  docId: string,
  patch: Partial<PropisDocument>
): Promise<PropisDocument | null> {
  const docs = await listPropisDocuments(projectId);
  const idx = docs.findIndex((d) => d.id === docId);
  if (idx < 0) return null;

  const now = new Date().toISOString();
  if (patch.uloga === 'aktualni_nacrt') {
    for (const d of docs) {
      if (d.id !== docId && d.uloga === 'aktualni_nacrt') {
        d.uloga = 'prethodna_verzija';
        d.includeInAiContext = false;
        d.updatedAt = now;
      }
    }
  }

  docs[idx] = {
    ...docs[idx],
    ...patch,
    id: docs[idx].id,
    projectId,
    updatedAt: now,
  };
  await savePropisDocuments(projectId, docs);
  return docs[idx];
}

export async function deletePropisDocument(projectId: string, docId: string): Promise<boolean> {
  const docs = await listPropisDocuments(projectId);
  const next = docs.filter((d) => d.id !== docId);
  if (next.length === docs.length) return false;
  await savePropisDocuments(projectId, next);
  return true;
}

// ============================================================================
// PRIMJEDBE (FAZA 2)
// ============================================================================

export async function listPrimjedbe(projectId: string): Promise<PrimjedbaItem[]> {
  const sid = safeId(projectId);
  return readStore<PrimjedbaItem[]>(
    `IZRADA_PROPISA_PRIMJEDBE_${sid}`,
    path.join(projectDir(projectId), 'primjedbe.json'),
    []
  );
}

export async function savePrimjedbe(projectId: string, items: PrimjedbaItem[]) {
  const sid = safeId(projectId);
  await writeStore(
    `IZRADA_PROPISA_PRIMJEDBE_${sid}`,
    path.join(projectDir(projectId), 'primjedbe.json'),
    items
  );
  await touchProject(projectId);
}

// ============================================================================
// STRESS-TEST IZVJEŠĆA (FAZA 3)
// ============================================================================

export async function listStressTests(projectId: string): Promise<StressTestReport[]> {
  const sid = safeId(projectId);
  return readStore<StressTestReport[]>(
    `IZRADA_PROPISA_STRESS_${sid}`,
    path.join(projectDir(projectId), 'stress-tests.json'),
    []
  );
}

export async function saveStressTests(projectId: string, reports: StressTestReport[]) {
  const sid = safeId(projectId);
  await writeStore(
    `IZRADA_PROPISA_STRESS_${sid}`,
    path.join(projectDir(projectId), 'stress-tests.json'),
    reports
  );
  await touchProject(projectId);
}

// ============================================================================
// GENERIRANI AKTI (FAZA 3)
// ============================================================================

export async function listDeliverables(projectId: string): Promise<DeliverableRecord[]> {
  const sid = safeId(projectId);
  return readStore<DeliverableRecord[]>(
    `IZRADA_PROPISA_DELIVERABLES_${sid}`,
    path.join(projectDir(projectId), 'deliverables.json'),
    []
  );
}

export async function saveDeliverables(projectId: string, records: DeliverableRecord[]) {
  const sid = safeId(projectId);
  await writeStore(
    `IZRADA_PROPISA_DELIVERABLES_${sid}`,
    path.join(projectDir(projectId), 'deliverables.json'),
    records
  );
  await touchProject(projectId);
}

// ============================================================================
// POVIJEST AI CHATA PO PROJEKTU (FAZA 1)
// ============================================================================

export async function readPropisChatHistory(projectId: string): Promise<LegalUIMessage[]> {
  const sid = safeId(projectId);
  return readStore<LegalUIMessage[]>(
    `IZRADA_PROPISA_CHAT_${sid}`,
    path.join(projectDir(projectId), 'chat.json'),
    []
  );
}

export async function writePropisChatHistory(projectId: string, messages: LegalUIMessage[]) {
  const sid = safeId(projectId);
  await writeStore(
    `IZRADA_PROPISA_CHAT_${sid}`,
    path.join(projectDir(projectId), 'chat.json'),
    messages
  );
}

// ============================================================================
// SAŽETAK SVIH PROJEKATA ZA POČETNI PREGLED
// ============================================================================

export async function listPropisProjectSummaries(): Promise<PropisProjectSummary[]> {
  const projects = await listPropisProjects();
  return Promise.all(
    projects.map(async (p) => {
      const [docs, primjedbe, stressTests, deliverables] = await Promise.all([
        listPropisDocuments(p.id),
        listPrimjedbe(p.id),
        listStressTests(p.id),
        listDeliverables(p.id),
      ]);

      const roleCounts: Record<PropisDocRole, number> = {
        aktualni_nacrt: 0,
        prethodna_verzija: 0,
        misljenje: 0,
        zapisnik: 0,
        excel_tarife: 0,
        popratni_akt: 0,
      };

      for (const d of docs) {
        roleCounts[d.uloga] = (roleCounts[d.uloga] || 0) + 1;
      }

      return {
        ...p,
        docCount: docs.length,
        roleCounts,
        primjedbeCount: primjedbe.length,
        nerijesenePrimjedbeCount: primjedbe.filter((x) => x.status === 'Na razmatranju').length,
        hasAktualniNacrt: roleCounts.aktualni_nacrt > 0,
        stressTestsCount: stressTests.length,
        deliverablesCount: deliverables.length,
      };
    })
  );
}
