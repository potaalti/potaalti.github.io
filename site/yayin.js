// Pota Altı YouTube: son canlı yayınlar ve videolar (veri/uret.py'nin ürettiği data/youtube.json) ve kanalın şu an canlı
// olup olmadığı (YouTube'un gömülü oynatıcısıyla sayfada sorgulanır, API anahtarı gerekmez).
import { esc, getir } from './ortak.js';

const Y = { veri: undefined, canli: null, kontrolZamani: 0, secili: null };
let ciz = () => {};
export const baglan = cizFn => { ciz = cizFn; };

function yukle() {
  if (Y.veri !== undefined || Y.yukleniyor) return;
  Y.yukleniyor = true;
  getir('data/youtube.json').then(v => { Y.veri = v; }).catch(() => { Y.veri = null; })
    .finally(() => { Y.yukleniyor = false; ciz(); canliKontrol(); });
}

const kanalLinki = k => `https://www.youtube.com/@${k.kullanici}`;
const gorsel = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const oynatici = (id, baslik) => `<div class="oynatici"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="${esc(baslik)}"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;

// ---------- Şu an canlı mı? ----------
function ytApi() {
  return new Promise(ok => {
    if (window.YT?.Player) return ok(window.YT);
    const onceki = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { onceki?.(); ok(window.YT); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.append(s);
    }
  });
}

// Kanalın canlı yayın adresi (live_stream) gizli bir oynatıcıda açılır: yayın varsa videonun kimliği ve başlığı gelir
export async function canliKontrol() {
  const kanal = Y.veri?.kanal?.id;
  if (!kanal || document.hidden || Date.now() - Y.kontrolZamani < 3 * 60000) return;
  Y.kontrolZamani = Date.now();
  try {
    const YT = await Promise.race([ytApi(), new Promise((_, h) => setTimeout(() => h(new Error('zaman aşımı')), 10000))]);
    const kap = document.createElement('div');
    kap.style.cssText = 'position:absolute;width:2px;height:2px;left:-9999px;top:0;overflow:hidden';
    const ic = document.createElement('div');
    kap.append(ic);
    document.body.append(kap);
    const d = await new Promise(ok => {
      new YT.Player(ic, {
        width: 2, height: 2, videoId: 'live_stream', playerVars: { channel: kanal, mute: 1 },
        events: { onReady: e => ok(e.target.getVideoData()), onError: () => ok(null) },
      });
      setTimeout(() => ok(null), 15000);
    });
    kap.remove();
    const yeni = d && d.video_id && d.video_id !== 'live_stream' && (d.isLive || d.isPlayable) ? { id: d.video_id, baslik: d.title || 'Canlı yayın' } : null;
    if (JSON.stringify(yeni) !== JSON.stringify(Y.canli)) { Y.canli = yeni; ciz(); }
  } catch { /* YouTube'a ulaşılamazsa canlı kartı gösterilmez */ }
}
setInterval(canliKontrol, 3 * 60000);

// ---------- Görünümler ----------
// Ana sayfanın en üstü: kanal canlıysa canlı yayın, değilse son canlı yayın
export function anaKart() {
  yukle();
  const v = Y.veri;
  if (!v) return '';
  if (Y.canli) {
    return `<a class="kart canli-kart" href="#/yayin"><span class="canli-rozet">● CANLI</span>
      <div><strong>Pota Altı şu an canlı</strong><small>${esc(Y.canli.baslik)}</small></div><span class="izle">İzle ›</span></a>`;
  }
  const son = v.yayinlar.find(y => !y.planli) ?? v.videolar.find(x => !x.kisa);
  if (!son) return '';
  return `<a class="kart son-yayin" href="#/yayin/${son.id}"><img src="${gorsel(son.id)}" alt="" loading="lazy">
    <div><small class="soluk">Son yayın · YouTube</small><strong>${esc(son.baslik)}</strong>${son.bilgi ? `<small class="soluk">${esc(son.bilgi)}</small>` : ''}</div></a>`;
}

const kart = (x, kisa = false) => `<a class="video-kart ${kisa ? 'kisa' : ''}" href="#/yayin/${x.id}">
  <span class="kapak"><img src="${gorsel(x.id)}" alt="" loading="lazy">${x.canli ? '<span class="canli-rozet">● CANLI</span>' : ''}</span>
  <strong>${esc(x.baslik)}</strong>${x.bilgi ? `<small>${esc(x.bilgi)}</small>` : x.tarih ? `<small>${new Date(x.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</small>` : ''}</a>`;

export function gorunum(secilenId) {
  yukle();
  const v = Y.veri;
  if (v === undefined) return '<p class="bos">Yükleniyor…</p>';
  if (!v) return '<div class="kart"><p class="bos">Yayın bilgileri yüklenemedi.</p></div>';
  const tumu = [...v.yayinlar, ...v.videolar];
  const secili = secilenId ? (tumu.find(x => x.id === secilenId) ?? { id: secilenId, baslik: Y.canli?.id === secilenId ? Y.canli.baslik : '' })
    : Y.canli ?? v.yayinlar.find(y => !y.planli) ?? v.videolar[0];
  const kisalar = v.videolar.filter(x => x.kisa);
  const uzunlar = v.videolar.filter(x => !x.kisa && !v.yayinlar.some(y => y.id === x.id));
  return `<div class="sayfa-baslik baslik-satir"><h1>Pota Altı YouTube</h1>
      <span class="satir"><a class="secenek" href="${kanalLinki(v.kanal)}" target="_blank" rel="noopener">Kanala git ›</a>
      <a class="secenek aktif" href="${kanalLinki(v.kanal)}/join" target="_blank" rel="noopener">Katıl</a></span></div>
    ${Y.canli ? `<p style="margin:0 0 10px"><span class="canli-rozet">● CANLI</span> <b>Pota Altı şu an yayında</b></p>` : ''}
    ${secili ? `<div class="kart" style="padding:0;overflow:hidden">${oynatici(secili.id, secili.baslik)}
      ${secili.baslik ? `<p style="margin:0;padding:12px 14px"><b>${esc(secili.baslik)}</b>${secili.bilgi ? `<br><small class="soluk">${esc(secili.bilgi)}</small>` : ''}</p>` : ''}</div>` : ''}
    ${v.yayinlar.length ? `<h2>Canlı yayınlar</h2><div class="video-izgara">${v.yayinlar.map(x => kart(x)).join('')}</div>` : ''}
    ${uzunlar.length ? `<h2>Videolar</h2><div class="video-izgara">${uzunlar.map(x => kart(x)).join('')}</div>` : ''}
    ${kisalar.length ? `<h2>Kısa videolar</h2><div class="video-izgara kisalar">${kisalar.map(x => kart(x, true)).join('')}</div>` : ''}
    <p class="alt-bilgi">Liste ${v.guncelleme ? new Date(v.guncelleme).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'} itibarıyla; canlı yayın birkaç dakikada bir kontrol edilir.</p>`;
}
