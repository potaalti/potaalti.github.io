// Pota Altı App: TBL ve BSL için canlı skor, kutu skor, puan tablosu, istatistik liderleri, takım ve oyuncu sayfaları.
// Canlı veriler (maç listeleri, kutu skorlar) TBL Fantezi Ligi sitesinin yayınladığı dosyalardan okunur; puan tablosu,
// liderler ve sezon istatistikleri veri/uret.py'nin ürettiği site/data dosyalarındandır.

import {
  KAYNAK, esc, sayi, isaretli, aramaNorm, baslik, gunBasligi, saatYazisi, tarihSaat, sureSn, getir, canliYazisi,
} from './ortak.js';
import * as Yayin from './yayin.js';
import * as AE from './fantezi/artieksi.js';
import * as SY from './seyirci.js';
import * as OD from './odul.js';
import * as ME from './mac-ek.js';

const YEREL = ['localhost', '127.0.0.1'].includes(location.hostname);
// Sıra önemli: BSL üst lig olduğu için her yerde (menü, fikstür, seçiciler) önce gelir ve varsayılan ligdir
const LIGLER = { bsl: { kisa: 'BSL', ad: 'Basketbol Süper Ligi' }, tbl: { kisa: 'TBL', ad: 'Türkiye Basketbol Ligi' } };

const S = {
  meta: null, index: null, hata: null,
  tablo: {}, liderler: {}, takimIst: {}, ileriIst: {}, oyuncular: {}, takimlar: {}, oyuncu: {}, artieksi: {}, seyirci: {}, odul: {}, // lig -> veri (oyuncu: lig -> id -> detay)
  maclar: {}, // `${lig}-${hafta}` -> maç listesi
  kutular: {}, // maç id -> kutu skor (null: yok)
  farklar: {}, // maç id -> skor farkı grafiği verisi (biten maçlar, null: yok)
  ui: { ara: '', oyuncuSirala: 'vp', liderKategori: {}, anaLig: anaLigOku() },
};
// Telefon ve bilgisayar ayrı düzen: telefonda ana sayfa tek lig gösterir (BSL | TBL seçici), bilgisayarda yan menü ve iki sütun
const TELEFON = matchMedia('(max-width: 759px)');
function anaLigOku() {
  try { return localStorage.getItem('anaLig') === 'tbl' ? 'tbl' : 'bsl'; } catch { return 'bsl'; }
}
const yukleniyor = new Set();

// ---------- Yardımcılar ----------
const $ = s => document.querySelector(s);
const yuzde = ([b, d]) => (d ? `%${Math.round((b / d) * 100)}` : '–');
const kazananSinifi = (m, taraf) => {
  if (m.durum !== 'bitti') return '';
  const ev = Number(m.evSkor);
  const dep = Number(m.depSkor);
  return (taraf === 'ev' ? ev > dep : dep > ev) ? 'kazanan' : '';
};
// Takım adı -> kimlik (veri/uret.py'deki anahtar() ile aynı)
const takimAnahtari = ad => String(ad).replace(/İ/g, 'I').replace(/ı/g, 'i').toLowerCase().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const takimAdi = (lig, id) => baslik(S.tablo[lig]?.find(t => t.id === id)?.ad ?? id);
const takimLinki = (lig, ad) => `<a href="#/takim/${lig}/${takimAnahtari(ad)}">${esc(baslik(ad))}</a>`;


// Kaynakta saati belli olmayan ileri tarihli maçlar skorsuz "canli" gelebiliyor: oynanmadı sayılır
const durumDuzelt = m => (m.durum === 'canli' && m.evSkor == null && new Date(m.tarih).getTime() > Date.now() + 6 * 3600000 ? { ...m, durum: 'oynanmadi' } : m);
const listeDuzelt = v => (v?.maclar ? { ...v, maclar: v.maclar.map(durumDuzelt) } : v);

// Bir kez yüklenen veri: hedef[anahtar] doldurulur, bitince sayfa yeniden çizilir
function yukle(hedef, anahtar, url, { bosDeger = null, donustur = v => v } = {}) {
  const k = `${url}`;
  if (hedef[anahtar] !== undefined || yukleniyor.has(k)) return;
  yukleniyor.add(k);
  getir(url).then(v => { hedef[anahtar] = donustur(v); }).catch(() => { hedef[anahtar] = bosDeger; })
    .finally(() => { yukleniyor.delete(k); ciz(); });
}
const takimIstatistigi = (lig, id) => { yukle(S.takimIst, lig, `data/${lig}/takim-istatistik.json`, { bosDeger: {} }); return S.takimIst[lig]?.[id]; };
// Biten maçların gelişmiş takım istatistikleri (FIBA, veri/uret.py); canlı maçta kutu skorun içinde gelir (takım.ileri)
const ileriIstatistigi = (lig, id) => { yukle(S.ileriIst, lig, `data/${lig}/ileri-istatistik.json`, { bosDeger: {} }); return S.ileriIst[lig]?.[id]; };
const ligVerisi = (lig, ad) => { yukle(S[ad], lig, `data/${lig}/${ad}.json`); return S[ad][lig]; };
const macListesi = (lig, h) => { yukle(S.maclar, `${lig}-${h}`, `${KAYNAK}/maclar/${lig}-${h}.json`, { donustur: listeDuzelt }); return S.maclar[`${lig}-${h}`]?.maclar; };

// Ligin gösterilecek haftası: güncel hafta bittiyse sıradaki haftanın ilk maçına 2 gün kala sıradaki hafta, yoksa güncel hafta
function varsayilanHafta(lig) {
  const b = S.index?.maclar?.[lig];
  if (!b) return S.meta?.ligler?.[lig]?.guncel ?? 1;
  if (!b.siradaki || !b.guncelBitti) return b.guncel;
  const ilk = (S.index.macSaatleri ?? []).filter(m => m.lig === lig && !m.bitti).map(m => new Date(m.tarih).getTime()).sort((x, y) => x - y)[0];
  const gecis = ilk ? ilk - 2 * 86400000 : new Date(b.siradaki.gosterim).getTime();
  return Date.now() >= gecis ? b.siradaki.hafta : b.guncel;
}

// ---------- Menü ----------
const MENU = [['', 'Ana Sayfa', '🏠'], ['maclar', 'Maçlar', '📅'], ['lig/bsl', 'BSL', '🏆'], ['lig/tbl', 'TBL', '🏀'], ['fantezi', 'Fantezi', '⭐'], ['yayin', 'Yayın', '▶️']];
function rota() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}
function aktifMenu() {
  const [s, lig] = rota();
  if (!s) return '';
  if (s === 'maclar' || s === 'mac') return 'maclar';
  if (['lig', 'takim', 'oyuncu'].includes(s)) return `lig/${lig}`;
  return s;
}
function menuCiz() {
  const aktif = aktifMenu();
  $('#menu').innerHTML = MENU.map(([y, ad, ikon]) => `<a href="#/${y}" class="${y === aktif ? 'aktif' : ''}"><span class="ikon">${ikon}</span><span>${ad}</span></a>`).join('');
  $('#alt-menu').innerHTML = MENU.map(([y, ad, ikon]) => `<a href="#/${y}" class="${y === aktif ? 'aktif' : ''}"><span class="ikon">${ikon}</span><span>${ad}</span></a>`).join('');
}

// ---------- Çizim ----------
function ciz() {
  menuCiz();
  const odak = document.activeElement?.id;
  const secim = odak && document.activeElement.selectionStart;
  $('#icerik').innerHTML = gorunum();
  if (odak && document.getElementById(odak)) {
    const el = document.getElementById(odak);
    el.focus();
    try { el.setSelectionRange(secim, secim); } catch { /* arama dışı */ }
  }
}

function gorunum() {
  if (S.hata) return `<div class="kart"><p class="bos">${esc(S.hata)}</p></div>`;
  if (!S.meta) return '<p class="bos">Yükleniyor…</p>';
  const [s, a, b] = rota();
  const lig = LIGLER[a] ? a : 'bsl';
  switch (s) {
    case undefined: return gorunumAna();
    case 'maclar': return `<div class="dar">${gorunumMaclar(LIGLER[a] ? a : null, Number(b) || null)}</div>`;
    case 'mac': return `<div class="dar">${gorunumMac(lig, Number(b))}</div>`;
    case 'lig': return gorunumLig(lig, b ?? 'tablo', rota()[3]);
    case 'takim': return `<div class="dar">${gorunumTakim(lig, b)}</div>`;
    case 'oyuncu': return `<div class="dar">${gorunumOyuncu(lig, b)}</div>`;
    case 'yayin': return `<div class="dar">${Yayin.gorunum(a)}</div>`;
    case 'fantezi':
      if (a === 'tbl') { location.replace('tbl/'); return ''; } // eski adres: TBL Fantezi artık kendi sayfasında
      return `<div class="dar">${gorunumFantezi()}</div>`;
    default: return gorunumAna();
  }
}

// ---------- Maçlar ----------

function macSatiri(lig, m) {
  const orta = m.durum === 'oynanmadi'
    ? `<strong>${saatYazisi(m.tarih)}</strong>${m.yayin ? `<small>${esc(m.yayin)}</small>` : ''}`
    : `<strong>${m.evSkor ?? 0} - ${m.depSkor ?? 0}</strong><small>${m.durum === 'canli' ? `<span class="canli-yazi">${canliYazisi(m)}</span>` : 'MS'}</small>`;
  return `<a class="mac" href="#/mac/${lig}/${m.id}">
    <span class="${kazananSinifi(m, 'ev')}">${esc(baslik(m.ev))}</span><span class="skor">${orta}</span>
    <span class="dep ${kazananSinifi(m, 'dep')}">${esc(baslik(m.dep))}</span></a>`;
}

function gunlereGore(lig, maclar) {
  const gunler = new Map();
  for (const m of [...maclar].sort((x, y) => x.tarih.localeCompare(y.tarih))) {
    const g = m.tarih.slice(0, 10);
    gunler.set(g, [...(gunler.get(g) ?? []), m]);
  }
  return [...gunler.values()].map(g => `<section class="kart mac-gun"><h3>${gunBasligi(g[0].tarih)}</h3>${g.map(m => macSatiri(lig, m)).join('')}</section>`).join('');
}

function haftaDurumu(maclar) {
  const bitti = maclar.filter(m => m.durum === 'bitti').length;
  if (!maclar.length) return 'Fikstür belli değil';
  if (bitti === maclar.length) return 'Tamamlandı';
  return `${bitti}/${maclar.length} maç bitti${maclar.some(m => m.durum === 'canli') ? ' · canlı maç var' : ''}`;
}

function gorunumMaclar(istenenLig, istenenHafta) {
  const lig = istenenLig ?? (S.ui.sonLig || 'bsl');
  S.ui.sonLig = lig;
  const haftalar = S.index?.maclar?.[lig]?.haftalar ?? S.meta.ligler[lig].haftalar;
  const n = haftalar.includes(istenenHafta) ? istenenHafta : varsayilanHafta(lig);
  const ligSec = `<div class="secenekler">${Object.entries(LIGLER).map(([l, b]) => `<a class="secenek ${l === lig ? 'aktif' : ''}" href="#/maclar/${l}">${b.kisa}</a>`).join('')}</div>`;
  const i = haftalar.indexOf(n);
  const ok = (h, isaret) => (h === undefined ? `<span>${isaret}</span>` : `<a href="#/maclar/${lig}/${h}" aria-label="${h}. hafta">${isaret}</a>`);
  const maclar = macListesi(lig, n);
  return `${ligSec}<div class="hafta-secici">${ok(haftalar[i - 1], '‹')}
      <div class="baslik"><strong>${LIGLER[lig].kisa} ${n}. Hafta</strong><small>${maclar ? haftaDurumu(maclar) : 'Yükleniyor…'}</small></div>${ok(haftalar[i + 1], '›')}</div>
    ${!maclar ? '<p class="bos">Yükleniyor…</p>' : maclar.length ? gunlereGore(lig, maclar) : '<p class="bos">Bu haftanın maçları henüz belli değil.</p>'}
    ${maclar?.length ? bayYazisi(lig, maclar) : ''}
    <p class="soluk kucuk">Maça dokununca kutu skor açılır. Maç saatlerinde skorlar dakikada bir yenilenir.</p>`;
}

// Haftanın maçında olmayan takım(lar): ligin puan tablosundaki takımlardan
function bayYazisi(lig, maclar) {
  const tablo = ligVerisi(lig, 'tablo');
  if (!tablo) return '';
  const oynayan = new Set(maclar.flatMap(m => [m.ev, m.dep]));
  const bay = tablo.filter(s => !oynayan.has(s.ad)).map(s => esc(baslik(s.ad)));
  return bay.length ? `<p class="bay-yazisi">Bay: ${bay.join(', ')}</p>` : '';
}

// ---------- Maç sayfası (kutu skor) ----------
// Kutu skor, çeyrekler, grafik ve gelişmiş istatistikler ortak site/mac-ek.js'te (Fantezi Lig arayüzüyle aynı olsun diye)
// Fantezi ligine giriş yapılmışsa (bu tarayıcıda) benim takımımın oyuncuları: { ad, oyuncular: Set }
function takimim(lig) {
  try {
    const t = JSON.parse(localStorage.getItem(`potaAltiTakimim-${lig}`) ?? 'null');
    return t && { ad: t.ad, oyuncular: new Set(t.oyuncular.map(String)) };
  } catch { return null; }
}

function macBul(lig, id) {
  for (const [k, v] of Object.entries(S.maclar)) {
    if (!k.startsWith(`${lig}-`)) continue;
    const m = v?.maclar?.find(x => x.id === id);
    if (m) return m;
  }
  return null;
}

function gorunumMac(lig, id) {
  yukle(S.kutular, id, `${KAYNAK}/mac/${id}.json`);
  const kutu = S.kutular[id];
  // Sayfa doğrudan maçta açıldıysa (yenileme) haftanın listesi henüz yüklenmemiştir: kutu skordaki haftadan yüklenir;
  // canlı maçın çeyreği/kalan süresi ve dakikalık yenileme bu listeden gelir
  const liste = macBul(lig, id) ?? (kutu?.hafta ? macListesi(lig, kutu.hafta)?.find(x => x.id === id) ?? null : null);
  if (!liste && kutu === undefined) return '<p class="bos">Yükleniyor…</p>';
  if (!liste && !kutu) return '<p class="bos">Maç bulunamadı.</p>';
  // Maç listesi (dakikada bir yenilenir) canlıyken kutu skordan daha güncel olabilir
  const m = liste ?? { id, hafta: kutu.hafta, tarih: kutu.tarih, durum: kutu.durum, ev: kutu.ev.ad, dep: kutu.dep.ad, evSkor: kutu.evSkor, depSkor: kutu.depSkor, salon: kutu.salon, yayin: kutu.yayin };
  const hafta = m.hafta ?? kutu?.hafta;
  const durum = m.durum === 'canli' ? `<span class="canli-yazi">${canliYazisi(m)}</span>` : m.durum === 'bitti' ? 'Maç sonu' : saatYazisi(m.tarih);
  const bilgi = [gunBasligi(m.tarih), m.salon, m.yayin].filter(Boolean).map(esc).join(' · ');
  const ust = `<a class="geri" href="#/maclar/${lig}/${hafta}">‹ ${LIGLER[lig].kisa} ${hafta}. hafta maçları</a>
    <div class="kart mac-baslik"><div class="mac-takimlar">
      <a class="${kazananSinifi(m, 'ev')}" href="#/takim/${lig}/${takimAnahtari(m.ev)}">${esc(baslik(m.ev))}</a>
      <div class="mac-skor"><strong>${m.durum === 'oynanmadi' ? '–' : `${m.evSkor ?? 0} - ${m.depSkor ?? 0}`}</strong><small>${durum}</small></div>
      <a class="${kazananSinifi(m, 'dep')}" href="#/takim/${lig}/${takimAnahtari(m.dep)}">${esc(baslik(m.dep))}</a></div>
      <p class="soluk kucuk" style="margin:10px 0 0;text-align:center"><span class="lig-etiket">${LIGLER[lig].kisa}</span> ${hafta}. hafta · ${bilgi}</p></div>`;
  if (!kutu) return `${ust}<p class="bos">${m.durum === 'oynanmadi' ? 'Maç henüz oynanmadı.' : kutu === null ? 'Kutu skor henüz gelmedi.' : 'Yükleniyor…'}</p>`;
  // Maç bitince (TBF kesinleştirmeden önceki "Maç sonu · kesinleşiyor" dahil) sahada işareti kalkar
  const canli = m.durum === 'canli' && !canliYazisi(m).startsWith('Maç sonu');
  // Takım satırı canlıda kutu skorun içinden, biten maçta TBF'nin takım istatistiğinden; grafik canlıda kutudan, biten maçta
  // ayrı dosyadan (FARK_ILK_HAFTA'dan itibaren). Gövde Fantezi Lig arayüzüyle ortak (mac-ek.js).
  if (!kutu.fark && ME.farkVarMi(lig, kutu.hafta ?? hafta)) yukle(S.farklar, id, `data/${lig}/fark/${id}.json`);
  const benim = takimim(lig);
  return `${ust}${ME.macGovdesi(kutu, {
    canli, sirala: S.ui.kutuSirala, takimIst: takimIstatistigi(lig, kutu.id),
    ileriDosya: kutu.ev.ileri ? null : ileriIstatistigi(lig, kutu.id), fark: S.farklar[id],
    takimBasligi: t => takimLinki(lig, t.ad),
    oyuncuAdi: o => (String(o.id).startsWith('fiba-') ? esc(o.ad) : `<a href="#/oyuncu/${lig}/${o.id}" class="oyuncu-link">${esc(o.ad)}</a>`),
    benimMi: pid => !!benim?.oyuncular.has(pid),
  })}`;
}

// ---------- Lig: puan tablosu, liderler, takımlar, oyuncular ----------
const SEKMELER = [['tablo', 'Puan Tablosu'], ['liderler', 'Liderler'], ['takimlar', 'Takımlar'], ['oyuncular', 'Oyuncular']];
// +/-, Seyirci ve Ödüller sekmeleri herkese açık (kullanıcı kararı 2026-11-08); yönetici sadece ödül üreticisi (?uret) için gerekir
const yoneticiMi = () => { try { return localStorage.getItem('potaAltiYonetici') === '1'; } catch { return false; } };

// Fantezi uygulaması o anahtarı yazar; yazılmamışsa (fantezi bu tarayıcıda yeni sürümle henüz açılmadı) Firebase'in
// bu tarayıcıda sakladığı Google oturumundan bakılır: uyeler/{uid} 'admin' ya da yönetici takımı ise anahtar yazılır.
// Oturumu olmayan ziyaretçide hiçbir istek yapılmaz; sonuç oturum boyunca bir kez aranır.
async function fanteziOturumu(apiKey) {
  if (indexedDB.databases && !(await indexedDB.databases()).some(d => d.name === 'firebaseLocalStorageDb')) return null;
  const db = await new Promise((ok, hata) => {
    const r = indexedDB.open('firebaseLocalStorageDb');
    r.onupgradeneeded = () => r.transaction.abort(); // yoksa boş veritabanı oluşturma
    r.onsuccess = () => ok(r.result);
    r.onerror = () => hata(r.error);
  });
  try {
    const kayit = await new Promise((ok, hata) => {
      const r = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').get(`firebase:authUser:${apiKey}:[DEFAULT]`);
      r.onsuccess = () => ok(r.result?.value);
      r.onerror = () => hata(r.error);
    });
    return kayit && !kayit.isAnonymous ? kayit : null;
  } finally { db.close(); }
}
async function yoneticiyiTani() {
  try {
    if (yoneticiMi() || sessionStorage.getItem('potaAltiYoneticiBakildi')) return;
    sessionStorage.setItem('potaAltiYoneticiBakildi', '1');
    const { firebaseConfig: fb } = await import('./tbl/config.js');
    const u = await fanteziOturumu(fb.apiKey);
    if (!u) return;
    let jeton = u.stsTokenManager?.accessToken;
    if (!jeton || (u.stsTokenManager.expirationTime ?? 0) < Date.now() + 60e3) {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${fb.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: u.stsTokenManager.refreshToken }),
      });
      jeton = (await r.json()).id_token;
    }
    const belge = (yol, yetki) => fetch(`https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/(default)/documents/${yol}`,
      yetki ? { headers: { Authorization: `Bearer ${jeton}` } } : {}).then(r => r.json());
    const takim = (await belge(`uyeler/${u.uid}`, true)).fields?.takim?.stringValue;
    if (!takim) return;
    const yoneticiTakimlar = (await belge('lig/ayar')).fields?.yoneticiTakimlar?.arrayValue?.values?.map(v => v.stringValue) ?? [];
    if (takim !== 'admin' && !yoneticiTakimlar.includes(takim)) return;
    localStorage.setItem('potaAltiYonetici', '1');
    ciz();
  } catch { /* gizli pencere ya da bağlantı yok: sekme görünmez */ }
}

function gorunumLig(lig, sekme, donem) {
  const sekmeListesi = [...SEKMELER, ['artieksi', '+/-'], ['seyirci', 'Seyirci'], ['odul', 'Ödüller']];
  const sekmeler = `<div class="secenekler">${sekmeListesi.map(([s, ad]) => `<a class="secenek ${s === sekme ? 'aktif' : ''}" href="#/lig/${lig}/${s}">${ad}</a>`).join('')}</div>`;
  const baslikHtml = `<div class="sayfa-baslik"><h1>${LIGLER[lig].ad}</h1><p class="soluk kucuk" style="margin:0 0 12px">2026-27 sezonu · ${LIGLER[lig].kisa}</p></div>`;
  let icerik;
  switch (sekme) {
    case 'liderler': icerik = liderlerKarti(lig); break;
    case 'takimlar': icerik = takimlarKarti(lig); break;
    case 'oyuncular': icerik = oyuncularKarti(lig); break;
    case 'artieksi': icerik = artieksiKarti(lig, donem); break;
    case 'seyirci': icerik = seyirciKarti(lig, donem); break;
    // Ödül üreticisi (görselleri hazırlama aracı) yalnızca yöneticiye
    case 'odul': icerik = new URLSearchParams(location.search).has('uret') && yoneticiMi() ? odulUretici(lig, donem) : odulKarti(lig, donem); break;
    default: icerik = tabloKarti(lig);
  }
  return `<div class="dar">${baslikHtml}${sekmeler}${icerik}${altBilgi()}</div>`;
}

// +/- liderleri (herkese açık): haftalık ya da sezon boyu +/- toplamı, ilk 10 (10. ile aynı +/- yapanlar da girer).
// Eşit +/-'de takımının skor farkı daha kötü olan üstte. Paylaş/İndir yayın şablonundaki görseli verir.
function artieksiListesi(d, donem) {
  const tum = (donem === 'sezon' ? d?.sezon : d?.haftalar?.[donem]) ?? [];
  const onuncu = tum[9];
  return (onuncu ? tum.filter((k, i) => i < 10 || k.pm === onuncu.pm) : tum).map((k, i) => ({ ...k, sira: i + 1 }));
}
function artieksiKarti(lig, istenen) {
  yukle(S.artieksi, lig, `${KAYNAK}/artieksi/${lig}.json`);
  const d = S.artieksi[lig];
  if (!d) return '<p class="bos">Yükleniyor…</p>';
  const haftalar = Object.keys(d.haftalar ?? {}).map(Number).sort((a, b) => a - b);
  const donem = istenen === 'sezon' ? 'sezon' : haftalar.includes(Number(istenen)) ? Number(istenen) : haftalar.at(-1) ?? 'sezon';
  const cipler = `<div class="secenekler">${['sezon', ...haftalar].map(k =>
    `<a class="secenek ${k === donem ? 'aktif' : ''}" href="#/lig/${lig}/artieksi/${k}">${k === 'sezon' ? 'Sezon' : `${k}. hafta`}</a>`).join('')}</div>`;
  const liste = artieksiListesi(d, donem);
  const satirlar = liste.map(k => `<div class="f-satir">
      <span class="f-sira ${k.sira <= 3 ? `s${k.sira}` : ''}">${k.sira}</span>
      <div class="ad"><strong>${esc(k.ad)}</strong><small>${esc(baslik(k.takim))}${donem === 'sezon' ? ` · ${k.mac} maç` : ''}</small></div>
      <div class="f-sayi"><strong>${isaretli(k.pm)}</strong><small>+/-</small></div></div>`).join('');
  const anahtar = `${lig}-${donem}`;
  return `${cipler}<div class="kart"><div class="baslik-satir"><h2>${donem === 'sezon' ? 'Sezon' : `${donem}. hafta`} · +/- ilk 10</h2>
    ${liste.length ? `<span class="satir"><button class="secenek" data-is="ae-paylas" data-id="${anahtar}">📤 Paylaş</button><button class="secenek" data-is="ae-indir" data-id="${anahtar}">⬇ İndir</button></span>` : ''}</div>
    ${satirlar || '<p class="bos">Henüz veri yok.</p>'}
    <p class="soluk kucuk" style="margin-bottom:0">Eşit +/-'de takımının skor farkı daha kötü olan üstte.</p></div>`;
}
async function artieksiGorseliniPaylas(anahtar, indir) {
  const [lig, donem] = anahtar.split('-');
  const satirlar = artieksiListesi(S.artieksi[lig], donem === 'sezon' ? 'sezon' : Number(donem)).map(AE.gorselSatiri);
  const blob = await AE.artieksiGorseli({ ...AE.gorselBasligi(lig, donem), satirlar });
  const dosya = new File([blob], `pota-alti-arti-eksi-${anahtar}.png`, { type: 'image/png' });
  if (!indir && navigator.canShare?.({ files: [dosya] })) {
    try { await navigator.share({ files: [dosya] }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(dosya);
  a.download = dosya.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// Seyirci sayıları (herkese açık): TBF'nin işlediği sayılar (veri/uret.py Cumartesi–Pazartesi çeker). Her hafta ayrı, en sonda
// iç saha ortalamaları; sayısı girilmemiş (0) maçlar ortalamaya katılmaz. Paylaş/İndir yayın şablonundaki görseli verir.
function seyirciVerisi(lig) {
  yukle(S.seyirci, lig, `data/${lig}/seyirci.json`, { bosDeger: { maclar: {} } });
  const t = ligVerisi(lig, 'takimlar');
  const d = S.seyirci[lig];
  if (!t || !d) return null;
  const ad = new Map(t.takimlar.map(x => [x.id, x.ad]));
  const maclar = t.maclar.filter(m => m.durum === 'bitti' && String(m.id) in d.maclar)
    .map(m => ({ ...m, evAd: ad.get(m.ev) ?? m.ev, depAd: ad.get(m.dep) ?? m.dep, seyirci: d.maclar[m.id] || 0 }));
  const haftalar = [...new Set(maclar.map(m => m.hafta))].sort((a, b) => a - b);
  return { maclar, haftalar, ad };
}
const seyirciHaftasi = (v, h) => v.maclar.filter(m => m.hafta === h).sort((a, b) => b.seyirci - a.seyirci);
function seyirciOrtalamasi(v) {
  const t = new Map();
  for (const m of v.maclar) {
    if (!m.seyirci) continue;
    const k = t.get(m.ev) ?? { id: m.ev, ad: m.evAd, mac: 0, toplam: 0 };
    k.mac++; k.toplam += m.seyirci;
    t.set(m.ev, k);
  }
  return [...t.values()].map(k => ({ ...k, ort: Math.round(k.toplam / k.mac * 10) / 10 })).sort((a, b) => b.ort - a.ort || b.toplam - a.toplam);
}
const binlik = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
function seyirciKarti(lig, istenen) {
  const v = seyirciVerisi(lig);
  if (!v) return '<p class="bos">Yükleniyor…</p>';
  if (!v.haftalar.length) return '<p class="bos">Henüz seyirci sayısı yok.</p>';
  const donem = istenen === 'ortalama' ? 'ortalama' : v.haftalar.includes(Number(istenen)) ? Number(istenen) : v.haftalar.at(-1);
  const cipler = `<div class="secenekler">${[...v.haftalar, 'ortalama'].map(k =>
    `<a class="secenek ${k === donem ? 'aktif' : ''}" href="#/lig/${lig}/seyirci/${k}">${k === 'ortalama' ? 'Ortalama' : `${k}. hafta`}</a>`).join('')}</div>`;
  const dugmeler = `<span class="satir"><button class="secenek" data-is="sy-paylas" data-id="${lig}-${donem}">📤 Paylaş</button><button class="secenek" data-is="sy-indir" data-id="${lig}-${donem}">⬇ İndir</button></span>`;
  if (donem === 'ortalama') {
    const liste = seyirciOrtalamasi(v);
    const satirlar = liste.map((k, i) => `<tr><td class="sayi"><span class="f-sira ${i < 3 ? `s${i + 1}` : ''}">${i + 1}</span></td><td><b>${esc(baslik(k.ad))}</b></td>
      <td class="sayi">${k.mac}</td><td class="sayi">${binlik(k.toplam)}</td><td class="sayi"><b>${binlik(k.ort)}</b></td></tr>`).join('');
    return `${cipler}<div class="kart"><div class="baslik-satir"><h2>İlk ${v.haftalar.at(-1)} hafta · seyirci ortalamaları</h2>${dugmeler}</div>
      <div class="tablo-kap"><table><thead><tr><th class="sayi">#</th><th>Takım</th><th class="sayi">İç saha</th><th class="sayi">Toplam</th><th class="sayi">Ortalama</th></tr></thead>
      <tbody>${satirlar}</tbody></table></div>
      <p class="soluk kucuk" style="margin-bottom:0">Seyirci sayısı girilmemiş maçlar ortalamaya katılmaz.</p></div>`;
  }
  const liste = seyirciHaftasi(v, donem);
  const dolu = liste.filter(m => m.seyirci);
  const toplam = dolu.reduce((t, m) => t + m.seyirci, 0);
  const satirlar = liste.map(m => `<div class="f-satir">
      <div class="ad"><strong>${esc(baslik(m.evAd))} <span class="soluk">${m.evSkor ?? ''}-${m.depSkor ?? ''}</span> ${esc(baslik(m.depAd))}</strong><small>${gunBasligi(m.tarih)}</small></div>
      <div class="f-sayi"><strong>${m.seyirci ? binlik(m.seyirci) : '–'}</strong><small>seyirci</small></div></div>`).join('');
  return `${cipler}<div class="kart"><div class="baslik-satir"><h2>${donem}. hafta · seyirci sayıları</h2>${dugmeler}</div>${satirlar}
    <p class="soluk kucuk" style="margin-bottom:0">Toplam ${binlik(toplam)} · maç başı ${dolu.length ? binlik(Math.round(toplam / dolu.length)) : '–'}.
    Sayılar TBF'nin sitesinden; federasyon maçtan sonraki gün işliyor, Cumartesi–Salı öğlen ve gece güncellenir.</p></div>`;
}
async function seyirciGorseliniPaylas(anahtar, indir) {
  const [lig, donem] = anahtar.split('-');
  const v = seyirciVerisi(lig);
  const blob = donem === 'ortalama'
    ? await SY.ortalamaGorseli({ lig, hafta: v.haftalar.at(-1), takimlar: seyirciOrtalamasi(v) })
    : await SY.haftaGorseli({ lig, hafta: Number(donem), maclar: seyirciHaftasi(v, Number(donem)).map(m => ({ ...m, ev: m.evAd, dep: m.depAd })) });
  const dosya = new File([blob], `pota-alti-seyirci-${anahtar}.png`, { type: 'image/png' });
  if (!indir && navigator.canShare?.({ files: [dosya] })) {
    try { await navigator.share({ files: [dosya] }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(dosya);
  a.download = dosya.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// Haftanın ödülleri (yönetici, TBL ve BSL): yönetici ödül listesini yapıştırır, oyuncular haftanın kutu skorlarından bulunur ve
// Pota Altı şablonlarında görseller hazırlanır (odul.js). Liste biçimi:
//   MVP: ÖMER YASİR 25-3-9-4          (YERLİ MVP, YABANCI MVP, KAYBEDEN YERLİ MVP, KAYBEDEN YABANCI MVP de olur)
//   -----                              (çizgiyle ayrılan 5'li gruplar sırasıyla; TBL: Yerli 5, Yabancı 5, Mansiyon I, Mansiyon II,
//                                       BSL: Altın 5, Gümüş 5, Bronz 5, Mansiyon 5)
//   Ömer Yasir Küçük 33
// BSL'de liste gelmez: oyuncular kurallara göre seçilir (bslListesi), liste aynı biçimde yazılır.
const TEKLI = { 'mvp': 'mvp', 'yerli mvp': 'yerli', 'kazanan yerli mvp': 'yerli', 'yabanci mvp': 'yabanci', 'kaybeden yerli mvp': 'kaybedenYerli', 'kaybeden yabanci mvp': 'kaybedenYabanci' };
const TEKLI_AD = { mvp: 'MVP', yerli: 'Yerli MVP', yabanci: 'Yabancı MVP', kaybedenYerli: 'Kaybeden Yerli MVP', kaybedenYabanci: 'Kaybeden Yabancı MVP' };
const BESLI = { tbl: ['yerli', 'yabanci', 'mansiyon1', 'mansiyon2'], bsl: ['altin', 'gumus', 'bronz', 'mansiyon'] };
const BESLI_AD = { yerli: 'Yerli 5', yabanci: 'Yabancı 5', mansiyon1: "Mansiyon 5'i – I", mansiyon2: "Mansiyon 5'i – II",
  altin: 'Altın 5', gumus: 'Gümüş 5', bronz: 'Bronz 5', mansiyon: 'Mansiyon 5' };
// Ödüller sayfasının ligi (sayfa adresinden) ve yayınlanan görsellerin klasörü
const OL = () => (rota()[1] === 'bsl' ? 'bsl' : 'tbl');
// BSL'de yerli MVP'nin takımı kazanmış olmalı ("Kazanan Yerli MVP"), MVP'nin de
const tekliAd = tur => (OL() === 'bsl' && tur === 'yerli' ? 'Kazanan Yerli MVP' : TEKLI_AD[tur]);
const tekliSart = tur => (OL() !== 'bsl' ? SART[tur] : tur === 'yerli' ? o => o.yerli && o.kazandi : tur === 'mvp' ? o => o.kazandi : SART[tur]);
const odulKok = () => (OL() === 'bsl' ? 'odul/gorsel/bsl' : 'odul/gorsel');
const kelimeler = s => aramaNorm(s).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);
const dosyaAnahtari = ad => aramaNorm(String(ad).replace(/İ/g, 'I')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const uzanti = url => (String(url).split('?')[0].match(/\.\w+$/)?.[0] ?? '.png').toLowerCase();

function odulListesiCoz(metin) {
  const tekli = [], gruplar = [[]];
  for (const ham of String(metin).split(/\r?\n/)) {
    const satir = ham.trim();
    if (!satir) continue;
    if (/^[-–—_ ]+$/.test(satir)) { if (gruplar.at(-1).length) gruplar.push([]); continue; }
    const iki = satir.indexOf(':');
    if (iki > 0) {
      const tur = TEKLI[kelimeler(satir.slice(0, iki)).join(' ')];
      if (tur) { tekli.push({ tur, sorgu: satir.slice(iki + 1).trim() }); continue; }
    }
    gruplar.at(-1).push(satir);
  }
  return { tekli, gruplar: gruplar.filter(g => g.length).slice(0, 4) };
}
// Haftanın oyuncuları: biten maçların kutu skorlarından, hafta toplamı (iki maç oynadıysa toplanır)
async function odulHaftasi(h) {
  const lig = OL(), k = `${lig}-hafta-${h}`;
  if (S.odul[k]) return S.odul[k];
  const [liste, ham, gorsel, elle, mevkiler] = await Promise.all([getir(`${KAYNAK}/maclar/${lig}-${h}.json`),
    getir(lig === 'bsl' ? 'bsl/data/oyuncular.json' : `${KAYNAK}/oyuncular.json`),
    getir(`data/${lig}/gorsel.json`).catch(() => ({ foto: {}, logo: {} })), getir('odul/foto/liste.json').catch(() => ({})),
    lig === 'bsl' ? getir('bsl/data/mevkiler.json').catch(() => ({})) : {}]);
  // Rehber: { id: { ad, takim, ulke, aktif } } (BSL'ninki liste)
  const rehber = Array.isArray(ham) ? Object.fromEntries(ham.map(o => [o.id, o])) : ham;
  // TBF fotoğrafı uygun olmayan oyuncular için yöneticinin gönderdiği fotoğraflar (odul/foto/, liste.json: { id: dosya })
  const foto = id => elle[id] ? `odul/foto/${elle[id]}` : gorsel.foto[id] ? `data/${lig}/foto/${id}${uzanti(gorsel.foto[id])}` : null;
  // Biten maçlar: TBF'nin kesinleştirdikleri ve son düdüğü çalmış ama TBF'nin henüz kesinleştirmediği ("Maç sonu · kesinleşiyor":
  // 4. çeyrek ya da uzatma 00:00, skor eşit değil) maçlar; kullanıcı 2026-11-09 kesinleşmeyi beklemeden hazırlanmasını istedi
  const bitti = m => m.durum === 'bitti' || (m.durum === 'canli' && (m.canliDurum?.periyot >= 4 || m.canliDurum?.uzatma)
    && m.canliDurum?.saat === '00:00' && Number(m.evSkor) !== Number(m.depSkor));
  const kutular = await Promise.all(liste.maclar.filter(bitti).map(m => getir(`${KAYNAK}/mac/${m.id}.json`)));
  const oy = new Map();
  for (const kutu of kutular) for (const [t, r] of [['ev', 'dep'], ['dep', 'ev']]) {
    const T = kutu[t], kazandi = Number(T.skor) > Number(kutu[r].skor);
    for (const o of T.oyuncular ?? []) {
      if (!sureSn(o.sure)) continue;
      const r = rehber[o.id];
      // Ön/Arka (BSL): yöneticinin mevki listesi (BSL Fantezi'deki), listede yoksa istatistik tahmini
      const e = oy.get(o.id) ?? { id: o.id, ad: r?.ad ?? o.ad, kutuAd: o.ad, takim: T.ad, kazandi, rehberde: !!r,
        yerli: typeof r?.turk === 'boolean' ? r.turk : ['TÜRKİYE', 'KKTC'].includes(r?.ulke), mevki: mevkiler[o.id] ?? r?.mevkiTahmini ?? null,
        astOrt: r?.astOrt ?? 0, ribOrt: r?.ribOrt ?? 0,
        sayi: 0, rib: 0, ast: 0, tc: 0, blk: 0, tk: 0, vp: 0, iki: [0, 0], uc: [0, 0], sa: [0, 0] };
      for (const a of ['sayi', 'rib', 'ast', 'tc', 'blk', 'tk', 'vp']) e[a] += Number(o[a]) || 0;
      for (const a of ['iki', 'uc', 'sa']) e[a] = [e[a][0] + (o[a]?.[0] ?? 0), e[a][1] + (o[a]?.[1] ?? 0)];
      e.foto = foto(o.id);
      e.elleFoto = !!elle[o.id];
      e.logo = gorsel.logo[T.ad] ? `data/${lig}/logo/${dosyaAnahtari(T.ad)}${uzanti(gorsel.logo[T.ad])}` : null;
      oy.set(o.id, e);
    }
  }
  // Takım arkadaşlarının fotoğrafları (forma rengi karşılaştırması için)
  const kadro = new Map();
  for (const [id, r] of Object.entries(rehber)) if (r.aktif !== false && foto(id)) kadro.set(r.takim, [...(kadro.get(r.takim) ?? []), { id, foto: foto(id) }]);
  const bitmeyen = liste.maclar.filter(m => !bitti(m)).length;
  return (S.odul[k] = { oyuncular: [...oy.values()], kadro, bitmeyen });
}
// BSL ödül seçimi (kullanıcının kuralları; sıralama VP, eşitlikte sayı; tekli ödülde VP eşitse ödül ikisine de):
//   MVP: takımı kazanan en yüksek VP · Kazanan Yerli MVP: takımı kazanan en iyi yerli · Kaybeden Yerli / Yabancı MVP: takımı kaybeden
//   en iyi yerli / yabancı (bir oyuncu tek bir tekli ödül alır; tekli ödül alan 5'lere de girebilir)
//   Altın, Gümüş, Bronz 5: kalanlardan en iyi 3 Arka + 2 Ön · Mansiyon 5: kalanlardan en iyi 5, hepsi aynı mevkiden olamaz
//   Bir 5'te aynı takımdan en fazla 2, dört 5'in toplamında en fazla 3 oyuncu (sıradaki takımı dolmamış oyuncu girer)
//   Görselde gerçek beşteki gibi dizilir: üst sırada Arkalar (1-2-3 numara: sezon asist ortalaması yüksekten düşüğe),
//   alt sırada Önler (4-5 numara: sezon ribaund ortalaması düşükten yükseğe); Mansiyon'da da önce Arkalar, sonra Önler
function bslListesi(oyuncular) {
  const sira = [...oyuncular].sort((a, b) => b.vp - a.vp || b.sayi - a.sayi);
  const notlar = [], verilen = new Set(), satirlar = [];
  for (const [etiket, sart] of [['MVP', o => o.kazandi], ['KAZANAN YERLİ MVP', o => o.yerli && o.kazandi],
    ['KAYBEDEN YERLİ MVP', o => o.yerli && !o.kazandi], ['KAYBEDEN YABANCI MVP', o => !o.yerli && !o.kazandi]]) {
    const o = sira.find(x => sart(x) && !verilen.has(x.id));
    if (!o) { notlar.push(`${etiket}: uygun oyuncu yok`); continue; }
    // Kullanıcı kuralı (2026-11-09): tekli ödülde VP'si eşit iki (ya da daha çok) oyuncu varsa ödül hepsine verilir, her birine
    // ayrı görsel hazırlanır (görselde "MVP 1 / MVP 2" yazmaz); sayı eşitliği bozmaz
    for (const x of sira.filter(y => sart(y) && !verilen.has(y.id) && y.vp === o.vp)) {
      verilen.add(x.id);
      satirlar.push(`${etiket}: ${x.ad} ${x.vp}`);
    }
  }
  const kalan = sira.filter(o => o.vp > 0);
  const al = o => kalan.splice(kalan.indexOf(o), 1)[0];
  const mevkisi = o => o.mevki ?? 'arka';
  const dizilis = g => [...g.filter(o => mevkisi(o) === 'arka').sort((a, b) => b.astOrt - a.astOrt),
    ...g.filter(o => mevkisi(o) !== 'arka').sort((a, b) => a.ribOrt - b.ribOrt)];
  const takimDolu = (secilen, o) => secilen.filter(x => x.takim === o.takim).length >= 2
    || [...gruplar.flat(), ...secilen].filter(x => x.takim === o.takim).length >= 3;
  const gruplar = [];
  for (let i = 0; i < 3; i++) {
    const secilen = [], kota = { arka: 3, on: 2 };
    for (const o of kalan) {
      if (secilen.length === 5) break;
      if (kota[mevkisi(o)] > 0 && !takimDolu(secilen, o)) { secilen.push(o); kota[mevkisi(o)]--; }
    }
    gruplar.push(dizilis(secilen.map(al)));
  }
  const mansiyon = [];
  for (const o of kalan) if (mansiyon.length < 5 && !takimDolu(mansiyon, o)) mansiyon.push(o);
  if (mansiyon.length === 5 && new Set(mansiyon.map(mevkisi)).size === 1) {
    const son = mansiyon.pop();
    const diger = kalan.find(o => mevkisi(o) !== mevkisi(son) && !takimDolu(mansiyon, o));
    mansiyon.push(diger ?? son);
  }
  gruplar.push(dizilis(mansiyon));
  for (const o of oyuncular) {
    const secildi = gruplar.flat().includes(o) || verilen.has(o.id);
    if (secildi && !o.rehberde) notlar.push(`${o.ad} (${baslik(o.takim)}): oyuncu listesinde yok, yerli/yabancı ve mevki bilinmiyor`);
    else if (secildi && !o.mevki && gruplar.flat().includes(o)) notlar.push(`${o.ad}: mevkisi bilinmiyor, Arka sayıldı`);
  }
  const metin = [...satirlar, '-----', gruplar.map(g => g.map(o => `${o.ad} ${o.vp}`).join('\n')).join('\n-\n')].join('\n');
  return { metin, notlar };
}
// Yazılan adı haftanın oyuncularında bulur: kelimeler adın kelimelerinin başı olmalı ("M. Baki Görür", "WATKINS");
// birden çok aday kalırsa ödülün şartı (yerli/yabancı, kaybeden) ve satırdaki verimlilik puanı ayırır.
function oyuncuBul(oyuncular, sorgu, sart) {
  const sayilar = (sorgu.match(/\d+/g) ?? []).map(Number);
  const q = kelimeler(sorgu.replace(/[\d-]+/g, ' '));
  if (!q.length) return { hata: 'ad yok' };
  const puanla = o => {
    const ad = [...new Set([...kelimeler(o.ad), ...kelimeler(o.kutuAd)])];
    const tutan = q.filter(k => ad.some(a => a.startsWith(k))).length;
    return q.filter(k => k.length > 2).some(k => ad.some(a => a.startsWith(k))) ? tutan / q.length : 0;
  };
  let adaylar = oyuncular.map(o => ({ o, p: puanla(o) })).filter(x => x.p > 0);
  const enIyi = Math.max(0, ...adaylar.map(x => x.p));
  adaylar = adaylar.filter(x => x.p === enIyi).map(x => x.o);
  const daralt = f => { if (adaylar.length > 1 && adaylar.some(f)) adaylar = adaylar.filter(f); };
  if (sart) daralt(sart);
  if (sayilar.length) daralt(o => o.vp === sayilar.at(-1) || o.sayi === sayilar[0]);
  if (!adaylar.length) return { hata: 'bulunamadı' };
  if (adaylar.length > 1) return { hata: `birden çok oyuncuya uyuyor: ${adaylar.map(o => o.ad).join(', ')}` };
  return { o: adaylar[0] };
}
const SART = { yerli: o => o.yerli, yabanci: o => !o.yerli, kaybedenYerli: o => o.yerli && !o.kazandi, kaybedenYabanci: o => !o.yerli && !o.kazandi };

// Görselleri üreten eski sayfa: sadece ?uret ile açılır (Claude'un yayın betiği kullanır)
function odulUretici(lig, istenen) {
  const t = ligVerisi(lig, 'takimlar');
  if (!t) return '<p class="bos">Yükleniyor…</p>';
  const haftalar = [...new Set(t.maclar.filter(m => m.durum === 'bitti').map(m => m.hafta))].sort((a, b) => a - b);
  const h = haftalar.includes(Number(istenen)) ? Number(istenen) : haftalar.at(-1);
  const cipler = `<div class="secenekler">${haftalar.slice(-6).map(k => `<a class="secenek ${k === h ? 'aktif' : ''}" href="#/lig/${lig}/odul/${k}">${k}. hafta</a>`).join('')}</div>`;
  // Haftanın listesi odul/liste/<hafta>.txt'de (Claude ekler); varsa sayfa açılınca görseller kendiliğinden hazırlanır
  if (!(`${OL()}-liste-${h}` in S.odul)) {
    S.odul[`${OL()}-liste-${h}`] = undefined;
    fetch(`odul/liste/${OL() === 'bsl' ? 'bsl-' : ''}${h}.txt?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.text() : null)).catch(() => null)
      .then(async m => {
        if (!m && OL() === 'bsl') {
          const { oyuncular, bitmeyen } = await odulHaftasi(h);
          const b = bslListesi(oyuncular);
          m = b.metin;
          S.odul[`${OL()}-secimNotlari-${h}`] = [...(bitmeyen ? [`${bitmeyen} maç henüz bitmedi; seçim biten maçlardan yapıldı`] : []), ...b.notlar];
        }
        S.odul[`${OL()}-liste-${h}`] = m; if (m && !S.odul[`${OL()}-sonuc-${h}`]) odulHazirla(h, m); else ciz();
      });
  }
  const yayinda = S.odul[`${OL()}-liste-${h}`];
  let kayitli = yayinda ?? '';
  try { kayitli = localStorage.getItem(`odulListesi-${OL()}-${h}`) ?? kayitli; } catch { /* gizli pencere */ }
  const sonuc = S.odul[`${OL()}-sonuc-${h}`];
  return `${cipler}<div class="kart"><h2 style="margin-top:0">${h}. hafta · haftanın ödülleri</h2>
    ${yayinda === undefined ? '<p class="soluk">Liste aranıyor…</p>' : yayinda ? '' : '<p class="soluk">Bu haftanın ödül listesi henüz eklenmedi.</p>'}
    <details ${yayinda ? '' : 'open'}><summary class="kucuk soluk">Listeyi kendin gir / değiştir</summary>
    <p class="soluk kucuk">Ödül listesini yapıştır: önce <b>MVP:</b>, <b>YERLİ MVP:</b>, <b>YABANCI MVP:</b>, <b>KAYBEDEN YERLİ MVP:</b>, <b>KAYBEDEN YABANCI MVP:</b> satırları,
      sonra çizgiyle (<b>-</b>) ayrılmış 5'li gruplar sırasıyla: ${BESLI[lig].map(b => BESLI_AD[b]).join(', ')}. Soyadı ya da adın başı yeterli.</p>
    <textarea id="odul-liste" data-hafta="${h}" rows="14" style="width:100%;font:inherit;padding:8px;box-sizing:border-box">${esc(kayitli)}</textarea>
    <p style="margin:10px 0 0"><button class="secenek" data-is="odul-hazirla" data-id="${h}">🖼️ Görselleri hazırla</button>
      </p></details>
    ${sonuc?.gorseller?.length ? `<p style="margin:10px 0 0"><button class="secenek" data-is="odul-hepsi" data-id="${h}">⬇ Hepsini indir</button></p>` : ''}
    ${sonuc?.durum ? `<p class="soluk kucuk">${esc(sonuc.durum)}</p>` : ''}
    ${sonuc?.hatalar?.length ? `<div class="hata-kutu kucuk" style="margin-top:10px">${sonuc.hatalar.map(esc).join('<br>')}</div>` : ''}
    ${S.odul[`${OL()}-secimNotlari-${h}`]?.length ? `<div class="hata-kutu kucuk" style="margin-top:10px">${S.odul[`${OL()}-secimNotlari-${h}`].map(esc).join('<br>')}</div>` : ''}
    ${sonuc?.uyarilar?.length ? `<div class="odul-uyari kucuk" style="margin-top:10px"><b>📷 Fotoğrafı kontrol et</b><br>${sonuc.uyarilar.map(esc).join('<br>')}
      <br><span class="soluk">Uygun fotoğraflarını Claude'a gönder; eklenince görseller onlarla hazırlanır.</span></div>` : ''}</div>
    ${sonuc?.gorseller?.length ? `<div class="odul-izgara">${sonuc.gorseller.map((g, i) => `<div class="kart" style="padding:10px">
      <img src="${g.url}" alt="${esc(g.ad)}" data-bilgi="${esc(JSON.stringify(g.bilgi ?? {}))}" style="width:100%;display:block;border-radius:8px">
      <div class="satir" style="justify-content:space-between;margin-top:8px"><b class="kucuk">${esc(g.ad)}</b>
        <span><button class="secenek" data-is="odul-paylas" data-id="${h}-${i}">📤</button><button class="secenek" data-is="odul-indir" data-id="${h}-${i}">⬇</button></span></div></div>`).join('')}</div>` : ''}`;
}
async function odulHazirla(h, yayinListesi = null) {
  const metin = yayinListesi ?? document.getElementById('odul-liste')?.value ?? '';
  if (yayinListesi === null) try { localStorage.setItem(`odulListesi-${OL()}-${h}`, metin); } catch { /* gizli pencere */ }
  const sonuc = S.odul[`${OL()}-sonuc-${h}`] = { durum: 'Hazırlanıyor…', hatalar: [], gorseller: [] };
  ciz();
  const { oyuncular, kadro } = await odulHaftasi(h);
  const secilenler = new Map();
  const liste = odulListesiCoz(metin);
  const isler = [{ ad: 'Kapak', bilgi: { tur: 'kapak', baslik: `${h}. Haftanın Panoraması` }, yap: () => OD.kapak({ lig: OL(), hafta: h }) }];
  for (const { tur, sorgu } of liste.tekli) {
    const sart = tekliSart(tur);
    const b = oyuncuBul(oyuncular, sorgu, sart);
    if (b.hata) { sonuc.hatalar.push(`${tekliAd(tur)}: "${sorgu}" ${b.hata}`); continue; }
    if (sart && !sart(b.o)) sonuc.hatalar.push(`${tekliAd(tur)}: ${b.o.ad} şarta uymuyor (${b.o.yerli ? 'yerli' : 'yabancı'}, takımı ${b.o.kazandi ? 'kazandı' : 'kaybetti'}); yine de hazırlandı`);
    secilenler.set(b.o.id, b.o);
    // Görselde yazılan ad (TBF'deki göbek adları yazılmasın: "Jaquan Scott", "Jaquan Elijah Scott" değil); yazılan ad soyadla
    // bitmiyorsa ("ÖMER YASİR") resmi tam ad kalır
    const yazilan = sorgu.split(/\s+\d/)[0].trim();
    const yk = kelimeler(yazilan), rk = kelimeler(b.o.ad);
    if (yk.length > 1 && yk.at(-1) === rk.at(-1) && yk.every(k => rk.includes(k))) b.o = { ...b.o, ad: yazilan };
    isler.push({ ad: `${tekliAd(tur)} · ${b.o.ad}`, bilgi: { tur, baslik: tekliAd(tur), oyuncu: b.o.ad, takim: b.o.takim, vp: b.o.vp }, yap: () => OD.tekli({ lig: OL(), tur, hafta: h, o: b.o, foto: b.o.foto, logo: b.o.logo }) });
  }
  liste.gruplar.forEach((grup, i) => {
    const tur = BESLI[OL()][i];
    const secilen = grup.map(satir => {
      const b = oyuncuBul(oyuncular, satir);
      if (b.hata) { sonuc.hatalar.push(`${BESLI_AD[tur]}: "${satir}" ${b.hata}`); return null; }
      // Görselde yazılan ad kullanılır (yazanın kısaltması korunur); tek kelimeyse resmi ad
      secilenler.set(b.o.id, b.o);
      const ad = satir.replace(/[\d\s-]+$/, '').trim();
      return { ...b.o, ad: ad.split(/\s+/).length > 1 ? ad : b.o.ad };
    }).filter(Boolean);
    if (secilen.length) isler.push({ ad: BESLI_AD[tur], bilgi: { tur: 'besli', baslik: BESLI_AD[tur], oyuncular: secilen.map(o => o.ad) }, yap: () => OD.besli({ lig: OL(), tur, hafta: h, oyuncular: secilen }) });
  });
  for (const is of isler) {
    sonuc.durum = `Hazırlanıyor: ${is.ad}…`;
    ciz();
    try {
      const blob = await is.yap();
      sonuc.gorseller.push({ ad: is.ad, blob, url: URL.createObjectURL(blob), bilgi: is.bilgi });
    } catch (e) { sonuc.hatalar.push(`${is.ad}: ${e.message}`); }
  }
  sonuc.durum = 'Fotoğraflar kontrol ediliyor…';
  ciz();
  sonuc.uyarilar = await fotoUyarilari([...secilenler.values()], kadro);
  sonuc.durum = `${sonuc.gorseller.length} görsel hazır.`;
  ciz();
}
// Seçilen oyuncuların fotoğrafları: TBF'de formalı (dekupe) fotoğraf yoksa ya da forması takım arkadaşlarınınkinden belirgin
// farklıysa (fotoğraf eski takımından olabilir) uyarı. Arkadaşların forma rengi: en çok 8 dekupe fotoğrafın ortancası.
async function fotoUyarilari(secilenler, kadro) {
  const uyarilar = [];
  for (const o of secilenler) {
    if (o.elleFoto) continue;
    const ad = `${o.ad} (${baslik(o.takim)})`;
    if (!o.foto) { uyarilar.push(`${ad}: TBF'de fotoğrafı yok`); continue; }
    const b = await OD.fotoBilgisi(o.foto);
    if (!b?.dekupe) { uyarilar.push(`${ad}: formalı fotoğrafı yok, TBF'de vesikalık var`); continue; }
    const arkadaslar = (kadro.get(o.takim) ?? []).filter(x => x.id !== o.id).slice(0, 8);
    const imzalar = (await Promise.all(arkadaslar.map(x => OD.fotoBilgisi(x.foto)))).filter(x => x?.dekupe && x.imza).map(x => x.imza);
    if (imzalar.length < 3 || !b.imza) continue;
    const orta = [0, 1, 2].map(c => imzalar.map(x => x[c]).sort((p, q) => p - q)[imzalar.length >> 1]);
    // Takımın kendi içinde de iki farklı forma olabilir: en yakın arkadaşa göre de bakılır
    const enYakin = Math.min(...imzalar.map(x => OD.renkFarki(x, b.imza)));
    if (OD.renkFarki(orta, b.imza) > 85 && enYakin > 60) uyarilar.push(`${ad}: forması takım arkadaşlarınınkinden farklı görünüyor (fotoğraf eski takımından olabilir)`);
  }
  return uyarilar;
}
// Yazılan liste sayfa yeniden çizilince kaybolmasın
document.addEventListener('input', e => {
  if (e.target.id !== 'odul-liste') return;
  try { localStorage.setItem(`odulListesi-${OL()}-${e.target.dataset.hafta}`, e.target.value); } catch { /* gizli pencere */ }
});
async function odulUreticiGorseli(anahtar, indir) {
  const [h, i] = anahtar.split('-').map(Number);
  const g = S.odul[`${OL()}-sonuc-${h}`]?.gorseller?.[i];
  if (!g) return;
  const dosya = new File([g.blob], `pota-alti-${h}-hafta-${String(i + 1).padStart(2, '0')}-${dosyaAnahtari(g.ad.split(' · ')[0])}.png`, { type: 'image/png' });
  if (!indir && navigator.canShare?.({ files: [dosya] })) {
    try { await navigator.share({ files: [dosya] }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(dosya);
  a.download = dosya.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// Haftanın ödülleri galerisi (herkese açık, TBL/BSL → Ödüller): Claude'un hazırlayıp yayınladığı görseller (odul/gorsel/<hafta>/,
// liste odul/gorsel/<hafta>.json; yayınlanan haftalar odul/gorsel/index.json). Görsele dokununca büyük görünüm açılır.
const TUR_ROZET = { kapak: 'Kapak', mvp: 'MVP', yerli: 'Yerli MVP', yabanci: 'Yabancı MVP', kaybedenYerli: 'Kaybeden Yerli MVP',
  kaybedenYabanci: 'Kaybeden Yabancı MVP', besli: '5\'li' };
function odulVerisi(h) {
  yukle(S.odul, `${OL()}-index`, `${odulKok()}/index.json`, { bosDeger: { haftalar: [] } });
  if (h != null) yukle(S.odul, `${OL()}-galeri-${h}`, `${odulKok()}/${h}.json`, { bosDeger: { gorseller: [] } });
}
const galeriAdresi = (h, g) => `${odulKok()}/${h}/${g.dosya}`;
function odulKarti(lig, istenen) {
  odulVerisi(null);
  const idx = S.odul[`${OL()}-index`];
  if (!idx) return '<p class="bos">Yükleniyor…</p>';
  const haftalar = [...idx.haftalar].sort((a, b) => a - b);
  if (!haftalar.length) return '<div class="kart"><p class="bos" style="margin:0">Henüz yayınlanmış ödül görseli yok.</p></div>';
  const h = haftalar.includes(Number(istenen)) ? Number(istenen) : haftalar.at(-1);
  odulVerisi(h);
  const v = S.odul[`${OL()}-galeri-${h}`];
  const cipler = haftalar.length > 1 ? `<div class="secenekler">${haftalar.map(k => `<a class="secenek ${k === h ? 'aktif' : ''}" href="#/lig/${lig}/odul/${k}">${k}. hafta</a>`).join('')}</div>` : '';
  if (!v) return `${cipler}<p class="bos">Yükleniyor…</p>`;
  const g = v.gorseller;
  const paylasVar = !!navigator.canShare;
  const satirlar = g.map((x, i) => `<div class="f-satir odul-satir">
      <button class="odul-onizleme" data-is="odul-ac" data-id="${i}" aria-label="${esc(x.baslik)} büyük göster"><img src="${galeriAdresi(h, x)}" alt="" loading="lazy"></button>
      <div class="ad" data-is="odul-ac" data-id="${i}"><strong>${esc(x.baslik)}</strong>
        <small>${esc(x.tur === 'besli' ? (x.oyuncular ?? []).join(', ') : x.tur === 'kapak' ? 'Kapak' : `${x.oyuncu} · ${baslik(x.takim ?? '')}`)}</small></div>
      ${x.vp != null ? `<div class="f-sayi"><strong>${x.vp}</strong><small>VP</small></div>` : ''}
      <span class="satir odul-dugmeler">${paylasVar ? `<button class="secenek" data-is="odul-paylas" data-id="${h}-${i}" aria-label="Paylaş">📤</button>` : ''}<button class="secenek" data-is="odul-indir" data-id="${h}-${i}" aria-label="İndir">⬇</button></span></div>`).join('');
  const acik = S.ui.odulAcik;
  const buyuk = acik != null && g[acik] ? odulBuyuk(h, g, acik) : '';
  return `${cipler}<div class="kart"><div class="baslik-satir"><h2>${h}. hafta · haftanın ödülleri</h2>
    <span class="satir">${paylasVar ? `<button class="secenek" data-is="odul-hepsi-paylas" data-id="${h}">📤 Hepsini paylaş</button>` : ''}<button class="secenek" data-is="odul-hepsi-indir" data-id="${h}">⬇ Hepsini indir</button></span></div>
    ${satirlar}
    <p class="soluk kucuk" style="margin-bottom:0">Satıra dokununca görsel büyük açılır.</p></div>${buyuk}`;
}
function odulBuyuk(h, g, i) {
  const x = g[i];
  return `<div class="odul-perde" data-is="odul-kapat" data-id="perde">
    <div class="odul-buyuk" role="dialog" aria-label="${esc(x.baslik)}">
      <img src="${galeriAdresi(h, x)}" alt="${esc(x.baslik)}">
      <button class="odul-ok sol" data-is="odul-ac" data-id="${(i - 1 + g.length) % g.length}" aria-label="Önceki">‹</button>
      <button class="odul-ok sag" data-is="odul-ac" data-id="${(i + 1) % g.length}" aria-label="Sonraki">›</button>
      <div class="odul-buyuk-alt"><div><b>${esc(x.oyuncu ? `${x.baslik} · ${x.oyuncu}` : x.baslik)}</b><small>${i + 1} / ${g.length}</small></div>
        <span>${navigator.canShare ? `<button class="btn" data-is="odul-paylas" data-id="${h}-${i}">📤 Paylaş</button>` : ''}
        <button class="btn ana" data-is="odul-indir" data-id="${h}-${i}">⬇ İndir</button>
        <button class="btn" data-is="odul-kapat" data-id="x" aria-label="Kapat">✕</button></span></div>
    </div></div>`;
}
async function odulDosyasi(h, i) {
  const x = S.odul[`${OL()}-galeri-${h}`].gorseller[i];
  const blob = await (await fetch(galeriAdresi(h, x))).blob();
  return new File([blob], `pota-alti-${h}-hafta-${x.dosya}`, { type: blob.type || 'image/jpeg' });
}
function dosyaIndir(dosya) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(dosya);
  a.download = dosya.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function odulGorseliniVer(anahtar, indir) {
  const [h, i] = anahtar.split('-').map(Number);
  const dosya = await odulDosyasi(h, i);
  if (!indir && navigator.canShare?.({ files: [dosya] })) {
    try { await navigator.share({ files: [dosya] }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  dosyaIndir(dosya);
}
async function odulHepsi(h, paylas) {
  const n = S.odul[`${OL()}-galeri-${h}`]?.gorseller?.length ?? 0;
  const dosyalar = await Promise.all([...Array(n).keys()].map(i => odulDosyasi(h, i)));
  if (paylas && navigator.canShare?.({ files: dosyalar })) {
    try { await navigator.share({ files: dosyalar }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  dosyalar.forEach((d, i) => setTimeout(() => dosyaIndir(d), i * 400));
}
// Büyük görünüm: klavyede ← → Esc, telefonda sağa-sola kaydırma
document.addEventListener('keydown', e => {
  if (S.ui.odulAcik == null) return;
  const n = document.querySelectorAll('.odul-satir').length;
  if (e.key === 'Escape') { S.ui.odulAcik = null; }
  else if (e.key === 'ArrowLeft') S.ui.odulAcik = (S.ui.odulAcik - 1 + n) % n;
  else if (e.key === 'ArrowRight') S.ui.odulAcik = (S.ui.odulAcik + 1) % n;
  else return;
  ciz();
});
let odulDokunma = null;
document.addEventListener('touchstart', e => { if (e.target.closest('.odul-buyuk')) odulDokunma = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => {
  if (odulDokunma == null || S.ui.odulAcik == null) return;
  const fark = e.changedTouches[0].clientX - odulDokunma;
  odulDokunma = null;
  if (Math.abs(fark) < 50) return;
  const n = document.querySelectorAll('.odul-satir').length;
  S.ui.odulAcik = (S.ui.odulAcik + (fark < 0 ? 1 : -1) + n) % n;
  ciz();
});

// Puan tablosu canlı: veri/uret.py tabloyu saatte bir üretir; ondan sonra biten maçlar (bu ve sıradaki haftanın listesi, maç
// saatlerinde dakikada bir yenilenir) burada eklenir ve sıra yeniden hesaplanır. Maçı süren takım "canlı" işaretlenir.
function canliTablo(lig, tablo) {
  if (!tablo?.length || !tablo[0].sayilan) return tablo;
  const b = S.index?.maclar?.[lig];
  const maclar = [...new Set([b?.guncel, varsayilanHafta(lig)].filter(Boolean))].flatMap(h => macListesi(lig, h) ?? []);
  const satir = new Map(tablo.map(s => [s.ad, { ...s, son5: [...s.son5], sayilan: new Set(s.sayilan), canli: false }]));
  let degisti = false;
  for (const m of [...maclar].sort((x, y) => x.tarih.localeCompare(y.tarih))) {
    const ev = satir.get(m.ev);
    const dep = satir.get(m.dep);
    if (!ev || !dep) continue;
    if (m.durum === 'canli') { ev.canli = dep.canli = true; continue; }
    if (m.durum !== 'bitti' || ev.sayilan.has(m.id) || m.evSkor == null) continue;
    for (const [t, a, y] of [[ev, Number(m.evSkor), Number(m.depSkor)], [dep, Number(m.depSkor), Number(m.evSkor)]]) {
      t.o += 1;
      t.atilan += a;
      t.yenilen += y;
      t[a > y ? 'g' : 'm'] += 1;
      t.averaj = t.atilan - t.yenilen;
      t.son5 = [...t.son5, a > y ? 'G' : 'M'].slice(-5);
      t.sayilan.add(m.id);
    }
    degisti = true;
  }
  const liste = [...satir.values()];
  if (degisti) {
    liste.sort((x, y) => y.g - x.g || x.m - y.m || y.averaj - x.averaj || y.atilan - x.atilan);
    liste.forEach((s, i) => { s.sira = i + 1; });
  }
  return liste;
}

function tabloKarti(lig, ilk = null) {
  const t = canliTablo(lig, ligVerisi(lig, 'tablo'));
  if (!t) return '<p class="bos">Yükleniyor…</p>';
  const satirlar = (ilk ? t.slice(0, ilk) : t).map(s => `<tr class="tikla" onclick="location.hash='#/takim/${lig}/${s.id}'">
      <td class="sira"><span class="madalya m${s.sira}">${s.sira}</span></td><td class="takim-ad">${esc(baslik(s.ad))}${s.canli ? ' <span class="canli-yazi kucuk">canlı</span>' : ''}</td>
      <td class="sayi">${s.o}</td><td class="sayi"><b>${s.g}</b></td><td class="sayi">${s.m}</td>
      <td class="sayi dar-gizle">${s.atilan}</td><td class="sayi dar-gizle">${s.yenilen}</td><td class="sayi">${isaretli(s.averaj)}</td>
      ${ilk ? '' : `<td class="dar-gizle"><span class="form">${s.son5.map(x => `<i class="${x}">${x}</i>`).join('')}</span></td>`}</tr>`).join('');
  return `<div class="kart">${ilk ? `<div class="baslik-satir"><h2>${LIGLER[lig].kisa} puan tablosu</h2><a href="#/lig/${lig}/tablo">Tümü ›</a></div>` : ''}
    <div class="tablo-kap"><table>
    <thead><tr><th>#</th><th>Takım</th><th class="sayi">O</th><th class="sayi">G</th><th class="sayi">M</th>
      <th class="sayi dar-gizle">A</th><th class="sayi dar-gizle">Y</th><th class="sayi">Av.</th>${ilk ? '' : '<th class="dar-gizle">Son 5</th>'}</tr></thead>
    <tbody>${satirlar}</tbody></table></div>
    ${ilk ? '' : '<p class="soluk kucuk" style="margin:8px 0 0">O: oynanan · G: galibiyet · M: mağlubiyet · A/Y: atılan/yenilen sayı · Av.: averaj. Sıralama galibiyete göre, eşitlikte averaj (resmi sıralamada ikili averaj gibi farklı kurallar olabilir).</p>'}</div>`;
}

function liderListesi(lig, k, kac) {
  const deger = x => (k.tur === 'atis' ? `${x.atis[0]}<small class="soluk" style="font-weight:400"> / ${x.atis[1]}</small>` : k.tur === 'toplam' ? isaretli(x.deger) : sayi(x.deger));
  return `<ol class="lider-listesi">${k.liste.slice(0, kac).map((x, i) => `<li><span class="no">${i + 1}</span>
    <span class="ad"><a href="#/oyuncu/${lig}/${x.id}" class="oyuncu-link"><b>${esc(x.ad)}</b></a><small>${esc(takimAdi(lig, x.takim))} · ${x.mac} maç</small></span>
    <span class="deger">${deger(x)}</span></li>`).join('')}</ol>`;
}

function liderlerKarti(lig) {
  const l = ligVerisi(lig, 'liderler');
  ligVerisi(lig, 'tablo');
  if (!l) return '<p class="bos">Yükleniyor…</p>';
  return `<p class="soluk kucuk">Maç başı ortalamalar (+/- ve 3 sayılık: sezon toplamı). Listeye girmek için en az ${l.esik} maç oynamış olmak gerekir.</p>
    <div class="izgara">${l.kategoriler.map(k => `<div class="kart" style="margin:0"><h3>${esc(k.ad)}</h3>${liderListesi(lig, k, 10)}</div>`).join('')}</div>`;
}

function takimlarKarti(lig) {
  const t = ligVerisi(lig, 'tablo');
  if (!t) return '<p class="bos">Yükleniyor…</p>';
  return `<div class="kart" style="padding:0">${[...t].sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map(s => `<a class="mac" style="grid-template-columns:1fr auto" href="#/takim/${lig}/${s.id}">
      <span class="takim-ad">${esc(baslik(s.ad))}</span><span class="soluk">${s.g}G ${s.m}M · ${s.sira}. sırada ›</span></a>`).join('')}</div>`;
}

const OYUNCU_SIRALARI = [['vp', 'VP'], ['sayi', 'Sayı'], ['rib', 'Ribaund'], ['ast', 'Asist'], ['pm', '+/-'], ['dk', 'Dakika']];
function oyuncularKarti(lig) {
  const liste = ligVerisi(lig, 'oyuncular');
  ligVerisi(lig, 'tablo');
  if (!liste) return '<p class="bos">Yükleniyor…</p>';
  const ara = aramaNorm(S.ui.ara);
  const sirala = S.ui.oyuncuSirala;
  const secili = liste.filter(o => o.mac > 0 && (!ara || aramaNorm(o.ad).includes(ara) || aramaNorm(takimAdi(lig, o.takim)).includes(ara)))
    .sort((a, b) => b[sirala] - a[sirala]);
  return `<input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ya da takım ara" value="${esc(S.ui.ara)}" style="margin-bottom:10px">
    <div class="secenekler">${OYUNCU_SIRALARI.map(([k, ad]) => `<button class="secenek ${k === sirala ? 'aktif' : ''}" data-is="oyuncu-sirala" data-id="${k}">${ad}</button>`).join('')}</div>
    <div class="kart" style="padding:6px 10px"><div class="tablo-kap"><table>
      <thead><tr><th>Oyuncu</th><th class="sayi">M</th><th class="sayi dar-gizle">Dk</th><th class="sayi">Sy</th><th class="sayi">Rb</th><th class="sayi">As</th><th class="sayi dar-gizle">+/-</th><th class="sayi">VP</th></tr></thead>
      <tbody>${secili.slice(0, 150).map(o => `<tr class="tikla" onclick="location.hash='#/oyuncu/${lig}/${o.id}'">
        <td><b>${esc(o.ad)}</b><div class="soluk kucuk">${esc(takimAdi(lig, o.takim))}</div></td><td class="sayi">${o.mac}</td><td class="sayi dar-gizle">${sayi(o.dk)}</td>
        <td class="sayi">${sayi(o.sayi)}</td><td class="sayi">${sayi(o.rib)}</td><td class="sayi">${sayi(o.ast)}</td><td class="sayi dar-gizle">${isaretli(o.pm)}</td>
        <td class="sayi"><b>${sayi(o.vp)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="bos">Oyuncu bulunamadı</td></tr>'}</tbody></table></div></div>
    <p class="soluk kucuk">Maç başı ortalamalar (+/-: sezon toplamı). ${secili.length > 150 ? `İlk 150 oyuncu gösteriliyor; aramayla daralt.` : ''}</p>`;
}

// ---------- Takım sayfası ----------
function gorunumTakim(lig, id) {
  const t = ligVerisi(lig, 'takimlar');
  const tablo = ligVerisi(lig, 'tablo');
  if (!t || !tablo) return '<p class="bos">Yükleniyor…</p>';
  const tk = t.takimlar.find(x => x.id === id);
  const sira = tablo.find(x => x.id === id);
  if (!tk) return '<p class="bos">Takım bulunamadı.</p>';
  const maclar = t.maclar.filter(m => m.ev === id || m.dep === id).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const oynanan = maclar.filter(m => m.durum !== 'oynanmadi');
  const gelecek = maclar.filter(m => m.durum === 'oynanmadi').slice(0, 3);
  const macSatir = m => {
    const ev = m.ev === id;
    const rakip = ev ? m.dep : m.ev;
    const biz = Number(ev ? m.evSkor : m.depSkor);
    const onlar = Number(ev ? m.depSkor : m.evSkor);
    const sonuc = m.durum === 'canli' ? '<span class="canli-yazi">canlı</span>' : m.durum === 'bitti'
      ? `<span class="${biz > onlar ? 'yesil-yazi' : 'kirmizi-yazi'}">${biz > onlar ? 'G' : 'M'}</span> ${biz}-${onlar}` : tarihSaat(m.tarih);
    return `<tr class="tikla" onclick="location.hash='#/mac/${lig}/${m.id}'"><td class="sira">${m.hafta}.</td>
      <td>${ev ? '' : '@ '}${esc(takimAdi(lig, rakip))}</td><td class="sayi">${sonuc}</td></tr>`;
  };
  const o = tk.ort;
  return `<a class="geri" href="#/lig/${lig}/tablo">‹ ${LIGLER[lig].kisa} puan tablosu</a>
    <div class="kart sayfa-baslik"><h1>${esc(baslik(tk.ad))}</h1>
      <p class="soluk" style="margin:0 0 12px"><span class="lig-etiket">${LIGLER[lig].kisa}</span> ${sira ? `${sira.sira}. sıra · ${sira.g} galibiyet, ${sira.m} mağlubiyet · averaj ${isaretli(sira.averaj)}` : ''}</p>
      <div class="istatistik">${[['Sayı', o.sayi], ['Ribaund', o.rib], ['Asist', o.ast], ['Top çalma', o.tc], ['Blok', o.blk], ['Top kaybı', o.tk], ['2S %', yuzde(tk.atis.iki)], ['3S %', yuzde(tk.atis.uc)], ['SA %', yuzde(tk.atis.sa)]]
        .map(([ad, d]) => `<div><b>${typeof d === 'number' ? sayi(d) : d}</b><span>${ad}</span></div>`).join('')}</div>
      <p class="soluk kucuk" style="margin:8px 0 0">Maç başı takım ortalamaları.</p></div>
    <div class="iki-sutun">
      <div class="kart"><h3>Maçlar</h3><div class="tablo-kap"><table><tbody>${oynanan.map(macSatir).join('') || '<tr><td class="bos">Henüz maç yok</td></tr>'}</tbody></table></div>
        ${gelecek.length ? `<h3 style="margin-top:14px">Sıradaki maçlar</h3><div class="tablo-kap"><table><tbody>${gelecek.map(macSatir).join('')}</tbody></table></div>` : ''}</div>
      <div class="kart"><h3>Kadro</h3><div class="tablo-kap"><table>
        <thead><tr><th>Oyuncu</th><th class="sayi">M</th><th class="sayi">Dk</th><th class="sayi">Sy</th><th class="sayi">Rb</th><th class="sayi">As</th><th class="sayi">VP</th></tr></thead>
        <tbody>${tk.kadro.map(x => `<tr class="tikla" onclick="location.hash='#/oyuncu/${lig}/${x.id}'"><td><b>${esc(x.ad)}</b></td><td class="sayi">${x.mac}</td>
          <td class="sayi">${sayi(x.dk)}</td><td class="sayi">${sayi(x.sayi)}</td><td class="sayi">${sayi(x.rib)}</td><td class="sayi">${sayi(x.ast)}</td><td class="sayi"><b>${sayi(x.vp)}</b></td></tr>`).join('')}</tbody></table></div>
        <p class="soluk kucuk" style="margin:8px 0 0">Bu sezon takımda süre almış oyuncular (en son oynadığı takıma göre).</p></div>
    </div>`;
}

// ---------- Oyuncu sayfası ----------
function gorunumOyuncu(lig, id) {
  S.oyuncu[lig] ??= {};
  yukle(S.oyuncu[lig], id, `data/${lig}/oyuncu/${id}.json`);
  ligVerisi(lig, 'tablo');
  const d = S.oyuncu[lig][id];
  if (d === undefined) return '<p class="bos">Yükleniyor…</p>';
  if (!d) return '<p class="bos">Oyuncu bulunamadı.</p>';
  const o = d.ozet;
  const satirlar = [...d.maclar].reverse().map(x => {
    const oynadi = x.sn > 0;
    const sonuc = x.durum === 'canli' ? '<span class="canli-yazi">canlı</span>'
      : `<span class="${x.skor > x.rakipSkor ? 'yesil-yazi' : 'kirmizi-yazi'}">${x.skor > x.rakipSkor ? 'G' : 'M'}</span> ${x.skor}-${x.rakipSkor}`;
    return `<tr class="tikla" onclick="location.hash='#/mac/${lig}/${x.mac}'"><td class="sira">${x.hafta}.</td>
      <td>${x.evde ? '' : '@ '}${esc(takimAdi(lig, x.rakip))}<div class="soluk kucuk">${sonuc}</div></td>
      <td class="sayi">${oynadi ? x.sure.split(':')[0] : '—'}</td><td class="sayi">${oynadi ? x.sayi : ''}</td><td class="sayi">${oynadi ? x.rib : ''}</td>
      <td class="sayi">${oynadi ? x.ast : ''}</td><td class="sayi dar-gizle">${oynadi ? isaretli(x.pm) : ''}</td><td class="sayi"><b>${oynadi ? x.vp : ''}</b></td></tr>`;
  }).join('');
  return `<a class="geri" href="#/takim/${lig}/${o.takim}">‹ ${esc(takimAdi(lig, o.takim))}</a>
    <div class="kart sayfa-baslik"><h1>${esc(o.ad)}</h1>
      <p class="soluk" style="margin:0 0 12px"><span class="lig-etiket">${LIGLER[lig].kisa}</span> <a href="#/takim/${lig}/${o.takim}">${esc(takimAdi(lig, o.takim))}</a> · ${o.mac} maç (${o.ilk5} ilk 5)</p>
      <div class="istatistik">${[['Dakika', o.dk], ['Sayı', o.sayi], ['Ribaund', o.rib], ['Asist', o.ast], ['VP', o.vp], ['+/-', isaretli(o.pm)], ['2S %', yuzde(o.iki)], ['3S %', yuzde(o.uc)], ['SA %', yuzde(o.sa)]]
        .map(([ad, v]) => `<div><b>${typeof v === 'number' ? sayi(v) : v}</b><span>${ad}</span></div>`).join('')}</div>
      <p class="soluk kucuk" style="margin:8px 0 0">Maç başı ortalamalar (+/-: sezon toplamı).</p></div>
    <div class="kart"><h3>Maç maç</h3><div class="tablo-kap"><table>
      <thead><tr><th>Hf</th><th>Rakip</th><th class="sayi">Dk</th><th class="sayi">Sy</th><th class="sayi">Rb</th><th class="sayi">As</th><th class="sayi dar-gizle">+/-</th><th class="sayi">VP</th></tr></thead>
      <tbody>${satirlar || '<tr><td colspan="8" class="bos">Henüz maç yok</td></tr>'}</tbody></table></div>
      <p class="soluk kucuk" style="margin:6px 0 0">Maça dokununca kutu skor açılır.</p></div>`;
}

// ---------- Ana sayfa ----------
function buHaftaKarti(lig) {
  const n = varsayilanHafta(lig);
  const maclar = macListesi(lig, n);
  const sirali = maclar ? [...maclar].sort((a, b) => (b.durum === 'canli') - (a.durum === 'canli') || a.tarih.localeCompare(b.tarih)) : [];
  return `<div class="kart mac-gun"><div class="baslik-satir" style="padding:12px 14px 0"><h2 style="margin:0">${LIGLER[lig].kisa} · ${n}. hafta</h2><a href="#/maclar/${lig}/${n}">Fikstür ›</a></div>
    <p class="soluk kucuk" style="margin:2px 14px 6px">${maclar ? haftaDurumu(maclar) : 'Yükleniyor…'}</p>
    ${sirali.map(m => macSatiri(lig, m)).join('')}</div>`;
}

function gorunumAna() {
  // Ana sayfada solda BSL, sağda TBL; puan tablosunun ilk 8'i
  const sutun = lig => `<div>${buHaftaKarti(lig)}${tabloKarti(lig, 8)}</div>`;
  const karsilama = `<div class="karsilama"><img src="icon-192.png" alt=""><div><strong>Pota Altı</strong><small>TBL ve BSL canlı skorlar, istatistikler, fantezi ligleri ve yayınlar</small></div></div>`;
  const fantezi = `<h2 class="bolum-baslik">Fantezi ligleri</h2><div class="fantezi-kartlari">${fantezKartlari()}</div>`;
  if (TELEFON.matches) {
    const lig = S.ui.anaLig;
    const secici = `<div class="lig-secici">${Object.entries(LIGLER).map(([l, v]) => `<button class="${l === lig ? 'aktif' : ''}" data-is="ana-lig" data-id="${l}">${v.kisa}</button>`).join('')}</div>`;
    return `${Yayin.anaKart()}${secici}${sutun(lig)}${fantezi}${altBilgi()}`;
  }
  return `<div class="ana-ust">${karsilama}${Yayin.anaKart()}</div>
    <div class="iki-sutun">${sutun('bsl')}${sutun('tbl')}</div>${fantezi}${altBilgi()}`;
}

// ---------- Fantezi ----------
function fantezKartlari() {
  return `<a class="kart fantezi-kart bsl" href="bsl/"><span class="fantezi-etiket">BSL</span><strong>BSL Fantezi Ligi ›</strong>
      <span class="soluk">Canlı draft, takaslar, talep kurası, haftalık puanlama. Katıl üyelerine özel.</span></a>
    <a class="kart fantezi-kart tbl" href="tbl/"><span class="fantezi-etiket">TBL</span><strong>TBL Fantezi Ligi ›</strong>
      <span class="soluk">Puan durumu, kadron, serbest oyuncu ve talep kurası, takaslar. Menajerler kendi değişikliklerini yapar.</span></a>`;
}
function gorunumFantezi() {
  return `<div class="sayfa-baslik"><h1>Fantezi ligleri</h1><p class="soluk">Pota Altı'nın fantezi ligleri. Menajerler davet linkiyle ve Google hesabıyla girer.</p></div>
    <div class="fantezi-kartlari">${fantezKartlari()}</div>`;
}

function altBilgi() {
  const g = S.meta?.guncelleme;
  return `<p class="alt-bilgi">Veriler: TBF · İstatistikler ${g ? tarihSaat(g) : '-'} itibarıyla · Canlı skorlar maç saatlerinde dakikada bir yenilenir</p>`;
}

// ---------- Olaylar ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-is]');
  if (!el) return;
  if (el.dataset.is === 'oyuncu-sirala') { S.ui.oyuncuSirala = el.dataset.id; ciz(); }
  if (el.dataset.is === 'kutu-sirala') { S.ui.kutuSirala = ME.kutuSiralamaDegistir(S.ui.kutuSirala, el.dataset.id); ciz(); }
  if (el.dataset.is === 'ae-paylas' || el.dataset.is === 'ae-indir') {
    const yazi = el.textContent;
    el.disabled = true;
    el.textContent = '…';
    artieksiGorseliniPaylas(el.dataset.id, el.dataset.is === 'ae-indir').catch(e => alert(`Görsel hazırlanamadı: ${e.message}`))
      .finally(() => { el.disabled = false; el.textContent = yazi; });
  }
  if (el.dataset.is === 'sy-paylas' || el.dataset.is === 'sy-indir') {
    const yazi = el.textContent;
    el.disabled = true;
    el.textContent = '…';
    seyirciGorseliniPaylas(el.dataset.id, el.dataset.is === 'sy-indir').catch(e => alert(`Görsel hazırlanamadı: ${e.message}`))
      .finally(() => { el.disabled = false; el.textContent = yazi; });
  }
  if (el.dataset.is === 'odul-hazirla') odulHazirla(Number(el.dataset.id)).catch(e => alert(`Görseller hazırlanamadı: ${e.message}`));
  if (el.dataset.is === 'odul-paylas' || el.dataset.is === 'odul-indir') {
    const uretici = new URLSearchParams(location.search).has('uret');
    (uretici ? odulUreticiGorseli : odulGorseliniVer)(el.dataset.id, el.dataset.is === 'odul-indir').catch(e => alert(`İndirilemedi: ${e.message}`));
  }
  if (el.dataset.is === 'odul-ac') { S.ui.odulAcik = Number(el.dataset.id); ciz(); }

  if (el.dataset.is === 'odul-kapat' && (el.dataset.id === 'x' || e.target === el)) { S.ui.odulAcik = null; ciz(); }
  if (el.dataset.is === 'odul-hepsi-indir' || el.dataset.is === 'odul-hepsi-paylas') odulHepsi(Number(el.dataset.id), el.dataset.is === 'odul-hepsi-paylas').catch(e => alert(`İndirilemedi: ${e.message}`));
  if (el.dataset.is === 'odul-hepsi') {
    const n = S.odul[`${OL()}-sonuc-${el.dataset.id}`]?.gorseller?.length ?? 0;
    for (let i = 0; i < n; i++) setTimeout(() => odulUreticiGorseli(`${el.dataset.id}-${i}`, true), i * 400);
  }
  if (el.dataset.is === 'ana-lig') {
    S.ui.anaLig = el.dataset.id;
    try { localStorage.setItem('anaLig', el.dataset.id); } catch { /* gizli pencere */ }
    ciz();
  }
});
TELEFON.addEventListener('change', () => ciz());
document.addEventListener('input', e => {
  const k = e.target.dataset?.ui;
  if (!k) return;
  S.ui[k] = e.target.value;
  ciz();
});
window.addEventListener('hashchange', () => { S.ui.kutuSirala = null; S.ui.odulAcik = null; ciz(); window.scrollTo(0, 0); });

// ---------- Canlı yenileme: başlamış ama bitmemiş maçı olan haftaların listesi ve açık kutu skor ----------
async function canliYenile() {
  if (document.hidden || !S.index) return;
  const simdi = Date.now();
  for (const [k, v] of Object.entries(S.maclar)) {
    if (!v?.maclar?.some(m => m.durum !== 'bitti' && !m.tarih.endsWith('T00:00:00') && simdi >= new Date(m.tarih).getTime() - 10 * 60000)) continue;
    try { S.maclar[k] = listeDuzelt(await getir(`${KAYNAK}/maclar/${k}.json`)); } catch { /* sonraki denemede */ }
  }
  const [s, lig, id] = rota();
  if (s === 'mac' && macBul(lig, Number(id))?.durum === 'canli') {
    try { S.kutular[Number(id)] = await getir(`${KAYNAK}/mac/${id}.json`); } catch { /* sonraki denemede */ }
  }
  ciz();
}
setInterval(canliYenile, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) canliYenile(); });

Yayin.baglan(() => ciz());

async function basla() {
  try {
    [S.meta, S.index] = await Promise.all([getir('data/meta.json'), getir(`${KAYNAK}/hafta/index.json`).catch(() => null)]);
  } catch (e) {
    S.hata = `Veriler yüklenemedi: ${e.message}`;
  }
  ciz();
  yoneticiyiTani();
}
basla();

if ('serviceWorker' in navigator && !YEREL) navigator.serviceWorker.register('sw.js').catch(() => {});
