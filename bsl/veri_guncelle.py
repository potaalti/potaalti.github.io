"""Pota Altı BSL Fantezi Ligi verisi: TBF sitesinden BSL oyuncularını ve haftalık verimlilik (VP) puanlarını çeker.

Çıktılar (site/bsl/data/):
  oyuncular.json   -> bütün BSL oyuncuları: ad, takım, ülke, Türk mü, bu sezonun maç başı VP ortalaması
  hafta/<n>.json   -> haftanın maçları ve oyuncuların o haftaki VP'si ve süresi
  index.json       -> sezonun bütün haftaları (ilk maç saatleriyle), güncel hafta, güncelleme zamanı
  maclar/<n>.json  -> Maçlar sekmesi: haftanın fikstürü ve skorları (sezonun bütün haftaları)

Biten maçların istatistikleri cache/ klasöründe saklanır, tekrar indirilmez.
Maç sırasında TBF oyuncu istatistiği yayınlamadığı için canlı skor ve VP'ler FIBA LiveStats'ten okunur;
TBF maçı "bitti" yapınca kesin veri TBF'den alınır.
Kullanım:  python veri_guncelle.py            -> her şeyi günceller (günde 2 kez)
           python veri_guncelle.py --akilli   -> sadece maç saatlerinde çalışır (3 dakikada bir tetiklenir)
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Web dosyaları Pota Altı App'in site/bsl/ klasöründe
DATA = ROOT.parent / "site" / "bsl" / "data"
CACHE = ROOT / "cache"

API = "https://www.tbf.org.tr/api"
LIG_ID = 22214  # BSL 2026-2027
SEZON_ID = 174
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.tbf.org.tr/ligler/bsl-2026-2027/maclar",
}
TURKIYE = timezone(timedelta(hours=3))  # TBF maç saatleri Türkiye saatiyle
# Maç saati: başlamadan 10 dk önceden, TBF maçı "bitti" yapana kadar (en fazla 6 saat) canlı izlenir
MAC_ONCESI, MAC_PENCERESI = timedelta(minutes=10), timedelta(hours=6)
FIBA_URL = "https://fibalivestats.dcd.shared.geniussports.com/data/{}/data.json"
TR_HARF = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})
KILIT = CACHE / "calisiyor.kilit"

# TBF matchStatusId: 1 = maç sonu, 4 = oynanmadı; diğerleri canlı kabul edilir
DURUM_BITTI, DURUM_OYNANMADI = 1, 4
STAT_LISTELERI = (("homeTopFive", "ev"), ("homeBenchPlayers", "ev"),
                  ("awayTopFive", "dep"), ("awayBenchPlayers", "dep"))


def api(yol, deneme=3):
    for i in range(deneme):
        try:
            req = urllib.request.Request(API + yol, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                veri = json.load(r)
            time.sleep(0.3)
            return veri["data"]
        except Exception as e:  # noqa: BLE001 - ağ hatalarında yeniden dene
            if i == deneme - 1:
                raise RuntimeError(f"TBF isteği başarısız: {yol} ({e})") from e
            time.sleep(2 * (i + 1))


def json_yaz(yol, veri):
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")


def saniye(sure):
    """'25:48' -> 1548"""
    try:
        dk, sn = (sure or "0:00").split(":")
        return int(dk) * 60 + int(sn)
    except ValueError:
        return 0


def turk_mu(ulke):
    """Türk oyuncu kuralı için: TÜRKİYE ve KKTC"""
    u = (ulke or "").upper()
    return u in ("TÜRKİYE", "TURKIYE", "KKTC") or "KIBRIS" in u


def durum_adi(status_id):
    if status_id == DURUM_BITTI:
        return "bitti"
    if status_id == DURUM_OYNANMADI:
        return "oynanmadi"
    return "canli"


def onbellekli(ad, yol, sakla):
    """sakla(veri) True ise veri cache/ad dosyasına yazılır; dosya varsa TBF'ye gidilmez."""
    cache_yol = CACHE / ad
    if cache_yol.exists():
        return json.loads(cache_yol.read_text(encoding="utf-8"))
    veri = api(yol)
    if sakla(veri):
        json_yaz(cache_yol, veri)
    return veri


def hafta_maclari(hafta, guncel):
    """Haftanın maç listesi; bütün maçları bitmiş geçmiş haftalar önbellekten okunur."""
    yol = f"/Match/get-all-matches-for-filter?ActivityId={LIG_ID}&WeekFilter={hafta}&Page=1&PageSize=-1"
    if hafta >= guncel:
        return api(yol) or []
    return onbellekli(f"hafta-{hafta}.json", yol,
                      lambda v: bool(v) and all(m["matchStatusId"] == DURUM_BITTI for m in v)) or []


def mac_istatistik(mac_id, bitti):
    yol = f"/Match/mac-istatistik?matchId={mac_id}"
    if not bitti:
        return api(yol) or {}
    # TBF maçı "bitti" yapıp istatistikleri birkaç dakika geç yayınlayabiliyor: boş veriyi saklama
    return onbellekli(f"mac-{mac_id}.json", yol, lambda v: bool((v or {}).get("homeTopFive"))) or {}


# ---------- FIBA LiveStats: maç sırasındaki canlı veri ----------
def ad_anahtari(ad):
    """'Ali Işık (K)' ve 'ALI ISIK' aynı anahtara iner (FIBA ve TBF adlarını eşleştirmek için)."""
    s = (ad or "").replace("İ", "i").replace("I", "ı").lower().translate(TR_HARF)
    return " ".join("".join(c if c.isalnum() else " " for c in s.replace("(k)", " ")).split())


def fiba_canli(genius_id):
    try:
        req = urllib.request.Request(FIBA_URL.format(genius_id), headers={"User-Agent": HEADERS["User-Agent"]})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code not in (403, 404):  # 403/404: maç henüz başlamadı, FIBA'da veri yok
            print(f"  FIBA canlı veri alınamadı ({genius_id}): {e}")
        return None
    except Exception as e:  # noqa: BLE001 - canlı veri yoksa maç TBF'deki haliyle kalır
        print(f"  FIBA canlı veri alınamadı ({genius_id}): {e}")
        return None


def fiba_basladi(d):
    return any(saniye(p.get("sMinutes")) > 0 for t in d.get("tm", {}).values() for p in (t.get("pl") or {}).values())


def fiba_istatistik(d, mac, kimlik):
    """FIBA verisini TBF mac-istatistik biçimine çevirir. Oyuncular TBF kimliğine ad + takım ile eşlenir.
    Döndürür: (istatistik, ev skoru, deplasman skoru, canlı durum)"""
    stat = {}
    for tno, taraf, kisa in (("1", "home", "ev"), ("2", "away", "dep")):
        tm = d["tm"][tno]
        ilk5, yedek = [], []
        for p in (tm.get("pl") or {}).values():
            ad = f"{p.get('firstName', '')} {p.get('familyName', '')}".strip()
            pid = kimlik.get((ad_anahtari(ad), mac[f"{kisa}Id"])) or "fiba-" + ad_anahtari(ad).replace(" ", "-")
            sn = saniye(p.get("sMinutes"))
            kayit = {
                "playerId": pid, "playerName": ad, "minutesPlayed": f"{sn // 60}:{sn % 60:02d}",
                "efficiency": p.get("eff_1", 0), "totalRebounds": p.get("sReboundsTotal", 0),
                "blocks": p.get("sBlocks", 0), "assists": p.get("sAssists", 0),
            }
            (ilk5 if p.get("starter") else yedek).append(kayit)
        stat[f"{taraf}TopFive"], stat[f"{taraf}BenchPlayers"] = ilk5, yedek
    durum = {"periyot": d.get("period"), "saat": d.get("clock"), "uzatma": d.get("periodType") == "OVERTIME"}
    return stat, str(d["tm"]["1"].get("score", 0)), str(d["tm"]["2"].get("score", 0)), durum


def mac_saatinde(tarih, simdi=None):
    """Maç başlamak üzere ya da oynanıyor/kesinleşmedi mi (başlamadan 10 dk önce - 6 saat sonra)."""
    if tarih.endswith("T00:00:00"):  # TBF saati belli olmayan maçı 00:00 verir
        return False
    simdi = simdi or datetime.now(TURKIYE).replace(tzinfo=None)
    baslama = datetime.fromisoformat(tarih)
    return baslama - MAC_ONCESI <= simdi <= baslama + MAC_PENCERESI


def guncelleme_gerekli():
    """--akilli: sitedeki son veriye göre bitmemiş bir maçın saatinde miyiz (internete çıkmadan)."""
    try:
        guncel = json.loads((DATA / "index.json").read_text(encoding="utf-8"))["guncelHafta"]
    except (OSError, ValueError, KeyError):
        return True
    for hafta in (guncel, guncel + 1):
        yol = DATA / "maclar" / f"{hafta}.json"
        if not yol.exists():
            continue
        for m in json.loads(yol.read_text(encoding="utf-8"))["maclar"]:
            if m["durum"] != "bitti" and mac_saatinde(m["tarih"]):
                return True
    return False


def mac_kaydi(m):
    return {
        "id": m["matchId"], "tarih": m["matchDate"], "durum": durum_adi(m["matchStatusId"]),
        "ev": m["homeTeam"]["name"], "evId": m["homeTeam"]["id"], "evSkor": m["homeTeam"]["score"] or None,
        "dep": m["awayTeam"]["name"], "depId": m["awayTeam"]["id"], "depSkor": m["awayTeam"]["score"] or None,
        "salon": m.get("salonAdi"), "yayin": m.get("broadcastChannel"),
    }


def ilk_mac(maclar):
    """Haftanın ilk maçının saati (kadro değişikliğinin hangi haftadan geçerli olacağı buna göre)."""
    tarihler = [m["tarih"] for m in maclar if m.get("tarih")]
    return f"{min(tarihler)}+03:00" if tarihler else None


def mevki_tahmini(stat, boy):
    """Ön/Arka saha tahmini (TBF'de mevki bilgisi yok). Ribaund ve blok, asistin iki katından fazlaysa Ön.
    Kanat oyuncularında yanılabilir; kesin mevkiyi yönetici sitede belirler. Hiç oynamamışsa boydan."""
    if stat and stat["rib"] + stat["ast"] + stat["blk"] > 0:
        return "on" if stat["rib"] + 2 * stat["blk"] >= 2 * stat["ast"] else "arka"
    if boy:
        return "on" if boy >= 201 else "arka"
    return None


def kadro_hareketleri(eski, yeni):
    """BSL kadrolarındaki değişiklikler (yöneticiye bildirim): lige yeni gelen, takım değiştiren ve ligden
    ayrılan oyuncular. site/bsl/data/bsl_hareketleri.json'a en yenisi başta eklenir; son 90 gün tutulur."""
    simdi = datetime.now(timezone.utc)
    yeni_kayitlar = []
    for pid, o in yeni.items():
        e = eski.get(pid)
        kayit = {"zaman": simdi.isoformat(timespec="seconds"), "id": pid, "ad": o["ad"]}
        if o.get("aktif") and not (e and e.get("aktif")):
            yeni_kayitlar.append({**kayit, "tur": "yeni", "yeniTakim": o["takim"]})
        elif o.get("aktif") and e.get("takim") != o["takim"]:
            yeni_kayitlar.append({**kayit, "tur": "transfer", "eskiTakim": e.get("takim"), "yeniTakim": o["takim"]})
        elif e and e.get("aktif") and not o.get("aktif"):
            yeni_kayitlar.append({**kayit, "tur": "ayrildi", "eskiTakim": e.get("takim")})
    yol = DATA / "bsl_hareketleri.json"
    eskiler = json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else []
    sinir = (simdi - timedelta(days=90)).isoformat(timespec="seconds")
    json_yaz(yol, yeni_kayitlar + [k for k in eskiler if k["zaman"] >= sinir])
    for k in yeni_kayitlar:
        print(f"  Kadro hareketi: {k['ad']} ({k['tur']})")


def kadrolar():
    """TBF takım kadroları: oyuncu id -> rehber kaydı (bu sezonun ortalamalarıyla)."""
    rehber = {}
    for t in api(f"/Team/get-teams-by-leauge?leaugeId={LIG_ID}"):
        kadro = api(f"/Team/get-team-active-player-list-by-season-and-league?LeagueId={LIG_ID}"
                    f"&SeasonId={SEZON_ID}&TeamProcessId={t['teamProcessId']}&prefix=bsl") or []
        for o in kadro:
            ulke = o.get("country") or ""
            rehber[str(o["personId"])] = {
                "id": str(o["personId"]),
                "ad": f"{o.get('firstName') or ''} {o.get('lastName') or ''}".strip(),
                "takim": t["teamName"], "takimId": t["teamProcessId"], "takimKod": t.get("teamCode") or "",
                "ulke": ulke, "turk": turk_mu(ulke), "aktif": True,
                "mac": o.get("macSayisi") or 0,
                "vpOrt": round(o.get("verimlilikPuani") or 0, 1),
                "sayiOrt": round(o.get("sayi") or 0, 1),
                "sureOrt": o.get("sure") or "00:00",
                "foto": o.get("playerPhoto"), "boy": o.get("height"),
            }
    return rehber


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    akilli = "--akilli" in sys.argv
    if akilli and not guncelleme_gerekli():
        return
    # Önceki güncelleme hâlâ sürüyorsa (ör. 3 dakikalık tetikleme üst üste bindiyse) çık
    if KILIT.exists() and time.time() - KILIT.stat().st_mtime < 600:
        print("Önceki güncelleme hâlâ sürüyor, atlandı.")
        return
    KILIT.parent.mkdir(parents=True, exist_ok=True)
    KILIT.write_text(datetime.now().isoformat(), encoding="utf-8")
    try:
        guncelle(akilli)
    finally:
        KILIT.unlink(missing_ok=True)


def guncelle(akilli):
    print(f"{datetime.now(TURKIYE):%d.%m.%Y %H:%M} {'maç saati güncellemesi' if akilli else 'tam güncelleme'}")
    tbf_haftalar = api(f"/League/get-league-weeks?leagueId={LIG_ID}&seasonId={SEZON_ID}")
    tum = sorted(int(h["sezon_Hafta"]) for h in tbf_haftalar)
    guncel = next((int(h["sezon_Hafta"]) for h in tbf_haftalar if h["isCurrentWeek"]), 1)
    print(f"Güncel BSL haftası: {guncel}")

    onceki_index = {}
    if (DATA / "index.json").exists():
        onceki_index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    onceki_takvim = {h["hafta"]: h for h in onceki_index.get("haftalar", [])}
    # Maç saati güncellemesinde TBF kadroları yeniden çekilmez (günde 2 tam güncelleme yeter)
    if akilli and (DATA / "oyuncular.json").exists():
        rehber = {o["id"]: o for o in json.loads((DATA / "oyuncular.json").read_text(encoding="utf-8")) if o.get("aktif")}
    else:
        rehber = kadrolar()
    print(f"TBF kadrolarında {len(rehber)} oyuncu")
    kimlik = {(ad_anahtari(o["ad"]), o["takimId"]): pid for pid, o in rehber.items()}

    # Bütün haftaların fikstürü (ilk maç saatleri için); oynanmış haftaların oyuncu VP'leri
    takvim, sezon_stat = [], {}  # sezon_stat: kadroda olmayan (ligden ayrılan) oyuncular için
    for hafta in tum:
        # Maç saati güncellemesinde uzak haftaların fikstürü yeniden çekilmez
        if akilli and hafta > guncel + 1 and hafta in onceki_takvim:
            takvim.append(onceki_takvim[hafta])
            continue
        ham = sorted(hafta_maclari(hafta, guncel), key=lambda x: x["matchDate"])
        maclar = [mac_kaydi(m) for m in ham]
        takvim.append({"hafta": hafta, "ilkMac": ilk_mac(maclar), "macSayisi": len(maclar),
                       "bitti": bool(maclar) and all(m["durum"] == "bitti" for m in maclar)})
        if hafta > guncel + 1:
            json_yaz(DATA / "maclar" / f"{hafta}.json", {"hafta": hafta, "maclar": maclar})
            continue
        oyuncular = {}
        for mac, m in zip(maclar, ham):
            stat = None
            # Başlamış ama TBF'de henüz bitmemiş maç: canlı veri FIBA LiveStats'ten
            if mac["durum"] != "bitti" and m.get("genuisId") and mac_saatinde(mac["tarih"]):
                d = fiba_canli(m["genuisId"])
                if d and fiba_basladi(d):
                    stat, ev, dep, durum = fiba_istatistik(d, mac, kimlik)
                    mac.update(durum="canli", evSkor=ev, depSkor=dep, canliDurum=durum)
            if stat is None:
                if mac["durum"] == "oynanmadi":
                    continue
                stat = mac_istatistik(mac["id"], mac["durum"] == "bitti")
            for liste, taraf in STAT_LISTELERI:
                for o in stat.get(liste) or []:
                    pid = str(o["playerId"])
                    if pid.startswith("fiba-"):  # TBF'de eşleşmeyen canlı oyuncu hiçbir fantezi takımında olamaz
                        continue
                    k = oyuncular.setdefault(pid, {"ad": o["playerName"].strip(), "takim": mac[taraf],
                                                   "takimId": mac[f"{taraf}Id"], "vp": 0, "saniye": 0, "mac": 0})
                    k["vp"] += o.get("efficiency") or 0
                    k["saniye"] += saniye(o.get("minutesPlayed"))
                    k["mac"] += 1
                    s = sezon_stat.setdefault(pid, {"ad": k["ad"], "vp": 0, "mac": 0, "rib": 0, "blk": 0, "ast": 0})
                    s.update(takim=mac[taraf], takimId=mac[f"{taraf}Id"])
                    if saniye(o.get("minutesPlayed")) > 0:
                        s["vp"] += o.get("efficiency") or 0
                        s["mac"] += 1
                        s["rib"] += o.get("totalRebounds") or 0
                        s["blk"] += o.get("blocks") or 0
                        s["ast"] += o.get("assists") or 0
        json_yaz(DATA / "maclar" / f"{hafta}.json", {"hafta": hafta, "maclar": maclar})
        json_yaz(DATA / "hafta" / f"{hafta}.json", {"hafta": hafta, "maclar": maclar, "oyuncular": oyuncular})
        biten = sum(1 for m in maclar if m["durum"] == "bitti")
        print(f"  Hafta {hafta}: {biten}/{len(maclar)} maç bitti, {len(oyuncular)} oyuncu")

    # Kadroda olmayan ama bu sezon BSL'de oynamış oyuncular (takımından ayrılanlar)
    eski = {}
    eski_yol = DATA / "oyuncular.json"
    if eski_yol.exists():
        eski = {o["id"]: o for o in json.loads(eski_yol.read_text(encoding="utf-8"))}
    for pid, s in sezon_stat.items():
        if pid in rehber:
            continue
        onceki = eski.get(pid, {})
        rehber[pid] = {
            "id": pid, "ad": s["ad"], "takim": s["takim"], "takimId": s["takimId"], "takimKod": onceki.get("takimKod", ""),
            "ulke": onceki.get("ulke", ""), "turk": onceki.get("turk", False), "aktif": False,
            "mac": s["mac"], "vpOrt": round(s["vp"] / s["mac"], 1) if s["mac"] else 0,
            "sayiOrt": onceki.get("sayiOrt", 0), "sureOrt": onceki.get("sureOrt", "00:00"), "foto": onceki.get("foto"),
        }
    # Daha önce listede olup artık hiçbir yerde görünmeyen oyuncu da kalır (bir fantezi takımında olabilir)
    for pid, o in eski.items():
        rehber.setdefault(pid, {**o, "aktif": False})
    for pid, o in rehber.items():
        s = sezon_stat.get(pid)
        o["mevkiTahmini"] = mevki_tahmini(s, o.get("boy")) or eski.get(pid, {}).get("mevkiTahmini")
        # Mevkileri kontrol ederken yardımcı olsun diye maç başı ribaund ve asist
        o["ribOrt"] = round(s["rib"] / s["mac"], 1) if s and s["mac"] else 0
        o["astOrt"] = round(s["ast"] / s["mac"], 1) if s and s["mac"] else 0

    liste = sorted(rehber.values(), key=lambda o: (-o["vpOrt"], -o["mac"], o["ad"]))
    if eski and not akilli:
        kadro_hareketleri(eski, rehber)
    json_yaz(DATA / "oyuncular.json", liste)
    json_yaz(DATA / "index.json", {
        "guncelHafta": guncel, "haftalar": takvim,
        "guncelleme": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    print(f"Oyuncu listesi: {len(liste)} oyuncu ({sum(o['turk'] for o in liste)} Türk). Tamamlandı.")


if __name__ == "__main__":
    main()
