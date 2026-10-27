# HANDOFF: Stanje projekta i upute za rad

Datum: 27.10.2026.
Grana: `master`
Repozitorij: `https://github.com/mrv311/aplikacija-za-upravni-postupak.git`

---

## 📌 1. Baza upravne i sudske prakse — 100% DOVRŠENA

1. **Uspješno uvezena cijela arhiva iz mape `"za aplikaciju"`**:
   - **Ukupno dokumenata u bazi**: **800 spisa** (točno 800 pronađenih na disku)
   - **Ukupno vektorskih chunkova**: **4.443 chunka**
   - **Duplikati**: **0** (baza je potpuno čista, bez ijednog duplikata)

2. **Raspodjela u bazi po kategorijama**:
   - **Naknada za uređenje voda (NUV)**: **144 spisa** (2016.–2026. sve godine pokrivene)
   - **Vodni doprinos (VD)**: **237 spisa** (2016.–2026. sve godine pokrivene)
   - **Praksa upravnih sudova & upravni sporovi**: **419 spisa** (odgovori na tužbe, odgovori na žalbe, akti po presudama i presude upravnih sudova po svim vrstama naknada)

3. **GDPR anonimizacija & optimizacije**:
   - Svi spisi su prošli automatsku GDPR anonimizaciju (`scripts/anonymizer.ts`) — fizičke osobe i tvrtke svedene na inicijale/skraćene nazive, OIB i adrese zaštićeni, a pravni meritum u potpunosti očuvan.
   - Ugrađena brza pred-provjera (`loadExistingDbState`) koja u memoriji provjerava postojeće zapise u ~250 ms, sprječavajući bilo kakvo dupliciranje ili nepotrebno trošenje API kvota.
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
