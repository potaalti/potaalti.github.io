// Haftanın programı şablonları (bir kez çalışır): kullanıcının yapay zekayla hazırladığı örnek görsellerinden (TBL 9. hafta,
// BSL 6. hafta, 1280x1600) boş şablon çıkarır: hafta numarası ve tarih yazısı silinir; maç paneli program.js'te her hafta
// yeniden çizildiği için olduğu gibi kalır, ama panelin renkleri (her satırda sol ve sağ kenar) ölçülüp <lig>.json'a yazılır.
//   node veri/program_sablon.mjs <tbl-ornek> <bsl-ornek>
// Çıktı: site/program/sablon/<lig>.webp, <lig>.json, youtube-tbf.png, ht-spor.png (TBL örneğinden kesilen yayın simgeleri)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CIKTI = fileURLToPath(new URL('../site/program/sablon/', import.meta.url));
mkdirSync(CIKTI, { recursive: true });
const [, , TBL, BSL] = process.argv;
const veri = f => `data:image/webp;base64,${readFileSync(f).toString('base64')}`;

// Ölçüler (1280x1600 görselde): numara ve tarih kutuları, panel(ler)
const AYAR = {
  tbl: { numara: [70, 70, 132, 138], tarih: [232, 338, 400, 56], panel: [62, 403, 1153, 1057],
    kenar: [[68, 104], [1172, 1208]], bayAlt: [512, 1452, 116, 36] },
  bsl: { numara: [66, 66, 134, 128], tarih: [172, 318, 440, 76], tarihKapali: true, panel: [50, 408, 1178, 982],
    kenar: [[56, 76], [1200, 1222]], zemin: [[26, 44], [1236, 1254]],
    // Panel renkleri yalnızca ilk gün panelinin içinden (paneller arası boşluk ve kenar gölgeleri karışmasın)
    ornek: [420, 748] },
};

const SAYFA = `<!doctype html><html><body><script>
const yukle = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
const L = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
// Maskeli piksellerin içini çevresinden yayarak doldurur (Laplace; maske dışı pikseller sabit)
function doldur(x, X, Y, W, H, maske) {
  const img = x.getImageData(X, Y, W, H), d = img.data, f = new Float32Array(W * H * 3);
  for (let k = 0; k < W * H; k++) for (let c = 0; c < 3; c++) f[k * 3 + c] = d[k * 4 + c];
  for (let it = 0; it < 900; it++) for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i; if (!maske[k]) continue;
    for (let c = 0; c < 3; c++) f[k * 3 + c] = (f[(k - 1) * 3 + c] + f[(k + 1) * 3 + c] + f[(k - W) * 3 + c] + f[(k + W) * 3 + c]) / 4;
  }
  for (let k = 0; k < W * H; k++) if (maske[k]) for (let c = 0; c < 3; c++) d[k * 4 + c] = f[k * 3 + c];
  x.putImageData(img, X, Y);
}
// Bir kutudaki uyan pikseller (sart) + n piksel genişletme
function maskele(x, [X, Y, W, H], sart, n) {
  const d = x.getImageData(X, Y, W, H).data; let m = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (sart(d[k * 4], d[k * 4 + 1], d[k * 4 + 2])) m[k] = 1;
  for (let t = 0; t < n; t++) { const y = m.slice(); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; if (m[k - 1] || m[k + 1] || m[k - W] || m[k + W]) y[k] = 1; } m = y; }
  // Kutunun kenar pikselleri sabit kalır (dolgu onlardan yayılır)
  for (let i = 0; i < W; i++) { m[i] = 0; m[(H - 1) * W + i] = 0; } for (let j = 0; j < H; j++) { m[j * W] = 0; m[j * W + W - 1] = 0; }
  return m;
}
const ortanca = a => a.sort((p, q) => p - q)[a.length >> 1];
// Her satırda [x0, x1] aralığının ortanca rengi; dikeyde 9 satırlık ortancayla yumuşatılır
function seritRenk(x, [x0, x1], y0, y1) {
  const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0, ham = [];
  for (let j = 0; j < y1 - y0; j++) ham.push([0, 1, 2].map(c => ortanca(Array.from({ length: W }, (_, i) => d[(j * W + i) * 4 + c]))));
  return ham.map((_, j) => [0, 1, 2].map(c => Math.round(ortanca(ham.slice(Math.max(0, j - 4), j + 5).map(r => r[c])))));
}
window.uret = async (src, A, lig) => {
  const im = await yukle(src);
  const c = document.createElement('canvas'); c.width = 1280; c.height = 1600;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, 1280, 1600);
  const sonuc = { lig };
  // Yayın simgeleri (TBL örneğinden, panel zemini saydam yapılır)
  if (lig === 'tbl') {
    const kes = ([X, Y, W, H]) => { const k = document.createElement('canvas'); k.width = W; k.height = H; const g = k.getContext('2d');
      g.drawImage(c, X, Y, W, H, 0, 0, W, H); const o = g.getImageData(0, 0, W, H), d = o.data;
      const z = [d[0], d[1], d[2]];
      for (let p = 0; p < W * H; p++) { const fark = Math.max(...[0, 1, 2].map(q => Math.abs(d[p * 4 + q] - z[q]))); d[p * 4 + 3] = Math.max(0, Math.min(255, (fark - 14) * 6)); }
      g.putImageData(o, 0, 0); return k.toDataURL('image/png'); };
    sonuc.youtube = kes([596, 546, 90, 34]);
    sonuc.ht = kes([614, 834, 54, 60]);
  }
  // Hafta numarası: beyaz/gri (doygunluğu düşük, açık) pikseller; altındaki renkli "PROGRAMI" yazısı kalır
  const beyaz = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 95 && (mx - mn) / mx < 0.2; };
  doldur(x, ...A.numara, maskele(x, A.numara, beyaz, 3));
  // Tarih: fırça şeridin (açık renk) içindeki koyu yazı. BSL'de (tarihKapali) yalnızca altında ve üstünde şerit olan koyu
  // pikseller: kutu şeridin dışındaki koyu zemine taşıyor, o silinmez
  {
    const [X, Y, W, H] = A.tarih, d = x.getImageData(X, Y, W, H).data;
    const acik = k => L(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) > 140;
    const koyu = (r, g, b) => L(r, g, b) < 205 && !(g > 150 && b > 180 && r < 130);
    const m = maskele(x, A.tarih, koyu, 2);
    if (A.tarihKapali) for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
      const k = j * W + i; if (!m[k]) continue;
      let ust = false, alt = false;
      for (let v = 1; v <= 40 && !ust; v++) if (j - v >= 0 && acik(k - v * W)) ust = true;
      for (let v = 1; v <= 40 && !alt; v++) if (j + v < H && acik(k + v * W)) alt = true;
      if (!ust || !alt) m[k] = 0;
    }
    doldur(x, X, Y, W, H, m);
  }
  // TBL: BAY halkasının panel dışına taşan alt ucu
  if (A.bayAlt) { const [X, Y, W, H] = A.bayAlt; const m = new Uint8Array(W * H); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) m[j * W + i] = 1; doldur(x, X, Y, W, H, m); }
  // Panel renkleri (her satırda sol ve sağ kenar)
  const [, py, , ph] = A.panel;
  const [o0, o1] = A.ornek ?? [py, py + ph];
  sonuc.panelSol = seritRenk(x, A.kenar[0], o0, o1);
  sonuc.panelSag = seritRenk(x, A.kenar[1], o0, o1);
  if (A.zemin) { sonuc.zeminSol = seritRenk(x, A.zemin[0], py - 10, py + ph + 10); sonuc.zeminSag = seritRenk(x, A.zemin[1], py - 10, py + ph + 10); }
  sonuc.webp = c.toDataURL('image/webp', 0.93);
  return sonuc;
};
</script></body></html>`;

const t = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await t.newPage();
await p.setContent(SAYFA);
for (const [lig, dosya] of [['tbl', TBL], ['bsl', BSL]]) {
  const s = await p.evaluate((src, A, l) => window.uret(src, A, l), veri(dosya), AYAR[lig], lig);
  const yaz = (ad, url) => writeFileSync(`${CIKTI}${ad}`, Buffer.from(url.split(',')[1], 'base64'));
  yaz(`${lig}.webp`, s.webp);
  if (s.youtube) { yaz('youtube-tbf.png', s.youtube); yaz('ht-spor.png', s.ht); }
  const { webp, youtube, ht, ...json } = s;
  writeFileSync(`${CIKTI}${lig}.json`, JSON.stringify({ ...json, ...AYAR[lig] }));
  console.log(lig, 'tamam');
}
await t.close();
