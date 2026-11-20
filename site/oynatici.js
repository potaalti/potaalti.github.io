// Yüzen YouTube oynatıcısı (TBL maç yayınları, data/tbl/yayin.json): sayfa içeriğinin dışında, body'de durur. Canlı skor dakikada
// bir yeniden çizilse de, başka sayfaya (kutu skor, oyuncu, tablo) geçilse de video kesilmez. Kutu skordaki ve Maç yayınları
// sayfasındaki "Maçı izle" düğmeleri (data-oynat) açar; ⤢ büyütür/küçültür, ✕ kapatır. Ana uygulama ve Fantezi ortak kullanır.
import { esc } from './ortak.js';

let kap = null;

// y: { v: video kimliği, kanal }, ad: "Ev - Deplasman", bitti: maç bitti mi (kaydı)
export const dugme = (y, ad, bitti = false, sinif = 'secenek oynat-dugme') => (y
  ? `<button type="button" class="${sinif}" data-oynat="${esc(JSON.stringify({ v: y.v, ad, kanal: y.kanal }))}">▶ ${bitti ? 'Maçın kaydını izle' : 'Maçı izle'} · ${esc(y.kanal)}</button>`
  : '');

export function ac({ v, ad, kanal }, buyuk = false) {
  if (!kap) {
    kap = document.createElement('div');
    kap.className = 'yuzen-oynatici';
    document.body.append(kap);
  }
  if (kap.dataset.v !== v) {
    kap.dataset.v = v;
    kap.innerHTML = `<div class="yo-ust"><span>${esc(ad)}<small>${esc(kanal)} · YouTube</small></span>
      <button type="button" data-oynatici="buyut" title="Büyüt / küçült" aria-label="Büyüt veya küçült">⤢</button>
      <button type="button" data-oynatici="kapat" title="Kapat" aria-label="Kapat">✕</button></div>
      <div class="yo-video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}?autoplay=1&rel=0&playsinline=1" title="${esc(ad)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  kap.classList.toggle('buyuk', buyuk);
  document.body.classList.add('oynatici-acik');
}

export function kapat() {
  kap?.remove();
  kap = null;
  document.body.classList.remove('oynatici-acik');
}

export const acikMi = v => !!kap && (!v || kap.dataset.v === v);

document.addEventListener('click', e => {
  const d = e.target.closest('[data-oynat]');
  if (d) {
    e.preventDefault();
    ac(JSON.parse(d.dataset.oynat), d.dataset.buyuk === '1');
    return;
  }
  const k = e.target.closest('[data-oynatici]');
  if (!k) return;
  if (k.dataset.oynatici === 'kapat') kapat();
  else kap?.classList.toggle('buyuk');
});
