export interface PropisDef {
  naziv: string;
  kratica: string;
  podrucje:
    | 'Opći upravni propisi'
    | 'Vodno pravo i naknade'
    | 'Gradnja, prostor i ozakonjenje'
    | 'Porezi i pristojbe'
    | 'Građansko, stvarno i zemljišnoknjižno pravo';
  tip: 'Zakon' | 'Uredba' | 'Pravilnik';
  nn: string;
  izvor: 'zakon.hr' | 'lokalno';
  url?: string;
  lokalnaDatoteka?: string;
  opis?: string;
}

export const PROPISI_LIST: PropisDef[] = [
  // 1. OPĆI UPRAVNI PROPISI
  {
    naziv: 'Zakon o općem upravnom postupku',
    kratica: 'ZUP',
    podrucje: 'Opći upravni propisi',
    tip: 'Zakon',
    nn: 'NN 47/09, 110/21',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/65/zakon-o-opcem-upravnom-postupku',
    opis: 'Temeljni zakon kojim se uređuje postupanje javnopravnih tijela u rješavanju upravnih stvari.'
  },
  {
    naziv: 'Zakon o upravnim sporovima',
    kratica: 'ZUS',
    podrucje: 'Opći upravni propisi',
    tip: 'Zakon',
    nn: 'NN 36/24, 39/26',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/101/zakon-o-upravnim-sporovima',
    lokalnaDatoteka: 'ZUS - PROČIŠĆENI - NOVO.pdf',
    opis: 'Zakon o sudskoj zaštiti prava građana i pravnih osoba protiv pojedinačnih odluka upravnih tijela.'
  },
  {
    naziv: 'Uredba o uredskom poslovanju',
    kratica: 'UUP',
    podrucje: 'Opći upravni propisi',
    tip: 'Uredba',
    nn: 'NN 75/21',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/c/podzakonski-propis/49213/nn-75-2021-%282.7.2021.%29%2C-uredba-o-uredskom-poslovanju',
    lokalnaDatoteka: 'Uredba o uredskom poslovanju NN 75_2021.docx',
    opis: 'Pravila evidentiranja, primanja, raspoređivanja i otpreme akata u tijelima državne uprave.'
  },
  {
    naziv: 'Uredba o Tarifi upravnih pristojbi',
    kratica: 'UTUP',
    podrucje: 'Opći upravni propisi',
    tip: 'Uredba',
    nn: 'NN 156/22, 130/25',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/c/podzakonski-propis/55507/nn-156-2022-%2830.12.2022.%29%2C-uredba-o-tarifi-upravnih-pristojbi',
    lokalnaDatoteka: 'Uredba o Tarifi upravnih pristojbi_od 1-9-2021.pdf',
    opis: 'Pristojbene tarife za podneske, rješenja i žalbe u upravnim postupcima.'
  },

  {
    naziv: 'Zakon o sustavu državne uprave',
    kratica: 'ZSDU',
    podrucje: 'Opći upravni propisi',
    tip: 'Zakon',
    nn: 'NN 66/19',
    izvor: 'lokalno',
    opis: 'Ustrojstvo, ovlasti i načela rada tijela državne uprave te upravni i inspekcijski nadzor.'
  },
  {
    naziv: 'Zakon o pravu na pristup informacijama',
    kratica: 'ZPPI',
    podrucje: 'Opći upravni propisi',
    tip: 'Zakon',
    nn: 'NN 25/13, 85/15, 69/22',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/126/zakon-o-pravu-na-pristup-informacijama',
    opis: 'Ostvarivanje prava na pristup informacijama i ponovnu uporabu informacija tijela javne vlasti.'
  },

  // 2. VODNO PRAVO I NAKNADE
  {
    naziv: 'Zakon o vodama',
    kratica: 'ZOV',
    podrucje: 'Vodno pravo i naknade',
    tip: 'Zakon',
    nn: 'NN 66/19, 84/21, 47/23',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/124/zakon-o-vodama',
    opis: 'Uređuje pravni status voda, vodnog dobra i vodnih građevina te upravljanje vodama.'
  },
  {
    naziv: 'Zakon o financiranju vodnoga gospodarstva',
    kratica: 'ZFVG',
    podrucje: 'Vodno pravo i naknade',
    tip: 'Zakon',
    nn: 'NN 153/09, 90/11, 56/13, 154/14, 119/15, 120/16, 127/17, 66/19, 36/24',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/238/zakon-o-financiranju-vodnoga-gospodarstva',
    opis: 'Izvori financiranja vodnoga gospodarstva, vodne naknade, obveznici, osnovice i obračun.'
  },
  {
    naziv: 'Zakon o vodnim uslugama',
    kratica: 'ZVU',
    podrucje: 'Vodno pravo i naknade',
    tip: 'Zakon',
    nn: 'NN 66/19',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/2105/zakon-o-vodnim-uslugama',
    lokalnaDatoteka: 'Zakon--o-vodnim-uslugama.pdf',
    opis: 'Obavljanje javne vodoopskrbe i javne odvodnje te institucionalni okvir pružatelja.'
  },
  {
    naziv: 'Uredba o visini naknade za uređenje voda',
    kratica: 'U-NUV',
    podrucje: 'Vodno pravo i naknade',
    tip: 'Uredba',
    nn: 'NN 82/10, 108/13',
    izvor: 'lokalno',
    lokalnaDatoteka: 'Uredba o visini naknade za uređenje voda - pročišćeni tekst - 82_10 i 108_13.pdf',
    opis: 'Visina, korekcijski koeficijenti i zone za obračun naknade za uređenje voda.'
  },
  {
    naziv: 'Pravilnik o obračunu i naplati naknade za uređenje voda',
    kratica: 'P-NUV',
    podrucje: 'Vodno pravo i naknade',
    tip: 'Pravilnik',
    nn: 'NN 83/10, 126/13',
    izvor: 'lokalno',
    lokalnaDatoteka: 'Pravilnik o obračunu i naplati naknade za uređenje voda - pročišćeni tekst - 83_10 i 126_13.pdf',
    opis: 'Postupak obračuna, dostava podataka iz komunalnih evidencija i naplata NUV-a.'
  },
  {
    naziv: 'Uredba o visini naknade za zaštitu voda',
    kratica: 'U-NZZV',
    podrucje: 'Vodno pravo i naknade',
    tip: 'Uredba',
    nn: 'NN 82/10, 83/12, 151/13, 116/18, 33/24',
    izvor: 'lokalno',
    lokalnaDatoteka: 'Uredba-o-visini-naknade-za-zaštitu-voda.pdf',
    opis: 'Visina naknade za zaštitu voda i korekcijski koeficijenti prema onečišćenju.'
  },

  // 3. GRADNJA, PROSTOR I OZAKONJENJE
  {
    naziv: 'Zakon o gradnji',
    kratica: 'ZG',
    podrucje: 'Gradnja, prostor i ozakonjenje',
    tip: 'Zakon',
    nn: 'NN 155/25',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/690/zakon-o-gradnji',
    opis: 'Projektiranje, građenje, uporaba i održavanje građevina te građevinske dozvole.'
  },
  {
    naziv: 'Zakon o komunalnom gospodarstvu',
    kratica: 'ZKG',
    podrucje: 'Gradnja, prostor i ozakonjenje',
    tip: 'Zakon',
    nn: 'NN 68/18, 110/18, 32/20, 145/24',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/319/zakon-o-komunalnom-gospodarstvu',
    opis: 'Komunalne djelatnosti, komunalna naknada i komunalni doprinos jedinica lokalne samouprave.'
  },
  {
    naziv: 'Zakon o postupanju s nezakonito izgrađenim zgradama',
    kratica: 'ZPNIZ',
    podrucje: 'Gradnja, prostor i ozakonjenje',
    tip: 'Zakon',
    nn: 'NN 86/12, 143/13, 65/17, 14/19, 48/26',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/486/zakon-o-postupanju-s-nezakonito-izgradenim-zgradama',
    opis: 'Uvjeti i postupak ozakonjenja (legalizacije) zgrada te obračun vodnoga doprinosa.'
  },
  {
    naziv: 'Pravilnik o načinu obračuna površine i obujma u projektima zgrada',
    kratica: 'P-POVRŠINA',
    podrucje: 'Gradnja, prostor i ozakonjenje',
    tip: 'Pravilnik',
    nn: 'NN 90/10, 111/10',
    izvor: 'lokalno',
    opis: 'Način izračuna građevinske (bruto) površine, korisne površine i obujma zgrada te koeficijenti za prostore (čl. 9.a).'
  },

  // 4. POREZI I PRISTOJBE
  {
    naziv: 'Opći porezni zakon',
    kratica: 'OPZ',
    podrucje: 'Porezi i pristojbe',
    tip: 'Zakon',
    nn: 'NN 115/16, 106/18, 121/19, 32/20, 42/20, 114/22, 152/24, 151/25',
    izvor: 'zakon.hr',
    url: 'https://www.zakon.hr/z/100/opci-porezni-zakon',
    opis: 'Temeljne odredbe poreznog postupka, zastara prava na utvrđivanje i naplatu te ovrha.'
  },

  // 5. GRAĐANSKO, STVARNO I ZEMLJIŠNOKNJIŽNO PRAVO
  {
    naziv: 'Zakon o zemljišnim knjigama',
    kratica: 'ZZK',
    podrucje: 'Građansko, stvarno i zemljišnoknjižno pravo',
    tip: 'Zakon',
    nn: 'NN 63/19, 128/22',
    izvor: 'lokalno',
    opis: 'Uređenje, vođenje i osnivanje zemljišnih knjiga, upisi, tabularne isprave i elektroničko poslovanje.'
  }
];

export const PROPISI_MAP: Record<string, PropisDef> = Object.fromEntries(
  PROPISI_LIST.map((p) => [p.naziv, p])
);
