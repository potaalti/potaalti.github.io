#!/data/data/com.termux/files/usr/bin/bash
# Pota Altı App telefon kurulumu (Termux). TBL Fantezi'nin telefon kurulumu yapılmış telefonda bir kez çalıştırılır:
#   curl -sLO https://raw.githubusercontent.com/potaalti/potaalti.github.io/main/telefon/kurulum.sh && bash kurulum.sh
# Yeni siteyi (potaalti.github.io) telefona indirir, ilk güncellemeyi yapar ve 15 dakikalık ikinci görevi kurar.
# Eski TBL Fantezi görevine (job 1) dokunmaz.
set -e
DEPO_URL="https://github.com/potaalti/potaalti.github.io.git"
DEPO="$HOME/pota-alti-app"

echo
echo "[1/4] Paketler kontrol ediliyor..."
if ! command -v python >/dev/null || ! command -v git >/dev/null || ! command -v gh >/dev/null || ! command -v termux-job-scheduler >/dev/null; then
  pkg install -y python git gh termux-api
fi

echo
echo "[2/4] GitHub girişi"
if ! gh auth status >/dev/null 2>&1; then
  echo "      Ekranda 8 haneli bir kod çıkacak. Tarayıcıda github.com/login/device"
  echo "      adresini açıp kodu girin ve 'Authorize' deyin."
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git

echo
echo "[3/4] Pota Altı App indiriliyor..."
if [ ! -d "$DEPO/.git" ]; then
  git clone -q "$DEPO_URL" "$DEPO"
fi
cd "$DEPO"
git config user.name "pota-alti-telefon"
git config user.email "pota-alti-telefon@users.noreply.github.com"
# chmod izin değişikliğini Git yerel değişiklik saymasın (yoksa git pull reddeder)
git config core.fileMode false
chmod +x telefon/guncelle.sh

echo
echo "[4/4] İlk güncelleme yapılıyor (ilk seferde geçmiş maçlar indirildiği için birkaç dakika sürer)..."
bash telefon/guncelle.sh tam || true
tail -n 10 "$HOME/pota-alti-guncelle.log"

termux-job-scheduler --job-id 2 --script "$DEPO/telefon/guncelle.sh" \
  --period-ms 900000 --network any --persisted true
termux-job-scheduler --pending

echo
echo "Kurulum tamam. Telefon artık puan tablolarını, liderleri ve YouTube listesini saat başı,"
echo "BSL verilerini günde 2 kez ve BSL maç saatlerinde güncelleyecek."
echo "Son çalışmaları görmek için:  tail -n 30 ~/pota-alti-guncelle.log"
