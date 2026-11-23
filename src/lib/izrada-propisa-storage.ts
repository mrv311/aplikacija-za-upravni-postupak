import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function projectDir(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(BASE_DIR, safeId);
}

function buildDefaultUredbaNuvProject(): PropisProject {
  const now = new Date().toISOString();
  return {
    id: 'uredba-nuv-2026',
    naziv: 'Uredba NUV 2026',
    puniNazivAkta: 'Nacrt prijedloga Uredbe o visini naknade za uređenje voda',
    vrstaAkta: 'Uredba',
    maticniPropisi: [
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

export function listPropisProjects(): PropisProject[] {
  ensureDir(BASE_DIR);
  if (!fs.existsSync(PROJECTS_FILE)) {
    const seeded = [buildDefaultUredbaNuvProject()];
    writeJsonSafe(PROJECTS_FILE, seeded);
    return seeded;
  }
  const projects = readJsonSafe<PropisProject[]>(PROJECTS_FILE, []);
  if (projects.length === 0) {
    const seeded = [buildDefaultUredbaNuvProject()];
    writeJsonSafe(PROJECTS_FILE, seeded);
    return seeded;
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPropisProject(projectId: string): PropisProject | null {
  const projects = listPropisProjects();
  return projects.find((p) => p.id === projectId) || null;
}

export function savePropisProject(project: PropisProject): PropisProject {
  const projects = listPropisProjects();
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
  writeJsonSafe(PROJECTS_FILE, projects);
  return updated;
}

export function createPropisProject(input: {
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
}): PropisProject {
  const baseSlug = input.naziv
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  const existing = listPropisProjects();
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

  savePropisProject(project);
  return project;
}

export function deletePropisProject(projectId: string): boolean {
  const projects = listPropisProjects();
  const next = projects.filter((p) => p.id !== projectId);
  if (next.length === projects.length) return false;
  writeJsonSafe(PROJECTS_FILE, next);
  const dir = projectDir(projectId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

function touchProject(projectId: string) {
  const proj = getPropisProject(projectId);
  if (proj) savePropisProject(proj);
}

// ============================================================================
// DOKUMENTI PROJEKTA
// ============================================================================

export function listPropisDocuments(projectId: string): PropisDocument[] {
  const file = path.join(projectDir(projectId), 'documents.json');
  const docs = readJsonSafe<PropisDocument[]>(file, []);
  return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function savePropisDocuments(projectId: string, docs: PropisDocument[]) {
  const file = path.join(projectDir(projectId), 'documents.json');
  writeJsonSafe(file, docs);
  touchProject(projectId);
}

export function addPropisDocument(
  projectId: string,
  doc: Omit<PropisDocument, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
): PropisDocument {
  const docs = listPropisDocuments(projectId);
  const now = new Date().toISOString();

  // Ako se dodaje novi "aktualni_nacrt", prethodni aktualni automatski prelazi u "prethodna_verzija"
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
  savePropisDocuments(projectId, docs);
  return created;
}

export function updatePropisDocument(
  projectId: string,
  docId: string,
  patch: Partial<PropisDocument>
): PropisDocument | null {
  const docs = listPropisDocuments(projectId);
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
  savePropisDocuments(projectId, docs);
  return docs[idx];
}

export function deletePropisDocument(projectId: string, docId: string): boolean {
  const docs = listPropisDocuments(projectId);
  const next = docs.filter((d) => d.id !== docId);
  if (next.length === docs.length) return false;
  savePropisDocuments(projectId, next);
  return true;
}

// ============================================================================
// PRIMJEDBE (FAZA 2)
// ============================================================================

export function listPrimjedbe(projectId: string): PrimjedbaItem[] {
  const file = path.join(projectDir(projectId), 'primjedbe.json');
  return readJsonSafe<PrimjedbaItem[]>(file, []);
}

export function savePrimjedbe(projectId: string, items: PrimjedbaItem[]) {
  const file = path.join(projectDir(projectId), 'primjedbe.json');
  writeJsonSafe(file, items);
  touchProject(projectId);
}

// ============================================================================
// STRESS-TEST IZVJEŠĆA (FAZA 3)
// ============================================================================

export function listStressTests(projectId: string): StressTestReport[] {
  const file = path.join(projectDir(projectId), 'stress-tests.json');
  return readJsonSafe<StressTestReport[]>(file, []);
}

export function saveStressTests(projectId: string, reports: StressTestReport[]) {
  const file = path.join(projectDir(projectId), 'stress-tests.json');
  writeJsonSafe(file, reports);
  touchProject(projectId);
}

// ============================================================================
// GENERIRANI AKTI: OBRAZLOŽENJE, FACTSHEET, PODLOGA (FAZA 3)
// ============================================================================

export function listDeliverables(projectId: string): DeliverableRecord[] {
  const file = path.join(projectDir(projectId), 'deliverables.json');
  return readJsonSafe<DeliverableRecord[]>(file, []);
}

export function saveDeliverables(projectId: string, records: DeliverableRecord[]) {
  const file = path.join(projectDir(projectId), 'deliverables.json');
  writeJsonSafe(file, records);
  touchProject(projectId);
}

// ============================================================================
// POVIJEST AI CHATA PO PROJEKTU (FAZA 1)
// ============================================================================

export function readPropisChatHistory(projectId: string): LegalUIMessage[] {
  const file = path.join(projectDir(projectId), 'chat.json');
  return readJsonSafe<LegalUIMessage[]>(file, []);
}

export function writePropisChatHistory(projectId: string, messages: LegalUIMessage[]) {
  const file = path.join(projectDir(projectId), 'chat.json');
  writeJsonSafe(file, messages);
}

// ============================================================================
// SAŽETAK SVIH PROJEKATA ZA POČETNI PREGLED
// ============================================================================

export function listPropisProjectSummaries(): PropisProjectSummary[] {
  const projects = listPropisProjects();
  return projects.map((p) => {
    const docs = listPropisDocuments(p.id);
    const primjedbe = listPrimjedbe(p.id);
    const stressTests = listStressTests(p.id);
    const deliverables = listDeliverables(p.id);

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
  });
}
