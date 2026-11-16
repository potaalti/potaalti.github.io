// Haftalık Avrupa görseli (yönetici, Avrupa sayfası): "Haftanın Avrupa sonuçları / programı" — seçilen haftanın (Pazartesi–Pazar) programı ya da
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

// maclar: [{ kupa: 'el', kupaKisa: 'EL', tarih, biz, bizLogo, rakip, evde, bizSkor, rakipSkor, durum }]
// Haftanın Avrupa sonuçları / programı: başlık, tarih aralığı ve özet; maçlar gün gün gruplu (gün başlığı bir kez yazılır),
// satır yüksekliği maç ve gün sayısına göre kendiliğinden ayarlanır (13 maçlık hafta da sığar).
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
  const sonuc = tur === 'sonuc';
  logoCiz(g, 92, 92, 56);
  yaz(g, 'HAFTANIN', G / 2, 105, { font: '74px Anton', hiza: 'center' });
  yaz(g, sonuc ? 'AVRUPA SONUÇLARI' : 'AVRUPA PROGRAMI', G / 2, 200, { font: '100px Anton', renk: RENK.vurgu, hiza: 'center', gen: 980 });
  g.font = '700 30px Oswald';
  const ew = g.measureText(aralik).width + 56;
  yuvarlak(g, G / 2 - ew / 2, 262, ew, 52, 26); g.fillStyle = RENK.beyaz; g.fill();
  yaz(g, aralik, G / 2, 289, { font: '700 30px Oswald', renk: RENK.zemin1, hiza: 'center' });
  // Özet: sonuçlarda galibiyet / mağlubiyet, programda maç ve gün sayısı
  const gunAnahtari = m => m.tarih.slice(0, 10);
  const gunler = [...new Set(maclar.map(gunAnahtari))];
  if (sonuc) {
    const gal = maclar.filter(m => m.bizSkor > m.rakipSkor).length, mag = maclar.length - gal;
    const parcalar = [[`${maclar.length} MAÇ`, RENK.soluk], ['  ·  ', RENK.soluk], [`${gal} GALİBİYET`, RENK.yesil], ['  ·  ', RENK.soluk], [`${mag} MAĞLUBİYET`, RENK.kirmizi]];
    g.font = '700 28px Oswald';
    let x = G / 2 - parcalar.reduce((t, [m]) => t + g.measureText(m).width, 0) / 2;
    for (const [m, r] of parcalar) { yaz(g, m, x, 350, { font: '700 28px Oswald', renk: r }); g.font = '700 28px Oswald'; x += g.measureText(m).width; }
  } else {
    yaz(g, `${maclar.length} MAÇ  ·  ${gunler.length} GÜN`, G / 2, 350, { font: '700 28px Oswald', renk: RENK.soluk, hiza: 'center' });
  }
  // Gün gün satırlar: gün başlığı + maçlar; yükseklikler alana göre
  const ust = 392, alt = Y - 88;
  const satirAra = 8, gunAra = 14;
  const sabit = maclar.length * satirAra + gunler.length * gunAra;
  const k = Math.min(1, (alt - ust - sabit) / (maclar.length * 92 + gunler.length * 40));
  const h = 92 * k, gh = 40 * k;
  const kucuk = h < 74;
  const gunFont = `700 ${Math.round(Math.max(22, 27 * k))}px Oswald`;
  let y = ust;
  for (const gn of gunler) {
    const gunMac = maclar.map((m, i) => [m, i]).filter(([m]) => gunAnahtari(m) === gn);
    const gunYazi = buyuk(new Date(gunMac[0][0].tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }));
    yaz(g, gunYazi, 60, y + gh / 2, { font: gunFont, renk: RENK.vurgu });
    g.font = gunFont;
    const cx = 60 + g.measureText(gunYazi).width + 18;
    g.strokeStyle = 'rgba(47,224,234,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, y + gh / 2); g.lineTo(G - 50, y + gh / 2); g.stroke();
    y += gh;
    for (const [m, i] of gunMac) {
      const orta = y + h / 2;
      yuvarlak(g, 50, y, G - 100, h, 16); g.fillStyle = RENK.satir; g.fill();
      // Kupa rozeti
      const rh = Math.min(42, h - 16);
      yuvarlak(g, 68, orta - rh / 2, 80, rh, 9); g.fillStyle = KUPA_RENK[m.kupa] ?? RENK.vurgu; g.fill();
      yaz(g, m.kupaKisa, 108, orta + 1, { font: `700 ${kucuk ? 22 : 25}px Oswald`, hiza: 'center' });
      // Logo
      const lg = logolar[i], ls = Math.min(64, h - 14);
      if (lg) {
        g.save(); g.beginPath(); g.arc(200, orta, ls / 2 + 4, 0, 7); g.fillStyle = '#ffffff'; g.fill(); g.restore();
        const o = Math.min(ls / lg.width, ls / lg.height);
        g.drawImage(lg, 200 - (lg.width * o) / 2, orta - (lg.height * o) / 2, lg.width * o, lg.height * o);
      }
      // Takımlar: temsilcimiz üstte, rakip altta
      const sag = sonuc ? 770 : 860;
      if (h >= 60) {
        yaz(g, buyuk(m.biz), 252, orta - h * 0.19, { font: `700 ${kucuk ? 27 : 31}px Oswald`, gen: sag - 270 });
        yaz(g, `${m.evde ? 'vs' : '@'}  ${BUYUK(m.rakip)}`, 252, orta + h * 0.22, { font: `600 ${kucuk ? 20 : 24}px Montserrat`, renk: RENK.soluk, gen: sag - 270 });
      } else {
        yaz(g, `${buyuk(m.biz)}  ${m.evde ? 'vs' : '@'} ${BUYUK(m.rakip)}`, 252, orta + 1, { font: '700 24px Oswald', gen: sag - 270 });
      }
      // Sağ: sonuçta G/M ve skor, programda saat
      if (sonuc) {
        const kazandi = m.bizSkor > m.rakipSkor;
        const kh = Math.min(54, h - 18);
        yuvarlak(g, sag, orta - kh / 2, 50, kh, 10); g.fillStyle = kazandi ? RENK.yesil : RENK.kirmizi; g.fill();
        yaz(g, kazandi ? 'G' : 'M', sag + 25, orta + 2, { font: `${Math.round(kh * 0.72)}px Anton`, renk: RENK.zemin1, hiza: 'center' });
        yaz(g, `${m.bizSkor} - ${m.rakipSkor}`, G - 76, orta + 2, { font: `${Math.round(Math.min(54, h * 0.62))}px Anton`, hiza: 'right', gen: G - 76 - sag - 70 });
      } else {
        const saat = new Date(m.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        yaz(g, saat, G - 76, orta + 2, { font: `${Math.round(Math.min(54, h * 0.62))}px Anton`, renk: RENK.vurgu, hiza: 'right' });
      }
      y += h + satirAra;
    }
    y += gunAra;
  }
  if (!maclar.length) yaz(g, sonuc ? 'BU HAFTA SONUÇ YOK' : 'BU HAFTA MAÇ YOK', G / 2, 700, { font: '60px Anton', renk: RENK.soluk, hiza: 'center' });
  // Alt bilgi
  sosyalCiz(g, G / 2, Y - 42, 34);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
