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
