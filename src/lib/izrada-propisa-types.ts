export type PropisDocRole =
  | 'aktualni_nacrt'
  | 'prethodna_verzija'
  | 'misljenje'
  | 'zapisnik'
  | 'excel_tarife'
  | 'popratni_akt';

export type PropisVrstaAkta = 'Uredba' | 'Pravilnik' | 'Zakon' | 'Odluka';

export type PropisFazaPostupka =
  | 'Rad Povjerenstva'
  | 'Mišljenja TDU / UZZ'
  | 'e-Savjetovanje'
  | 'Upućivanje na Vladu RH'
  | 'Doneseno';

export interface PropisDocRoleMeta {
  id: PropisDocRole;
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  defaultInAiContext: boolean;
}

export const PROPIS_DOC_ROLES: PropisDocRoleMeta[] = [
  {
    id: 'aktualni_nacrt',
    label: 'Aktualni nacrt',
    shortLabel: 'Aktualni nacrt',
    description: 'Glavni važeći radni nacrt propisa (automatski raščlanjen po člancima)',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    defaultInAiContext: true,
  },
  {
    id: 'prethodna_verzija',
    label: 'Prethodne verzije',
    shortLabel: 'Prethodna verzija',
    description: 'Ranije verzije nacrta za usporedbu po člancima (Diff)',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    defaultInAiContext: false,
  },
  {
    id: 'misljenje',
    label: 'Mišljenja TDU/UZZ/dionika',
    shortLabel: 'Mišljenje',
    description: 'Službena mišljenja UZZ-a, ministarstava, JLS-a i udruga dionika',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    defaultInAiContext: true,
  },
  {
    id: 'zapisnik',
    label: 'Zapisnici',
    shortLabel: 'Zapisnik',
    description: 'Zapisnici i zaključci sjednica Povjerenstva za izradu propisa',
    badgeClass:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
    defaultInAiContext: false,
  },
  {
    id: 'excel_tarife',
    label: 'Excel tarife',
    shortLabel: 'Excel tarife',
    description: 'Tablice tarifa, financijskih projekcija i usporednih scenarija (.xlsx)',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    defaultInAiContext: true,
  },
  {
    id: 'popratni_akt',
    label: 'Popratni akti',
    shortLabel: 'Popratni akt',
    description: 'Obrazloženja, FactSheet, Podloge, Obrazac PP, PFU, postojeće tablice i dopisi',
    badgeClass:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
    defaultInAiContext: false,
  },
];

export const PROPIS_DOC_ROLE_MAP: Record<PropisDocRole, PropisDocRoleMeta> = Object.fromEntries(
  PROPIS_DOC_ROLES.map((r) => [r.id, r])
) as Record<PropisDocRole, PropisDocRoleMeta>;

export const PROPIS_FAZE_POSTUPKA: PropisFazaPostupka[] = [
  'Rad Povjerenstva',
  'Mišljenja TDU / UZZ',
  'e-Savjetovanje',
  'Upućivanje na Vladu RH',
  'Doneseno',
];

export const PROPIS_VRSTE_AKATA: PropisVrstaAkta[] = ['Uredba', 'Pravilnik', 'Zakon', 'Odluka'];

export interface ParsedArticle {
  key: string; // npr. "1", "2", "3a"
  broj: string; // npr. "1", "2", "3.a"
  oznaka: string; // npr. "Članak 1."
  naslov?: string;
  tekst: string;
  stavciCount: number;
  imaTablicu: boolean;
}

export interface ParsedDraftStructure {
  preambula: string;
  naslovAkta: string;
  clanci: ParsedArticle[];
  potpisniBlok: string;
  obrazlozenje: string;
}

export interface ParsedExcelSheet {
  name: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  previewRows: string[][];
  markdown: string;
}

export interface PropisDocument {
  id: string;
  projectId: string;
  naziv: string;
  prikazniNaziv: string;
  uloga: PropisDocRole;
  posiljatelj?: string;
  datumVerzije?: string;
  ekstenzija: string;
  velicinaBajta: number;
  izvorDatoteke: 'upload' | 'lokalna_mapa';
  lokalnaPutanja?: string;
  izvorTeksta: 'lokalni_parser' | 'rucni_ai_ocr' | 'rucno_uredeno';
  needsOcr?: boolean;
  includeInAiContext: boolean;
  rawText: string;
  htmlTablesCount?: number;
  parsedDraft?: ParsedDraftStructure;
  excelSheets?: ParsedExcelSheet[];
  biljeska?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropisProject {
  id: string;
  naziv: string;
  puniNazivAkta: string;
  vrstaAkta: PropisVrstaAkta;
  maticniPropisi: string[];
  pravnoPodrucje: string;
  fazaPostupka: PropisFazaPostupka;
  klasa?: string;
  urbroj?: string;
  strucniNositelj: string;
  referentnaMapa?: string;
  opis?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropisProjectSummary extends PropisProject {
  docCount: number;
  roleCounts: Record<PropisDocRole, number>;
  primjedbeCount: number;
  nerijesenePrimjedbeCount: number;
  hasAktualniNacrt: boolean;
  stressTestsCount: number;
  deliverablesCount: number;
}

export interface LocalFolderScanEntry {
  relativePath: string;
  fullPath: string;
  fileName: string;
  folderName: string;
  ext: string;
  sizeBytes: number;
  modifiedAt: string;
  suggestedRole: PropisDocRole;
  suggestedSender?: string;
  suggestedDate?: string;
  recommended: boolean;
  alreadyImported: boolean;
}

// ============================================================================
// FAZA 2: TABLICA PRIMJEDBI & DIFF PO ČLANCIMA
// ============================================================================

export type PrimjedbaKategorijaTijela =
  | 'UZZ'
  | 'TDU'
  | 'JLS / Udruge'
  | 'Gospodarstvo / Dionici'
  | 'Ostalo';

export type PrimjedbaStatus =
  | 'Prihvaća se'
  | 'Djelomično se prihvaća'
  | 'Ne prihvaća se'
  | 'Prima se na znanje'
  | 'Na razmatranju';

export const PRIMJEDBA_STATUSI: PrimjedbaStatus[] = [
  'Prihvaća se',
  'Djelomično se prihvaća',
  'Ne prihvaća se',
  'Prima se na znanje',
  'Na razmatranju',
];

export const PRIMJEDBA_KATEGORIJE_TIJELA: PrimjedbaKategorijaTijela[] = [
  'UZZ',
  'TDU',
  'JLS / Udruge',
  'Gospodarstvo / Dionici',
  'Ostalo',
];

export interface PrimjedbaItem {
  id: string;
  tijelo: string;
  kategorijaTijela: PrimjedbaKategorijaTijela;
  clanakOznaka: string;
  tekstPrimjedbe: string;
  status: PrimjedbaStatus;
  obrazlozenje: string;
  predlozenaIzmjena?: string;
  pravnaReferenca?: string;
  izvorniDokumentId?: string;
  izvorniDokumentNaziv?: string;
  izvorUnosa: 'ai_ekstrakcija' | 'lokalni_docx_uvoz' | 'rucno';
  createdAt: string;
  updatedAt: string;
}

export interface DiffToken {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export interface ArticleDiffItem {
  key: string;
  oznaka: string;
  status: 'nepromijenjeno' | 'izmijenjeno' | 'dodano' | 'brisano';
  oldText: string;
  newText: string;
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
  aiObrazlozenje?: string;
}

export interface DiffSummaryResult {
  versionALabel: string;
  versionBLabel: string;
  items: ArticleDiffItem[];
  stats: {
    total: number;
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
  };
}

// ============================================================================
// FAZA 3: STRESS-TEST & GENERATORI SLUŽBENIH AKATA
// ============================================================================

export type StressTestAxis = 'jmnp' | 'zakonitost' | 'sudska_praksa' | 'dosljednost';
export type StressTestSeverity = 'kriticno' | 'upozorenje' | 'preporuka' | 'ok';

export interface StressTestFinding {
  id: string;
  source: 'lokalni' | 'ai';
  axis: StressTestAxis;
  severity: StressTestSeverity;
  clanak: string;
  naslov: string;
  opis: string;
  pravnaOsnovaIliPraksa?: string;
  prijedlogPreformulacije?: string;
}

export interface StressTestReport {
  id: string;
  createdAt: string;
  draftDocId: string;
  draftDocName: string;
  modelName: string;
  ukupnaOcjena: 'Spremno za UZZ' | 'Potrebne manje dorade' | 'Potrebne bitne dorade';
  sazetak: string;
  localFindings: StressTestFinding[];
  aiFindings: StressTestFinding[];
  referencedPraksaTitles: string[];
  referencedZakoni: string[];
}

export type DeliverableType = 'obrazlozenje' | 'factsheet' | 'podloga_kabinet';

export interface FactSheetData {
  strucniNositelj: string;
  nazivAkta: string;
  zakonskaOsnova: string;
  problem: string;
  cilj: string;
  posljedicePozitivne: string;
  posljediceNegativne: string;
  novine: string;
  financijskiUcinci: string;
  otvorenaPitanja: string;
  statusIHodogram: string;
}

export interface DeliverableRecord {
  id: string;
  type: DeliverableType;
  title: string;
  contentMarkdown: string;
  factSheetData?: FactSheetData;
  customInstructions?: string;
  modelName?: string;
  updatedAt: string;
}

export const DEFAULT_UREDBA_NUV_MAPA =
  'C:\\Users\\dmalbasa\\OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije\\P O S A O\\POVJERENSTVA ZA IZRADU PROPISA\\N O V O\\Uredba NUV 2026';

export const PROPIS_AI_QUICK_ACTIONS = [
  {
    id: 'usklađenost-zfvg',
    label: 'Usklađenost s ZFVG i ZOV',
    shortDesc: 'Provjera granica zakonskog ovlaštenja (čl. 17.–20. ZFVG)',
    prompt:
      'Provjeri usklađenost aktualnog nacrta propisa s važećim odredbama Zakona o financiranju vodnoga gospodarstva (osobito čl. 17.–20. ZFVG) i Zakona o vodama. Izlazi li ijedna odredba nacrta izvan zakonskog ovlaštenja za podzakonski propis i postoje li terminološka neslaganja?',
  },
  {
    id: 'rizici-praksa-nuv',
    label: 'Rizici u sudskoj i NUV praksi',
    shortDesc: 'Što kaže Baza prakse (2.202 odluke) o spornim odredbama?',
    prompt:
      'Analiziraj aktualni nacrt kroz prizmu stvarne upravne i sudske prakse iz Baze prakse za naknadu za uređenje voda (NUV). Koje bi odredbe nacrta mogle izazvati masovne žalbe ili poništenja pred upravnim sudovima (npr. ruševnost/zabrana korištenja, poslovni prostor koji nije u upotrebi, izgrađeno zemljište izvan tlocrta, NKD razvrstavanje, prijelazne odredbe)? Potkrijepi konkretnim odlukama iz baze.',
  },
  {
    id: 'usporedba-vazeca-uredba',
    label: 'Usporedba s važećom Uredbom',
    shortDesc: 'Ključne razlike u odnosu na NN 82/10 i 108/13',
    prompt:
      'Napravi jasan stručni pregled svih bitnih promjena koje aktualni nacrt donosi u odnosu na važeću Uredbu o visini naknade za uređenje voda (NN 82/10, 108/13) iz Baze zakona: tarifni razredi, visine naknade, nova oslobođenja i olakšice, obveze JLS-a i prijelazne odredbe.',
  },
  {
    id: 'sazetak-primjedbi-sjednica',
    label: 'Brifing za sjednicu Povjerenstva',
    shortDesc: 'Ključne točke otvorenih mišljenja TDU-a, UZZ-a i dionika',
    prompt:
      'Na temelju uključenih mišljenja TDU-a, UZZ-a, dionika i zapisnika pripremi strukturirani brifing za sjednicu Povjerenstva: 1) ključne sporne točke po člancima, 2) što je obvezno prihvatiti (osobito primjedbe UZZ-a i MFIN-a), 3) gdje preporučuješ odbijanje uz pravnu argumentaciju iz zakona i prakse.',
  },
];
