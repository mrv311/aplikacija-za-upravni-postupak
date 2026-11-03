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

## 📌 4. Sljedeći koraci & Backlog (Točka 2)

1. **Nastavak proširenja stvarnog prava & gradnje (Točka 2)**:
   - **ZV** (Zakon o vlasništvu i drugim stvarnim pravima — NN 91/96, 68/98, 137/99, 22/00, 73/00, 129/00, 114/01, 79/06, 141/06, 146/08, 38/09, 153/09, 143/12, 152/14, 81/15, 94/17)
   - **Pravilnik o jednostavnim i drugim građevinama i radovima** (građenje bez građevinske dozvole — NN 112/17, 34/18, 36/19, 98/19, 31/20, 74/22, 155/23)
   - **Zemljišnoknjižni poslovnik** (NN 123/19 — zaokruživanje zemljišnoknjižnog referata)
