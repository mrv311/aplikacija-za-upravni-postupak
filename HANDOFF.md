# HANDOFF: Stanje projekta i upute za rad

Datum: 30.10.2026. (ažurirano nakon uvođenja područja Građansko, stvarno i zemljišnoknjižno pravo i ZZK-a)
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
   - Skripta [`scripts/import-nove-kategorije.ts`](file:///c:/Users/dinom/Documents/vibe%20coding/aplikacija-za-upravni-postupak/scripts/import-nove-kategorije.ts) automatski prepoznaje parove datoteka (`_boja` i `_pismohrana`).
   - Glavna verzija u boji ima prioritet, a pismohrana se automatski odbacuje kao duplikat.
   - Ako postoji samo pismohrana, ona se zadržava kako se ne bi izgubila praksa.
   - Svi spisi su prošli automatsku GDPR anonimizaciju (`scripts/anonymizer.ts`) — fizičke i privatne pravne osobe zaštićene, a meritum netaknut.

4. **Korisne naredbe**:
   - Provjera stanja baze prakse:
     ```bash
     npx tsx scripts/check-praksa-db.ts
     ```
   - Provjera propisa / zakona u bazi:
     ```bash
     npx tsx scripts/check-propisi-db.ts
     ```
   - Ponovni ili selektivni uvoz kategorija:
     ```bash
     npx tsx scripts/import-nove-kategorije.ts [opcionalni-filter]
     ```

---

## 📌 2. Korisničko sučelje & Radni prostor predmeta

1. **PredmetWorkspace & Fleksibilni radni prostor (`/predmeti/[id]`)**:
   - Omogućeno prebacivanje načina rada:
     - **Uravnoteženo** (50/50 pregled spisa i AI panel)
     - **Fokus na spise** (prošireni preglednik dokumenata s thumbnail navigacijom)
     - **Fokus na AI asistenta** (prošireni AI savjetnik za generiranje nacrta i pravnu analizu)
   - Ugrađen točan izračun ZUP rokova (60 dana) s vizualnim statusnim trakama i upozorenjima.

2. **Tema i responzivnost**:
   - Integrirana **tamna tema (Dark Mode)** (`ThemeProvider`) s trajnim stanjem u `localStorage` i sprečavanjem hydration treperenja (`ThemeInitScript`).
   - Sklopivi lijevi izbornik (Sidebar) s podrškom za mobilne uređaje i ladicu (drawer).
   - Prilagođene tablice predmeta i arhive (`PredmetiTable`) s filtriranjem po statusu i hitnosti.

3. **Status izgradnje (Build status)**:
   - `npx tsc --noEmit` prolazi **100% uspješno s 0 grešaka**.

---

## 📌 3. Faza 1: AI Pravna revizija, vođeni tijek akta i baza prakse

1. **AI pravna revizija dovršenog akta (`LegalReviewModal`)**:
   - Omogućava savjetniku unos teksta (Ctrl+V) ili učitavanje datoteke (.docx, .doc, .pdf) dovršenog rješenja izrađenog izvan aplikacije.
   - AI savjetnik (`gemini-3.1-pro-preview`) provodi dubinsku kontrolu kvalitete:
     1. Odgovor na sve žalbene navode ([OBRAĐENO] vs [PROPUŠTENO])
     2. Zakonitost i materijalno pravo (članci ZUP-a, Zakon o vodama, OPZ)
     3. Usklađenost izreke (dispozitiva) i obrazloženja
     4. Završna ocjena i preporuka
   - Brze akcije izravno iz modala:
     - **"Dodaj u praksu"** (s pregledom i potvrdom GDPR anonimizacije u hodu)
     - **"Spremi u spis"** (kao novu verziju ili konačni akt)
     - **"Pošalji na potpis"** (prelazak u fazu "Na potpisu")

2. **Vođeni tijek akta (Workflow)**:
   - Statusi predmeta: `Novo` $\rightarrow$ `U radu` $\rightarrow$ `Na potpisu` $\rightarrow$ `Arhiviran (A/A)`.
   - Pri arhiviranju nudi se automatska provjera i objava rješenja u bazu prakse (`SmartArhivirajModal`).

---

## 📌 4. Faza 2: Modul Izvještaji i Analitika (`/izvjestaji`)

1. **Izvršni kontrolni panel (KPI Dashboard)**:
   - Prikaz ključnih pokazatelja: ukupno zaprimljeno, riješeno i arhivirano (% dovršenosti), otvoreno u radu, predmeti na potpisu.
   - Praćenje **zakonskog roka po ZUP-u (60 dana - čl. 121.)**: postotak riješenih unutar roka, popis i broj prekoračenih predmeta.
   - Prosječno trajanje rješavanja predmeta u danima.

2. **Grafička analitika i trendovi**:
   - **Struktura odluka (Ishodi)**: Odbijene žalbe (čl. 116. ZUP), Poništena rješenja (čl. 117. ZUP), Odbačene žalbe (čl. 114. ZUP), Obustave.
   - **Upravna područja i postupci**: Pregled po područjima (NUV, VD, NZZV, Ostalo) uz **dinamičku podršku za sve nove postupke dodane u hodu**.
   - **Mjesečna dinamika rješavanja**: Usporedni prikaz zaprimljenih vs. riješenih predmeta po mjesecima.

3. **Službeni izvozi i AI asistent**:
   - **Izvoz u Excel (CSV)**: Prilagođen za hrvatski Excel (točka-zarez, UTF-8 BOM, č, ć, ž, š, đ).
   - **Službeni ispis / Spremi PDF**: Memorandumska stranica za print sa zaglavljem tijela i potpisnim blokom.
   - **AI Narativni sažetak**: Jednim klikom generira analitičko tekstualno izvješće za voditelja / Ministarstvo spremno za kopiranje u Word.

---

## 📌 5. Baza propisa RH — Službena Narodne novine konsolidacija & Viševerzijska arhitektura

1. **Strategija punjenja baze (Zašto Narodne novine, a ne Zakon.hr / Informator.hr)**:
   - **Zakon.hr**: Uvjeti korištenja izričito zabranjuju automatizirano i masovno preuzimanje podataka (čl. 6. i 11. ToS). Scraperi su neprecizni i stvaraju duplicirane članke (npr. brisanje sufiksa kod članaka `37a`–`37l`).
   - **Informator.hr**: Komercijalni pretplatnički paywall bez javnog API-ja.
   - **Narodne novine (NN)**: Jedini službeni, javni i pravno obvezujući izvor u Republici Hrvatskoj. Pružaju europski zakonodavni identifikator (**ELI** metadata) i direktni pristup čistom HTML-u svih akata.

2. **Automatski redaktorski engine (`scripts/nn-pilot/engine.ts`)**:
   - Razvijen je modularni engine koji koristi model `gemini-3.8-flash` za precizno pročišćavanje zakona.
   - **Prirodno sortiranje**: Članci se slažu strogo pravnim redoslijedom (`1`, `2`, ..., `9`, `9a`, `9b`, `10`, ..., `37`, `37a`, `38`).
   - **Inteligentno raščlanjivanje izmjena (`parseAmendmentArticles`)**: Razlikuje stvarne operativne izmjene od prijelaznih odredbi o stupanju na snagu.
   - **Stabilno serijsko procesiranje**: Izmjene se obrađuju u kontroliranim serijama po 6 članaka, s ugrađenom eksponencijalnom pauzom na 429 rate limit.

3. **Uspješno konsolidirani i u bazu uneseni zakoni (Opća uprava, Gradnja, Porezi, Stvarno pravo & pilot)**:
   - **ZZK (Zakon o zemljišnim knjigama)**: Temeljni akt NN 63/19 + izmjena NN 128/22 → **252 važeća članka** (uključujući čl. `186a`–`186i`, `233a`, brisan čl. 223).
   - **ZUP (Zakon o općem upravnom postupku)**: Temeljni akt NN 47/09 + izmjena NN 110/21 → **171 važećih članaka**.
   - **ZUS (Zakon o upravnim sporovima)**: Novi službeni akt NN 36/24 → **172 važećih članaka**.
   - **ZSDU (Zakon o sustavu državne uprave)**: Temeljni akt NN 66/19 → **71 važećih članaka**.
   - **UUP (Uredba o uredskom poslovanju)**: Službeni akt NN 75/21 → **69 važećih članaka**.
   - **UTUP (Uredba o Tarifi upravnih pristojbi)**: Službeni akt NN 156/22 → **49 važećih članaka**.
   - **ZPPI (Zakon o pravu na pristup informacijama)**: Temeljni NN 25/13 + NN 85/15 + NN 69/22 → **77 važećih članaka** (umetnuti novi članci `9a`, `10a`, `25a`, `28a`, `38a`).
   - **ZPNIZ (Zakon o postupanju s nezakonito izgrađenim zgradama)**: Temeljni akt NN 86/12 + 4 izmjene → **59 važećih članaka**.
   - **ZG (Zakon o gradnji)**: Temeljni akt NN 153/13 + NN 20/17 + NN 39/19 + NN 125/19 → **217 važećih članaka** (umetnuti članci `19a`, `21a`–`21d`, `22a`–`22e`, `46a`–`47d`, obrisani čl. 32 i 62).
   - **ZKG (Zakon o komunalnom gospodarstvu)**: Temeljni akt NN 68/18 + USRH NN 110/18 + NN 32/20 + NN 145/24 → **137 važećih članaka** (ukinut čl. 92. st. 5.).
   - **P-POVRŠINA (Pravilnik o načinu obračuna površine i obujma u projektima zgrada)**: NN 90/10 + NN 111/10 → **13 važećih članaka** (ključni koeficijenti čl. 9.a).
   - **OPZ (Opći porezni zakon)**: Temeljni akt NN 115/16 + 7 izmjena → **207 važećih članaka**.
   - **Vodno gospodarstvo (pilot)**: ZOV (266 čl.), ZFVG (122 čl.), ZVU (117 čl.), U-NUV (16 čl.), P-NUV (14 čl.), U-NZZV (8 čl.).
   - **Stanje baze `zakoni`**: Ukupno **2.037 važećih članaka** (svih 18 registriranih propisa u aplikaciji ima status **100% AŽURNO / 0 ZASTARJELO**).

4. **Široki katalog propisa RH (`scripts/nn-pilot/broad-catalog.ts`)**:
   - Definirano **35+ ključnih zakona i uredbi** raspoređenih u 7 temeljnih područja:
     1. Opće upravni propisi (ZUP, ZUS, ZSDU, ZPPI, ZU, UUP, UTUP)
     2. Građansko, stvarno i obvezno pravo (ZOO, ZV, ZZK, ZN, OZ)
     3. Gradnja, prostorno uređenje i nekretnine (ZG, ZPU, ZPNIZ, ZKG, ZC, ZPVN, ZKD)
     4. Vodno pravo i okoliš (ZOV, ZFVG, ZVU, ZOPO, ZGO)
     5. Porezi, pristojbe i javne financije (OPZ, ZPD, ZPN, ZJN, ZP)
     6. Radno pravo i javna služba (ZR, ZDS, ZPDS, ZSLS)
     7. Prekršaji i inspekcijski nadzor (PZ, ZDI)

5. **Viševerzijska baza podataka (`supabase/migrations/03_propisi_verzije.sql`)**:
   - Pripremljene relacijske tablice za dugoročno čuvanje povijesti propisa:
     - `propisi`: Glavni registar (kratica, naziv, podrucje, tip, temeljni_nn, eli_uri).
     - `propisi_verzije`: Verzije zakona (vrijedi_od, vrijedi_do, je_vazeca, izmjene_obuhvacene).
     - `propisi_clanci`: Članci po pojedinoj verziji s HNSW vektorskim indeksima (768 dimenzija).
     - Funkcija `match_propisi_vazeci`: RPC pretraga za semantičko pretraživanje važećih verzija.

6. **Korisničko sučelje (`/propisi`)**:
   - Ugrađeno dugme za ručno osvježavanje baze propisa u zaglavlju kartice statusa (`PropisiStatusCard`) i unutar modala (`PropisiStatusModal`).
   - Server Action `refreshPropisiStatusAction` provjerava usklađenost i bilježi točan timestamp provjere u `src/data/propisi-status.json`.

---

## 📌 7. Sljedeći koraci & Backlog

1. **Strukturne / hijerarhijske oznake članaka (Dio, Glava, Poglavlje, Odjeljak)**:
   - Proširiti parser `engine.ts` da pri prolasku kroz HTML Narodnih novina prepoznaje i pamti kontekst nadnaslova (npr. *DIO PRVI*, *GLAVA II. Upis u zemljišne knjige*, *POGLAVLJE 1.*).
   - Pridružiti svakom članku hijerarhijsku stazu (breadcrumbs) ili podnaslov članka (npr. *Članak 186.a [Elektroničko podnošenje prijedloga]*).
   - U sučelju `/propisi` prikazati te oznake iznad samog teksta članka radi vrhunske preglednosti i lakšeg snalaženja u opsežnim zakonima.
2. **Nastavak proširenja stvarnog prava & gradnje**:
   - **ZV** (Zakon o vlasništvu i drugim stvarnim pravima)
   - **Pravilnik o jednostavnim i drugim građevinama i radovima** (građenje bez građevinske dozvole)
   - **Zemljišnoknjižni poslovnik** (zaokruživanje zemljišnoknjižnog referata)
