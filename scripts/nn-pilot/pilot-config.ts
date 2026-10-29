/**
 * Konfiguracija pilota: 3 propisa. `matchBase` prepoznaje naslov izvornog akta,
 * `matchAmend` naslove izmjena / ispravaka / odluka Ustavnog suda (genitiv naziva).
 */
export interface PilotLaw {
  kratica: string;
  naziv: string;
  nn: string;
  matchBase: RegExp;
  matchAmend: RegExp;
}

export const PILOT_LAWS: PilotLaw[] = [
  {
    kratica: 'ZUP',
    naziv: 'Zakon o općem upravnom postupku',
    nn: 'NN 47/09, 110/21',
    matchBase: /^Zakon o općem upravnom postupku$/i,
    matchAmend: /Zakona o općem upravnom postupku/i,
  },
  {
    kratica: 'ZPNIZ',
    naziv: 'Zakon o postupanju s nezakonito izgrađenim zgradama',
    nn: 'NN 86/12, 143/13, 65/17, 14/19, 48/26',
    matchBase: /^Zakon o postupanju s nezakonito izgrađenim zgradama$/i,
    matchAmend: /Zakona o postupanju s nezakonito izgrađenim zgradama/i,
  },
  {
    kratica: 'OPZ',
    naziv: 'Opći porezni zakon',
    nn: 'NN 115/16, 106/18, 121/19, 32/20, 42/20, 114/22, 152/24, 151/25',
    matchBase: /^Opći porezni zakon$/i,
    matchAmend: /Općeg poreznog zakona/i,
  },
];
