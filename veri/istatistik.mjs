// Site ziyaret istatistikleri: GoatCounter API'sinden son 60 günü çekip yönetici İstatistik bölümü için tek dosyaya yazar
// (site/data/istatistik.json). GitHub "Site istatistikleri" işi yarım saatte bir çalıştırır.
// Site kodu site/sayac.js'teki KOD'dan okunur; API anahtarı GitHub sırrı GOATCOUNTER_ANAHTAR ("Read statistics" izni yeter).
//   GOATCOUNTER_ANAHTAR=... node veri/istatistik.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const KOK = new URL('..', import.meta.url);
const KOD = readFileSync(new URL('site/sayac.js', KOK), 'utf8').match(/var KOD = '([^']*)'/)?.[1];
const ANAHTAR = process.env.GOATCOUNTER_ANAHTAR;
if (!KOD || !ANAHTAR) {
  console.log(!KOD ? 'site/sayac.js içinde GoatCounter KOD boş: sayaç kapalı.' : 'GOATCOUNTER_ANAHTAR sırrı yok: istatistik çekilmedi.');
  process.exit(0);
}
const API = `https://${KOD}.goatcounter.com/api/v0`;
const bekle = ms => new Promise(r => setTimeout(r, ms));

async function getir(yol, sorgu) {
  for (let deneme = 0; ; deneme++) {
    await bekle(300); // GoatCounter sınırı saniyede 4 istek
    const r = await fetch(`${API}${yol}?${new URLSearchParams(sorgu)}`, { headers: { Authorization: `Bearer ${ANAHTAR}`, 'Content-Type': 'application/json' } });
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

// Günlük ve saatlik ziyaretçi (sitenin GoatCounter ayarındaki saat dilimine göre): 60 gün (30 günü öncekiyle kıyaslamak için)
const toplam = await getir('/stats/total', { start: iso(bugunBas - 59 * GUN), end: iso(bitis) });
const gunler = (toplam.stats ?? []).map(s => ({ gun: s.day.slice(0, 10), z: s.daily ?? 0, saat: s.hourly ?? [] })).sort((a, b) => a.gun.localeCompare(b.gun));

const liste = (x, ad = s => s.name) => (x.stats ?? []).map(s => ({ ad: ad(s), id: s.id ?? '', n: s.count ?? 0 })).filter(s => s.n > 0);
async function donem(bas) {
  const sorgu = { start: iso(bas), end: iso(bitis) };
  const sonuc = {};
  for (const [anahtar, sayfa] of [['cihaz', 'sizes'], ['sistem', 'systems'], ['tarayici', 'browsers'], ['kaynak', 'toprefs'], ['ulke', 'locations']]) {
    sonuc[anahtar] = liste(await getir(`/stats/${sayfa}`, { ...sorgu, limit: 20 }));
  }
  const hits = await getir('/stats/hits', { ...sorgu, limit: 100 });
  sonuc.bolum = (hits.hits ?? []).filter(h => !h.event).map(h => ({ ad: h.path, n: h.count ?? 0 })).filter(h => h.n > 0);
  sonuc.ziyaretci = hits.total ?? sonuc.bolum.reduce((t, h) => t + h.n, 0);
  return sonuc;
}

const veri = {
  guncelleme: new Date(simdi).toISOString(),
  gunler: gunler.map(({ gun, z }) => ({ gun, z })),
  saatlik: Object.fromEntries(gunler.slice(-2).map(g => [g.gun, g.saat])),
  donemler: { bugun: await donem(bugunBas), hafta: await donem(bugunBas - 6 * GUN), ay: await donem(bugunBas - 29 * GUN) },
};
const dosya = new URL('site/data/istatistik.json', KOK);
let eski = null;
try { eski = JSON.parse(readFileSync(dosya, 'utf8')); } catch { /* ilk çalışma */ }
if (eski && JSON.stringify({ ...eski, guncelleme: 0 }) === JSON.stringify({ ...veri, guncelleme: 0 })) {
  console.log('Değişiklik yok.');
  process.exit(0);
}
writeFileSync(dosya, `${JSON.stringify(veri)}\n`);
console.log(`İstatistik yazıldı: bugün ${veri.donemler.bugun.ziyaretci}, 7 gün ${veri.donemler.hafta.ziyaretci}, 30 gün ${veri.donemler.ay.ziyaretci} ziyaretçi`);
