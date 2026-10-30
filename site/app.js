// Pota Altı App: TBL ve BSL için canlı skor, kutu skor, puan tablosu, istatistik liderleri, takım ve oyuncu sayfaları.
// Canlı veriler (maç listeleri, kutu skorlar) TBL Fantezi Ligi sitesinin yayınladığı dosyalardan okunur; puan tablosu,
// liderler ve sezon istatistikleri veri/uret.py'nin ürettiği site/data dosyalarındandır.

const KAYNAK = 'https://potaalti.github.io/tbl_fantezi_lig/data';
const TBL_FANTEZI = 'https://potaalti.github.io/tbl_fantezi_lig/';
const YEREL = ['localhost', '127.0.0.1'].includes(location.hostname);
const LIGLER = { tbl: { kisa: 'TBL', ad: 'Türkiye Basketbol Ligi' }, bsl: { kisa: 'BSL', ad: 'Basketbol Süper Ligi' } };

const S = {
  meta: null, index: null, hata: null,
  tablo: {}, liderler: {}, oyuncular: {}, takimlar: {}, oyuncu: {}, // lig -> veri (oyuncu: lig -> id -> detay)
  maclar: {}, // `${lig}-${hafta}` -> maç listesi
  kutular: {}, // maç id -> kutu skor (null: yok)
  ui: { ara: '', oyuncuSirala: 'vp', liderKategori: {} },
};
const yukleniyor = new Set();

// ---------- Yardımcılar ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sayi = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('tr-TR');
const isaretli = n => (n > 0 ? `+${n}` : String(n));
const yuzde = ([b, d]) => (d ? `%${Math.round((b / d) * 100)}` : '–');
const aramaNorm = s => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
// TBF'deki BÜYÜK HARF adları: "FENERBAHÇE BEKO" -> "Fenerbahçe Beko" (kısaltmalar olduğu gibi)
const baslik = ad => String(ad ?? '').split(' ').map(k =>
  k !== k.toLocaleUpperCase('tr') || k.replace(/\./g, '').length <= 3 ? k
    : k.toLocaleLowerCase('tr').replace(/(^|[.\-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr')),
).join(' ').replace(/Technıc/u, 'Technic');
const gunBasligi = iso => new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
const saatYazisi = iso => (iso.endsWith('T00:00:00') ? 'Saat belli değil' : new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
const tarihSaat = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const sureSn = s => { const [dk, sn] = String(s || '0:00').split(':').map(Number); return (dk || 0) * 60 + (sn || 0); };
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

async function getir(url) {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} okunamadı (${r.status})`);
  return r.json();
}

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
const ligVerisi = (lig, ad) => { yukle(S[ad], lig, `data/${lig}/${ad}.json`); return S[ad][lig]; };
const macListesi = (lig, h) => { yukle(S.maclar, `${lig}-${h}`, `${KAYNAK}/maclar/${lig}-${h}.json`, { donustur: listeDuzelt }); return S.maclar[`${lig}-${h}`]?.maclar; };

// Ligin gösterilecek haftası: sıradaki hafta gösterime girdiyse o, yoksa güncel hafta
function varsayilanHafta(lig) {
  const b = S.index?.maclar?.[lig];
  if (!b) return S.meta?.ligler?.[lig]?.guncel ?? 1;
  return b.siradaki && new Date(b.siradaki.gosterim).getTime() <= Date.now() ? b.siradaki.hafta : b.guncel;
}

// ---------- Menü ----------
const MENU = [['', 'Ana Sayfa', '🏠'], ['maclar', 'Maçlar', '📅'], ['lig/tbl', 'TBL', '🏀'], ['lig/bsl', 'BSL', '🏆'], ['fantezi', 'Fantezi', '⭐']];
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
  $('#menu').innerHTML = MENU.map(([y, ad]) => `<a href="#/${y}" class="${y === aktif ? 'aktif' : ''}">${ad}</a>`).join('');
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
  const lig = LIGLER[a] ? a : 'tbl';
  switch (s) {
    case undefined: return gorunumAna();
    case 'maclar': return `<div class="dar">${gorunumMaclar(LIGLER[a] ? a : null, Number(b) || null)}</div>`;
    case 'mac': return `<div class="dar">${gorunumMac(lig, Number(b))}</div>`;
    case 'lig': return gorunumLig(lig, b ?? 'tablo');
    case 'takim': return `<div class="dar">${gorunumTakim(lig, b)}</div>`;
    case 'oyuncu': return `<div class="dar">${gorunumOyuncu(lig, b)}</div>`;
    case 'fantezi': return `<div class="dar">${gorunumFantezi()}</div>`;
    default: return gorunumAna();
  }
}

// ---------- Maçlar ----------
function canliYazisi(m) {
  const c = m.canliDurum;
  if (!c?.periyot) return 'Canlı';
  const ad = c.uzatma ? 'Uzatma' : `${c.periyot}. Çeyrek`;
  if (c.saat && c.saat !== '00:00') return `${ad} · ${c.saat}`;
  if (c.uzatma) return `${ad} sonu`;
  if (c.periyot === 2) return 'Devre arası';
  if (c.periyot >= 4) return Number(m.evSkor) !== Number(m.depSkor) ? 'Maç sonu · kesinleşiyor' : '4. Çeyrek sonu';
  return `${c.periyot}. Çeyrek sonu`;
}

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
  const lig = istenenLig ?? (S.ui.sonLig || 'tbl');
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
    <p class="soluk kucuk">Maça dokununca kutu skor açılır. Maç saatlerinde skorlar dakikada bir yenilenir.</p>`;
}

// ---------- Maç sayfası (kutu skor) ----------
const atis = ([b, d] = [0, 0]) => `${b}/${d}`;
const KUTU_SUTUNLARI = [
  ['Dk', o => o.sure], ['Sy', o => o.sayi], ['2S', o => atis(o.iki)], ['3S', o => atis(o.uc)], ['SA', o => atis(o.sa)],
  ['Rb', o => o.rib], ['As', o => o.ast], ['Tç', o => o.tc], ['Bl', o => o.blk], ['Tk', o => o.tk], ['F', o => o.faul], ['+/-', o => o.pm ?? ''], ['VP', o => o.vp],
];

function kutuSkorTablosu(lig, t) {
  const oyuncular = t.oyuncular ?? [];
  const satirlar = oyuncular.map(o => {
    const id = String(o.id);
    const ad = id.startsWith('fiba-') ? esc(o.ad) : `<a href="#/oyuncu/${lig}/${id}" class="oyuncu-link">${esc(o.ad)}</a>`;
    return `<tr class="${sureSn(o.sure) > 0 ? '' : 'oynamadi'}"><th>${o.ilk5 ? `<b>${ad}</b>` : ad}</th>
      ${KUTU_SUTUNLARI.map(([b, f]) => `<td class="${b === 'VP' ? 'vp' : ''}">${esc(f(o))}</td>`).join('')}</tr>`;
  }).join('');
  const topla = alan => oyuncular.reduce((x, o) => x + (Number(o[alan]) || 0), 0);
  const toplaAtis = alan => atis([0, 1].map(i => oyuncular.reduce((x, o) => x + (o[alan]?.[i] ?? 0), 0)));
  return `<div class="kart"><h3>${takimLinki(lig, t.ad)}</h3><div class="tablo-kap"><table class="kutu">
    <thead><tr><th>Oyuncu</th>${KUTU_SUTUNLARI.map(([b]) => `<td>${b}</td>`).join('')}</tr></thead>
    <tbody>${satirlar}<tr class="toplam"><th>Toplam</th><td></td><td>${topla('sayi')}</td><td>${toplaAtis('iki')}</td><td>${toplaAtis('uc')}</td>
      <td>${toplaAtis('sa')}</td><td>${topla('rib')}</td><td>${topla('ast')}</td><td>${topla('tc')}</td><td>${topla('blk')}</td>
      <td>${topla('tk')}</td><td>${topla('faul')}</td><td></td><td class="vp">${topla('vp')}</td></tr></tbody></table></div></div>`;
}

function ceyrekTablosu(lig, k) {
  const n = Math.max(k.ev.ceyrekler?.length ?? 0, k.dep.ceyrekler?.length ?? 0);
  if (!n) return '';
  const hucre = i => (i < 4 ? `Ç${i + 1}` : `U${i - 3}`);
  const satir = t => `<tr><th>${esc(baslik(t.ad))}</th>${Array.from({ length: n }, (_, i) => `<td>${t.ceyrekler?.[i] ?? '–'}</td>`).join('')}<td><b>${t.skor ?? 0}</b></td></tr>`;
  return `<div class="kart"><div class="tablo-kap"><table class="kutu ceyrek">
    <thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<td>${hucre(i)}</td>`).join('')}<td>T</td></tr></thead>
    <tbody>${satir(k.ev)}${satir(k.dep)}</tbody></table></div></div>`;
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
  const liste = macBul(lig, id);
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
  return `${ust}${ceyrekTablosu(lig, kutu)}${kutuSkorTablosu(lig, kutu.ev)}${kutuSkorTablosu(lig, kutu.dep)}
    <p class="soluk kucuk">Kalın: ilk 5 · 2S/3S/SA: isabet/deneme · Tç: top çalma · Bl: blok · Tk: top kaybı · VP: verimlilik</p>`;
}

// ---------- Lig: puan tablosu, liderler, takımlar, oyuncular ----------
const SEKMELER = [['tablo', 'Puan Tablosu'], ['liderler', 'Liderler'], ['takimlar', 'Takımlar'], ['oyuncular', 'Oyuncular']];

function gorunumLig(lig, sekme) {
  const sekmeler = `<div class="secenekler">${SEKMELER.map(([s, ad]) => `<a class="secenek ${s === sekme ? 'aktif' : ''}" href="#/lig/${lig}/${s}">${ad}</a>`).join('')}</div>`;
  const baslikHtml = `<div class="sayfa-baslik"><h1>${LIGLER[lig].ad}</h1><p class="soluk kucuk" style="margin:0 0 12px">2025-26 sezonu · ${LIGLER[lig].kisa}</p></div>`;
  let icerik;
  switch (sekme) {
    case 'liderler': icerik = liderlerKarti(lig); break;
    case 'takimlar': icerik = takimlarKarti(lig); break;
    case 'oyuncular': icerik = oyuncularKarti(lig); break;
    default: icerik = tabloKarti(lig);
  }
  return `<div class="dar">${baslikHtml}${sekmeler}${icerik}${altBilgi()}</div>`;
}

function tabloKarti(lig, ilk = null) {
  const t = ligVerisi(lig, 'tablo');
  if (!t) return '<p class="bos">Yükleniyor…</p>';
  const satirlar = (ilk ? t.slice(0, ilk) : t).map(s => `<tr class="tikla" onclick="location.hash='#/takim/${lig}/${s.id}'">
      <td class="sira">${s.sira}</td><td class="takim-ad">${esc(baslik(s.ad))}</td>
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

function liderOzeti(lig) {
  const l = ligVerisi(lig, 'liderler');
  if (!l) return '';
  const kat = l.kategoriler.filter(k => ['sayi', 'rib', 'ast', 'vp'].includes(k.id));
  return `<div class="kart"><div class="baslik-satir"><h2>${LIGLER[lig].kisa} liderleri</h2><a href="#/lig/${lig}/liderler">Tümü ›</a></div>
    ${kat.map(k => `<p class="soluk kucuk" style="margin:10px 0 2px;font-weight:700">${esc(k.ad)}</p>${liderListesi(lig, k, 3)}`).join('')}</div>`;
}

function gorunumAna() {
  const sutun = lig => `<div>${buHaftaKarti(lig)}${tabloKarti(lig, 6)}${liderOzeti(lig)}</div>`;
  return `<div class="karsilama"><img src="icon-192.png" alt=""><div><strong>Pota Altı</strong><small>TBL ve BSL canlı skorlar, istatistikler ve fantezi ligleri</small></div></div>
    <div class="iki-sutun">${sutun('tbl')}${sutun('bsl')}</div>
    <div class="iki-sutun">${fantezKartlari()}</div>${altBilgi()}`;
}

// ---------- Fantezi ----------
function fantezKartlari() {
  return `<a class="kart fantezi-kart" href="${TBL_FANTEZI}" target="_blank" rel="noopener"><strong>⭐ TBL Fantezi Ligi ›</strong>
      <span class="soluk">Haftalık VP sıralaması, genel klasman, takımlar ve boştaki oyuncular.</span></a>
    <div class="kart fantezi-kart"><strong>🏀 BSL Fantezi Ligi</strong><span class="soluk">Canlı draft, takaslar, haftalık puanlama. Katıl üyelerine özel; yakında.</span></div>`;
}
function gorunumFantezi() {
  return `<div class="sayfa-baslik"><h1>Fantezi ligleri</h1><p class="soluk">Pota Altı'nın fantezi ligleri. Şimdilik TBL Fantezi Ligi kendi sayfasında açılır; ligler uygulamanın içine taşınacak.</p></div>${fantezKartlari()}`;
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
});
document.addEventListener('input', e => {
  const k = e.target.dataset?.ui;
  if (!k) return;
  S.ui[k] = e.target.value;
  ciz();
});
window.addEventListener('hashchange', () => { ciz(); window.scrollTo(0, 0); });

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

async function basla() {
  try {
    [S.meta, S.index] = await Promise.all([getir('data/meta.json'), getir(`${KAYNAK}/hafta/index.json`).catch(() => null)]);
  } catch (e) {
    S.hata = `Veriler yüklenemedi: ${e.message}`;
  }
  ciz();
}
basla();

if ('serviceWorker' in navigator && !YEREL) navigator.serviceWorker.register('sw.js').catch(() => {});
