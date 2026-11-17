// Oyuncu sayfası için küçük fotoğraflar: site/data/<lig>/foto/<id>.* (TBF) ve site/odul/foto/ (yöneticinin elle verdiği,
// öncelikli) -> site/data/<lig>/foto-k/<id>.webp, ayrıca site/data/<lig>/foto-k/liste.json { id: 1 dekupe | 0 vesikalık }.
// Dekupe (arka planı silinmiş, dizden yukarı forma fotoğrafı) belden yukarı kırpılır; vesikalık 4:5 kırpılır. Sadece yeni ya da
// kaynağı değişen fotoğraflar işlenir. Fotoğrafın küçüğü yoksa sayfa büyük aslını kullanır (veri/uret.py).
//   node veri/foto_kucult.mjs [tbl|bsl ...]     (gerekenler odul_yayinla.mjs ile aynı: puppeteer-core ve Chrome)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const CHROME = process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const TUR = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const ligler = process.argv.slice(2).length ? process.argv.slice(2) : ['tbl', 'bsl'];

const elle = JSON.parse(fs.readFileSync(path.join(KOK, 'odul/foto/liste.json'), 'utf8'));
const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true });
const sayfa = await tarayici.newPage();

// Tarayıcıda: resmi aç, dekupe mi bak, kırp, küçült, webp döndür
async function kucult(veriUrl) {
  return sayfa.evaluate(async src => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const a = (x, y) => d[(y * W + x) * 4 + 3];
    const dekupe = a(0, 0) < 20 && a(W - 1, 0) < 20;
    let x0 = 0, y0 = 0, w = W, h = H;
    if (dekupe) {
      // İçeriğin kutusu (saydam olmayan pikseller)
      let sol = W, sag = -1, ust = H, alt = -1;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (a(x, y) > 40) {
        if (x < sol) sol = x; if (x > sag) sag = x; if (y < ust) ust = y; if (y > alt) alt = y;
      }
      if (sag < 0) return null;
      const kw = sag - sol, kh = alt - ust;
      // Belden yukarı: boy en çok enin 1,3 katı (boydan fotoğrafta baş-bel, belden yukarı fotoğrafta hemen hepsi)
      const yb = Math.min(kh, kw * 1.3);
      const pay = Math.round(kw * 0.04);
      x0 = Math.max(0, sol - pay); y0 = Math.max(0, ust - pay);
      w = Math.min(W, sag + pay) - x0; h = Math.min(H, Math.round(ust + yb)) - y0;
    } else {
      // Vesikalık: ortadan 4:5, üstten hizalı
      if (W / H > 0.8) { w = Math.round(H * 0.8); x0 = Math.round((W - w) / 2); } else { h = Math.round(W / 0.8); }
    }
    const hedefY = dekupe ? 440 : 400;
    const o = Math.min(1, hedefY / h);
    const k = document.createElement('canvas'); k.width = Math.round(w * o); k.height = Math.round(h * o);
    const kg = k.getContext('2d'); kg.imageSmoothingQuality = 'high';
    kg.drawImage(c, x0, y0, w, h, 0, 0, k.width, k.height);
    return { dekupe, veri: k.toDataURL('image/webp', 0.82) };
  }, veriUrl);
}

for (const lig of ligler) {
  const kaynakKlasor = path.join(KOK, 'data', lig, 'foto');
  const hedefKlasor = path.join(KOK, 'data', lig, 'foto-k');
  fs.mkdirSync(hedefKlasor, { recursive: true });
  const listeYolu = path.join(hedefKlasor, 'liste.json');
  const liste = fs.existsSync(listeYolu) ? JSON.parse(fs.readFileSync(listeYolu, 'utf8')) : {};
  const kaynaklar = new Map(fs.readdirSync(kaynakKlasor).filter(f => TUR[path.extname(f).toLowerCase()])
    .map(f => [path.basename(f, path.extname(f)), path.join(kaynakKlasor, f)]));
  // Haftanın ödüllerinde elle verilen fotoğraflar öncelikli (TBF'de fotoğrafı olmayan oyuncu da bu ligdeyse alınır)
  const ligde = new Set(JSON.parse(fs.readFileSync(path.join(KOK, 'data', lig, 'oyuncular.json'), 'utf8')).map(o => String(o.id)));
  for (const [id, dosya] of Object.entries(elle)) if (kaynaklar.has(id) || ligde.has(id)) kaynaklar.set(id, path.join(KOK, 'odul/foto', dosya));
  let yeni = 0;
  for (const [id, kaynak] of kaynaklar) {
    const hedef = path.join(hedefKlasor, `${id}.webp`);
    if (fs.existsSync(hedef) && id in liste && fs.statSync(hedef).mtimeMs >= fs.statSync(kaynak).mtimeMs) continue;
    try {
      const veri = fs.readFileSync(kaynak);
      const s = await kucult(`data:${TUR[path.extname(kaynak).toLowerCase()]};base64,${veri.toString('base64')}`);
      if (!s) continue;
      fs.writeFileSync(hedef, Buffer.from(s.veri.split(',')[1], 'base64'));
      liste[id] = s.dekupe ? 1 : 0;
      yeni++;
    } catch (e) {
      console.log(`${lig} ${id}: işlenemedi (${e.message})`);
    }
  }
  for (const id of Object.keys(liste)) if (!kaynaklar.has(id)) { delete liste[id]; fs.rmSync(path.join(hedefKlasor, `${id}.webp`), { force: true }); }
  fs.writeFileSync(listeYolu, JSON.stringify(Object.fromEntries(Object.entries(liste).sort()), null, 0) + '\n');
  console.log(`${lig}: ${yeni} yeni küçük fotoğraf, toplam ${Object.keys(liste).length}`);

  // Takım logoları: logo/<takım>.* -> logo-k/<takım>.webp, uzun kenar 128 px (oyuncu sayfasında 28 px gösterilir; TBF'nin
  // asılları 500 KB'a kadar çıkıyor). Saydamlık korunur.
  const logoKlasor = path.join(KOK, 'data', lig, 'logo');
  const logoHedef = path.join(KOK, 'data', lig, 'logo-k');
  fs.mkdirSync(logoHedef, { recursive: true });
  const logolar = fs.readdirSync(logoKlasor).filter(f => TUR[path.extname(f).toLowerCase()]);
  let yeniLogo = 0;
  for (const f of logolar) {
    const kaynak = path.join(logoKlasor, f);
    const hedef = path.join(logoHedef, `${path.basename(f, path.extname(f))}.webp`);
    if (fs.existsSync(hedef) && fs.statSync(hedef).mtimeMs >= fs.statSync(kaynak).mtimeMs) continue;
    const veri = await sayfa.evaluate(async src => {
      const im = new Image(); im.src = src; await im.decode();
      const o = Math.min(1, 128 / Math.max(im.naturalWidth, im.naturalHeight));
      const k = document.createElement('canvas'); k.width = Math.round(im.naturalWidth * o); k.height = Math.round(im.naturalHeight * o);
      const g = k.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, k.width, k.height);
      return k.toDataURL('image/webp', 0.9);
    }, `data:${TUR[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(kaynak).toString('base64')}`);
    fs.writeFileSync(hedef, Buffer.from(veri.split(',')[1], 'base64'));
    yeniLogo++;
  }
  const kalan = new Set(logolar.map(f => path.basename(f, path.extname(f))));
  for (const f of fs.readdirSync(logoHedef)) if (!kalan.has(path.basename(f, '.webp'))) fs.rmSync(path.join(logoHedef, f));
  console.log(`${lig}: ${yeniLogo} yeni küçük logo, toplam ${logolar.length}`);
}
await tarayici.close();
