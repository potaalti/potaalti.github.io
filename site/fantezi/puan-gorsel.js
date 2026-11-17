// Fantezi puan durumu görseli (yönetici, Haftalık ve Genel sayfalarındaki 📤 / ⬇): 1080 genişlik, en az 1350 yükseklik (takım
// çoksa uzar). Kullanıcı 2026-11-17 "çok şık bir tasarım" istedi: koyu zemin, ilk üç kürsüde (1. ortada, yüksek), kalanlar ince
// satırlarda. Genelde haftalık puan çubukları ve geçen haftaya göre sıra değişimi; haftalıkta her takımın haftanın yıldızı (en
// yüksek VP'li sayılan oyuncusu, fotoğrafsız). Toplam VP yalnız puanı eşit takımlarda yazılır (eşitliği o bozar; kullanıcı
// 2026-11-17: toplam VP kafa karıştırıyor). Renkler ligin (TBL turkuaz, BSL mor), ilk üç altın / gümüş / bronz.
import { markaYazilari, logoCiz, sosyalCiz } from '../marka.js';
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;600;700&family=Montserrat:wght@500;600;700&display=block';
const G = 1080, YMIN = 1350;
const LIG = {
  tbl: { ad: 'TBL FANTEZİ LİGİ', vurgu: '#2fe0ea', zemin1: '#03161a', zemin2: '#0a4048' },
  bsl: { ad: 'BSL FANTEZİ LİGİ', vurgu: '#a46cff', zemin1: '#0b0618', zemin2: '#2a1458' },
};
const MADALYA = [['#ffd75e', '#c99512'], ['#e9eef3', '#9aa5b1'], ['#f0a66a', '#a55a24']];
const YESIL = '#3ddc84', KIRMIZI = '#ff6b6b', SOLUK = 'rgba(255,255,255,0.62)';

let yaziHazir;
function yaziTipleri() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['80px Anton', '600 30px Oswald', '700 30px Oswald', '500 26px Montserrat', '600 26px Montserrat', '700 26px Montserrat']
    .map(f => document.fonts.load(f, 'ŞĞÜİÖÇ0123'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}
const buyuk = s => String(s ?? '').toLocaleUpperCase('tr');
function yaz(g, metin, x, y, { font, renk = '#ffffff', hiza = 'left', gen = Infinity, golge = false }) {
  metin = String(metin);
  g.font = font;
  const sx = Math.min(1, gen / g.measureText(metin).width);
  g.save(); g.translate(x, y); g.scale(sx, 1);
  g.font = font; g.fillStyle = renk; g.textAlign = hiza; g.textBaseline = 'middle';
  if (golge) { g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 16; g.shadowOffsetY = 4; }
  g.fillText(metin, 0, 0); g.restore();
  return g.measureText(metin).width * sx;
}
function yuvarlak(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const degrade = (g, x0, y0, x1, y1, renkler) => {
  const d = g.createLinearGradient(x0, y0, x1, y1);
  renkler.forEach((r, i) => d.addColorStop(i / (renkler.length - 1), r));
  return d;
};
// "Kruize Pinkins" -> "K. PINKINS" (dar yerler için)
function kisaAd(ad) {
  const k = String(ad ?? '').trim().split(/\s+/);
  if (k.length < 2) return buyuk(ad);
  const ek = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(k.at(-1)) && k.length > 2 ? 2 : 1;
  return buyuk(`${k[0][0]}. ${k.slice(-ek).join(' ')}`);
}
const sayi = v => (Math.round(Number(v) * 10) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

// tur: 'genel' | 'hafta'; baslik: 'GENEL KLASMAN' / '11. HAFTA'; serit: başlık altındaki yazı (boşsa şerit yok, her şey yukarı kayar);
// satirlar (sıralı): [{ sira, ad, menajer, puan, vp, degisim (genel, + yukarı), haftalar: [puan…] (genel),
//   esitlik: puanı başka takımla eşit (genel, VP yazılır), kazandi: hafta puanı (hafta), yildiz: { ad, vp } (hafta) }]; enCokPuan: haftalık en yüksek lig puanı (çubuk ölçeği)
export async function puanGorseli({ lig = 'tbl', tur, baslik, serit, satirlar, enCokPuan = 5, notlar = '' }) {
  const L = LIG[lig] ?? LIG.tbl;
  const genel = tur === 'genel';
  await Promise.all([yaziTipleri(), markaYazilari()]);
  const kursu = satirlar.slice(0, 3);
  const kalan = satirlar.slice(3);
  // Yükseklik: kalan satırlar en az 46 px; sığmazsa görsel uzar
  // 17 takımlık lig 1080x1350'ye (Instagram 4:5) sığar
  const kay = serit ? 0 : -40;
  const ust = 616 + kay, alt = notlar ? 108 : 84;
  const satirH = Math.max(40, Math.min(62, (YMIN - ust - alt - 46) / Math.max(1, kalan.length)));
  const Y = Math.max(YMIN, Math.ceil(ust + 46 + kalan.length * satirH + alt));
  const c = document.createElement('canvas'); c.width = G; c.height = Y;
  const g = c.getContext('2d');

  // ---- Zemin: koyu degrade, üstte lig renginde ışık, çapraz ince çizgiler, altta hafif ızgara parıltısı
  g.fillStyle = degrade(g, 0, 0, G * 0.4, Y, [L.zemin2, L.zemin1, L.zemin1]); g.fillRect(0, 0, G, Y);
  let isik = g.createRadialGradient(G * 0.5, 430, 0, G * 0.5, 430, 620);
  isik.addColorStop(0, `${L.vurgu}30`); isik.addColorStop(1, `${L.vurgu}00`);
  g.fillStyle = isik; g.fillRect(0, 0, G, Y);
  isik = g.createRadialGradient(G * 0.5, 330, 0, G * 0.5, 330, 300);
  isik.addColorStop(0, 'rgba(255,215,94,0.16)'); isik.addColorStop(1, 'rgba(255,215,94,0)');
  g.fillStyle = isik; g.fillRect(0, 0, G, Y);
  g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 2;
  for (let i = -Y; i < G; i += 46) { g.beginPath(); g.moveTo(i, Y); g.lineTo(i + Y, 0); g.stroke(); }

  // ---- Başlık
  logoCiz(g, 92, 92, 56);
  const ox = G / 2 + 40;
  yaz(g, L.ad, ox, 56, { font: '700 26px Oswald', renk: L.vurgu, hiza: 'center' });
  yaz(g, buyuk(baslik), ox, 134, { font: '100px Anton', hiza: 'center', gen: 800, golge: true });
  if (serit) {
    g.font = '700 25px Oswald';
    const ew = Math.min(820, g.measureText(serit).width + 60);
    yuvarlak(g, ox - ew / 2, 196, ew, 46, 23); g.fillStyle = L.vurgu; g.fill();
    yaz(g, serit, ox, 220, { font: '700 25px Oswald', renk: L.zemin1, hiza: 'center', gen: ew - 40 });
  }

  // ---- Kürsü: 2 · 1 · 3
  const kw = 318, kx = [G / 2 - kw * 1.5 - 16, G / 2 - kw / 2, G / 2 + kw / 2 + 16];
  const kTaban = 598 + kay, kUst = [320, 286, 342].map(v => v + kay);
  [1, 0, 2].forEach(i => {
    const s = kursu[i];
    if (!s) return;
    const yer = [1, 0, 2].indexOf(i), x = kx[yer], y = kUst[yer], h = kTaban - y;  // yer: soldan 2 · 1 · 3, en yüksek ortadaki 1.
    const [acik, koyu] = MADALYA[i];
    // Kart: cam efekti, üstte madalya renginde şerit
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 30; g.shadowOffsetY = 12;
    yuvarlak(g, x, y, kw, h, 26); g.fillStyle = degrade(g, x, y, x, y + h, ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.04)']); g.fill();
    g.restore();
    g.save(); yuvarlak(g, x, y, kw, h, 26); g.clip();
    g.fillStyle = degrade(g, x, y, x + kw, y, [koyu, acik, koyu]); g.fillRect(x, y, kw, 7);
    const parilti = g.createRadialGradient(x + kw / 2, y, 0, x + kw / 2, y, kw * 0.75);
    parilti.addColorStop(0, `${acik}33`); parilti.addColorStop(1, `${acik}00`);
    g.fillStyle = parilti; g.fillRect(x, y, kw, h);
    g.restore();
    g.save(); yuvarlak(g, x + 1, y + 1, kw - 2, h - 2, 25); g.lineWidth = 2; g.strokeStyle = `${acik}55`; g.stroke(); g.restore();
    // Sıra madalyası (kartın üst kenarına oturur)
    const mr = i === 0 ? 34 : 28, my = y;
    g.beginPath(); g.arc(x + kw / 2, my, mr + 5, 0, Math.PI * 2); g.fillStyle = L.zemin1; g.fill();
    g.beginPath(); g.arc(x + kw / 2, my, mr, 0, Math.PI * 2); g.fillStyle = degrade(g, 0, my - mr, 0, my + mr, [acik, koyu]); g.fill();
    yaz(g, String(s.sira), x + kw / 2, my + 2, { font: `${i === 0 ? 40 : 33}px Anton`, renk: '#1a1206', hiza: 'center' });
    // Takım ve menajer (üstte)
    const cx = x + kw / 2;
    let yy = y + mr + 30;
    yaz(g, buyuk(s.ad), cx, yy, { font: `${i === 0 ? 42 : 36}px Anton`, hiza: 'center', gen: kw - 36, golge: true });
    yy += 22;
    if (s.menajer) { yaz(g, s.menajer, cx, yy + 8, { font: '500 19px Montserrat', renk: SOLUK, hiza: 'center', gen: kw - 40 }); yy += 26; }
    // Alt kısım: genelde toplam VP + haftalık puan çubukları, haftalıkta haftanın yıldızı
    let altUst;
    if (genel) {
      cubuklar(g, s.haftalar ?? [], cx - 95, kTaban - 22, 190, 22, enCokPuan, acik);
      if (s.esitlik) yaz(g, `EŞİTLİK ${sayi(s.vp)} VP`, cx, kTaban - 58, { font: '600 19px Oswald', renk: 'rgba(255,255,255,0.7)', hiza: 'center' });
      altUst = kTaban - (s.esitlik ? 76 : 44);
    } else {
      const ay = kTaban - 42;
      if (s.yildiz) {
        g.save(); yuvarlak(g, x + 16, ay - 27, kw - 32, 54, 27); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); g.restore();
        yaz(g, `★ ${kisaAd(s.yildiz.ad)}`, x + 36, ay + 1, { font: '600 20px Oswald', gen: kw - 36 - 70 });
        yaz(g, sayi(s.yildiz.vp), x + kw - 30, ay + 1, { font: '25px Anton', renk: acik, hiza: 'right' });
      }
      altUst = ay - 36;
    }
    // Değer (genelde puan, haftalıkta VP): üst ve alt kısım arasındaki alana sığacak büyüklükte
    const alan = altUst - yy, boy = Math.min(i === 0 ? 94 : 84, alan * 0.9);
    const dy = yy + alan / 2 + 2;
    const dw = yaz(g, genel ? String(s.puan) : sayi(s.vp), cx - 12, dy, { font: `${Math.round(boy)}px Anton`, renk: acik, hiza: 'center', golge: true });
    yaz(g, genel ? 'PUAN' : 'VP', cx - 12 + dw / 2 + 6, dy + boy * 0.3, { font: '700 20px Oswald', renk: acik });
  });

  // ---- Kalan takımlar
  const x = 50, w = G - 100;
  const sut = genel
    ? { cubuk: [630, 180], vp: 905, puan: w + x - 24 }
    : { yildiz: [590, 230], vp: 905, puan: w + x - 24 };
  let y = ust + 10;
  // Sütun başlıkları
  const bas = (m, xx, hiza = 'right') => yaz(g, m, xx, y + 14, { font: '600 17px Oswald', renk: 'rgba(255,255,255,0.45)', hiza });
  bas('TAKIM', x + 92, 'left');
  if (genel) bas('HAFTALIK PUANLAR', sut.cubuk[0], 'left'); else bas('HAFTANIN YILDIZI', sut.yildiz[0], 'left');
  if (!genel) bas('VP', sut.vp);
  bas('PUAN', sut.puan);
  y += 36;
  kalan.forEach((s, k) => {
    const orta = y + satirH / 2;
    g.save(); yuvarlak(g, x, y + 3, w, satirH - 6, 14);
    g.fillStyle = k % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.085)'; g.fill(); g.restore();
    // Sıra ve değişim
    yaz(g, String(s.sira), x + 34, orta + 1, { font: `${Math.round(satirH * 0.56)}px Anton`, hiza: 'center' });
    if (genel && s.degisim) {
      const yukari = s.degisim > 0;
      yaz(g, `${yukari ? '▲' : '▼'}${Math.abs(s.degisim)}`, x + 66, orta + 1, { font: '700 15px Montserrat', renk: yukari ? YESIL : KIRMIZI, hiza: 'center' });
    }
    // Takım + menajer
    const adSag = (genel ? sut.cubuk[0] : sut.yildiz[0]) - 24;
    const aw = yaz(g, buyuk(s.ad), x + 92, orta + 1, { font: `700 ${Math.round(satirH * 0.5)}px Oswald`, gen: adSag - x - 92 });
    if (s.menajer && x + 92 + aw + 14 < adSag - 40) {
      yaz(g, s.menajer, x + 92 + aw + 14, orta + 2, { font: '500 17px Montserrat', renk: 'rgba(255,255,255,0.5)', gen: adSag - (x + 92 + aw + 14) });
    }
    if (genel) {
      cubuklar(g, s.haftalar ?? [], sut.cubuk[0], orta + satirH * 0.26, sut.cubuk[1], satirH * 0.5, enCokPuan, L.vurgu);
    } else if (s.yildiz) {
      const yw = yaz(g, kisaAd(s.yildiz.ad), sut.yildiz[0], orta + 1, { font: '600 19px Oswald', renk: 'rgba(255,255,255,0.8)', gen: sut.yildiz[1] - 50 });
      yaz(g, sayi(s.yildiz.vp), sut.yildiz[0] + yw + 10, orta + 1, { font: '600 19px Oswald', renk: L.vurgu });
    }
    if (!genel) yaz(g, sayi(s.vp), sut.vp, orta + 1, { font: `600 ${Math.round(satirH * 0.46)}px Oswald`, renk: 'rgba(255,255,255,0.78)', hiza: 'right' });
    else if (s.esitlik) yaz(g, `${sayi(s.vp)} VP`, sut.vp, orta + 1, { font: '500 17px Montserrat', renk: 'rgba(255,255,255,0.5)', hiza: 'right' });
    const pz = genel ? String(s.puan) : `+${s.kazandi}`;
    yaz(g, pz, sut.puan, orta + 2, { font: `${Math.round(satirH * 0.62)}px Anton`, renk: genel ? '#ffffff' : L.vurgu, hiza: 'right' });
    y += satirH;
  });

  // ---- Alt bilgi
  if (notlar) yaz(g, notlar, G / 2, Y - 84, { font: '500 17px Montserrat', renk: 'rgba(255,255,255,0.5)', hiza: 'center', gen: G - 120 });
  sosyalCiz(g, G / 2, Y - 38, 32);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}

// Haftalık lig puanları: her hafta bir çubuk (yükseklik puana göre), son hafta parlak
function cubuklar(g, puanlar, x, tabanY, gen, yuk, enCok, renk) {
  if (!puanlar.length) return;
  const ara = 4, bw = Math.min(16, (gen - ara * (puanlar.length - 1)) / puanlar.length);
  puanlar.forEach((p, i) => {
    const h = Math.max(3, (p / enCok) * yuk);
    g.globalAlpha = i === puanlar.length - 1 ? 1 : 0.55;
    yuvarlak(g, x + i * (bw + ara), tabanY - h, bw, h, Math.min(3, bw / 2)); g.fillStyle = renk; g.fill();
  });
  g.globalAlpha = 1;
}
