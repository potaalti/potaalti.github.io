// Puan durumu görseli şablonları (bir kez çalışır): kullanıcının yapay zekayla hazırladığı örneklerinden (1600x2000; TBL "LİG
// SIRALAMASI GALİBİYET YÜZDESİNE GÖRE", BSL "PUAN DURUMU") boş şablon: her satırda hücrelerin içindeki yazılar silinir (koyu
// kutularda açık yazı, açık hücrelerde koyu rakamlar), hücrelerin kendisi, logo halkaları, başlık ve tablo başlığı kalır.
// Satırların yeri koyu "SIRA" kutularından ölçülür ve <ad>.json'a yazılır; program.js tabloGorseli oradan çizer.
//   node veri/tablo_sablon.mjs tbl=<ornek> bsl=<ornek>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CIKTI = fileURLToPath(new URL('../site/program/sablon/', import.meta.url));
mkdirSync(CIKTI, { recursive: true });
const GIRDI = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const veri = f => `data:image/webp;base64,${readFileSync(f).toString('base64')}`;

// Sütunlar (x aralıkları): koyu kutular (açık yazı silinir), açık hücreler (koyu yazı silinir), logo halkası, takım adı
const AYAR = {
  tbl: { olcuX: 150, ilkY: 540, sonY: 1800, koyuEsik: 50, acikEsik: 212,
    koyu: [[135, 216], [300, 656], [940, 1116], [1138, 1333], [1352, 1468]], acik: [[668, 928]],
    sutun: { sira: 176, logo: [262, 31], ad: [343, 300], acik: [['o', 710], ['g', 797], ['m', 884]],
      kutu: [['yuzde', 1028], ['averaj', 1235], ['puan', 1410]] } },
  bsl: { olcuX: 95, ilkY: 540, sonY: 1760, koyuEsik: 45, acikEsik: 212, ustYazi: [100, 0, 600, 66],
    koyu: [[80, 160], [252, 578], [1440, 1526]], acik: [[590, 1428]],
    sutun: { sira: 120, logo: [213, 31], ad: [285, 300], acik: [['o', 635], ['g', 725], ['m', 813], ['atilan', 912], ['yenilen', 1027],
      ['icPuan', 1135], ['icAveraj', 1244], ['averaj', 1362]], kutu: [['puan', 1482]] } },
};

const SAYFA = `<!doctype html><html><body><script>
const yukle = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
const L = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function doldur(x, X, Y, W, H, maske) {
  const img = x.getImageData(X, Y, W, H), d = img.data, f = new Float32Array(W * H * 3);
  for (let k = 0; k < W * H; k++) for (let c = 0; c < 3; c++) f[k * 3 + c] = d[k * 4 + c];
  const ort = [0, 0, 0]; let n = 0;
  for (let k = 0; k < W * H; k++) if (!maske[k]) { for (let c = 0; c < 3; c++) ort[c] += f[k * 3 + c]; n++; }
  for (let k = 0; k < W * H; k++) if (maske[k]) for (let c = 0; c < 3; c++) f[k * 3 + c] = ort[c] / Math.max(1, n);
  for (let it = 0; it < 600; it++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i; if (!maske[k]) continue;
    for (let c = 0; c < 3; c++) f[k * 3 + c] = (f[(k - 1) * 3 + c] + f[(k + 1) * 3 + c] + f[(k - W) * 3 + c] + f[(k + W) * 3 + c]) / 4;
  }
  for (let k = 0; k < W * H; k++) if (maske[k]) for (let c = 0; c < 3; c++) d[k * 4 + c] = f[k * 3 + c];
  x.putImageData(img, X, Y);
}
function maskele(x, X, Y, W, H, sart, n) {
  const d = x.getImageData(X, Y, W, H).data; let m = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (sart(d[k * 4], d[k * 4 + 1], d[k * 4 + 2])) m[k] = 1;
  for (let t = 0; t < n; t++) { const y = m.slice(); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; if (m[k - 1] || m[k + 1] || m[k - W] || m[k + W]) y[k] = 1; } m = y; }
  for (let i = 0; i < W; i++) { m[i] = 0; m[(H - 1) * W + i] = 0; } for (let j = 0; j < H; j++) { m[j * W] = 0; m[j * W + W - 1] = 0; }
  return m;
}
window.uret = async (src, A) => {
  const im = await yukle(src);
  const c = document.createElement('canvas'); c.width = 1600; c.height = 2000;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, 1600, 2000);
  // Satırlar: "SIRA" sütunundaki koyu kutular
  const d = x.getImageData(A.olcuX, A.ilkY, 1, A.sonY - A.ilkY).data, satirlar = [];
  let bas = null;
  for (let j = 0; j <= A.sonY - A.ilkY; j++) {
    const koyu = j < A.sonY - A.ilkY && L(d[j * 4], d[j * 4 + 1], d[j * 4 + 2]) < 70;
    if (koyu && bas === null) bas = j;
    if (!koyu && bas !== null) { if (j - bas > 25) satirlar.push([A.ilkY + bas, A.ilkY + j - 1]); bas = null; }
  }
  // BSL: en üstteki "TÜRKİYE SİGORTA / BASKETBOL SÜPER LİGİ" örnekte görselin üstünden kesik: silinir, program.js tam yazar
  if (A.ustYazi) {
    const [X, Y, W, H] = A.ustYazi;
    doldur(x, X, Y, W, H, maskele(x, X, Y, W, H, (r, g, bb) => L(r, g, bb) > 105, 3));
    const satir = x.getImageData(X, 9, W, 1);
    for (let j = 0; j < 9; j++) x.putImageData(satir, X, j);
  }
  for (const [y0, y1] of satirlar) {
    const Y = y0 + 3, H = y1 - y0 - 5;
    // Yazının yumuşak kenarları da (hayalet kalmasın): koyu kutuda zeminden biraz açık her piksel, açık hücrede zeminden biraz koyu
    for (const [a, b] of A.koyu) doldur(x, a, Y, b - a, H, maskele(x, a, Y, b - a, H, (r, g, bb) => L(r, g, bb) > A.koyuEsik, 3));
    for (const [a, b] of A.acik) doldur(x, a, Y - 2, b - a, H + 4, maskele(x, a, Y - 2, b - a, H + 4, (r, g, bb) => L(r, g, bb) < A.acikEsik, 3));
  }
  return { satirlar, webp: c.toDataURL('image/webp', 0.93) };
};
</script></body></html>`;

const t = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await t.newPage();
await p.setContent(SAYFA);
for (const [lig, dosya] of Object.entries(GIRDI)) {
  const s = await p.evaluate((src, A) => window.uret(src, A), veri(dosya), AYAR[lig]);
  writeFileSync(`${CIKTI}tablo-${lig}.webp`, Buffer.from(s.webp.split(',')[1], 'base64'));
  writeFileSync(`${CIKTI}tablo-${lig}.json`, JSON.stringify({ satirlar: s.satirlar, sutun: AYAR[lig].sutun }));
  console.log(lig, s.satirlar.length, 'satır');
}
await t.close();
