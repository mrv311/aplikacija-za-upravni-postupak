# HANDOFF: Stanje projekta i upute za nastavak

Datum: 26.10.2026.
Grana: `master`
Repozitorij: `https://github.com/mrv311/aplikacija-za-upravni-postupak.git`

---

## 📌 1. Trenutni status i što je sve napravljeno

1. **Baza prakse i GDPR anonimizacija**:
   - Skripta `scripts/import-onedrive-praksa.ts` uspješno prepoznaje master mapu `"za aplikaciju"` i njezine podmape:
     - `NUV` (Naknada za uređenje voda)
     - `VD` (Vodni doprinos)
     - `UPRAVNI SPOROVI` (Praksa upravnih sudova)
   - GDPR anonimizacija (`scripts/anonymizer.ts`) funkcionira izvrsno: fizičke osobe i tvrtke pretvaraju se u inicijale, adrese u `[Adresa]`, OIB-i u `[OIB]`.
   - **Stanje u bazi Supabase**:
     - Uspješno uvezeno prvih **12 spisa** (118 vektorskih chunkova) iz kategorije *Naknada za uređenje voda* (cijela 2026. godina i dio 2025.).
     - Skripta automatski preskače već uvezene spise, tako da se uvoz može prekidati i nastavljati bez duplikata.

2. **Dopune i stabilnost skripti**:
   - Dodano automatsko učitavanje `.env.local` varijabli u sve skripte.
   - Dodan retry mehanizam s automatskom pauzom za Gemini rate-limit (429) greške.

---

## 🎯 2. Kako nastaviti uvoz

Ako nastavite doma (uz mapu na OneDriveu) ili sutra na poslu, naredba za nastavak je:
```bash
npx tsx scripts/import-onedrive-praksa.ts "<PUTANJA_DO_MAPE_ZA_APLIKACIJU>"
```
*(Skripta će automatski preskočiti onih 12 već ubačenih spisa i nastaviti dalje kroz 2025., 2024., ...)*

Provjera trenutnog stanja u bazi:
```bash
npx tsx scripts/check-praksa-db.ts
```

---

## 🏠 3. Koraci za Antigravity kod kuće

1. Otvorite terminal u mapi projekta i povucite zadnje izmjene:
   ```bash
   git pull origin master
   ```
2. Otvorite Antigravity na kućnom računalu, pokrenite novi chat i napišite:
   > `@HANDOFF.md Nastavljamo gdje smo stali.`
