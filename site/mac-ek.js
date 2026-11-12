// Maç sayfasının gövdesi: çeyrek skorları, skor farkı grafiği, iki takımın kutu skoru, gelişmiş istatistikler ve açıklama.
// KULLANICI KURALI: ana uygulamadaki (app.js) box score ile Fantezi Lig arayüzündeki (fantezi/app.js) box score AYNI
// olmalı; ikisi de bu dosyayı kullanır, değişiklik burada yapılır. Arayüze özgü olan yalnızca: takım başlığı (bağlantı),
// oyuncu adı bağlantısı, "benim oyuncum" vurgusu ve açıklamaya eklenen cümle (ayar olarak verilir).
// Stiller cila.css'te (iki arayüz de yükler). Veriler: canlı maçta kutu skorun içinden (eski TBL sitesinin fetch_tbf.py'si:
// fark, ev/dep.ileri, ev/dep.takim, oyuncu.sahada), biten maçta veri/uret.py'nin data/<lig>/fark/<id>.json,
// ileri-istatistik.json ve takim-istatistik.json dosyalarından.
import { esc, baslik, sureSn } from './ortak.js';

// ---------- Kutu skor ----------
const atis = ([b, d] = [0, 0]) => `${b}/${d}`;
// Kutu skor sütunları: [başlık, değer, toplam alanı, hücre sınıfı, açıklama]
const KUTU_SUTUNLARI = [
  ['Dk', o => o.sure, null, '', 'Süre'], ['Sy', o => o.sayi, 'sayi', '', 'Sayı'],
  ['2S', o => atis(o.iki), 'iki', '', '2 sayılık atış'], ['3S', o => atis(o.uc), 'uc', '', '3 sayılık atış'], ['SA', o => atis(o.sa), 'sa', '', 'Serbest atış'],
  ['HR', o => o.hr ?? '', 'hr', '', 'Hücum ribaundu'], ['SR', o => o.sr ?? '', 'sr', '', 'Savunma ribaundu'],
  ['Rb', o => o.rib, 'rib', 'rb', 'Toplam ribaund'], ['As', o => o.ast, 'ast', '', 'Asist'], ['Tç', o => o.tc, 'tc', '', 'Top çalma'],
  ['Bl', o => o.blk, 'blk', '', 'Blok'], ['Tk', o => o.tk, 'tk', '', 'Top kaybı'], ['F', o => o.faul, 'faul', '', 'Faul'],
  ['+/-', o => o.pm ?? '', null, '', 'Sahadayken skor farkı'], ['VP', o => o.vp, 'vp', 'vp', 'Verimlilik puanı'],
];
const kutuHucresi = (o, [, f, , sinif]) => `<td class="${sinif}">${esc(f(o))}</td>`;
// Başlığa dokununca sıralanır (data-is="kutu-sirala"): önce çoktan aza, sonra azdan çoka, üçüncüde ilk haline döner
export const kutuSiralamaDegistir = (s, b) => (s?.b !== b ? { b, artan: false } : !s.artan ? { b, artan: true } : null);
const kutuBasligi = sirala => KUTU_SUTUNLARI.map(([b, , , sinif, aciklama]) => {
  const s = sirala?.b === b ? sirala : null;
  return `<td class="${sinif} sirala ${s ? 'aktif' : ''}" title="${aciklama}" data-is="kutu-sirala" data-id="${b}">${b}${s ? (s.artan ? '▲' : '▼') : ''}</td>`;
}).join('');
// Sıralama değeri: süre saniye, atışlarda isabet (eşitse deneme), yoksa sayı; değeri olmayan (ör. +/- gelmemiş) hep sonda
function kutuDegeri([b, f, alan], o) {
  if (b === 'Dk') return sureSn(o.sure);
  if (['iki', 'uc', 'sa'].includes(alan)) return (o[alan]?.[0] ?? 0) * 1000 + (o[alan]?.[1] ?? 0);
  const v = f(o);
  return v === '' || v == null ? null : Number(v) || 0;
}
function kutuSirasi(oyuncular, sirala) {
  const c = sirala && KUTU_SUTUNLARI.find(([b]) => b === sirala.b);
  if (!c) return oyuncular;
  return [...oyuncular].sort((x, y) => {
    const a = kutuDegeri(c, x);
    const b = kutuDegeri(c, y);
    if (a == null || b == null) return (a == null) - (b == null);
    return sirala.artan ? a - b : b - a;
  });
}
// Takım satırı: oyuncuya yazılmayan takım ribaundu, takım top kaybı ve takım faulü; toplama da girer
const TAKIM_ALANLARI = ['hr', 'sr', 'rib', 'tk', 'faul'];
const takimSatiri = takim => (!takim ? '' : `<tr class="takim-satir"><th>Takım</th>${KUTU_SUTUNLARI.map(([, , alan, sinif]) =>
  `<td class="${sinif}">${TAKIM_ALANLARI.includes(alan) ? takim[alan] ?? 0 : ''}</td>`).join('')}</tr>`);
function kutuToplami(oyuncular, takim) {
  const topla = alan => oyuncular.reduce((x, o) => x + (Number(o[alan]) || 0), 0) + (takim?.[alan] ?? 0);
  const toplaAtis = alan => atis([0, 1].map(i => oyuncular.reduce((x, o) => x + (o[alan]?.[i] ?? 0), 0)));
  return KUTU_SUTUNLARI.map(([, , alan, sinif]) => `<td class="${sinif}">${!alan ? '' : ['iki', 'uc', 'sa'].includes(alan) ? toplaAtis(alan) : topla(alan)}</td>`).join('');
}
// canli: maç sürüyorsa sahadaki 5 oyuncunun adının sonuna * konur (kutu skorda "sahada" bilgisi varsa)
// Koç adı kaynakta büyük harfle gelebiliyor ("MURAT HÜSEYİN YILMAZ"): "Murat Hüseyin Yılmaz"
const kocAdi = k => {
  const ad = String(k).trim().split(/\s+/);
  const tr = /[İŞĞÜÖÇışğüöç]/.test(k);  // Türkçe harf varsa Türkçe küçük harf (YILMAZ -> Yılmaz), yoksa MARKOVIC -> Markovic
  return ad.map(w => (w === w.toLocaleUpperCase('tr') ? w[0] + (tr ? w.slice(1).toLocaleLowerCase('tr') : w.slice(1).toLowerCase()) : w)).join(' ');
};
function kutuSkorTablosu(t, takim, a, koc) {
  const oyuncular = t.oyuncular ?? [];
  const satirlar = kutuSirasi(oyuncular, a.sirala).map(o => {
    const sahada = a.canli && o.sahada;
    const ad = a.oyuncuAdi(o);
    return `<tr class="${sureSn(o.sure) > 0 ? '' : 'oynamadi'} ${a.benimMi(String(o.id)) ? 'ben benim-oyuncu' : ''}"><th${sahada ? ' class="sahada"' : ''}>${o.ilk5 ? `<b>${ad}</b>` : ad}${sahada ? '<span class="sahada-yildiz">*</span>' : ''}</th>
      ${KUTU_SUTUNLARI.map(c => kutuHucresi(o, c)).join('')}</tr>`;
  }).join('');
  return `<div class="kart"><h3>${a.takimBasligi(t)}${koc ? ` <small class="koc">Koç: ${esc(kocAdi(koc))}</small>` : ''}</h3><div class="tablo-kap"><table class="kutu">
    <thead><tr><th>Oyuncu</th>${kutuBasligi(a.sirala)}</tr></thead>
    <tbody>${satirlar}${takimSatiri(takim)}<tr class="toplam"><th>Toplam</th>${kutuToplami(oyuncular, takim)}</tr></tbody></table></div></div>`;
}
function ceyrekTablosu(k, a) {
  const n = Math.max(k.ev.ceyrekler?.length ?? 0, k.dep.ceyrekler?.length ?? 0);
  if (!n) return '';
  const hucre = i => (i < 4 ? `Ç${i + 1}` : `U${i - 3}`);
  const satir = t => `<tr><th>${a ? a.takimBasligi(t) : esc(baslik(t.ad))}</th>${Array.from({ length: n }, (_, i) => `<td>${t.ceyrekler?.[i] ?? '–'}</td>`).join('')}<td><b>${t.skor ?? 0}</b></td></tr>`;
  return `<div class="kart"><div class="tablo-kap"><table class="kutu ceyrek">
    <thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<td>${hucre(i)}</td>`).join('')}<td>T</td></tr></thead>
    <tbody>${satir(k.ev)}${satir(k.dep)}</tbody></table></div></div>`;
}

// Maç sayfasının kutu skor bölümü (başlık kartından sonrası). Ayarlar:
//   canli: maç sürüyor mu (sahadaki 5'e *), takimIst: { ev, dep } biten maçın takım istatistiği (canlıda kutudan gelir),
//   ileriDosya: biten maçın gelişmiş istatistiği, fark: skor farkı verisi, sirala: sıralama durumu,
//   takimBasligi(t), oyuncuAdi(o): arayüze göre HTML; benimMi(id): oyuncu benim fantezi takımımda mı; aciklamaEki: açıklamanın sonu
export function macGovdesi(kutu, ayar) {
  const a = { takimBasligi: t => esc(baslik(t.ad)), oyuncuAdi: o => esc(o.ad), benimMi: () => false, aciklamaEki: '', ...ayar };
  const evAd = baslik(kutu.ev.ad), depAd = baslik(kutu.dep.ad);
  const ileri = ileriVerisi(kutu, a.ileriDosya);
  return `${ceyrekTablosu(kutu, a)}${farkGrafigi(evAd, depAd, kutu.fark ?? a.fark)}
    ${kutuSkorTablosu(kutu.ev, kutu.ev.takim ?? a.takimIst?.ev, a, kutu.ev.koc ?? ileri?.ev?.koc)}${kutuSkorTablosu(kutu.dep, kutu.dep.takim ?? a.takimIst?.dep, a, kutu.dep.koc ?? ileri?.dep?.koc)}
    ${ileriIstatistikKarti(evAd, depAd, ileri, a.takimBasligi(kutu.ev), a.takimBasligi(kutu.dep))}
    <p class="soluk kucuk">Kalın: ilk 5${a.canli ? ' · *: sahada' : ''} · 2S/3S/SA: isabet/deneme · Tç: top çalma · Bl: blok · Tk: top kaybı · VP: verimlilik${a.aciklamaEki}</p>`;
}

// Skor farkı grafiği (kullanıcı: geçmiş haftalara gerek yok): veri bu haftalardan itibaren var; veri/uret.py FARK_ILK_HAFTA ile aynı
export const FARK_ILK_HAFTA = { bsl: 7, tbl: 10 };
export const farkVarMi = (lig, hafta) => Number(hafta) >= (FARK_ILK_HAFTA[lig] ?? Infinity);

// Kutu skorun yanındaki ek veriler: canlıda kutunun içinden, yoksa (biten maç) dosyadan gelen değer
export const ileriVerisi = (kutu, dosyadan) => (kutu.ev.ileri && kutu.dep.ileri ? { ev: kutu.ev.ileri, dep: kutu.dep.ileri } : dosyadan);

// fark: { sure, simdi, d: [[saniye, ev - deplasman], ...] }. Ev sahibi öndeyken üstte vurgu renginde, deplasman öndeyken
// altta turuncu. Noktalar arası düz çizgiyle birleşir (yumuşak görünüm); sıfırı kestiği yer araya eklenir ki renkler doğru ayrılsın.
export function farkGrafigi(evAd, depAd, fark) {
  const d = fark?.d;
  if (!d?.length || !fark.sure) return '';
  const G = 400, Y = 160, x0 = 4, x1 = 368, ust = 18, alt = 154, orta = (ust + alt) / 2;
  const enCok = Math.max(5, ...d.map(([, f]) => Math.abs(f)));
  const olcek = Math.ceil(enCok / 5) * 5;
  const x = t => (x0 + (Math.min(t, fark.sure) / fark.sure) * (x1 - x0)).toFixed(1);
  const y = f => (orta - (f / olcek) * (orta - ust)).toFixed(1);
  const son = Math.min(fark.sure, Math.max(fark.simdi ?? 0, d[d.length - 1][0]));
  // Aynı saniyedeki olaylardan (serbest atışlar) sonuncusu kalır; son nokta o anki farkla grafiğin sonuna uzar
  const noktalar = [];
  for (const [t, f] of d) {
    if (noktalar.length && noktalar[noktalar.length - 1][0] === t) noktalar[noktalar.length - 1][1] = f;
    else noktalar.push([t, f]);
  }
  if (noktalar[noktalar.length - 1][0] < son) noktalar.push([son, noktalar[noktalar.length - 1][1]]);
  const tam = [noktalar[0]];
  for (let i = 1; i < noktalar.length; i++) {
    const [ta, fa] = noktalar[i - 1];
    const [tb, fb] = noktalar[i];
    if (fa * fb < 0) tam.push([ta + ((tb - ta) * fa) / (fa - fb), 0]);
    tam.push([tb, fb]);
  }
  const alan = kirp => `M${x(tam[0][0])} ${y(0)} ${tam.map(([t, f]) => `L${x(t)} ${y(kirp(f))}`).join(' ')} L${x(son)} ${y(0)} Z`;
  const periyotlar = [[0, 600, '1.Ç'], [600, 1200, '2.Ç'], [1200, 1800, '3.Ç'], [1800, 2400, '4.Ç']];
  for (let b = 2400, n = 1; b < fark.sure; b += 300, n++) periyotlar.push([b, b + 300, `U${n}`]);
  const cizgiler = periyotlar.slice(1).map(([b]) => `<line x1="${x(b)}" x2="${x(b)}" y1="${ust}" y2="${alt}" class="fark-periyot"/>`).join('');
  const etiketler = periyotlar.map(([b, s, ad]) => `<text x="${((+x(b) + +x(s)) / 2).toFixed(1)}" y="12" text-anchor="middle">${ad}</text>`).join('');
  // Dokunma / tıklama göstergesi için (farkImleci): gerçek fark değerleri (basamaklı) ve çizim ölçüleri
  const veri = { sure: fark.sure, son, d: noktalar, ev: evAd, dep: depAd, x0, x1, ust, alt, orta, olcek, G };
  return `<div class="kart fark-kart"><h3>Skor farkı</h3>
    <div class="fark-lejant"><span><i class="ev"></i>${esc(evAd)} önde</span><span><i class="dep"></i>${esc(depAd)} önde</span></div>
    <div class="fark-kap"><div class="fark-balon" hidden></div>
    <svg viewBox="0 0 ${G} ${Y}" class="fark-svg" role="img" aria-label="Maç boyunca skor farkı" data-fark="${esc(JSON.stringify(veri))}">
      ${etiketler}${cizgiler}
      <path d="${alan(f => Math.max(f, 0))}" class="ev"/><path d="${alan(f => Math.min(f, 0))}" class="dep"/>
      <line x1="${x0}" x2="${x1}" y1="${orta}" y2="${orta}" class="fark-sifir"/>
      <text x="${x1 + 6}" y="${+y(olcek) + 4}">${olcek}</text><text x="${x1 + 6}" y="${orta + 4}">0</text><text x="${x1 + 6}" y="${+y(-olcek) + 4}">${olcek}</text>
      <line class="fark-imlec" x1="0" x2="0" y1="${ust}" y2="${alt}" visibility="hidden"/><circle class="fark-nokta" r="4" cx="0" cy="0" visibility="hidden"/>
    </svg></div>
    <p class="soluk kucuk fark-ipucu">Grafiğe dokun ya da basılı tutup kaydır: o dakikadaki fark yazar.</p></div>`;
}

// Grafikte dokunulan / tıklanan andaki dakika ve fark: telefonda basılı tutup yana kaydırınca değişir (sayfa dikey kaymaya devam
// eder, CSS touch-action: pan-y), bilgisayarda tıklayınca ya da basılıyken sürükleyince. Sayfa her yeniden çizildiğinde grafik
// yenilendiği için dinleyiciler belgeye bir kez bağlanır.
function farkAni(v, t) {
  let f = 0;
  for (const [tn, fn] of v.d) { if (tn > t) break; f = fn; }
  let periyot, kalan;
  if (t <= 2400) { const p = Math.min(4, Math.floor(t / 600) + 1); periyot = `${p}. Çeyrek`; kalan = p * 600 - t; }
  else { const n = Math.ceil((t - 2400) / 300); periyot = `${n}. Uzatma`; kalan = 2400 + n * 300 - t; }
  kalan = Math.max(0, Math.round(kalan));
  const saat = `${String(Math.floor(kalan / 60)).padStart(2, '0')}:${String(kalan % 60).padStart(2, '0')}`;
  const durum = f === 0 ? '<b>Eşit</b>' : `<b class="${f > 0 ? 'ev' : 'dep'}">${esc(f > 0 ? v.ev : v.dep)} +${Math.abs(f)}</b>`;
  return `<span>${periyot} · ${saat} <small>(${Math.min(Math.floor(t / 60) + 1, Math.ceil(v.sure / 60))}. dk)</small></span>${durum}`;
}
const farkOku = svg => { try { return JSON.parse(svg.dataset.fark); } catch { return null; } };
// Parmağın / farenin olduğu yerdeki an (maç başından saniye)
function farkAnBul(e, svg, v) {
  const r = svg.getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * v.G;
  return Math.max(0, Math.min(v.son, ((vx - v.x0) / (v.x1 - v.x0)) * v.sure));
}
function farkAnGoster(svg, v, t) {
  t = Math.min(t, v.son);
  const x = v.x0 + (t / v.sure) * (v.x1 - v.x0);
  // Noktanın yüksekliği çizilen şekilden (noktalar arası düz çizgi)
  let fy = 0;
  for (let i = 0; i < v.d.length; i++) {
    const [ta, fa] = v.d[i];
    const [tb, fb] = v.d[i + 1] ?? [v.son, fa];
    if (t >= ta && t <= tb) { fy = tb > ta ? fa + ((fb - fa) * (t - ta)) / (tb - ta) : fb; break; }
  }
  const y = v.orta - (fy / v.olcek) * (v.orta - v.ust);
  const imlec = svg.querySelector('.fark-imlec');
  const nokta = svg.querySelector('.fark-nokta');
  imlec.setAttribute('x1', x); imlec.setAttribute('x2', x); imlec.setAttribute('visibility', 'visible');
  nokta.setAttribute('cx', x); nokta.setAttribute('cy', y); nokta.setAttribute('visibility', 'visible');
  const balon = svg.parentElement.querySelector('.fark-balon');
  balon.innerHTML = farkAni(v, t);
  balon.hidden = false;
  // Balon imlecin hizasında, noktanın üstüne binmesin diye nokta üst yarıdaysa grafiğin altında; kenarlardan taşmaz
  balon.classList.toggle('alt', y < v.orta);
  const genislik = svg.getBoundingClientRect().width;
  const w = balon.offsetWidth;
  balon.style.left = `${Math.max(0, Math.min(genislik - w, (x / v.G) * genislik - w / 2))}px`;
}
if (typeof document !== 'undefined' && !globalThis.farkImleciKurulu) {
  globalThis.farkImleciKurulu = true;
  // Seçilen an hatırlanır: sayfa yeniden çizilince (veri gelince, canlıda dakikalık yenileme) yeni grafikte de gösterilir
  let surukle = false;
  let secili = null; // { anahtar: iki takım adı, t }
  const anahtar = v => `${v.ev}|${v.dep}`;
  const goster = (e, svg) => {
    const v = farkOku(svg);
    if (!v) return;
    secili = { anahtar: anahtar(v), t: farkAnBul(e, svg, v) };
    farkAnGoster(svg, v, secili.t);
  };
  document.addEventListener('pointerdown', e => {
    const svg = e.target.closest?.('.fark-svg');
    if (!svg) return;
    surukle = true;
    goster(e, svg);
  });
  document.addEventListener('pointermove', e => {
    if (!surukle || (e.buttons === 0 && e.pointerType !== 'touch')) return;
    const svg = document.querySelector('.fark-svg');
    if (svg) goster(e, svg);
  });
  const birak = () => { surukle = false; };
  document.addEventListener('pointerup', birak);
  document.addEventListener('pointercancel', birak);
  new MutationObserver(() => {
    const svg = secili && document.querySelector('.fark-svg');
    if (!svg || svg.querySelector('.fark-imlec')?.getAttribute('visibility') === 'visible') return;
    const v = farkOku(svg);
    if (v && anahtar(v) === secili.anahtar) farkAnGoster(svg, v, secili.t);
  }).observe(document.body, { childList: true, subtree: true });
}

// Gelişmiş istatistikler: iki takım karşılıklı çubuklar (o istatistikte önde olan vurgu renginde), altında fark / seri / liderlik
const ILERI_CUBUKLAR = [['tks', 'Top kaybından sayı'], ['hh', 'Hızlı hücum sayısı'], ['is', 'İkinci şans sayısı'], ['ba', 'Boyalı alan sayısı'], ['benc', 'Benç sayısı']];
const dakikaSaniye = sn => `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`;
export function ileriIstatistikKarti(evAd, depAd, ileri, evLink, depLink) {
  const ev = ileri?.ev;
  const dep = ileri?.dep;
  if (!ev || !dep) return '';
  const cubuk = ([k, ad]) => {
    const a = ev[k] ?? 0;
    const b = dep[k] ?? 0;
    const pay = v => (a + b ? Math.max(12, Math.round((v / (a + b)) * 100)) : 12);
    return `<div class="ileri-cubuk"><div class="ileri-iz sol"><span class="${a > b ? 'onde' : ''}" style="width:${pay(a)}%">${a}</span></div>
      <div class="ileri-ad">${ad}</div><div class="ileri-iz"><span class="${b > a ? 'onde' : ''}" style="width:${pay(b)}%">${b}</span></div></div>`;
  };
  const satir = (ad, a, b) => `<div class="ileri-satir"><b>${a}</b><span>${ad}</span><b>${b}</b></div>`;
  return `<div class="kart ileri-kart"><h3>Gelişmiş istatistikler</h3>
    <div class="ileri-takimlar"><span>${evLink ?? esc(evAd)}</span><span>${depLink ?? esc(depAd)}</span></div>
    ${ILERI_CUBUKLAR.filter(([k]) => ev[k] != null && dep[k] != null).map(cubuk).join('')}
    ${satir('En büyük fark', ev.fark, dep.fark)}${satir('En büyük seri', ev.seri, dep.seri)}${satir('Liderlik süresi', dakikaSaniye(ev.lider), dakikaSaniye(dep.lider))}
    <div class="ileri-satir orta"><span>Liderlik değişimi <b>${ev.degisim}</b></span><span>Eşitlik <b>${ev.esitlik}</b></span></div></div>`;
}
