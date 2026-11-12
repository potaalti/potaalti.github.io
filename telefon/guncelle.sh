#!/data/data/com.termux/files/usr/bin/bash
# Pota Altı App telefon güncellemesi (Termux). 15 dakikada bir tetiklenir (eski TBL Fantezi görevinin yanında, ayrı görev):
#   - Her tetiklemede: BSL maç saatindeyse BSL canlı skor ve VP (bsl/veri_guncelle.py --akilli; maç yoksa internete çıkmadan kapanır)
#   - Saat başı (o saat yapılmadıysa): TBL ve BSL puan tablosu, takım ve oyuncu istatistikleri, YouTube video ve
#     Shorts listesi (veri/uret.py; kaynağı eski TBL Fantezi sitesinin dosyaları)
#   - Günde 2 kez (12:00 ve 23:00'ten sonraki ilk tetikleme): BSL verilerinin tamamı (bsl/veri_guncelle.py, TBF'den) ve
#     istatistik liderleri ve Cumartesi–Salı seyirci sayıları (uret.py --gunluk)
# Değişiklik varsa GitHub'a gönderir; GitHub siteyi yayınlar.
# Elle deneme:  bash ~/pota-alti-app/telefon/guncelle.sh tam   (saat sınırı olmadan her şeyi günceller)
# POTA_DEPO: depo klasörü (varsayılan ~/pota-alti-app), POTA_KURU=1: GitHub'a göndermeden dener
DEPO="${POTA_DEPO:-$HOME/pota-alti-app}"
LOG="$HOME/pota-alti-guncelle.log"
SAAT_KAYIT="$HOME/.pota-alti-saatlik"
GUNLUK_KAYIT="$HOME/.pota-alti-gunluk"
GUNLUK_SAATLER="12 23"

cd "$DEPO" || exit 1

# Eski TBL Fantezi görevinin (canlı skorların kaynağı, ~/tbl-fantezi/telefon/guncelle.sh) bekçisi: maç döngüsü takılırsa
# (nabzı 10 dakikadan eski; eski betikte nabız yoksa döngünün başladığı an) durdurulur ve o depo güncellenir ki
# sonraki tetiklemesinde yeni betikle yeniden başlasın. 2026-11-09: döngü takıldı, Karşıyaka–Beşiktaş canlı güncellenmedi.
ESKI_PID="$HOME/.tbl-mac-dongusu.pid"
if [ -f "$ESKI_PID" ]; then
  eski_yas=$(( $(date +%s) - $(stat -c %Y "$HOME/.tbl-mac-dongusu.nabiz" 2>/dev/null || stat -c %Y "$ESKI_PID") ))
  if [ "$eski_yas" -gt 600 ]; then
    eski=$(cat "$ESKI_PID")
    pkill -P "$eski" 2>/dev/null
    kill "$eski" 2>/dev/null
    rm -f "$ESKI_PID"
    (cd "$HOME/tbl-fantezi" && timeout 120 git fetch -q origin && git reset -q --hard origin/main)
    echo "$(date '+%F %T') eski TBL maç döngüsü ${eski_yas} sn'dir takılıydı: durduruldu, betiği güncellendi" >> "$LOG"
  fi
fi
# Eski görev Termux'ta hiç tetiklenmese bile maç saatinde canlı skor dursun: döngüsü yoksa ve 20 dakikadır kaydına bir şey
# yazmadıysa eski betik buradan başlatılır (maç döngüsünü kendisi açar)
ESKI_LOG="$HOME/tbl-guncelle.log"
if [ ! -f "$ESKI_PID" ] && [ -f "$HOME/tbl-fantezi/telefon/guncelle.sh" ]    && [ $(( $(date +%s) - $(stat -c %Y "$ESKI_LOG" 2>/dev/null || echo 0) )) -gt 1200 ]    && python - "$HOME/tbl-fantezi/site/data/hafta/index.json" <<'PY'
import json, sys
from datetime import datetime, timedelta
try:
    ms = json.load(open(sys.argv[1], encoding="utf-8")).get("macSaatleri", [])
except Exception:
    sys.exit(1)
simdi = datetime.now()
sys.exit(0 if any(not m.get("bitti") and not m["tarih"].endswith("T00:00:00")
                  and datetime.fromisoformat(m["tarih"]) - timedelta(minutes=10) <= simdi <= datetime.fromisoformat(m["tarih"]) + timedelta(hours=4)
                  for m in ms) else 1)
PY
then
  echo "$(date '+%F %T') maç saati ama eski TBL görevi çalışmıyor: buradan başlatıldı" >> "$LOG"
  nohup bash "$HOME/tbl-fantezi/telefon/guncelle.sh" > /dev/null 2>&1 &
fi

# Avrupa'daki temsilcilerimiz (Türkiye saatiyle 18:00–02:00): ayrı küçük kopyada (~/pota-avrupa) 3 dakikalık döngü
# (veri/avrupa_dongu.py; GitHub'daki "Avrupa verileri" işinin ve bilgisayarın yedeği). Döngü çalışmıyorsa ya da
# 10 dakikadır nabzı yoksa (takıldıysa) buradan başlatılır; 02:00'de kendiliğinden biter.
AV_PID="$HOME/.pota-avrupa.pid"
if python -c 'from datetime import datetime,timezone,timedelta as t;import sys;sys.exit(0 if (datetime.now(timezone.utc)+t(hours=3)).hour in {18,19,20,21,22,23,0,1} else 1)'; then
  av_calisiyor=0
  if [ -f "$AV_PID" ] && kill -0 "$(cat "$AV_PID")" 2>/dev/null; then
    av_yas=$(( $(date +%s) - $(stat -c %Y "$HOME/.pota-avrupa.nabiz" 2>/dev/null || stat -c %Y "$AV_PID") ))
    if [ "$av_yas" -gt 600 ]; then
      pkill -P "$(cat "$AV_PID")" 2>/dev/null
      kill "$(cat "$AV_PID")" 2>/dev/null
      echo "$(date '+%F %T') Avrupa döngüsü ${av_yas} sn'dir takılıydı: yeniden başlatılıyor" >> "$LOG"
    else
      av_calisiyor=1
    fi
  fi
  if [ $av_calisiyor = 0 ] && [ -f "$DEPO/veri/avrupa_dongu.py" ]; then
    nohup python "$DEPO/veri/avrupa_dongu.py" dongu --ad telefon > /dev/null 2>&1 &
    echo $! > "$AV_PID"
    echo "$(date '+%F %T') Avrupa döngüsü başlatıldı (kayıt: ~/pota-avrupa.log)" >> "$LOG"
  fi
fi

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
  # Her adımın süre sınırı var (timeout): takılan bir istek görevi kilitlemesin (2026-11-05 18:57'de takılıp
  # 1,5 gün hiç çalışmadı), sonraki tetiklemeler devam etsin
  # BSL canlı: maç saatinde değilse bir şey yazmadan kapanır
  (cd bsl && timeout 600 python veri_guncelle.py --akilli) || echo "$(date '+%F %T') BSL canlı veri alınamadı"

  if [ $gunluk = 1 ] || [ $saatlik = 1 ]; then
    echo "== $(date '+%F %T') $([ $gunluk = 1 ] && echo 'tam' || echo 'saatlik') güncelleme"
    timeout 180 git pull -q --rebase --autostash || echo "git pull başarısız"
    if [ $gunluk = 1 ]; then
      (cd bsl && timeout 1500 python veri_guncelle.py) || echo "BSL verisi alınamadı (TBF)"
    fi
    # Liderler ve seyirci sayıları sadece günde 2 kezlik tam güncellemede (seyirci Cumartesi–Salı dışında atlanır)
    timeout 900 python veri/uret.py $([ $gunluk = 1 ] && echo --gunluk) > /dev/null || echo "Puan tablosu ve liderler üretilemedi"
  fi

  git add site/data site/bsl/data site/tbl/data
  if ! git diff --cached --quiet; then
    git commit -q -m "Veriler güncellendi (telefon)"
    if [ "${POTA_KURU:-0}" = 1 ]; then
      echo "deneme: GitHub'a gönderilmedi"
    else
      timeout 180 git pull -q --rebase --autostash
      if timeout 180 git push -q; then echo "$(date '+%F %T') gönderildi"; else echo "$(date '+%F %T') GitHub'a gönderilemedi"; fi
    fi
  elif [ $gunluk = 1 ] || [ $saatlik = 1 ]; then
    echo "değişiklik yok"
  fi
} >> "$LOG" 2>&1

tail -n 400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
