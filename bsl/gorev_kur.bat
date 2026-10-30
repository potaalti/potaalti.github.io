@echo off
rem Bilgisayar acikken her gun 12:30 ve 23:45'te tam guncelleme yapan Windows gorevlerini kurar
rem (pencere acilmadan, arka planda): oyuncu listesi, transferler, fikstur, biten haftalarin kesin VP'leri.
rem Mac sirasindaki canli skor ve VP'ler TBL Fantezi Ligi'nin telefondaki guncellemesinden okunur; bunun icin
rem bilgisayarda bir sey gerekmez. (TBL tarafi durursa yedek olarak 3 dakikalik gorev: gorev_kur.bat canli)
rem Kaldirmak icin gorev_kaldir.bat'a cift tiklayin.
set VBS=%~dp0gizli_calistir.vbs
schtasks /Delete /TN "BSL Fantezi Veri" /F >nul 2>&1
schtasks /Create /TN "BSL Fantezi Veri Oglen" /TR "wscript.exe \"%VBS%\" sessiz" /SC DAILY /ST 12:30 /F
schtasks /Create /TN "BSL Fantezi Veri Gece" /TR "wscript.exe \"%VBS%\" sessiz" /SC DAILY /ST 23:45 /F
if /i "%~1"=="canli" (
  schtasks /Create /TN "BSL Fantezi Canli" /TR "wscript.exe \"%VBS%\" canli" /SC MINUTE /MO 3 /F
) else (
  schtasks /Delete /TN "BSL Fantezi Canli" /F >nul 2>&1
)
echo.
echo Gorevler kuruldu. Bilgisayar acik oldugu surece calisirlar.
pause
