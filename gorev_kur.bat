@echo off
rem Bilgisayar acikken her gece 23:45'te guncelle.bat'i calistiran Windows gorevini kurar.
rem Kaldirmak icin:  schtasks /Delete /TN "BSL Draft Veri" /F
schtasks /Create /TN "BSL Draft Veri" /TR "\"%~dp0guncelle.bat\" sessiz" /SC DAILY /ST 23:45 /F
pause
