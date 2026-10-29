@echo off
rem BSL verilerini TBF'den ceker ve siteye gonderir (GitHub Pages birkac dakikada yayinlar).
rem Cift tiklayarak calistirin. Zamanlanmis gorevden "guncelle.bat sessiz" olarak calisir.
chcp 65001 >nul
cd /d "%~dp0"
echo BSL verileri TBF'den aliniyor...
python veri_guncelle.py
if errorlevel 1 (
  echo.
  echo HATA: Veriler alinamadi. Internet baglantisini kontrol edip tekrar deneyin.
  if "%~1"=="" pause
  exit /b 1
)
git add site/data
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Veriler guncellendi"
  git pull -q --rebase
  git push -q
  echo Veriler siteye gonderildi. Birkac dakika icinde sitede gorunur.
) else (
  echo Yeni veri yok.
)
if "%~1"=="" pause
