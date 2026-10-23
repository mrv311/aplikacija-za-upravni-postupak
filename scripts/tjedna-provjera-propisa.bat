@echo off
chcp 65001 >nul
cd /d "c:\Users\dinom\Documents\vibe coding\aplikacija-za-upravni-postupak"
echo [%date% %time%] Pokrecem tjednu provjeru i sinkronizaciju baze propisa... >> logs\tjedna-provjera-propisa.log
call npx tsx scripts/check-propisi-updates.ts --fix >> logs\tjedna-provjera-propisa.log 2>&1
echo [%date% %time%] Provjera zavrsena. >> logs\tjedna-provjera-propisa.log
echo -------------------------------------------------------------------------------- >> logs\tjedna-provjera-propisa.log
