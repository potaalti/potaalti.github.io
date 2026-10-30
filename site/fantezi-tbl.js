// TBL Fantezi Ligi bölümü. Veriler (kadrolar, haftalık VP'ler, ayarlar) TBL Fantezi Ligi sitesinin yayınladığı
// dosyalardan okunur; puanlama, o sitenin scoring.js dosyasının birebir kopyasıyla (tbl-puanlama.js) yapılır.
// Hafta mantığı (fantezi hafta numarası, sıradaki haftanın Perşembe'den itibaren gösterilmesi) eski uygulamayla aynıdır.
import { haftaSiralamasi, takimHaftaPuani, genelKlasman, haftaDurumu } from './tbl-puanlama.js';
import { KAYNAK, esc, baslik, aramaNorm, getir, tarihSaat, canliYazisi, paylasDugmeleri, gorseliPaylas } from './ortak.js';

const SECIM_ANAHTARI = 'tbl-fantezi-takimim'; // eski uygulamayla aynı anahtar: aynı adreste seçim korunur
const V = { ayarlar: null, index: null, rehber: null, kadrolar: [], haftalar: new Map(), yuklendi: false, yukleniyor: false, hata: null };
const UI = { ara: '' };
let ciz = () => {};
export const baglan = cizFn => { ciz = cizFn; };

let seciliTakim = null;
try { seciliTakim = localStorage.getItem(SECIM_ANAHTARI); } catch { /* depolama yok */ }
function takimSec(ad) {
  seciliTakim = ad;
  try { localStorage.setItem(SECIM_ANAHTARI, ad); } catch { /* depolama yok */ }
}

// ---------- Veri ----------
async function haftaYukle(n, zorla = false) {
  if (!zorla && V.haftalar.has(n)) return V.haftalar.get(n);
  const h = await getir(`${KAYNAK}/hafta/${n}.json`);
  V.haftalar.set(n, h);
  return h;
}

async function siradakiYukle() {
  const s = V.index.siradaki;
  if (!s || V.index.haftalar.includes(s.hafta)) return;
  try { await haftaYukle(s.hafta, true); } catch { /* dosya yoksa sıradaki hafta gösterilmez */ }
}

async function yukle() {
  if (V.yuklendi || V.yukleniyor) return;
  V.yukleniyor = true;
  try {
    const kadroIndex = getir(`${KAYNAK}/kadro/index.json`);
    [V.ayarlar, V.index, V.rehber] = await Promise.all([getir(`${KAYNAK}/ayarlar.json`), getir(`${KAYNAK}/hafta/index.json`), getir(`${KAYNAK}/oyuncular.json`)]);
    const { haftalar } = await kadroIndex;
    const kadrolar = await Promise.all(haftalar.map(n => getir(`${KAYNAK}/kadro/${n}.json`)));
    V.kadrolar = haftalar.map((n, i) => ({ hafta: n, takimlar: kadrolar[i] }));
    await Promise.all([...V.index.haftalar.map(n => haftaYukle(n)), siradakiYukle()]);
    V.yuklendi = true;
  } catch (e) {
    V.hata = e.message;
  }
  V.yukleniyor = false;
  ciz();
}

// Güncel hafta bitmediyse veriler dakikada bir yenilenir (uygulamanın canlı yenilemesi çağırır)
export async function yenile() {
  if (!V.yuklendi || haftaDurumu(V.haftalar.get(sonHafta())).tamamlandi) return false;
  const eskiSon = sonHafta();
  V.index = await getir(`${KAYNAK}/hafta/index.json`);
  await haftaYukle(sonHafta(), true);
  if (eskiSon !== sonHafta()) await Promise.all(V.index.haftalar.map(n => haftaYukle(n)));
  await siradakiYukle();
  return true;
}

// ---------- Hafta mantığı (eski uygulamayla aynı) ----------
const sonHafta = () => V.index.haftalar.at(-1);
const haftaListesi = () => V.index.haftalar.map(n => V.haftalar.get(n));
// Fantezi ligi TBL'nin başlangıç haftasında 1. hafta olarak başlar; adreslerde TBL hafta numarası kullanılır
const fHafta = n => n - V.ayarlar.baslangicHaftasi + 1;
const TURK_ULKELER = new Set(['TÜRKİYE', 'KKTC']);
const turkMu = id => TURK_ULKELER.has(V.rehber[id]?.ulke);
const kadroBul = n => (V.kadrolar.findLast(k => k.hafta <= n) ?? V.kadrolar[0]).takimlar;
const sonKadro = () => V.kadrolar.at(-1).takimlar;
const haftaSirasi = n => haftaSiralamasi(kadroBul(n), V.haftalar.get(n), V.ayarlar.puanTablosu, turkMu);
const klasmanHesapla = haftalar => genelKlasman(kadroBul, haftalar, V.ayarlar.puanTablosu, turkMu);
function siradakiHafta() {
  const s = V.index.siradaki;
  if (!s || !V.haftalar.has(s.hafta) || V.index.haftalar.includes(s.hafta) || new Date() < new Date(s.gosterim)) return null;
  return haftaDurumu(V.haftalar.get(sonHafta())).tamamlandi ? s.hafta : null;
}
const gorunenHaftalar = () => (siradakiHafta() ? [...V.index.haftalar, siradakiHafta()] : V.index.haftalar);
const acilisHaftasi = n => (n === sonHafta() && siradakiHafta() ? siradakiHafta() : n);
const gecerliHafta = n => (gorunenHaftalar().includes(n) ? n : acilisHaftasi(sonHafta()));

// ---------- Ortak parçalar ----------
const KOK = '#/fantezi/tbl';
const takimLinki = (ad, n) => `${KOK}/takim/${encodeURIComponent(ad)}/${n}`;
const benimMi = ad => (ad === seciliTakim ? 'benim' : '');
const siraRozeti = sira => `<span class="f-sira ${sira <= 3 ? `s${sira}` : ''}">${sira}</span>`;
const dakika = sn => `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`;

function haftaSecici(n, rota) {
  const h = gorunenHaftalar();
  const i = h.indexOf(n);
  const d = haftaDurumu(V.haftalar.get(n));
  const durum = !V.index.haftalar.includes(n) ? 'Sıradaki hafta' : d.tamamlandi ? 'Tamamlandı' : `${d.bitti}/${d.toplam} maç bitti${d.canli ? ' · canlı' : ''}`;
  const ok = (hedef, isaret) => (hedef === undefined ? `<span>${isaret}</span>` : `<a href="${rota}/${hedef}" aria-label="${fHafta(hedef)}. hafta">${isaret}</a>`);
  return `<div class="hafta-secici">${ok(h[i - 1], '‹')}
    <div class="baslik"><strong>${fHafta(n)}. Hafta</strong><small>TBL ${n}. hafta · ${durum}</small></div>${ok(h[i + 1], '›')}</div>`;
}

function haftaCipleri(n, rota) {
  const h = gorunenHaftalar();
  if (h.length < 2) return '';
  return `<div class="secenekler">${h.map(k => `<a class="secenek ${k === n ? 'aktif' : ''}" href="${rota}/${k}">${fHafta(k)}. hafta</a>`).join('')}</div>`;
}

const SEKMELER = [['takimim', 'Takımım'], ['hafta', 'Haftalık'], ['genel', 'Genel'], ['bostakiler', 'Boştakiler']];
function sekmeler(aktif) {
  return `<div class="sayfa-baslik"><h1>${esc(V.ayarlar.ligAdi)}</h1></div>
    <div class="secenekler">${SEKMELER.map(([s, ad]) => `<a class="secenek ${s === aktif ? 'aktif' : ''}" href="${KOK}/${s}">${ad}</a>`).join('')}</div>`;
}

// ---------- Ekranlar ----------
function secimEkrani() {
  const liste = [...sonKadro()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map(t => `
    <a class="f-satir ${benimMi(t.ad)}" href="${KOK}/sec/${encodeURIComponent(t.ad)}">
      <div class="ad"><strong>${esc(t.ad)}</strong>${t.sahibi ? `<small>${esc(t.sahibi)}</small>` : ''}</div><span class="soluk">›</span></a>`).join('');
  return `<div class="kart"><h2>Takımını seç</h2><p class="soluk kucuk" style="margin-top:0">Seçimin bu cihazda hatırlanır, sonra değiştirebilirsin.</p>${liste}</div>`;
}

// Hafta sürerken: puanı sayılan oyunculardan kaçının maçı başladı/bitti
function ilerlemeYazisi(s) {
  const sayilan = [...s.aslar, ...s.yedekler].filter(o => o.sayildi);
  const oynadi = sayilan.filter(o => o.macDurumu !== 'oynanmadi').length;
  const canli = sayilan.filter(o => o.macDurumu === 'canli').length;
  return `${oynadi}/${sayilan.length} oynadı${canli ? ` · ${canli} canlı` : ''}`;
}

function haftalikEkran(n) {
  const rota = `${KOK}/hafta`;
  if (!V.index.haftalar.includes(n)) {
    const satirlar = [...kadroBul(n)].sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map(t => `
      <a class="f-satir ${benimMi(t.ad)}" href="${takimLinki(t.ad, n)}"><span class="f-sira">–</span>
        <div class="ad"><strong>${esc(t.ad)}</strong>${t.sahibi ? `<small>${esc(t.sahibi)}</small>` : ''}</div>
        <div class="f-sayi"><strong>0</strong><small>VP</small></div></a>`).join('');
    return `${haftaSecici(n, rota)}${haftaCipleri(n, rota)}<div class="kart"><h2>Maçlar başlayınca sıralama oluşur</h2>${satirlar}</div>`;
  }
  const haftaBitti = haftaDurumu(V.haftalar.get(n)).tamamlandi;
  const satirlar = haftaSirasi(n).map(s => {
    const esitlik = !s.vpEsitligi ? '' : s.enIyiTurk ? `Eşitlik: ${s.enIyiTurk.ad} ${s.enIyiTurk.vp} VP` : 'Eşitlik: Türk oyuncu yok';
    const alt = [[s.sahibi, haftaBitti ? '' : ilerlemeYazisi(s)].filter(Boolean).join(' · '), esitlik].filter(Boolean).map(x => `<small>${esc(x)}</small>`).join('');
    return `<a class="f-satir ${benimMi(s.ad)}" href="${takimLinki(s.ad, n)}" data-takim="${esc(s.ad)}" data-sira="${s.sira}" data-vp="${s.toplam}" data-puan="${s.puan}">
      ${siraRozeti(s.sira)}<div class="ad"><strong>${esc(s.ad)}</strong>${alt}</div>
      <div class="f-sayi"><strong>${s.toplam}</strong><small>VP</small></div><span class="f-cip">+${s.puan}</span></a>`;
  }).join('');
  return `${haftaSecici(n, rota)}${haftaCipleri(n, rota)}
    <div class="kart"><div class="baslik-satir"><h2>VP sıralaması · kazanılan puan</h2>${paylasDugmeleri('tbl-hafta', n)}</div>${satirlar}</div>`;
}

function genelEkran() {
  const haftalar = haftaListesi();
  const klasman = klasmanHesapla(haftalar);
  const onceki = haftalar.length > 1 ? klasmanHesapla(haftalar.slice(0, -1)) : null;
  const oncekiSira = new Map(onceki?.map(s => [s.ad, s.sira]) ?? []);
  const satirlar = klasman.map((s, i) => {
    const fark = oncekiSira.has(s.ad) ? oncekiSira.get(s.ad) - s.sira : 0;
    const degisim = fark > 0 ? `<span class="degisim yukari">▲${fark}</span>` : fark < 0 ? `<span class="degisim asagi">▼${-fark}</span>` : '';
    // Toplam VP sadece puan eşitliğinde (sırayı o belirlediği için) gösterilir
    const puanEsitligi = [klasman[i - 1], klasman[i + 1]].some(k => k && k.puan === s.puan);
    return `<a class="f-satir ${benimMi(s.ad)}" href="${takimLinki(s.ad, acilisHaftasi(sonHafta()))}" data-takim="${esc(s.ad)}" data-sira="${s.sira}" data-puan="${s.puan}" data-vp="${s.vp}">
      ${siraRozeti(s.sira)}<div class="ad"><strong>${esc(s.ad)} ${degisim}</strong>${s.sahibi ? `<small>${esc(s.sahibi)}</small>` : ''}${puanEsitligi ? `<small>Eşitlik: toplam ${s.vp} VP</small>` : ''}</div>
      <div class="f-sayi"><strong>${s.puan}</strong><small>puan</small></div></a>`;
  }).join('');
  const ilk = fHafta(haftalar[0]?.hafta);
  const son = fHafta(haftalar.at(-1)?.hafta);
  const aralik = !haftalar.length ? '' : ilk === son ? `${ilk}. hafta` : `${ilk}–${son}. haftalar`;
  return `<div class="kart"><div class="baslik-satir"><h2>Genel klasman <span class="soluk kucuk">${aralik}</span></h2>${paylasDugmeleri('tbl-genel')}</div>
    <p class="soluk kucuk" style="margin-top:0">Haftalık puanların toplamı. Eşit puanda toplam VP yüksek olan üstte.</p>${satirlar}</div>`;
}

function oyuncuSatiri(o) {
  let durum;
  if (o.eslesmedi) durum = "TBF'de bulunamadı";
  else if (o.macDurumu === 'bay') durum = 'Takımı bay';
  else if (o.macDurumu === 'oynanmadi') durum = o.mac ? tarihSaat(o.mac.tarih) : 'Maç yok';
  else if (o.saniye === 0) durum = o.macDurumu === 'canli' ? 'Henüz süre almadı' : 'Süre almadı';
  else durum = `${dakika(o.saniye)} dk`;
  if (o.macDurumu === 'canli' && o.mac?.canliDurum) durum += ` · ${canliYazisi(o.mac)}`;
  let etiket = '';
  if (o.rol === 'as' && !o.sayildi) etiket = `<span class="etiket cikti">yerine ${esc(o.yerineGiren)}</span>`;
  if (o.rol === 'yedek' && o.sayildi) etiket = `<span class="etiket girdi">${esc(o.yerineGirdigi)} yerine</span>`;
  if (o.macDurumu === 'canli') etiket += '<span class="etiket canli-e">canlı</span>';
  const takim = o.tblTakim ? `${esc(baslik(o.tblTakim))} · ` : '';
  const ic = `<div class="ad"><strong>${esc(o.ad)}${etiket}</strong><small>${takim}${durum}</small></div>
    <div class="f-sayi"><strong>${o.vp}</strong><small>VP</small></div>`;
  return o.id ? `<a class="f-satir ${o.sayildi ? '' : 'sayilmadi'}" href="#/oyuncu/tbl/${o.id}" data-oyuncu="${o.id}" data-sayildi="${o.sayildi}">${ic}</a>`
    : `<div class="f-satir ${o.sayildi ? '' : 'sayilmadi'}">${ic}</div>`;
}

function takimEkrani(ad, n, kendi) {
  const takim = kadroBul(n).find(t => t.ad === ad);
  if (!takim) return '<p class="bos">Takım bulunamadı.</p>';
  const sonuc = takimHaftaPuani(takim, V.haftalar.get(n));
  const siradaki = !V.index.haftalar.includes(n);
  const sira = siradaki ? null : haftaSirasi(n).find(s => s.ad === ad);
  const genel = klasmanHesapla(haftaListesi()).find(s => s.ad === ad);
  const rota = kendi ? `${KOK}/takimim` : `${KOK}/takim/${encodeURIComponent(ad)}`;
  const gecmis = (genel?.haftalar ?? []).slice().reverse().map(h => `
    <a class="f-satir" href="${rota}/${h.hafta}"><div class="ad"><strong>${fHafta(h.hafta)}. Hafta</strong><small>${h.vp} VP</small></div>
      <div class="f-sayi"><strong>${h.sira}.</strong><small>sıra</small></div><span class="f-cip">+${h.puan}</span></a>`).join('');
  const ust = kendi ? `<a class="geri" href="${KOK}/secim">Takım değiştir</a>` : `<a class="geri" href="${KOK}/hafta/${n}">‹ ${fHafta(n)}. hafta sıralaması</a>`;
  return `${ust}<div class="kart sayfa-baslik"><h1>${esc(sonuc.ad)}</h1>${sonuc.sahibi ? `<p class="soluk" style="margin:0 0 10px">${esc(sonuc.sahibi)}</p>` : ''}
      <div class="istatistik"><div><b>${siradaki ? '–' : sonuc.toplam}</b><span>Hafta VP</span></div><div><b>${siradaki ? '–' : `${sira.sira}.`}</b><span>Hafta sırası</span></div>
        <div><b>${genel ? `${genel.sira}.` : '–'}</b><span>Genel${genel ? ` (${genel.puan} p)` : ''}</span></div></div></div>
    ${haftaSecici(n, rota)}
    <div class="kart"><h3>As kadro</h3>${sonuc.aslar.map(oyuncuSatiri).join('')}</div>
    <div class="kart"><h3>Yedekler</h3>${sonuc.yedekler.map(oyuncuSatiri).join('')}</div>
    ${gecmis ? `<div class="kart"><h3>Haftalar</h3>${gecmis}</div>` : ''}`;
}

const SIRALAMALAR = {
  vp: { ad: 'VP ort.', fn: (a, b) => b.vpOrt - a.vpOrt },
  hafta: { ad: 'Bu hafta', fn: (a, b) => (b.buHafta ?? -99) - (a.buHafta ?? -99) },
  sayi: { ad: 'Sayı ort.', fn: (a, b) => b.sayiOrt - a.sayiOrt },
};
function bostakilerEkrani(anahtar) {
  const siralama = SIRALAMALAR[anahtar] ? anahtar : 'vp';
  const sahipli = new Set(sonKadro().flatMap(t => [...t.as, ...t.yedek]).map(o => o.id).filter(Boolean));
  const hafta = V.haftalar.get(sonHafta());
  const q = aramaNorm(UI.ara.trim());
  const liste = Object.entries(V.rehber).filter(([id, o]) => o.aktif && !sahipli.has(id))
    .map(([id, o]) => ({ id, ...o, buHafta: hafta.oyuncular[id]?.vp ?? null }))
    .filter(o => !q || aramaNorm(`${o.ad} ${o.takim}`).includes(q)).sort(SIRALAMALAR[siralama].fn);
  return `<p class="soluk kucuk" style="margin-top:0">Hiçbir fantezi takımında olmayan TBL oyuncuları. Transfer için lig yöneticisine bildir.</p>
    <input type="search" id="f-ara" data-fantezi-ara placeholder="Oyuncu ya da TBL takımı ara" value="${esc(UI.ara)}" style="margin-bottom:10px">
    <div class="secenekler">${Object.entries(SIRALAMALAR).map(([k, s]) => `<a class="secenek ${k === siralama ? 'aktif' : ''}" href="${KOK}/bostakiler/${k}">${s.ad}</a>`).join('')}</div>
    <div class="kart">${liste.map(o => `<a class="f-satir" href="#/oyuncu/tbl/${o.id}">
      <div class="ad"><strong>${esc(o.ad)}</strong><small>${esc(baslik(o.takim))} · ${o.mac} maç · ${o.sayiOrt} sayı</small></div>
      <div class="f-sayi ikincil"><strong>${o.buHafta ?? '–'}</strong><small>bu hafta</small></div>
      <div class="f-sayi"><strong>${o.vpOrt}</strong><small>VP ort.</small></div></a>`).join('') || '<p class="bos">Oyuncu bulunamadı.</p>'}</div>`;
}

// ---------- Paylaşım görseli ----------
function gorselVerisi(tur, n) {
  if (tur === 'tbl-genel') {
    const haftalar = haftaListesi();
    const klasman = klasmanHesapla(haftalar);
    const ilk = fHafta(haftalar[0].hafta);
    const son = fHafta(haftalar.at(-1).hafta);
    return {
      dosyaAdi: 'pota-alti-genel-klasman.png',
      bilgi: {
        baslik: V.ayarlar.ligAdi, altBaslik: `Genel Klasman · ${ilk === son ? `${ilk}. hafta` : `${ilk}–${son}. haftalar`}`, sutunlar: ['Puan'],
        satirlar: klasman.map((s, i) => ({ sira: s.sira, ad: s.ad, degerler: [s.puan], not: [klasman[i - 1], klasman[i + 1]].some(k => k && k.puan === s.puan) ? `Eşitlik: toplam ${s.vp} VP` : '' })),
      },
    };
  }
  const d = haftaDurumu(V.haftalar.get(n));
  return {
    dosyaAdi: `pota-alti-${fHafta(n)}-hafta.png`,
    bilgi: {
      baslik: V.ayarlar.ligAdi, altBaslik: `${fHafta(n)}. Hafta · ${d.tamamlandi ? 'Kesin sonuç' : `Ara sonuç (${d.bitti}/${d.toplam} maç bitti)`}`, sutunlar: ['VP', 'Puan'],
      satirlar: haftaSirasi(n).map(s => ({
        sira: s.sira, ad: s.ad, degerler: [s.toplam, `+${s.puan}`],
        not: s.vpEsitligi ? (s.enIyiTurk ? `Eşitlik: ${s.enIyiTurk.ad} ${s.enIyiTurk.vp} VP` : 'Eşitlik: Türk oyuncu yok') : '',
      })),
    },
  };
}
export function paylas(dugme, tur, n, indir) {
  return gorseliPaylas(dugme, `${tur}-${n}`, () => gorselVerisi(tur, Number(n)), indir);
}

// ---------- Yönlendirme: #/fantezi/tbl/<sekme>/<a>/<b> ----------
export function gorunum([sekme = '', a, b]) {
  if (!V.yuklendi) {
    yukle();
    return V.hata ? `<div class="kart"><p class="bos">TBL Fantezi verileri yüklenemedi: ${esc(V.hata)}</p></div>` : '<p class="bos">Yükleniyor…</p>';
  }
  if (sekme === 'sec' && a) {
    takimSec(a);
    location.replace(`${KOK}/takimim`);
    return '';
  }
  const secimGecerli = sonKadro().some(t => t.ad === seciliTakim);
  if (sekme === 'genel') return sekmeler('genel') + genelEkran();
  if (sekme === 'hafta') return sekmeler('hafta') + haftalikEkran(gecerliHafta(Number(a)));
  if (sekme === 'takim') return sekmeler('') + takimEkrani(a ?? '', gecerliHafta(Number(b)), false);
  if (sekme === 'bostakiler') return sekmeler('bostakiler') + bostakilerEkrani(a);
  if (sekme === 'secim' || (sekme === 'takimim' && !secimGecerli)) return sekmeler('takimim') + secimEkrani();
  if (sekme === 'takimim') return sekmeler('takimim') + takimEkrani(seciliTakim, gecerliHafta(Number(a)), true);
  // Bölümün girişi: takım seçildiyse Takımım, seçilmediyse haftalık sıralama
  return secimGecerli ? sekmeler('takimim') + takimEkrani(seciliTakim, gecerliHafta(NaN), true) : sekmeler('hafta') + haftalikEkran(gecerliHafta(NaN));
}

export function araGuncelle(deger) { UI.ara = deger; }

// Ana sayfadaki özet: genel klasmanın ilk 5'i
export function ozet() {
  if (!V.yuklendi) { yukle(); return ''; }
  const klasman = klasmanHesapla(haftaListesi()).slice(0, 5);
  return `<div class="kart"><div class="baslik-satir"><h2>TBL Fantezi · genel klasman</h2><a href="${KOK}/genel">Tümü ›</a></div>
    ${klasman.map(s => `<a class="f-satir ${benimMi(s.ad)}" href="${takimLinki(s.ad, acilisHaftasi(sonHafta()))}">${siraRozeti(s.sira)}
      <div class="ad"><strong>${esc(s.ad)}</strong></div><div class="f-sayi"><strong>${s.puan}</strong><small>puan</small></div></a>`).join('')}</div>`;
}
