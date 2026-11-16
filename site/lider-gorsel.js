// Liderler görseli (yönetici, Liderler sekmesi): bir istatistikte ligin ilk 5 oyuncusu, 1080x1350. Kullanıcının örneğinden
// esinlenildi (2026-11-16, "yaratıcılığına bırakıyorum"): takım renklerinde şeritler, oyuncu fotoğrafı, büyük değer, takım
// logosu. Lider büyük kartta, 2–5 ince şeritlerde. Takım renkleri logodan (en çok kullanılan iki renk) çıkarılır; TAKIM_RENK
// ile elle düzeltilebilir. Dekupe fotoğrafta (TBF'nin formalı fotoğrafları, kullanıcının gönderdikleri) baş kartın üstüne taşar.
import { markaYazilari, logoCiz, logoDaire, sosyalCiz } from './marka.js';
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;600;700&family=Montserrat:wght@500;600;700&display=block';
const G = 1080, Y = 1350;
const LIG = {
  tbl: { ad: 'TÜRKİYE BASKETBOL LİGİ', vurgu: '#2fe0ea', zemin1: '#04161a', zemin2: '#0a4048' },
  bsl: { ad: 'BASKETBOL SÜPER LİGİ', vurgu: '#a46cff', zemin1: '#0b0618', zemin2: '#2a1458' },
};
const MADALYA = ['#f5c542', '#c9d1d9', '#d4874a'];
// Logodan çıkan renk beğenilmezse takım kimliğiyle elle: { 'mersin-spor': ['#1a1a1a', '#f2c200'] } (ana renk, ikinci renk)
const TAKIM_RENK = {
  'fenerbahce-tarfin': ['#0b1e4f', '#ffd200'], 'fenerbahce-gelisim': ['#0b1e4f', '#ffd200'],  // logoda lacivert az, altın renk kahveye dönüyor
  'galatasaray-mct-technic': ['#8e0b1f', '#fdb913'],
};

let yaziHazir;
function yaziTipleri() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['80px Anton', '600 30px Oswald', '700 30px Oswald', '600 26px Montserrat'].map(f => document.fonts.load(f, 'ŞĞÜİÖÇ0123'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}
const resim = url => new Promise(ok => { if (!url) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });
const buyuk = s => String(s ?? '').toLocaleUpperCase('tr');
function yaz(g, metin, x, y, { font, renk = '#ffffff', hiza = 'left', gen = Infinity, golge = false }) {
  g.font = font;
  const sx = Math.min(1, gen / g.measureText(metin).width);
  g.save(); g.translate(x, y); g.scale(sx, 1);
  g.font = font; g.fillStyle = renk; g.textAlign = hiza; g.textBaseline = 'middle';
  if (golge) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 14; g.shadowOffsetY = 4; }
  g.fillText(metin, 0, 0); g.restore();
  return g.measureText(metin).width * sx;
}
function yuvarlak(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- Renkler ----------
const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const karistir = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const parlaklik = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const uzaklik = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const doygunluk = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
// Logodaki renkler (beyaz ve saydam hariç), çoktan aza; [ana, ikinci] (yazı okunsun diye ana renk koyulaştırılır)
function logoRenkleri(img, yedek) {
  if (!img) return [yedek, karistir(yedek, [255, 255, 255], 0.35)];
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 48, 48);
  let d;
  try { d = g.getImageData(0, 0, 48, 48).data; } catch { return [yedek, karistir(yedek, [255, 255, 255], 0.35)]; }
  const kume = new Map();
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] < 200) continue;
    const p = [d[k], d[k + 1], d[k + 2]];
    if (p.every(v => v > 225)) continue;
    const a = p.map(v => Math.round(v / 32)).join(',');
    const e = kume.get(a) ?? { n: 0, t: [0, 0, 0] };
    e.n++; e.t = e.t.map((v, i) => v + p[i]); kume.set(a, e);
  }
  const renkler = [...kume.values()].sort((a, b) => b.n - a.n).map(e => ({ n: e.n, r: e.t.map(v => v / e.n) }));
  if (!renkler.length) return [yedek, karistir(yedek, [255, 255, 255], 0.35)];
  const toplam = renkler.reduce((t, e) => t + e.n, 0);
  // Ana renk: yeterince kullanılmış renklerden en canlısı (gri/siyah tek başına ana renk olabilir)
  const adaylar = renkler.filter(e => e.n >= toplam * 0.12);
  let ana = (adaylar.find(e => doygunluk(e.r) > 0.35) ?? renkler[0]).r;
  // Sarı gibi açık ana renk koyulaşınca bulanıklaşır (zeytin/kahve): logoda koyu bir renk varsa (lacivert, siyah) zemin o olur,
  // açık renk ikinci renge geçer (Ankaragücü, Fenerbahçe, Konya)
  if (parlaklik(ana) > 0.5) {
    const koyu = renkler.find(e => parlaklik(e.r) < 0.3 && e.n >= toplam * 0.06);
    if (koyu) return [koyu.r, ana];
  }
  const ikinci = renkler.find(e => uzaklik(e.r, ana) > 95 && e.n >= toplam * 0.05)?.r ?? karistir(ana, [255, 255, 255], 0.4);
  if (parlaklik(ana) > 0.42) ana = karistir(ana, [0, 0, 0], Math.min(0.6, (parlaklik(ana) - 0.3) * 1.4));
  return [ana, ikinci];
}

// ---------- Kart ----------
// Ad: son kelime soyad (Jr, II gibi ekler soyadla birlikte); önü ad
function adParcala(ad) {
  const k = String(ad).trim().split(/\s+/);
  const ek = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(k.at(-1) ?? '') && k.length > 2 ? 2 : 1;
  return [k.slice(0, -ek).join(' '), k.slice(-ek).join(' ')];
}
function dekupeMi(im) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 20;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, 20, 20);
    const d = g.getImageData(0, 0, 20, 20).data;
    return d[3] < 20 && d[19 * 4 + 3] < 20;
  } catch { return false; }
}

function kart(g, o, i, x, y, w, h, L) {
  const lider = i === 0;
  const [ana, ikinci] = o.renk;
  // Zemin: takım renginde, solda koyu; ince çapraz çizgiler
  g.save();
  yuvarlak(g, x, y, w, h, 22); g.clip();
  const z = g.createLinearGradient(x, 0, x + w, 0);
  z.addColorStop(0, hex(karistir(ana, [0, 0, 0], 0.35))); z.addColorStop(0.75, hex(ana)); z.addColorStop(1, hex(ana));
  g.fillStyle = z; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2;
  for (let k = x - h; k < x + w; k += 22) { g.beginPath(); g.moveTo(k, y + h); g.lineTo(k + h, y); g.stroke(); }
  // Sağda ikinci renkte eğik blok ve logo
  const pw = 170, egim = lider ? 70 : 56;
  g.beginPath(); g.moveTo(x + w - pw, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x + w - pw - egim, y + h); g.closePath();
  g.fillStyle = hex(ikinci); g.fill();
  g.beginPath(); g.moveTo(x + w - pw - 10, y); g.lineTo(x + w - pw, y); g.lineTo(x + w - pw - egim, y + h); g.lineTo(x + w - pw - egim - 10, y + h); g.closePath();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
  g.restore();
  logoDaire(g, o.logoResmi, x + w - pw / 2 - egim / 4, y + h / 2, lider ? 70 : 54);
  // Değer ve birimi (solda)
  const dx = x + (lider ? 148 : 136);
  yaz(g, o.deger, dx, y + h * (lider ? 0.46 : 0.44), { font: `${lider ? 140 : 96}px Anton`, hiza: 'center', gen: lider ? 214 : 180, golge: true });
  yaz(g, o.birim, dx, y + h * (lider ? 0.84 : 0.83), { font: `600 ${lider ? 24 : 19}px Oswald`, renk: 'rgba(255,255,255,0.82)', hiza: 'center' });
  // Sıra rozeti (sol üst)
  const rr = lider ? 26 : 19;
  g.beginPath(); g.arc(x + rr + 12, y + rr + 12, rr, 0, Math.PI * 2); g.fillStyle = i < 3 ? MADALYA[i] : 'rgba(255,255,255,0.22)'; g.fill();
  yaz(g, String(i + 1), x + rr + 12, y + rr + 13, { font: `${lider ? 32 : 24}px Anton`, renk: i < 3 ? '#111111' : '#ffffff', hiza: 'center' });
  // Fotoğraf: değerin sağındaki pencerede; dekupede baş kartın üstüne taşar
  const fx0 = x + (lider ? 262 : 240), fw = lider ? 210 : 190, tasma = lider ? 44 : 30;
  const f = o.fotoResmi;
  if (f) {
    g.save();
    if (o.dekupe) {
      g.beginPath(); g.rect(fx0, y - tasma, fw, h + tasma); g.clip();
      // Hafif ışık
      const isik = g.createRadialGradient(fx0 + fw / 2, y + h * 0.55, 0, fx0 + fw / 2, y + h * 0.55, fw * 0.7);
      isik.addColorStop(0, 'rgba(255,255,255,0.22)'); isik.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = isik; g.fillRect(fx0, y, fw, h);
      // Kaynağın üst kısmı (baştan göğse); alt kenarı kartın altına oturur
      const kesit = 0.46, sh = f.height * kesit, olcek = (h + tasma) / sh, dw = f.width * olcek;
      g.drawImage(f, 0, 0, f.width, sh, fx0 + fw / 2 - dw / 2, y - tasma, dw, h + tasma);
    } else {
      yuvarlak(g, x, y, w, h, 22); g.clip();
      g.beginPath(); g.moveTo(fx0 + 20, y); g.lineTo(fx0 + fw, y); g.lineTo(fx0 + fw - 20, y + h); g.lineTo(fx0, y + h); g.closePath(); g.clip();
      // Vesikalık: pencereyi tam dolduracak kadar büyütülür (yüz fazla yakın olmasın), üstten hizalı
      const olcek = Math.max(fw / f.width, h / f.height), dw = f.width * olcek, dh = f.height * olcek;
      g.drawImage(f, fx0 + fw / 2 - dw / 2, y - (dh - h) * 0.15, dw, dh);
      const golge = g.createLinearGradient(0, y + h * 0.6, 0, y + h);
      golge.addColorStop(0, 'rgba(0,0,0,0)'); golge.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = golge; g.fillRect(fx0, y, fw, h);
    }
    g.restore();
  }
  // Ad, soyad, takım
  const [ad, soyad] = adParcala(o.ad);
  // Yazı genişliği satırın yüksekliğine göre: sağdaki eğik bloğa değmesin
  const ax = fx0 + fw + 22, agen = t => x + w - pw - egim * t - ax - 22;
  yaz(g, buyuk(ad), ax, y + h * 0.235, { font: `600 ${lider ? 34 : 25}px Oswald`, renk: 'rgba(255,255,255,0.86)', gen: agen(0.33) });
  yaz(g, buyuk(soyad), ax, y + h * 0.535, { font: `${lider ? 74 : 50}px Anton`, gen: agen(0.68), golge: true });
  yaz(g, buyuk(o.alt), ax, y + h * 0.81, { font: `600 ${lider ? 21 : 17}px Montserrat`, renk: 'rgba(255,255,255,0.72)', gen: agen(0.9) });
}

// satirlar: [{ ad, alt (takım · maç), deger (yazı), foto, logo }] (sıralı, ilk 5); baslik: 'SAYI LİDERLERİ'; yerli: başına "YERLİ";
// ingilizce: 'POINTS PER GAME'; birim: değerin altındaki yazı ('SAYI / MAÇ'); altBilgi: '2026-27 · 11. HAFTA SONU'
export async function liderGorseli({ lig, baslik, yerli = false, ingilizce, birim, altBilgi, satirlar }) {
  const L = LIG[lig];
  await Promise.all([yaziTipleri(), markaYazilari()]);
  const yedekRenk = [[10, 90, 104], [40, 50, 110]][lig === 'bsl' ? 1 : 0];
  const veri = await Promise.all(satirlar.slice(0, 5).map(async o => {
    const [fotoResmi, logoResmi] = await Promise.all([resim(o.foto), resim(o.logo)]);
    return { ...o, birim, fotoResmi, logoResmi, dekupe: !!fotoResmi && dekupeMi(fotoResmi),
      renk: TAKIM_RENK[o.takimId]?.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))) ?? logoRenkleri(logoResmi, yedekRenk) };
  }));
  const c = document.createElement('canvas'); c.width = G; c.height = Y;
  const g = c.getContext('2d');
  // Zemin (rekor ve Avrupa görselleriyle aynı aile)
  const z = g.createLinearGradient(0, 0, G, Y); z.addColorStop(0, L.zemin2); z.addColorStop(1, L.zemin1);
  g.fillStyle = z; g.fillRect(0, 0, G, Y);
  const isik = g.createRadialGradient(G * 0.88, 70, 0, G * 0.88, 70, 700); isik.addColorStop(0, `${L.vurgu}38`); isik.addColorStop(1, `${L.vurgu}00`);
  g.fillStyle = isik; g.fillRect(0, 0, G, Y);
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
  for (let i = -Y; i < G; i += 46) { g.beginPath(); g.moveTo(i, Y); g.lineTo(i + Y, 0); g.stroke(); }
  // Başlık: lig adı, "YERLİ" (vurgu renginde) + başlık, İngilizce ve sezon bilgisi şeritte
  logoCiz(g, 92, 92, 56);
  const ox = G / 2 + 40;
  yaz(g, L.ad, ox, 62, { font: '700 26px Oswald', renk: L.vurgu, hiza: 'center' });
  const bas = buyuk(baslik), on = yerli ? 'YERLİ ' : '';
  g.font = '96px Anton';
  const tw = g.measureText(on + bas).width, sx = Math.min(1, 800 / tw);
  g.save(); g.translate(ox - (tw * sx) / 2, 150); g.scale(sx, 1);
  if (on) yaz(g, on, 0, 0, { font: '96px Anton', renk: L.vurgu });
  g.font = '96px Anton';
  yaz(g, bas, g.measureText(on).width, 0, { font: '96px Anton' });
  g.restore();
  const serit = [ingilizce, altBilgi].filter(Boolean).join('  ·  ');
  g.font = '700 26px Oswald';
  const ew = Math.min(900, g.measureText(serit).width + 56);
  yuvarlak(g, ox - ew / 2, 210, ew, 50, 25); g.fillStyle = L.vurgu; g.fill();
  yaz(g, serit, ox, 236, { font: '700 26px Oswald', renk: L.zemin1, hiza: 'center', gen: ew - 36 });
  // Kartlar: lider büyük, 2–5 ince
  const x = 50, w = G - 100;
  let y = 300;
  veri.forEach((o, i) => {
    const h = i === 0 ? 250 : 160;
    kart(g, o, i, x, y, w, h, L);
    y += h + 16;
  });
  if (!veri.length) yaz(g, 'VERİ YOK', G / 2, 700, { font: '60px Anton', renk: 'rgba(255,255,255,0.6)', hiza: 'center' });
  sosyalCiz(g, G / 2, Y - 42, 34);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
