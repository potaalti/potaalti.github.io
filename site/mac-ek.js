// Maç sayfası ekleri: skor farkı grafiği ve gelişmiş istatistikler. Hem Pota Altı App (app.js) hem Fantezi Lig arayüzü
// (fantezi/app.js) kullanır; stiller cila.css'te (iki arayüz de yükler). Veriler: canlı maçta kutu skorun içinden
// (eski TBL sitesinin fetch_tbf.py'si: fark, ev.ileri / dep.ileri, ev.takim / dep.takim), biten maçta veri/uret.py'nin
// data/<lig>/fark/<id>.json ve data/<lig>/ileri-istatistik.json dosyalarından.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  return `<div class="kart fark-kart"><h3>Skor farkı</h3>
    <div class="fark-lejant"><span><i class="ev"></i>${esc(evAd)} önde</span><span><i class="dep"></i>${esc(depAd)} önde</span></div>
    <svg viewBox="0 0 ${G} ${Y}" class="fark-svg" role="img" aria-label="Maç boyunca skor farkı">
      ${etiketler}${cizgiler}
      <path d="${alan(f => Math.max(f, 0))}" class="ev"/><path d="${alan(f => Math.min(f, 0))}" class="dep"/>
      <line x1="${x0}" x2="${x1}" y1="${orta}" y2="${orta}" class="fark-sifir"/>
      <text x="${x1 + 6}" y="${+y(olcek) + 4}">${olcek}</text><text x="${x1 + 6}" y="${orta + 4}">0</text><text x="${x1 + 6}" y="${+y(-olcek) + 4}">${olcek}</text>
    </svg></div>`;
}

// Gelişmiş istatistikler: iki takım karşılıklı çubuklar (o istatistikte önde olan vurgu renginde), altında fark / seri / liderlik
const ILERI_CUBUKLAR = [['tks', 'Top kaybından sayı'], ['hh', 'Hızlı hücum sayısı'], ['is', 'İkinci şans sayısı'], ['ba', 'Boyalı alan sayısı'], ['benc', 'Benç sayısı']];
const dakikaSaniye = sn => `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`;
export function ileriIstatistikKarti(evAd, depAd, ileri) {
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
    <div class="ileri-takimlar"><span>${esc(evAd)}</span><span>${esc(depAd)}</span></div>
    ${ILERI_CUBUKLAR.map(cubuk).join('')}
    ${satir('En büyük fark', ev.fark, dep.fark)}${satir('En büyük seri', ev.seri, dep.seri)}${satir('Liderlik süresi', dakikaSaniye(ev.lider), dakikaSaniye(dep.lider))}
    <div class="ileri-satir orta"><span>Liderlik değişimi <b>${ev.degisim}</b></span><span>Eşitlik <b>${ev.esitlik}</b></span></div></div>`;
}
