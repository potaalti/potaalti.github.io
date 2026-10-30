// TBL Fantezi (ortak motor, /tbl/): ligi Google girişiyle kurar, eski TBL Fantezi'nin kadrolarını içe aktarır ve
// eski siteyle haftalık sıralamaları, genel klasmanı ve her takımın her haftasındaki oyuncuları karşılaştırır.
// Geçiş gününden önce çalıştırılır: emülatör (fantezi/) ve yerel site (python -m http.server 8790 --directory site) açıkken
//   node tbl-karsilastir.mjs   (Chrome'un yolu farklıysa CHROME ortam değişkeniyle)
import puppeteer from 'puppeteer-core';

const ESKI = 'https://potaalti.github.io/tbl_fantezi_lig/';
const YENI = 'http://127.0.0.1:8790/tbl/';
const bekle = ms => new Promise(r => setTimeout(r, ms));
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-tbl-fantezi/databases/(default)/documents', { method: 'DELETE' });
await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-tbl-fantezi/accounts', { method: 'DELETE' });

const t = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const yeni = await (await t.createBrowserContext()).newPage();
await yeni.setViewport({ width: 1280, height: 1000 });
yeni.on('dialog', d => d.accept());
const hatalar = [];
yeni.on('pageerror', e => hatalar.push(e.message));
await yeni.goto(YENI, { waitUntil: 'networkidle2' });
await yeni.waitForFunction(() => window.S?.hazir, { timeout: 20000 });
// Google ile giriş (emülatörün sahte hesabı)
const popupGeldi = new Promise(r => yeni.browser().once('targetcreated', x => r(x.page())));
await yeni.evaluate(() => document.querySelector('[data-is=google-giris]').click());
const popup = await popupGeldi;
await popup.waitForSelector('#add-account-button', { timeout: 15000 });
await bekle(800);
await popup.evaluate(() => document.querySelector('#add-account-button').click());
await bekle(800);
await popup.evaluate(() => {
  const yaz = (sec, v) => { const el = document.querySelector(sec); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  yaz('#email-input', 'yonetici@ornek.com');
  yaz('#display-name-input', 'Yönetici');
});
await bekle(300);
await popup.evaluate(() => document.querySelector('#sign-in').click());
await yeni.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
await yeni.waitForFunction(() => window.S?.hazir, { timeout: 20000 });
await bekle(1500);
console.log('kurulum ekranı:', await yeni.evaluate(() => document.querySelector('#icerik').innerText.replace(/\s+/g, ' ').slice(0, 160)));
// Kurulunca sayfa kendiliğinden Yönetici sayfasına (takımlar ve davetler) geçer
await Promise.all([yeni.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }), yeni.evaluate(() => document.querySelector('[data-is=tbl-kur]').click())]);
await yeni.waitForFunction(() => window.S?.hazir && Object.keys(window.S.kadrolar).length, { timeout: 20000 });
await bekle(1500);
console.log('kurulumdan sonra:', await yeni.evaluate(() => `${location.hash} · ${document.querySelector('#icerik h3')?.textContent} · ${document.querySelectorAll('[data-is=kopyala]').length} davet linki`));
await bekle(2000);
console.log('durum:', await yeni.evaluate(() => JSON.stringify({ asama: S.durum.asama, aktifHafta: S.durum.aktifHafta, takim: Object.keys(S.takimlar).length, ayar: { baslangic: S.ayar.baslangicHaftasi, deg: S.ayar.degisiklikHakki, yab: S.ayar.asEnFazlaYabanci } })));

// ---------- Karşılaştırma ----------
const index = await (await fetch(`${ESKI}data/hafta/index.json?t=${Date.now()}`)).json();
const haftalar = index.haftalar;
const eski = await t.newPage();
await eski.goto(ESKI, { waitUntil: 'networkidle2' });
const ilkTakim = await eski.evaluate(async () => (await (await fetch('data/kadro/index.json')).json()).haftalar.at(-1))
  .then(async n => (await (await fetch(`${ESKI}data/kadro/${n}.json`)).json())[0].ad);
await eski.evaluate(ad => localStorage.setItem('tbl-fantezi-takimim', ad), ilkTakim);
await eski.reload({ waitUntil: 'networkidle2' });

let kontrol = 0;
let fark = 0;
function esit(baslik, a, b) {
  kontrol++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fark++;
    console.log(`  ✗ ${baslik}\n    eski: ${JSON.stringify(a).slice(0, 500)}\n    yeni: ${JSON.stringify(b).slice(0, 500)}`);
  }
}
async function git(p, hash, secici) {
  await p.evaluate(h => { location.hash = h; }, hash);
  await p.waitForSelector(secici, { timeout: 15000 });
  await bekle(300);
}
const sayi = s => Number(String(s).replace(/\./g, '').replace(',', '.'));

for (const n of haftalar) {
  await git(eski, `#/hafta/${n}`, '#icerik a.satir .cip');
  const e = await eski.evaluate(() => [...document.querySelectorAll('#icerik a.satir')].map(a => ({
    ad: a.querySelector('.ad strong').childNodes[0].textContent.trim(), sira: Number(a.querySelector('.sira').textContent), vp: Number(a.querySelector('.sayi strong').textContent), puan: Number(a.querySelector('.cip').textContent),
  })));
  await git(yeni, `#/puan/hafta/${n}`, '#icerik tr[data-is=ac]');
  const y = (await yeni.evaluate(() => [...document.querySelectorAll('#icerik tr[data-is=ac]')].map(tr => {
    const td = tr.querySelectorAll('td');
    return { ad: td[1].querySelector('b').textContent.trim(), sira: td[0].textContent.trim(), vp: td[2].textContent.trim(), puan: td[3].textContent.trim() };
  }))).map(x => ({ ad: x.ad, sira: Number(x.sira), vp: sayi(x.vp), puan: Number(x.puan) }));
  esit(`${n}. TBL haftası sıralaması (${e.length} takım)`, e, y);
  // Her takımın oyuncuları
  for (const s of e) {
    await git(eski, `#/takim/${encodeURIComponent(s.ad)}/${n}`, '#icerik .satir.oyuncu');
    const eo = await eski.evaluate(() => [...document.querySelectorAll('#icerik .satir.oyuncu')].map(a => ({
      id: a.getAttribute('href')?.split('/').pop() ?? null, vp: Number(a.querySelector('.sayi strong').textContent), sayildi: !a.classList.contains('sayilmadi'),
    })).sort((x, z) => String(x.id).localeCompare(String(z.id))));
    const yo = await yeni.evaluate(ad => {
      const tr = [...document.querySelectorAll('#icerik tr[data-is=ac]')].find(x => x.querySelector('td b').textContent.trim() === ad);
      if (S.ui.acik !== tr.dataset.id) tr.click();
      return new Promise(r => setTimeout(() => r([...document.querySelectorAll('#icerik tr.detay tr[data-oyuncu]')].map(x => ({
        id: x.dataset.oyuncu.startsWith('adsiz:') ? null : x.dataset.oyuncu, vp: Number(x.lastElementChild.textContent.replace(',', '.')), sayildi: x.dataset.sayildi === 'true',
      }))), 300));
    }, s.ad);
    esit(`${s.ad} · ${n}. hafta oyuncuları`, eo, yo.sort((x, z) => String(x.id).localeCompare(String(z.id))));
  }
}
await git(eski, '#/genel', '#icerik a.satir');
const eg = await eski.evaluate(() => [...document.querySelectorAll('#icerik a.satir')].map(a => ({
  ad: a.querySelector('.ad strong').childNodes[0].textContent.trim(), sira: Number(a.querySelector('.sira').textContent), puan: Number(a.querySelector('.sayi strong').textContent),
})));
await git(yeni, '#/puan', '#icerik tr[data-is=git]');
await yeni.evaluate(() => document.querySelector('[data-is=puan-sekme][data-id=genel]')?.click());
await bekle(300);
const yg = await yeni.evaluate(() => [...document.querySelectorAll('#icerik tr[data-is=git][data-yol^="#/takim/"]')].map(tr => {
  const td = tr.querySelectorAll('td');
  return { ad: td[1].querySelector('b').textContent.trim(), sira: Number(td[0].querySelector('.madalya')?.textContent ?? td[0].textContent), puan: Number(td[2].textContent) };
}));
esit(`Genel klasman (${eg.length} takım)`, eg, yg);
// Bugünkü kadrolar: eski sitenin son kadro dosyasıyla birebir (As ve Yedek, sırasıyla)
const kIndex = await (await fetch(`${ESKI}data/kadro/index.json?t=${Date.now()}`)).json();
const sonKadro = await (await fetch(`${ESKI}data/kadro/${kIndex.haftalar.at(-1)}.json?t=${Date.now()}`)).json();
const yk = await yeni.evaluate(() => Object.fromEntries(Object.entries(S.takimlar).map(([id, x]) => [x.ad, { as: S.kadrolar[id].as, yedek: S.kadrolar[id].yedek }])));
const pid = p => p.id || `adsiz:${p.ad}`;
for (const x of sonKadro) esit(`${x.ad} · bugünkü kadro`, { as: x.as.map(pid), yedek: x.yedek.map(pid) }, yk[x.ad]);
console.log(`\nSonuç: ${kontrol} karşılaştırma, ${fark} fark. Sayfa hataları: ${hatalar.length ? hatalar.join(' | ') : 'yok'}`);
await t.close();
process.exit(fark ? 1 : 0);
