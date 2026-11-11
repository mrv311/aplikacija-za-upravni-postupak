import type { UpravniSpor } from '@/lib/upravni-sporovi';

export interface SporoviReportFilters {
  razdoblje: 'sve' | '2026' | '2025' | '2024' | '2023' | 'custom';
  datumOd?: string;
  datumDo?: string;
  sud: string; // 'Svi' | 'Zagreb' | 'Split' | 'Rijeka' | 'Osijek' | 'VUSRH'
  status: string; // 'Svi' | 'u_tijeku' | 'rijeseno' | 'hitno'
  vrsta: string; // 'Sve' | 'sutnja' | 'redovni'
  troskoviFilter: string; // 'Sve' | 's_troskovima' | 'neplaceno' | 'placeno'
  rjesavatelj: string; // 'Svi' ili specifično ime
  searchQuery: string;
}

export interface SporoviSudStatistika {
  sud: string;
  ukupno: number;
  uTijeku: number;
  rijeseno: number;
  odbijeno: number;
  uvazeno: number;
  obustavljeno: number;
  stopaUspjeha: number;
  ukupnoTroskovaEur: number;
}

export interface SporoviReportMetrics {
  ukupno: number;
  uTijeku: number;
  rijeseno: number;
  stopaRijesenosti: number;
  odgovoreno: number;
  stopaOdgovoreno: number;
  sutnjaUprave: number;
  redovniSporovi: number;
  ishodi: {
    odbijeno: number; // Uspjeh tuženika (Ministarstva)
    uvazeno: number; // Uspjeh tužitelja (poništeno rješenje)
    obustavljeno: number; // Obustava (čl. 24. st. 3. ZUS)
    ostalo: number;
    stopaUspjehaMinistarstva: number; // % odbijeno / (odbijeno + uvaženo)
  };
  financije: {
    ukupnoDosudenoEur: number;
    placenoEur: number;
    neplacenoEur: number;
    brojPredmetaSTroskovima: number;
    brojNeplacenih: number;
    brojPlacenih: number;
    hitniRokovi: Array<{
      spor: UpravniSpor;
      iznosEur: number;
      iznosFormat: string;
      danaDoRoka: number | null;
      rokDatumStr: string;
    }>;
  };
  sudovi: SporoviSudStatistika[];
  predmetiPodrucja: Array<{
    predmet: string;
    ukupno: number;
    uTijeku: number;
    rijeseno: number;
  }>;
  rjesavatelji: Array<{
    rjesavatelj: string;
    ukupno: number;
    uTijeku: number;
    rijeseno: number;
  }>;
}

/**
 * Pretvara bilo koji zapis iznosa (u kunama ili eurima) u numerički iznos u EUR
 */
export function parseAmountToEur(iznosRaw?: string): number {
  if (!iznosRaw) return 0;
  const str = iznosRaw.trim();
  const lower = str.toLowerCase();

  // Izdvoji samo brojčani dio
  const numMatch = str.match(/\d+(?:[.,]\d+)*/);
  if (!numMatch) return 0;

  let clean = numMatch[0];
  // Formatiranje: ako ima i točku i zarez (npr. "1.250,00" ili "2.812,50")
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }

  const val = parseFloat(clean);
  if (isNaN(val)) return 0;

  // Ako je u kunama, preračunaj po fiksnom tečaju 7.53450
  if (lower.includes('kn') || lower.includes('kuna')) {
    return Math.round((val / 7.5345) * 100) / 100;
  }

  return Math.round(val * 100) / 100;
}

/**
 * Pomoćna funkcija za filtriranje sporova
 */
export function filterSporovi(
  sporovi: UpravniSpor[],
  filters: SporoviReportFilters
): UpravniSpor[] {
  return sporovi.filter((spor) => {
    // 1. Pretraga (poslovni broj, tužitelj, OIB, upIi)
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const match =
        (spor.poslovniBroj || '').toLowerCase().includes(q) ||
        (spor.tuzitelj || '').toLowerCase().includes(q) ||
        (spor.oib || '').toLowerCase().includes(q) ||
        (spor.upIiRjesenje || '').toLowerCase().includes(q) ||
        (spor.sud || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    // 2. Nadležni sud
    if (filters.sud && filters.sud !== 'Svi') {
      const sudLower = (spor.sud || '').toLowerCase();
      const targetLower = filters.sud.toLowerCase();
      if (!sudLower.includes(targetLower)) return false;
    }

    // 3. Razdoblje / Godina
    if (filters.razdoblje !== 'sve') {
      const datumRef = spor.tuzbaPreuzeta || spor.datumZapPresude || '';
      if (filters.razdoblje === 'custom') {
        if (filters.datumOd && datumRef < filters.datumOd) return false;
        if (filters.datumDo && datumRef > filters.datumDo) return false;
      } else {
        // Godina: npr. '2026', '2025', '2024'
        const yr = filters.razdoblje;
        const matchesYear =
          datumRef.includes(yr) ||
          (spor.poslovniBroj || '').includes(`/${yr}`) ||
          (spor.poslovniBroj || '').includes(`-${yr}`) ||
          (spor.upIiRjesenje || '').includes(`/${yr.slice(-2)}-`);
        if (!matchesYear) return false;
      }
    }

    // 4. Status spora
    if (filters.status === 'u_tijeku') {
      if (spor.isPresudeno || spor.presudaTroskovi) return false;
    } else if (filters.status === 'rijeseno') {
      if (!spor.isPresudeno && !spor.presudaTroskovi) return false;
    } else if (filters.status === 'hitno') {
      if (spor.hitnost !== 'isteklo' && spor.hitnost !== 'danas' && spor.hitnost !== 'kriticno' && spor.hitnost !== 'hitno') {
        return false;
      }
    }

    // 5. Vrsta spora
    if (filters.vrsta === 'sutnja') {
      if (!spor.isSutnjaUprave && !(spor.predmet || '').toLowerCase().includes('šutnja')) {
        return false;
      }
    } else if (filters.vrsta === 'redovni') {
      if (spor.isSutnjaUprave || (spor.predmet || '').toLowerCase().includes('šutnja')) {
        return false;
      }
    }

    // 6. Troškovi filter
    if (filters.troskoviFilter === 's_troskovima') {
      if (!spor.troskoviInfo?.imaTroskova) return false;
    } else if (filters.troskoviFilter === 'neplaceno') {
      if (!spor.troskoviInfo?.imaTroskova || spor.troskoviInfo.status !== 'neplaceno') {
        return false;
      }
    } else if (filters.troskoviFilter === 'placeno') {
      if (
        !spor.troskoviInfo?.imaTroskova ||
        (spor.troskoviInfo.status !== 'poslan_nalog' &&
          spor.troskoviInfo.status !== 'placeno' &&
          spor.troskoviInfo.bojaOznake !== 'smedje')
      ) {
        return false;
      }
    }

    // 7. Rješavatelj
    if (filters.rjesavatelj && filters.rjesavatelj !== 'Svi') {
      if (!(spor.rjesavatelj || '').toLowerCase().includes(filters.rjesavatelj.toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Računa sve statističke metrike, financije i razdiobu za zadani skup sporova
 */
export function calculateSporoviReportMetrics(sporovi: UpravniSpor[]): SporoviReportMetrics {
  const ukupno = sporovi.length;
  let uTijeku = 0;
  let rijeseno = 0;
  let odgovoreno = 0;
  let sutnjaUprave = 0;
  let redovniSporovi = 0;

  // Ishodi
  let odbijeno = 0;
  let uvazeno = 0;
  let obustavljeno = 0;
  let ostaloIshod = 0;

  // Financije
  let ukupnoDosudenoEur = 0;
  let placenoEur = 0;
  let neplacenoEur = 0;
  let brojPredmetaSTroskovima = 0;
  let brojNeplacenih = 0;
  let brojPlacenih = 0;
  const hitniRokoviList: SporoviReportMetrics['financije']['hitniRokovi'] = [];

  // Mape za grupiranje
  const sudoviMap = new Map<
    string,
    {
      ukupno: number;
      uTijeku: number;
      rijeseno: number;
      odbijeno: number;
      uvazeno: number;
      obustavljeno: number;
      troskoviEur: number;
    }
  >();

  const predmetiMap = new Map<string, { ukupno: number; uTijeku: number; rijeseno: number }>();
  const rjesavateljiMap = new Map<string, { ukupno: number; uTijeku: number; rijeseno: number }>();

  // Inicijaliziraj poznate sudove
  const knownSudovi = [
    'Upravni sud u Zagrebu',
    'Upravni sud u Splitu',
    'Upravni sud u Rijeci',
    'Upravni sud u Osijeku',
    'Visoki upravni sud RH',
  ];
  for (const s of knownSudovi) {
    sudoviMap.set(s, {
      ukupno: 0,
      uTijeku: 0,
      rijeseno: 0,
      odbijeno: 0,
      uvazeno: 0,
      obustavljeno: 0,
      troskoviEur: 0,
    });
  }

  for (const spor of sporovi) {
    // Presuda / rješenje
    const isCompleted = Boolean(
      spor.isPresudeno ||
        (spor.presudaTroskovi && spor.presudaTroskovi.trim() !== '') ||
        spor.fazaOpis === 'Pravomoćno' ||
        spor.fazaOpis === 'Presuđeno'
    );

    if (isCompleted) {
      rijeseno++;
    } else {
      uTijeku++;
    }

    // Odgovor na tužbu
    if (spor.isOdgovoreno || (spor.odgovorNaTuzbu && spor.odgovorNaTuzbu.trim() !== '')) {
      odgovoreno++;
    }

    // Vrsta spora
    if (spor.isSutnjaUprave || (spor.predmet && spor.predmet.toLowerCase().includes('šutnja'))) {
      sutnjaUprave++;
    } else {
      redovniSporovi++;
    }

    // Ishod odluke
    const presudaText = (spor.presudaTroskovi || '').toLowerCase();
    if (isCompleted) {
      if (
        presudaText.includes('odbij') ||
        presudaText.includes('odbac') ||
        presudaText.includes('potvrđ') ||
        presudaText.includes('potvrd')
      ) {
        odbijeno++;
      } else if (
        presudaText.includes('uvaž') ||
        presudaText.includes('uvaz') ||
        presudaText.includes('poništ') ||
        presudaText.includes('ponist') ||
        presudaText.includes('usvojen')
      ) {
        uvazeno++;
      } else if (presudaText.includes('obustav') || presudaText.includes('povuč')) {
        obustavljeno++;
      } else {
        ostaloIshod++;
      }
    }

    // Financije i troškovi
    let iznosEurZaPredmet = 0;
    if (spor.troskoviInfo && spor.troskoviInfo.imaTroskova) {
      brojPredmetaSTroskovima++;
      iznosEurZaPredmet = parseAmountToEur(spor.troskoviInfo.iznos);
      ukupnoDosudenoEur += iznosEurZaPredmet;

      const isPaid =
        spor.troskoviInfo.status === 'poslan_nalog' ||
        spor.troskoviInfo.status === 'placeno' ||
        spor.troskoviInfo.bojaOznake === 'smedje';

      if (isPaid) {
        brojPlacenih++;
        placenoEur += iznosEurZaPredmet;
      } else {
        brojNeplacenih++;
        neplacenoEur += iznosEurZaPredmet;

        // Provjeri hitnost paricijskog roka
        if (
          spor.troskoviInfo.danaDoRoka !== null &&
          spor.troskoviInfo.danaDoRoka !== undefined
        ) {
          hitniRokoviList.push({
            spor,
            iznosEur: iznosEurZaPredmet,
            iznosFormat: spor.troskoviInfo.iznos || `${iznosEurZaPredmet} €`,
            danaDoRoka: spor.troskoviInfo.danaDoRoka,
            rokDatumStr: spor.troskoviInfo.rokPlacanja || 'Hitno',
          });
        }
      }
    }

    // Grupiranje po sudu
    const rawSud = spor.sud || 'Ostalo';
    let normalizedSud = 'Ostalo';
    if (rawSud.toLowerCase().includes('zagreb')) normalizedSud = 'Upravni sud u Zagrebu';
    else if (rawSud.toLowerCase().includes('split')) normalizedSud = 'Upravni sud u Splitu';
    else if (rawSud.toLowerCase().includes('rijek')) normalizedSud = 'Upravni sud u Rijeci';
    else if (rawSud.toLowerCase().includes('osijek')) normalizedSud = 'Upravni sud u Osijeku';
    else if (rawSud.toLowerCase().includes('visoki') || rawSud.toLowerCase().includes('vus'))
      normalizedSud = 'Visoki upravni sud RH';

    if (!sudoviMap.has(normalizedSud)) {
      sudoviMap.set(normalizedSud, {
        ukupno: 0,
        uTijeku: 0,
        rijeseno: 0,
        odbijeno: 0,
        uvazeno: 0,
        obustavljeno: 0,
        troskoviEur: 0,
      });
    }
    const sudStat = sudoviMap.get(normalizedSud)!;
    sudStat.ukupno++;
    if (isCompleted) sudStat.rijeseno++;
    else sudStat.uTijeku++;
    if (presudaText.includes('odbij') || presudaText.includes('potvrd')) sudStat.odbijeno++;
    else if (presudaText.includes('uvaž') || presudaText.includes('poništ')) sudStat.uvazeno++;
    else if (presudaText.includes('obustav')) sudStat.obustavljeno++;
    sudStat.troskoviEur += iznosEurZaPredmet;

    // Grupiranje po predmetu
    const rawPredmet = (spor.predmet || 'Ostalo').trim().toUpperCase();
    const predmetKey = rawPredmet.includes('NUV')
      ? 'NUV (Naknada za uređenje voda)'
      : rawPredmet.includes('VODNI') || rawPredmet.includes('VD')
      ? 'Vodni doprinos'
      : rawPredmet.includes('OZAKONJ')
      ? 'Ozakonjenje'
      : rawPredmet.includes('ŠUTNJ')
      ? 'Šutnja uprave'
      : rawPredmet || 'Ostalo';

    if (!predmetiMap.has(predmetKey)) {
      predmetiMap.set(predmetKey, { ukupno: 0, uTijeku: 0, rijeseno: 0 });
    }
    const pStat = predmetiMap.get(predmetKey)!;
    pStat.ukupno++;
    if (isCompleted) pStat.rijeseno++;
    else pStat.uTijeku++;

    // Grupiranje po rješavatelju
    const rjesavateljKey = (spor.rjesavatelj || 'Neodređeno').trim();
    if (!rjesavateljiMap.has(rjesavateljKey)) {
      rjesavateljiMap.set(rjesavateljKey, { ukupno: 0, uTijeku: 0, rijeseno: 0 });
    }
    const rStat = rjesavateljiMap.get(rjesavateljKey)!;
    rStat.ukupno++;
    if (isCompleted) rStat.rijeseno++;
    else rStat.uTijeku++;
  }

  // Sortiraj hitne rokove tako da najhitniji (ili istekli) budu na vrhu
  hitniRokoviList.sort((a, b) => (a.danaDoRoka ?? 999) - (b.danaDoRoka ?? 999));

  // Izračun stopa
  const stopaRijesenosti = ukupno > 0 ? Math.round((rijeseno / ukupno) * 100) : 0;
  const stopaOdgovoreno = ukupno > 0 ? Math.round((odgovoreno / ukupno) * 100) : 0;
  const rijeseniSPoznatimIshodom = odbijeno + uvazeno + obustavljeno;
  const stopaUspjehaMinistarstva =
    rijeseniSPoznatimIshodom > 0
      ? Math.round(((odbijeno + obustavljeno) / rijeseniSPoznatimIshodom) * 100)
      : 0;

  // Formatiranje sudova u niz
  const sudoviList: SporoviSudStatistika[] = Array.from(sudoviMap.entries())
    .map(([sud, s]) => {
      const sp = s.odbijeno + s.uvazeno + s.obustavljeno;
      return {
        sud,
        ukupno: s.ukupno,
        uTijeku: s.uTijeku,
        rijeseno: s.rijeseno,
        odbijeno: s.odbijeno,
        uvazeno: s.uvazeno,
        obustavljeno: s.obustavljeno,
        stopaUspjeha: sp > 0 ? Math.round(((s.odbijeno + s.obustavljeno) / sp) * 100) : 0,
        ukupnoTroskovaEur: Math.round(s.troskoviEur * 100) / 100,
      };
    })
    .sort((a, b) => b.ukupno - a.ukupno);

  const predmetiList = Array.from(predmetiMap.entries())
    .map(([predmet, p]) => ({
      predmet,
      ukupno: p.ukupno,
      uTijeku: p.uTijeku,
      rijeseno: p.rijeseno,
    }))
    .sort((a, b) => b.ukupno - a.ukupno);

  const rjesavateljiList = Array.from(rjesavateljiMap.entries())
    .map(([rjesavatelj, r]) => ({
      rjesavatelj,
      ukupno: r.ukupno,
      uTijeku: r.uTijeku,
      rijeseno: r.rijeseno,
    }))
    .sort((a, b) => b.ukupno - a.ukupno);

  return {
    ukupno,
    uTijeku,
    rijeseno,
    stopaRijesenosti,
    odgovoreno,
    stopaOdgovoreno,
    sutnjaUprave,
    redovniSporovi,
    ishodi: {
      odbijeno,
      uvazeno,
      obustavljeno,
      ostalo: ostaloIshod,
      stopaUspjehaMinistarstva,
    },
    financije: {
      ukupnoDosudenoEur: Math.round(ukupnoDosudenoEur * 100) / 100,
      placenoEur: Math.round(placenoEur * 100) / 100,
      neplacenoEur: Math.round(neplacenoEur * 100) / 100,
      brojPredmetaSTroskovima,
      brojNeplacenih,
      brojPlacenih,
      hitniRokovi: hitniRokoviList,
    },
    sudovi: sudoviList,
    predmetiPodrucja: predmetiList,
    rjesavatelji: rjesavateljiList,
  };
}

/**
 * Izvoz filtriranih sporova u CSV format
 */
export function exportSporoviReportToCsv(
  sporovi: UpravniSpor[],
  metrics: SporoviReportMetrics
): string {
  const headers = [
    'Rbr',
    'Poslovni broj',
    'Sud',
    'Tužitelj',
    'OIB',
    'Predmet',
    'Pobijani akt',
    'Datum tužbe',
    'Rok suda',
    'Odgovor na tužbu',
    'Presuda / Ishod',
    'Datum presude',
    'Dosuđeni troškovi',
    'Status troškova',
    'Rješavatelj',
  ];

  const rows = sporovi.map((s, idx) => [
    idx + 1,
    `"${(s.poslovniBroj || '').replace(/"/g, '""')}"`,
    `"${(s.sud || '').replace(/"/g, '""')}"`,
    `"${(s.tuzitelj || '').replace(/"/g, '""')}"`,
    `"${(s.oib || '').replace(/"/g, '""')}"`,
    `"${(s.predmet || '').replace(/"/g, '""')}"`,
    `"${(s.upIiRjesenje || '').replace(/"/g, '""')}"`,
    s.tuzbaPreuzeta || '',
    s.rokDatum || '',
    `"${(s.odgovorNaTuzbu || '').replace(/"/g, '""')}"`,
    `"${(s.presudaTroskovi || '').replace(/"/g, '""')}"`,
    s.datumZapPresude || '',
    `"${(s.troskoviInfo?.iznos || '').replace(/"/g, '""')}"`,
    s.troskoviInfo?.status === 'placeno' || s.troskoviInfo?.status === 'poslan_nalog'
      ? 'Plaćeno'
      : s.troskoviInfo?.imaTroskova
      ? 'Neplaćeno'
      : 'Bez troškova',
    `"${(s.rjesavatelj || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent =
    '\uFEFF' + // UTF-8 BOM za Excel
    [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

  return csvContent;
}
