# HANDOFF: Stanje projekta i upute za rad

Datum: 28.10.2026.
Grana: `master`
Repozitorij: `https://github.com/mrv311/aplikacija-za-upravni-postupak.git`

---

## 📌 1. Baza upravne i sudske prakse — 100% KOMPLETIRANA

1. **Uspješno uvezena cijela arhiva (upravni postupak, sporovi i skenirane presude)**:
   - **Ukupno dokumenata u bazi**: **1.329 spisa**
   - **Ukupno vektorskih chunkova**: **8.916 chunkova**
   - **Duplikati**: **0** (potpuno čista baza bez duplikata)

2. **Raspodjela u bazi po kategorijama**:
   - **Praksa upravnih sudova (presude)**: **528 spisa** (scannirane stvarne presude Upravnih sudova Zagreb, Split, Rijeka, Osijek i VUSRH)
   - **Praksa upravnih sudova (akti i odgovori)**: **421 spis** (odgovori na tužbe, odgovori na žalbe, akti doneseni po presudama)
   - **Vodni doprinos (VD)**: **235 spisa** (2016.–2026. sve godine)
   - **Naknada za uređenje voda (NUV)**: **145 spisa** (2016.–2026. sve godine)

3. **GDPR anonimizacija & zaštita**:
   - Svi spisi su prošli automatsku GDPR anonimizaciju (`scripts/anonymizer.ts`) — fizičke osobe i tvrtke svedene na inicijale/skraćene nazive, OIB i adrese zaštićeni, a pravni meritum u potpunosti očuvan.
   - Ugrađena brza pred-provjera (`loadExistingDbState`) i binarna MD5 provjera datoteka koja sprječava dupliciranje pri ponovnom pokretanju.
   - Svi vektorski embeddinzi generirani su modelom `gemini-embedding-001` (3072 dimenzije) i spremni za semantičko pretraživanje (RAG).

4. **Korisne naredbe**:
   - Provjera stanja baze prakse:
     ```bash
     npx tsx scripts/check-praksa-db.ts
     ```
   - Provjera propisa / zakona u bazi:
     ```bash
     npx tsx scripts/check-propisi-db.ts
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

