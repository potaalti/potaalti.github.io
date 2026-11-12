"""Avrupa'daki temsilcilerimiz (ön çalışma, 2026-11-12): EuroLeague, EuroCup, Basketbol Şampiyonlar Ligi ve FIBA Europe Cup.

Kaynaklar (hepsi herkese açık):
  EuroLeague / EuroCup  api-live.euroleague.net: v2 maç listesi ve maç istatistikleri (JSON), v1 puan durumu (XML)
  BCL / FIBA Europe Cup resmi sitelerin sayfaları: maç listesi, puan durumu ve maç sayfasındaki kutu skor, sayfanın içine
                        gömülü JSON olarak gelir (Next.js); oradan okunur.

Çıktı (site/data/avrupa/):
  index.json                      kupalar, temsilcilerimiz, güncelleme zamanı
  <kupa>.json                     puan durumu (gruplar) ve temsilcilerimizin maçları
  <kupa>/mac/<id>.json            temsilcilerimizin biten maçlarının kutu skoru (bir kez çekilir, sonra yeniden kullanılır)
  <kupa>/takim/<id>.json          takım: maçlar, maç başı takım ortalamaları, oyuncuların turnuva ortalamaları
  <kupa>/oyuncu/<id>.json         oyuncu: turnuva ortalamaları ve maç maç
Türk takımı: EuroLeague/EuroCup'ta kulübün ülkesi TUR; FIBA kupalarında iç saha maçının ülkesi TUR olan takım.

  python veri/avrupa.py
"""
import json
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
CIKTI = KOK / "site" / "data" / "avrupa"
TARAYICI = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
TURKIYE = timezone(timedelta(hours=3))
EL_API = "https://api-live.euroleague.net"

KUPALAR = [
    {"kod": "el", "ad": "EuroLeague", "kisa": "EL", "tur": "el", "api": "E", "sezon": "E2026"},
    {"kod": "ec", "ad": "EuroCup", "kisa": "EC", "tur": "el", "api": "U", "sezon": "U2026"},
    {"kod": "bcl", "ad": "Basketbol Şampiyonlar Ligi", "kisa": "BCL", "tur": "fiba",
     "taban": "https://www.championsleague.basketball/en"},
    {"kod": "fec", "ad": "FIBA Europe Cup", "kisa": "FEC", "tur": "fiba",
     "taban": "https://www.fiba.basketball/en/events/fiba-europe-cup-26-27"},
]


def getir(url, metin=False):
    if "fiba.basketball" in url:  # FIBA sayfaları CDN'de önbellekli: her istek ayrı adresle (CDN'i atlar; FIBA'nın kendi 5 dk'lık önbelleği kalır)
        url += ("&" if "?" in url else "?") + f"t={int(time.time())}"
    # EuroLeague API'si Accept'e göre XML de döndürebiliyor: JSON istenirken açıkça belirtilir
    req = urllib.request.Request(url, headers={"User-Agent": TARAYICI, "Accept": "*/*" if metin else "application/json"})
    with urllib.request.urlopen(req, timeout=40) as y:
        veri = y.read().decode("utf-8", errors="replace")
    time.sleep(0.25)
    return veri if metin else json.loads(veri)


DEGISTI = False  # bu çalışmada içeriği değişen dosya oldu mu (index.json'daki güncelleme zamanı yalnız o zaman ilerler)


def yaz(yol, veri):
    """Yalnızca içerik değiştiyse yazar: GitHub'daki zamanlanmış iş değişiklik yoksa kayıt ve yayın yapmaz."""
    global DEGISTI
    metin = json.dumps(veri, ensure_ascii=False, separators=(",", ":"))
    if yol.exists() and yol.read_text(encoding="utf-8") == metin:
        return
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(metin, encoding="utf-8")
    DEGISTI = True


def oku(yol):
    return json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else None


def tr_saat(utc):
    """'2026-10-07T16:00:00Z' -> Türkiye saatiyle '2026-10-07T19:00:00'"""
    t = datetime.fromisoformat(utc.replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(TURKIYE).replace(tzinfo=None).isoformat(timespec="seconds")


def ad_duzelt(ad):
    """'BUTLER, JARED' -> 'Jared Butler'"""
    if "," in ad:
        soy, ilk = [x.strip() for x in ad.split(",", 1)]
        ad = f"{ilk} {soy}"
    return " ".join(k[:1].upper() + k[1:].lower() if k.isupper() else k for k in ad.split())


def katla(ad):
    tablo = str.maketrans("çğıöşüÇĞİÖŞÜâî", "cgiosuCGIOSUai")
    return re.sub(r"[^a-z ]", "", ad.translate(tablo).lower()).split()


_TR_OYUNCU = None


def tr_oyuncu(ad):
    """BSL/TBL'de de oynayan Türk oyuncunun adı kaynaklarda Türkçe harfsiz ('Dogus Ozdemiroglu'): BSL/TBL'deki yazılışı kullanılır."""
    global _TR_OYUNCU
    if _TR_OYUNCU is None:
        _TR_OYUNCU = {}
        for lig in ("bsl", "tbl"):
            for o in oku(KOK / "site" / "data" / lig / "oyuncular.json") or []:
                _TR_OYUNCU.setdefault(" ".join(katla(o["ad"])), o["ad"])
    tr = _TR_OYUNCU.get(" ".join(katla(ad)), ad)
    return ad if tr.isupper() else tr  # BSL/TBL listesinde büyük harfle yazılmışsa kaynağın düzgün yazılışı kalır


def oyuncu_satiri(id_, ad, no, ilk5, sn, s):
    """Ortak kutu skor satırı (BSL/TBL'deki alan adlarıyla)."""
    return {"id": str(id_), "ad": tr_oyuncu(ad), "no": str(no or ""), "ilk5": bool(ilk5), "sn": int(sn), **s}


# Yayın kanalı (Türkiye): kaynaklarda yok. EuroLeague/EuroCup hakları Saran Media'da (S Sport / S Sport Plus); BCL ve
# Europe Cup için Türkiye'de yayıncı bulunamadı, FIBA'nın kendi platformu Courtside 1891. Maç maç düzeltme:
# site/data/avrupa/kanallar.json {"el-377": "S Sport", ...} (anahtar kupa-maç numarası), kupanın tamamı için {"el": "..."}.
KANAL = {"el": "S Sport Plus", "ec": "S Sport Plus", "bcl": "Courtside 1891", "fec": "Courtside 1891"}


# Temsilcilerimizin adları kaynaklarda İngilizce ve Türkçe harfsiz: uygulamada Türkçe yazılır
TR_AD = {
    "Anadolu Efes Istanbul": "Anadolu Efes", "Besiktas Istanbul": "Beşiktaş", "Fenerbahce Tarfin Istanbul": "Fenerbahçe Tarfin",
    "Bahcesehir College Istanbul": "Bahçeşehir Koleji", "Tofas Bursa": "Tofaş", "Turk Telekom Ankara": "Türk Telekom",
    "Biotekno Korfez Basket": "Biotekno Körfez Basket",
}


def mac_ani(p, chrono):
    """Canlı maçın başından geçen saniye: 'Q3', '04:12' -> 2*600 + 600 - 252 (uzatma 5 dk)"""
    p = str(p or "")
    kalan = sure_sn(chrono)
    if p.startswith("Q") and p[1:].isdigit():
        return (int(p[1:]) - 1) * 600 + 600 - kalan
    if p.startswith("OT"):
        return 2400 + (int(p[2:] or 1) - 1) * 300 + 300 - kalan
    return None


def periyot_adi(p):
    """FIBA 'Q3' -> '3. Ç', 'OT1' -> '1. Uzatma'"""
    p = str(p or "")
    if p.startswith("Q") and p[1:].isdigit():
        return f"{p[1:]}. Ç"
    if p.startswith("OT"):
        return f"{p[2:] or 1}. Uzatma"
    return p


def salon_adi(ad):
    """'ULKER SPORTS AND EVENT HALL' -> 'Ulker Sports And Event Hall'"""
    return ad.title() if ad and ad.isupper() else ad


def ceyrek_el(p):
    if not p:
        return []
    q = [p.get(f"partials{i}") for i in range(1, 5)]
    uz = p.get("extraPeriods") or {}
    return [x for x in q if x is not None] + [uz[k] for k in sorted(uz)]


# ---------- EuroLeague / EuroCup ----------

def el_kupa(k):
    kulupler = getir(f"{EL_API}/v2/competitions/{k['api']}/seasons/{k['sezon']}/clubs")["data"]
    turk = {c["code"] for c in kulupler if (c.get("country") or {}).get("code") == "TUR"}
    takimlar = {c["code"]: {"ad": c["name"], "turk": c["code"] in turk} for c in kulupler}
    oyunlar = getir(f"{EL_API}/v2/competitions/{k['api']}/seasons/{k['sezon']}/games")["data"]
    maclar = []
    for g in oyunlar:
        ev, dep = g["local"]["club"]["code"], g["road"]["club"]["code"]
        for c in (g["local"]["club"], g["road"]["club"]):
            takimlar.setdefault(c["code"], {"ad": c["name"], "turk": c["code"] in turk})
        if ev not in turk and dep not in turk:
            continue
        maclar.append({"id": str(g["gameCode"]), "tarih": tr_saat(g["utcDate"]), "tur": f"{g['round']}. tur",
                       "evre": (g.get("phaseType") or {}).get("name"), "ev": ev, "dep": dep,
                       "evSkor": g["local"]["score"] if g["played"] else None, "depSkor": g["road"]["score"] if g["played"] else None,
                       "durum": "bitti" if g["played"] else "oynanmadi",
                       "salon": salon_adi((g.get("venue") or {}).get("name")), "seyirci": g.get("audience") or None,
                       "ceyrekler": [ceyrek_el(g["local"].get("partials")), ceyrek_el(g["road"].get("partials"))] if g["played"] else None})
    # Canlı skor: başlama saati geçmiş (en çok 3 saat) ama listede henüz bitmemiş maçlar için maç başlığı
    simdi = datetime.now(TURKIYE).replace(tzinfo=None)
    for m in maclar:
        bas = datetime.fromisoformat(m["tarih"])
        if m["durum"] != "oynanmadi" or not (bas <= simdi <= bas + timedelta(hours=3)):
            continue
        try:
            h = getir(f"https://live.euroleague.net/api/Header?gamecode={m['id']}&seasoncode={k['sezon']}")
        except Exception as e:  # noqa: BLE001 - canlı skor alınamazsa maç oynanmadı görünür
            print(f"  {k['kod']} {m['id']}: canlı skor alınamadı:", e)
            continue
        if h.get("Live"):
            ceyrek = str(h.get("Quarter") or "").strip()
            m.update({"durum": "canli", "evSkor": int(h.get("ScoreA") or 0), "depSkor": int(h.get("ScoreB") or 0),
                      "periyot": f"{ceyrek}. Ç" if ceyrek.isdigit() and int(ceyrek) <= 4 else ceyrek or "", "sure": h.get("RemainingPartialTime") or ""})
    # Puan durumu (resmi sıralama, v1 XML; EuroCup'ta 4 grup)
    xml = ET.fromstring(getir(f"{EL_API}/v1/standings?seasonCode={k['sezon']}", metin=True))
    gruplar = []
    for i, grup in enumerate(xml.findall("group")):
        satirlar = []
        for t in grup.findall("team"):
            f = lambda a: t.findtext(a)  # noqa: E731
            satirlar.append({"sira": int(f("ranking")), "takim": f("code"), "o": int(f("totalgames")), "g": int(f("wins")),
                             "m": int(f("losses")), "atilan": int(f("ptsfavour")), "yenilen": int(f("ptsagainst")),
                             "averaj": int(f("difference"))})
        ad = grup.get("name")
        if any(st["takim"] in turk for st in satirlar):  # sadece temsilcilerimizin grupları
            gruplar.append({"ad": f"{chr(65 + i)} Grubu" if len(xml.findall("group")) > 1 else "Normal sezon", "satirlar": satirlar})

    def kutu(m):
        d = getir(f"{EL_API}/v2/competitions/{k['api']}/seasons/{k['sezon']}/games/{m['id']}/stats")

        def taraf(t, kod):
            oyuncular = []
            for p in t["players"]:
                s, kisi = p["stats"], p["player"]["person"]
                oyuncular.append(oyuncu_satiri(kisi["code"], ad_duzelt(kisi["name"]), s.get("dorsal") or p["player"].get("dorsal"), s.get("startFive"),
                                               s.get("timePlayed") or 0, {
                    "sayi": int(s["points"]), "rib": int(s["totalRebounds"]), "or": int(s["offensiveRebounds"]), "dr": int(s["defensiveRebounds"]),
                    "ast": int(s["assistances"]), "tc": int(s["steals"]), "blk": int(s["blocksFavour"]), "tk": int(s["turnovers"]),
                    "faul": int(s["foulsCommited"]), "vp": int(s["valuation"]), "pm": int(s.get("plusMinus") or 0),
                    "iki": [int(s["fieldGoalsMade2"]), int(s["fieldGoalsAttempted2"])], "uc": [int(s["fieldGoalsMade3"]), int(s["fieldGoalsAttempted3"])],
                    "sa": [int(s["freeThrowsMade"]), int(s["freeThrowsAttempted"])]}))
            tm = t.get("team") or {}
            return {"id": kod, "skor": int(t["total"]["points"]), "oyuncular": oyuncular,
                    "koc": ad_duzelt(t["coach"]["name"]) if (t.get("coach") or {}).get("name") else None,
                    "takim": {"hr": int(tm.get("offensiveRebounds") or 0), "sr": int(tm.get("defensiveRebounds") or 0),
                              "rib": int(tm.get("totalRebounds") or 0), "tk": int(tm.get("turnovers") or 0), "faul": int(tm.get("foulsCommited") or 0)}}
        return {"id": m["id"], "tarih": m["tarih"], "ev": taraf(d["local"], m["ev"]), "dep": taraf(d["road"], m["dep"])}

    def akis(m, kayit):
        """Skor farkı ve gelişmiş istatistik: maçın bütün sayıları (Points); hızlı hücum, ikinci şans ve top kaybından sayı
        resmi veride işaretli, boyalı alan atışın yerinden (koordinatlar sepete göre santimetre)."""
        satirlar = getir(f"https://live.euroleague.net/api/Points?gamecode={m['id']}&seasoncode={k['sezon']}")["Rows"]
        olaylar, son_dk = [], 40
        for r in satirlar:
            if not r.get("POINTS"):
                continue
            dk = int(r.get("MINUTE") or 1)
            son_dk = max(son_dk, dk)
            kalan = sure_sn(r.get("CONSOLE"))
            t = ((dk - 1) // 10) * 600 + 600 - kalan if dk <= 40 else 2400 + ((dk - 41) // 5) * 300 + 300 - kalan
            taraf = "ev" if r["TEAM"].strip() == m["ev"] else "dep"
            x, y = r.get("COORD_X"), r.get("COORD_Y")
            boyali = r["ID_ACTION"] in ("2FGM", "DUNK", "LAYUPMD") and x is not None and abs(x) <= 245 and -160 <= (y or 0) <= 423
            olaylar.append({"t": max(0, t), "taraf": taraf, "pts": int(r["POINTS"]), "hh": r.get("FASTBREAK") == "1",
                            "is": r.get("SECOND_CHANCE") == "1", "tks": r.get("POINTS_OFF_TURNOVER") == "1", "ba": boyali})
        sure = 2400 + max(0, (son_dk - 40 + 4) // 5) * 300
        sonuc = akis_hesapla(olaylar, sure, kayit, resmi=True)
        # En büyük fark, en büyük seri ve bench sayısı resmi karşılaştırmadan (A: ev sahibi)
        c = getir(f"https://live.euroleague.net/api/Comparison?gamecode={m['id']}&seasoncode={k['sezon']}")
        for taraf, h in (("ev", "A"), ("dep", "B")):
            for alan, anahtar in (("fark", f"maxLead{h}"), ("seri", f"max{h}"), ("benc", f"PointsBench{h}")):
                if c.get(anahtar) is not None:
                    sonuc["ileri"][taraf][alan] = int(c[anahtar])
        return sonuc

    return takimlar, gruplar, maclar, kutu, akis


# ---------- BCL / FIBA Europe Cup ----------

def gomulu(sayfa):
    """Next.js sayfasının içine gömülü JSON metni (kaçışları açılmış)."""
    return sayfa.replace('\\"', '"').replace("\\\\", "\\")


def nesneler(x, anahtar):
    """x içinde '{"<anahtar>":' ile başlayan bütün JSON nesneleri."""
    dec, bul, i = json.JSONDecoder(), [], 0
    while (i := x.find('{"' + anahtar + '":', i)) >= 0:
        try:
            o, son = dec.raw_decode(x, i)
            bul.append(o)
            i = son
        except ValueError:
            i += 1
    return bul


def sure_sn(tp):
    if not tp or ":" not in str(tp):
        return 0
    d, s = str(tp).split(":")[:2]
    return int(d) * 60 + int(s)


def fiba_kupa(k):
    x = gomulu(getir(f"{k['taban']}/games", metin=True))
    oyunlar = {o["gameId"]: o for o in nesneler(x, "gameId") if isinstance(o.get("teamA"), dict) and isinstance(o.get("teamB"), dict)}
    takimlar = {}
    turk = set()
    for g in oyunlar.values():
        for t in ("teamA", "teamB"):
            tk = g[t]
            takimlar.setdefault(str(tk["teamId"]), {"ad": tk.get("shortName") or tk.get("officialName"), "turk": False, "org": tk.get("organisationId"),
                                                    "kod": tk.get("code")})
        if g.get("hostCountryCode") == "TUR":
            turk.add(str(g["teamA"]["teamId"]))
    for t in turk:
        takimlar[t]["turk"] = True
    maclar = []
    for g in sorted(oyunlar.values(), key=lambda g: g.get("gameDateTimeUTC") or ""):
        ev, dep = str(g["teamA"]["teamId"]), str(g["teamB"]["teamId"])
        if ev not in turk and dep not in turk:
            continue
        canli = bool(g.get("isLive"))
        bitti = (g.get("liveGameStatus") == 999 or g.get("currentPeriodStatus") == "E") and not canli and (g.get("teamAScore") or g.get("teamBScore"))
        tur = g.get("round") or {}
        maclar.append({"id": str(g["gameId"]), "tarih": tr_saat(g["gameDateTimeUTC"] + "Z") if g.get("gameDateTimeUTC") else None,
                       "tur": None, "evre": tur.get("roundName"),
                       "grup": g.get("groupPairingCode"), "ev": ev, "dep": dep,
                       "evSkor": g.get("teamAScore") if (bitti or canli) else None, "depSkor": g.get("teamBScore") if (bitti or canli) else None,
                       "durum": "canli" if canli else "bitti" if bitti else "oynanmadi",
                       "salon": salon_adi(g.get("venueName")), "seyirci": g.get("spectators") or None,
                       **({"periyot": periyot_adi(g.get("currentPeriod")), "sure": g.get("chrono"),
                           "_an": mac_ani(g.get("currentPeriod"), g.get("chrono"))} if canli else {}),
                       "sayfa": f"{k['taban']}/games/{g['gameId']}-{g['teamA'].get('code')}-{g['teamB'].get('code')}"})
    # Puan durumu: sayfadaki "current" evrenin grupları
    s = gomulu(getir(f"{k['taban']}/standings", metin=True))
    i = s.find('"current":true')
    j = s.find('{"groups":', i if i >= 0 else 0)
    gruplar = []
    if j >= 0:
        veri, _ = json.JSONDecoder().raw_decode(s, j)
        for gr in veri["groups"]:
            satirlar = [{"sira": t["rank"], "takim": str(t["team"]), "o": t["gamesPlayed"], "g": t["gamesWon"], "m": t["gamesLost"],
                         "atilan": t["pointsFor"], "yenilen": t["pointsAgainst"], "averaj": t["plusMinus"]} for t in gr["teamsStats"]]
            if any(st["takim"] in turk for st in satirlar):  # sadece temsilcilerimizin grupları
                gruplar.append({"ad": f"{gr['groupName']} Grubu", "satirlar": satirlar})

    sayfalar = {}

    def sayfa_getir(m):
        if m["id"] not in sayfalar:
            try:
                sayfalar[m["id"]] = gomulu(getir(m["sayfa"], metin=True))
            except urllib.error.HTTPError:  # adres takım kodlarıyla bulunamazsa yalnızca maç numarasıyla
                sayfalar[m["id"]] = gomulu(getir(f"{k['taban']}/games/{m['id']}", metin=True))
        return sayfalar[m["id"]]

    def kutu(m):
        sayfa = sayfa_getir(m)
        kisiler = {}
        for p in nesneler(sayfa, "personId"):
            if p.get("firstName") is not None or p.get("lastName") is not None:
                kisiler.setdefault(p["personId"], p)
        det = nesneler(sayfa, "c")
        det = next((d for d in det if isinstance(d.get("c"), list) and d["c"] and str(d["c"][0].get("Id", "")).startswith("T_")), None)
        if not det:
            raise ValueError("kutu skor bulunamadı")
        org = {str(takimlar[m["ev"]]["org"]): m["ev"], str(takimlar[m["dep"]]["org"]): m["dep"]}

        def taraf(t):
            oyuncular = []
            for ch in t.get("Children", []):
                st = ch.get("Stats") or {}
                if not str(ch.get("Id", "")).startswith("P_"):
                    continue
                pid = int(ch["Id"][2:])
                kisi = kisiler.get(pid, {})
                ad = " ".join(x for x in [kisi.get("firstName"), kisi.get("lastName")] if x) or f"#{pid}"
                ad = " ".join(w.capitalize() if w.isupper() and len(w) > 2 else w for w in ad.split())
                oyuncular.append(oyuncu_satiri(pid, ad, kisi.get("uniformNumber"), st.get("Starter"), sure_sn(st.get("TP")) if st.get("HasPlayed") else 0, {
                    "sayi": st.get("PTS", 0), "rib": st.get("REB", 0), "or": st.get("OR", 0), "dr": st.get("DR", 0), "ast": st.get("AS", 0),
                    "tc": st.get("ST", 0), "blk": st.get("BS", 0), "tk": st.get("TO", 0), "faul": st.get("PF", 0), "vp": st.get("EFF", 0),
                    "pm": st.get("PM", 0) or 0, "iki": [st.get("FG2M", 0), st.get("FG2A", 0)], "uc": [st.get("FG3M", 0), st.get("FG3A", 0)],
                    "sa": [st.get("FTM", 0), st.get("FTA", 0)]}))
            st = t.get("Stats") or {}
            return {"id": org.get(t["Id"][2:]), "skor": t.get("Score"), "ceyrekler": [p.get("Score") for p in t.get("Periods", [])], "oyuncular": oyuncular,
                    "takim": {"hr": st.get("T_OR", 0), "sr": st.get("T_DR", 0), "rib": st.get("T_REB", 0), "tk": st.get("T_TO", 0), "faul": st.get("T_PF", 0)},
                    "resmiIleri": {"tks": st.get("A_PAT"), "ba": st.get("A_PIP"), "is": st.get("A_SCP"), "hh": st.get("A_FBP")}}
        taraflar = {x["id"]: x for x in (taraf(t) for t in det["c"])}
        # Başantrenör: sayfadaki staffA (ev sahibi) ve staffB listeleri
        for anah, taraf_id in (("staffA", m["ev"]), ("staffB", m["dep"])):
            i = sayfa.find(f'"{anah}":[')
            if i >= 0:
                try:
                    liste, _ = json.JSONDecoder().raw_decode(sayfa, i + len(anah) + 3)
                    bas = next((x for x in liste if x.get("isHeadCoach") == 1 or x.get("function") == "Head Coach"), None)
                    if bas:
                        taraflar[taraf_id]["koc"] = " ".join(w.capitalize() if w.isupper() and len(w) > 2 else w
                                                          for w in f"{bas.get('firstName', '')} {bas.get('lastName', '')}".split())
                except ValueError:
                    pass
        return {"id": m["id"], "tarih": m["tarih"], "ev": taraflar[m["ev"]], "dep": taraflar[m["dep"]]}

    def akis(m, kayit):
        """Skor farkı ve gelişmiş istatistik maç sayfasındaki sayı sayı akıştan. Kaynakta hızlı hücum işareti yok (boş kalır);
        top kaybından ve ikinci şanstan sayı akıştan, boyalı alan atışın açıklamasından hesaplanır (resmi değil)."""
        sayfa = sayfa_getir(m)
        i = sayfa.find('"playByPlay":{"items"')
        if i < 0:
            raise ValueError("sayı sayı akış yok")
        veri, _ = json.JSONDecoder().raw_decode(sayfa, i + len('"playByPlay":'))
        org = {takimlar[m["ev"]]["org"]: "ev", takimlar[m["dep"]]["org"]: "dep"}
        olaylar, son_sure = [], 2400
        for ad, per in veri["items"].items():
            if ad.startswith("OT"):
                n = int(ad[2:] or 1)
                bas, uz = 2400 + (n - 1) * 300, 300
            else:
                bas, uz = (int(ad[1:]) - 1) * 600, 600
            son_sure = max(son_sure, bas + uz)
            for it in sorted(per["items"], key=lambda x: x.get("order") or 0):
                it["_t"] = bas + uz - sure_sn(it.get("Time"))
                olaylar.append(it)
        olaylar.sort(key=lambda x: (x["_t"], x.get("order") or 0))
        sayilar = []
        top_kaybi = {"ev": False, "dep": False}  # rakibin top kaybından sonraki hücum
        ikinci = {"ev": False, "dep": False}  # kendi hücum ribaundundan sonraki hücum
        son_atis = None
        for it in olaylar:
            taraf = org.get(it.get("oId"))
            if not taraf:
                continue
            rakip = "dep" if taraf == "ev" else "ev"
            ac = it.get("ac")
            if ac == "TO":
                top_kaybi[rakip], top_kaybi[taraf], ikinci[taraf] = True, False, False
            elif ac in ("REB", "TREB"):
                if son_atis == taraf:
                    ikinci[taraf] = True
                else:
                    top_kaybi[rakip] = ikinci[rakip] = False
            elif ac in ("P2", "P3", "FT"):
                son_atis = taraf if not it.get("made") else None
                if it.get("made") and it.get("pts"):
                    txt = (it.get("txt") or "").lower()
                    boyali = ac == "P2" and any(w in txt for w in ("under the basket", "inside paint", "layup", "lay-up", "dunk", "tip", "putback", "alley", "eurostep", "hook"))
                    sayilar.append({"t": it["_t"], "taraf": taraf, "pts": 1 if ac == "FT" else int(it["pts"]), "hh": None,
                                    "is": ikinci[taraf], "tks": top_kaybi[taraf], "ba": boyali})
                    if ac != "FT":  # sayıyla hücum biter (serbest atışlarda son atışa kadar sürer)
                        top_kaybi[taraf] = ikinci[taraf] = False
                        top_kaybi[rakip] = ikinci[rakip] = False
        sonuc = akis_hesapla(sayilar, son_sure, kayit, resmi=False)
        # Maç bitince FIBA'nın resmi değerleri sayfada: hesaplanan yerine onlar (hızlı hücum dahil)
        resmi = [kayit[t].get("resmiIleri") or {} for t in ("ev", "dep")]
        if all(r.get("tks") is not None for r in resmi):
            for t, r in zip(("ev", "dep"), resmi):
                for alan in ("tks", "ba", "is", "hh"):
                    if r.get(alan) is not None:
                        sonuc["ileri"][t][alan] = int(r[alan])
            sonuc["ileriResmi"] = True
        return sonuc

    return takimlar, gruplar, maclar, kutu, akis


# ---------- Ortak: skor farkı ve gelişmiş istatistik ----------

def akis_hesapla(sayilar, sure, kayit, resmi):
    """sayilar: [{t (maç başından saniye), taraf ev/dep, pts, tks, hh, is, ba}] zamana göre. Uygulamadaki BSL/TBL alanlarıyla:
    fark {sure, simdi, d: [[saniye, ev - dep]]} ve ileri {ev, dep: {tks, hh, is, ba, benc, fark, seri, lider, degisim, esitlik}}.
    hh None ise (kaynakta yok) uygulamada o satır gösterilmez."""
    sayilar = sorted(sayilar, key=lambda x: x["t"])
    skor = {"ev": 0, "dep": 0}
    d, son_fark = [[0, 0]], 0
    ileri = {t: {"tks": 0, "hh": 0 if all(s["hh"] is not None for s in sayilar) else None, "is": 0, "ba": 0,
                 "benc": sum(o["sayi"] for o in kayit[t]["oyuncular"] if not o["ilk5"]), "fark": 0, "seri": 0, "lider": 0,
                 "degisim": 0, "esitlik": 0} for t in ("ev", "dep")}
    seri_taraf, seri, onceki_t, lider, son_lider = None, 0, 0, None, None
    for s in sayilar:
        t, taraf = s["t"], s["taraf"]
        if lider:  # önceki andan bu ana kadar önde olan
            ileri[lider]["lider"] += max(0, t - onceki_t)
        onceki_t = t
        skor[taraf] += s["pts"]
        for a in ("tks", "is", "ba"):
            if s[a]:
                ileri[taraf][a] += s["pts"]
        if s["hh"]:
            ileri[taraf]["hh"] += s["pts"]
        seri = seri + s["pts"] if seri_taraf == taraf else s["pts"]
        seri_taraf = taraf
        ileri[taraf]["seri"] = max(ileri[taraf]["seri"], seri)
        fark = skor["ev"] - skor["dep"]
        ileri["ev"]["fark"] = max(ileri["ev"]["fark"], fark)
        ileri["dep"]["fark"] = max(ileri["dep"]["fark"], -fark)
        yeni = "ev" if fark > 0 else "dep" if fark < 0 else None
        if fark == 0 and son_fark != 0:
            ileri["ev"]["esitlik"] += 1
            ileri["dep"]["esitlik"] += 1
        if yeni and son_lider and yeni != son_lider:
            ileri["ev"]["degisim"] += 1
            ileri["dep"]["degisim"] += 1
        if yeni:
            son_lider = yeni
        lider = yeni
        if fark != son_fark:
            d.append([t, fark])
            son_fark = fark
    bitis = onceki_t if kayit.get("canli") else sure  # canlı maçta son sayının anına kadar
    if lider:
        ileri[lider]["lider"] += max(0, bitis - onceki_t)
    return {"fark": {"sure": sure, "simdi": bitis, "d": d}, "ileri": ileri, "ileriResmi": resmi}


# ---------- Ortak: takım ve oyuncu dosyaları ----------

ALANLAR = ["sayi", "rib", "or", "dr", "ast", "tc", "blk", "tk", "faul", "vp"]


def ort(x, n):
    return round(x / n, 1) if n else 0


def takim_oyuncu_uret(k, takimlar, maclar, kutular):
    kok = CIKTI / k["kod"]
    turk = [t for t, v in takimlar.items() if v["turk"]]
    # Rakipler: temsilcilerimizle oynadığı (kutu skoru alınmış) maçlardan; istatistikleri yalnızca o maçlardan
    rakipler = sorted({t for m in maclar if m["id"] in kutular for t in (m["ev"], m["dep"]) if t not in turk})
    oyuncular_hepsi = {}
    for tid in turk + rakipler:
        oynanan = [m for m in maclar if tid in (m["ev"], m["dep"]) and m["id"] in kutular]
        toplam = {a: 0 for a in ALANLAR} | {"iki": [0, 0], "uc": [0, 0], "sa": [0, 0]}
        oyuncular = {}
        for m in oynanan:
            kutu = kutular[m["id"]]
            biz = kutu["ev"] if kutu["ev"]["id"] == tid else kutu["dep"]
            rakip = kutu["dep"] if biz is kutu["ev"] else kutu["ev"]
            for p in biz["oyuncular"]:
                for a in ALANLAR:
                    toplam[a] += p[a]
                for a in ("iki", "uc", "sa"):
                    toplam[a][0] += p[a][0]
                    toplam[a][1] += p[a][1]
                o = oyuncular.setdefault(p["id"], {"id": p["id"], "ad": p["ad"], "no": p["no"], "takim": tid, "maclar": []})
                o["no"] = p["no"] or o["no"]
                o["maclar"].append({"mac": m["id"], "tarih": m["tarih"], "tur": m["tur"], "rakip": rakip["id"], "evde": m["ev"] == tid,
                                    "skor": biz["skor"], "rakipSkor": rakip["skor"], **{a: p[a] for a in ALANLAR + ["pm", "sn", "ilk5", "iki", "uc", "sa"]}})
        kadro = []
        for o in oyuncular.values():
            oyn = [x for x in o["maclar"] if x["sn"] > 0]
            n = len(oyn)
            ozet = {"mac": n, "ilk5": sum(1 for x in oyn if x["ilk5"]), "dk": ort(sum(x["sn"] for x in oyn) / 60, n),
                    **{a: ort(sum(x[a] for x in oyn), n) for a in ALANLAR}, "pm": sum(x["pm"] for x in oyn),
                    **{a: [sum(x[a][0] for x in oyn), sum(x[a][1] for x in oyn)] for a in ("iki", "uc", "sa")}}
            if n:
                kadro.append({"id": o["id"], "ad": o["ad"], "no": o["no"], **ozet,
                              **({} if takimlar[tid]["turk"] else {"karsi": [[x["rakip"], x["sayi"]] for x in oyn]})})
            oyuncular_hepsi[o["id"]] = {"id": o["id"], "ad": o["ad"], "no": o["no"], "takim": tid, "takimAd": takimlar[tid]["ad"], "kupa": k["kod"],
                                        "ozet": ozet, "maclar": o["maclar"]}
        kadro.sort(key=lambda x: (-x["dk"], x["ad"]))
        n = len(oynanan)
        g = sum(1 for m in oynanan if (kutular[m["id"]]["ev"]["skor"] > kutular[m["id"]]["dep"]["skor"]) == (m["ev"] == tid))
        yaz(kok / "takim" / f"{tid}.json", {
            "id": tid, "ad": takimlar[tid]["ad"], "kupa": k["kod"], "turk": takimlar[tid]["turk"], "o": n, "g": g, "m": n - g,
            "ort": {a: ort(toplam[a], n) for a in ALANLAR}, "atis": {a: toplam[a] for a in ("iki", "uc", "sa")},
            "maclar": [m for m in maclar if tid in (m["ev"], m["dep"])], "kadro": kadro})
    for o in oyuncular_hepsi.values():
        yaz(kok / "oyuncu" / f"{o['id']}.json", o)


def kupa_uret(k):
    print(k["ad"], "…")
    takimlar, gruplar, maclar, kutu, akis = (el_kupa if k["tur"] == "el" else fiba_kupa)(k)
    for v in takimlar.values():
        v["ad"] = TR_AD.get(v["ad"], v["ad"])
    kutular = {}
    for m in maclar:
        if m["durum"] not in ("bitti", "canli"):
            continue
        yol = CIKTI / k["kod"] / "mac" / f"{m['id']}.json"
        kayit = oku(yol)
        # Canlı maçın kutu skoru her çalışmada yeniden çekilir; canlıyken kaydedilmiş maç bitince bir kez daha (son hali)
        if kayit is None or m["durum"] == "canli" or kayit.get("canli") or "takim" not in (kayit.get("ev") or {}):
            try:
                kayit = kutu(m)
                kayit["canli"] = m["durum"] == "canli"
            except Exception as e:  # noqa: BLE001 - bir maç alınamazsa diğerleri devam eder
                print(f"  {k['kod']} {m['id']}: kutu skor alınamadı:", e)
                # FIBA canlıyken kutu skor ve sayı sayı akış vermiyor: skor farkı grafiği her güncellemedeki canlı skordan
                # (maçın o anki dakikasıyla) kurulur; maç bitip tam akış gelince yerini o alır
                an = m.get("_an")
                if m["durum"] == "canli" and an is not None and m.get("evSkor") is not None:
                    onceki = oku(yol) or {}
                    d = (onceki.get("fark") or {}).get("d") if onceki.get("anlik") else None
                    d = d or [[0, 0]]
                    fark = int(m["evSkor"]) - int(m["depSkor"])
                    if an > d[-1][0] and fark != d[-1][1]:
                        d.append([an, fark])
                    yaz(yol, {"id": m["id"], "tarih": m["tarih"], "canli": True, "anlik": True,
                              "ev": {"id": m["ev"], "skor": m["evSkor"]}, "dep": {"id": m["dep"], "skor": m["depSkor"]},
                              "fark": {"sure": max(2400, an), "simdi": an, "d": d}})
                continue
            try:
                kayit.update(akis(m, kayit))
            except Exception as e:  # noqa: BLE001 - sonraki çalışmada yeniden denenir
                print(f"  {k['kod']} {m['id']}: akış alınamadı:", e)
            yaz(yol, kayit)
        if m["durum"] == "canli":
            continue  # canlı maç takım ve oyuncu istatistiklerine bitince katılır
        if "ileri" not in kayit:  # skor farkı ve gelişmiş istatistik (sonradan eklendi: eski kayıtlara da bir kez eklenir)
            try:
                kayit.update(akis(m, kayit))
                yaz(yol, kayit)
            except Exception as e:  # noqa: BLE001 - sonraki çalışmada yeniden denenir
                print(f"  {k['kod']} {m['id']}: akış alınamadı:", e)
        kutular[m["id"]] = kayit
    kanallar = oku(CIKTI / "kanallar.json") or {}
    for m in maclar:
        m.pop("sayfa", None)
        m.pop("_an", None)
        m["yayin"] = kanallar.get(f"{k['kod']}-{m['id']}") or kanallar.get(k["kod"]) or KANAL.get(k["kod"])
        if not m.get("ceyrekler") and m["id"] in kutular:
            m["ceyrekler"] = [kutular[m["id"]]["ev"].get("ceyrekler") or [], kutular[m["id"]]["dep"].get("ceyrekler") or []]
    takim_oyuncu_uret(k, takimlar, maclar, kutular)
    yaz(CIKTI / f"{k['kod']}.json", {"kod": k["kod"], "ad": k["ad"], "takimlar": {t: {"ad": v["ad"], "turk": v["turk"]} for t, v in takimlar.items()},
                                     "gruplar": gruplar, "maclar": maclar})
    turkler = [{"id": t, "ad": v["ad"]} for t, v in takimlar.items() if v["turk"]]
    print(f"  temsilciler: {', '.join(t['ad'] for t in turkler)} · {len(maclar)} maç · {len(kutular)} kutu skor")
    return {"kod": k["kod"], "ad": k["ad"], "kisa": k["kisa"], "temsilciler": turkler}


def main():
    ozet = []
    for k in KUPALAR:
        try:
            ozet.append(kupa_uret(k))
        except Exception as e:  # noqa: BLE001 - bir kupa alınamazsa eski dosyası kalır
            print(f"{k['ad']}: alınamadı:", e)
            eski = oku(CIKTI / "index.json") or {"kupalar": []}
            ozet.extend(x for x in eski["kupalar"] if x["kod"] == k["kod"])
    eski = oku(CIKTI / "index.json") or {}
    if DEGISTI or eski.get("kupalar") != ozet or "guncelleme" not in eski:
        yaz(CIKTI / "index.json", {"guncelleme": datetime.now(TURKIYE).isoformat(timespec="seconds"), "kupalar": ozet})
        print("değişiklik var")
    else:
        print("değişiklik yok")


if __name__ == "__main__":
    main()
