"""Avrupa verilerini telefondan ve bilgisayardan da güncelleyen ortak betik (GitHub'daki "Avrupa verileri" işinin yedeği).

Kendi küçük kopyasında çalışır (yalnız veri/ ve Avrupa için gereken dosyalar; ana çalışma klasörüne dokunmaz): her turda
GitHub'daki son hali alır, veri/avrupa.py'yi çalıştırır, değişiklik varsa kaydedip gönderir. Başkası (GitHub ya da öteki
cihaz) aynı anda gönderdiyse son hali alıp bir kez daha dener; veri değişmediyse hiçbir şey kaydedilmez, yani üç kaynak
birbirini ezmez. Türkiye saatiyle 18:00–02:00 dışında bir şey yapmaz.

  python veri/avrupa_dongu.py tek     bir tur (bilgisayarda Görev Zamanlayıcı 3 dakikada bir böyle çalıştırır)
  python veri/avrupa_dongu.py dongu   02:00'ye kadar 3 dakikada bir (telefonda guncelle.sh başlatır)
  --depo KLASÖR   kopyanın yeri (varsayılan ~/pota-avrupa)   --ad telefon|pc   kayıt mesajındaki cihaz adı
  --hep           saat sınırı olmadan (deneme için)
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEPO_URL = "https://github.com/potaalti/potaalti.github.io.git"
SEYREK = ["/veri/avrupa.py", "/veri/avrupa_dongu.py", "/site/data/avrupa/", "/site/data/bsl/oyuncular.json",
          "/site/data/tbl/oyuncular.json"]
ARALIK = 180
PENCERE_SAATLERI = {18, 19, 20, 21, 22, 23, 0, 1}  # Türkiye saati 18:00–02:00
PENCERESIZ = 0x08000000 if os.name == "nt" else 0  # Windows'ta git penceresi açılmasın


def tr_saat():
    return datetime.now(timezone.utc) + timedelta(hours=3)


def calistir(komut, depo, sure=180):
    return subprocess.run(komut, cwd=depo, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=sure, creationflags=PENCERESIZ)


class Kayit:
    def __init__(self, yol):
        self.yol = yol

    def __call__(self, *x):
        satir = f"{tr_saat():%Y-%m-%d %H:%M:%S} " + " ".join(str(a) for a in x)
        print(satir)
        with open(self.yol, "a", encoding="utf-8") as f:
            f.write(satir + "\n")

    def kirp(self):
        try:
            satirlar = Path(self.yol).read_text(encoding="utf-8").splitlines()[-400:]
            Path(self.yol).write_text("\n".join(satirlar) + "\n", encoding="utf-8")
        except OSError:
            pass


def hazirla(depo, ad, log):
    if (depo / ".git").exists():
        return
    log("kopya hazırlanıyor:", depo)
    depo.parent.mkdir(parents=True, exist_ok=True)
    r = calistir(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", DEPO_URL, str(depo)], depo.parent, 600)
    if r.returncode:
        raise RuntimeError(f"git clone: {r.stderr.strip()}")
    for k in (["git", "sparse-checkout", "set", "--no-cone", *SEYREK], ["git", "checkout", "-q", "main"],
              ["git", "config", "user.name", f"pota-alti-{ad}"], ["git", "config", "user.email", f"pota-alti-{ad}@users.noreply.github.com"],
              ["git", "config", "core.fileMode", "false"]):
        r = calistir(k, depo, 600)
        if r.returncode:
            raise RuntimeError(f"{' '.join(k[:3])}: {r.stderr.strip()}")


def son_hal(depo):
    r = calistir(["git", "fetch", "-q", "--depth", "1", "origin", "main"], depo)
    if r.returncode:
        raise RuntimeError(f"git fetch: {r.stderr.strip()}")
    calistir(["git", "reset", "-q", "--hard", "FETCH_HEAD"], depo)


def tur(depo, ad, log):
    for deneme in range(2):
        son_hal(depo)
        r = calistir([sys.executable, "veri/avrupa.py"], depo, 600)
        if r.returncode:
            log("avrupa.py hata verdi:", (r.stderr or r.stdout).strip()[-300:])
            return
        calistir(["git", "add", "site/data/avrupa"], depo)
        if calistir(["git", "diff", "--cached", "--quiet"], depo).returncode == 0:
            log("değişiklik yok")
            return
        calistir(["git", "commit", "-q", "-m", f"Avrupa verileri güncellendi ({ad})"], depo)
        r = calistir(["git", "push", "-q", "origin", "HEAD:main"], depo)
        if r.returncode == 0:
            log("gönderildi")
            return
        log(f"gönderilemedi (deneme {deneme + 1}): başkası göndermiş olabilir, son hal alınıp yeniden çekiliyor")
    log("gönderilemedi")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mod", choices=["tek", "dongu"])
    ap.add_argument("--depo", default=str(Path.home() / "pota-avrupa"))
    ap.add_argument("--ad", default="telefon")
    ap.add_argument("--hep", action="store_true")
    a = ap.parse_args()
    depo = Path(a.depo)
    log = Kayit(str(Path.home() / "pota-avrupa.log"))
    nabiz = Path.home() / ".pota-avrupa.nabiz"
    # Telefonda (Termux) döngü boyunca telefon uyanık kalır: yoksa Android ekran kapalıyken döngüyü uyutuyor
    # (2026-11-12 19:12–19:52 arası hiç güncelleme gelmedi). Eski TBL maç döngüsü de aynısını yapar.
    kilit = a.mod == "dongu" and shutil.which("termux-wake-lock")
    if kilit:
        subprocess.run(["termux-wake-lock"], timeout=30)
    try:
        while a.hep or tr_saat().hour in PENCERE_SAATLERI:
            bas = time.time()
            nabiz.touch()
            try:
                hazirla(depo, a.ad, log)
                tur(depo, a.ad, log)
            except Exception as e:  # noqa: BLE001 - bir tur başarısız olursa sonraki turda yeniden denenir
                log("hata:", e)
            if a.mod == "tek":
                break
            time.sleep(max(5, ARALIK - (time.time() - bas)))
    finally:
        if kilit:
            subprocess.run(["termux-wake-unlock"], timeout=30)
        log.kirp()


if __name__ == "__main__":
    main()
