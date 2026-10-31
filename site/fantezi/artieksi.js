// +/- liderleri yayın görseli. TBL: Pota Altı'nın hazır şablonu (sablon/artieksi-tbl.webp, 1280x1600, 10 boş şerit) doldurulur;
// oyuncu, takım ve +/- Farro, başlık Heading Now yerine Anton. Şablonu olmayan lig (BSL) eski TBL Fantezi'deki çizimle oluşur.
// Ana uygulamanın TBL/BSL sayfasındaki +/- sekmesi kullanır; yazı tipleri ilk görselde yüklenir.
const TURK_ULKELER = new Set(['TÜRKİYE', 'KKTC']);
const baslik = s => String(s ?? '').split(' ').map(k =>
  k !== k.toLocaleUpperCase('tr') || k.replace(/\./g, '').length <= 3 ? k
    : k.toLocaleLowerCase('tr').replace(/(^|[.\-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr'))
).join(' ').replace(/Technıc/u, 'Technic');
// Yazı tiplerinin stil dosyası bir kez eklenir; dönen söz dosya yüklenince (ya da hata verince) tamamlanır
let yaziTipiBaglantisi = null;
function yaziTipleriniBagla() {
  yaziTipiBaglantisi ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Farro:wght@700&family=Montserrat:wght@700;800&display=swap';
    l.onload = l.onerror = ok;
    document.head.append(l);
  });
  return yaziTipiBaglantisi;
}

const SEZON_ADI = '2026-2027';
const LIG_TAM_ADI = { tbl: 'TÜRKİYE SİGORTA TBL', bsl: 'TÜRKİYE SİGORTA BSL' };
// Görselde uzun takım adları kısalır: "Balıkesir Büyükşehir Belediye Spor" -> "Balıkesir BŞB"
const kisaTakim = ad => baslik(ad).replace(/Büyükşehir Belediye(si)? Spor/u, 'BŞB');
// Görseldeki isim: Türk oyuncular Türkçe büyük harfle (ALİ), yabancılar Türkçe harf olmadan (MIKE) ve
// göbek adı olmadan ("Jaquan Elijah Scott" -> "JAQUAN SCOTT"; "Jr." gibi ekler kalır)
const ISIM_EKI = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
function gorselIsmi(k) {
  const turk = TURK_ULKELER.has(k.ulke) || /[çğıöşüÇĞİÖŞÜ]/.test(k.ad);
  if (turk) return k.ad.toLocaleUpperCase('tr');
  const kelimeler = k.ad.split(/\s+/);
  const ek = kelimeler.length > 2 && ISIM_EKI.test(kelimeler.at(-1)) ? kelimeler.pop() : null;
  const kisa = kelimeler.length > 2 ? [kelimeler[0], kelimeler.at(-1)] : kelimeler;
  return [...kisa, ek].filter(Boolean).join(' ').toUpperCase();
}

// +/- liderleri görseli (yayın şablonu): açık gri zemin, beyaz kenarlı turkuaz başlık, siyah lig şeridi,
// solda sıra, ortada siyahtan maviye giden şeritte oyuncu ve takımı, sağda +/-
const SABLON = {
  genislik: 1080, ust: 240, satirYuk: 112, kutuYuk: 98, alt: 34,
  kutuSol: 200, kutuSag: 850, turkuaz: '#0d6f86', acikTurkuaz: '#3cc6d3',
  baslikYazi: 'Anton, Impact, "Arial Narrow", sans-serif', govdeYazi: 'Montserrat, Arial, sans-serif',
};

// Yazı tipi gelmezse (internet yok vb.) görsel yedek yazı tipiyle yine oluşur
async function yaziTipleriniYukle() {
  const yukle = Promise.all([document.fonts.load(`100px ${SABLON.baslikYazi}`, 'İ+'),
    document.fonts.load(`700 40px ${SABLON.govdeYazi}`, 'İ'), document.fonts.load(`800 90px ${SABLON.govdeYazi}`, '+1')]);
  await Promise.race([yukle, new Promise(ok => setTimeout(ok, 4000))]).catch(() => {});
}

// Yazı kutuya sığmıyorsa küçültülür
function sigdir(ctx, metin, enBuyuk, genislik, yaziTipi) {
  let boyut = enBuyuk;
  do ctx.font = `${yaziTipi.replace('{}', boyut)}`; while (ctx.measureText(metin).width > genislik && --boyut > 18);
}

// Hazır şablonlar: zemin görseli ve yerleşim (şablonun piksellerinde). Şeritler aşağı indikçe hafif sağa kayar (kayma).
const HAZIR_SABLON = {
  tbl: {
    zemin: new URL('./sablon/artieksi-tbl.webp', import.meta.url).href,
    baslikY: 250, baslikGen: 775, baslikBoy: 110,
    kutuUst: 354, kutuAdim: 114.2, kutuSol: 322, kutuSag: 925, kayma: 0.78,
    degerX: 1027, satirSayisi: 10,
    turkuaz: '#0e6a88', acikTurkuaz: '#36c3d6',
  },
};
const FARRO = 'Farro, "Arial Narrow", Arial, sans-serif';

function gorselYukle(url) {
  return new Promise((ok, hata) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => hata(new Error('Şablon görseli yüklenemedi'));
    i.src = url;
  });
}

async function hazirSablonla(g, { baslik: baslikYazisi, satirlar }) {
  const [zemin] = await Promise.all([gorselYukle(g.zemin), Promise.race([yaziTipleriniBagla(), new Promise(ok => setTimeout(ok, 4000))])]);
  await Promise.race([Promise.all([document.fonts.load(`${g.baslikBoy}px ${SABLON.baslikYazi}`, 'İ+'), document.fonts.load(`700 44px ${FARRO}`, 'İŞ+1')]),
    new Promise(ok => setTimeout(ok, 4000))]).catch(() => {});
  const tuval = document.createElement('canvas');
  tuval.width = zemin.naturalWidth;
  tuval.height = zemin.naturalHeight;
  const ctx = tuval.getContext('2d');
  ctx.drawImage(zemin, 0, 0);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';

  // Başlık: beyaz kenarlı, gölgeli turkuaz ("8. HAFTANIN +/- LİDERLERİ"). Şablondaki yazı tipi (Heading Now) daha dar:
  // boy korunur, yazı genişliğe sığacak kadar yatayda daraltılır
  ctx.font = `${g.baslikBoy}px ${SABLON.baslikYazi}`;
  const daralt = Math.min(1, g.baslikGen / ctx.measureText(baslikYazisi).width);
  ctx.save();
  ctx.translate(tuval.width / 2, g.baslikY);
  ctx.scale(daralt, 1);
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(baslikYazisi, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = g.turkuaz;
  ctx.fillText(baslikYazisi, 0, 0);
  ctx.restore();

  satirlar.slice(0, g.satirSayisi).forEach((s, i) => {
    const ust = g.kutuUst + i * g.kutuAdim;
    const sol = g.kutuSol + i * g.kayma;
    const gen = g.kutuSag - g.kutuSol;
    const orta = sol + gen / 2;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    sigdir(ctx, s.ad, 39, gen - 40, `700 {}px ${FARRO}`);
    ctx.fillText(s.ad, orta, ust + 46);
    ctx.fillStyle = g.acikTurkuaz;
    sigdir(ctx, s.takim, 39, gen - 40, `700 {}px ${FARRO}`);
    ctx.fillText(s.takim, orta, ust + 84);
    // +/-: beyaz kenarlı turkuaz
    sigdir(ctx, s.deger, 96, 200, `700 {}px ${FARRO}`);
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(s.deger, g.degerX, ust + 86);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = g.turkuaz;
    ctx.fillText(s.deger, g.degerX, ust + 86);
  });
  return new Promise(ok => tuval.toBlob(ok, 'image/png'));
}

async function artieksiGorseli({ lig, baslik: baslikYazisi, altBaslik, satirlar }) {
  if (HAZIR_SABLON[lig]) return hazirSablonla(HAZIR_SABLON[lig], { baslik: baslikYazisi, satirlar });
  const g = SABLON;
  await Promise.race([yaziTipleriniBagla(), new Promise(ok => setTimeout(ok, 4000))]);
  await yaziTipleriniYukle();
  const yukseklik = g.ust + satirlar.length * g.satirYuk + g.alt;
  const tuval = document.createElement('canvas');
  tuval.width = g.genislik;
  tuval.height = yukseklik;
  const ctx = tuval.getContext('2d');
  const orta = g.genislik / 2;

  // Zemin: açık gri, üstte hafif aydınlık
  const zemin = ctx.createLinearGradient(0, 0, 0, yukseklik);
  zemin.addColorStop(0, '#f4f5f6');
  zemin.addColorStop(1, '#d9dde0');
  ctx.fillStyle = zemin;
  ctx.fillRect(0, 0, g.genislik, yukseklik);
  const isik = ctx.createRadialGradient(orta, 160, 40, orta, 160, 700);
  isik.addColorStop(0, 'rgba(255,255,255,.7)');
  isik.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = isik;
  ctx.fillRect(0, 0, g.genislik, yukseklik);

  // Başlık: beyaz kenarlı, gölgeli turkuaz
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  sigdir(ctx, baslikYazisi, 118, g.genislik - 60, `{}px ${g.baslikYazi}`);
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(baslikYazisi, orta, 150);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = g.turkuaz;
  ctx.fillText(baslikYazisi, orta, 150);

  // Lig şeridi
  const serit = ctx.createLinearGradient(110, 0, g.genislik - 110, 0);
  serit.addColorStop(0, '#020304');
  serit.addColorStop(0.55, '#0b1620');
  serit.addColorStop(1, '#1d4563');
  ctx.fillStyle = serit;
  ctx.fillRect(110, 168, g.genislik - 220, 46);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 26px ${g.govdeYazi}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(altBaslik, orta, 201);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  const kutuGen = g.kutuSag - g.kutuSol;
  satirlar.forEach((s, i) => {
    const ust = g.ust + i * g.satirYuk;
    const merkez = ust + g.kutuYuk / 2;
    // Şerit: soldan siyah, sağa doğru mavi
    const kutu = ctx.createLinearGradient(g.kutuSol, 0, g.kutuSag, 0);
    kutu.addColorStop(0, '#020304');
    kutu.addColorStop(0.5, '#0c1924');
    kutu.addColorStop(1, '#1f4a69');
    ctx.fillStyle = kutu;
    ctx.fillRect(g.kutuSol, ust, kutuGen, g.kutuYuk);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.kutuSol + 1, ust + 1, kutuGen - 2, g.kutuYuk - 2);
    // Oyuncu ve takımı
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    sigdir(ctx, s.ad, 36, kutuGen - 40, `700 {}px ${g.govdeYazi}`);
    ctx.fillText(s.ad, g.kutuSol + kutuGen / 2, merkez - 6);
    ctx.fillStyle = g.acikTurkuaz;
    sigdir(ctx, s.takim, 33, kutuGen - 40, `700 {}px ${g.govdeYazi}`);
    ctx.fillText(s.takim, g.kutuSol + kutuGen / 2, merkez + 34);
    // Sıra ve +/-
    ctx.fillStyle = g.turkuaz;
    ctx.textAlign = 'right';
    sigdir(ctx, `${s.sira}.`, 84, g.kutuSol - 26, `800 {}px ${g.govdeYazi}`);
    ctx.fillText(`${s.sira}.`, g.kutuSol - 14, merkez + 30);
    sigdir(ctx, s.deger, 84, g.genislik - g.kutuSag - 34, `800 {}px ${g.govdeYazi}`);
    ctx.fillText(s.deger, g.genislik - 22, merkez + 30);
  });

  return new Promise(ok => tuval.toBlob(ok, 'image/png'));
}

// Listedeki oyuncudan görsel satırı
export const gorselSatiri = k => ({ sira: k.sira, ad: gorselIsmi(k), takim: kisaTakim(k.takim), deger: k.pm > 0 ? `+${k.pm}` : String(k.pm) });
export const gorselBasligi = (lig, donem) => ({
  lig,
  baslik: `${donem === 'sezon' ? 'SEZONUN' : `${donem}. HAFTANIN`} +/- LİDERLERİ`, altBaslik: `${SEZON_ADI} ${LIG_TAM_ADI[lig]}`,
});
export { artieksiGorseli };
