"""Pota Altı App veri üreticisi.

TBL Fantezi Ligi sitesinin yayınladığı TBL ve BSL verisinden (maç listeleri ve kutu skorlar) uygulamanın
herkese açık bölümü için özet dosyaları üretir:

  site/data/meta.json                ligler, güncel haftalar, güncelleme zamanı
  site/data/<lig>/tablo.json         takım puan tablosu (G/M, sayı averajı, son 5 maç)
  site/data/<lig>/liderler.json      istatistik liderleri (maç başı ortalamalar, toplam +/-; --gunluk ile, günde 2 kez)
  site/data/<lig>/oyuncular.json     bütün oyuncuların sezon ortalamaları
  site/data/<lig>/takimlar.json      takımların maç başı istatistikleri, kadroları ve maçları
  site/data/<lig>/oyuncu/<id>.json   oyuncunun maç maç istatistikleri
  site/data/<lig>/takim-istatistik.json  biten maçlarda oyuncuya yazılmayan takım istatistikleri (TBF'den)
  site/data/<lig>/gorsel.json, foto/, logo/  oyuncu fotoğrafları ve takım logoları (TBF'den; --gunluk ile, haftanın ödülleri için)
  site/data/<lig>/seyirci.json       biten maçların seyirci sayıları (TBF'den; --gunluk ile, Cumartesi–Salı)
  site/data/youtube.json             Pota Altı YouTube kanalının son canlı yayınları ve son videoları

Kaynak dosyalar internetten okunur; biten maçların kutu skorları cache/ klasöründe saklanır (bir daha indirilmez).
  python veri/uret.py            # kaynak: https://potaalti.github.io/tbl_fantezi_lig/data
  python veri/uret.py --kaynak C:/.../tbl-fantezi/site/data   # yerel kopyadan
"""
import argparse
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
CIKTI = KOK / "site" / "data"
CACHE = KOK / "cache"
VARSAYILAN_KAYNAK = "https://potaalti.github.io/tbl_fantezi_lig/data"
LIGLER = {"tbl": "Türkiye Basketbol Ligi", "bsl": "Basketbol Süper Ligi"}
# Pota Altı YouTube kanalı (youtube.com/@potaaltitv)
YOUTUBE = {"id": "UCIkf6xlbhB23cSYr57ltiPA", "kullanici": "potaaltitv", "ad": "Pota Altı"}
TARAYICI = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def oku(kaynak, yol, kalici=False):
    """Kaynaktan JSON okur. kalici: değişmeyecek dosya (biten maçın kutu skoru), cache'ten okunur."""
    cache_yol = CACHE / yol
    if kalici and cache_yol.exists():
        return json.loads(cache_yol.read_text(encoding="utf-8"))
    if kaynak.startswith("http"):
        for deneme in range(3):
            try:
                istek = urllib.request.Request(f"{kaynak}/{yol}?t={int(time.time())}", headers={"User-Agent": "PotaAltiApp"})
                with urllib.request.urlopen(istek, timeout=30) as y:
                    veri = json.loads(y.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if deneme == 2:
                    raise
                time.sleep(2)
            except OSError:
                if deneme == 2:
                    raise
                time.sleep(2)
    else:
        dosya = Path(kaynak) / yol
        if not dosya.exists():
            return None
        veri = json.loads(dosya.read_text(encoding="utf-8"))
    if kalici:
        cache_yol.parent.mkdir(parents=True, exist_ok=True)
        cache_yol.write_text(json.dumps(veri, ensure_ascii=False), encoding="utf-8")
    return veri


def yaz(yol, veri):
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(json.dumps(veri, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# Takım istatistikleri (takım ribaundu, takım top kaybı, takım faulü) kaynak kutu skorlarda yok: TBF'nin maç istatistiğinden
TBF_API = "https://www.tbf.org.tr/api"
TURKIYE = timezone(timedelta(hours=3))
TBF_SAYFA = {"tbl": "https://www.tbf.org.tr/ligler/tbl-2026-2027/maclar", "bsl": "https://www.tbf.org.tr/ligler/bsl-2026-2027/maclar"}
TAKIM_ALANLARI = {"hr": "offensiveRebounds", "sr": "defensiveRebounds", "rib": "totalRebounds", "tk": "turnovers", "faul": "fouls"}


def takim_istatistik_uret(lig, maclar, en_fazla=80):
    """Biten maçların takım istatistiklerini çıktı dosyasına ekler; dosyadaki maçlar bir daha çekilmez. TBF istatistiği
    henüz yayınlamadıysa maç atlanır, sonraki çalışmada yeniden denenir. Bir çalışmada en fazla en_fazla maç çekilir."""
    yol = CIKTI / lig / "takim-istatistik.json"
    kayit = json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else {}
    eksik = [m for m in maclar if m["durum"] == "bitti" and str(m["id"]) not in kayit][:en_fazla]
    for m in eksik:
        try:
            req = urllib.request.Request(f"{TBF_API}/Match/mac-istatistik?matchId={m['id']}",
                                         headers={"User-Agent": TARAYICI, "Accept": "application/json", "Referer": TBF_SAYFA[lig]})
            with urllib.request.urlopen(req, timeout=30) as yanit:
                veri = json.load(yanit).get("data") or {}
            time.sleep(0.3)
        except Exception as e:  # noqa: BLE001 - TBF'ye ulaşılamazsa sonraki çalışmada devam edilir
            print(f"{lig}: takım istatistiği alınamadı ({m['id']}):", e)
            break
        ev, dep = veri.get("homeTeamStats"), veri.get("awayTeamStats")
        if not ev or not dep:
            continue
        kayit[str(m["id"])] = {t: {k: sayi(d.get(a)) for k, a in TAKIM_ALANLARI.items()} for t, d in (("ev", ev), ("dep", dep))}
    if eksik or not yol.exists():
        yaz(yol, kayit)


def anahtar(ad):
    """Takım adından adres dostu kimlik: 'FENERBAHÇE BEKO' -> 'fenerbahce-beko'"""
    s = ad.replace("İ", "I").replace("ı", "i").lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def saniye(sure):
    try:
        dk, sn = str(sure or "0:00").split(":")
        return int(dk) * 60 + int(sn)
    except ValueError:
        return 0


def sayi(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return 0


ALANLAR = ["sayi", "rib", "hr", "sr", "ast", "tc", "blk", "tk", "faul", "vp"]


def tbf_getir(lig, yol):
    req = urllib.request.Request(f"{TBF_API}{yol}", headers={"User-Agent": TARAYICI, "Accept": "application/json", "Referer": TBF_SAYFA[lig]})
    with urllib.request.urlopen(req, timeout=30) as yanit:
        return json.load(yanit).get("data") or {}


def seyirci_uret(lig, maclar, en_fazla=150):
    """Biten maçların seyirci sayısı (TBF maç başlığı, matchSpectatorCount). Sadece --gunluk ile (telefonun günde 2 kezlik
    tam güncellemesi) ve federasyon sayıyı maçtan sonraki gün işlediği için Cumartesi, Pazar, Pazartesi ve Salı (Türkiye saati)
    çalışır: sayısı olmayan maçlar ve son 3 günün maçları yeniden sorulur.
    Dosya yoksa (ilk çalışma) gün beklemeden bütün sezon çekilir. 0 = sayı girilmemiş (ya da seyircisiz)."""
    yol = CIKTI / lig / "seyirci.json"
    kayit = json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else {"maclar": {}}
    simdi = datetime.now(TURKIYE)
    if yol.exists() and simdi.weekday() not in (5, 6, 0, 1):
        return
    sinir = (simdi - timedelta(days=3)).replace(tzinfo=None).isoformat()
    eksik = [m for m in maclar if m["durum"] == "bitti"
             and (not kayit["maclar"].get(str(m["id"])) or m["tarih"] >= sinir)][:en_fazla]
    degisti = not yol.exists()
    for m in eksik:
        try:
            sayi_ = tbf_getir(lig, f"/Match/mac-header?matchId={m['id']}").get("matchSpectatorCount")
            time.sleep(0.2)
        except Exception as e:  # noqa: BLE001 - TBF'ye ulaşılamazsa sonraki çalışmada devam edilir
            print(f"{lig}: seyirci alınamadı ({m['id']}):", e)
            break
        if sayi_ is not None and kayit["maclar"].get(str(m["id"])) != sayi_:
            kayit["maclar"][str(m["id"])] = sayi_
            degisti = True
    if degisti:
        kayit["guncelleme"] = simdi.isoformat(timespec="seconds")
        yaz(yol, kayit)


TBF_LIG = {"tbl": 22215, "bsl": 22214}
TBF_SEZON = 174


def tbf_resim(url, yol):
    """TBF'nin resim sunucusu sadece tarayıcı gibi (Referer ile) istenince veriyor."""
    url = urllib.parse.quote(url, safe=":/?&=%")
    req = urllib.request.Request(url, headers={"User-Agent": TARAYICI, "Referer": "https://www.tbf.org.tr/", "Accept": "image/*"})
    with urllib.request.urlopen(req, timeout=30) as yanit:
        veri = yanit.read()
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_bytes(veri)


def uzanti(url):
    return Path(urllib.parse.urlparse(url).path).suffix.lower() or ".png"


def gorsel_uret(lig):
    """Haftanın ödülleri görselleri için oyuncu fotoğrafları ve takım logoları (TBF'den, sitenin kendi dosyalarına; TBF'nin
    resimleri başka siteden çizilemiyor). Sadece yeni ya da adresi değişenler indirilir.
      site/data/<lig>/gorsel.json   {"foto": {oyuncu id: TBF adresi}, "logo": {takım adı: TBF adresi}}
      site/data/<lig>/foto/<id>.<uzantı>, site/data/<lig>/logo/<takım anahtarı>.<uzantı> (uzantı TBF adresindeki)"""
    yol = CIKTI / lig / "gorsel.json"
    kayit = json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else {"foto": {}, "logo": {}}
    degisti = False
    try:
        takimlar = tbf_getir(lig, f"/Team/get-teams-by-leauge?leaugeId={TBF_LIG[lig]}") or []
        for t in takimlar:
            url = t.get("teamLogoUrl")
            if url and kayit["logo"].get(t["teamName"]) != url:
                tbf_resim(url, CIKTI / lig / "logo" / f"{anahtar(t['teamName'])}{uzanti(url)}")
                kayit["logo"][t["teamName"]] = url
                degisti = True
            kadro = tbf_getir(lig, f"/Team/get-team-active-player-list-by-season-and-league?LeagueId={TBF_LIG[lig]}"
                                   f"&SeasonId={TBF_SEZON}&TeamProcessId={t['teamProcessId']}&prefix={lig}") or []
            for o in kadro:
                pid, url = str(o["personId"]), o.get("playerPhoto")
                if url and kayit["foto"].get(pid) != url:
                    tbf_resim(url, CIKTI / lig / "foto" / f"{pid}{uzanti(url)}")
                    kayit["foto"][pid] = url
                    degisti = True
                    time.sleep(0.1)
    except Exception as e:  # noqa: BLE001 - kalanlar sonraki çalışmada indirilir
        print(f"{lig}: oyuncu fotoğrafları alınamadı:", e)
    if degisti:
        yaz(yol, kayit)


def lig_uret(kaynak, lig, bilgi, gunluk=False):
    haftalar = bilgi["haftalar"]
    hafta_ozet = []  # TBL Fantezi için: haftaların ilk maç saati ve maç sayısı
    takimlar = {}  # anahtar -> kayıt
    oyuncular = {}  # id -> kayıt
    maclar_hepsi = []

    def takim(ad):
        k = anahtar(ad)
        return takimlar.setdefault(k, {
            "id": k, "ad": ad, "o": 0, "g": 0, "m": 0, "atilan": 0, "yenilen": 0, "seri": [], "maclar": [],
            "toplam": {a: 0 for a in ALANLAR} | {"iki": [0, 0], "uc": [0, 0], "sa": [0, 0]}, "kutuMac": 0, "oyuncular": set(),
        })

    for h in haftalar:
        liste = oku(kaynak, f"maclar/{lig}-{h}.json")
        if not liste:
            continue
        saatli = sorted(m["tarih"] for m in liste["maclar"] if not m["tarih"].endswith("T00:00:00"))
        hafta_ozet.append({"hafta": h, "ilkMac": f"{saatli[0]}+03:00" if saatli else None, "macSayisi": len(liste["maclar"]),
                           "bitti": bool(liste["maclar"]) and all(m["durum"] == "bitti" for m in liste["maclar"])})
        for m in liste["maclar"]:
            # Kaynakta saati belli olmayan ileri tarihli maçlar skorsuz "canli" gelebiliyor: oynanmadı sayılır
            if m["durum"] == "canli" and m.get("evSkor") is None and m["tarih"] > datetime.now().isoformat():
                m["durum"] = "oynanmadi"
            ev, dep = takim(m["ev"]), takim(m["dep"])
            ozet = {"id": m["id"], "hafta": h, "tarih": m["tarih"], "durum": m["durum"], "ev": ev["id"], "dep": dep["id"],
                    "evSkor": m.get("evSkor"), "depSkor": m.get("depSkor")}
            maclar_hepsi.append(ozet)
            ev["maclar"].append(m["id"])
            dep["maclar"].append(m["id"])
            if m["durum"] == "oynanmadi":
                continue
            kutu = oku(kaynak, f"mac/{m['id']}.json", kalici=m["durum"] == "bitti")
            if m["durum"] == "bitti":
                es, ds = sayi(m.get("evSkor")), sayi(m.get("depSkor"))
                for t, a, y in ((ev, es, ds), (dep, ds, es)):
                    t["o"] += 1
                    t["atilan"] += a
                    t["yenilen"] += y
                    kazandi = a > y
                    t["g" if kazandi else "m"] += 1
                    t["seri"].append({"id": m["id"], "s": "G" if kazandi else "M", "tarih": m["tarih"]})
            if not kutu:
                continue
            for taraf, t, rakip in (("ev", ev, dep), ("dep", dep, ev)):
                kt = kutu.get(taraf) or {}
                skor, rakip_skor = sayi(kt.get("skor")), sayi((kutu.get("dep" if taraf == "ev" else "ev") or {}).get("skor"))
                if m["durum"] == "bitti":
                    t["kutuMac"] += 1
                for o in kt.get("oyuncular", []):
                    pid = str(o["id"])
                    if pid.startswith("fiba-"):
                        continue  # TBF kimliği henüz belli olmayan canlı oyuncu
                    sn = saniye(o.get("sure"))
                    if m["durum"] == "bitti":
                        for a in ALANLAR:
                            t["toplam"][a] += sayi(o.get(a))
                        for a in ("iki", "uc", "sa"):
                            t["toplam"][a][0] += sayi((o.get(a) or [0, 0])[0])
                            t["toplam"][a][1] += sayi((o.get(a) or [0, 0])[1])
                    t["oyuncular"].add(pid)
                    p = oyuncular.setdefault(pid, {"id": pid, "ad": o["ad"], "takim": t["id"], "maclar": []})
                    p["ad"] = o["ad"]
                    p["takim"] = t["id"]  # en son oynadığı takım
                    p["maclar"].append({
                        "mac": m["id"], "hafta": h, "tarih": m["tarih"], "durum": m["durum"], "takim": t["id"], "rakip": rakip["id"],
                        "evde": taraf == "ev", "skor": skor, "rakipSkor": rakip_skor, "ilk5": bool(o.get("ilk5")), "sure": o.get("sure") or "0:00",
                        "sn": sn, **{a: sayi(o.get(a)) for a in ALANLAR}, "pm": sayi(o.get("pm")),
                        "iki": o.get("iki") or [0, 0], "uc": o.get("uc") or [0, 0], "sa": o.get("sa") or [0, 0],
                    })

    # ---------- Oyuncu sezon ortalamaları (biten maçlar, süre aldığı maçlar) ----------
    def ort(t, n):
        return round(t / n, 1) if n else 0

    oyuncu_ozet = []
    for p in oyuncular.values():
        biten = [x for x in p["maclar"] if x["durum"] == "bitti" and x["sn"] > 0]
        n = len(biten)
        top = {a: sum(x[a] for x in biten) for a in ALANLAR + ["pm", "sn"]}
        atis = {a: [sum(x[a][0] for x in biten), sum(x[a][1] for x in biten)] for a in ("iki", "uc", "sa")}
        p["ozet"] = {
            "id": p["id"], "ad": p["ad"], "takim": p["takim"], "mac": n,
            "ilk5": sum(1 for x in biten if x["ilk5"]),
            "dk": ort(top["sn"] / 60, n), **{a: ort(top[a], n) for a in ALANLAR}, "pm": top["pm"], "pmOrt": ort(top["pm"], n),
            "iki": atis["iki"], "uc": atis["uc"], "sa": atis["sa"],
        }
        oyuncu_ozet.append(p["ozet"])
        yaz(CIKTI / lig / "oyuncu" / f"{p['id']}.json", {"ozet": p["ozet"], "maclar": sorted(p["maclar"], key=lambda x: x["tarih"])})

    # ---------- Puan tablosu: galibiyet, eşitlikte sayı averajı ----------
    tablo = []
    for t in takimlar.values():
        t["seri"].sort(key=lambda x: x["tarih"])
        tablo.append({"id": t["id"], "ad": t["ad"], "o": t["o"], "g": t["g"], "m": t["m"], "atilan": t["atilan"], "yenilen": t["yenilen"],
                      "averaj": t["atilan"] - t["yenilen"], "puan": t["g"] * 2 + t["m"], "son5": [x["s"] for x in t["seri"][-5:]],
                      # tabloya giren maçlar: uygulama bundan sonra biten maçları canlı ekler
                      "sayilan": [x["id"] for x in t["seri"]]})
    tablo.sort(key=lambda x: (-x["g"], x["m"], -x["averaj"], -x["atilan"]))
    for i, s in enumerate(tablo):
        s["sira"] = i + 1

    # ---------- Liderler: maç başı ortalama (en az takımın oynadığı maçların yarısı kadar maç) ----------
    en_cok = max((t["o"] for t in takimlar.values()), default=0)
    esik = max(1, math.ceil(en_cok / 2))
    uygun = [o for o in oyuncu_ozet if o["mac"] >= esik]
    kategoriler = [
        ("sayi", "Sayı", "ort"), ("rib", "Ribaund", "ort"), ("ast", "Asist", "ort"), ("vp", "Verimlilik (VP)", "ort"),
        ("tc", "Top çalma", "ort"), ("blk", "Blok", "ort"), ("pm", "+/- (toplam)", "toplam"), ("dk", "Süre (dk)", "ort"),
        ("uc", "3 sayılık (isabet)", "atis"),
    ]
    liderler = {"esik": esik, "kategoriler": []}
    for anah, ad, tur in kategoriler:
        if tur == "atis":
            sirali = sorted(uygun, key=lambda o: (-o[anah][0], o[anah][1]))
            deger = lambda o: o[anah][0]
        else:
            sirali = sorted(uygun, key=lambda o: -o[anah])
            deger = lambda o: o[anah]
        liderler["kategoriler"].append({"id": anah, "ad": ad, "tur": tur, "liste": [
            {"id": o["id"], "ad": o["ad"], "takim": o["takim"], "mac": o["mac"], "deger": deger(o),
             **({"atis": o[anah]} if tur == "atis" else {})} for o in sirali[:15]]})

    # ---------- Takımlar ----------
    takim_ozet = []
    for t in takimlar.values():
        n = t["kutuMac"]
        takim_ozet.append({
            "id": t["id"], "ad": t["ad"], "o": t["o"], "g": t["g"], "m": t["m"],
            "ort": {a: ort(t["toplam"][a], n) for a in ALANLAR}, "atis": {a: t["toplam"][a] for a in ("iki", "uc", "sa")},
            "kadro": sorted((o for o in oyuncu_ozet if o["takim"] == t["id"]), key=lambda o: -o["dk"]),
            "maclar": t["maclar"],
        })
    takim_ozet.sort(key=lambda x: x["ad"])

    yaz(CIKTI / lig / "tablo.json", tablo)
    # Liderler günde 2 kez (telefonun tam güncellemesi, --gunluk); dosya yoksa hemen
    if gunluk or not (CIKTI / lig / "liderler.json").exists():
        yaz(CIKTI / lig / "liderler.json", liderler)
    yaz(CIKTI / lig / "oyuncular.json", sorted(oyuncu_ozet, key=lambda o: o["ad"]))
    yaz(CIKTI / lig / "takimlar.json", {"takimlar": takim_ozet, "maclar": maclar_hepsi})
    takim_istatistik_uret(lig, maclar_hepsi)
    if gunluk or not (CIKTI / lig / "seyirci.json").exists():
        seyirci_uret(lig, maclar_hepsi)
    if gunluk or not (CIKTI / lig / "gorsel.json").exists():
        gorsel_uret(lig)
    return {"ad": LIGLER[lig], "haftalar": haftalar, "guncel": bilgi.get("guncel"), "takimSayisi": len(takimlar),
            "oyuncuSayisi": len(oyuncular), "_haftaOzet": hafta_ozet}


def tbl_fantezi_uret(kaynak, bilgi, hafta_ozet):
    """TBL Fantezi Ligi (ortak motor, site/tbl/) için: haftaların ilk maç saatleri (değişikliğin geçerli olacağı hafta)
    ve TBL kadro hareketleri (lige katılan / takım değiştiren / ayrılan; yeni katılana 36 saat bekleme başlar)."""
    hedef = KOK / "site" / "tbl" / "data"
    yaz(hedef / "index.json", {"guncelHafta": bilgi.get("guncel"), "haftalar": hafta_ozet,
                               "guncelleme": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    rehber = oku(kaynak, "oyuncular.json") or {}
    onceki_yol = CACHE / "tbl_rehber.json"
    hareket_yol = hedef / "hareketler.json"
    hareketler = json.loads(hareket_yol.read_text(encoding="utf-8")) if hareket_yol.exists() else []
    if onceki_yol.exists():
        onceki = json.loads(onceki_yol.read_text(encoding="utf-8"))
        zaman = datetime.now(timezone.utc).isoformat(timespec="seconds")
        yeni = []
        for pid, o in rehber.items():
            e = onceki.get(pid)
            if o.get("aktif") and (not e or not e.get("aktif")):
                yeni.append({"zaman": zaman, "id": pid, "ad": o["ad"], "tur": "yeni", "yeniTakim": o.get("takim")})
            elif o.get("aktif") and e.get("takim") != o.get("takim"):
                yeni.append({"zaman": zaman, "id": pid, "ad": o["ad"], "tur": "transfer", "eskiTakim": e.get("takim"), "yeniTakim": o.get("takim")})
        for pid, e in onceki.items():
            if e.get("aktif") and not (rehber.get(pid) or {}).get("aktif"):
                yeni.append({"zaman": zaman, "id": pid, "ad": e["ad"], "tur": "ayrildi", "eskiTakim": e.get("takim")})
        # Oyuncunun son hareketiyle aynıysa yazılmaz: veri başka yerden (bilgisayar/telefon) önce işlendiyse yeni katılanın
        # 36 saatlik talep süresi yeniden başlamasın
        son = {}
        for h in hareketler:
            son.setdefault(h["id"], (h["tur"], h.get("eskiTakim"), h.get("yeniTakim")))
        yeni = [h for h in yeni if son.get(h["id"]) != (h["tur"], h.get("eskiTakim"), h.get("yeniTakim"))]
        sinir = (datetime.now(timezone.utc).timestamp() - 90 * 86400)
        hareketler = [h for h in yeni + hareketler if datetime.fromisoformat(h["zaman"]).timestamp() >= sinir]
    yaz(hareket_yol, hareketler)
    CACHE.mkdir(parents=True, exist_ok=True)
    onceki_yol.write_text(json.dumps({pid: {"ad": o["ad"], "takim": o.get("takim"), "aktif": o.get("aktif")} for pid, o in rehber.items()},
                                     ensure_ascii=False), encoding="utf-8")


def youtube_uret():
    """Kanalın video akışından (RSS) son videolar, Canlı sekmesinden son canlı yayınlar. API anahtarı gerekmez."""
    import xml.etree.ElementTree as ET

    def indir(url):
        istek = urllib.request.Request(url, headers={"User-Agent": TARAYICI, "Accept-Language": "tr-TR"})
        with urllib.request.urlopen(istek, timeout=30) as y:
            return y.read()

    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}
    kok = ET.fromstring(indir(f"https://www.youtube.com/feeds/videos.xml?channel_id={YOUTUBE['id']}"))
    videolar = []
    for e in kok.findall("a:entry", ns):
        ist = e.find("m:group/m:community/m:statistics", ns)
        videolar.append({
            "id": e.find("yt:videoId", ns).text, "baslik": e.find("a:title", ns).text, "tarih": e.find("a:published", ns).text,
            "kisa": "/shorts/" in (e.find("a:link", ns).get("href") or ""), "izlenme": int(ist.get("views")) if ist is not None else None,
        })
    # Canlı sekmesi: sayfadaki ilk veri (ytInitialData) içindeki yayın kartları, en yenisi başta
    sayfa = indir(f"https://www.youtube.com/@{YOUTUBE['kullanici']}/streams").decode("utf-8", "replace")
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", sayfa)
    yayinlar = []

    def gez(o):
        if isinstance(o, dict):
            if "lockupViewModel" in o:
                v = o["lockupViewModel"]
                md = v.get("metadata", {}).get("lockupMetadataViewModel", {})
                satirlar = [p.get("text", {}).get("content", "") for r in md.get("metadata", {}).get("contentMetadataViewModel", {}).get("metadataRows", [])
                            for p in r.get("metadataParts", [])]
                metin = " ".join(satirlar).lower()
                yayinlar.append({"id": v.get("contentId"), "baslik": md.get("title", {}).get("content", ""), "bilgi": " · ".join(x for x in satirlar if x),
                                 "canli": "izliyor" in metin or "watching" in metin, "planli": "planlan" in metin or "scheduled" in metin})
            for x in o.values():
                gez(x)
        elif isinstance(o, list):
            for x in o:
                gez(x)

    if m:
        gez(json.loads(m.group(1)))
    yayinlar = [y for y in yayinlar if y["id"]][:12]
    yaz(CIKTI / "youtube.json", {"kanal": YOUTUBE, "guncelleme": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                 "yayinlar": yayinlar, "videolar": videolar})
    return len(yayinlar), len(videolar)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kaynak", default=VARSAYILAN_KAYNAK)
    ap.add_argument("--gunluk", action="store_true", help="günde 2 kezlik güncelleme: liderler ve (Cumartesi–Salı) seyirci sayıları")
    args = ap.parse_args()
    index = oku(args.kaynak, "hafta/index.json")
    meta = {"guncelleme": datetime.now(timezone.utc).isoformat(timespec="seconds"), "kaynakGuncelleme": index.get("guncelleme"), "ligler": {}}
    for lig in LIGLER:
        bilgi = (index.get("maclar") or {}).get(lig)
        if not bilgi:
            continue
        meta["ligler"][lig] = lig_uret(args.kaynak, lig, bilgi, args.gunluk)
        hafta_ozet = meta["ligler"][lig].pop("_haftaOzet")
        if lig == "tbl":
            tbl_fantezi_uret(args.kaynak, bilgi, hafta_ozet)
        print(f"{lig}: {meta['ligler'][lig]['takimSayisi']} takım, {meta['ligler'][lig]['oyuncuSayisi']} oyuncu")
    try:
        y, v = youtube_uret()
        print(f"youtube: {y} canlı yayın, {v} video")
    except Exception as e:  # YouTube okunamazsa önceki dosya kalır; ligler etkilenmez
        print("youtube okunamadı:", e)
    yaz(CIKTI / "meta.json", meta)
    print("tamam:", CIKTI)


if __name__ == "__main__":
    sys.exit(main())
