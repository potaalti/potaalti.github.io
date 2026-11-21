// Yüzen YouTube oynatıcısı (TBL maç yayınları, data/tbl/yayin.json): sayfa içeriğinin dışında, body'de durur. Canlı skor dakikada
// bir yeniden çizilse de, başka sayfaya (kutu skor, oyuncu, tablo) geçilse de video kesilmez. Kutu skordaki ve Maç yayınları
// sayfasındaki "Maçı izle" düğmeleri (data-oynat) açar. Üst çubuğundan tutup taşınır, sol üst / sağ alt köşesinden tutup
// büyütülüp küçültülür (fare ve dokunma); ⤢ hazır büyük/küçük boyut, ✕ kapatır. Yeri ve boyutu bu cihazda hatırlanır.
// Ana uygulama ve Fantezi ortak kullanır. Adres youtube.com/embed (youtube-nocookie değil): izleyicinin YouTube oturumu
// tanınsın, YouTube Premium üyelerine reklam çıkmasın.
import { esc } from './ortak.js';

let kap = null;
// Oynatıcının durumu (YouTube'un gömülü oynatıcısı postMessage ile bildirir; enablejsapi=1): oynuyor mu, sesi kapalı mı.
// Video oynamaya başlayınca üstüne görünmez perde gelir: fare YouTube'a ulaşmaz, başlık, paylaş, "Diğer videolar" gibi yazılar
// birkaç saniyede kaybolur ve kutu skorda gezinirken geri gelmez. Oynat/durdur, ses ve tam ekran üst çubukta; ⚙ perdeyi
// kaldırır (kalite, altyazı gibi YouTube ayarları için).
const D = { oynuyor: false, sessiz: false, ytKontrol: false };
const KAYIT = 'oynaticiKonum';
const KUCUK = 420, BUYUK = 880, EN_AZ = 240, PAY = 8;

// y: { v: video kimliği, kanal }, ad: "Ev - Deplasman", bitti: maç bitti mi (kaydı)
export const dugme = (y, ad, bitti = false, sinif = 'secenek oynat-dugme') => (y
  ? `<button type="button" class="${sinif}" data-oynat="${esc(JSON.stringify({ v: y.v, ad, kanal: y.kanal }))}">▶ ${bitti ? 'Maçın kaydını izle' : 'Maçı izle'} · ${esc(y.kanal)}</button>`
  : '');

const sinir = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));
function konumOku() {
  try { const k = JSON.parse(localStorage.getItem(KAYIT)); return k && Number.isFinite(k.x) && Number.isFinite(k.y) && Number.isFinite(k.w) ? k : null; } catch { return null; }
}
function konumYaz(k) {
  try { localStorage.setItem(KAYIT, JSON.stringify(k)); } catch { /* gizli pencere: bu oturumda geçerli */ }
}
const ustYukseklik = () => kap.querySelector('.yo-ust')?.offsetHeight ?? 42;
const yukseklik = w => Math.round((w * 9) / 16) + ustYukseklik();

// Pencereyi verilen yere ve genişliğe koyar (ekranın içinde kalacak şekilde); konulan değerleri döndürür
function yerlestir({ x, y, w }) {
  const g = sinir(Math.round(w), Math.min(EN_AZ, innerWidth - 2 * PAY), innerWidth - 2 * PAY);
  const h = yukseklik(g);
  const k = { x: Math.round(sinir(x, PAY, innerWidth - g - PAY)), y: Math.round(sinir(y, PAY, innerHeight - h - PAY)), w: g };
  Object.assign(kap.style, { left: `${k.x}px`, top: `${k.y}px`, width: `${k.w}px`, right: 'auto', bottom: 'auto' });
  kap.classList.add('serbest');
  kap.classList.remove('buyuk');
  return k;
}
const simdiki = () => { const r = kap.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

export function ac({ v, ad, kanal }, buyuk = false) {
  const yeni = !kap;
  if (yeni) {
    kap = document.createElement('div');
    kap.className = 'yuzen-oynatici';
    document.body.append(kap);
  }
  if (kap.dataset.v !== v) {
    kap.dataset.v = v;
    Object.assign(D, { oynuyor: false, sessiz: false, ytKontrol: false });
    kap.classList.remove('perdeli');
    kap.innerHTML = `<div class="yo-ust" data-oynatici-tasi title="Tutup taşı"><span>${esc(ad)}<small>${esc(kanal)} · YouTube</small></span>
      <button type="button" data-oynatici="oynat" title="Oynat / durdur" aria-label="Oynat veya durdur">⏸</button>
      <button type="button" data-oynatici="ses" title="Sesi aç / kapat" aria-label="Sesi aç veya kapat">🔊</button>
      <button type="button" data-oynatici="tam" title="Tam ekran" aria-label="Tam ekran">⛶</button>
      <button type="button" data-oynatici="yt" title="YouTube ayarları (kalite, altyazı)" aria-label="YouTube ayarları">⚙</button>
      <button type="button" data-oynatici="buyut" title="Büyüt / küçült" aria-label="Büyüt veya küçült">⤢</button>
      <button type="button" data-oynatici="kapat" title="Kapat" aria-label="Kapat">✕</button></div>
      <div class="yo-video"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(v)}?autoplay=1&rel=0&playsinline=1&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${esc(ad)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
        <div class="yo-perde" data-oynatici="perde" title="Oynat / durdur (çift tık: tam ekran)"></div></div>
      <span class="yo-tutamak sol-ust" data-oynatici-boyut="sol-ust" title="Tutup büyüt / küçült"></span>
      <span class="yo-tutamak sag-alt" data-oynatici-boyut="sag-alt" title="Tutup büyüt / küçült"></span>`;
  }
  document.body.classList.add('oynatici-acik');
  // Kaydedilmiş yer ve boyut varsa o; yoksa köşedeki varsayılan (Maç yayınları sayfasından açılınca büyük)
  const k = yeni ? konumOku() : null;
  if (k) yerlestir(k);
  else if (yeni) kap.classList.toggle('buyuk', buyuk);
}

// YouTube oynatıcısına komut ve ondan gelen durum bildirimleri
const iframe = () => kap?.querySelector('iframe');
const komut = (func, args = []) => iframe()?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
function dugmeleriGuncelle() {
  if (!kap) return;
  const o = kap.querySelector('[data-oynatici="oynat"]'), s = kap.querySelector('[data-oynatici="ses"]'), y = kap.querySelector('[data-oynatici="yt"]');
  if (o) o.textContent = D.oynuyor ? '⏸' : '▶';
  if (s) s.textContent = D.sessiz ? '🔇' : '🔊';
  y?.classList.toggle('acik', D.ytKontrol);
  // Perde yalnızca video oynarken (oynamadan önce YouTube'un kendi oynat düğmesine dokunulabilsin; telefonda gerekiyor)
  kap.classList.toggle('perdeli', D.oynuyor && !D.ytKontrol);
}
addEventListener('message', e => {
  if (!kap || e.source !== iframe()?.contentWindow) return;
  let v;
  try { v = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  const bilgi = v?.info;
  if (!bilgi || typeof bilgi !== 'object') return;
  if (typeof bilgi.playerState === 'number') D.oynuyor = bilgi.playerState === 1 || bilgi.playerState === 3;
  if (typeof bilgi.muted === 'boolean') D.sessiz = bilgi.muted;
  dugmeleriGuncelle();
});
// Oynatıcı yüklenince durum bildirimlerini iste (YouTube "listening" mesajından sonra infoDelivery gönderir)
document.addEventListener('load', e => {
  if (e.target === iframe()) e.target.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'pota', channel: 'widget' }), '*');
}, true);

function tamEkran() {
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  if (kap?.requestFullscreen) kap.requestFullscreen().catch(() => buyutKucult());
  else if (kap?.webkitRequestFullscreen) kap.webkitRequestFullscreen();
  else buyutKucult(); // iPhone Safari'de öğe tam ekranı yok: en büyük boyut
}

export function kapat() {
  if (document.fullscreenElement === kap) document.exitFullscreen?.();
  kap?.remove();
  kap = null;
  document.body.classList.remove('oynatici-acik');
}

export const acikMi = v => !!kap && (!v || kap.dataset.v === v);

// ⤢: hazır büyük ya da küçük boyut; sağ alt köşesi yerinde kalır
function buyutKucult() {
  const s = simdiki();
  const telefon = innerWidth < 760;
  const hedef = s.w < (telefon ? innerWidth - 4 * PAY : BUYUK - 40) ? (telefon ? innerWidth : BUYUK) : (telefon ? innerWidth * 0.6 : KUCUK);
  const g = Math.min(hedef, innerWidth - 2 * PAY);
  konumYaz(yerlestir({ x: s.x + s.w - g, y: s.y + s.h - yukseklik(g), w: g }));
}

// Taşıma (üst çubuk) ve boyutlandırma (köşeler): fare ve dokunma; sürüklerken video olayları yutmasın diye üstüne perde
function surukle(e, tur) {
  if (e.button > 0) return;
  e.preventDefault();
  const bas = { px: e.clientX, py: e.clientY, ...simdiki() };
  let son = null;
  kap.classList.add('suruklen');
  const hareket = ev => {
    const dx = ev.clientX - bas.px, dy = ev.clientY - bas.py;
    if (tur === 'tasi') { son = yerlestir({ x: bas.x + dx, y: bas.y + dy, w: bas.w }); return; }
    // Köşeden: yatay ya da dikey hangisi çok çekildiyse; karşı köşe yerinde kalır
    const d = Math.abs(dx) >= Math.abs((dy * 16) / 9) ? dx : (dy * 16) / 9;
    const g = sinir(tur === 'sag-alt' ? bas.w + d : bas.w - d, EN_AZ, innerWidth - 2 * PAY);
    son = tur === 'sag-alt' ? yerlestir({ x: bas.x, y: bas.y, w: g })
      : yerlestir({ x: bas.x + bas.w - g, y: bas.y + bas.h - yukseklik(g), w: g });
  };
  const bitir = () => {
    removeEventListener('pointermove', hareket);
    removeEventListener('pointerup', bitir);
    removeEventListener('pointercancel', bitir);
    kap?.classList.remove('suruklen');
    if (son) konumYaz(son);
  };
  addEventListener('pointermove', hareket);
  addEventListener('pointerup', bitir);
  addEventListener('pointercancel', bitir);
}

document.addEventListener('pointerdown', e => {
  if (!kap || !kap.contains(e.target) || e.target.closest('button') || e.target.closest('.yo-perde')) return;
  const b = e.target.closest('[data-oynatici-boyut]');
  if (b) surukle(e, b.dataset.oynaticiBoyut);
  else if (e.target.closest('[data-oynatici-tasi]')) surukle(e, 'tasi');
});

document.addEventListener('click', e => {
  const d = e.target.closest('[data-oynat]');
  if (d) {
    e.preventDefault();
    ac(JSON.parse(d.dataset.oynat), d.dataset.buyuk === '1');
    return;
  }
  const k = e.target.closest('[data-oynatici]');
  if (!k || !kap) return;
  const is = k.dataset.oynatici;
  if (is === 'kapat') kapat();
  else if (is === 'buyut') buyutKucult();
  else if (is === 'oynat' || is === 'perde') { komut(D.oynuyor ? 'pauseVideo' : 'playVideo'); D.oynuyor = !D.oynuyor; dugmeleriGuncelle(); }
  else if (is === 'ses') { komut(D.sessiz ? 'unMute' : 'mute'); D.sessiz = !D.sessiz; dugmeleriGuncelle(); }
  else if (is === 'tam') tamEkran();
  else if (is === 'yt') { D.ytKontrol = !D.ytKontrol; dugmeleriGuncelle(); }
});
document.addEventListener('dblclick', e => { if (e.target.closest?.('.yo-perde')) tamEkran(); });

// Ekran döndürülünce ya da pencere küçülünce oynatıcı dışarıda kalmasın
addEventListener('resize', () => { if (kap?.classList.contains('serbest')) yerlestir(simdiki()); });
