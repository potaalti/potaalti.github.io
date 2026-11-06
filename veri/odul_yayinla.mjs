// Haftanın ödül görsellerini yayınlar (bilgisayarda ya da GitHub Actions'ta, .github/workflows/bsl-odul.yml):
// site/ küçük bir sunucuyla açılır, yönetici ?uret sayfası görselleri üretir (odul.js); JPEG'ler site/odul/gorsel[/bsl]/<hafta>/
// altına, listesi ve notlar (fotoğraf uyarıları, eşleşmeyen isimler) <hafta>.json'a, haftalar index.json'a yazılır.
// BSL'de liste gelmez: oyuncular kurallarla seçilir (app.js bslListesi), seçilen liste odul/liste/bsl-<hafta>.txt'ye kaydedilir.
//   node veri/odul_yayinla.mjs <hafta> [tbl|bsl]
//   node veri/odul_yayinla.mjs otomatik bsl   son yayınlanandan sonra biten haftaları yayınlar (biten yoksa bir şey yapmaz)
// Gerekenler: veri/ altında puppeteer-core (npm install --no-save --prefix veri puppeteer-core) ve Chrome (CHROME ile değişir).
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const KAYNAK = 'https://potaalti.github.io/tbl_fantezi_lig/data';
const CHROME = process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const LIG = process.argv[3] === 'bsl' ? 'bsl' : 'tbl';
const KOK = join(SITE, 'odul', 'gorsel', ...(LIG === 'bsl' ? ['bsl'] : []));
const sade = s => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const idxYol = join(KOK, 'index.json');
const index = () => (existsSync(idxYol) ? JSON.parse(readFileSync(idxYol, 'utf-8')) : { haftalar: [] });

// Yayınlanacak haftalar: elle verilen ya da (otomatik) son yayınlanandan sonraki biten haftalar. Hafta, maçlarının hepsi bitince
// ya da (ertelenen maç varsa) sonraki haftada maç oynanınca biter.
async function haftalar() {
  if (process.argv[2] !== 'otomatik') return [Number(process.argv[2])];
  const maclar = h => fetch(`${KAYNAK}/maclar/${LIG}-${h}.json?t=${Date.now()}`).then(r => (r.ok ? r.json() : null)).then(d => d?.maclar ?? null).catch(() => null);
  const sonuc = [];
  for (let h = Math.max(0, ...index().haftalar) + 1; ; h++) {
    const bu = await maclar(h);
    if (!bu?.length) break;
    if (bu.some(m => m.durum === 'canli')) break;
    if (!bu.every(m => m.durum === 'bitti') && !(await maclar(h + 1))?.some(m => m.durum === 'bitti')) break;
    sonuc.push(h);
  }
  return sonuc;
}

const TUR = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
function sunucu() {
  const s = createServer((ist, yan) => {
    let yol = normalize(decodeURIComponent(ist.url.split('?')[0])).replace(/^[\\/]+/, '');
    if (!yol || yol.endsWith('/') || yol.endsWith('\\')) yol = join(yol, 'index.html');
    const dosya = join(SITE, yol);
    if (!dosya.startsWith(SITE) || !existsSync(dosya)) { yan.writeHead(404); yan.end(); return; }
    yan.writeHead(200, { 'Content-Type': TUR[extname(dosya).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(dosya).pipe(yan);
  });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok(s)));
}

async function yayinla(tarayici, adres, hafta) {
  const s = await tarayici.newPage();
  await s.setViewport({ width: 1280, height: 1000 });
  const hatalar = [];
  s.on('pageerror', e => hatalar.push(e.message));
  await s.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('potaAltiYonetici', '1');
      localStorage.setItem('indirSeridiKapandi', String(Date.now()));
      for (const k of Object.keys(localStorage)) if (k.startsWith('odulListesi-')) localStorage.removeItem(k);
    } catch { /* yok */ }
  });
  await s.goto(`${adres}/?uret#/lig/${LIG}/odul/${hafta}`, { waitUntil: 'networkidle2' });
  await s.waitForFunction(() => /görsel hazır/.test(document.body.innerText), { timeout: 300000 });
  const notlar = await s.evaluate(() => [...document.querySelectorAll('.hata-kutu, .odul-uyari')]
    .flatMap(e => e.innerText.split('\n')).map(x => x.trim()).filter(x => x && !/^📷|^Uygun fotoğraflarını/.test(x)));
  const liste = await s.evaluate(() => document.getElementById('odul-liste')?.value ?? '');
  const gorseller = await s.evaluate(async () => {
    const sonuc = [];
    for (const img of document.querySelectorAll('.odul-izgara img')) {
      const i = new Image(); i.src = img.src; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      c.getContext('2d').drawImage(i, 0, 0);
      sonuc.push({ bilgi: JSON.parse(img.dataset.bilgi || '{}'), jpg: c.toDataURL('image/jpeg', 0.93).split(',')[1] });
    }
    return sonuc;
  });
  await s.close();
  if (!gorseller.length) throw new Error(`${hafta}. hafta: görsel üretilemedi (${[...notlar, ...hatalar].join(' | ')})`);
  const dizin = join(KOK, String(hafta));
  rmSync(dizin, { recursive: true, force: true });
  mkdirSync(dizin, { recursive: true });
  const kayit = gorseller.map(({ bilgi, jpg }, i) => {
    const dosya = `${String(i + 1).padStart(2, '0')}-${sade(bilgi.tur === 'besli' ? bilgi.baslik : bilgi.oyuncu ? `${bilgi.baslik}-${bilgi.oyuncu}` : bilgi.baslik ?? 'gorsel')}.jpg`;
    writeFileSync(join(dizin, dosya), Buffer.from(jpg, 'base64'));
    return { dosya, ...bilgi };
  });
  writeFileSync(join(KOK, `${hafta}.json`), JSON.stringify({ hafta, guncelleme: new Date().toISOString(), notlar, gorseller: kayit }, null, 1));
  const idx = index();
  idx.haftalar = [...new Set([...idx.haftalar, hafta])].sort((a, b) => a - b);
  writeFileSync(idxYol, JSON.stringify(idx));
  if (LIG === 'bsl' && liste.trim()) writeFileSync(join(SITE, 'odul', 'liste', `bsl-${hafta}.txt`), `${liste.trim()}\n`);
  console.log(`${LIG.toUpperCase()} ${hafta}. hafta: ${kayit.length} görsel:`, kayit.map(x => x.dosya).join(', '));
  console.log('LİSTE:\n' + liste.trim());
  console.log('NOTLAR:', notlar.length ? `\n${notlar.join('\n')}` : 'yok');
  console.log('sayfa hataları:', hatalar.join(' | ') || 'yok');
}

const yapilacak = await haftalar();
if (!yapilacak.length) { console.log('Yayınlanacak yeni hafta yok.'); process.exit(0); }
const srv = await sunucu();
const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
try {
  for (const h of yapilacak) await yayinla(tarayici, `http://127.0.0.1:${srv.address().port}`, h);
} finally {
  await tarayici.close();
  srv.close();
}
