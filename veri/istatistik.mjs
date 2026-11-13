// Site ziyaret istatistikleri: GoatCounter API'sinden son 60 günü çekip yönetici İstatistik bölümü için tek dosyaya yazar
// (site/data/istatistik.json). GitHub "Site istatistikleri" işi yarım saatte bir çalıştırır.
// Site kodu site/sayac.js'teki KOD'dan okunur; API anahtarı GitHub sırrı GOATCOUNTER_ANAHTAR ("Read statistics" izni yeter).
//   GOATCOUNTER_ANAHTAR=... node veri/istatistik.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const KOK = new URL('..', import.meta.url);
const SAYAC = readFileSync(new URL('site/sayac.js', KOK), 'utf8');
const KOD = SAYAC.match(/var KOD = '([^']*)'/)?.[1];
// Giriş sayacı: ikinci GoatCounter sitesi (oturum sayımı kapalı: her açılış ve dönüş ayrı sayılır); aynı anahtar iki siteye de erişmeli
const GIRIS_KOD = SAYAC.match(/var GIRIS_KOD = '([^']*)'/)?.[1];
const ANAHTAR = process.env.GOATCOUNTER_ANAHTAR;
if (!KOD || !ANAHTAR) {
  console.log(!KOD ? 'site/sayac.js içinde GoatCounter KOD boş: sayaç kapalı.' : 'GOATCOUNTER_ANAHTAR sırrı yok: istatistik çekilmedi.');
  process.exit(0);
}
const API = `https://${KOD}.goatcounter.com/api/v0`;
const bekle = ms => new Promise(r => setTimeout(r, ms));

async function getir(yol, sorgu, api = API) {
  for (let deneme = 0; ; deneme++) {
    await bekle(300); // GoatCounter sınırı saniyede 4 istek
    const r = await fetch(`${api}${yol}?${new URLSearchParams(sorgu)}`, { headers: { Authorization: `Bearer ${ANAHTAR}`, 'Content-Type': 'application/json' } });
    if (r.status === 429 && deneme < 3) { await bekle(2000); continue; }
    if (!r.ok) throw new Error(`${yol}: HTTP ${r.status} ${await r.text()}`);
    return r.json();
  }
}

// Türkiye saatiyle gün başları (UTC+3): sorgular saate yuvarlanmış olmalı
const SAAT = 3600e3, GUN = 24 * SAAT;
const simdi = Date.now();
const bugunBas = Math.floor((simdi + 3 * SAAT) / GUN) * GUN - 3 * SAAT;
const bitis = Math.ceil(simdi / SAAT) * SAAT;
const iso = t => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z');


const liste = (x, ad = s => s.name) => (x.stats ?? []).map(s => ({ ad: ad(s), id: s.id ?? '', n: s.count ?? 0 })).filter(s => s.n > 0);
// Ziyaretçi = giriş sayfaları ('/', '/tbl/', '/bsl/', eski site): olay olmayan ve # içermeyen yollar. Bölümler: olaylar
// (2026-11-13 gecesi kısa süre bölümler de sayfa görüntülemesi olarak sayıldı: # içeren o yollar da bölümlere eklenir)
const girisMi = h => !h.event && !String(h.path).includes('#');
async function donem(bas) {
  const sorgu = { start: iso(bas), end: iso(bitis) };
  const sonuc = {};
  for (const [anahtar, sayfa] of [['cihaz', 'sizes'], ['sistem', 'systems'], ['tarayici', 'browsers'], ['kaynak', 'toprefs'], ['ulke', 'locations']]) {
    sonuc[anahtar] = liste(await getir(`/stats/${sayfa}`, { ...sorgu, limit: 20 }));
  }
  const hits = await getir('/stats/hits', { ...sorgu, limit: 100 });
  const yollar = (hits.hits ?? []).map(h => ({ ad: h.path, n: h.count ?? 0, giris: girisMi(h) })).filter(h => h.n > 0);
  sonuc.giris = yollar.filter(h => h.giris).map(({ ad, n }) => ({ ad, n }));
  sonuc.bolum = yollar.filter(h => !h.giris).map(({ ad, n }) => ({ ad, n }));
  sonuc.ziyaretci = sonuc.giris.reduce((t, h) => t + h.n, 0);
  return sonuc;
}

const dosya = new URL('site/data/istatistik.json', KOK);
let eski = null;
try { eski = JSON.parse(readFileSync(dosya, 'utf8')); } catch { /* ilk çalışma */ }
let veri;
try {
  // Günlük ve saatlik ziyaretçi (giriş sayfalarının toplamı; sitenin GoatCounter saat dilimine göre): 60 gün (30 günü öncekiyle kıyaslamak için)
  const h60 = await getir('/stats/hits', { start: iso(bugunBas - 59 * GUN), end: iso(bitis), limit: 100 });
  const gun = new Map();
  for (const h of (h60.hits ?? []).filter(girisMi)) {
    for (const s of h.stats ?? []) {
      const g = gun.get(s.day.slice(0, 10)) ?? { z: 0, saat: Array(24).fill(0) };
      g.z += s.daily ?? 0;
      (s.hourly ?? []).forEach((x, i) => { g.saat[i] += x ?? 0; });
      gun.set(s.day.slice(0, 10), g);
    }
  }
  const gunler = [...gun].map(([g, v]) => ({ gun: g, ...v })).sort((a, b) => a.gun.localeCompare(b.gun));
  veri = {
    guncelleme: new Date(simdi).toISOString(),
    gunler: gunler.map(({ gun, z }) => ({ gun, z })),
    saatlik: Object.fromEntries(gunler.slice(-2).map(g => [g.gun, g.saat])),
    donemler: { bugun: await donem(bugunBas), hafta: await donem(bugunBas - 6 * GUN), ay: await donem(bugunBas - 29 * GUN) },
  };
  if (GIRIS_KOD) {
    try {
      // Girişler: günlük ve saatlik toplam, dönem dönem hangi sayfadan açıldığı (günlük sayılardan; ek istek yok)
      const g60 = await getir('/stats/hits', { start: iso(bugunBas - 59 * GUN), end: iso(bitis), limit: 100 }, `https://${GIRIS_KOD}.goatcounter.com/api/v0`);
      const gun = new Map(), gunAd = t => new Date(t + 3 * SAAT).toISOString().slice(0, 10);
      const baslar = { bugun: gunAd(bugunBas), hafta: gunAd(bugunBas - 6 * GUN), ay: gunAd(bugunBas - 29 * GUN) };
      const yer = { bugun: new Map(), hafta: new Map(), ay: new Map() };
      for (const h of (g60.hits ?? []).filter(x => !x.event)) {
        for (const st of h.stats ?? []) {
          const gn = st.day.slice(0, 10);
          const g = gun.get(gn) ?? { z: 0, saat: Array(24).fill(0) };
          g.z += st.daily ?? 0;
          (st.hourly ?? []).forEach((x, i) => { g.saat[i] += x ?? 0; });
          gun.set(gn, g);
          for (const [d, bas] of Object.entries(baslar)) if (gn >= bas && st.daily) yer[d].set(h.path, (yer[d].get(h.path) ?? 0) + st.daily);
        }
      }
      const gl = [...gun].map(([g, v]) => ({ gun: g, ...v })).sort((a, b) => a.gun.localeCompare(b.gun));
      veri.giris = {
        gunler: gl.map(({ gun: g, z }) => ({ gun: g, z })),
        saatlik: Object.fromEntries(gl.slice(-2).map(g => [g.gun, g.saat])),
        yer: Object.fromEntries(Object.entries(yer).map(([d, m]) => [d, [...m].map(([ad, n]) => ({ ad, n })).sort((a, b) => b.n - a.n)])),
      };
    } catch (e) {
      console.log('Giriş sayacı okunamadı:', e.message);
      veri.girisHata = String(e.message).slice(0, 300);
    }
  }
} catch (e) {
  // Hata dosyaya yazılır (önceki sayılar kalır): yönetici sayfasında görünür, GitHub kaydına giriş yapmadan da okunur
  console.log('GoatCounter okunamadı:', e.message);
  veri = { ...(eski ?? {}), hata: String(e.message).slice(0, 300), hataZamani: new Date(simdi).toISOString() };
}
if (eski && JSON.stringify({ ...eski, guncelleme: 0, hataZamani: 0 }) === JSON.stringify({ ...veri, guncelleme: 0, hataZamani: 0 })) {
  console.log('Değişiklik yok.');
  process.exit(0);
}
writeFileSync(dosya, `${JSON.stringify(veri)}\n`);
if (!veri.hata) console.log(`İstatistik yazıldı: bugün ${veri.donemler.bugun.ziyaretci}, 7 gün ${veri.donemler.hafta.ziyaretci}, 30 gün ${veri.donemler.ay.ziyaretci} ziyaretçi`);
