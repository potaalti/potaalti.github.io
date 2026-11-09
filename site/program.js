// Haftanın programı görseli (TBL ve BSL, 1280x1600 PNG): kullanıcının örneklerinden çıkarılan şablonlar (program/sablon/<lig>.webp,
// veri/program_sablon.mjs) üzerine hafta numarası, tarih aralığı, gün gün maçlar (logo, saat, yayın kanalı) ve TBL'de BAY takımı
// çizilir. Maç paneli her hafta yeniden çizilir (gün ve maç sayısı değişir); panelin renkleri şablonun <lig>.json'ındaki
// ölçümlerden. Logolar TBF'nin logoları (sitedeki kopyaları: data/<lig>/logo/), beyaz zeminleri silinip kırpılır.
import { kirpikLogo } from './odul.js';

// Yazı tipleri kullanıcının örneklerine göre: saat ve takım adları Roboto Bold, gün başlıkları Oswald, hafta numarası Anton
// ("HAFTANIN"ın dokusuyla boyanır), BSL tarihi Russo One, BSL üst satırı Montserrat
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;600;700&family=Roboto:wght@700&family=Montserrat:wght@500&family=Russo+One&display=block';
const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const GUNLER = ['PAZAR', 'PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ'];
// Görselde yazılan kısa adlar (kullanıcının örneklerindeki gibi); \n: iki satır
const KISA = {
  'KONYA BÜYÜKŞEHİR BELEDİYESİ SPOR': 'KONYA BBSK', 'MERSİN SPOR': 'MERSİNSPOR', 'YALOVA HAREM SPOR': 'YALOVA HAREMSPOR',
  'BALIKESİR BÜYÜKŞEHİR BELEDİYE SPOR': 'BALIKESİR BŞB', 'KİPAŞ K.B.B.': 'KAHRAMANMARAŞ BŞB\nKİPAŞ İSTİKLAL BASKETBOL',
  'KEÇİÖREN BELEDİYESİ BAĞLUM': 'KEÇİÖREN BELEDİYESİ\nBAĞLUM', 'BÜYÜKÇEKMECE BASKETBOL': 'BÜYÜKÇEKMECE\nBASKETBOL',
  'PİZZABULLS BORDO BANDIRMA': 'PIZZABULLS\nBORDO BANDIRMA', 'GALATASARAY MCT TECHNIC': 'GALATASARAY\nMCT TECHNIC',
  'ALİAĞA PETKİM SPOR': 'ALİAĞA PETKİMSPOR', 'GLİNT ÇAYIROVA BELEDİYESİ': 'GLİNT\nÇAYIROVA BELEDİYESİ',
};

const onbellek = new Map();
const resim = url => {
  if (!url) return Promise.resolve(null);
  if (!onbellek.has(url)) onbellek.set(url, new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; }));
  return onbellek.get(url);
};
const sablonAdresi = ad => new URL(`program/sablon/${ad}`, document.baseURI).href;
let sablonVerisi = {};
const sablonJson = lig => (sablonVerisi[lig] ??= fetch(sablonAdresi(`${lig}.json`)).then(r => r.json()));
let yaziHazir;
function yaziTipleri() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['100px Anton', '400 40px Oswald', '600 40px Oswald', '700 40px Oswald', '700 40px Roboto', '500 40px Montserrat', '40px "Russo One"']
    .map(f => document.fonts.load(f, 'HAFTANIN İŞĞÜÇÖ 0123:'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}

// "2026-10-31T14:00:00" (Türkiye saati) -> parçalar
const parcala = s => { const [t, sa] = String(s).split('T'); const [y, a, g] = t.split('-').map(Number); return { y, a, g, saat: (sa ?? '').slice(0, 5), gun: new Date(Date.UTC(y, a - 1, g)).getUTCDay() }; };
const gunAnahtari = s => String(s).slice(0, 10);
// Tarih aralığı: TBL "31 EKİM - 1 KASIM 2026", BSL "31 EKİM-2 KASIM 2026"; aynı ayda "14-15 KASIM 2026"
function aralik(gunler, lig) {
  const a = parcala(gunler[0]), b = parcala(gunler.at(-1)), ayrac = lig === 'tbl' ? ' - ' : '-';
  if (gunler.length === 1) return `${a.g} ${AYLAR[a.a - 1]} ${a.y}`;
  return a.a === b.a ? `${a.g}${ayrac}${b.g} ${AYLAR[a.a - 1]} ${b.y}` : `${a.g} ${AYLAR[a.a - 1]}${ayrac}${b.g} ${AYLAR[b.a - 1]} ${b.y}`;
}
const kanal = yayin => { const y = String(yayin ?? '').toLowerCase(); return /youtube|tbf/.test(y) ? 'youtube' : /\bht\b|ht spor/.test(y) ? 'ht' : null; };

// Takım adı: kısa ad ya da iki satıra bölünmüş ad; sığmazsa yazı küçülür
function adSatirlari(g, ad, enGenis, boy) {
  const metin = KISA[ad] ?? ad;
  let satirlar = metin.split('\n');
  g.font = `700 ${boy}px Roboto`;
  if (satirlar.length === 1 && g.measureText(metin).width > enGenis) {
    const k = metin.split(' ');
    let enIyi = null;
    for (let i = 1; i < k.length; i++) {
      const s = [k.slice(0, i).join(' '), k.slice(i).join(' ')];
      const w = Math.max(...s.map(x => g.measureText(x).width));
      if (!enIyi || w < enIyi.w) enIyi = { s, w };
    }
    if (enIyi) satirlar = enIyi.s;
  }
  const genislik = (s, b) => { g.font = `700 ${b}px Roboto`; return Math.max(...s.map(x => g.measureText(x).width)); };
  // Tek satır, yazı biraz küçülerek sığıyorsa bölünmez (örneklerdeki gibi); sığmazsa iki satır
  if (satirlar.length > 1 && !metin.includes(String.fromCharCode(10))) {
    let b1 = boy;
    while (b1 > boy - 5 && genislik([metin], b1) > enGenis) b1--;
    if (genislik([metin], b1) <= enGenis) return { satirlar: [metin], boy: b1 };
  }
  let b = boy;
  while (b > 16 && genislik(satirlar, b) > enGenis) b--;
  return { satirlar, boy: b };
}
function adYaz(g, ad, x, y, hiza, enGenis, boy = 25) {
  const { satirlar, boy: b } = adSatirlari(g, ad, enGenis, boy);
  g.save();
  g.font = `700 ${b}px Roboto`; g.fillStyle = '#fff'; g.textAlign = hiza; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
  const ara = b * 1.12;
  satirlar.forEach((s, i) => g.fillText(s, x, y + (i - (satirlar.length - 1) / 2) * ara + 1));
  g.restore();
}
const yuvarlak = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
// Logo halkası: camgöbeği halka (parlamalı), beyaz iç, ortada logo
async function logoHalkasi(g, x, y, r, logoUrl) {
  g.save();
  g.shadowColor = 'rgba(64,214,245,.85)'; g.shadowBlur = 16;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#3fd3f2'; g.fill();
  g.restore();
  g.beginPath(); g.arc(x, y, r - 7, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  const l = logoUrl ? await kirpikLogo(logoUrl) : null;
  if (l) {
    const kutu = (r - 13) * 2 * 0.92, o = Math.min(kutu / l.width, kutu / l.height);
    g.drawImage(l, x - l.width * o / 2, y - l.height * o / 2, l.width * o, l.height * o);
  }
}
// Hafta numarası: "HAFTANIN" yazısının solunda, aynı yükseklikte (Anton, örnekteki rakamlar kadar geniş). İçi "H" harfinin sapından
// (kok: sütunlar) alınan dokuyla boyanır, böylece "HAFTANIN" ile aynı beyazdan griye geçişi ve pürüzü taşır; "PROGRAMI"nın
// renkli pikselleri (pUst'ten aşağısı) önde kalır, örnekteki gibi
function numaraYaz(g, z, hafta, { sag, ust, alt, kok: [k0, k1], pUst }) {
  const metin = `${hafta}.`;
  g.font = '100px Anton';
  const boy = 100 * (alt - ust) / g.measureText(metin).actualBoundingBoxAscent;
  const c = document.createElement('canvas'); c.width = 1280; c.height = 400;
  const h = c.getContext('2d');
  h.font = `${boy}px Anton`;
  const w = h.measureText(metin).width, sx = Math.min(1.12, (sag - 26) / w), sol = sag - w * sx;
  h.save(); h.translate(sag, alt); h.scale(sx, 1); h.textAlign = 'right'; h.fillStyle = '#fff'; h.fillText(metin, 0, 0); h.restore();
  h.globalCompositeOperation = 'source-in';
  h.drawImage(z, k0, ust - 6, k1 - k0, alt - ust + 12, sol, ust - 6, sag - sol, alt - ust + 12);
  // P önde
  const y0 = pUst, y1 = Math.min(400, alt + 12), x0 = Math.max(0, Math.floor(sol) - 4), x1 = Math.ceil(sag) + 4;
  if (y1 > y0) {
    const t = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, n = h.getImageData(x0, y0, x1 - x0, y1 - y0);
    for (let k = 0; k < t.length / 4; k++) {
      const r = t[k * 4], gg = t[k * 4 + 1], b = t[k * 4 + 2], mx = Math.max(r, gg, b), L = 0.299 * r + 0.587 * gg + 0.114 * b;
      if (L > 120 && (mx - Math.min(r, gg, b)) / mx >= 0.25 && (r > 130 || gg > 150)) n.data[k * 4 + 3] = 0;
    }
    h.globalCompositeOperation = 'source-over';
    h.putImageData(n, x0, y0);
  }
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 12; g.shadowOffsetY = 4; g.drawImage(c, 0, 0); g.restore();
}
// BSL: en üstteki iki satır (örnekte görselin üstünden kesikti): tam görünecek yerde, aralıklı harflerle
function bslUstYazi(g) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,.92)'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = '500 25px Montserrat';
  // Harf aralığı iki satırda aynı (örnekteki gibi): alt satır 465 piksel genişliğe göre
  const alt = 'BASKETBOL SÜPER LİGİ', ara = Math.max(0, (465 - g.measureText(alt).width) / (alt.length - 1));
  g.letterSpacing = `${ara}px`;
  g.fillText('TÜRKİYE SİGORTA', 86, 19);
  g.fillText(alt, 86, 49);
  g.restore();
}

// Paneli şablondaki renklerle boyar: her satırda soldan sağa renk geçişi (sol/sag: satır satır [r,g,b])
function panelBoya(g, [x, y, w, h], r, sol, sag) {
  g.save();
  yuvarlak(g, x, y, w, h, r); g.clip();
  for (let j = 0; j < h; j++) {
    const k = Math.min(sol.length - 1, Math.round(j * (sol.length - 1) / Math.max(1, h - 1)));
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, `rgb(${sol[k].join(',')})`); gr.addColorStop(1, `rgb(${sag[k].join(',')})`);
    g.fillStyle = gr; g.fillRect(x, y + j, w, 1);
  }
  g.restore();
}

// Gün gün maçlar: [{ gun: '2026-10-31', baslik: ['31 EKİM', 'CUMARTESİ'], maclar: [...] }]
function gunlereBol(maclar) {
  const gunler = new Map();
  for (const m of [...maclar].sort((a, b) => String(a.tarih).localeCompare(String(b.tarih)))) {
    const k = gunAnahtari(m.tarih);
    if (!gunler.has(k)) { const p = parcala(m.tarih); gunler.set(k, { gun: k, baslik: [`${p.g} ${AYLAR[p.a - 1]}`, GUNLER[p.gun]], maclar: [] }); }
    gunler.get(k).maclar.push(m);
  }
  return [...gunler.values()];
}

// ---------- TBL ----------
async function tblCiz(g, S, { hafta, gunler, bay, logo }) {
  const [px, py, pw, ph] = S.panel;
  panelBoya(g, S.panel, 22, S.panelSol, S.panelSag);
  const yt = await resim(sablonAdresi('youtube-tbf.png')), ht = await resim(sablonAdresi('ht-spor.png'));
  const n = gunler.reduce((t, d) => t + d.maclar.length, 0);
  const bayH = bay.length ? 92 : 0;
  // Satır aralığı: panel dolsun, ama 100'ü geçmesin (örnekteki gibi); sığmazsa önce gün başlıkları, sonra satırlar sıkışır
  const ic = ph - 30 - bayH;
  const gunH = gunler.length * 78 + n * 100 > ic ? 66 : 78;
  const aralikY = Math.max(76, Math.min(100, (ic - gunler.length * gunH) / Math.max(1, n)));
  const toplam = gunler.length * gunH + n * aralikY;
  let y = py + 12 + Math.max(0, (ic - toplam) / 2);
  const barH = Math.min(76, aralikY - 22);
  for (const d of gunler) {
    // Gün başlığı: "31 EKİM" kalın + "CUMARTESİ" ince, iki yanında çizgi
    const yc = y + gunH / 2 + 4;
    g.save();
    g.textBaseline = 'middle'; g.fillStyle = '#16212b';
    g.font = '700 60px Oswald'; const w1 = g.measureText(`${d.baslik[0]} `).width;
    g.font = '400 60px Oswald'; const w2 = g.measureText(d.baslik[1]).width;
    const x0 = 640 - (w1 + w2) / 2;
    g.font = '700 60px Oswald'; g.textAlign = 'left'; g.fillText(`${d.baslik[0]} `, x0, yc);
    g.font = '400 60px Oswald'; g.fillText(d.baslik[1], x0 + w1, yc);
    g.strokeStyle = 'rgba(40,52,64,.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px + 30, yc + 6); g.lineTo(x0 - 28, yc + 6); g.moveTo(x0 + w1 + w2 + 28, yc + 6); g.lineTo(px + pw - 30, yc + 6); g.stroke();
    g.restore();
    y += gunH;
    for (const m of d.maclar) {
      const yc2 = y + aralikY / 2;
      for (const [x0b, w] of [[112, 448], [720, 446]]) {
        g.save();
        g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
        const gr = g.createLinearGradient(0, yc2 - barH / 2, 0, yc2 + barH / 2);
        gr.addColorStop(0, '#1b364a'); gr.addColorStop(1, '#0b1c29');
        yuvarlak(g, x0b, yc2 - barH / 2, w, barH, 16); g.fillStyle = gr; g.fill();
        g.restore();
      }
      adYaz(g, m.ev, 456, yc2, 'right', 318);
      adYaz(g, m.dep, 824, yc2, 'left', 318);
      await logoHalkasi(g, 512, yc2, 44, logo(m.ev));
      await logoHalkasi(g, 768, yc2, 44, logo(m.dep));
      // Saat ve altında yayın simgesi, satır yüksekliğine göre ölçeklenip satırın ortasına
      const k = kanal(m.yayin), simge = k === 'youtube' ? yt : k === 'ht' ? ht : null;
      const yazi = Math.min(44, aralikY * 0.46), yaziH = yazi * 0.74;
      const sh = !simge ? 0 : k === 'ht' ? Math.min(46, aralikY * 0.42) : Math.min(28, aralikY * 0.28);
      const blok = yaziH + (simge ? 7 + sh : 0), ust = yc2 - blok / 2;
      g.save();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#10222f'; g.font = `700 ${yazi * 0.92}px Roboto`;
      g.fillText(parcala(m.tarih).saat, 640, ust + yaziH / 2);
      g.restore();
      if (simge) { const sw = simge.width * sh / simge.height; g.drawImage(simge, 640 - sw / 2, ust + yaziH + 7, sw, sh); }
      y += aralikY;
    }
  }
  // BAY: panelin altında koyu şerit
  if (bay.length) {
    const yc = py + ph - 52;
    // "BAY", logo ve ad ortalanır; koyu şerit yazının genişliğine göre (kenarlarda saydamlaşır)
    const ad = bay[0];
    g.font = '700 30px Roboto'; const wb = g.measureText('BAY').width;
    const { satirlar, boy } = adSatirlari(g, ad, 420, 28);
    g.font = `700 ${boy}px Roboto`; const wa = Math.max(...satirlar.map(x => g.measureText(x).width));
    const grup = wb + 22 + 88 + 22 + wa, x0 = 640 - grup / 2;
    const sw = Math.min(pw - 40, Math.max(680, grup + 220)), sx = 640 - sw / 2;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 24;
    const gr = g.createLinearGradient(sx, 0, sx + sw, 0);
    gr.addColorStop(0, 'rgba(11,28,41,0)'); gr.addColorStop(0.16, 'rgba(11,28,41,.93)'); gr.addColorStop(0.84, 'rgba(11,28,41,.93)'); gr.addColorStop(1, 'rgba(11,28,41,0)');
    yuvarlak(g, sx, yc - 40, sw, 80, 40); g.fillStyle = gr; g.fill();
    g.restore();
    g.save(); g.font = '700 30px Roboto'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('BAY', x0, yc + 1); g.restore();
    await logoHalkasi(g, x0 + wb + 22 + 44, yc, 44, logo(ad));
    adYaz(g, ad, x0 + wb + 22 + 88 + 22, yc, 'left', 420, 28);
  }
}

// ---------- BSL ----------
async function bslCiz(g, S, { gunler, logo }) {
  const [px, py, pw, ph] = S.panel;
  // Panellerin bölgesi önce zeminle (sol ve sağ kenardaki zeminin satır satır geçişi) kaplanır, sonra gün panelleri çizilir
  const zemin = [px - 14, py - 10, pw + 28, ph + 20];
  panelBoya(g, zemin, 0, S.zeminSol, S.zeminSag);
  const n = gunler.reduce((t, d) => t + d.maclar.length, 0);
  const baslikH = 86, alt = 16, bosluk = 20;
  const aralikY = Math.max(74, Math.min(92, (ph - gunler.length * (baslikH + alt) - (gunler.length - 1) * bosluk) / Math.max(1, n)));
  const toplam = gunler.reduce((t, d) => t + baslikH + alt + d.maclar.length * aralikY, 0) + (gunler.length - 1) * bosluk;
  let y = py + Math.max(0, (ph - toplam) / 2);
  const barH = Math.min(74, aralikY - 12);
  for (const d of gunler) {
    const h = baslikH + d.maclar.length * aralikY + alt;
    g.save(); g.shadowColor = 'rgba(0,0,30,.35)'; g.shadowBlur = 18;
    yuvarlak(g, px, y, pw, h, 26); g.fillStyle = '#e9ebf6'; g.fill(); g.restore();
    panelBoya(g, [px, y, pw, h], 26, S.panelSol, S.panelSag);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1a2380'; g.font = '700 46px Oswald';
    g.fillText(`${d.baslik[0]} ${d.baslik[1]}`, 640, y + baslikH / 2 + 4);
    g.restore();
    let yy = y + baslikH;
    for (const m of d.maclar) {
      const yc = yy + aralikY / 2;
      g.save();
      g.shadowColor = 'rgba(0,0,30,.3)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
      const gr = g.createLinearGradient(82, 0, 1196, 0);
      gr.addColorStop(0, '#08104a'); gr.addColorStop(0.5, '#0c1a66'); gr.addColorStop(1, '#13258a');
      yuvarlak(g, 82, yc - barH / 2, 1114, barH, 9); g.fillStyle = gr; g.fill();
      g.restore();
      adYaz(g, m.ev, 474, yc, 'right', 380);
      adYaz(g, m.dep, 812, yc, 'left', 360);
      await logoHalkasi(g, 528, yc, 43, logo(m.ev));
      await logoHalkasi(g, 752, yc, 43, logo(m.dep));
      g.save();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = '700 42px Roboto';
      g.fillText(parcala(m.tarih).saat, 640, yc + 1);
      g.restore();
      yy += aralikY;
    }
    y += h + bosluk;
  }
}

// lig: 'tbl' | 'bsl'; maclar: [{ tarih, ev, dep, yayin }]; bay: [takım adı]; logo: takım adı -> resim adresi
export async function programGorseli({ lig, hafta, maclar, bay = [], logo }) {
  const [S, z] = await Promise.all([sablonJson(lig), resim(sablonAdresi(`${lig}.webp`)), yaziTipleri()]);
  const c = document.createElement('canvas'); c.width = 1280; c.height = 1600;
  const g = c.getContext('2d');
  g.drawImage(z, 0, 0, 1280, 1600);
  const gunler = gunlereBol(maclar);
  // Başlık: hafta numarası ve tarih aralığı
  numaraYaz(g, z, hafta, lig === 'tbl' ? { sag: 194, ust: 82, alt: 200, kok: [204, 219], pUst: 205 } : { sag: 193, ust: 79, alt: 186, kok: [203, 218], pUst: 140 });
  if (lig === 'bsl') bslUstYazi(g);
  if (gunler.length) {
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Şeride sığsın: en geniş tbl 384, bsl 412 piksel
    const yaz = (font, renk, x, y, enGenis) => {
      g.font = font; g.fillStyle = renk;
      const metin = aralik(gunler.map(d => d.gun), lig), w = g.measureText(metin).width, o = Math.min(1, enGenis / w);
      g.translate(x, y); g.scale(o, 1); g.fillText(metin, 0, 0);
    };
    if (lig === 'tbl') yaz('600 46px Oswald', '#0a1520', 430, 367, 384);
    else yaz('40px "Russo One"', '#131c63', 390, 355, 412);
    g.restore();
  }
  await (lig === 'tbl' ? tblCiz : bslCiz)(g, S, { hafta, gunler, bay, logo });
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
