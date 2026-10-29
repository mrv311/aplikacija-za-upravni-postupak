# HANDOFF: Stanje projekta i upute za rad

Datum: 29.10.2026.
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

3. **Uspješno konsolidirani i u bazu uneseni pilot zakoni**:
   - **ZUP (Zakon o općem upravnom postupku)**:
     - Temeljni akt: NN 47/09 + izmjena NN 110/21.
     - Točno **171 važećih članaka** u bazi `zakoni` s 768-dimenzijskim embeddingom.
   - **ZPNIZ (Zakon o postupanju s nezakonito izgrađenim zgradama)**:
     - Temeljni akt: NN 86/12 + 4 izmjene (NN 143/13, 65/17, 14/19, 48/26).
     - Točno **59 važećih članaka** u bazi `zakoni` (uklonjeno 77 starih pogrešnih redaka nastalih scraperom).
   - **OPZ (Opći porezni zakon)**:
     - Temeljni akt: NN 115/16 + 7 izmjena (NN 106/18, 121/19, 32/20, 42/20, 114/22, 152/24, 151/25).
     - Točno **207 važećih članaka** u bazi `zakoni` (uključujući nove članke `32a`, `44a`, `63a`, `74a`, `107a`, `190a`).
   - **Stanje baze `zakoni`**: Ukupno **1.573 važećih članaka**.

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
