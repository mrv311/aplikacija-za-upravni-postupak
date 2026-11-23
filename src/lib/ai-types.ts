import type { UIMessage } from 'ai';
import { PREDMET_PODRUCJA } from '@/lib/predmet-meta';

export type PraksaFilterScope = 'sve' | 'nuv' | 'vd' | 'sudska' | 'upravna';

export interface PraksaFilterOption {
  value: PraksaFilterScope;
  label: string;
  shortLabel: string;
  description: string;
}

export const PRAKSA_FILTER_OPTIONS: PraksaFilterOption[] = [
  {
    value: 'sve',
    label: 'Cijela baza prakse',
    shortLabel: 'Sve',
    description: 'Pretražuje svu drugostupanjsku i sudsku praksu te propise',
  },
  {
    value: 'nuv',
    label: 'Naknada za uređenje voda (NUV)',
    shortLabel: 'NUV',
    description: 'Samo upravna rješenja i presude za naknadu za uređenje voda',
  },
  {
    value: 'vd',
    label: 'Vodni doprinos (VD)',
    shortLabel: 'VD',
    description: 'Samo upravna rješenja i presude za vodni doprinos',
  },
  {
    value: 'sudska',
    label: 'Samo sudska praksa (Upravni sudovi)',
    shortLabel: 'Sudska praksa',
    description: 'Isključivo presude upravnih sudova i Visokog upravnog suda RH',
  },
  {
    value: 'upravna',
    label: 'Samo upravna praksa (II. stupanj)',
    shortLabel: 'II. stupanj',
    description: 'Isključivo drugostupanjska upravna rješenja',
  },
];

export type ZakonIzvorTip = 'semanticki' | 'citiran_u_pitanju' | 'citiran_u_praksi';

export interface RagZakonSource {
  id: number;
  naziv_zakona: string;
  clanak_broj: string;
  tekst: string;
  similarity?: number;
  izvor: ZakonIzvorTip;
}

export interface ParsedPraksaMeta {
  kratkiNaziv: string;
  podrucje: string;
  vrsta: 'Sudska presuda' | 'Drugostupanjsko rješenje' | 'Odgovor na tužbu' | 'Mišljenje / Naputak';
  godina: string | null;
  ishod: 'Poništeno rješenje' | 'Odbijena žalba' | 'Ostalo';
}

export interface RagPraksaSource extends ParsedPraksaMeta {
  id: number;
  naziv_datoteke: string;
  sadrzaj: string;
  similarity?: number;
  matchedChunksCount?: number;
  matchedKeywords?: string[];
}

export interface RagSourcesPayload {
  zakoni: RagZakonSource[];
  praksa: RagPraksaSource[];
  filterScope: PraksaFilterScope;
  modelName: string;
  extractedKeywords?: string[];
  pinnedPracticeTitles?: string[];
}

export type DraftIshodChoice =
  | 'ai_preporuka'
  | 'odbijanje'
  | 'ponistavanje_vracanje'
  | 'odbacivanje_nepravodobna'
  | 'odbacivanje_nedopustena'
  | 'usvajanje_izmjena';

export interface ChatDraftConfig {
  ishod: DraftIshodChoice;
  uputeSavjetnika?: string;
  citirajCijeluZalbu?: boolean;
  selectedPracticeNames?: string[];
  manualReferenceActs?: Array<{ id: string; title: string; content: string }>;
  customKeywords?: string[];
}

export const DRAFT_ISHOD_OPTIONS: Array<{
  id: DraftIshodChoice;
  title: string;
  shortTitle: string;
  zupClanak: string;
  shortDesc: string;
  uputaZaAi: string;
}> = [
  {
    id: 'ai_preporuka',
    title: 'AI preporuka temeljem spisa i prakse',
    shortTitle: 'AI procjena',
    zupClanak: 'čl. 114. / 116. / 117. ZUP-a',
    shortDesc: 'AI samostalno utvrđuje pravodobnost, dopuštenost i osnovanost žalbe iz spisa i prakse.',
    uputaZaAi:
      'Samostalno na temelju cjelokupnog spisa, dostavnice, žalbe, mjerodavnih propisa i baze prakse utvrdi je li žalba pravodobna i dopuštena te treba li je odbiti kao neosnovanu (čl. 116. st. 1. t. 1. ZUP-a), poništiti prvostupanjsko rješenje i vratiti na ponovni postupak (čl. 117. st. 1. t. 1. i st. 2. ZUP-a) ili odbaciti (čl. 114. ZUP-a).',
  },
  {
    id: 'odbijanje',
    title: 'Odbijanje žalbe kao neosnovane',
    shortTitle: 'Odbijanje žalbe',
    zupClanak: 'čl. 116. st. 1. t. 1. ZUP-a',
    shortDesc: 'Prvostupanjsko rješenje Hrvatskih voda je zakonito, a žalbeni navodi neosnovani.',
    uputaZaAi:
      'Žalba se ODBIJA kao neosnovana temeljem članka 116. stavka 1. točke 1. ZUP-a. Prvostupanjsko rješenje Hrvatskih voda je zakonito i pravilno doneseno, a svaki pojedini žalbeni navod sustavno i argumentirano otkloni pozivom na spis, propise i bazu prakse.',
  },
  {
    id: 'ponistavanje_vracanje',
    title: 'Poništavanje i vraćanje na ponovni postupak',
    shortTitle: 'Poništavanje i vraćanje',
    zupClanak: 'čl. 117. st. 1. t. 1. i st. 2. ZUP-a',
    shortDesc: 'Nepotpuno utvrđeno činjenično stanje ili povreda pravila postupka (čl. 51. ZUP-a).',
    uputaZaAi:
      'Pobijano rješenje Hrvatskih voda se PONIŠTAVA (točka 1. izreke) i predmet se VRAĆA prvostupanjskom tijelu na ponovni postupak (točka 2. izreke) temeljem članka 117. stavka 1. točke 1. i stavka 2. ZUP-a. Jasno obrazloži propuste u utvrđivanju činjeničnog stanja ili povredu čl. 51. ZUP-a te daj konkretne upute što Hrvatske vode u ponovnom postupku moraju utvrditi.',
  },
  {
    id: 'odbacivanje_nepravodobna',
    title: 'Odbacivanje — nepravodobna žalba',
    shortTitle: 'Odbacivanje (rok)',
    zupClanak: 'čl. 114. st. 1. ZUP-a',
    shortDesc: 'Žalba izjavljena nakon proteka zakonskog roka od 15 dana od dostave.',
    uputaZaAi:
      'Žalba se ODBACUJE kao nepravodobna temeljem članka 114. stavka 1. ZUP-a. Precizno navedi datum uredne dostave prvostupanjskog rješenja (prema dostavnici u spisu), zadnji dan zakonskog roka od 15 dana te datum predaje žalbe.',
  },
  {
    id: 'odbacivanje_nedopustena',
    title: 'Odbacivanje — nedopuštena / neovlaštena osoba',
    shortTitle: 'Odbacivanje (ovlast)',
    zupClanak: 'čl. 114. st. 1. ZUP-a',
    shortDesc: 'Nedostatak pravnog interesa, ovlaštenja ili punomoći.',
    uputaZaAi:
      'Žalba se ODBACUJE kao nedopuštena ili izjavljena od neovlaštene osobe temeljem članka 114. stavka 1. ZUP-a. Obrazloži nedostatak pravnog interesa odnosno valjane punomoći.',
  },
  {
    id: 'usvajanje_izmjena',
    title: 'Usvajanje žalbe i izmjena rješenja',
    shortTitle: 'Izmjena rješenja',
    zupClanak: 'čl. 117. st. 1. ZUP-a',
    shortDesc: 'Izmjena pobijanog dijela izravno na temelju nespornih isprava u spisu.',
    uputaZaAi:
      'Žalba se UVAŽAVA i pobijano rješenje se MIJENJA u pobijanom dijelu temeljem članka 117. stavka 1. ZUP-a na temelju nespornih isprava u spisu, bez vraćanja na ponovni postupak.',
  },
];

export type LegalUIMessage = UIMessage<unknown, { sources: RagSourcesPayload }>;

export function parsePraksaMetadata(
  nazivDatoteke: string,
  sampleContent?: string
): ParsedPraksaMeta {
  const contentHead = (sampleContent || '').slice(0, 900);
  const isOdgovorNaTuzbu =
    /O\s*D\s*G\s*O\s*V\s*O\s*R\s+N\s*A\s+T\s*U\s*Ž\s*B\s*U|PREDMET:\s*ODGOVOR NA TUŽBU/i.test(
      contentHead
    );
  const isSudskaNaziv = /upravnih sudova|upravni spor|presud/i.test(nazivDatoteke);
  const isNeupravnoNaziv = /mi[šs]ljenja i naputci|neupravno/i.test(nazivDatoteke);

  let vrsta: ParsedPraksaMeta['vrsta'] = 'Drugostupanjsko rješenje';
  if (isOdgovorNaTuzbu) {
    vrsta = 'Odgovor na tužbu';
  } else if (isSudskaNaziv) {
    vrsta = 'Sudska presuda';
  } else if (isNeupravnoNaziv) {
    vrsta = 'Mišljenje / Naputak';
  }

  const bracketHeader = nazivDatoteke.match(/^\[([^\]]+)\]/)?.[1] || '';

  let podrucje = 'Opći upravni postupak';
  const matchedMeta =
    (bracketHeader
      ? PREDMET_PODRUCJA.find((p) => p.praksaPattern && p.praksaPattern.test(bracketHeader))
      : undefined) ||
    PREDMET_PODRUCJA.find((p) => p.praksaPattern && p.praksaPattern.test(nazivDatoteke));
  if (matchedMeta) {
    podrucje = matchedMeta.praksaCategory;
  } else if (/zaklju[čc]ci/i.test(nazivDatoteke)) {
    podrucje = 'Zaključci (ZUP)';
  } else if (/pru[žz]atelja javnih usluga/i.test(nazivDatoteke)) {
    podrucje = 'Zaštita od postupanja pružatelja javnih usluga';
  } else if (isSudskaNaziv) {
    podrucje = 'Upravni sporovi';
  }

  const yearMatch = nazivDatoteke.match(/\b(20[0-2]\d|199\d)\b/);
  const godina = yearMatch ? yearMatch[1] : null;

  let ishod: ParsedPraksaMeta['ishod'] = 'Ostalo';
  const lower = nazivDatoteke.toLowerCase();
  if (
    lower.includes('poništen') ||
    lower.includes('ponisten') ||
    lower.includes('uvažen') ||
    lower.includes('uvazen')
  ) {
    ishod = 'Poništeno rješenje';
  } else if (
    lower.includes('odbijen') ||
    lower.includes('odbačen') ||
    lower.includes('odbacen')
  ) {
    ishod = 'Odbijena žalba';
  }

  // Očisti uglate zagrade na početku radi preglednijeg prikaza naslova
  const kratkiNaziv =
    nazivDatoteke.replace(/^\[[^\]]+\]\s*/, '').trim() || nazivDatoteke;

  return {
    kratkiNaziv,
    podrucje,
    vrsta,
    godina,
    ishod,
  };
}

export interface QuickActionTemplate {
  id: string;
  label: string;
  shortDesc: string;
  iconName: 'clipboard' | 'clock' | 'scale' | 'pen' | 'shield';
  prompt: string;
  recommendedModel?: 'flash' | 'pro';
}

export const CASE_QUICK_ACTIONS: QuickActionTemplate[] = [
  {
    id: 'revizija-nacrta',
    label: 'Pravna revizija nacrta',
    shortDesc: 'Kontrola odgovora na žalbu, zakonitosti i članaka prije potpisa',
    iconName: 'shield',
    recommendedModel: 'pro',
    prompt:
      'Provedi detaljnu i strogu pravnu reviziju (kontrolu kvalitete) izrađenog nacrta drugostupanjskog rješenja za ovaj predmet prije potpisivanja.\n\n' +
      'Usporedi nacrt rješenja s cjelokupnim spisom (žalbom i prvostupanjskim rješenjem) i sastavi izvješće točno po ovim točkama:\n' +
      '1. ODGOVOR NA SVE ŽALBENE NAVODE: Je li u obrazloženju argumentirano odgovoreno na svaki bitan navod žalitelja? (Upozori ako je ijedan prigovor ostao neobrađen jer to predstavlja bitnu povredu postupka koja vodi do poništenja na Visokom upravnom sudu).\n' +
      '2. ZAKONITOST I MATERIJALNO PRAVO: Jesu li točno navedeni svi mjerodavni zakonski članci (čl. 116. ili 117. ili 114. ZUP-a, odredbe Zakona o financiranju vodnoga gospodarstva, Zakona o vodama ili OPZ-a)?\n' +
      '3. USKLAĐENOST IZREKE I OBRAZLOŽENJA: Je li izreka (dispozitiv) jasna, izvršiva i u potpunosti korespondira s razlozima iznesenim u obrazloženju?\n' +
      '4. UPUTA O PRAVNOM LIJEKU: Je li uputa o pravnom lijeku točna (upravni spor u roku od 30 dana)?\n' +
      '5. ZAKLJUČNA OCJENA I PREPORUKA:\n' +
      '   - 🟢 SPREMNO ZA POTPIS (ako je nacrt kompletan i zakonit)\n' +
      '   - 🟡 POTREBNE KOREKCIJE (navedi konkretne preporuke što točno dopuniti u tekstu).',
  },
  {
    id: 'analiza-spisa',
    label: 'Analiza spisa',
    shortDesc: 'Stranka, pobijani akt, žalbeni razlozi i sporna pitanja',
    iconName: 'clipboard',
    prompt:
      'Napravi strukturiranu pravnu analizu spisa: 1) Osnovni podaci (stranka, pobijano prvostupanjsko rješenje, predmet upravne stvari i iznos/obveza ako je navedena), 2) Kronologija i bitni datumi, 3) Takstativni pregled svih žalbenih navoda žalitelja, 4) Ključna sporna činjenična i materijalnopravna pitanja te 5) Prijedlog smjera odlučivanja uz pozivanje na mjerodavne članke zakona i praksu iz baze.',
  },
  {
    id: 'procesne-pretpostavke',
    label: 'Procesne pretpostavke',
    shortDesc: 'Dopuštenost, pravodobnost, ovlaštena osoba i nadležnost',
    iconName: 'clock',
    prompt:
      'Provjeri procesne pretpostavke za odlučivanje o žalbi prema ZUP-u (čl. 109.–122. ZUP-a): 1) Je li žalba dopuštena, 2) Je li žalba pravodobna (usporedi datum dostave prvostupanjskog rješenja i datum predaje žalbe ako su vidljivi u spisu, odnosno upozori koji podatak o dostavi treba provjeriti u dostavnici), 3) Je li izjavljena od ovlaštene osobe (stranka / punomoćnik), 4) Sadrži li uredne sastojke iz čl. 110. ZUP-a i 5) Postoje li bitne povrede pravila postupka ili ništavost na koje drugostupanjsko tijelo pazi po službenoj dužnosti.',
  },
  {
    id: 'srodna-praksa',
    label: 'Usporedi s praksom',
    shortDesc: 'Stavovi II. stupnja i upravnih sudova za ove žalbene navode',
    iconName: 'scale',
    prompt:
      'Za svaki pojedini žalbeni navod iz ovog spisa pronađi i detaljno usporedi pravna shvaćanja iz naše baze drugostupanjskih rješenja i presuda upravnih sudova. Jasno navedi: (a) koji je žalbeni prigovor stranke, (b) kako je identičan ili srodan prigovor riješen u dostupnoj upravnoj i sudskoj praksi (uz točan naziv akta iz baze), (c) koji članci materijalnog propisa i ZUP-a to potkrjepljuju te (d) je li prigovor osnovan ili neosnovan.',
  },
  {
    id: 'nacrt-rjesenja',
    label: 'Pripremi nacrt rješenja',
    shortDesc: 'U autentičnoj strukturi savjetnika i uz oslonac na bazu prakse',
    iconName: 'pen',
    recommendedModel: 'pro',
    prompt:
      'Sastavi cjelovit nacrt drugostupanjskog rješenja STROGO U MOJOJ VIŠEGODIŠNJOJ AUTENTIČNOJ STRUKTURI I STILU (bez memoranduma na vrhu, bez Markdown podnaslova ### i bez zvjezdica ** u tekstu akta, kako bih ga mogao izravno prenijeti u uredski sustav).\n\n' +
      'Strogo slijedi ovaj redoslijed:\n' +
      '1. UVOD: Ministarstvo zaštite okoliša i zelene tranzicije (OIB: 59951999361), na temelju članka 70. stavka 2. Zakona o financiranju vodnoga gospodarstva..., povodom žalbe podnositelja..., izjavljene protiv rješenja Hrvatskih voda u predmetu obračuna..., donosi\n' +
      '2. R J E Š E N J E (izreka: jedna točka kod odbijanja žalbe ili točke 1. i 2. kod poništavanja i vraćanja na ponovni postupak)\n' +
      '3. O b r a z l o ž e n j e (prirodni tijek odlomaka bez numeriranih podnaslova: 1. sadržaj izreke prvostupanjskog rješenja, 2. dopuštenost i pravodobnost žalbe, 3. „U žalbi žalitelj navodi sljedeće:“ uz doslovno citiranje cjelokupne žalbe u navodnim znakovima u tečnim rečenicama, 4. dostava spisa i mišljenje prvostupanjskog tijela, 5. granice ispitivanja po čl. 115. ZUP-a, 6. mjerodavne odredbe zakona/uredbe i detaljan odgovor na SVAKI žalbeni navod koristeći argumentaciju iz pronađenih odluka u Bazi prakse, 7. završni odlomak po čl. 116. st. 1. t. 1. ili čl. 117. st. 1. i 2. ZUP-a)\n' +
      '4. UPUTA O PRAVNOM LIJEKU (s mjesno nadležnim Upravnim sudom) te potpis SEKTORSKI SAVJETNIK Dino Malbaša, dipl. iur. i blok DOSTAVITI.',
  },
];

export const SAVJETNIK_QUICK_ACTIONS: QuickActionTemplate[] = [
  {
    id: 'savjetnik-zastara',
    label: 'Zastara utvrđivanja i naplate',
    shortDesc: 'Primjena OPZ-a, ZFVG-a i sudske prakse kod zastare',
    iconName: 'clock',
    prompt:
      'Objasni pravila o zastari prava na utvrđivanje i naplatu vodnih naknada (naknada za uređenje voda / vodni doprinos), koji se propis supsidijarno primjenjuje te kakva su shvaćanja u našoj bazi drugostupanjske i sudske prakse kada se stranka u žalbi pozove na zastaru.',
  },
  {
    id: 'savjetnik-ponistavanje',
    label: 'Poništavanje vs. odbijanje žalbe',
    shortDesc: 'Razgraničenje čl. 116. i čl. 117. ZUP-a u praksi',
    iconName: 'scale',
    prompt:
      'Kada drugostupanjsko tijelo odbija žalbu prema čl. 116. ZUP-a (uključujući slučaj kad je izreka zakonita, ali iz drugih razloga nego u obrazloženju), a kada poništava prvostupanjsko rješenje i samo rješava stvar ili vraća prvostupanjskom tijelu prema čl. 117. ZUP-a? Potkrijepi primjerima iz baze prakse.',
  },
  {
    id: 'savjetnik-nuv-obveznik',
    label: 'Obveznik NUV-a i kvadratura',
    shortDesc: 'Najčešći žalbeni razlozi kod naknade za uređenje voda',
    iconName: 'clipboard',
    prompt:
      'Koji su najčešći žalbeni navodi stranaka kod rješenja o naknadi za uređenje voda (pasivna legitimacija / promjena vlasnika, neslaganje s površinom nekretnine, neuseljivost objekta) i kako na njih odgovara naša upravna i sudska praksa?',
  },
  {
    id: 'savjetnik-vd-ozakonjenje',
    label: 'Vodni doprinos — obračun i obujam',
    shortDesc: 'Praksa kod utvrđivanja obujma građevine i ozakonjenja',
    iconName: 'pen',
    prompt:
      'Kako se prema propisima i našoj bazi prakse utvrđuje obujam građevine za obračun vodnog doprinosa te mogu li upravna tijela u postupku obračuna vodnog doprinosa preispitivati pravomoćno rješenje o izvedenom stanju / akt o gradnji?',
  },
];
