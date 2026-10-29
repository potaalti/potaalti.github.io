// BSL Draft Ligi kuralları: draft sırası, otomatik seçim, Türk oyuncu kuralı ve puanlama.
// Saf fonksiyonlar (Firebase'e bağlı değil), tarayıcıda ve testlerde aynen kullanılır.

export const PUAN_TABLOSU = [5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 1, 1, 1];
export const OTOMATIK_ADAY = 15;

// Yılan (snake) draft: 1. tur 1→17, 2. tur 17→1, ...
export function yilanSirasi(sira, turSayisi) {
  const sonuc = [];
  for (let tur = 0; tur < turSayisi; tur++) {
    sonuc.push(...(tur % 2 === 0 ? sira : [...sira].reverse()));
  }
  return sonuc;
}

// n: 0'dan başlayan seçim numarası -> { tur: 1.., turSecimi: 1.. }
export function secimBilgisi(n, takimSayisi) {
  return { tur: Math.floor(n / takimSayisi) + 1, turSecimi: (n % takimSayisi) + 1 };
}

// Draft havuzu sırası: bu sezonun maç başı VP ortalamasına göre (eşitlikte çok maç oynayan, sonra ada göre)
export function havuzSirala(oyuncular) {
  const liste = oyuncular.filter(o => o.aktif !== false)
    .sort((a, b) => b.vpOrt - a.vpOrt || b.mac - a.mac || a.ad.localeCompare(b.ad, 'tr'));
  let turk = 0;
  return liste.map((o, i) => ({ ...o, sira: i + 1, turkSira: o.turk ? ++turk : null }));
}

// Türk kuralı: As'ta (ilk 5 seçim) en az 1, Yedekte (son 2 seçim) en az 1 Türk.
// Takımın sıradaki seçimi As'ın son yuvasıysa ve As'ta Türk yoksa (ya da Yedeğin son yuvasıysa ve
// Yedekte Türk yoksa) sadece Türk oyuncu seçilebilir.
export function turkZorunlu(kadro, asSayisi = 5, yedekSayisi = 2) {
  const as = kadro?.as ?? [];
  const yedek = kadro?.yedek ?? [];
  if (as.length < asSayisi) return as.length === asSayisi - 1 && !(kadro?.asTurk > 0);
  return yedek.length === yedekSayisi - 1 && !(kadro?.yedekTurk > 0);
}

// Süre dolunca: müsait en iyi 15 oyuncudan (Türk zorunluysa en iyi 15 Türk'ten) rastgele biri
export function otomatikAdaylar(havuz, alinanlar, sadeceTurk) {
  return havuz.filter(o => !alinanlar.has(o.id) && (!sadeceTurk || o.turk)).slice(0, OTOMATIK_ADAY);
}

export function rastgele(liste, rnd = Math.random) {
  return liste[Math.floor(rnd() * liste.length)];
}

// Kadroya giren oyuncu: ilk 5 seçim As, son 2 seçim Yedek (draft sonrası diziliş serbestçe değiştirilebilir)
export function kadroyaEkle(kadro, pid, asSayisi) {
  const as = [...(kadro.as ?? [])];
  const yedek = [...(kadro.yedek ?? [])];
  if (as.length < asSayisi) as.push(pid); else yedek.push(pid);
  return { as, yedek };
}

// Bir oyuncunun yerine başkasını aynı yuvaya (As ya da Yedek) koyar
export function yerineKoy(kadro, cikan, giren) {
  return {
    as: kadro.as.map(p => (p === cikan ? giren : p)),
    yedek: kadro.yedek.map(p => (p === cikan ? giren : p)),
  };
}

// Takas: veren takımın i. oyuncusu alan takımın i. oyuncusunun yerine geçer (ve tersi)
export function takasKadrolari(verenKadro, alanKadro, verilen, alinan) {
  let v = { as: verenKadro.as, yedek: verenKadro.yedek };
  let a = { as: alanKadro.as, yedek: alanKadro.yedek };
  verilen.forEach((pid, i) => {
    v = yerineKoy(v, pid, alinan[i]);
    a = yerineKoy(a, alinan[i], pid);
  });
  return { veren: v, alan: a };
}

// Kadro Türk kuralına uyuyor mu: As'ta en az 1 ve Yedekte en az 1 Türk. Uymuyorsa hata metni döner.
export function turkKuraliHatasi(kadro, turkMu) {
  if (!kadro.as.some(turkMu)) return "As'ta en az 1 Türk oyuncu olmalı";
  if (!kadro.yedek.some(turkMu)) return 'Yedekte en az 1 Türk oyuncu olmalı';
  return null;
}

// ---------- Haftalar ----------

// Bir değişiklik hangi haftadan geçerli olur: başlangıç haftasından itibaren, ilk maçı henüz
// başlamamış ilk hafta (hafta ortasında yapılan değişiklik bir sonraki haftadan geçerlidir).
export function etkinHafta(index, baslangic, simdi = Date.now()) {
  const haftalar = (index?.haftalar ?? []).filter(h => h.hafta >= baslangic);
  const h = haftalar.find(x => !x.ilkMac || new Date(x.ilkMac).getTime() > simdi);
  if (h) return h.hafta;
  return (haftalar.at(-1)?.hafta ?? baslangic) + 1;
}

// Takımın o haftaki kadrosu: o haftaya kadar yapılmış son değişiklik (değişiklikler geçmişi etkilemez)
export function haftaKadrosu(kadro, hafta) {
  const gecmis = kadro.gecmis ?? [];
  let secilen = null;
  for (const g of gecmis) if (g.hafta <= hafta) secilen = g;
  if (!secilen) secilen = gecmis[0] ?? kadro;
  return { as: secilen.as, yedek: secilen.yedek };
}

// ---------- Puanlama (TBL fantezi ligiyle aynı) ----------
// - Takım puanı 5 As oyuncunun haftalık VP toplamıdır.
// - Bir As hafta içinde hiç süre almazsa (maçı bitti ve 0 dk oynadı ya da takımı bay geçti),
//   yedeklerden o hafta en yüksek VP alan onun yerine sayılır. İki As süre almazsa iki yedek de girer.
// - Haftalık sıralamadaki yer puan tablosuna göre lig puanı verir. Eşit VP'de sayılan oyuncular içindeki
//   en yüksek VP'li Türk oyuncusu daha yüksek olan üstte; bu da eşitse aynı sıra ve aynı puan.
// - Genel klasmanda eşit puanda toplam VP yüksek olan üstte.

// oyuncu: { id, ad, takimId, ... } (rehberden), hafta: hafta/<n>.json
function oyuncuDurumu(oyuncu, hafta) {
  const stat = hafta.oyuncular[oyuncu.id];
  const takimId = stat?.takimId ?? oyuncu.takimId;
  const maclar = hafta.maclar.filter(m => m.evId === takimId || m.depId === takimId);
  let macDurumu;
  if (maclar.length === 0) macDurumu = 'bay';
  else if (maclar.some(m => m.durum === 'canli')) macDurumu = 'canli';
  else if (maclar.every(m => m.durum === 'bitti')) macDurumu = 'bitti';
  else if (maclar.some(m => m.durum === 'bitti')) macDurumu = 'canli'; // haftada 2 maç, biri bitti
  else macDurumu = 'oynanmadi';
  const saniye = stat?.saniye ?? 0;
  return {
    ...oyuncu, takimId, vp: stat?.vp ?? 0, saniye, macDurumu,
    sureAlmadi: macDurumu === 'bay' || (macDurumu === 'bitti' && saniye === 0),
    mac: maclar[0] ?? null,
  };
}

// takim: { id, ad, as: [oyuncu], yedek: [oyuncu] }
export function takimHaftaPuani(takim, hafta) {
  const aslar = takim.as.map(o => ({ ...oyuncuDurumu(o, hafta), rol: 'as', sayildi: true }));
  const yedekler = takim.yedek
    .map(o => ({ ...oyuncuDurumu(o, hafta), rol: 'yedek', sayildi: false }))
    .sort((a, b) => b.vp - a.vp);
  const bosYedekler = [...yedekler];
  for (const as of aslar) {
    if (!as.sureAlmadi || bosYedekler.length === 0) continue;
    const yedek = bosYedekler.shift();
    as.sayildi = false;
    as.yerineGiren = yedek.ad;
    yedek.sayildi = true;
    yedek.yerineGirdigi = as.ad;
  }
  const toplam = [...aslar, ...yedekler].filter(o => o.sayildi).reduce((t, o) => t + o.vp, 0);
  return { ...takim, toplam, aslar, yedekler };
}

export function haftaSiralamasi(takimlar, hafta, puanTablosu = PUAN_TABLOSU) {
  const sonuclar = takimlar.map(t => {
    const s = takimHaftaPuani(t, hafta);
    const turkler = [...s.aslar, ...s.yedekler].filter(o => o.sayildi && o.turk).sort((a, b) => b.vp - a.vp);
    s.enIyiTurk = turkler[0] ?? null;
    s.turkVp = s.enIyiTurk ? s.enIyiTurk.vp : -Infinity;
    return s;
  // turkVp -Infinity olabilir; çıkarma yerine karşılaştırma (iki -Infinity farkı NaN olur)
  }).sort((a, b) => b.toplam - a.toplam || (b.turkVp > a.turkVp) - (b.turkVp < a.turkVp));
  sonuclar.forEach((s, i) => {
    const onceki = sonuclar[i - 1];
    const tamEsit = onceki && s.toplam === onceki.toplam && s.turkVp === onceki.turkVp;
    s.sira = tamEsit ? onceki.sira : i + 1;
    s.puan = puanTablosu[s.sira - 1] ?? 0;
  });
  sonuclar.forEach((s, i) => {
    s.vpEsitligi = [sonuclar[i - 1], sonuclar[i + 1]].some(k => k && k.toplam === s.toplam);
  });
  return sonuclar;
}

export function haftaDurumu(hafta) {
  const bitti = hafta.maclar.filter(m => m.durum === 'bitti').length;
  const canli = hafta.maclar.some(m => m.durum === 'canli');
  return { bitti, toplam: hafta.maclar.length, canli, tamamlandi: hafta.maclar.length > 0 && bitti === hafta.maclar.length };
}

// kadroBul(haftaNo) o hafta geçerli olan takımları döndürür
export function genelKlasman(kadroBul, haftalar, puanTablosu = PUAN_TABLOSU) {
  const tablo = new Map();
  for (const hafta of haftalar) {
    for (const s of haftaSiralamasi(kadroBul(hafta.hafta), hafta, puanTablosu)) {
      if (!tablo.has(s.id)) tablo.set(s.id, { id: s.id, ad: s.ad, menajer: s.menajer, puan: 0, vp: 0, haftalar: [] });
      const k = tablo.get(s.id);
      k.puan += s.puan;
      k.vp += s.toplam;
      k.haftalar.push({ hafta: hafta.hafta, sira: s.sira, puan: s.puan, vp: s.toplam });
    }
  }
  const sonuc = [...tablo.values()].sort((a, b) => b.puan - a.puan || b.vp - a.vp || a.ad.localeCompare(b.ad, 'tr'));
  sonuc.forEach((s, i) => {
    const onceki = sonuc[i - 1];
    s.sira = onceki && onceki.puan === s.puan && onceki.vp === s.vp ? onceki.sira : i + 1;
  });
  return sonuc;
}

// ---------- Giriş kodları ----------
const KOD_HARFLERI = 'abcdefghjkmnpqrstuvwxyz23456789';

export function yeniKod(takim) {
  const rnd = new Uint32Array(12);
  globalThis.crypto.getRandomValues(rnd);
  return `${takim}-${[...rnd].map(x => KOD_HARFLERI[x % KOD_HARFLERI.length]).join('')}`;
}

// 't05-abc...' -> 't05', 'admin-...' -> 'admin'
export function kodTakimi(kod) {
  const m = /^(admin|t\d{2})-[a-z0-9]{8,}$/.exec(kod ?? '');
  return m ? m[1] : null;
}

export function takimId(i) {
  return `t${String(i + 1).padStart(2, '0')}`;
}

// Kura: kriptografik rastgele karıştırma
export function karistir(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    globalThis.crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
