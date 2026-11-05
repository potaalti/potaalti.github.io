#!/data/data/com.termux/files/usr/bin/bash
# Pota Altı App telefon güncellemesi (Termux). 15 dakikada bir tetiklenir (eski TBL Fantezi görevinin yanında, ayrı görev):
#   - Her tetiklemede: BSL maç saatindeyse BSL canlı skor ve VP (bsl/veri_guncelle.py --akilli; maç yoksa internete çıkmadan kapanır)
#   - Saat başı (o saat yapılmadıysa): TBL ve BSL puan tablosu, liderler, takım ve oyuncu istatistikleri, YouTube video ve
#     Shorts listesi (veri/uret.py; kaynağı eski TBL Fantezi sitesinin dosyaları)
#   - Günde 2 kez (12:00 ve 23:00'ten sonraki ilk tetikleme): BSL verilerinin tamamı (bsl/veri_guncelle.py, TBF'den) ve
#     Cumartesi–Pazartesi seyirci sayıları (uret.py --seyirci)
# Değişiklik varsa GitHub'a gönderir; GitHub siteyi yayınlar.
# Elle deneme:  bash ~/pota-alti-app/telefon/guncelle.sh tam   (saat sınırı olmadan her şeyi günceller)
# POTA_DEPO: depo klasörü (varsayılan ~/pota-alti-app), POTA_KURU=1: GitHub'a göndermeden dener
DEPO="${POTA_DEPO:-$HOME/pota-alti-app}"
LOG="$HOME/pota-alti-guncelle.log"
SAAT_KAYIT="$HOME/.pota-alti-saatlik"
GUNLUK_KAYIT="$HOME/.pota-alti-gunluk"
GUNLUK_SAATLER="12 23"

cd "$DEPO" || exit 1
tam=0
[ "$1" = "tam" ] && tam=1
bugun=$(date +%F)
saat=$(date +%H)

# Bu tetiklemede ne yapılacak (internete çıkmadan karar verilir)
gunluk=$tam
for s in $GUNLUK_SAATLER; do
  if [ "$saat" -ge "$s" ] && ! grep -qx "$bugun-$s" "$GUNLUK_KAYIT" 2>/dev/null; then
    echo "$bugun-$s" >> "$GUNLUK_KAYIT"
    tail -n 20 "$GUNLUK_KAYIT" > "$GUNLUK_KAYIT.tmp" && mv "$GUNLUK_KAYIT.tmp" "$GUNLUK_KAYIT"
    gunluk=1
  fi
done
saatlik=$tam
if [ "$(cat "$SAAT_KAYIT" 2>/dev/null)" != "$bugun-$saat" ]; then
  echo "$bugun-$saat" > "$SAAT_KAYIT"
  saatlik=1
fi

{
  # BSL canlı: maç saatinde değilse bir şey yazmadan kapanır
  (cd bsl && python veri_guncelle.py --akilli) || echo "$(date '+%F %T') BSL canlı veri alınamadı"

  if [ $gunluk = 1 ] || [ $saatlik = 1 ]; then
    echo "== $(date '+%F %T') $([ $gunluk = 1 ] && echo 'tam' || echo 'saatlik') güncelleme"
    git pull -q --rebase --autostash || echo "git pull başarısız"
    if [ $gunluk = 1 ]; then
      (cd bsl && python veri_guncelle.py) || echo "BSL verisi alınamadı (TBF)"
    fi
    # Seyirci sayıları sadece günde 2 kezlik tam güncellemede (uret.py Cumartesi–Pazartesi dışında atlar)
    python veri/uret.py $([ $gunluk = 1 ] && echo --seyirci) > /dev/null || echo "Puan tablosu ve liderler üretilemedi"
  fi

  git add site/data site/bsl/data site/tbl/data
  if ! git diff --cached --quiet; then
    git commit -q -m "Veriler güncellendi (telefon)"
    if [ "${POTA_KURU:-0}" = 1 ]; then
      echo "deneme: GitHub'a gönderilmedi"
    else
      git pull -q --rebase --autostash
      if git push -q; then echo "$(date '+%F %T') gönderildi"; else echo "$(date '+%F %T') GitHub'a gönderilemedi"; fi
    fi
  elif [ $gunluk = 1 ] || [ $saatlik = 1 ]; then
    echo "değişiklik yok"
  fi
} >> "$LOG" 2>&1

tail -n 400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
