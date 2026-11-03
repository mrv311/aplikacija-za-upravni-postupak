/**
 * Kalkulator upravnih i sudskih rokova Republike Hrvatske
 * Usklađen sa:
 * - Zakon o općem upravnom postupku (ZUP, NN 47/09, 110/21) - članci 80., 81. i 82.
 * - Zakon o upravnim sporovima (ZUS, NN 36/24, 39/26) - članak 24.
 * - Zakon o blagdanima, spomendanima i neradnim danima u RH (NN 110/19)
 * - Zakon o obveznim odnosima (ZOO, NN 35/05 ... 155/23) - članci 225.–234.
 * - Opći porezni zakon (OPZ, NN 115/16 ... 151/25) - članak 108.
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Izračunava datum Uskrsa za zadanu godinu (Meeus/Jones/Butcher algoritam za gregorijanski kalendar).
 */
export function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Vraća sve zakonske neradne dane i blagdane u Republici Hrvatskoj za zadanu godinu.
 */
export function getCroatianHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: 'Nova godina' },
    { date: `${year}-01-06`, name: 'Sveta tri kralja (Bogojavljenje)' },
    { date: `${year}-05-01`, name: 'Praznik rada' },
    { date: `${year}-05-30`, name: 'Dan državnosti' },
    { date: `${year}-06-22`, name: 'Dan antifašističke borbe' },
    { date: `${year}-08-05`, name: 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja' },
    { date: `${year}-08-15`, name: 'Velika Gospa' },
    { date: `${year}-11-01`, name: 'Svi sveti' },
    { date: `${year}-11-18`, name: 'Dan sjećanja na žrtve Domovinskog rata i Vukovar i Škabrnju' },
    { date: `${year}-12-25`, name: 'Božić' },
    { date: `${year}-12-26`, name: 'Sveti Stjepan' },
  ];

  // Pomični blagdani
  const easter = getEasterSunday(year);

  // Uskrsni ponedjeljak (Easter + 1 dan)
  const easterMonday = new Date(easter.getTime() + 1 * 24 * 60 * 60 * 1000);
  holidays.push({ date: formatDateKey(easterMonday), name: 'Uskrsni ponedjeljak' });

  // Tijelovo (Easter + 60 dana)
  const corpusChristi = new Date(easter.getTime() + 60 * 24 * 60 * 60 * 1000);
  holidays.push({ date: formatDateKey(corpusChristi), name: 'Tijelovo' });

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Provjerava je li zadani datum neradni dan u RH (subota, nedjelja ili službeni blagdan).
 */
export function isNonWorkingDay(date: Date): { isNonWorking: boolean; reason?: string } {
  const dayOfWeek = date.getUTCDay(); // 0 = nedjelja, 6 = subota
  if (dayOfWeek === 0) return { isNonWorking: true, reason: 'Nedjelja' };
  if (dayOfWeek === 6) return { isNonWorking: true, reason: 'Subota' };

  const key = formatDateKey(date);
  const holidays = getCroatianHolidays(date.getUTCFullYear());
  const match = holidays.find((h) => h.date === key);
  if (match) {
    return { isNonWorking: true, reason: `Blagdan: ${match.name}` };
  }

  return { isNonWorking: false };
}

export type ZupRokTip =
  | 'clanak_121_zalba' // Rok za donošenje rješenja o žalbi (60 dana - čl. 121. st. 1. ZUP)
  | 'zus_odgovor_tuzba_30' // Odgovor na tužbu pred Upravnim sudom - redovni rok (30 dana - čl. 48. st. 2. ZUS)
  | 'zus_odgovor_tuzba_60' // Odgovor na tužbu pred Upravnim sudom - složeni spisi (60 dana - čl. 48. st. 2. ZUS)
  | 'clanak_118_zalba_stranka' // Žalba stranke na rješenje (15 dana - čl. 118. ZUP)
  | 'clanak_101_jednostavni' // Donošenje rješenja u jednostavnim stvarima (30 dana - čl. 101. st. 1. ZUP)
  | 'clanak_101_ispitni' // Donošenje rješenja u ispitnom postupku (60 dana - čl. 101. st. 2. ZUP)
  | 'clanak_113_dostava_spisa' // Dostava žalbe i spisa drugostupanjskom tijelu (8 dana - čl. 113. st. 2. ZUP)
  | 'clanak_122_prigovor' // Prigovor / dopuna (8 dana - čl. 122. i 73. ZUP)
  | 'zus_tuzba' // Tužba Upravnom sudu (30 dana - čl. 24. st. 1. ZUS)
  | 'korisnicki'; // Proizvoljan broj dana

export interface ZupRokPreset {
  id: ZupRokTip;
  naziv: string;
  clanak: string;
  opis: string;
  dana: number;
  highlight?: boolean;
}

export const ZUP_ROK_PRESETS: ZupRokPreset[] = [
  {
    id: 'clanak_121_zalba',
    naziv: 'Rješenje o žalbi (Drugostupanjski postupak)',
    clanak: 'čl. 121. st. 1. ZUP-a',
    opis: 'Najkasnije u roku od 60 dana od dana predaje uredne žalbe. Protekom roka nastupa šutnja drugostupanjskog tijela (čl. 24. st. 3. ZUS-a).',
    dana: 60,
    highlight: true,
  },
  {
    id: 'zus_odgovor_tuzba_30',
    naziv: 'Odgovor na tužbu Upravnom sudu (30 dana)',
    clanak: 'čl. 48. st. 2. ZUS-a',
    opis: 'Zakonski rok koji određuje Upravni sud za podnošenje odgovora na tužbu i dostavu kompletnog spisa predmeta (redovni rok 30 dana).',
    dana: 30,
    highlight: true,
  },
  {
    id: 'zus_odgovor_tuzba_60',
    naziv: 'Odgovor na tužbu Upravnom sudu (60 dana)',
    clanak: 'čl. 48. st. 2. ZUS-a',
    opis: 'Maksimalni zakonski rok koji upravni sud može odrediti prema okolnostima slučaja (opsežan spis, složena stvar — do 60 dana).',
    dana: 60,
    highlight: true,
  },
  {
    id: 'clanak_118_zalba_stranka',
    naziv: 'Žalba stranke na prvostupanjsko rješenje',
    clanak: 'čl. 118. st. 2. ZUP-a',
    opis: '15 dana od dana dostave rješenja stranci, ako zakonom nije propisan dulji rok.',
    dana: 15,
  },
  {
    id: 'zus_tuzba',
    naziv: 'Tužba Upravnom sudu (ZUS)',
    clanak: 'čl. 24. st. 1. ZUS-a',
    opis: '30 dana od dana dostave drugostupanjskog rješenja stranci.',
    dana: 30,
  },
  {
    id: 'clanak_101_jednostavni',
    naziv: 'Prvostupanjsko rješenje (neposredno rješavanje)',
    clanak: 'čl. 101. st. 1. ZUP-a',
    opis: '30 dana od dana podnošenja urednog zahtjeva.',
    dana: 30,
  },
  {
    id: 'clanak_101_ispitni',
    naziv: 'Prvostupanjsko rješenje (ispitni postupak)',
    clanak: 'čl. 101. st. 2. ZUP-a',
    opis: '60 dana od dana podnošenja urednog zahtjeva.',
    dana: 60,
  },
  {
    id: 'clanak_113_dostava_spisa',
    naziv: 'Dostava spisa drugostupanjskom tijelu',
    clanak: 'čl. 113. st. 2. ZUP-a',
    opis: '8 dana od dana primitka žalbe u prvostupanjskom tijelu za prosljeđivanje žalbe sa spisom.',
    dana: 8,
  },
  {
    id: 'clanak_122_prigovor',
    naziv: 'Prigovor / Otklanjanje nedostataka',
    clanak: 'čl. 122. / čl. 73. ZUP-a',
    opis: '8 dana od dana obavijesti / dostave zaključka o dopuni.',
    dana: 8,
  },
];

export interface ZupRokResult {
  datumDostave: string; // YYYY-MM-DD
  pocetakTijekaRoka: string; // YYYY-MM-DD (čl. 81. st. 1. ZUP)
  brojDana: number;
  tipRoka?: ZupRokTip;
  presetNaziv?: string;
  presetClanak?: string;
  nominalniIstekRoka: string; // YYYY-MM-DD
  nominalniDanNaziv: string; // npr. Nedjelja
  pomaknutZbogNeradnogDana: boolean;
  razlogPomaka?: string;
  konacniIstekRoka: string; // YYYY-MM-DD (čl. 81. st. 3. ZUP)
  konacniDanNaziv: string;
  propisNapomena: string;
  posljedicaNapomena?: string;
}

const HR_DANI = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

/**
 * Računa istek roka po Zakonu o općem upravnom postupku (čl. 80., 81. i 82.).
 */
export function calculateZupRok(deliveryDateStr: string, days: number, tipRoka?: ZupRokTip): ZupRokResult {
  const delivery = new Date(`${deliveryDateStr}T00:00:00Z`);

  // Članak 81. stavak 1. ZUP:
  // "Rok koji je određen na dane počinje teći prvog sljedećeg dana nakon dana u kojem je dostavljeno pismeno..."
  const firstDay = new Date(delivery.getTime() + 1 * 24 * 60 * 60 * 1000);

  // Nominalni istek roka: firstDay + (days - 1) dana = delivery + days dana
  const nominal = new Date(delivery.getTime() + days * 24 * 60 * 60 * 1000);

  // Članak 81. stavak 3. ZUP:
  // "Nedjelje, blagdani i neradni dani ne utječu na početak i tijek roka.
  // Ako posljednji dan roka pada u nedjelju, na blagdan ili u drugi dan u koji javnopravno tijelo ne radi,
  // rok istječe protekom prvoga sljedećeg radnog dana."
  let finalDate = new Date(nominal.getTime());
  let shifted = false;
  let shiftReason: string | undefined = undefined;

  while (true) {
    const check = isNonWorkingDay(finalDate);
    if (!check.isNonWorking) break;
    if (!shifted) {
      shifted = true;
      shiftReason = check.reason;
    }
    // Pomakni za 1 dan naprijed
    finalDate = new Date(finalDate.getTime() + 1 * 24 * 60 * 60 * 1000);
  }

  const preset = ZUP_ROK_PRESETS.find((p) => p.id === tipRoka);

  let posljedica: string | undefined = undefined;
  if (tipRoka === 'clanak_121_zalba') {
    posljedica =
      'Sukladno članku 121. stavku 1. ZUP-a, drugostupanjsko rješenje mora se donijeti i otpremiti/dostaviti stranci najkasnije do ovog datuma. Ako tijelo ne donese rješenje, stranka stječe pravo pokrenuti upravni spor pred Upravnim sudom po članku 24. stavku 3. Zakona o upravnim sporovima (šutnja uprave).';
  } else if (tipRoka === 'zus_odgovor_tuzba_30' || tipRoka === 'zus_odgovor_tuzba_60') {
    posljedica =
      'Sukladno članku 48. stavcima 2., 3. i 4. Zakona o upravnim sporovima (ZUS, NN 36/24), tuženik je dužan u roku koji odredi sud podnijeti odgovor na tužbu i dostaviti sve spise koji se odnose na predmet spora u obliku u kojemu su vođeni. Ako tuženik ne dostavi spise predmeta ili izjavi da ih ne može dostaviti, sud može riješiti spor i bez spisa predmeta.';
  } else if (tipRoka === 'zus_tuzba') {
    posljedica =
      'Propuštanjem roka od 30 dana iz članka 24. stavka 1. ZUS-a tužba se odbacuje kao nepravodobna te rješenje stječe svojstvo pravomoćnosti.';
  } else if (tipRoka === 'clanak_118_zalba_stranka') {
    posljedica =
      'Propuštanjem roka od 15 dana iz članka 118. stavka 2. ZUP-a žalba se odbacuje rješenjem kao nepravodobna po članku 114. stavku 1. ZUP-a.';
  }

  return {
    datumDostave: formatDateKey(delivery),
    pocetakTijekaRoka: formatDateKey(firstDay),
    brojDana: days,
    tipRoka,
    presetNaziv: preset?.naziv,
    presetClanak: preset?.clanak,
    nominalniIstekRoka: formatDateKey(nominal),
    nominalniDanNaziv: HR_DANI[nominal.getUTCDay()],
    pomaknutZbogNeradnogDana: shifted,
    razlogPomaka: shiftReason,
    konacniIstekRoka: formatDateKey(finalDate),
    konacniDanNaziv: HR_DANI[finalDate.getUTCDay()],
    propisNapomena: shifted
      ? `Sukladno članku 81. stavku 3. ZUP-a, budući da je nominalni istek padao na ${shiftReason?.toLowerCase()}, rok istječe protekom prvog idućeg radnog dana.`
      : `Zadnji dan roka pada na redovni radni dan (${HR_DANI[nominal.getUTCDay()]}) sukladno čl. 81. ZUP-a.`,
    posljedicaNapomena: posljedica,
  };
}

export interface ZastaraResult {
  datumDospijeca: string;
  tipZastare: string;
  rokGodina: number;
  datumZastare: string;
  pravniTemelj: string;
  opis: string;
  napomenaApsolutna?: string;
}

/**
 * Računa zastaru prava na naplatu / potraživanje prema OPZ-u i ZOO-u.
 */
export function calculateZastara(
  dospijeceStr: string,
  vrsta: 'opz_upravno' | 'zoo_opca' | 'zoo_povremena' | 'zoo_steta'
): ZastaraResult {
  const dospijece = new Date(`${dospijeceStr}T00:00:00Z`);
  const year = dospijece.getUTCFullYear();

  if (vrsta === 'opz_upravno') {
    // Čl. 108. OPZ (NN 115/16 ... 151/25):
    // Novi OPZ je ukinuo relativnu zastaru od 3 godine i uveo jedinstveni rok zastare od 6 godina.
    // Zastara počinje teći istekom godine u kojoj je nastala obveza / postalo izvršno rješenje / dospjela obveza (čl. 108. st. 2. i 4.)
    const startYear = year + 1;
    const zastara6g = new Date(Date.UTC(startYear + 6, 0, 1));

    return {
      datumDospijeca: dospijeceStr,
      tipZastare: 'Porezna i upravna davanja (čl. 108. OPZ — 6 godina)',
      rokGodina: 6,
      datumZastare: formatDateKey(zastara6g),
      pravniTemelj: 'Opći porezni zakon (čl. 108. st. 1., 2. i 4.)',
      opis: 'Sukladno važećem Općem poreznom zakonu, napušten je institut trogodišnje relativne zastare te postoji isključivo jedinstveni rok zastare od 6 godina. Zastara počinje teći istekom godine u kojoj je porezna/upravna obveza dospjela ili rješenje postalo izvršno (od 1. siječnja iduće godine).',
      napomenaApsolutna: 'Novi OPZ poznaje isključivo jedinstveni rok od 6 godina (relativna zastara od 3 god. više ne postoji). Za vrijeme trajanja sudskog spora zastara ne teče (čl. 108. st. 6. OPZ).',
    };
  }

  if (vrsta === 'zoo_povremena') {
    // Čl. 226. ZOO: 3 godine od dospjelosti svakog pojedinog davanja (komunalne naknade, pričuva, najamnina)
    const zastara = new Date(Date.UTC(year + 3, dospijece.getUTCMonth(), dospijece.getUTCDate()));
    return {
      datumDospijeca: dospijeceStr,
      tipZastare: 'Povremene tražbine / Komunalije (ZOO)',
      rokGodina: 3,
      datumZastare: formatDateKey(zastara),
      pravniTemelj: 'Zakon o obveznim odnosima (čl. 226. st. 1.)',
      opis: 'Tražbine povremenih davanja koja dospijevaju godišnje ili u kraćim razmacima zastarijevaju za tri godine od dospjelosti.',
    };
  }

  if (vrsta === 'zoo_steta') {
    // Čl. 230. ZOO: 3 godine subjektivni, 5 godina objektivni
    const zastaraSubj = new Date(Date.UTC(year + 3, dospijece.getUTCMonth(), dospijece.getUTCDate()));
    const zastaraObj = new Date(Date.UTC(year + 5, dospijece.getUTCMonth(), dospijece.getUTCDate()));
    return {
      datumDospijeca: dospijeceStr,
      tipZastare: 'Naknada štete (ZOO)',
      rokGodina: 3,
      datumZastare: formatDateKey(zastaraSubj),
      pravniTemelj: 'Zakon o obveznim odnosima (čl. 230. st. 1. i 2.)',
      opis: 'Subjektivni rok za naknadu štete je 3 godine od saznanja za štetu i počinitelja.',
      napomenaApsolutna: `Objektivni apsolutni rok: ${formatDateKey(zastaraObj)} (5 godina od kad je šteta nastala).`,
    };
  }

  // default: zoo_opca (čl. 225. ZOO - 5 godina)
  const zastaraOpca = new Date(Date.UTC(year + 5, dospijece.getUTCMonth(), dospijece.getUTCDate()));
  return {
    datumDospijeca: dospijeceStr,
    tipZastare: 'Opći zastarni rok (ZOO)',
    rokGodina: 5,
    datumZastare: formatDateKey(zastaraOpca),
    pravniTemelj: 'Zakon o obveznim odnosima (čl. 225.)',
    opis: 'Opći zastarni rok za tražbine za koje zakonom nije određen drugi rok zastare.',
  };
}
