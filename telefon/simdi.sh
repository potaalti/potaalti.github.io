#!/data/data/com.termux/files/usr/bin/bash
# Acil elle güncelleme (Termux): bir şey anlık güncellenmiyorsa her şeyi hemen günceller. Termux'a yazılacak tek satır:
#   cd ~/pota-alti-app && git rebase --abort 2>/dev/null; git fetch -q origin && git reset -q --hard origin/main && bash telefon/simdi.sh
# (Önce bu depoyu GitHub'daki son hale getirir: takılı kalmış güncelleme de çözülür.)
# Sırayla: 1) TBL ve BSL canlı skorlar, TBL verileri (eski TBL deposu)  2) BSL Fantezi, puan tablosu, istatistikler, liderler,
# seyirci, YouTube (bu depo)  3) Avrupa. Bilgisayar açık olsa da çalışır; üst üste basmaz (her adım son hali alıp üretir).
echo "1/3 TBL ve BSL canlı skorlar, TBL verileri…"
if [ -d "$HOME/tbl-fantezi" ]; then
  (cd "$HOME/tbl-fantezi" && git rebase --abort 2>/dev/null; timeout 120 git fetch -q origin && git reset -q --hard origin/main)
  bash "$HOME/tbl-fantezi/telefon/guncelle.sh" tam
  tail -n 3 "$HOME/tbl-guncelle.log"
else
  echo "   ~/tbl-fantezi yok, atlandı"
fi
echo "2/3 BSL Fantezi, puan tablosu, istatistikler, YouTube… (birkaç dakika sürebilir)"
bash "$HOME/pota-alti-app/telefon/guncelle.sh" tam
tail -n 4 "$HOME/pota-alti-guncelle.log"
echo "3/3 Avrupa…"
python "$HOME/pota-alti-app/veri/avrupa_dongu.py" tek --ad telefon --hep 2>&1 | tail -n 2
echo "Bitti. 1-2 dakika içinde uygulamada görünür (sayfayı yenile)."
