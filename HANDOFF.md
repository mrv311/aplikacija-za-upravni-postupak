# HANDOFF: Stanje projekta i upute za rad

Datum: 03.11.2026. (ažurirano nakon implementacije strukturnih i hijerarhijskih oznaka članaka: Dio, Glava, Poglavlje, Odjeljak, Naslovi)
Grana: `master`
Repozitorij: `https://github.com/mrv311/aplikacija-za-upravni-postupak.git`

---

## 📌 1. Baza upravne i sudske prakse — 1.600 SPISA / 10.887 CHUNKOVA

1. **Uspješno proširena baza svim upravnim područjima i institutima ZUP-a**:
   - **Ukupno dokumenata u bazi**: **1.600 spisa** (povećanje s 1.329 na 1.600 spisa — uvezeno 269 novih meritornih odluka)
   - **Ukupno vektorskih chunkova**: **10.887 chunkova** (svi s `gemini-embedding-001` od 3072 dimenzije)
   - **Duplikati**: **0** (potpuno čista baza; eliminirano točno 32 `pismohrana`/starije verzije putem naprednog bodovanja)

2. **Kompletna raspodjela po kategorijama**:
   - **Sudska praksa**:
     - **Praksa upravnih sudova (presude)**: **528 spisa** (stvarne presude Upravnih sudova ZG, ST, RI, OS i VUSRH)
     - **Praksa upravnih sudova (akti i odgovori)**: **421 spis** (odgovori na tužbe, odgovori na žalbe, akti po presudama)
   - **Upravni postupak (naknade)**:
     - **Vodni doprinos (VD)**: **235 spisa** (2016.–2026.)
     - **Naknada za uređenje voda (NUV)**: **147 spisa** (2016.–2026.)
     - **Naknada za zaštitu voda (NZZV)**: **118 spisa** (2000.–2025.)
     - **Naknada za korištenje voda (NZKV)**: **22 spisa**
     - **Naknada za koncesiju**: **13 spisa**
   - **Posebni upravni instituti & izvanredni pravni lijekovi (ZUP)**:
     - **Poništavanje i ukidanje rješenja (čl. 129.–132. ZUP)**: **31 spis**
     - **Obnova postupka**: **28 spisa**
     - **Zakup javnog vodnog dobra (žalbe/služnosti)**: **26 spisa**
     - **Troškovi postupka**: **19 spisa**
     - **Oglašavanje rješenja ništavim**: **6 spisa**
     - **Rješenja po prigovoru**: **2 spisa**
     - **Zaključci (ZUP)**: **2 spisa**
     - **Zaštita od postupanja pružatelja javnih usluga (čl. 157.–158. ZUP)**: **1 spis**
     - **Akti po presudama Ustavnog suda**: **1 spis**

3. **Napredna detekcija duplikata ("boja vs. pismohrana")**:
   - Skripta `scripts/import-nove-kategorije.ts` automatski prepoznaje parove datoteka (`_boja` i `_pismohrana`).
   - Glavna verzija u boji ima prioritet, a pismohrana se automatski odbacuje kao duplikat.
   - Svi spisi su prošli automatsku GDPR anonimizaciju (`scripts/anonymizer.ts`).

---

## 📌 2. Korisničko sučelje & Radni prostor predmeta

1. **PredmetWorkspace & Fleksibilni radni prostor (`/predmeti/[id]`)**:
   - Omogućeno prebacivanje načina rada: Uravnoteženo (50/50), Fokus na spise, Fokus na AI asistenta.
   - Izračun ZUP rokova (60 dana) s vizualnim statusnim trakama i upozorenjima.
2. **Tema i responzivnost**:
   - Integrirana tamna tema (Dark Mode) s `ThemeProvider` i sprečavanjem hydration treperenja.
   - Sklopivi lijevi izbornik (Sidebar) s podrškom za mobilne ladice.
3. **Status izgradnje (Build status)**:
   - `npx tsc --noEmit` i `npm run build` prolaze **100% uspješno s 0 grešaka**.

---

## 📌 3. Baza propisa RH — Strukturne i hijerarhijske oznake (Dovršena točka 1)

1. **Hijerarhijsko praćenje i kontekst u parseru (`nn-client.ts` & `engine.ts`)**:
   - Parser prepoznaje i pamti kontekst nadnaslova:
     - **Dio**: `DIO PRVI OPĆE ODREDBE`, `DIO DRUGI ZEMLJIŠNE KNJIGE`, `1. OPĆE ODREDBE`...
     - **Glava**: `GLAVA I. SASTAV ZEMLJIŠNE KNJIGE`, `GLAVA II. NADLEŽNOST I SASTAV SUDA`...
     - **Poglavlje**: `POGLAVLJE I. OPĆE ODREDBE`, `POGLAVLJE II. GLAVNA KNJIGA`...
     - **Odjeljak**: `ODJELJAK A SASTAV GLAVNE KNJIGE`, `7.1. GRAĐEVINSKA DOZVOLA`...
     - **Naslov/Podnaslov članka (caption)**: `Predmet i cilj Zakona`, `Elektroničko podnošenje prijedloga`, `Pojmovi`...
   - Svakom članku generira se precizna hijerarhijska staza (*breadcrumbs*), npr. `DIO DRUGI ZEMLJIŠNE KNJIGE › GLAVA I. SASTAV ZEMLJIŠNE KNJIGE › POGLAVLJE II. GLAVNA KNJIGA › ODJELJAK A SASTAV GLAVNE KNJIGE`.
2. **Kataloška struktura (`src/data/propisi-structure.json`)**:
   - Generirano preko 1.600 strukturiranih članaka za 14 ključnih zakona (ZZK, ZUP, ZUS, ZG, ZKG, ZSDU, ZPPI, OPZ, ZOV, ZVU, ZPNIZ, UUP, UTUP, P-POVRŠINA).
   - Sustav automatski obogaćuje prikaz u `/propisi` neovisno o stanju tablice u bazi podataka.
3. **Prikaz u sučelju (`/propisi` & `PropisiTable.tsx`)**:
   - **Vizualni razdjelnici**: Elegantni istaknuti natpisi za svaki novi `DIO` i `GLAVA` pri skrolanju kroz opsežne zakone (umjesto jednolične liste 250 kartica).
   - **Breadcrumbs bedževi**: Iznad svakog članka prikazuje se točna lokacija unutar zakona uz ikonu `FolderOpen`.
   - **Naziv članka**: Istaknut podebljanim fontom uz broj članka (npr. *Članak 186.a Elektroničko podnošenje prijedloga*).
   - **Prirodno sortiranje**: Članci se slažu striktno pravno (1, 2, ..., 186, 186a, 186b, ..., 187).
   - **Puni pravni citat**: Gumb *"Kopiraj"* generira službeni citat s nazivom zakona, člankom, nazivom članka, NN oznakom i hijerarhijskom sekcijom.
   - **Pretraga po strukturi**: Tražilica prepoznaje pojmove iz glava, poglavlja i naslova članaka.
4. **Baza podataka (`supabase/migrations/04_propisi_struktura.sql`)**:
   - Pripremljena migracija za dodavanje stupaca `naslov`, `struktura`, `dio`, `glava`, `poglavlje`, `odjeljak` u tablicu `zakoni` uz pripadajuće indekse.
   - `sync-db.ts` automatski popunjava ove stupce i ima ugrađen fallback ako baza još nije ručno migrirana.

---

## 📌 4. Baza propisa RH — Proširenje stvarnopravnih i građevinskih propisa (Dovršena točka 2)

1. **Zakon o vlasništvu i drugim stvarnim pravima (ZV)**:
   - **Broj članaka**: **399 članaka** (od Članka 1. do Članka 396., uključujući umetnute članke poput 390.a).
   - **Izvor**: Službeni pročišćeni tekst Hrvatskoga sabora (NN 81/15) + službeni Ispravak pročišćenog teksta (NN 94/17 za članke 71. i 73. o etažiranju i potvrdama/uporabnim dozvolama).
   - **Struktura i naslovi**: Svih 399 članaka nosi punu hijerarhijsku stazu (*Dio*, *Glava*, *Poglavlje*, *Odjeljak*) i 384/399 nosi službeni naslov/podnaslov članka (npr. *Stjecanje prava vlasništva*, *Zaštita posjeda*, *Susjedska prava*, *Uspostava etažnog vlasništva*).
   - **Baza & Vektori**: Uspješno generirani vektorski embeddingzi (`gemini-embedding-001`, 3072 dimenzije) i spremljeni u Supabase tablicu `zakoni`.

2. **Pravilnik o jednostavnim i drugim građevinama i radovima (P-JEDNOSTAVNE)**:
   - **Broj članaka**: **12 važećih članaka** (temeljni članci 1.–10. te umetnuti članci 3.a i 5.a).
   - **Konsolidacija**: Temeljni akt NN 112/17 pročišćen kroz svih 6 izmjena i dopuna (NN 34/18, NN 36/19, NN 98/19, NN 31/20, NN 74/22, NN 155/23).
   - **Ključni sadržaj**: Detaljan popis radova i pomoćnih građevina koje se grade bez građevinske dozvole i bez glavnog projekta (čl. 2 i 3), te s glavnim projektom (čl. 4 i 5).
   - **Baza & Vektori**: Uspješno sinkronizirano u Supabase tablicu `zakoni`.

3. **Zemljišnoknjižni poslovnik (ZKP-POSLOVNIK)**:
   - **Broj članaka**: **163 važeća članka**.
   - **Konsolidacija**: Temeljni tekst NN 81/97 integriran s izmjenama NN 109/02 (dodavanje Dijela četvrtog: EOP-zemljišna knjiga, članci 115.–135., te renumeracija završnih odredaba u čl. 136.–163.), NN 123/02 (čl. 43 i pomoćni popisi 68.a–68.e), NN 153/02, NN 14/05 i NN 60/10 (otvaranje i preoblikovanje u BZP, čl. 159.).
   - **Baza & Vektori**: Uspješno sinkronizirano u Supabase tablicu `zakoni`.

4. **Kataloška struktura (`src/data/propisi-structure.json`)**:
   - Povećano na **17 ključnih propisa** i **preko 2.300 strukturiranih članaka** s naslovima, razdjelnicima i breadcrumb stazama.
   - Svi propisi registrirani u `src/lib/propisi-config.ts` po pravnim područjima.

---

## 📌 5. Proširenje građanskog, obveznog i ovršnog prava (ZOO, OZ, ZN)

1. **Zakon o obveznim odnosima (ZOO)**:
   - **Broj članaka**: **1.165 važećih članaka** (od Članka 1. do Članka 1165.).
   - **Struktura i naslovi**: Svih 1.165 članaka s punom hijerarhijom (*Dio*, *Glava*, *Poglavlje*, *Odjeljak*) i 1.137 naslova članaka (ugovori, naknada štete, stjecanje bez osnove, zastara, zatezne kamate).
   - **Vektori & Baza**: Sinkronizirano u Supabase tablicu `zakoni` uz brzi `batchEmbedContents` (25 članaka po seriji).

2. **Ovršni zakon (OZ)**:
   - **Broj članaka**: **371 važeći članak** (od Članka 1. do Članka 371.).
   - **Struktura i naslovi**: 371/371 sa strukturom i 366/371 s naslovima (ovršne isprave, rješenje o ovrsi, pljenidba novčanih sredstava, pravni lijekovi).
   - **Vektori & Baza**: Sinkronizirano u Supabase tablicu `zakoni`.

3. **Zakon o nasljeđivanju (ZN)**:
   - **Broj članaka**: **260 važećih članaka** (od Članka 1. do Članka 260.).
   - **Struktura i naslovi**: 260/260 sa strukturom i 220/260 s naslovima (pravno sljedništvo, odgovornost nasljednika za dugove ostavitelja po čl. 139. ZN, prekid postupka po čl. 55. ZUP).
   - **Vektori & Baza**: Sinkronizirano u Supabase tablicu `zakoni`.

4. **Kataloška struktura (`src/data/propisi-structure.json`)**:
   - Povećano na **20 ključnih propisa** i **preko 4.100 strukturiranih članaka**.

---

## 📌 6. Pravni kalkulatori i izvoz službenih pismena u Word (.docx)

1. **Kalkulator ZUP rokova (`/kalkulatori`)**:
   - **Ključni drugostupanjski rok — članak 121. stavak 1. ZUP-a**:
     - Istaknut na vrhu kao primarni, najvažniji rok za žalbeni postupak (rok od 60 dana za donošenje i dostavu drugostupanjskog rješenja od dana predaje uredne žalbe).
     - Prikaz mjerodavne pravne posljedice proteka roka: pravo stranke na podnošenje tužbe Upravnom sudu zbog šutnje drugostupanjskog tijela sukladno članku 24. stavku 3. Zakona o upravnim sporovima (ZUS).
     - Dinamička prilagodba oznake datuma: *"Datum predaje / zaprimanja uredne žalbe"* u drugostupanjskom modulu vs. *"Datum primitka / dostave pismena stranci"* za ostale rokove.
     - Prilagođena službena zabilješka za spis drugostupanjskog tijela: `SLUŽBENA ZABILJEŠKA O ROKU ZA DONOŠENJE RJEŠENJA O ŽALBI (čl. 121. st. 1. ZUP-a)` spremna za kopiranje jednim klikom.
   - **Katalog ostalih zakonskih rokova**:
     - Žalba stranke na prvostupanjsko rješenje (15 dana, čl. 118. st. 2. ZUP).
     - Tužba Upravnom sudu (30 dana, čl. 24. st. 1. ZUS).
     - Donošenje prvostupanjskog rješenja — neposredno rješavanje (30 dana, čl. 101. st. 1. ZUP).
     - Donošenje prvostupanjskog rješenja — ispitni postupak (60 dana, čl. 101. st. 2. ZUP).
     - Dostava spisa drugostupanjskom tijelu (8 dana, čl. 113. st. 2. ZUP).
     - Prigovor i otklanjanje nedostataka (8 dana, čl. 122. i čl. 73. ZUP).
   - **Pravila računanja (čl. 80.–82. ZUP)**:
     - Početak roka: automatski počinje teći prvog idućeg dana nakon dostave/predaje (čl. 81. st. 1.).
     - Kalendar neradnih dana RH: fiksni državni praznici i Meeus/Jones/Butcher algoritam za pomične blagdane (Uskrs, Uskrsni ponedjeljak, Tijelovo) za bilo koju godinu.
     - Automatski pomak na radni dan: ako zadnji dan roka pada u subotu, nedjelju ili blagdan, rok istječe protekom prvog idućeg radnog dana (čl. 81. st. 3. ZUP-a).

2. **Kalkulator zastare tražbina (`/kalkulatori`)**:
   - Izračun zastare za upravne/porezne naknade (OPZ čl. 108. – relativna 3 god., apsolutna 6 god.).
   - Povremena davanja / komunalne naknade (ZOO čl. 226. – 3 god.).
   - Naknada štete (ZOO čl. 230. – 3 god. subjektivni / 5 god. objektivni rok).
   - Opći zastarni rok (ZOO čl. 225. – 5 god.).

3. **Generator i izvoz službenih pismena u Word (.docx)**:
   - **Stvarni `.docx` izvoz**: Generira formalni dokument pomoću biblioteke `docx` s potpunim memorandumom Republike Hrvatske, Klasifikacijskim oznakama, Uvodom, Dispozitivom/Izrekom, Obrazloženjem, Uputom o pravnom lijeku, potpisnim blokom i dostavnom naredbom.
   - **Dostupnost**:
     - Samostalni alat na ruti `/kalkulatori` s predlošcima (Rješenje o doprinosu, Zaključak o prekidu zbog smrti, Poziv na dopunu).
     - Izravno unutar radnog prostora predmeta (`DraftGeneratorModal.tsx`): gumb **"Preuzmi Word (.docx)"** omogućava službenicima trenutačno preuzimanje bilo kojeg AI-generiranog nacrta u čist `.docx`.

---

## 📌 7. Sljedeći koraci & Backlog

1. **Kalkulator vodnog i komunalnog doprinosa**:
   - Povezivanje unosa tlocrtne površine/obujma (P-POVRŠINA) s jediničnim tarifama jedinica lokalne samouprave i zonama vodnog doprinosa.
2. **Automatsko slanje i urudžbiranje pismena**:
   - Povezivanje generiranih `.docx` rješenja s arhivom predmeta i generiranjem barkodova/QR kodova prema Uredbi o uredskom poslovanju.
