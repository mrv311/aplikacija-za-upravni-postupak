import type { UIMessage } from 'ai';

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
  vrsta: 'Sudska presuda' | 'Drugostupanjsko rješenje';
  godina: string | null;
  ishod: 'Poništeno rješenje' | 'Odbijena žalba' | 'Ostalo';
}

export interface RagPraksaSource extends ParsedPraksaMeta {
  id: number;
  naziv_datoteke: string;
  sadrzaj: string;
  similarity?: number;
  matchedChunksCount?: number;
}

export interface RagSourcesPayload {
  zakoni: RagZakonSource[];
  praksa: RagPraksaSource[];
  filterScope: PraksaFilterScope;
  modelName: string;
}

export type LegalUIMessage = UIMessage<unknown, { sources: RagSourcesPayload }>;

export function parsePraksaMetadata(nazivDatoteke: string): ParsedPraksaMeta {
  const isSudska = /upravnih sudova|upravni spor|presud/i.test(nazivDatoteke);
  const vrsta: ParsedPraksaMeta['vrsta'] = isSudska ? 'Sudska presuda' : 'Drugostupanjsko rješenje';

  let podrucje = 'Opći upravni postupak';
  if (/naknada za ure[đd]enje voda|\bnuv\b/i.test(nazivDatoteke)) {
    podrucje = 'Naknada za uređenje voda';
  } else if (/vodni doprinos|\bvd\b/i.test(nazivDatoteke)) {
    podrucje = 'Vodni doprinos';
  } else if (/za[šs]titu voda|\bnzzv\b/i.test(nazivDatoteke)) {
    podrucje = 'Naknada za zaštitu voda';
  } else if (/kori[šs]tenje voda|\bnzkv\b/i.test(nazivDatoteke)) {
    podrucje = 'Naknada za korištenje voda';
  } else if (isSudska) {
    podrucje = 'Upravni sporovi';
  }

  const yearMatch = nazivDatoteke.match(/\b(20\d{2}|19\d{2})\b/);
  const godina = yearMatch ? yearMatch[1] : null;

  let ishod: ParsedPraksaMeta['ishod'] = 'Ostalo';
  const lower = nazivDatoteke.toLowerCase();
  if (lower.includes('poništen') || lower.includes('ponisten') || lower.includes('uvažen') || lower.includes('uvazen')) {
    ishod = 'Poništeno rješenje';
  } else if (lower.includes('odbijen') || lower.includes('odbačen') || lower.includes('odbacen')) {
    ishod = 'Odbijena žalba';
  }

  // Očisti uglate zagrade na početku radi preglednijeg prikaza naslova
  const kratkiNaziv = nazivDatoteke
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim() || nazivDatoteke;

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
  iconName: 'clipboard' | 'clock' | 'scale' | 'pen';
  prompt: string;
  recommendedModel?: 'flash' | 'pro';
}

export const CASE_QUICK_ACTIONS: QuickActionTemplate[] = [
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
    shortDesc: 'Uvod, izreka, obrazloženje i uputa o pravnom lijeku (čl. 98. ZUP)',
    iconName: 'pen',
    recommendedModel: 'pro',
    prompt:
      'Sastavi cjelovit i formalno pravilan nacrt drugostupanjskog rješenja sukladno čl. 98. i čl. 114.–117. Zakona o općem upravnom postupku (ZUP), spreman za kopiranje u službeni dokument. Nacrt mora sadržavati: 1) UVOD (naziv tijela, propis o nadležnosti, povodom čije žalbe i protiv kojeg prvostupanjskog rješenja se odlučuje), 2) IZREKU / DISPOZITIV (jasna odluka: odbija se žalba / poništava se rješenje / odbacuje se žalba), 3) OBRAZLOŽENJE (kratak sadržaj izreke prvostupanjskog rješenja, bitni žalbeni navodi stranke, utvrđeno činjenično stanje, mjerodavne odredbe materijalnog propisa i ZUP-a, detaljan i argumentiran odgovor na SVAKI žalbeni navod uz oslonac na praksu iz baze), 4) UPUTU O PRAVNOM LIJEKU (protiv drugostupanjskog rješenja žalba nije dopuštena, ali se može pokrenuti upravni spor tužbom nadležnom upravnom sudu u roku od 30 dana od dostave rješenja). Mjesta gdje nedostaju točni brojevi ili datumi označi uglatim zagradama npr. [KLASA/datum].',
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
