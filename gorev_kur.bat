@echo off
rem Bilgisayar acikken gunde 2 kez (12:30 ve 23:45) guncelle.bat'i calistiran Windows gorevlerini kurar.
rem BSL'de transferler sik oldugu icin oyuncu listesi ve kadro hareketleri de boylece gunde 2 kez yenilenir.
rem Kaldirmak icin:  schtasks /Delete /TN "BSL Fantezi Veri Oglen" /F  ve  schtasks /Delete /TN "BSL Fantezi Veri Gece" /F
schtasks /Delete /TN "BSL Fantezi Veri" /F >nul 2>&1
schtasks /Create /TN "BSL Fantezi Veri Oglen" /TR "\"%~dp0guncelle.bat\" sessiz" /SC DAILY /ST 12:30 /F
schtasks /Create /TN "BSL Fantezi Veri Gece" /TR "\"%~dp0guncelle.bat\" sessiz" /SC DAILY /ST 23:45 /F
pause
