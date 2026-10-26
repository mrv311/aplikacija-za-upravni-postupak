# HANDOFF: Stanje projekta i upute za nastavak

Datum: 26.10.2026.
Grana: `master`
Repozitorij: `https://github.com/mrv311/aplikacija-za-upravni-postupak.git`

---

## 📌 1. Trenutni status i što je sve implementirano

1. **Baza prakse i uvoz dokumenata (`scripts/import-onedrive-praksa.ts`)**:
   - Podržava pojedinačne mape i master mape (npr. `"za aplikaciju"` koja sadrži podmape za naknade i sudsku praksu).
   - Automatski prepoznaje tip akta/naknade (Naknada za uređenje voda, Naknada za zaštitu voda, Naknada za korištenje voda, Vodni doprinos, Sudska praksa).
   - Skenirani PDF-ovi koji nemaju tekst automatski prolaze kroz Gemini OCR (`gemini-3.8-flash`).
   - Tekst se dijeli na semantičke dijelove (chunkove) i sprema u Supabase bazu.

2. **GDPR Anonimizacija (`scripts/anonymizer.ts`)**:
   - Automatski cenzurira osobna imena, nazive fizičkih i pravnih osoba, OIB-e, adrese i kontakt podatke prije spremanja u bazu.

3. **Propisi i zakoni**:
   - Ažurirani konsolidirani tekstovi: ZUS (NN 36/24, 39/26), UTUP (NN 156/22, 130/25), ZKG (NN 145/24) i ZPNIZ (NN 48/26).
   - Implementiran periodički checker za izmjene propisa (`scripts/update-propisi.ts`).

---

## 🎯 2. Sljedeći zadatak

- **Uvoz nove mape s dokumentima u bazu prakse**:
  - Korisnik treba poslati lokalnu putanju mape na kućnom računalu (npr. mapa sa sudskim presudama, rješenjima ili master mapa `za aplikaciju`).
  - Skripta se pokreće naredbom:
    ```bash
    npx tsx scripts/import-onedrive-praksa.ts "<PUTANJA_DO_MAPE>"
    ```
  - Nakon uvoza provjerava se stanje u bazi:
    ```bash
    npx tsx scripts/check-praksa-db.ts
    ```

---

## 🏠 3. Koraci za nastavak kad dođete kući

1. **Povlačenje najnovijeg koda**:
   Otvorite terminal u mapi projekta na kućnom računalu i pokrenite:
   ```bash
   git pull origin master
   ```

2. **Provjera `.env.local` datoteke**:
   Provjerite imate li na kućnom računalu u korijenu projekta `.env.local` s potrebnim ključevima:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_GEMINI_KEY` (ili `GEMINI_API_KEY`)

3. **Nastavak u Antigravityju**:
   Otvorite Antigravity, otvorite ovaj projekt, otvorite novi chat i pošaljite:
   > `@HANDOFF.md Nastavljamo gdje smo stali. Evo putanje do mape koju želim dodati u bazu prakse: [ovdje zalijepite putanju s kućnog diska]`

Agent će odmah pročitati ovaj dokument, prepoznati sve implementirane mehanizme i pokrenuti uvoz s vašom novom putanjom.
