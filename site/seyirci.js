// Seyirci görselleri (yönetici, Seyirci sekmesi): Pota Altı yayın şablonlarına haftanın maçları ya da sezon ortalamaları
// yazılır. Şablonlar kullanıcının dolu görsellerinden yazıları silinerek üretildi (fantezi/sablon/seyirci-*.webp, 1600x2000);
// satırların yerleri o görsellerden ölçüldü. Yazı tipleri: hafta yazısı Knewave (İ'nin noktası elle), takım adları Bebas Neue,
// skor ve seyirci sayısı Anton.
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Knewave&display=block';
const SABLON = lig => tur => new URL(`fantezi/sablon/seyirci-${tur}-${lig}.webp`, document.baseURI).href;
const VURGU = { tbl: '#2fe0ea', bsl: '#a46cff' };

// Haftalık: 8 maç satırı (üst kenarları), takım adları iki satıra kadar, skor beyaz şeritte, sayı sağdaki kutuda
const HAFTA = { satirlar: [610, 764, 920, 1075, 1233, 1392, 1550, 1707], ev: 290, dep: 985, adGen: 340, tekSatir: 290, skor: 628, sayi: 1396,
  baslik: { x: 811, y: 268, boy: 74 } };
// Ortalama: 17 satır (BSL şablonunda 16)
const ORT = { satirlar: [613, 679, 745, 811, 877, 943, 1009, 1075, 1142, 1210, 1279, 1347, 1414, 1482, 1550, 1618, 1688],
  sira: 165, takim: 262, takimGen: 400, doluluk: 722, mac: 896, toplam: 1133, ort: 1410, baslik: { x: 811, y: 270, boy: 74 } };

// Yazı tipi dosyaları stil dosyası yüklendikten sonra tanınır; ondan önce fonts.load boş döner
let yaziHazir;
function yaziTipleriniYukle() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI;
    l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['104px Knewave', '50px "Bebas Neue"', '60px Anton'].map(f => document.fonts.load(f, 'HAFTAİŞĞ0'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}
const resim = url => new Promise((ok, hata) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => hata(new Error('Şablon yüklenemedi')); i.src = url; });
const buyuk = s => String(s ?? '').toLocaleUpperCase('tr');
const binlik = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const yuzde = d => `%${Math.round(d * 100)}`;

// Yazının büyük harf yüksekliği istenen boyda olacak şekilde yazı tipi ayarlanır; genişliğe sığmazsa yatayda daraltılır
function yaz(g, metin, x, y, { yazi, boy, gen = Infinity, hiza = 'center', renk = '#fff', kalin = 0 }) {
  g.font = `100px ${yazi}`;
  const olcu = g.measureText('H');
  const px = 100 * boy / (olcu.actualBoundingBoxAscent || 70);
  g.font = `${px}px ${yazi}`;
  const w = g.measureText(metin).width;
  const sx = Math.min(1, gen / w);
  g.save();
  g.translate(x, y);
  g.scale(sx, 1);
  g.textAlign = hiza;
  g.textBaseline = 'alphabetic';
  g.fillStyle = renk;
  if (kalin) { g.lineWidth = kalin / sx; g.strokeStyle = renk; g.lineJoin = 'round'; g.strokeText(metin, 0, 0); }
  g.fillText(metin, 0, 0);
  g.restore();
}

// Takım adı bir satıra sığmazsa kelimeler iki satıra en dengeli şekilde bölünür
function ikiSatir(g, ad, gen) {
  if (g.measureText(ad).width <= gen || !ad.includes(' ')) return [ad];
  const k = ad.split(' ');
  let en = [ad], fark = Infinity;
  for (let i = 1; i < k.length; i++) {
    const a = k.slice(0, i).join(' '), b = k.slice(i).join(' ');
    const f = Math.max(g.measureText(a).width, g.measureText(b).width);
    if (f < fark) { fark = f; en = [a, b]; }
  }
  return en;
}
function takimAdi(g, ad, x, y) {
  const yazi = '"Bebas Neue"', boy = 36;
  g.font = `100px ${yazi}`;
  const px = 100 * boy / (g.measureText('H').actualBoundingBoxAscent || 70);
  g.font = `${px}px ${yazi}`;
  const satir = ikiSatir(g, buyuk(ad), HAFTA.tekSatir);
  const ortaY = y + 68, ara = 45;
  satir.forEach((s, i) => yaz(g, s, x, ortaY + boy / 2 + (i - (satir.length - 1) / 2) * ara, { yazi, boy, gen: HAFTA.adGen, kalin: 0.6 }));
}

// Hafta yazısı: şablondaki fırça şeridin üstüne, ortalanmış. Knewave'de İ yok: I yazılıp noktası elle konur.
function baslik(g, metin, { x, y, boy }) {
  const yazi = 'Knewave';
  g.font = `100px ${yazi}`;
  const px = 100 * boy / (g.measureText('H').actualBoundingBoxAscent || 70);
  g.font = `${px}px ${yazi}`;
  const duz = metin.replace(/İ/g, 'I');
  const w = g.measureText(duz).width, sx = Math.min(1, 600 / w);
  g.save();
  g.translate(x, y);
  g.scale(sx, 1);
  g.fillStyle = '#0b0b0f';
  g.textAlign = 'left';
  g.fillText(duz, -w / 2, 0);
  [...metin].forEach((h, i) => {
    if (h !== 'İ') return;
    const sol = -w / 2 + g.measureText(duz.slice(0, i)).width, gen = g.measureText('I').width;
    g.beginPath();
    g.ellipse(sol + gen * 0.98, -boy - px * 0.12, px * 0.085, px * 0.07, -0.3, 0, Math.PI * 2);
    g.fill();
  });
  g.restore();
}

function tuval(zemin) {
  const c = document.createElement('canvas');
  c.width = zemin.width; c.height = zemin.height;
  const g = c.getContext('2d');
  g.drawImage(zemin, 0, 0);
  return [c, g];
}
const blob = c => new Promise(ok => c.toBlob(ok, 'image/png'));

// maclar: [{ ev, dep, evSkor, depSkor, seyirci, doluluk }] (çok seyirciliden aza, en fazla 8); doluluk 0–1 ya da null
// (salon kapasitesi bilinmiyor): skorun altına, beyaz şeridin dar ucuna "SALON %62 DOLU"
export async function haftaGorseli({ lig, hafta, maclar }) {
  const [zemin] = await Promise.all([resim(SABLON(lig)('hafta')), yaziTipleriniYukle()]);
  const [c, g] = tuval(zemin);
  baslik(g, `${hafta}. HAFTA`, HAFTA.baslik);
  maclar.slice(0, HAFTA.satirlar.length).forEach((m, i) => {
    const y = HAFTA.satirlar[i];
    takimAdi(g, m.ev, HAFTA.ev, y);
    takimAdi(g, m.dep, HAFTA.dep, y);
    yaz(g, `${m.evSkor ?? ''} - ${m.depSkor ?? ''}`, HAFTA.skor, y + 95, { yazi: 'Anton', boy: 56, gen: 220, renk: '#0b0b0f' });
    yaz(g, m.seyirci ? String(m.seyirci) : '–', HAFTA.sayi, y + 78, { yazi: 'Anton', boy: 56, gen: 170, renk: VURGU[lig] });
    if (m.doluluk !== null && m.doluluk !== undefined)
      yaz(g, `SALON ${yuzde(m.doluluk)} DOLU`, HAFTA.skor, y + 124, { yazi: '"Bebas Neue"', boy: 19, gen: 190, renk: '#3a3a4a', kalin: 0.4 });
  });
  return blob(c);
}

// takimlar: [{ ad, mac, toplam, ort, doluluk }] (ortalamaya göre sıralı); hafta: kaçıncı haftaya kadar. Doluluk takım
// sütununun sağ ucunda kendi başlığıyla (şablonda yeri yok, başlık şeridine "DOLULUK" yazılır)
export async function ortalamaGorseli({ lig, hafta, takimlar }) {
  const [zemin] = await Promise.all([resim(SABLON(lig)('ort')), yaziTipleriniYukle()]);
  const [c, g] = tuval(zemin);
  baslik(g, `İLK ${hafta} HAFTA`, ORT.baslik);
  yaz(g, 'DOLULUK', ORT.doluluk, 591, { yazi: '"Bebas Neue"', boy: 22, kalin: 0.6 });
  takimlar.slice(0, ORT.satirlar.length).forEach((t, i) => {
    const y = ORT.satirlar[i] + 49;
    const ust = i < 3;
    yaz(g, String(i + 1), ORT.sira, y, { yazi: 'Anton', boy: 34, renk: ust ? '#111' : '#fff' });
    yaz(g, buyuk(t.ad), ORT.takim, y, { yazi: '"Bebas Neue"', boy: 35, gen: ORT.takimGen, hiza: 'left', kalin: 0.8 });
    yaz(g, t.doluluk === null || t.doluluk === undefined ? '–' : yuzde(t.doluluk), ORT.doluluk, y, { yazi: '"Bebas Neue"', boy: 30, renk: VURGU[lig], kalin: 0.8 });
    yaz(g, String(t.mac), ORT.mac, y, { yazi: '"Bebas Neue"', boy: 35, kalin: 0.8 });
    yaz(g, binlik(t.toplam), ORT.toplam, y, { yazi: '"Bebas Neue"', boy: 35, kalin: 0.8 });
    yaz(g, binlik(t.ort), ORT.ort, y, { yazi: '"Bebas Neue"', boy: 35, renk: '#0b0b14', kalin: 1.2 });
  });
  return blob(c);
}
