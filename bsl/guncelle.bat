@echo off
rem BSL verilerini TBF'den ceker, Pota Alti App'in puan tablosu ve liderlerini yeniler, siteye gonderir.
rem Cift tiklayarak calistirin: tam guncelleme.
rem Zamanlanmis gorevler arka planda calistirir (gizli_calistir.vbs ile, pencere acilmaz):
rem   guncelle.bat sessiz  -> tam guncelleme (gunde 2 kez)
rem   guncelle.bat canli   -> sadece mac saatlerinde canli skor ve VP (3 dakikada bir; mac yoksa hemen kapanir)
rem Arka plan calismalarinin ciktisi guncelle.log dosyasina yazilir.
chcp 65001 >nul
cd /d "%~dp0"
if not "%~1"=="" (
  call :guncelle %1 >> guncelle.log 2>&1
  exit /b
)
call :guncelle
pause
exit /b

:guncelle
setlocal EnableDelayedExpansion
if /i "%~1"=="canli" (
  python veri_guncelle.py --akilli
) else (
  echo BSL verileri TBF'den aliniyor...
  python veri_guncelle.py
)
if errorlevel 1 (
  echo HATA: Veriler alinamadi. Internet baglantisini kontrol edip tekrar deneyin.
  exit /b 1
)
rem Pota Alti App: TBL ve BSL puan tablosu, liderler, takim ve oyuncu istatistikleri
if /i not "%~1"=="canli" echo Puan tablolari ve liderler hazirlaniyor...
python ../veri/uret.py >nul
if errorlevel 1 echo UYARI: Puan tablosu ve liderler guncellenemedi; bir sonraki guncellemede tekrar denenir.
git add ../site/bsl/data ../site/data
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Veriler guncellendi"
  git pull -q --rebase --autostash
  git push -q
  if errorlevel 1 (
    echo HATA: Veriler GitHub'a gonderilemedi. Internet baglantisini kontrol edin; bir sonraki guncellemede tekrar denenir.
    exit /b 1
  )
  echo Veriler siteye gonderildi. Birkac dakika icinde sitede gorunur.
) else (
  rem Daha once gonderilemeyen veri varsa simdi gonder
  set ILERI=0
  for /f %%a in ('git rev-list --count @{u}..HEAD 2^>nul') do set ILERI=%%a
  if not "!ILERI!"=="0" git push -q
  if /i not "%~1"=="canli" echo Yeni veri yok.
)
exit /b 0
