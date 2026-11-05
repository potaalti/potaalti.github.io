// Haftanın ödülleri görselleri (yönetici, TBL → Ödüller): Pota Altı'nın Canva şablonlarına oyuncu fotoğrafı, takım logosu ve
// haftalık istatistikler yazılır. Çıktı 1280x1600 PNG. Şablonlar odul/sablon/ (kullanıcının boş şablonları; tekli şablonda
// istatistik etiketleri silinip damga olarak ayrıldı, gelen istatistiklere göre yerleştirilir).
// Yazı tipleri (Canva'dakilerin ücretsiz benzerleri): Heading Now -> Big Shoulders Display, Posey -> Russo One,
// istatistik rakamları -> Lilita One, 5'li isimler Farro (Canva'daki de Farro).
const YAZI_TIPLERI = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Russo+One&family=Lilita+One&family=Farro:wght@700&display=block';
const G = 1280, Y = 1600;
const RENK = '#026584';
const sablon = ad => new URL(`odul/sablon/${ad}`, document.baseURI).href;

let yaziHazir;
function yaziTipleri() {
  yaziHazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI_TIPLERI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all(['800 100px "Big Shoulders Display"', '40px "Russo One"', '40px "Lilita One"', '700 40px Farro']
    .map(f => document.fonts.load(f, 'HAFTANIN İŞĞÜ 0123'))));
  return Promise.race([yaziHazir, new Promise(ok => setTimeout(ok, 6000))]);
}
const onbellek = new Map();
const resim = url => {
  if (!url) return Promise.resolve(null);
  if (!onbellek.has(url)) onbellek.set(url, new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; }));
  return onbellek.get(url);
};
// Türk oyuncunun adı Türkçe büyütülür (i -> İ), yabancınınki İngilizce (Diante -> DIANTE)
const buyuk = (s, yerli = true) => String(s ?? '').toLocaleUpperCase(yerli ? 'tr' : 'en');
const sira = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' })[n % 10] ?? 'TH'}`;

function tuval(zemin, olcek = 1) {
  const c = document.createElement('canvas');
  c.width = G; c.height = Y;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(zemin, 0, 0, G, Y);
  if (olcek !== 1) g.scale(olcek, olcek);
  return [c, g];
}
const blob = c => new Promise(ok => c.toBlob(ok, 'image/png'));

// Yazıyı büyük harf yüksekliği 'boy' olacak şekilde ölçekler; 'gen'e sığmazsa küçültür. yazi: CSS font, boyutun yerinde PX
function olcu(g, metin, yazi, boy, aralik = 0) {
  g.font = yazi.replace('PX', 100);
  const h = g.measureText('H').actualBoundingBoxAscent || 72;
  const px = 100 * boy / h;
  g.font = yazi.replace('PX', px);
  g.letterSpacing = `${aralik}px`;
  const w = g.measureText(metin).width - aralik;
  return { px, w };
}
// sikistir: genişliğe sığmazsa küçültmek yerine yatayda daraltır (Heading Now'un dar harflerine benzesin)
function yaz(g, metin, x, y, { yazi, boy, gen = Infinity, hiza = 'center', renk = '#fff', aralik = 0, cizgi = 0, cizgiRenk = '#fff', sikistir = false }) {
  let { px, w } = olcu(g, metin, yazi, boy, aralik);
  let sx = 1;
  if (w > gen && sikistir) { sx = gen / w; } else if (w > gen) { const k = gen / w; ({ px, w } = olcu(g, metin, yazi, boy * k, aralik * k)); }
  g.save();
  if (sx !== 1) { g.translate(x, 0); g.scale(sx, 1); g.translate(-x, 0); }
  g.font = yazi.replace('PX', px);
  g.letterSpacing = `${sx !== 1 ? aralik : aralik * Math.min(1, gen / (w || 1))}px`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const sol = hiza === 'center' ? x - w / 2 : hiza === 'right' ? x - w : x;
  if (cizgi) { g.lineWidth = cizgi; g.strokeStyle = cizgiRenk; g.lineJoin = 'round'; g.strokeText(metin, sol, y); }
  g.fillStyle = renk;
  g.fillText(metin, sol, y);
  g.restore();
  return w;
}
// Siyah şeritteki aralıklı yazı (Posey benzeri): şeridin %90'ına sığacak şekilde harf aralığı
function seritYazisi(g, metin, cx, cy, gen, boy) {
  const a = boy * 0.55;
  let { w } = olcu(g, metin, 'PXpx "Russo One"', boy, a);
  const k = Math.min(1, gen / w);
  yaz(g, metin, cx, cy + boy * k / 2, { yazi: 'PXpx "Russo One"', boy: boy * k, aralik: a * k, gen });
}
// Sayfaya sığdırılmış resim (contain) ya da kutuyu dolduran (cover)
function sigdir(g, im, x, y, w, h, kapla = false) {
  const k = (kapla ? Math.max : Math.min)(w / im.width, h / im.height);
  const iw = im.width * k, ih = im.height * k;
  g.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
// Logo beyaz zeminliyse kenardan başlayıp beyaza yakın pikselleri saydam yapar (taşkın doldurma)
const seffafOnbellek = new Map();
function beyaziSil(im) {
  if (!im) return im;
  if (seffafOnbellek.has(im)) return seffafOnbellek.get(im);
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const W = c.width, H = c.height, img = g.getImageData(0, 0, W, H), d = img.data;
  const beyaz = k => d[k * 4 + 3] > 0 && d[k * 4] > 228 && d[k * 4 + 1] > 228 && d[k * 4 + 2] > 228;
  const gor = new Uint8Array(W * H), yigin = [];
  for (let i = 0; i < W; i++) yigin.push(i, (H - 1) * W + i);
  for (let j = 0; j < H; j++) yigin.push(j * W, j * W + W - 1);
  while (yigin.length) {
    const k = yigin.pop();
    if (gor[k] || !beyaz(k)) continue;
    gor[k] = 1; d[k * 4 + 3] = 0;
    const i = k % W, j = (k - i) / W;
    if (i > 0) yigin.push(k - 1); if (i < W - 1) yigin.push(k + 1); if (j > 0) yigin.push(k - W); if (j < H - 1) yigin.push(k + W);
  }
  g.putImageData(img, 0, 0);
  seffafOnbellek.set(im, c);
  return c;
}
// Fotoğraf şeffaf zeminli (oyuncu dekupe) mi, yoksa vesikalık mı
function dekupeMi(im) {
  const c = document.createElement('canvas'); c.width = 20; c.height = 20;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0, 20, 20);
  const d = g.getImageData(0, 0, 20, 20).data;
  return d[3] < 20 && d[19 * 4 + 3] < 20;
}

// ---------- Kapak ----------
export async function kapak({ hafta }) {
  const [z] = await Promise.all([resim(sablon('kapak.webp')), yaziTipleri()]);
  const [c, g] = tuval(z, G / 720);
  yaz(g, `${hafta}. haftanın`, 360, 392, { yazi: '800 PXpx "Big Shoulders Display"', boy: 158, gen: 598, renk: RENK, sikistir: true });
  yaz(g, 'panoraması', 360, 540, { yazi: '800 PXpx "Big Shoulders Display"', boy: 170, gen: 598, renk: RENK, sikistir: true });
  return blob(c);
}

// ---------- Tekli ödül (MVP, Yerli/Yabancı MVP, kaybeden MVP'ler) ----------
const ETIKET = { sayi: [709, 782], rib: [861, 782], ast: [1012, 782], tc: [795, 914], blk: [944, 914], iki: [758, 1067], uc: [876, 1067], sa: [994, 1067] };
const SATIRLAR = [{ alanlar: ['sayi', 'rib', 'ast'], ara: 151, boy: 52 }, { alanlar: ['tc', 'blk'], ara: 141, boy: 46 }, { alanlar: ['iki', 'uc', 'sa'], ara: 117, boy: 33 }];
const ORTA = 925;
const etiketler = () => Promise.all(Object.keys(ETIKET).map(async a => [a, await resim(sablon(`etiket-${a}.png`))])).then(Object.fromEntries);

// Büyük fotoğrafa nokta dokusu (şablondaki gibi)
function noktala(g, x, y, w, h) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(255,255,255,0.16)';
  for (let j = y; j < y + h; j += 7) for (let i = x + ((j / 7) % 2) * 3.5; i < x + w; i += 7) { g.beginPath(); g.arc(i, j, 1.5, 0, 7); g.fill(); }
  g.restore();
}

// o: { ad, takim, sayi, rib, ast, tc, blk, iki: [s, d], uc, sa, vp }, foto/logo: resim adresi
export async function tekli({ tur, hafta, o, foto, logo }) {
  const mvp = tur === 'mvp';
  const [z, et, f, l] = await Promise.all([resim(sablon(mvp ? 'tekli-mvp.webp' : 'tekli.webp')), etiketler(), resim(foto), resim(logo), yaziTipleri()]);
  const [c, g] = tuval(z);
  if (f) {
    const dekupe = dekupeMi(f);
    // Büyük fotoğraf: turkuaz kutunun içinde, baş kutunun üstünden taşar
    const kat = new OffscreenCanvas(G, Y), kg = kat.getContext('2d');
    kg.beginPath(); kg.rect(0, 70, 561, 1120); kg.clip();
    if (dekupe) { const k = 860 / f.width; kg.drawImage(f, 270 - 430, 115 - f.height * 0.035 * k, 860, f.height * k); } else sigdir(kg, f, 0, 224, 561, 966, true);
    noktala(kg, 0, 70, 561, 1120);
    g.drawImage(kat, 0, 0);
    // Önde tam boy fotoğraf (alt banttan önce kesilir)
    if (dekupe) {
      g.save(); g.beginPath(); g.rect(0, 0, G, 1530); g.clip();
      const k = 470 / f.width; g.drawImage(f, 536 - 235, 690 - f.height * 0.035 * k, 470, f.height * k);
      g.restore();
    }
  }
  if (l) sigdir(g, beyaziSil(l), 20, 1330, 150, 190);
  // Başlık
  const BS = '800 PXpx "Big Shoulders Display"';
  const TB = {
    mvp: [`MVP OF THE ${sira(hafta)} WEEK`, null],
    yerli: ['DOMESTIC PLAYER OF THE WEEK', [`${hafta}. HAFTANIN`, "YERLİ MVP'Sİ"]],
    yabanci: ['FOREIGNER PLAYER OF THE WEEK', [`${hafta}. HAFTANIN`, "YABANCI MVP'Sİ"]],
    kaybedenYerli: ['HONORABLE MENTION OF THE WEEK', [`${hafta}. HAFTADA KAYBEDEN`, 'YERLİ MVP']],
    kaybedenYabanci: ['HONORABLE MENTION OF THE WEEK', [`${hafta}. HAFTADA KAYBEDEN`, 'YABANCI MVP']],
  }[tur];
  seritYazisi(g, TB[0], 921, 247, 530, 27);
  seritYazisi(g, buyuk(o.ad, o.yerli), 921, 653, 530, 27);
  if (TB[1]) {
    const boylar = tur.startsWith('kaybeden') ? [80, 128] : [136, 144];
    const ara = 30, toplam = boylar.reduce((a, b) => a + b, 0) + ara;
    let yy = 450 - toplam / 2;
    TB[1].forEach((s, i) => { yy += boylar[i]; yaz(g, s, 921, yy, { yazi: BS, boy: boylar[i], gen: 572, renk: RENK, sikistir: true }); yy += ara; });
  }
  // İstatistikler: sıfır olanlar ve hiç denenmeyen atışlar yazılmaz
  const deger = { sayi: o.sayi, rib: o.rib, ast: o.ast, tc: o.tc, blk: o.blk,
    iki: o.iki?.[1] ? `${o.iki[0]}/${o.iki[1]}` : 0, uc: o.uc?.[1] ? `${o.uc[0]}/${o.uc[1]}` : 0, sa: o.sa?.[1] ? `${o.sa[0]}/${o.sa[1]}` : 0 };
  for (const s of SATIRLAR) {
    const var_ = s.alanlar.filter(a => deger[a]);
    var_.forEach((a, i) => {
      const im = et[a]; const [, ey] = ETIKET[a];
      const cx = ORTA + (i - (var_.length - 1) / 2) * s.ara;
      g.drawImage(im, cx - im.width / 2, ey);
      yaz(g, String(deger[a]), cx, ey - 2, { yazi: 'PXpx "Lilita One"', boy: s.boy, gen: s.ara - 12, renk: RENK, cizgi: 5 });
    });
  }
  yaz(g, String(o.vp), 270, 1270, { yazi: 'PXpx "Lilita One"', boy: 64, renk: RENK, cizgi: 6 });
  return blob(c);
}

// ---------- 5'li (Yerli 5, Yabancı 5, Mansiyon 5'i I–II) — 720x900 ölçüsünde çizilir ----------
const KARTLAR = [[82, 271, 64, 467, 235, 454], [294, 271, 276, 467, 447, 454], [506, 271, 488, 467, 659, 454],
  [188, 566, 170, 762, 341, 749], [400, 566, 382, 762, 553, 749]];
export async function besli({ tur, hafta, oyuncular }) {
  const [z] = await Promise.all([resim(sablon('besli.webp')), yaziTipleri()]);
  const [c, g] = tuval(z, G / 720);
  const BS = '800 PXpx "Big Shoulders Display"';
  const [baslik, ing] = {
    yerli: [`${hafta}. HAFTANIN YERLİ 5'İ`, `DOMESTIC TEAM OF THE ${sira(hafta)} WEEK`],
    yabanci: [`${hafta}. HAFTANIN YABANCI 5'İ`, `FOREIGNER TEAM OF THE ${sira(hafta)} WEEK`],
    mansiyon1: [`${hafta}. HAFTANIN MANSİYON 5'İ – I`, `HONORABLE MENTIONS OF THE ${sira(hafta)} WEEK`],
    mansiyon2: [`${hafta}. HAFTANIN MANSİYON 5'İ – II`, `HONORABLE MENTIONS OF THE ${sira(hafta)} WEEK`],
  }[tur];
  yaz(g, baslik, 360, 177, { yazi: BS, boy: 50, gen: 432, renk: RENK, sikistir: true });
  seritYazisi(g, ing, 360, 197.5, 400, 11.5);
  const resimler = await Promise.all(oyuncular.map(o => Promise.all([resim(o.foto), resim(o.logo)])));
  oyuncular.slice(0, 5).forEach((o, i) => {
    const [bx, by, sx1, sy1, sx2, sy2] = KARTLAR[i];
    const [f, l] = resimler[i];
    if (f) {
      g.save();
      g.beginPath(); g.moveTo(bx, by - 40); g.lineTo(bx + 131, by - 40); g.lineTo(bx + 131, sy2 + 1); g.lineTo(bx, sy1 + 1); g.closePath(); g.clip();
      if (dekupeMi(f)) { const w = 150, h = f.height * w / f.width; g.drawImage(f, bx + 65.5 - w / 2, by - 22 - f.height * 0.035 * w / f.width, w, h); } else sigdir(g, f, bx, by, 131, 189, true);
      g.restore();
    }
    // Logo dairesi şablonda; logo içine
    const [cx, cy] = [bx - 1, by];
    g.save(); g.beginPath(); g.arc(cx, cy, 27.5, 0, 7); g.fillStyle = '#fff'; g.fill(); g.restore();
    if (l) sigdir(g, l, cx - 20, cy - 20, 40, 40);
    // İsim: şeridin eğimiyle, iki satır (ad / soyad)
    const parca = buyuk(o.ad, o.yerli).split(' ');
    const satir = parca.length > 1 ? [parca.slice(0, -1).join(' '), parca.at(-1)] : [parca[0]];
    const mx = (sx1 + sx2) / 2, my = (sy1 + sy2) / 2 + 31;
    g.save(); g.translate(mx, my); g.rotate(Math.atan2(sy2 - sy1, sx2 - sx1));
    satir.forEach((s, k) => yaz(g, s, 0, (k - (satir.length - 1) / 2) * 24 + 9, { yazi: '700 PXpx Farro', boy: 18, gen: 150 }));
    g.restore();
  });
  return blob(c);
}
