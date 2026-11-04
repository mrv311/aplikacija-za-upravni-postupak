/**
 * Autentična višegodišnja struktura, stil i frazeologija drugostupanjskih rješenja
 * sektorskog savjetnika (Dino Malbaša, dipl. iur.) — dijeli se između Generatora nacrta
 * i AI Asistenta u radnom prostoru predmeta kako bi SVAKO generirano rješenje imalo
 * identičan raspored odlomaka, ton i formalne sastavnice.
 */

export function detectCompetentAdministrativeCourt(textOrAddress: string): string {
  const lower = (textOrAddress || '').toLowerCase();

  // Upravni sud u Splitu (Splitsko-dalmatinska, Dubrovačko-neretvanska, Šibensko-kninska, Zadarska)
  if (
    /\b(split|dubrovnik|zadar|šibenik|sibenik|korčul|korcul|makarsk|omiš|omis|trogir|kaštel|kastel|solin|sinj|imotsk|metkovi|ploč|ploc|opuzen|hvar|brač|brac|supetar|vis|knin|vodic|biograd|benkovac|nin|pag|vir|rogoznic|primošten|primosten|orebić|orebic|vela luka|cavtat|konavl)\w*/i.test(
      lower
    )
  ) {
    return 'Upravnom sudu u Splitu';
  }

  // Upravni sud u Rijeci (Primorsko-goranska, Istarska, Karlovačka, Ličko-senjska)
  if (
    /\b(rijek|rijeci|pula|puli|karlovac|karlovcu|gospić|gospic|opatij|crikvenic|novi vinodolsk|krk|cres|lošinj|losinj|rab|delnic|ogulin|duga resa|slunj|ozalj|rovinj|poreč|porec|umag|labin|pazin|buzet|buja|buje|novigrad|senj|otočac|otocac|novalja|plaški|plaski)\w*/i.test(
      lower
    )
  ) {
    return 'Upravnom sudu u Rijeci';
  }

  // Upravni sud u Osijeku (Osječko-baranjska, Vukovarsko-srijemska, Brodsko-posavska, Požeško-slavonska, Virovitičko-podravska)
  if (
    /\b(osijek|slavonski brod|brod\b|vukovar|vinkovc|županj|zupanj|požeg|pozeg|pakrac|pleternic|virovitic|slatin|orahovic|đakov|djakov|našic|nasic|valpov|belišć|belisc|beli manastir|nova gradišk|ilok|otok)\w*/i.test(
      lower
    )
  ) {
    return 'Upravnom sudu u Osijeku';
  }

  // Upravni sud u Zagrebu (Grad Zagreb, Zagrebačka, Krapinsko-zagorska, Varaždinska, Međimurska, Koprivničko-križevačka, Bjelovarsko-bilogorska, Sisačko-moslavačka)
  if (
    /\b(zagreb|velika goric|samobor|zaprešić|zapresic|dugo selo|ivanić|ivanic|jastrebarsk|sveti ivan zelina|krapin|zlatar|zabok|pregrad|klanjec|donja stubic|varaždin|varazdin|ivanec|ludbreg|novi marof|čakovec|cakovec|prelog|mursko središć|koprivnic|križevc|krizevc|đurđevac|djurdjevac|bjelovar|daruvar|čazm|cazm|garešnic|garesnic|sisak|sisku|petrinj|kutin|novsk|glin|hrvatska kostajnic)\w*/i.test(
      lower
    )
  ) {
    return 'Upravnom sudu u Zagrebu';
  }

  return 'nadležnom Upravnom sudu';
}

export function buildAuthenticAdvisorStructurePrompt(opts: {
  citirajCijeluZalbu?: boolean;
  nadlezniSudHint?: string;
  podrucje?: string;
}): string {
  const {
    citirajCijeluZalbu = true,
    nadlezniSudHint = 'nadležnom Upravnom sudu',
    podrucje = 'NUV',
  } = opts;

  const upravnaStvar =
    podrucje === 'VD'
      ? 'obračuna vodnoga doprinosa'
      : podrucje === 'NZZV'
      ? 'obračuna naknade za zaštitu voda'
      : 'obračuna naknade za uređenje voda';

  return `AUTENTIČNA VIŠEGODIŠNJA STRUKTURA I FRAZEOLOGIJA DRUGOSTUPANJSKIH RJEŠENJA OVOG SAVJETNIKA:
Svako drugostupanjsko rješenje MORA strogo pratiti ovu strukturu, redoslijed odlomaka i pravni izričaj (BEZ izmišljenih podnaslova tipa "I. Prikaz pobijanog rješenja", "II. Žalbeni navodi", "III. Ocjena", BEZ Markdown zvjezdica ** i ljestvi ###):

1. UVOD (odmah na početku, bez zaglavlja/memoranduma jer ga generira uredski sustav):
"Ministarstvo zaštite okoliša i zelene tranzicije (OIB: 59951999361), na temelju članka 70. stavka 2. Zakona o financiranju vodnoga gospodarstva („Narodne novine“, broj: 153/09, 90/11, 56/13, 119/15, 120/16, 127/17, 66/19 i 36/24), povodom žalbe podnositelja [puni naziv/ime i prezime žalitelja, adresa (OIB: ...)], izjavljene protiv rješenja Hrvatskih voda u predmetu ${upravnaStvar}, donosi"

2. НАСЛОВ IZREKE I IZREKA:
R J E Š E N J E

- Ako se žalba ODBIJA (jedna točka bez broja 1.):
  "Odbija se žalba podnositelja [Naziv/Ime stranke, adresa], izjavljena protiv rješenja Hrvatskih voda KLASA: [točna klasa I. stupnja], URBROJ: [točan urbroj I. stupnja] od [datum]."

- Ako se prvostupanjsko rješenje PONIŠTAVA I VRAĆA NA PONOVNI POSTUPAK (obavezno u dvije numerirane točke 1. i 2.):
  "1. Poništava se rješenje Hrvatskih voda KLASA: [točna klasa I. stupnja], URBROJ: [točan urbroj I. stupnja] od [datum].
  2. Predmet se vraća prvostupanjskom tijelu na ponovni postupak."

- Ako se žalba ODBACUJE (nepravodobna / nedopuštena / neovlaštena osoba):
  "Odbacuje se žalba podnositelja [Naziv/Ime stranke, adresa], izjavljena protiv rješenja Hrvatskih voda KLASA: [točna klasa], URBROJ: [točan urbroj] od [datum], kao [nepravodobna / nedopuštena / izjavljena od neovlaštene osobe]."

3. НАSLOV OBRAZLOŽENJA I PRIRODNI SLIJED ODLOMAKA:
O b r a z l o ž e n j e

- Odlomak 1 (Sadržaj izreke prvostupanjskog rješenja):
  Kod odbijanja: "Rješenjem prvog stupnja identificiranim u izreci ovog rješenja, obvezniku [Stranka, adresa], utvrđen je [mjesečni iznos naknade za uređenje voda od X EUR, za poslovne/stambene prostorije, površine X m² (Tarifni razred X, visina naknade X EUR/m2/mj.), na adresi ..., s obvezom plaćanja utvrđenog iznosa od (datum) / odnosno za vodni doprinos: utvrđena je obveza plaćanja vodnoga doprinosa za građenje građevine / ozakonjenu zgradu ..., na lokaciji k.č. ... k.o. ..., u ukupnom iznosu od X EUR, s obvezom plaćanja do (datum), prema sljedećim elementima za obračun: ...]."
  Kod poništavanja: započinje s "Rješenjem prvog stupnja identificiranim u točki 1. izreke ovog rješenja, obvezniku..."

- Odlomak 2 (Procesne pretpostavke):
  "Protiv tog rješenja pravodobno je i od ovlaštene osobe izjavljena žalba koja je dopuštena." (Osim ako se žalba odbacuje po čl. 114. ZUP-a — tada odmah utvrditi datum dostave iz dostavnice i razlog nepravodobnosti/nedopuštenosti).

- Odlomak 3 (Navodi žalbe):
${
  citirajCijeluZalbu
    ? `  STALNO PRAVILO SAVJETNIKA — DOSLOVNO CITIRANJE CJELOKUPNE ŽALBE:
  Mora započeti rečenicom:
  "U žalbi žalitelj navodi sljedeće:" (ili "U žalbi žaliteljica navodi sljedeće:")
  a zatim u novom retku pod hrvatskim navodnim znakovima „...“ doslovno, u cijelosti i od riječi do riječi navesti izvorni tekst žalbe u normalnim, povezanim i tečnim rečenicama i odlomcima (NIKADA ne stavljati svaku riječ u zaseban red!).`
    : `  "U žalbi žalitelj u bitnome navodi da [vjerno i detaljno prenijeti sve žalbene razloge i prijedlog žalitelja]."`
}

- Odlomak 4 (Dostava spisa i mišljenje prvostupanjskog tijela):
  "Prvostupanjsko tijelo je, sukladno pravilima o postupanju po žalbi, dopisom KLASA: [ako je u spisu], URBROJ: [ako je u spisu] od [datum] godine, dostavilo spis predmeta s izjavljenom žalbom na rješavanje drugostupanjskom tijelu. U svom mišljenju ocijenilo je žalbu dopuštenom i pravodobnom, ali neosnovanom."

- Odlomak 5 (Granice ispitivanja po čl. 115. ZUP-a):
  "Ovo drugostupanjsko tijelo ispitalo je zakonitost i ocijenilo svrhovitost pobijanog rješenja u granicama zahtjeva iz žalbe, pazeći po službenoj dužnosti na nadležnost i postojanje razloga za oglašivanje rješenja ništavim, sukladno članku 115. Zakona o općem upravnom postupku („Narodne novine“, broj: 47/09 i 110/21), a nakon detaljnog uvida u cjelokupni spis predmeta utvrđeno je da žalba nije osnovana." (odnosno kod poništavanja: "...utvrđeno je da je žalba osnovana.").

- Odlomci 6+ (Pravna analiza, mjerodavno materijalno pravo i odgovor na SVAKI pojedini žalbeni navod):
  * Započni izlaganjem mjerodavnih zakonskih odredbi točnim stilom savjetnika: "Naime, Zakon o financiranju vodnoga gospodarstva u članku ... propisuje da..."
  * Poveži s činjenicama utvrđenim u spisu: "Na temelju uvida u cjelokupni spis predmeta, nesporno je utvrđeno da..."
  * Zatim sustavno otkloni (ili kod poništavanja prihvati) svaki pojedini žalbeni prigovor koristeći prijelaze ovog savjetnika: "Što se tiče žalbenih navoda kojima žalitelj osporava..., valja istaći da...", "Nadalje...", "Prema ocjeni ovoga tijela...", "Slijedom navedenog, okolnost da ... nije od utjecaja na drugačije rješenje ove upravne stvari, budući da...".
  * OBAVEZNO preuzmi pravnu argumentaciju i pozivanje na srodna stajališta upravnih sudova / Visokog upravnog suda RH ako postoje u priloženim oglednim odlukama iz Baze prakse!

- Završni odlomci obrazloženja:
  * Kod ODBIJANJA ŽALBE:
    "Slijedom svega navedenog, kako žalbenim navodima nije dovedena u sumnju zakonitost pobijanog rješenja, to je na temelju članka 116. stavka 1. točke 1. Zakona o općem upravnom postupku, riješeno kao u izreci ovog rješenja."
  * Kod PONIŠTAVANJA I VRAĆANJA NA PONOVNI POSTUPAK (tri kratka završna odlomka):
    1) Uputa prvostupanjskom tijelu: "Stoga se ... nalaže Hrvatskim vodama u ponovnom postupku provesti ispitni postupak u skladu sa člankom 51. stavcima 1. i 2. Zakona o općem upravnom postupku, radi utvrđivanja svih činjenica i okolnosti koje su bitne za razjašnjenje pravog stanja stvari [navesti točno što treba utvrditi], te radi omogućavanja žalitelju izjašnjavanja o istima, a sve to kako bi se donijelo novo, na zakonu utemeljeno rješenje."
    2) Obrazloženje točke 1. izreke: "Slijedom navedenog, budući su žalbeni razlozi ocijenjeni osnovanima, a činjenice odlučne za donošenje zakonitog rješenja nepotpuno utvrđenima, valjalo je na temelju članka 117. stavka 1. točke 1. Zakona o općem upravnom postupku, riješiti kao u točki 1. izreke."
    3) Obrazloženje točke 2. izreke: "S obzirom na prirodu upravne stvari, odnosno budući je za donošenje novog rješenja nužno neposredno rješavanje prvostupanjskog tijela, valjalo je na temelju članka 117. stavka 2. Zakona o općem upravnom postupku, riješiti kao u točki 2. izreke."

4. UPUTA O PRAVNOM LIJEKU:
"UPUTA O PRAVNOM LIJEKU: Protiv ovog rješenja ne može se izjaviti žalba, ali se može pokrenuti upravni spor. Upravni spor pokreće se tužbom u roku od 30 dana od dana dostave rješenja. Tužba se podnosi ${nadlezniSudHint} neposredno u pisanom obliku, usmeno na zapisnik ili se šalje poštom odnosno dostavlja elektronički."

5. POTPIS I DOSTAVNA NAREDBA (na samom dnu):
SEKTORSKI SAVJETNIK
Dino Malbaša, dipl. iur.

DOSTAVITI:
1. Hrvatske vode, VGI za mali sliv [navesti nadležni VGI iz prvostupanjskog rješenja ili "[nadležna VGI]"] - uz cjelokupni spis i dva primjerka rješenja te obvezu dostave rješenja žalitelju;
2. Pismohrana`;
}
