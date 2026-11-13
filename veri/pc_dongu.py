"""Bilgisayar veri döngüsü (Windows Görev Zamanlayıcı): telefonun işlerinin bilgisayardaki karşılığı. Bilgisayar açıkken asıl
kaynak budur; telefon ve GitHub yedektir. Telefon, son 5 dakikada '(pc)' etiketli gönderim görünce canlı turunu atlar.

Üst üste basmaz: her iş kendi kopyasında GitHub'daki son hali alır (git reset), veriyi üretir, değişiklik varsa '(pc)'
etiketiyle gönderir; o arada başkası (telefon, GitHub) göndermişse son hali alıp yeniden üretir.

  python veri/pc_dongu.py canli    2 dakikada bir: TBL ve BSL canlı skor ve VP (maç saatinde; değilse internete çıkmadan
                                   biter), Avrupa (Türkiye saatiyle 18:00–02:00)
  python veri/pc_dongu.py gunluk   15 dakikada bir, zamanı gelen işler (Türkiye saati; o saat kaçtıysa açılınca bir kez):
      TBL ve BSL verilerinin tamamı, istatistik liderleri, seyirci, oyuncu fotoğrafı ve takım logoları: 08, 13, 18, 23
      puan tablosu, takım ve oyuncu istatistikleri: saat başı
      YouTube canlı yayın ve video listesi: 07, 11, 15, 19, 23
  --is ad1,ad2   zamanına bakmadan yalnızca bu işler (tbl, bsl, avrupa | veri, istatistik, gunluk, youtube)
  --kuru         üretir ama göndermez       --kok KLASÖR   kopyaların yeri (varsayılan ~/pota-pc)
Kayıt: ~/pota-pc.log. Kopyalar: ~/pota-pc/<canli|gunluk>/{app,tbl} (çalışma klasörlerine dokunmaz).
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

APP_URL = "https://github.com/potaalti/potaalti.github.io.git"
TBL_URL = "https://github.com/potaalti/tbl_fantezi_lig.git"
APP_SEYREK = ["/veri/", "/bsl/", "/site/data/", "/site/bsl/data/", "/site/tbl/data/"]
AVRUPA_SAATLERI = {18, 19, 20, 21, 22, 23, 0, 1}
VERI_SAATLERI = [8, 13, 18, 23]
YOUTUBE_SAATLERI = [7, 11, 15, 19, 23]
PENCERESIZ = 0x08000000 if os.name == "nt" else 0  # Windows'ta git/python penceresi açılmasın
KAYIT = Path.home() / "pota-pc.log"


def tr_simdi():
    return datetime.now(timezone.utc) + timedelta(hours=3)


def log(*x):
    satir = f"{tr_simdi():%Y-%m-%d %H:%M:%S} " + " ".join(str(a) for a in x)
    print(satir)
    with open(KAYIT, "a", encoding="utf-8") as f:
        f.write(satir + "\n")


def kirp():
    try:
        satirlar = KAYIT.read_text(encoding="utf-8").splitlines()[-800:]
        KAYIT.write_text("\n".join(satirlar) + "\n", encoding="utf-8")
    except OSError:
        pass


def calistir(komut, cwd, sure=180):
    return subprocess.run(komut, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=sure, creationflags=PENCERESIZ, env={**os.environ, "PYTHONIOENCODING": "utf-8"})


def git(depo, *args, sure=300):
    r = calistir(["git", *args], depo, sure)
    if r.returncode:
        raise RuntimeError(f"git {args[0]}: {(r.stderr or r.stdout).strip()[-300:]}")
    return r.stdout


def hazirla(depo, url, seyrek=None):
    if (depo / ".git").exists():
        return
    log("kopya hazırlanıyor:", depo)
    depo.parent.mkdir(parents=True, exist_ok=True)
    git(depo.parent, "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", url, str(depo), sure=900)
    if seyrek:
        git(depo, "sparse-checkout", "set", "--no-cone", *seyrek)
    git(depo, "checkout", "-q", "main", sure=900)
    for k, v in (("user.name", "pota-alti-pc"), ("user.email", "pota-alti-pc@users.noreply.github.com"), ("core.fileMode", "false")):
        git(depo, "config", k, v)


def son_hal(depo):
    git(depo, "rebase", "--abort") if (depo / ".git" / "rebase-merge").exists() else None
    git(depo, "fetch", "-q", "--depth", "1", "origin", "main")
    git(depo, "reset", "-q", "--hard", "FETCH_HEAD")


def is_yap(ad, depo, komutlar, ekle, mesaj, kuru):
    """Son hali al, komutları çalıştır, değişiklik varsa gönder; gönderilemezse (başkası araya girdi) baştan, en çok 3 kez."""
    for deneme in range(3):
        son_hal(depo)
        for komut, klasor, sure in komutlar:
            r = calistir([sys.executable, *komut], depo / klasor, sure)
            if r.returncode:
                log(f"{ad}: {' '.join(komut)} hata verdi:", (r.stderr or r.stdout).strip()[-400:])
                return False
        git(depo, "add", "-A", *ekle)
        if calistir(["git", "diff", "--cached", "--quiet"], depo).returncode == 0:
            return True
        if kuru:
            log(f"{ad}: değişiklik var (deneme: gönderilmedi)")
            return True
        git(depo, "commit", "-q", "-m", mesaj)
        r = calistir(["git", "push", "-q", "origin", "HEAD:main"], depo, 180)
        if r.returncode == 0:
            log(f"{ad}: gönderildi")
            return True
        log(f"{ad}: gönderilemedi (deneme {deneme + 1}), başkası göndermiş olabilir: son hal alınıp yeniden üretiliyor")
    log(f"{ad}: gönderilemedi")
    return False


def canli(kok, secili, kuru):
    tbl, app = kok / "canli" / "tbl", kok / "canli" / "app"
    hazirla(tbl, TBL_URL)
    hazirla(app, APP_URL, APP_SEYREK)
    if not secili or "tbl" in secili:  # TBL (ve ana uygulamanın BSL maç listesi) canlı skor ve VP; maç saatinde değilse hemen biter
        is_yap("TBL canlı", tbl, [(["fetch_tbf.py", "--akilli"], ".", 300)], ["."], "Veriler güncellendi (pc)", kuru)
    if not secili or "bsl" in secili:  # BSL Fantezi canlı VP
        is_yap("BSL canlı", app, [(["veri_guncelle.py", "--akilli"], "bsl", 300)], ["site/bsl/data"], "BSL canlı veriler güncellendi (pc)", kuru)
    if (not secili and tr_simdi().hour in AVRUPA_SAATLERI) or "avrupa" in secili:
        is_yap("Avrupa", app, [(["veri/avrupa.py"], ".", 600)], ["site/data/avrupa"], "Avrupa verileri güncellendi (pc)", kuru)


def zamani_gelen(durum, ad, saatler):
    """Bugünün o ana kadarki son dilimi yapılmadıysa dilim anahtarı (ör. '2026-11-13-18'), yoksa None."""
    simdi = tr_simdi()
    if saatler == "saatlik":
        dilim = f"{simdi:%Y-%m-%d-%H}"
    else:
        gecen = [s for s in saatler if s <= simdi.hour]
        if not gecen:
            return None
        dilim = f"{simdi:%Y-%m-%d}-{gecen[-1]:02d}"
    return None if durum.get(ad) == dilim else dilim


def gunluk(kok, secili, kuru):
    tbl, app = kok / "gunluk" / "tbl", kok / "gunluk" / "app"
    hazirla(tbl, TBL_URL)
    hazirla(app, APP_URL, APP_SEYREK)
    durum_yol = kok / "durum.json"
    try:
        durum = json.loads(durum_yol.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        durum = {}
    dilim = {"veri": zamani_gelen(durum, "veri", VERI_SAATLERI), "gunluk": zamani_gelen(durum, "gunluk", VERI_SAATLERI),
             "istatistik": zamani_gelen(durum, "istatistik", "saatlik"), "youtube": zamani_gelen(durum, "youtube", YOUTUBE_SAATLERI)}
    yap = {ad: (ad in secili) if secili else bool(d) for ad, d in dilim.items()}
    kaynak = str(tbl / "site" / "data")  # puan tablosu ve istatistikler bilgisayardaki TBL kopyasından (sitenin yayınını beklemeden)

    def bitti(ad, tamam):
        if tamam and dilim[ad] and not secili:
            durum[ad] = dilim[ad]
            durum_yol.write_text(json.dumps(durum, indent=1), encoding="utf-8")

    if yap["veri"]:
        log("TBL ve BSL verilerinin tamamı güncelleniyor")
        t1 = is_yap("TBL tam", tbl, [(["fetch_tbf.py"], ".", 1500)], ["."], "Veriler güncellendi (pc)", kuru)
        t2 = is_yap("BSL tam", app, [(["veri_guncelle.py"], "bsl", 1800)], ["site/bsl/data"], "BSL verileri güncellendi (pc)", kuru)
        bitti("veri", t1 and t2)
    if yap["gunluk"] or yap["istatistik"]:
        son_hal(tbl)
        ek = ["--gunluk"] if yap["gunluk"] else []
        tamam = is_yap("İstatistikler" + (" (liderler, seyirci, fotoğraflar)" if ek else ""), app,
                       [(["veri/uret.py", "--kaynak", kaynak, "--youtube", "hayir", *ek], ".", 1800)],
                       ["site/data", "site/tbl/data"], "İstatistikler güncellendi (pc)", kuru)
        bitti("istatistik", tamam)
        if ek:
            bitti("gunluk", tamam)
    if yap["youtube"]:
        bitti("youtube", is_yap("YouTube", app, [(["veri/uret.py", "--youtube", "sadece"], ".", 300)],
                                ["site/data/youtube.json"], "YouTube listesi güncellendi (pc)", kuru))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mod", choices=["canli", "gunluk"])
    ap.add_argument("--kok", default=str(Path.home() / "pota-pc"))
    ap.add_argument("--is", dest="isler", default="")
    ap.add_argument("--kuru", action="store_true")
    a = ap.parse_args()
    secili = {x for x in a.isler.split(",") if x}
    kok = Path(a.kok)
    try:
        (canli if a.mod == "canli" else gunluk)(kok, secili, a.kuru)
    except Exception as e:  # noqa: BLE001 - bir tur başarısız olursa sonraki tetiklemede yeniden denenir
        log(f"{a.mod}: hata:", e)
    finally:
        kirp()


if __name__ == "__main__":
    main()
