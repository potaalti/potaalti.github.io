@echo off
rem Bilgisayar acikken calisan Windows gorevlerini kurar (pencere acilmadan, arka planda):
rem   - Her gun 12:30 ve 23:45'te tam guncelleme (oyuncu listesi, transferler, fikstur)
rem   - 3 dakikada bir mac saati kontrolu: mac varsa canli skor ve VP'ler siteye gider, yoksa hemen kapanir
rem Kaldirmak icin gorev_kaldir.bat'a cift tiklayin.
set VBS=%~dp0gizli_calistir.vbs
schtasks /Delete /TN "BSL Fantezi Veri" /F >nul 2>&1
schtasks /Create /TN "BSL Fantezi Veri Oglen" /TR "wscript.exe \"%VBS%\" sessiz" /SC DAILY /ST 12:30 /F
schtasks /Create /TN "BSL Fantezi Veri Gece" /TR "wscript.exe \"%VBS%\" sessiz" /SC DAILY /ST 23:45 /F
schtasks /Create /TN "BSL Fantezi Canli" /TR "wscript.exe \"%VBS%\" canli" /SC MINUTE /MO 3 /F
echo.
echo Gorevler kuruldu. Bilgisayar acik oldugu surece calisirlar.
pause
