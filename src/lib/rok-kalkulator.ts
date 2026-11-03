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

export interface ZupRokResult {
  datumDostave: string; // YYYY-MM-DD
  pocetakTijekaRoka: string; // YYYY-MM-DD (čl. 81. st. 1. ZUP)
  brojDana: number;
  nominalniIstekRoka: string; // YYYY-MM-DD
  nominalniDanNaziv: string; // npr. Nedjelja
  pomaknutZbogNeradnogDana: boolean;
  razlogPomaka?: string;
  konacniIstekRoka: string; // YYYY-MM-DD (čl. 81. st. 3. ZUP)
  konacniDanNaziv: string;
  propisNapomena: string;
}

const HR_DANI = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

/**
 * Računa istek roka po Zakonu o općem upravnom postupku (čl. 80., 81. i 82.).
 */
export function calculateZupRok(deliveryDateStr: string, days: number): ZupRokResult {
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

  return {
    datumDostave: formatDateKey(delivery),
    pocetakTijekaRoka: formatDateKey(firstDay),
    brojDana: days,
    nominalniIstekRoka: formatDateKey(nominal),
    nominalniDanNaziv: HR_DANI[nominal.getUTCDay()],
    pomaknutZbogNeradnogDana: shifted,
    razlogPomaka: shiftReason,
    konacniIstekRoka: formatDateKey(finalDate),
    konacniDanNaziv: HR_DANI[finalDate.getUTCDay()],
    propisNapomena: shifted
      ? `Sukladno članku 81. stavku 3. ZUP-a, budući da je nominalni istek padao na ${shiftReason?.toLowerCase()}, rok istječe protekom prvog idućeg radnog dana.`
      : `Zadnji dan roka pada na redovni radni dan (${HR_DANI[nominal.getUTCDay()]}) sukladno čl. 81. ZUP-a.`,
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
    // Čl. 108. OPZ: Zastara počinje teći nakon isteka godine u kojoj je trebalo utvrditi poreznu obvezu.
    // Relativna 3 godine, Apsolutna 6 godina.
    const startYear = year + 1;
    const relativna = new Date(Date.UTC(startYear + 3, 0, 1));
    const apsolutna = new Date(Date.UTC(startYear + 6, 0, 1));

    return {
      datumDospijeca: dospijeceStr,
      tipZastare: 'Upravna / Porezna naknada (OPZ)',
      rokGodina: 3,
      datumZastare: formatDateKey(relativna),
      pravniTemelj: 'Opći porezni zakon (čl. 108. st. 1. i čl. 109.)',
      opis: 'Relativna zastara prava na utvrđivanje i naplatu porezne i upravne obveze (3 godine od isteka godine dospijeća).',
      napomenaApsolutna: `Apsolutna zastara nastupa: ${formatDateKey(apsolutna)} (6 godina od početka tijeka).`,
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
