@echo off
rem gorev_kur.bat'in kurdugu Windows gorevlerini kaldirir.
schtasks /Delete /TN "BSL Fantezi Veri Oglen" /F
schtasks /Delete /TN "BSL Fantezi Veri Gece" /F
schtasks /Delete /TN "BSL Fantezi Canli" /F
pause
