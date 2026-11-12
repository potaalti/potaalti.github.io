// Haftalık Avrupa görseli (yönetici, Avrupa sayfası): "Temsilcilerimizin haftası" — o haftanın (Pazartesi–Pazar) programı ya da
// sonuçları, 1080x1350. TBL/BSL görsellerinin aksine kullanıcı şablonu yok: Pota Altı renkleriyle tuvale çizilir.
// Temsilcilerimizin logoları BSL logolarından (data/bsl/logo), rakiplerin yalnızca adı yazılır.
import { markaYazilari, logoCiz, sosyalCiz } from './marka.js';
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;600;700&family=Montserrat:wght@500;600;700&display=block';
const G = 1080, Y = 1350;
const RENK = { zemin1: '#05161b', zemin2: '#0a3940', vurgu: '#2fe0ea', beyaz: '#ffffff', soluk: '#9fc3c7', satir: 'rgba(255,255,255,0.06)', yesil: '#3ddc84', kirmizi: '#ff6b6b' };
const KUPA_RENK = { el: '#ff7a1a', ec: '#00a1e4', bcl: '#2f6bff', fec: '#c9a227' };

let yaziHazir;
function yaziTipleri() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['80px Anton', '40px Oswald', '600 30px Oswald', '700 30px Oswald', '600 26px Montserrat', '700 26px Montserrat']
    .map(f => document.fonts.load(f, 'ŞĞÜİÖÇ0123'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}
const resim = url => new Promise(ok => { if (!url) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
const buyuk = s => String(s ?? '').toLocaleUpperCase('tr');
const BUYUK = s => String(s ?? '').toUpperCase();  // yabancı takım adları (Paris, Lietkabelis): İ olmadan

function sigdir(g, metin, font, gen) {
  g.font = font;
  const w = g.measureText(metin).width;
  return Math.min(1, gen / w);
}
function yaz(g, metin, x, y, { font, renk = RENK.beyaz, hiza = 'left', gen = Infinity }) {
  const sx = sigdir(g, metin, font, gen);
  g.save(); g.translate(x, y); g.scale(sx, 1);
  g.font = font; g.fillStyle = renk; g.textAlign = hiza; g.textBaseline = 'middle';
  g.fillText(metin, 0, 0); g.restore();
}
function yuvarlak(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// maclar: [{ kupa: 'el', kupaKisa: 'EL', tarih, biz, bizLogo, rakip, evde, bizSkor, rakipSkor, durum, yayin }]
// tur: 'program' | 'sonuc'; araliK: '9–15 KASIM'
export async function haftaGorseli({ maclar, tur, aralik }) {
  await Promise.all([yaziTipleri(), markaYazilari()]);
  const logolar = await Promise.all(maclar.map(m => resim(m.bizLogo)));
  const c = document.createElement('canvas'); c.width = G; c.height = Y;
  const g = c.getContext('2d');
  // Zemin: koyu gradyan, çapraz ince çizgiler, köşede turkuaz ışık
  const z = g.createLinearGradient(0, 0, G, Y); z.addColorStop(0, RENK.zemin2); z.addColorStop(1, RENK.zemin1);
  g.fillStyle = z; g.fillRect(0, 0, G, Y);
  const isik = g.createRadialGradient(G * 0.9, 80, 0, G * 0.9, 80, 700); isik.addColorStop(0, 'rgba(47,224,234,0.22)'); isik.addColorStop(1, 'rgba(47,224,234,0)');
  g.fillStyle = isik; g.fillRect(0, 0, G, Y);
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
  for (let i = -Y; i < G; i += 46) { g.beginPath(); g.moveTo(i, Y); g.lineTo(i + Y, 0); g.stroke(); }
  // Başlık
  logoCiz(g, 92, 92, 56);
  yaz(g, 'TEMSİLCİLERİMİZİN', G / 2, 150, { font: '92px Anton', hiza: 'center', gen: 980 });
  yaz(g, 'HAFTASI', G / 2, 250, { font: '92px Anton', renk: RENK.vurgu, hiza: 'center' });
  const etiket = `${aralik} · ${tur === 'sonuc' ? 'SONUÇLAR' : 'PROGRAM'}`;
  g.font = '700 30px Oswald';
  const ew = g.measureText(etiket).width + 56;
  yuvarlak(g, G / 2 - ew / 2, 312, ew, 54, 27); g.fillStyle = RENK.beyaz; g.fill();
  yaz(g, etiket, G / 2, 340, { font: '700 30px Oswald', renk: RENK.zemin1, hiza: 'center' });
  // Satırlar
  const ust = 390, alt = Y - 80, n = Math.max(1, maclar.length);
  const ara = 10, h = Math.min(104, (alt - ust - ara * (n - 1)) / n);
  const kucuk = h < 80;  // çok maçlı haftada satırlar alçalır: yazılar küçülür
  maclar.forEach((m, i) => {
    const y = ust + i * (h + ara), orta = y + h / 2;
    yuvarlak(g, 50, y, G - 100, h, 18); g.fillStyle = RENK.satir; g.fill();
    // Kupa rozeti
    yuvarlak(g, 70, orta - 22, 86, 44, 10); g.fillStyle = KUPA_RENK[m.kupa] ?? RENK.vurgu; g.fill();
    yaz(g, m.kupaKisa, 113, orta + 1, { font: '700 26px Oswald', hiza: 'center' });
    // Logo
    const lg = logolar[i], ls = Math.min(68, h - 18);
    if (lg) {
      g.save(); g.beginPath(); g.arc(214, orta, ls / 2 + 4, 0, 7); g.fillStyle = '#ffffff'; g.fill(); g.restore();
      const k = Math.min(ls / lg.width, ls / lg.height);
      g.drawImage(lg, 214 - (lg.width * k) / 2, orta - (lg.height * k) / 2, lg.width * k, lg.height * k);
    }
    // Takımlar
    const sag = 760;
    yaz(g, buyuk(m.biz), 270, orta - (kucuk ? 14 : 17), { font: `700 ${kucuk ? 29 : 32}px Oswald`, gen: sag - 290 });
    yaz(g, `${m.evde ? 'vs' : '@'}  ${BUYUK(m.rakip)}`, 270, orta + (kucuk ? 17 : 21), { font: `600 ${kucuk ? 22 : 25}px Montserrat`, renk: RENK.soluk, gen: sag - 290 });
    // Sağ: skor ya da gün/saat
    const gun = new Date(m.tarih).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const saat = new Date(m.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (tur === 'sonuc' && m.durum === 'bitti') {
      const kazandi = m.bizSkor > m.rakipSkor;
      const kh = kucuk ? 46 : 60;
      yuvarlak(g, sag - 20, orta - kh / 2, 52, kh, 10); g.fillStyle = kazandi ? RENK.yesil : RENK.kirmizi; g.fill();
      yaz(g, kazandi ? 'G' : 'M', sag + 6, orta + 2, { font: `${kucuk ? 32 : 40}px Anton`, renk: RENK.zemin1, hiza: 'center' });
      yaz(g, `${m.bizSkor} - ${m.rakipSkor}`, G - 80, orta - (kucuk ? 9 : 10), { font: `${kucuk ? 42 : 52}px Anton`, hiza: 'right', gen: G - 80 - sag - 50 });
      yaz(g, buyuk(gun), G - 80, orta + (kucuk ? 22 : 30), { font: `600 ${kucuk ? 16 : 19}px Montserrat`, renk: RENK.soluk, hiza: 'right' });
    } else {
      yaz(g, saat, G - 80, orta - (kucuk ? 9 : 12), { font: `${kucuk ? 42 : 52}px Anton`, renk: RENK.vurgu, hiza: 'right' });
      yaz(g, buyuk([gun, m.yayin].filter(Boolean).join(' · ')), G - 80, orta + (kucuk ? 22 : 30), { font: `600 ${kucuk ? 15 : 19}px Montserrat`, renk: RENK.soluk, hiza: 'right', gen: G - 80 - sag + 20 });
    }
  });
  if (!maclar.length) yaz(g, 'BU HAFTA MAÇ YOK', G / 2, 700, { font: '60px Anton', renk: RENK.soluk, hiza: 'center' });
  // Alt bilgi
  sosyalCiz(g, G / 2, Y - 42, 34);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
