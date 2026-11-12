// Sezon rekorları görseli (yönetici, Rekorlar sekmesi): her kategori ayrı, ilk 10, takım logolu, 1080x1350.
// Pota Altı logosu ve sosyal medya şeridi marka.js'ten; renkler lige göre (TBL turkuaz, BSL mor; seyirci görselleriyle aynı).
import { markaYazilari, logoCiz, sosyalCiz } from './marka.js';
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;600;700&family=Montserrat:wght@500;600;700&display=block';
const G = 1080, Y = 1350;
const LIG = {
  tbl: { ad: 'TÜRKİYE BASKETBOL LİGİ', vurgu: '#2fe0ea', zemin1: '#04161a', zemin2: '#0a4048' },
  bsl: { ad: 'BASKETBOL SÜPER LİGİ', vurgu: '#a46cff', zemin1: '#0b0618', zemin2: '#2a1458' },
};
const MADALYA = ['#f5c542', '#c9d1d9', '#d4874a'];

let yaziHazir;
function yaziTipleri() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['80px Anton', '700 30px Oswald', '600 26px Montserrat'].map(f => document.fonts.load(f, 'ŞĞÜİÖÇ0123'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}
const resim = url => new Promise(ok => { if (!url) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
const buyuk = s => String(s ?? '').toLocaleUpperCase('tr');
function yaz(g, metin, x, y, { font, renk = '#ffffff', hiza = 'left', gen = Infinity }) {
  g.font = font;
  const sx = Math.min(1, gen / g.measureText(metin).width);
  g.save(); g.translate(x, y); g.scale(sx, 1);
  g.font = font; g.fillStyle = renk; g.textAlign = hiza; g.textBaseline = 'middle';
  g.fillText(metin, 0, 0); g.restore();
}
function yuvarlak(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// satirlar: [{ ad, alt, deger, logo }] (sıralı, en çok 10); baslik: 'TEK MAÇTA EN ÇOK SAYI' gibi
export async function rekorGorseli({ lig, baslik, satirlar }) {
  const L = LIG[lig];
  await Promise.all([yaziTipleri(), markaYazilari()]);
  const logolar = await Promise.all(satirlar.map(x => resim(x.logo)));
  const c = document.createElement('canvas'); c.width = G; c.height = Y;
  const g = c.getContext('2d');
  const z = g.createLinearGradient(0, 0, G, Y); z.addColorStop(0, L.zemin2); z.addColorStop(1, L.zemin1);
  g.fillStyle = z; g.fillRect(0, 0, G, Y);
  const isik = g.createRadialGradient(G * 0.88, 70, 0, G * 0.88, 70, 700); isik.addColorStop(0, `${L.vurgu}38`); isik.addColorStop(1, `${L.vurgu}00`);
  g.fillStyle = isik; g.fillRect(0, 0, G, Y);
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
  for (let i = -Y; i < G; i += 46) { g.beginPath(); g.moveTo(i, Y); g.lineTo(i + Y, 0); g.stroke(); }
  // Başlık
  logoCiz(g, 92, 92, 56);
  yaz(g, L.ad, G / 2, 70, { font: '700 26px Oswald', renk: L.vurgu, hiza: 'center' });
  yaz(g, 'SEZON REKORLARI', G / 2, 160, { font: '104px Anton', hiza: 'center', gen: 740 });
  g.font = '700 32px Oswald';
  const ew = Math.min(980, g.measureText(baslik).width + 60);
  yuvarlak(g, G / 2 - ew / 2, 238, ew, 58, 29); g.fillStyle = L.vurgu; g.fill();
  yaz(g, baslik, G / 2, 268, { font: '700 32px Oswald', renk: L.zemin1, hiza: 'center', gen: ew - 40 });
  // Satırlar
  const ust = 330, alt = Y - 84, n = Math.max(1, satirlar.length), ara = 10;
  const h = Math.min(100, (alt - ust - ara * (n - 1)) / n);
  satirlar.forEach((x, i) => {
    const y = ust + i * (h + ara), orta = y + h / 2;
    yuvarlak(g, 50, y, G - 100, h, 16); g.fillStyle = i < 3 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'; g.fill();
    // Sıra
    g.beginPath(); g.arc(104, orta, 26, 0, Math.PI * 2); g.fillStyle = i < 3 ? MADALYA[i] : 'rgba(255,255,255,0.14)'; g.fill();
    yaz(g, String(i + 1), 104, orta + 1, { font: '34px Anton', renk: i < 3 ? '#111111' : '#ffffff', hiza: 'center' });
    // Logo
    const lg = logolar[i], ls = Math.min(62, h - 16);
    if (lg) {
      g.beginPath(); g.arc(186, orta, ls / 2 + 5, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
      const k = Math.min(ls / lg.width, ls / lg.height);
      g.drawImage(lg, 186 - (lg.width * k) / 2, orta - (lg.height * k) / 2, lg.width * k, lg.height * k);
    }
    yaz(g, buyuk(x.ad), 240, orta - 15, { font: '700 32px Oswald', gen: 600 });
    yaz(g, buyuk(x.alt), 240, orta + 20, { font: '600 20px Montserrat', renk: 'rgba(255,255,255,0.7)', gen: 600 });
    yaz(g, String(x.deger), G - 80, orta + 2, { font: '58px Anton', renk: i === 0 ? L.vurgu : '#ffffff', hiza: 'right' });
  });
  sosyalCiz(g, G / 2, Y - 42, 34);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
