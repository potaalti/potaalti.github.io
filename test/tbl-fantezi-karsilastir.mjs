// Eski TBL Fantezi sitesi (yayındaki) ile Pota Altı App'in TBL Fantezi bölümünü birebir karşılaştırır:
// her haftanın sıralaması (takım, sıra, VP, puan), genel klasman (sıra, puan, toplam VP) ve her takımın her haftasındaki
// oyuncuları (VP, sayıldı mı).
//   1) Uygulamayı yerelde aç: python -m http.server 8790 --directory site
//   2) cd test && npm install && node tbl-fantezi-karsilastir.mjs
// Chrome'un yolu farklıysa CHROME ortam değişkeniyle verilir.
import puppeteer from 'puppeteer-core';

const ESKI = 'https://potaalti.github.io/tbl_fantezi_lig/';
const YENI = 'http://localhost:8790/';
const bekle = ms => new Promise(r => setTimeout(r, ms));
const index = await (await fetch(`${ESKI}data/hafta/index.json?t=${Date.now()}`)).json();
const kadroIndex = await (await fetch(`${ESKI}data/kadro/index.json?t=${Date.now()}`)).json();
const haftalar = index.haftalar;
console.log('haftalar:', haftalar.join(', '), '· kadro haftaları:', kadroIndex.haftalar.join(', '));

const t = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function sayfa(kok) {
  const p = await t.newPage();
  await p.goto(kok, { waitUntil: 'networkidle2' });
  return p;
}
const eski = await sayfa(ESKI);
const yeni = await sayfa(YENI);
// Eski sitede takım seçilmeden sıralamalar açılmıyor: bir takım seç
const ilkTakim = (await (await fetch(`${ESKI}data/kadro/${kadroIndex.haftalar.at(-1)}.json?t=${Date.now()}`)).json())[0].ad;
await eski.evaluate(ad => localStorage.setItem('tbl-fantezi-takimim', ad), ilkTakim);
await eski.reload({ waitUntil: 'networkidle2' });

async function git(p, hash, secici) {
  await p.evaluate(h => { location.hash = h; }, hash);
  await p.waitForSelector(secici, { timeout: 15000 });
  await bekle(250);
}
const eskiSiralama = p => p.evaluate(() => [...document.querySelectorAll('#icerik a.satir')].map(a => ({
  ad: a.querySelector('.ad strong').childNodes[0].textContent.trim(),
  sira: a.querySelector('.sira')?.textContent.trim(),
  deger: a.querySelector('.sayi strong')?.textContent.trim(),
  puan: a.querySelector('.cip')?.textContent.trim() ?? null,
})));
const yeniSiralama = (p, deger) => p.evaluate(d => [...document.querySelectorAll('#icerik a.f-satir[data-takim]')].map(a => ({
  ad: a.dataset.takim, sira: a.dataset.sira, deger: a.dataset[d], puan: d === 'vp' ? `+${a.dataset.puan}` : null,
})), deger);

let hata = 0;
let kontrol = 0;
function esit(baslik, a, b) {
  kontrol++;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) {
    hata++;
    console.log(`  ✗ ${baslik}\n    eski: ${ja.slice(0, 400)}\n    yeni: ${jb.slice(0, 400)}`);
  }
}

// Haftalık sıralamalar
for (const n of haftalar) {
  await git(eski, `#/hafta/${n}`, '#icerik a.satir .cip');
  await git(yeni, `#/fantezi/tbl/hafta/${n}`, '#icerik a.f-satir[data-takim]');
  const e = await eskiSiralama(eski);
  const y = await yeniSiralama(yeni, 'vp');
  esit(`${n}. hafta sıralaması (${e.length} takım)`, e, y);
}
// Genel klasman
await git(eski, '#/genel', '#icerik a.satir');
await git(yeni, '#/fantezi/tbl/genel', '#icerik a.f-satir[data-takim]');
const eg = (await eskiSiralama(eski)).map(({ ad, sira, deger }) => ({ ad, sira, deger }));
const yg = (await yeniSiralama(yeni, 'puan')).map(({ ad, sira, deger }) => ({ ad, sira, deger }));
esit(`Genel klasman (${eg.length} takım)`, eg, yg);

// Her takımın her haftası: oyuncular, VP'leri ve sayılıp sayılmadığı
const takimlar = eg.map(x => x.ad);
for (const n of haftalar) {
  for (const ad of takimlar) {
    await git(eski, `#/takim/${encodeURIComponent(ad)}/${n}`, '#icerik .satir.oyuncu');
    await git(yeni, `#/fantezi/tbl/takim/${encodeURIComponent(ad)}/${n}`, '#icerik .f-satir[data-oyuncu]');
    const e = await eski.evaluate(() => [...document.querySelectorAll('#icerik .satir.oyuncu')].map(a => ({
      id: a.getAttribute('href')?.split('/').pop() ?? null, vp: a.querySelector('.sayi strong').textContent.trim(), sayildi: !a.classList.contains('sayilmadi'),
    })));
    const y = await yeni.evaluate(() => [...document.querySelectorAll('#icerik .f-satir[data-oyuncu], #icerik div.f-satir')].filter(a => a.querySelector('.f-sayi')).map(a => ({
      id: a.dataset.oyuncu ?? null, vp: a.querySelector('.f-sayi strong').textContent.trim(), sayildi: !a.classList.contains('sayilmadi'),
    })));
    const eOzet = await eski.evaluate(() => [...document.querySelectorAll('#icerik .ozet strong')].map(s => s.textContent.trim()));
    const yOzet = await yeni.evaluate(() => [...document.querySelectorAll('#icerik .istatistik b')].map(s => s.textContent.trim()));
    esit(`${ad} · ${n}. hafta oyuncuları`, e, y);
    esit(`${ad} · ${n}. hafta özeti (hafta VP, sıra, genel)`, eOzet, yOzet);
  }
}
console.log(`\nSonuç: ${kontrol} karşılaştırma, ${hata} fark.`);
await t.close();
process.exit(hata ? 1 : 0);
