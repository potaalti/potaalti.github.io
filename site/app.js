import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously, signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import * as F from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import * as C from './core.js';
import * as D from './db.js';

// Bilgisayarda (localhost) açılınca gerçek Firebase yerine yerel emülatör kullanılır (deneme draftı için)
const YEREL = ['localhost', '127.0.0.1'].includes(location.hostname);
const app = initializeApp(YEREL ? { projectId: 'demo-bsl-draft', apiKey: 'demo-key' } : firebaseConfig);
const auth = getAuth(app);
const fdb = F.getFirestore(app);
if (YEREL) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  F.connectFirestoreEmulator(fdb, '127.0.0.1', 8080);
}
D.baglan(F, fdb);

const KOD_ANAHTARI = 'bslDraftKod';
const KURA_ARALIK_MS = 1500; // kurada takımlar 17. sıradan 1. sıraya doğru bu aralıkla açılır
const DRAFT_ASAMALARI = ['kurulum', 'kura', 'draft', 'duraklatildi'];

const S = {
  hazir: false, ligYok: false, hataMesaji: null,
  uid: null, kod: null, ben: null, saatFarki: 0,
  ayar: null, durum: null, takimlar: {}, kadrolar: {}, secimler: {}, teklifler: {}, hareketler: {},
  havuz: [], havuzMap: new Map(), havuzYuklendi: false, mevkiler: {},
  rehber: new Map(), index: null, haftalar: {}, haftalarYuklendi: false,
  kodlar: null, kuraAcilan: -1, sonUyarilan: null,
  ui: {
    draftSekme: 'oyuncular', ara: '', bslTakim: '', sadeceTurk: false, alinanlar: false, mevkiFiltre: '', belirsiz: false,
    puanSekme: 'genel', acik: null, faAl: null, dizilis: null,
    takasTakim: '', verilen: [], alinan: [],
  },
};
let secimDinleyici = null;
if (YEREL) window.S = S; // yerel denemede durumu konsoldan incelemek için

// ---------- Yardımcılar ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sayi = n => (Math.round((n ?? 0) * 10) / 10).toLocaleString('tr-TR');
const simdi = () => Date.now() + S.saatFarki;
const takimlar = () => Object.values(S.takimlar).sort((a, b) => a.no - b.no);
const takimAdi = tid => S.takimlar[tid]?.ad ?? tid;
const kadroBoyu = () => (S.ayar?.asSayisi ?? 5) + (S.ayar?.yedekSayisi ?? 2);
const benimTakimim = () => (S.ben && S.ben !== 'admin' ? S.ben : null);
const yonetici = () => S.ben === 'admin';
const asama = () => S.durum?.asama;
// Herkesin ana ekranı (yönetici değiştirir): draft bitmeden hep draft ekranı, sonra 'draft' ya da 'lig'
const ligEkraniMi = d => ['kadro', 'sezon'].includes(d?.asama) && (d.ekran ?? (d.asama === 'sezon' ? 'lig' : 'draft')) === 'lig';
const ligEkrani = () => ligEkraniMi(S.durum);
const tarih = ts => (ts?.toDate ? ts.toDate() : new Date(ts)).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function oyuncu(pid) {
  return S.rehber.get(pid) ?? S.havuzMap.get(pid)
    ?? { id: pid, ad: Object.values(S.secimler).find(s => s.oyuncu === pid)?.ad ?? `Oyuncu ${pid}`, takim: '', turk: false, vpOrt: 0, mac: 0 };
}
const turkMu = pid => !!oyuncu(pid).turk;
// Oyuncunun mevkisi (Ön/Arka): yöneticinin belirlediği, yoksa istatistik tahmini
const mevki = pid => S.mevkiler[pid] ?? S.havuzMap.get(pid)?.mevki ?? oyuncu(pid).mevkiTahmini ?? 'arka';
const bilgi = pid => ({ id: pid, mevki: mevki(pid), turk: turkMu(pid), vpOrt: oyuncu(pid).vpOrt ?? 0 });
// Draftta kurallar havuzdaki mevkiye bakar
const havuzBilgi = pid => {
  const o = S.havuzMap.get(pid);
  return o ? { id: pid, mevki: o.mevki, turk: !!o.turk, vpOrt: o.vpOrt ?? 0 } : bilgi(pid);
};
const kural = () => ({ asOn: S.ayar.asOn ?? 3, asArka: S.ayar.asArka ?? 2, yedek: S.ayar.yedekSayisi });
let kadroTablosu = null;
const izinliTipler = tid => C.izinliTipler(S.kadrolar[tid]?.tip, kadroTablosu ??= C.kadroTablosu(kural()));
// Takımın sıradaki seçimi kısıtlıysa açıklaması ("sadece Türk Arka oyuncu"), değilse null
const secimKisiti = tid => C.kisitMetni(izinliTipler(tid));
const dizilisSorunu = k => C.dizilisHatasi(k.as.map(bilgi), k.yedek.map(bilgi), kural());
const draftDizilisi = idler => C.dizilisOner(idler.map(havuzBilgi), kural());
// BSL takım adı: telefonda kısaltması (BSK, ERK...), geniş ekranda tam adı
const bslTakimHucre = o => `<span class="uzun-ad">${esc(o.takim)}</span><span class="kisa-ad" title="${esc(o.takim)}">${esc(o.takimKod || o.takim)}</span>`;
const mevkiRozeti = m => `<span class="rozet mv" title="${m === 'on' ? 'Ön saha (uzun/forvet)' : 'Arka saha (oyun kurucu/şutör)'}">${C.MEVKI_ADI[m]}</span>`;

// Oyuncu id -> fantezi takımı (kadrolardan)
function sahipler() {
  const m = new Map();
  for (const [tid, k] of Object.entries(S.kadrolar)) for (const p of [...(k.as ?? []), ...(k.yedek ?? [])]) m.set(p, tid);
  return m;
}

function oyuncuAdi(pid, { takim = true } = {}) {
  const o = oyuncu(pid);
  return `${esc(o.ad)} ${mevkiRozeti(mevki(pid))}${o.turk ? ' <span class="rozet tr" title="Türk oyuncu">TR</span>' : ''}${takim && o.takim ? ` <span class="bsl">${esc(o.takimKod || o.takim)}</span>` : ''}`;
}

function bildir(mesaj, hata = false) {
  const el = document.createElement('div');
  el.textContent = mesaj;
  if (hata) el.className = 'hata';
  $('#bildirim').append(el);
  setTimeout(() => el.remove(), hata ? 6000 : 3500);
}

function hataGoster(e) {
  console.warn(e);
  if (e instanceof D.Hata) return bildir(e.message, true);
  if (e?.code === 'permission-denied') return bildir('Bu işleme izin yok (kurallar ya da süre). Sayfayı yenileyip tekrar dene.', true);
  bildir(`Bir hata oluştu: ${e?.message ?? e}`, true);
}

async function jsonGetir(yol) {
  const r = await fetch(yol, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${yol} okunamadı`);
  return r.json();
}

// Bir kadro değişikliğinin geçerli olacağı hafta
function etkinHafta() {
  const h = C.etkinHafta(S.index, S.ayar.baslangicHaftasi, simdi());
  return Math.max(h, S.durum?.aktifHafta ?? 0);
}

function kalanMs() {
  const d = S.durum;
  if (!d?.saatBaslangic?.toMillis) return null;
  return d.saatBaslangic.toMillis() + d.saatSure * 1000 - simdi();
}

function siradakiTakim() {
  const d = S.durum;
  return d && ['draft', 'duraklatildi'].includes(d.asama) ? d.secimSirasi[d.secimNo] : null;
}

// ---------- Çizim ----------
let cizimBekliyor = false;
function ciz() {
  if (cizimBekliyor) return;
  cizimBekliyor = true;
  // Arka plandaki ya da görünmeyen sekmede requestAnimationFrame çalışmayabilir; ekran yine de güncel
  // kalsın diye hangisi önce gelirse onunla çizilir
  const ciz1 = () => {
    if (!cizimBekliyor) return;
    cizimBekliyor = false;
    cizHemen();
  };
  requestAnimationFrame(ciz1);
  setTimeout(ciz1, 150);
}

function cizHemen() {
  const odak = document.activeElement;
  const odakId = odak?.id;
  let secim = null;
  try { secim = odak && odak.selectionStart != null ? [odak.selectionStart, odak.selectionEnd] : null; } catch { /* number input */ }
  $('#lig-adi').textContent = S.ayar?.ad ?? 'BSL Draft Ligi';
  $('#menu').innerHTML = menu();
  $('#kimlik').innerHTML = kimlik();
  $('#icerik').innerHTML = gorunum();
  if (odakId) {
    const el = document.getElementById(odakId);
    if (el) {
      el.focus();
      try { if (secim) el.setSelectionRange(...secim); } catch { /* number input */ }
    }
  }
  const benimSiram = siradakiTakim() && siradakiTakim() === benimTakimim() && asama() === 'draft';
  document.title = benimSiram ? '🔔 Sıra sende! · BSL Draft' : (S.ayar?.ad ?? 'BSL Draft Ligi');
  sayacGuncelle();
}

function rota() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return parcalar.length ? parcalar : [ligEkrani() ? 'puan' : 'draft'];
}

function menu() {
  if (!S.hazir || S.ligYok || S.hataMesaji) return '';
  const a = asama();
  const [sayfa] = rota();
  const gelen = Object.values(S.teklifler).filter(t => t.durum === 'bekliyor' && t.alan === benimTakimim()).length;
  const yonetim = [yonetici() && ['yonetici', 'Yönetici'], yonetici() && ['mevkiler', 'Mevkiler']];
  // Lig ekranı: draft bittikten sonra yönetici açınca. Draft ekranı: kura ve canlı draft.
  const ogeler = (ligEkrani() ? [
    ['puan', 'Puan Durumu'],
    ['takimlar', 'Takımlar'],
    benimTakimim() && ['kadrom', 'Kadrom'],
    ['bostakiler', 'Boştakiler'],
    ['takas', `Takas${gelen ? ` <span class="rozet uyari">${gelen}</span>` : ''}`],
    ['hareketler', 'Hareketler'],
    ['draft', 'Draft'],
    ['kurallar', 'Kurallar'],
    ...yonetim,
  ] : [
    ['draft', 'Draft'],
    ['takimlar', 'Takımlar'],
    benimTakimim() && ['kadro', 'sezon'].includes(a) && ['kadrom', 'Kadrom'],
    ['kurallar', 'Kurallar'],
    ...yonetim,
  ]).filter(Boolean);
  return ogeler.map(([id, ad]) => `<a href="#/${id}" class="${sayfa === id || (sayfa === 'takim' && id === 'takimlar') ? 'aktif' : ''}">${ad}</a>`).join('');
}

function kimlik() {
  if (!S.hazir || S.ligYok) return '';
  if (yonetici()) {
    const dugme = ['kadro', 'sezon'].includes(asama())
      ? `<button class="ekran-dugme" data-is="ekran" data-id="${ligEkrani() ? 'draft' : 'lig'}" title="Herkesin ana ekranını değiştirir">${ligEkrani() ? '← Draft ekranı' : 'Lig ekranı →'}</button>` : '';
    return `${dugme}<span><b>Yönetici</b> · <a href="#" data-is="cikis">çıkış</a></span>`;
  }
  if (benimTakimim()) return `<span><b>${esc(takimAdi(benimTakimim()))}</b> · <a href="#" data-is="cikis">çıkış</a></span>`;
  return '<span>İzleyici</span>';
}

function gorunum() {
  if (S.hataMesaji) return `<div class="kart hata-kutu">${S.hataMesaji}</div>`;
  if (!S.hazir) return '<p class="bos">Yükleniyor…</p>';
  if (S.ligYok) return gorunumKurulum();
  const [sayfa, p1, p2] = rota();
  switch (sayfa) {
    case 'draft': return gorunumDraft();
    case 'puan': return gorunumPuan(p1 === 'hafta' ? Number(p2) : null);
    case 'takimlar': return gorunumTakimlar();
    case 'takim': return gorunumTakim(p1);
    case 'kadrom': return gorunumKadrom();
    case 'takas': return gorunumTakas();
    case 'serbest':
    case 'bostakiler': return gorunumSerbest();
    case 'hareketler': return gorunumHareketler();
    case 'kurallar': return gorunumKurallar();
    case 'yonetici': return yonetici() ? gorunumYonetici() : '<p class="bos">Bu sayfa yönetici içindir.</p>';
    case 'mevkiler': return yonetici() ? gorunumMevkiler() : '<p class="bos">Bu sayfa yönetici içindir.</p>';
    default: return gorunumDraft();
  }
}

// ---------- İlk kurulum ----------
function gorunumKurulum() {
  if (S.kurulumSonucu) {
    const { adminKod } = S.kurulumSonucu;
    return `<div class="kart">
      <h2>Lig kuruldu 🎉</h2>
      <p>Bu cihaz artık <b>yönetici</b>. Aşağıdaki yönetici linkini kimseyle paylaşma, güvenli bir yere kaydet
      (başka cihazdan yönetici olarak girmek için gerekir):</p>
      <p class="link-kutu">${esc(girisLinki(adminKod))}</p>
      <p><button class="btn" data-is="kopyala" data-metin="${esc(girisLinki(adminKod))}">Linki kopyala</button></p>
      <p>Menajerlerin giriş linkleri <b>Yönetici</b> sayfasında.</p>
      <p><a class="btn ana" href="#/yonetici" data-is="kurulum-bitti">Yönetici sayfasına git</a></p>
    </div>`;
  }
  const varsayilanHafta = S.index ? C.etkinHafta(S.index, 1) : 1;
  return `<div class="kart">
    <h2>Ligi kur</h2>
    <p>Bu lig henüz kurulmamış. Ligi kuran cihaz <b>yönetici</b> olur. Takım adları ve menajerler sonradan da değiştirilebilir.</p>
    <div class="form-izgara">
      <label for="k-ad">Lig adı</label><input type="text" id="k-ad" value="Pota Altı BSL Draft Ligi">
      <label for="k-hafta">Puanlamanın başlayacağı BSL haftası</label><input type="number" id="k-hafta" min="1" max="40" value="${varsayilanHafta}">
      <label for="k-sure">Seçim süresi (saniye)</label><input type="number" id="k-sure" min="5" max="600" value="90">
    </div>
    <h3 style="margin-top:16px">Menajerler (isteğe bağlı)</h3>
    <div class="form-izgara">
      ${Array.from({ length: 17 }, (_, i) => `<label for="k-m${i}">Takım ${i + 1}</label><input type="text" id="k-m${i}" placeholder="Menajerin adı">`).join('')}
    </div>
    <p style="margin-top:16px"><button class="btn ana" data-is="ligi-kur">Ligi kur</button></p>
  </div>`;
}

function girisLinki(kod) {
  return `${location.origin}${location.pathname}?kod=${encodeURIComponent(kod)}`;
}

// ---------- Draft ----------
function gorunumDraft() {
  const a = asama();
  const draftta = DRAFT_ASAMALARI.includes(a);
  const sekmeler = [
    draftta && ['oyuncular', 'Oyuncular'],
    ['tahta', 'Draft tahtası'],
    ['kadrolar', 'Kadrolar'],
    ['sira', 'Kura sırası'],
  ].filter(Boolean);
  if (!sekmeler.some(([id]) => id === S.ui.draftSekme)) S.ui.draftSekme = sekmeler[0][0];
  if (!draftta) secimleriDinle();
  let icerik = '';
  switch (S.ui.draftSekme) {
    case 'oyuncular': icerik = draftOyunculari(); break;
    case 'tahta': icerik = draftTahtasi(); break;
    case 'kadrolar': icerik = draftKadrolari(); break;
    case 'sira': icerik = kuraKarti(false); break;
  }
  return `${durumKarti()}${benimDraftim()}
    <div class="sekmeler">${sekmeler.map(([id, ad]) => `<button data-is="draft-sekme" data-id="${id}" class="${S.ui.draftSekme === id ? 'aktif' : ''}">${ad}</button>`).join('')}</div>
    ${icerik}`;
}

function durumKarti() {
  const d = S.durum;
  const toplam = d.toplamSecim;
  switch (d.asama) {
    case 'kurulum':
      return `<div class="kart"><h2>Draft henüz başlamadı</h2>
        <p>Önce yönetici kurayı çekecek; çıkan sıra herkese burada canlı gösterilir. Sonra draft başlar.</p>
        <p class="soluk">Yılan draft: 1. tur 1→17, 2. tur 17→1, … · Her takım 7 oyuncu (As 3 Ön + 2 Arka, 2 Yedek) ·
        Seçim süresi ${sureMetni(S.ayar.secimSuresi)}</p></div>`;
    case 'kura':
      return kuraKarti(true);
    case 'draft':
    case 'duraklatildi': {
      const n = d.secimNo;
      const tid = d.secimSirasi[n];
      const { tur, turSecimi } = C.secimBilgisi(n, S.ayar.takimSayisi);
      const benimSiram = tid === benimTakimim();
      const sonrakiler = d.secimSirasi.slice(n + 1, n + 6);
      const kisit = secimKisiti(tid);
      return `<div class="kart saat-kart ${benimSiram ? 'sira-sende' : ''}">
        <div class="soluk">Tur ${tur} · ${turSecimi}. seçim · Genel ${n + 1}/${toplam}</div>
        <div class="siradaki">${benimSiram ? 'Sıra sende!' : esc(takimAdi(tid))}</div>
        ${S.takimlar[tid]?.menajer && !benimSiram ? `<div class="soluk">${esc(S.takimlar[tid].menajer)}</div>` : ''}
        <div id="sayac" class="sayac">--:--</div>
        <div class="cubuk"><div id="cubuk" style="width:100%"></div></div>
        ${d.asama === 'duraklatildi' ? '<div class="uyari-kutu">Draft yönetici tarafından duraklatıldı.</div>' : ''}
        ${kisit ? `<div class="uyari-kutu">Kadro kuralı gereği ${benimSiram ? `bu seçimde ${kisit} seçebilirsin` : `bu takım ${kisit} seçebilir`}.</div>` : ''}
        ${sonrakiler.length ? `<div class="sonraki"><span class="soluk" style="border:0;background:none">Sıradakiler:</span>${sonrakiler.map(t => `<span class="${t === benimTakimim() ? 'rozet uyari' : ''}">${esc(takimAdi(t))}</span>`).join('')}</div>` : ''}
        <p class="kucuk soluk" style="margin-bottom:0">Süre dolarsa müsait en iyi 15 oyuncudan (sezon VP ortalamasına göre) rastgele biri seçilir.</p>
      </div>`;
    }
    case 'kadro':
      return `<div class="kart"><h2>Draft tamamlandı 🎉</h2>
        <p>Sezon başlayana kadar her takım As/Yedek dizilişini <a href="#/kadrom">Kadrom</a> sayfasından serbestçe kurabilir
        (oyuncular mevkilerine göre yerleştirildi). Yönetici sezonu başlatınca dizilişler kilitlenir.</p>
        ${yonetici() ? '<p style="margin-bottom:0"><button class="btn ana" data-is="ekran" data-id="lig">Herkesi lig ekranına geçir →</button> <span class="soluk kucuk">Puan durumu, takımlar, boştakiler… İstediğin an "Draft ekranı" düğmesiyle geri dönebilirsin.</span></p>' : ''}</div>`;
    default:
      return '';
  }
}

function sureMetni(sn) {
  return sn % 60 === 0 ? `${sn / 60} dk` : sn > 60 ? `${Math.floor(sn / 60)} dk ${sn % 60} sn` : `${sn} sn`;
}

function sayacGuncelle() {
  const el = document.getElementById('sayac');
  if (!el || !S.durum) return;
  const d = S.durum;
  let kalan = d.asama === 'duraklatildi' ? (d.kalanSure ?? 0) * 1000 : kalanMs();
  if (kalan == null) return;
  kalan = Math.max(0, kalan);
  const sn = Math.ceil(kalan / 1000);
  el.textContent = `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`;
  el.classList.toggle('az', sn <= 10);
  const cubuk = document.getElementById('cubuk');
  if (cubuk) cubuk.style.width = `${Math.min(100, (kalan / (d.saatSure * 1000)) * 100)}%`;
}

function kuraAcilan() {
  const d = S.durum;
  if (!d?.sira) return 0;
  if (d.asama !== 'kura' || !d.kuraZamani?.toMillis) return d.sira.length;
  return Math.max(0, Math.min(d.sira.length, Math.floor((simdi() - d.kuraZamani.toMillis()) / KURA_ARALIK_MS) + 1));
}

function kuraKarti(canli) {
  const d = S.durum;
  if (!d.sira) return '<div class="kart"><p class="bos">Kura henüz çekilmedi.</p></div>';
  const T = d.sira.length;
  const acilan = kuraAcilan();
  const bitti = acilan >= T;
  return `<div class="kart">
    <h2>${canli && !bitti ? 'Kura çekiliyor…' : 'Draft sırası'}</h2>
    ${canli && !bitti ? '<p class="soluk">Sıra 17\'den 1\'e doğru açılıyor.</p>' : ''}
    <ol class="kura">${d.sira.map((tid, i) => {
      const acik = i >= T - acilan;
      const yeni = canli && i === T - acilan;
      return acik
        ? `<li class="${yeni ? 'yeni' : ''}"><span class="no">${i + 1}</span><span><b>${esc(takimAdi(tid))}</b>${S.takimlar[tid]?.menajer ? `<br><span class="soluk kucuk">${esc(S.takimlar[tid].menajer)}</span>` : ''}</span></li>`
        : `<li class="gizli"><span class="no">${i + 1}</span><span>?</span></li>`;
    }).join('')}</ol>
    ${canli && bitti ? '<p style="margin-bottom:0">Draft, yönetici başlatınca başlayacak.</p>' : ''}
    <p class="kucuk soluk" style="margin-bottom:0">Yılan draft: tek turlarda 1→17, çift turlarda 17→1.</p>
  </div>`;
}

function benimDraftim() {
  const tid = benimTakimim();
  if (!tid || !DRAFT_ASAMALARI.includes(asama())) return '';
  const k = S.kadrolar[tid];
  const oyuncular = [...(k?.as ?? []), ...(k?.yedek ?? [])];
  const benimSiralarim = (S.durum.secimSirasi ?? []).map((t, i) => (t === tid ? i : -1)).filter(i => i >= S.durum.secimNo);
  const siradaki = benimSiralarim[0];
  return `<div class="kart">
    <div class="baslik-satir"><h3>${esc(takimAdi(tid))} <span class="soluk kucuk">${oyuncular.length}/${kadroBoyu()} · Ön ${(k?.tip?.oT ?? 0) + (k?.tip?.oY ?? 0)} · Arka ${(k?.tip?.aT ?? 0) + (k?.tip?.aY ?? 0)} · Türk ${(k?.tip?.oT ?? 0) + (k?.tip?.aT ?? 0)}</span></h3>
    ${siradaki != null && S.durum.asama !== 'kurulum' ? `<span class="soluk kucuk">Sıradaki seçimin: ${siradaki + 1}. seçim${siradaki > S.durum.secimNo ? ` (${siradaki - S.durum.secimNo} seçim sonra)` : ''}</span>` : ''}</div>
    <p class="kucuk soluk" style="margin:0 0 6px">Kadro kuralı: As ${kural().asOn} Ön + ${kural().asArka} Arka, ${kural().yedek} Yedek (mevki serbest); As'ta ve Yedekte en az 1'er Türk.</p>
    ${secimKisiti(tid) && oyuncular.length < kadroBoyu() ? `<div class="uyari-kutu kucuk">Sıradaki seçiminde ${secimKisiti(tid)} seçebilirsin.</div>` : ''}
    ${oyuncular.length ? `<div>${[...k.as.map(p => [p, 'as']), ...k.yedek.map(p => [p, 'yedek'])].map(([p, rol]) => `<span class="secim-chip">${oyuncuAdi(p)} <span class="rozet ${rol}">${rol === 'as' ? 'As' : 'Yedek'}</span></span>`).join('')}</div>`
      : '<p class="soluk" style="margin:0">Henüz oyuncu seçmedin.</p>'}
  </div>`;
}

function draftOyunculari() {
  if (!S.havuz.length) {
    return `<div class="kart"><p class="bos">Oyuncu listesi henüz yüklenmedi.${yonetici() ? ' Yönetici sayfasından "Oyuncu havuzunu yükle"ye bas.' : ''}</p></div>`;
  }
  const d = S.durum;
  const sahip = sahipler();
  const tid = siradakiTakim();
  const secebilir = d.asama === 'draft' && tid && (tid === benimTakimim() || yonetici());
  const izin = tid ? izinliTipler(tid) : C.TIPLER;
  const kisit = tid && secimKisiti(tid);
  const ara = S.ui.ara.toLocaleLowerCase('tr');
  const bslTakimlar = [...new Set(S.havuz.map(o => o.takim))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = S.havuz.filter(o => (S.ui.alinanlar || !sahip.has(o.id))
    && (!S.ui.sadeceTurk || o.turk)
    && (!S.ui.mevkiFiltre || o.mevki === S.ui.mevkiFiltre)
    && (!S.ui.bslTakim || o.takim === S.ui.bslTakim)
    && (!ara || o.ad.toLocaleLowerCase('tr').includes(ara)));
  const musait = S.havuz.filter(o => !sahip.has(o.id)).length;
  return `<div class="kart">
    <div class="satir" style="margin-bottom:10px">
      <input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ara" value="${esc(S.ui.ara)}" class="ara">
      <select id="f-takim" data-ui="bslTakim"><option value="">Bütün BSL takımları</option>${bslTakimlar.map(t => `<option ${t === S.ui.bslTakim ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select id="f-mevki" data-ui="mevkiFiltre"><option value="">Ön + Arka</option><option value="on" ${S.ui.mevkiFiltre === 'on' ? 'selected' : ''}>Sadece Ön</option><option value="arka" ${S.ui.mevkiFiltre === 'arka' ? 'selected' : ''}>Sadece Arka</option></select>
      <label class="secenek"><input type="checkbox" id="f-turk" data-ui="sadeceTurk" ${S.ui.sadeceTurk ? 'checked' : ''}> Sadece Türkler</label>
      <label class="secenek"><input type="checkbox" id="f-alinan" data-ui="alinanlar" ${S.ui.alinanlar ? 'checked' : ''}> Seçilenleri de göster</label>
    </div>
    <p class="kucuk soluk">${musait} müsait oyuncu · Sıralama: bu sezonun maç başı VP ortalaması</p>
    <div class="tablo-kap"><table>
      <thead><tr><th class="sayi">#</th><th>Oyuncu</th><th>BSL takımı</th><th class="sayi">Maç</th><th class="sayi">VP ort.</th><th class="sayi dar-gizle">Sayı</th><th></th></tr></thead>
      <tbody>${liste.slice(0, 300).map(o => {
        const kimde = sahip.get(o.id);
        const engel = !izin.includes(C.tipi(o.mevki, o.turk));
        return `<tr class="${kimde ? 'alindi' : ''}">
          <td class="sayi soluk">${o.sira}</td>
          <td>${esc(o.ad)} ${mevkiRozeti(o.mevki)}${o.turk ? ' <span class="rozet tr">TR</span>' : ''}</td>
          <td class="kucuk">${bslTakimHucre(o)}</td>
          <td class="sayi">${o.mac}</td><td class="sayi"><b>${sayi(o.vpOrt)}</b></td><td class="sayi dar-gizle">${sayi(o.sayiOrt)}</td>
          <td class="sayi">${kimde ? `<span class="kucuk">${esc(takimAdi(kimde))}</span>`
            : secebilir ? `<button class="btn kucuk ${engel ? '' : 'ana'}" data-is="sec" data-id="${o.id}" ${engel ? `disabled title="Kadro kuralı: ${kisit}"` : ''}>Seç</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="bos">Oyuncu bulunamadı</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

function draftTahtasi() {
  const d = S.durum;
  if (!d.sira) return '<div class="kart"><p class="bos">Kura çekilince draft tahtası burada görünür.</p></div>';
  const T = d.sira.length;
  const turlar = d.toplamSecim / T;
  let satirlar = '';
  for (let r = 0; r < turlar; r++) {
    let hucreler = '';
    for (let c = 0; c < T; c++) {
      const p = r % 2 === 0 ? c : T - 1 - c;
      const n = r * T + p;
      const s = S.secimler[n];
      const simdiki = ['draft', 'duraklatildi'].includes(d.asama) && n === d.secimNo;
      const sinif = [simdiki && 'simdi', !s && 'bos-hucre', d.sira[c] === benimTakimim() && 'ben'].filter(Boolean).join(' ');
      hucreler += `<td class="${sinif}"><span class="soluk">${n + 1}.</span> ${s
        ? `${esc(s.ad)}${s.mevki ? ` ${mevkiRozeti(s.mevki)}` : ''}${s.turk ? ' <span class="rozet tr">TR</span>' : ''}${s.otomatik ? ' <span class="rozet oto" title="Süre doldu, otomatik seçildi">oto</span>' : ''}<div class="bsl">${esc(oyuncu(s.oyuncu).takimKod || s.bslTakim)}</div>`
        : simdiki ? '<b>seçiyor…</b>' : ''}</td>`;
    }
    satirlar += `<tr><th>${r + 1}. tur ${r % 2 === 0 ? '→' : '←'}</th>${hucreler}</tr>`;
  }
  return `<div class="kart"><div class="tablo-kap"><table class="tahta">
    <thead><tr><th></th>${d.sira.map((t, i) => `<th>${i + 1}. ${esc(takimAdi(t))}</th>`).join('')}</tr></thead>
    <tbody>${satirlar}</tbody></table></div></div>`;
}

function draftKadrolari() {
  const sira = S.durum.sira ?? takimlar().map(t => t.id);
  return `<div class="izgara">${sira.map(tid => takimKarti(tid)).join('')}</div>`;
}

function takimKarti(tid, ek = '') {
  const t = S.takimlar[tid];
  const k = S.kadrolar[tid] ?? { as: [], yedek: [] };
  const satir = (p, rol) => `<li><span>${oyuncuAdi(p)}</span><span><span class="rozet ${rol}">${rol === 'as' ? 'As' : 'Yedek'}</span> <span class="soluk kucuk">${sayi(oyuncu(p).vpOrt)}</span></span></li>`;
  const bos = kadroBoyu() - k.as.length - k.yedek.length;
  return `<div class="kart ${tid === benimTakimim() ? 'sira-sende' : ''}">
    <div class="baslik-satir"><h3><a href="#/takim/${tid}">${esc(t?.ad ?? tid)}</a></h3><span class="soluk kucuk">${esc(t?.menajer ?? '')}</span></div>
    ${ek}
    <ul class="oyuncu-liste">${k.as.map(p => satir(p, 'as')).join('')}${k.yedek.map(p => satir(p, 'yedek')).join('')}
    ${bos > 0 ? Array.from({ length: bos }, () => '<li class="soluk"><span>—</span></li>').join('') : ''}</ul>
  </div>`;
}

// ---------- Puanlama ----------
function puanHaftalari() {
  if (!S.ayar) return [];
  return Object.values(S.haftalar)
    .filter(h => h.hafta >= S.ayar.baslangicHaftasi && h.maclar.some(m => m.durum !== 'oynanmadi'))
    .sort((a, b) => a.hafta - b.hafta);
}

function haftaTakimlari(hafta) {
  return takimlar().map(t => {
    const k = C.haftaKadrosu(S.kadrolar[t.id] ?? { as: [], yedek: [] }, hafta);
    return { id: t.id, ad: t.ad, menajer: t.menajer, as: k.as.map(oyuncu), yedek: k.yedek.map(oyuncu) };
  });
}

function genelTablo() {
  return C.genelKlasman(haftaTakimlari, puanHaftalari());
}

function gorunumPuan(haftaNo) {
  if (asama() !== 'sezon') return `<div class="kart"><p class="bos">Puan durumu, yönetici sezonu başlatınca açılır (puanlama ${S.ayar.baslangicHaftasi}. haftadan başlar).</p></div>`;
  if (!S.haftalarYuklendi) return '<p class="bos">Haftalık veriler yükleniyor…</p>';
  const haftalar = puanHaftalari();
  if (!haftalar.length) {
    return `<div class="kart"><p class="bos">${S.ayar.baslangicHaftasi}. hafta maçları başlayınca puanlar burada görünür.</p></div>`;
  }
  S.ui.puanSekme = haftaNo ? 'hafta' : S.ui.puanSekme;
  const secili = haftaNo && S.haftalar[haftaNo] ? haftaNo : haftalar.at(-1).hafta;
  const sekmeler = `<div class="sekmeler">
    <button data-is="puan-sekme" data-id="genel" class="${S.ui.puanSekme === 'genel' ? 'aktif' : ''}">Genel klasman</button>
    <button data-is="puan-sekme" data-id="hafta" class="${S.ui.puanSekme === 'hafta' ? 'aktif' : ''}">Haftalık</button></div>`;
  if (S.ui.puanSekme === 'genel') {
    const tablo = genelTablo();
    const son = haftalar.at(-1);
    const devam = !C.haftaDurumu(son).tamamlandi;
    return `${sekmeler}<div class="kart">
      <h2>Genel klasman</h2>
      <p class="soluk kucuk">${haftalar[0].hafta}.–${son.hafta}. haftalar${devam ? ` · ${son.hafta}. hafta devam ediyor (puanlar kesin değil)` : ''} · Güncelleme: ${S.index?.guncelleme ? tarih(S.index.guncelleme) : '-'}</p>
      <div class="tablo-kap"><table>
        <thead><tr><th class="sayi">#</th><th>Takım</th><th class="sayi">Puan</th><th class="sayi">Toplam VP</th><th class="sayi">Son hafta</th></tr></thead>
        <tbody>${tablo.map(s => {
          const sh = s.haftalar.at(-1);
          return `<tr class="tikla ${s.id === benimTakimim() ? 'ben' : ''}" data-is="git" data-yol="#/takim/${s.id}">
            <td class="sayi">${s.sira}</td><td><b>${esc(s.ad)}</b> <span class="soluk kucuk">${esc(s.menajer ?? '')}</span></td>
            <td class="sayi"><b>${s.puan}</b></td><td class="sayi">${sayi(s.vp)}</td>
            <td class="sayi soluk">${sh ? `${sh.sira}. · ${sayi(sh.vp)} VP · +${sh.puan}` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="kucuk soluk" style="margin-bottom:0">Haftalık sıraya göre ${C.PUAN_TABLOSU.join(', ')} puan. Eşit puanda toplam VP yüksek olan üstte.</p>
    </div>`;
  }
  const h = S.haftalar[secili];
  const sonuc = C.haftaSiralamasi(haftaTakimlari(secili), h);
  const hd = C.haftaDurumu(h);
  return `${sekmeler}<div class="kart">
    <div class="sekmeler">${haftalar.map(x => `<button data-is="git" data-yol="#/puan/hafta/${x.hafta}" class="${x.hafta === secili ? 'aktif' : ''}">${x.hafta}. hafta</button>`).join('')}</div>
    <h2>${secili}. hafta</h2>
    <p class="soluk kucuk">${hd.bitti}/${hd.toplam} maç bitti${hd.canli ? ' · canlı maç var' : ''}</p>
    <div class="tablo-kap"><table>
      <thead><tr><th class="sayi">#</th><th>Takım</th><th class="sayi">VP</th><th class="sayi">Puan</th></tr></thead>
      <tbody>${sonuc.map(s => `<tr class="tikla ${s.id === benimTakimim() ? 'ben' : ''}" data-is="ac" data-id="${s.id}">
          <td class="sayi">${s.sira}</td><td><b>${esc(s.ad)}</b> <span class="soluk kucuk">${esc(s.menajer ?? '')}</span>
          ${s.vpEsitligi ? `<div class="kucuk soluk">${s.enIyiTurk ? `Eşitlikte en iyi Türk: ${esc(s.enIyiTurk.ad)} (${sayi(s.enIyiTurk.vp)})` : 'Eşitlikte: sayılan oyuncularda Türk yok'}</div>` : ''}</td>
          <td class="sayi"><b>${sayi(s.toplam)}</b></td><td class="sayi">${s.puan}</td></tr>
        ${S.ui.acik === s.id ? `<tr class="detay"><td colspan="4">${haftaDetayi(s)}</td></tr>` : ''}`).join('')}</tbody>
    </table></div>
    <p class="kucuk soluk" style="margin-bottom:0">Satıra dokununca takımın o haftaki oyuncuları açılır.</p>
  </div>`;
}

function macMetni(o) {
  if (o.macDurumu === 'bay') return 'bay';
  if (o.macDurumu === 'oynanmadi') return 'maçı oynanmadı';
  const dk = Math.floor(o.saniye / 60);
  return `${o.macDurumu === 'canli' ? 'canlı · ' : ''}${dk} dk`;
}

function haftaDetayi(s) {
  const satir = o => `<tr><td class="${o.sayildi ? '' : o.rol === 'as' ? 'cizik' : 'soluk'}">${esc(o.ad)}${o.turk ? ' <span class="rozet tr">TR</span>' : ''}
      <span class="rozet ${o.rol}">${o.rol === 'as' ? 'As' : 'Yedek'}</span>
      ${o.yerineGiren ? `<div class="kucuk soluk">süre almadı, yerine ${esc(o.yerineGiren)}</div>` : ''}
      ${o.yerineGirdigi ? `<div class="kucuk soluk">${esc(o.yerineGirdigi)} yerine sayıldı</div>` : ''}</td>
    <td class="kucuk soluk">${esc(o.takimKod || o.takim || '')}</td><td class="kucuk soluk">${macMetni(o)}</td><td class="sayi">${sayi(o.vp)}</td></tr>`;
  return `<table>${s.aslar.map(satir).join('')}${s.yedekler.map(satir).join('')}</table>`;
}

// ---------- Takımlar ----------
function gorunumTakimlar() {
  const sezon = asama() === 'sezon' && S.haftalarYuklendi;
  const tablo = sezon ? new Map(genelTablo().map(s => [s.id, s])) : new Map();
  const sirali = sezon && tablo.size ? takimlar().sort((a, b) => tablo.get(a.id).sira - tablo.get(b.id).sira) : takimlar();
  return `<div class="izgara">${sirali.map(t => {
    const g = tablo.get(t.id);
    const k = S.kadrolar[t.id];
    const ek = asama() === 'sezon'
      ? `<p class="kucuk soluk" style="margin:0 0 6px">${g ? `${g.sira}. sıra · ${g.puan} puan · ` : ''}Serbest: ${k?.fa ?? 0}/${S.ayar.faHakki} · Değişiklik: ${k?.degisiklik ?? 0}/${S.ayar.degisiklikHakki}</p>` : '';
    return takimKarti(t.id, ek);
  }).join('')}</div>`;
}

function gorunumTakim(tid) {
  const t = S.takimlar[tid];
  if (!t) return '<p class="bos">Takım bulunamadı.</p>';
  const k = S.kadrolar[tid];
  let haftalik = '';
  if (asama() === 'sezon' && S.haftalarYuklendi) {
    const g = genelTablo().find(s => s.id === tid);
    haftalik = g ? `<div class="kart"><h3>Haftalar</h3><div class="tablo-kap"><table>
      <thead><tr><th>Hafta</th><th class="sayi">VP</th><th class="sayi">Sıra</th><th class="sayi">Puan</th></tr></thead>
      <tbody>${g.haftalar.map(h => `<tr class="tikla" data-is="git" data-yol="#/puan/hafta/${h.hafta}" data-acik="${tid}"><td>${h.hafta}. hafta</td><td class="sayi">${sayi(h.vp)}</td><td class="sayi">${h.sira}.</td><td class="sayi"><b>${h.puan}</b></td></tr>`).join('')}
      <tr><td><b>Toplam</b> (${g.sira}. sırada)</td><td class="sayi"><b>${sayi(g.vp)}</b></td><td></td><td class="sayi"><b>${g.puan}</b></td></tr></tbody></table></div></div>` : '';
  }
  const hareket = Object.values(S.hareketler).filter(h => h.takim === tid || h.veren === tid);
  return `${takimKarti(tid, asama() === 'sezon' ? `<p class="kucuk soluk" style="margin:0 0 6px">Serbest oyuncu: ${k?.fa ?? 0}/${S.ayar.faHakki} · As–Yedek değişikliği: ${k?.degisiklik ?? 0}/${S.ayar.degisiklikHakki}</p>` : '')}
    ${haftalik}
    ${hareket.length ? `<div class="kart"><h3>Hareketler</h3>${hareket.map(hareketSatiri).join('')}</div>` : ''}`;
}

// ---------- Kadrom ----------
function gorunumKadrom() {
  const tid = benimTakimim();
  if (!tid) return '<div class="kart"><p class="bos">Bu sayfa için yöneticinin gönderdiği menajer linkinle girmelisin.</p></div>';
  const k = S.kadrolar[tid];
  const t = S.takimlar[tid];
  let ana = '';
  if (asama() === 'kadro') {
    if (!S.ui.dizilis) S.ui.dizilis = new Set(k.as);
    const secili = S.ui.dizilis;
    const tum = [...k.as, ...k.yedek];
    const sorun = secili.size === S.ayar.asSayisi
      ? dizilisSorunu({ as: tum.filter(p => secili.has(p)), yedek: tum.filter(p => !secili.has(p)) }) : null;
    ana = `<div class="kart"><h3>As/Yedek dizilişi</h3>
      <p>Sezon başlayana kadar dizilişini serbestçe değiştirebilirsin. <b>5 As</b> seç (${kural().asOn} Ön + ${kural().asArka} Arka), kalan 2 oyuncu Yedek olur. As'ta en az 1, Yedekte en az 1 Türk oyuncu olmalı.</p>
      <div>${tum.map(p => `<button class="secim-chip ${secili.has(p) ? 'secili' : ''}" data-is="dizilis" data-id="${p}">${oyuncuAdi(p)}</button>`).join('')}</div>
      <p class="soluk kucuk">${secili.size}/5 As seçili</p>
      ${sorun ? `<div class="hata-kutu kucuk">${sorun}</div>` : ''}
      <button class="btn ana" data-is="dizilis-kaydet" ${secili.size === S.ayar.asSayisi && !sorun ? '' : 'disabled'}>Dizilişi kaydet</button></div>`;
  } else if (asama() === 'sezon') {
    const hak = S.ayar.degisiklikHakki - k.degisiklik;
    ana = `<div class="kart"><h3>As–Yedek değişikliği</h3>
      ${hak > 0 ? `<p>Sezon boyunca <b>${S.ayar.degisiklikHakki}</b> kez bir As ile bir Yedeğin yerini değiştirebilirsin (As'ta ${kural().asOn} Ön + ${kural().asArka} Arka kalmalı, yani aynı mevkiden iki oyuncu). Değişiklik <b>${etkinHafta()}. haftadan</b> itibaren geçerli olur.</p>
        <div class="satir">
          <select id="dg-as"><option value="">Yedeğe geçecek As</option>${k.as.map(p => `<option value="${p}">${esc(oyuncu(p).ad)}</option>`).join('')}</select>
          <span>⇄</span>
          <select id="dg-yedek"><option value="">As'a geçecek Yedek</option>${k.yedek.map(p => `<option value="${p}">${esc(oyuncu(p).ad)}</option>`).join('')}</select>
          <button class="btn ana" data-is="degistir">Değiştir</button>
        </div>`
        : '<p class="soluk" style="margin:0">As–Yedek değişikliği hakkını kullandın.</p>'}
    </div>
    <div class="kart"><p style="margin:0">Serbest oyuncu hakkın: <b>${S.ayar.faHakki - k.fa}</b> · <a href="#/serbest">Serbest oyuncular</a> · <a href="#/takas">Takas</a></p></div>`;
  }
  return `${takimKarti(tid)}${ana}
    <div class="kart"><h3>Takım adı</h3><div class="satir">
      <input type="text" id="takim-adi" maxlength="30" value="${esc(t.ad)}" class="ara">
      <button class="btn" data-is="takim-adi">Kaydet</button></div></div>`;
}

// ---------- Serbest oyuncular ----------
function gorunumSerbest() {
  if (!['kadro', 'sezon'].includes(asama())) return '<div class="kart"><p class="bos">Boştaki oyuncular draft bitince burada görünür.</p></div>';
  const alimAcik = asama() === 'sezon';
  const tid = benimTakimim();
  const k = tid && S.kadrolar[tid];
  const sahip = sahipler();
  const ara = S.ui.ara.toLocaleLowerCase('tr');
  const bslTakimlar = [...new Set([...S.rehber.values()].filter(o => o.aktif).map(o => o.takim))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = [...S.rehber.values()].filter(o => o.aktif && !sahip.has(o.id)
    && (!S.ui.sadeceTurk || o.turk) && (!S.ui.bslTakim || o.takim === S.ui.bslTakim)
    && (!S.ui.mevkiFiltre || mevki(o.id) === S.ui.mevkiFiltre)
    && (!ara || o.ad.toLocaleLowerCase('tr').includes(ara)));
  const hak = k && alimAcik ? S.ayar.faHakki - k.fa : 0;
  let panel = '';
  if (S.ui.faAl && k) {
    const al = oyuncu(S.ui.faAl);
    panel = `<div class="kart sira-sende"><h3>${esc(al.ad)} ${al.turk ? '<span class="rozet tr">TR</span>' : ''} <span class="soluk kucuk">${esc(al.takim)}</span></h3>
      <p>Kimin yerine alıyorsun? Gelen oyuncu, bıraktığın oyuncunun yerine (As ya da Yedek) geçer; As'taki bir oyuncunun yerine aynı mevkiden oyuncu alınmalı ve <b>${etkinHafta()}. haftadan</b> itibaren sayılır. Bıraktığın oyuncu serbest kalır.</p>
      <div class="satir"><select id="fa-birak"><option value="">Bırakılacak oyuncu</option>
        ${[...k.as.map(p => [p, 'As']), ...k.yedek.map(p => [p, 'Yedek'])].map(([p, rol]) => `<option value="${p}">${esc(oyuncu(p).ad)} (${rol})</option>`).join('')}</select>
      <button class="btn ana" data-is="fa-onayla">Onayla</button><button class="btn" data-is="fa-vazgec">Vazgeç</button></div></div>`;
  }
  return `<div class="kart"><h2>Boştaki oyuncular</h2>
    <p style="margin-bottom:0">Hiçbir takımda olmayan BSL oyuncuları. ${!alimAcik ? 'Serbest oyuncu alımı sezon başlayınca açılır.'
      : tid ? `Kalan serbest oyuncu hakkın: <b>${hak}</b> / ${S.ayar.faHakki} (sezon boyunca).` : ''}</p></div>
    ${panel}
    <div class="kart">
      <div class="satir" style="margin-bottom:10px">
        <input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ara" value="${esc(S.ui.ara)}" class="ara">
        <select id="f-takim" data-ui="bslTakim"><option value="">Bütün BSL takımları</option>${bslTakimlar.map(t => `<option ${t === S.ui.bslTakim ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select id="f-mevki" data-ui="mevkiFiltre"><option value="">Ön + Arka</option><option value="on" ${S.ui.mevkiFiltre === 'on' ? 'selected' : ''}>Sadece Ön</option><option value="arka" ${S.ui.mevkiFiltre === 'arka' ? 'selected' : ''}>Sadece Arka</option></select>
        <label class="secenek"><input type="checkbox" id="f-turk" data-ui="sadeceTurk" ${S.ui.sadeceTurk ? 'checked' : ''}> Sadece Türkler</label>
      </div>
      <div class="tablo-kap"><table>
        <thead><tr><th>Oyuncu</th><th>BSL takımı</th><th class="sayi">Maç</th><th class="sayi">VP ort.</th><th class="sayi dar-gizle">Sayı</th><th></th></tr></thead>
        <tbody>${liste.slice(0, 300).map(o => `<tr>
          <td>${esc(o.ad)} ${mevkiRozeti(mevki(o.id))}${o.turk ? ' <span class="rozet tr">TR</span>' : ''}</td><td class="kucuk">${bslTakimHucre(o)}</td>
          <td class="sayi">${o.mac}</td><td class="sayi"><b>${sayi(o.vpOrt)}</b></td><td class="sayi dar-gizle">${sayi(o.sayiOrt)}</td>
          <td class="sayi">${hak > 0 ? `<button class="btn kucuk ana" data-is="fa-al" data-id="${o.id}">Al</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="6" class="bos">Oyuncu bulunamadı</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// ---------- Takas ----------
function takasSorunu(verenId, alanId, verenYeni, alanYeni) {
  const v = dizilisSorunu(verenYeni);
  if (v) return `Bu takas olmaz: ${takimAdi(verenId)} kadrosunda ${v}.`;
  const a = dizilisSorunu(alanYeni);
  if (a) return `Bu takas olmaz: ${takimAdi(alanId)} kadrosunda ${a}.`;
  return null;
}

function teklifGecerliligi(t) {
  const v = S.kadrolar[t.veren];
  const a = S.kadrolar[t.alan];
  const vt = [...v.as, ...v.yedek];
  const at = [...a.as, ...a.yedek];
  if (!t.verilen.every(p => vt.includes(p)) || !t.alinan.every(p => at.includes(p))) return 'Oyunculardan biri artık o takımda değil.';
  const yeni = C.takasKadrolari(v, a, t.verilen, t.alinan);
  return takasSorunu(t.veren, t.alan, yeni.veren, yeni.alan);
}

function rolu(tid, pid) {
  return S.kadrolar[tid]?.as.includes(pid) ? 'As' : 'Yedek';
}

function teklifKarti(t, butonlar = '') {
  const durumlar = { bekliyor: 'Bekliyor', kabul: 'Kabul edildi', red: 'Reddedildi', iptal: 'İptal edildi' };
  const sorun = t.durum === 'bekliyor' ? teklifGecerliligi(t) : null;
  return `<div class="teklif">
    <div class="baslik-satir"><span class="kucuk soluk">${t.zaman ? tarih(t.zaman) : ''}</span><span class="rozet ${t.durum === 'kabul' ? 'as' : ''}">${durumlar[t.durum] ?? t.durum}</span></div>
    <div class="yon">
      <div><b>${esc(takimAdi(t.veren))}</b> verir:<br>${t.verilen.map(p => `${oyuncuAdi(p)}${t.durum === 'bekliyor' ? ` <span class="soluk kucuk">(${rolu(t.veren, p)})</span>` : ''}`).join('<br>')}</div>
      <div class="ok">⇄</div>
      <div><b>${esc(takimAdi(t.alan))}</b> verir:<br>${t.alinan.map(p => `${oyuncuAdi(p)}${t.durum === 'bekliyor' ? ` <span class="soluk kucuk">(${rolu(t.alan, p)})</span>` : ''}`).join('<br>')}</div>
    </div>
    ${t.not ? `<p class="kucuk" style="margin:6px 0 0">“${esc(t.not)}”</p>` : ''}
    ${sorun ? `<div class="hata-kutu kucuk">${esc(sorun)}</div>` : ''}
    ${butonlar ? `<div class="satir" style="margin-top:8px">${butonlar}</div>` : ''}
  </div>`;
}

function gorunumTakas() {
  if (asama() !== 'sezon') return '<div class="kart"><p class="bos">Takaslar yönetici sezonu başlatınca açılır.</p></div>';
  const tid = benimTakimim();
  const hepsi = Object.values(S.teklifler).sort((a, b) => (b.zaman?.toMillis?.() ?? 0) - (a.zaman?.toMillis?.() ?? 0));
  const gelen = hepsi.filter(t => t.durum === 'bekliyor' && t.alan === tid);
  const giden = hepsi.filter(t => t.durum === 'bekliyor' && t.veren === tid);
  const biten = hepsi.filter(t => t.durum === 'kabul');
  let yeni = '';
  if (tid) {
    const k = S.kadrolar[tid];
    const karsi = S.ui.takasTakim && S.kadrolar[S.ui.takasTakim];
    const chip = (p, liste, isim) => {
      const i = liste.indexOf(p);
      return `<button class="secim-chip ${i >= 0 ? 'secili' : ''}" data-is="${isim}" data-id="${p}">${i >= 0 ? `<b>${i + 1}</b> ` : ''}${oyuncuAdi(p)} <span class="soluk kucuk">${rolu(isim === 'tk-ver' ? tid : S.ui.takasTakim, p)}</span></button>`;
    };
    const esitSayi = S.ui.verilen.length >= 1 && S.ui.verilen.length === S.ui.alinan.length;
    let onizleme = '';
    if (karsi && esitSayi) {
      const y = C.takasKadrolari(k, karsi, S.ui.verilen, S.ui.alinan);
      const sorun = takasSorunu(tid, S.ui.takasTakim, y.veren, y.alan);
      onizleme = `<div class="uyari-kutu kucuk">${S.ui.verilen.map((p, i) => `${esc(oyuncu(S.ui.alinan[i]).ad)}, senin kadronda ${esc(oyuncu(p).ad)} yerine ${rolu(tid, p)} olur.`).join('<br>')}</div>
        ${sorun ? `<div class="hata-kutu kucuk">${esc(sorun)}</div>` : ''}`;
    }
    yeni = `<div class="kart"><h3>Yeni takas teklifi</h3>
      <p class="kucuk soluk">Her iki taraftan aynı sayıda (1–3) oyuncu seç. Seçim sırası eşleşmeyi belirler: 1. verdiğinin yerine 1. aldığın geçer (As ya da Yedek). As'taki bir oyuncunun yerine aynı mevkiden oyuncu gelmeli. Takas karşı taraf kabul edince <b>${etkinHafta()}. haftadan</b> itibaren geçerli olur.</p>
      <select id="takas-takim" data-ui="takasTakim"><option value="">Takım seç</option>${takimlar().filter(t => t.id !== tid).map(t => `<option value="${t.id}" ${t.id === S.ui.takasTakim ? 'selected' : ''}>${esc(t.ad)}</option>`).join('')}</select>
      ${karsi ? `<div class="iki-kolon" style="margin-top:10px">
        <div><b>Vereceklerin</b><div>${[...k.as, ...k.yedek].map(p => chip(p, S.ui.verilen, 'tk-ver')).join('')}</div></div>
        <div><b>Alacakların</b><div>${[...karsi.as, ...karsi.yedek].map(p => chip(p, S.ui.alinan, 'tk-al')).join('')}</div></div>
      </div>
      ${onizleme}
      <input type="text" id="takas-not" maxlength="200" placeholder="Not (isteğe bağlı)" style="width:100%;margin:8px 0">
      <button class="btn ana" data-is="teklif-gonder" ${esitSayi ? '' : 'disabled'}>Teklifi gönder</button>` : ''}
    </div>`;
  }
  return `${tid ? '' : '<div class="kart"><p style="margin:0">Takas teklif etmek için menajer linkinle gir.</p></div>'}
    ${gelen.length ? `<div class="kart"><h3>Sana gelen teklifler</h3>${gelen.map(t => teklifKarti(t, `<button class="btn ana" data-is="teklif-kabul" data-id="${t.id}" ${teklifGecerliligi(t) ? 'disabled' : ''}>Kabul et</button><button class="btn tehlike" data-is="teklif-red" data-id="${t.id}">Reddet</button>`)).join('')}</div>` : ''}
    ${yeni}
    ${giden.length ? `<div class="kart"><h3>Gönderdiğin teklifler</h3>${giden.map(t => teklifKarti(t, `<button class="btn" data-is="teklif-iptal" data-id="${t.id}">Geri çek</button>`)).join('')}</div>` : ''}
    <div class="kart"><h3>Ligdeki takaslar</h3>${biten.length ? biten.map(t => teklifKarti(t)).join('') : '<p class="soluk" style="margin:0">Henüz takas yapılmadı.</p>'}</div>`;
}

// ---------- Hareketler ----------
function hareketSatiri(h) {
  let metin = '';
  if (h.tur === 'serbest') metin = `<b>${esc(takimAdi(h.takim))}</b> serbest oyuncu aldı: ${oyuncuAdi(h.alinan)} · Bıraktı: ${oyuncuAdi(h.birakilan)}`;
  else if (h.tur === 'degisiklik') metin = `<b>${esc(takimAdi(h.takim))}</b> As–Yedek değişikliği: As'a geçen ${oyuncuAdi(h.asaGecen)} · Yedeğe geçen ${oyuncuAdi(h.yedegeGecen)}`;
  else if (h.tur === 'takas') metin = `<b>${esc(takimAdi(h.veren))}</b> ⇄ <b>${esc(takimAdi(h.takim))}</b> takası: ${h.verilen.map(p => oyuncuAdi(p)).join(', ')} ⇄ ${h.alinan.map(p => oyuncuAdi(p)).join(', ')}`;
  else metin = esc(h.metin ?? h.tur);
  return `<div class="teklif"><div class="kucuk soluk">${h.zaman ? tarih(h.zaman) : ''}${h.hafta ? ` · ${h.hafta}. haftadan geçerli` : ''}</div>${metin}</div>`;
}

function gorunumHareketler() {
  const liste = Object.values(S.hareketler).sort((a, b) => (b.zaman?.toMillis?.() ?? 0) - (a.zaman?.toMillis?.() ?? 0));
  return `<div class="kart"><h2>Hareketler</h2>${liste.length ? liste.map(hareketSatiri).join('') : '<p class="soluk">Henüz hareket yok.</p>'}</div>`;
}

// ---------- Kurallar ----------
function gorunumKurallar() {
  const a = S.ayar;
  return `<div class="kart kurallar"><h2>Kurallar</h2>
    <h3>Draft</h3><ul>
      <li>${a.takimSayisi} takım. Draft sırası sistemde kurayla belirlenir ve herkese canlı gösterilir.</li>
      <li>Yılan draft: 1. tur 1→${a.takimSayisi}, 2. tur ${a.takimSayisi}→1, 3. tur yine 1→${a.takimSayisi}…</li>
      <li>Her takım ${kadroBoyu()} oyuncu seçer: ${a.asSayisi} As + ${a.yedekSayisi} Yedek (toplam ${a.takimSayisi * kadroBoyu()} seçim). Bir oyuncu sadece bir takımda olabilir.</li>
      <li>Her seçim için süre ${sureMetni(a.secimSuresi)}. Süre dolarsa, müsait oyuncular içinden bu sezonun BSL maç başı VP ortalamasına göre en iyi 15 oyuncudan rastgele biri otomatik seçilir.</li>
      <li>Aynı BSL takımından istediğin kadar oyuncu seçebilirsin.</li>
      <li>Her oyuncu <b>Ön</b> (uzun/forvet) ya da <b>Arka</b> (oyun kurucu/şutör) sahadır. As beşi <b>${kural().asOn} Ön + ${kural().asArka} Arka</b>; ${kural().yedek} Yedeğin mevkisi serbest.</li>
      <li>As'ta en az 1, Yedekte en az 1 Türk oyuncu (TÜRKİYE / KKTC) olmalı.</li>
      <li>Draftta bu kuralı imkânsız hale getirecek oyuncu seçilemez (ör. 4 yabancı Ön alan takım 5. seçimde yabancı Ön alamaz); site o an seçebileceğin oyuncu türlerini gösterir. Otomatik seçim de buna uyar.</li>
      <li>Seçilen oyuncular kadroya mevkilerine göre yerleşir; draft bitince sezon başlayana kadar dizilişini serbestçe değiştirebilirsin.</li>
    </ul>
    <h3>Sezon</h3><ul>
      <li>Takaslar sınırsız; iki taraf da kabul etmeli. İki taraftan aynı sayıda (1–3) oyuncu verilir; gelen oyuncu gidenin yerine (As/Yedek) geçer.</li>
      <li>Her takım sezon boyunca en fazla ${a.faHakki} serbest oyuncu (hiçbir takımda olmayan oyuncu) alabilir; alırken bir oyuncusunu bırakır.</li>
      <li>Her takım sezon boyunca ${a.degisiklikHakki} kez As–Yedek değişikliği yapabilir.</li>
      <li>Diziliş, As–Yedek değişikliği, takas ve serbest oyuncu sonrasında da As ${kural().asOn} Ön + ${kural().asArka} Arka olmalı ve As'ta en az 1, Yedekte en az 1 Türk kalmalı. Bu yüzden As'taki bir oyuncunun yerine ancak aynı mevkiden oyuncu gelebilir.</li>
      <li>Kadro değişiklikleri, ilk maçı henüz başlamamış ilk haftadan itibaren geçerlidir (hafta ortasında yapılan değişiklik bir sonraki haftadan sayılır). Geçmiş haftalar değişmez.</li>
    </ul>
    <h3>Puanlama</h3><ul>
      <li>Puanlama ${a.baslangicHaftasi}. BSL haftasından itibaren başlar.</li>
      <li>Takımın haftalık puanı, ${a.asSayisi} As oyuncunun o hafta BSL'de aldığı verimlilik (VP) puanlarının toplamıdır.</li>
      <li>Bir As hafta içinde hiç süre almazsa (0 dakika oynarsa ya da takımı bay geçerse), yedeklerden o hafta en yüksek VP alan onun yerine sayılır.</li>
      <li>Haftalık sıralamaya göre lig puanı: ${C.PUAN_TABLOSU.map((p, i) => `${i + 1}. ${p}`).join(', ')}.</li>
      <li>Haftalık eşitlikte, sayılan oyuncular içindeki en yüksek VP'li Türk oyuncusu daha yüksek olan takım üstte yer alır; bu da eşitse aynı sırayı ve puanı paylaşırlar.</li>
      <li>Genel klasman haftalık lig puanlarının toplamıdır; eşitlikte toplam VP yüksek olan üstte.</li>
    </ul></div>`;
}

// ---------- Yönetici ----------
function gorunumYonetici() {
  const d = S.durum;
  const a = d.asama;
  if (!S.kodlar) {
    S.kodlar = {};
    D.kodlariGetir().then(k => { S.kodlar = k; ciz(); }).catch(hataGoster);
  }
  if (!S.havuzYuklendi) havuzuYukleIstemci();
  const adimlar = [];
  const asamaAdi = { kurulum: 'Kurulum (kura bekleniyor)', kura: 'Kura çekildi', draft: 'Draft devam ediyor', duraklatildi: 'Draft duraklatıldı', kadro: 'Draft bitti, dizilişler kuruluyor', sezon: 'Sezon devam ediyor' }[a];
  if (DRAFT_ASAMALARI.includes(a)) {
    const rehberHavuz = C.havuzSirala([...S.rehber.values()], o => mevki(o.id));
    adimlar.push(`<div class="kart"><h3>1. Oyuncu havuzu</h3>
      <p>Draftta seçilebilecek oyuncular ve otomatik seçim sıralaması (bu sezonun VP ortalaması). Önce <a href="#/mevkiler">Mevkiler</a> sayfasından oyuncuların Ön/Arka mevkilerini kontrol et. Havuz, draft başlatılırken son haliyle otomatik yeniden yüklenir.</p>
      <p class="soluk kucuk">Yüklü havuz: ${S.havuz.length} oyuncu · Sitedeki veri: ${rehberHavuz.length} aktif oyuncu (${rehberHavuz.filter(o => o.turk).length} Türk), güncelleme ${S.index?.guncelleme ? tarih(S.index.guncelleme) : '-'}</p>
      <button class="btn ${S.havuz.length ? '' : 'ana'}" data-is="havuz-yukle" ${['kurulum', 'kura'].includes(a) ? '' : 'disabled'}>Oyuncu havuzunu yükle</button></div>`);
  }
  adimlar.push(`<div class="kart"><h3>Takımlar ve giriş linkleri</h3>
    <p class="kucuk soluk">Her menajere kendi linkini gönder. Link, takımın adına işlem yapma yetkisidir; başkasıyla paylaşılmamalı. Bir link yanlış kişiye gittiyse "Yenile" ile eskisini iptal et.</p>
    <div class="tablo-kap"><table><thead><tr><th>#</th><th>Takım adı</th><th>Menajer</th><th>Giriş linki</th></tr></thead><tbody>
    ${takimlar().map(t => {
      const kod = S.kodlar?.[t.id];
      const link = kod ? girisLinki(kod) : '';
      const mesaj = `${S.ayar.ad} giriş linkin (${t.ad}). Kimseyle paylaşma: ${link}`;
      return `<tr><td>${t.no}</td>
        <td><input type="text" id="ta-${t.id}" value="${esc(t.ad)}" maxlength="30" style="width:150px"></td>
        <td><input type="text" id="tm-${t.id}" value="${esc(t.menajer)}" maxlength="40" style="width:130px"></td>
        <td><div class="satir"><button class="btn kucuk" data-is="takim-kaydet" data-id="${t.id}">Kaydet</button>
          ${kod ? `<button class="btn kucuk" data-is="kopyala" data-metin="${esc(link)}">Linki kopyala</button>
          <a class="btn kucuk" href="https://wa.me/?text=${encodeURIComponent(mesaj)}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn kucuk tehlike" data-is="kod-yenile" data-id="${t.id}">Yenile</button>` : '<span class="soluk kucuk">yükleniyor…</span>'}</div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="kucuk soluk" style="margin-bottom:0">Senin yönetici linkin: <button class="btn kucuk" data-is="kopyala" data-metin="${esc(S.kodlar?.admin ? girisLinki(S.kodlar.admin) : '')}">Yönetici linkini kopyala</button></p></div>`);
  adimlar.push(`<div class="kart"><h3>Ayarlar</h3><div class="form-izgara">
      <label for="ay-sure">Seçim süresi (saniye)</label><input type="number" id="ay-sure" min="5" max="600" value="${S.ayar.secimSuresi}">
      <label for="ay-hafta">Puanlamanın başlayacağı BSL haftası</label><input type="number" id="ay-hafta" min="1" max="40" value="${S.ayar.baslangicHaftasi}" ${a === 'sezon' ? 'disabled' : ''}>
    </div><p><button class="btn" data-is="ayar-kaydet">Ayarları kaydet</button></p>
    <p class="kucuk soluk" style="margin:0">Seçim süresi değişikliği bir sonraki seçimden itibaren geçerli olur.</p></div>`);
  const akis = [];
  if (['kurulum', 'kura'].includes(a)) akis.push(`<button class="btn ${a === 'kurulum' ? 'ana' : ''}" data-is="kura" ${S.havuz.length ? '' : 'disabled'}>${a === 'kura' ? 'Kurayı yeniden çek' : 'Kurayı çek'}</button>`);
  if (a === 'kura') akis.push('<button class="btn ana" data-is="draft-baslat">Draftı başlat</button>');
  if (a === 'draft') akis.push('<button class="btn" data-is="duraklat">Duraklat</button>');
  if (a === 'duraklatildi') akis.push('<button class="btn ana" data-is="devam">Devam ettir</button>');
  if (['draft', 'duraklatildi', 'kadro'].includes(a) && d.secimNo > 0) akis.push('<button class="btn tehlike" data-is="geri-al">Son seçimi geri al</button>');
  if (a === 'kadro') akis.push('<button class="btn ana" data-is="sezon-baslat">Sezonu başlat (dizilişleri kilitle)</button>');
  adimlar.push(`<div class="kart"><h3>Draft akışı</h3><p>Durum: <b>${asamaAdi}</b>${['draft', 'duraklatildi'].includes(a) ? ` · ${d.secimNo + 1}. seçim` : ''}</p>
    <div class="satir">${akis.join('') || '<span class="soluk">Bu aşamada yapılacak bir şey yok.</span>'}</div>
    ${!S.havuz.length && ['kurulum', 'kura'].includes(a) ? '<p class="kucuk soluk">Kura için önce oyuncu havuzunu yükle.</p>' : ''}
    ${a === 'sezon' ? `<p class="kucuk soluk">Kadro değişikliklerinin geçerli olabileceği en erken hafta: ${d.aktifHafta}. hafta (bu sayfa açılınca otomatik güncellenir).</p>` : ''}</div>`);
  adimlar.push(`<div class="kart"><h3>Tehlikeli bölge</h3>
    <p class="kucuk">Deneme draftından sonra gerçek drafta temiz başlamak için: bütün seçimleri, kadroları, takasları ve hareketleri siler. Takım adları, menajerler ve giriş linkleri kalır.</p>
    <button class="btn tehlike" data-is="sifirla">Draftı sıfırla</button></div>`);
  return adimlar.join('');
}

// ---------- Yönetici: mevkiler ----------
function gorunumMevkiler() {
  const ara = S.ui.ara.toLocaleLowerCase('tr');
  const tum = [...S.rehber.values()].filter(o => o.aktif);
  const belirsizMi = o => !S.mevkiler[o.id] && !o.mevkiTahmini;
  const bslTakimlar = [...new Set(tum.map(o => o.takim))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = tum.filter(o => (!S.ui.bslTakim || o.takim === S.ui.bslTakim)
    && (!S.ui.belirsiz || belirsizMi(o)) && (!S.ui.mevkiFiltre || mevki(o.id) === S.ui.mevkiFiltre)
    && (!ara || o.ad.toLocaleLowerCase('tr').includes(ara)));
  const sayim = m => tum.filter(o => mevki(o.id) === m).length;
  return `<div class="kart"><h2>Mevkiler</h2>
    <p>TBF'de mevki bilgisi olmadığı için ilk değerler maç istatistiklerinden tahmin edildi (ribaund ve blok asistin iki katından fazlaysa Ön).
    Kanat oyuncularında ve hiç oynamamış oyuncularda (<b>?</b>) yanılabilir; draft öncesi kontrol et. Her tıklama hemen kaydedilir.</p>
    <p class="kucuk soluk">Ön: ${sayim('on')} · Arka: ${sayim('arka')} · Belirsiz: ${tum.filter(belirsizMi).length}.
    ${['draft', 'duraklatildi', 'kadro', 'sezon'].includes(asama()) ? 'Draft başladıktan sonra bir takımdaki oyuncunun mevkisini değiştirmek o takımın dizilişini kurala aykırı yapabilir.' : ''}</p>
    <div class="satir" style="margin-bottom:10px">
      <input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ara" value="${esc(S.ui.ara)}" class="ara">
      <select id="f-takim" data-ui="bslTakim"><option value="">Bütün BSL takımları</option>${bslTakimlar.map(t => `<option ${t === S.ui.bslTakim ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select id="f-mevki" data-ui="mevkiFiltre"><option value="">Ön + Arka</option><option value="on" ${S.ui.mevkiFiltre === 'on' ? 'selected' : ''}>Sadece Ön</option><option value="arka" ${S.ui.mevkiFiltre === 'arka' ? 'selected' : ''}>Sadece Arka</option></select>
      <label class="secenek"><input type="checkbox" id="f-belirsiz" data-ui="belirsiz" ${S.ui.belirsiz ? 'checked' : ''}> Sadece belirsizler</label>
    </div>
    <div class="tablo-kap"><table>
      <thead><tr><th>Oyuncu</th><th>BSL takımı</th><th class="sayi">Maç</th><th class="sayi">VP</th><th class="sayi">Rib.</th><th class="sayi">Ast.</th><th>Mevki</th></tr></thead>
      <tbody>${liste.map(o => {
        const m = mevki(o.id);
        return `<tr><td>${esc(o.ad)}${o.turk ? ' <span class="rozet tr">TR</span>' : ''}${belirsizMi(o) ? ' <span class="rozet uyari" title="Tahmin yok">?</span>' : ''}</td>
          <td class="kucuk">${bslTakimHucre(o)}</td><td class="sayi">${o.mac}</td><td class="sayi">${sayi(o.vpOrt)}</td>
          <td class="sayi">${sayi(o.ribOrt)}</td><td class="sayi">${sayi(o.astOrt)}</td>
          <td><div class="satir" style="flex-wrap:nowrap">${['on', 'arka'].map(x => `<button class="btn kucuk ${m === x ? 'ana' : ''}" data-is="mevki" data-id="${o.id}" data-mevki="${x}">${C.MEVKI_ADI[x]}</button>`).join('')}</div></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="bos">Oyuncu bulunamadı</td></tr>'}</tbody>
    </table></div></div>`;
}

// ---------- Olaylar ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-is]');
  if (!el) return;
  const is = el.dataset.is;
  const id = el.dataset.id;
  if (el.tagName === 'A') e.preventDefault();
  try {
    await eylem(is, id, el);
  } catch (err) {
    hataGoster(err);
  }
});

document.addEventListener('input', e => {
  const anahtar = e.target.dataset?.ui;
  if (!anahtar) return;
  S.ui[anahtar] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (anahtar === 'takasTakim') S.ui.alinan = [];
  ciz();
});

window.addEventListener('hashchange', () => {
  S.ui.faAl = null;
  S.ui.acik = S.ui.acikSonraki ?? null;
  S.ui.acikSonraki = null;
  ciz();
  window.scrollTo(0, 0);
});

const deger = id => document.getElementById(id)?.value?.trim() ?? '';

async function eylem(is, id, el) {
  switch (is) {
    case 'git':
      S.ui.acikSonraki = el.dataset.acik ?? null;
      location.hash = el.dataset.yol;
      return;
    case 'ac': S.ui.acik = S.ui.acik === id ? null : id; return ciz();
    case 'draft-sekme': S.ui.draftSekme = id; return ciz();
    case 'puan-sekme': S.ui.puanSekme = id; if (id === 'genel' && rota()[1]) location.hash = '#/puan'; return ciz();
    case 'kopyala':
      await navigator.clipboard.writeText(el.dataset.metin);
      return bildir('Kopyalandı');
    case 'cikis':
      if (!confirm('Bu cihazdaki girişin silinsin mi? Tekrar girmek için linkine ihtiyacın olacak.')) return;
      localStorage.removeItem(KOD_ANAHTARI);
      await F.deleteDoc(F.doc(fdb, 'uyeler', S.uid)).catch(() => {});
      location.reload();
      return;
    case 'ligi-kur': {
      const hafta = Number(deger('k-hafta'));
      const sure = Number(deger('k-sure'));
      if (!hafta || !sure) return bildir('Hafta ve süreyi gir.', true);
      el.disabled = true;
      const sonuc = await D.ligiKur(S.uid, {
        ad: deger('k-ad') || 'BSL Draft Ligi', secimSuresi: sure, baslangicHaftasi: hafta,
        menajerler: Array.from({ length: 17 }, (_, i) => deger(`k-m${i}`)),
      });
      localStorage.setItem(KOD_ANAHTARI, sonuc.adminKod);
      S.kod = sonuc.adminKod;
      S.ben = 'admin';
      S.kurulumSonucu = sonuc;
      return ciz();
    }
    case 'kurulum-bitti':
      location.hash = '#/yonetici';
      location.reload();
      return;
    case 'sec': {
      const o = S.havuzMap.get(id);
      const d = S.durum;
      const tid = d.secimSirasi[d.secimNo];
      const kimin = tid === benimTakimim() ? '' : ` (${takimAdi(tid)} adına)`;
      if (!confirm(`${o.ad} – ${o.takim}${kimin} seçilsin mi?`)) return;
      await D.secimYap({ takim: tid, oyuncu: o, otomatik: false, beklenenNo: d.secimNo, dizilis: draftDizilisi });
      S.ui.ara = '';
      return bildir(`${o.ad} seçildi!`);
    }
    case 'dizilis': {
      const s = S.ui.dizilis;
      if (s.has(id)) s.delete(id); else if (s.size < S.ayar.asSayisi) s.add(id);
      return ciz();
    }
    case 'dizilis-kaydet': {
      const tid = benimTakimim();
      const k = S.kadrolar[tid];
      const tum = [...k.as, ...k.yedek];
      await D.dizilisKaydet(tid, tum.filter(p => S.ui.dizilis.has(p)), tum.filter(p => !S.ui.dizilis.has(p)));
      return bildir('Diziliş kaydedildi');
    }
    case 'degistir': {
      const asP = deger('dg-as');
      const yP = deger('dg-yedek');
      if (!asP || !yP) return bildir('Bir As ve bir Yedek seç.', true);
      const kk = S.kadrolar[benimTakimim()];
      const turkHata = dizilisSorunu({ as: kk.as.map(p => (p === asP ? yP : p)), yedek: kk.yedek.map(p => (p === yP ? asP : p)) });
      if (turkHata) return bildir(`Bu değişiklik olmaz: ${turkHata}.`, true);
      const h = etkinHafta();
      if (!confirm(`${oyuncu(asP).ad} yedeğe, ${oyuncu(yP).ad} As'a geçecek (${h}. haftadan itibaren). Sezondaki tek değişiklik hakkın kullanılacak. Onaylıyor musun?`)) return;
      await D.asYedekDegistir(benimTakimim(), asP, yP, h);
      return bildir('Değişiklik yapıldı');
    }
    case 'takim-adi': {
      const ad = deger('takim-adi');
      if (ad.length < 2) return bildir('Takım adı en az 2 harf olmalı.', true);
      await D.takimAdiKaydet(benimTakimim(), ad);
      return bildir('Takım adı kaydedildi');
    }
    case 'fa-al': S.ui.faAl = id; ciz(); window.scrollTo(0, 0); return;
    case 'fa-vazgec': S.ui.faAl = null; return ciz();
    case 'fa-onayla': {
      const birak = deger('fa-birak');
      if (!birak) return bildir('Bırakacağın oyuncuyu seç.', true);
      const tid = benimTakimim();
      const al = oyuncu(S.ui.faAl);
      const yeni = C.yerineKoy(S.kadrolar[tid], birak, al.id);
      const turkHata = dizilisSorunu(yeni);
      if (turkHata) return bildir(`Bu değişiklik olmaz: ${turkHata}.`, true);
      const h = etkinHafta();
      if (!confirm(`${al.ad} alınacak, ${oyuncu(birak).ad} bırakılacak (${h}. haftadan itibaren). Serbest oyuncu hakkından 1 kullanılacak. Onaylıyor musun?`)) return;
      await D.serbestAl(tid, birak, al, h);
      S.ui.faAl = null;
      return bildir(`${al.ad} takımına katıldı`);
    }
    case 'tk-ver':
    case 'tk-al': {
      const liste = is === 'tk-ver' ? S.ui.verilen : S.ui.alinan;
      const i = liste.indexOf(id);
      if (i >= 0) liste.splice(i, 1); else if (liste.length < 3) liste.push(id);
      return ciz();
    }
    case 'teklif-gonder': {
      const tid = benimTakimim();
      const y = C.takasKadrolari(S.kadrolar[tid], S.kadrolar[S.ui.takasTakim], S.ui.verilen, S.ui.alinan);
      const sorun = takasSorunu(tid, S.ui.takasTakim, y.veren, y.alan);
      if (sorun) return bildir(sorun, true);
      await D.teklifGonder({ veren: tid, alan: S.ui.takasTakim, verilen: [...S.ui.verilen], alinan: [...S.ui.alinan], not: deger('takas-not') });
      S.ui.verilen = [];
      S.ui.alinan = [];
      return bildir('Teklif gönderildi');
    }
    case 'teklif-kabul': {
      const t = S.teklifler[id];
      const h = etkinHafta();
      if (!confirm(`Takası kabul ediyor musun? ${h}. haftadan itibaren geçerli olacak.`)) return;
      await D.teklifKabul(id, h, (v, a) => takasSorunu(t.veren, t.alan, v, a));
      return bildir('Takas tamamlandı');
    }
    case 'teklif-red': await D.teklifReddet(id); return bildir('Teklif reddedildi');
    case 'teklif-iptal': await D.teklifIptal(id); return bildir('Teklif geri çekildi');
    // Yönetici
    case 'havuz-yukle': {
      const havuz = C.havuzSirala([...S.rehber.values()], o => mevki(o.id));
      if (!confirm(`${havuz.length} oyuncu draft havuzuna yüklensin mi?`)) return;
      el.disabled = true;
      await havuzuGuncelle();
      return bildir('Oyuncu havuzu yüklendi');
    }
    case 'mevki':
      await D.mevkiKaydet(id, el.dataset.mevki, S.havuzMap.has(id));
      if (S.havuzMap.has(id)) S.havuzMap.get(id).mevki = el.dataset.mevki;
      return;
    case 'takim-kaydet':
      await D.takimiKaydet(id, { ad: deger(`ta-${id}`) || S.takimlar[id].ad, menajer: deger(`tm-${id}`) });
      return bildir('Kaydedildi');
    case 'kod-yenile': {
      if (!confirm(`${takimAdi(id)} için yeni link oluşturulsun mu? Eski link artık çalışmaz.`)) return;
      S.kodlar[id] = await D.koduYenile(id, S.kodlar[id]);
      ciz();
      return bildir('Yeni link oluşturuldu');
    }
    case 'ayar-kaydet': {
      const secimSuresi = Number(deger('ay-sure'));
      const baslangicHaftasi = Number(deger('ay-hafta'));
      if (secimSuresi < 5) return bildir('Süre en az 5 saniye olmalı.', true);
      await D.ayarlariKaydet({ secimSuresi, ...(asama() === 'sezon' ? {} : { baslangicHaftasi }) });
      if (asama() !== 'sezon' && S.durum.aktifHafta !== baslangicHaftasi) await D.aktifHaftayiKaydet(baslangicHaftasi);
      return bildir('Ayarlar kaydedildi');
    }
    case 'kura':
      if (!confirm(asama() === 'kura' ? 'Kura yeniden çekilsin mi? Herkes yeni sırayı görecek.' : 'Kura çekilsin mi? Sıra herkese canlı gösterilecek.')) return;
      await D.kuraCek(takimlar().map(t => t.id));
      location.hash = '#/draft';
      return;
    case 'draft-baslat':
      if (!confirm('Draft başlasın mı? İlk seçimin saati hemen işlemeye başlar.')) return;
      el.disabled = true;
      await havuzuGuncelle(); // son mevki düzeltmeleri ve otomatik seçim sıraları havuza işlensin
      await D.draftiBaslat(S.ayar.secimSuresi);
      location.hash = '#/draft';
      return;
    case 'duraklat': await D.duraklat((kalanMs() ?? 0) / 1000); return;
    case 'devam': await D.devamEt(S.durum.kalanSure ?? S.ayar.secimSuresi); return;
    case 'geri-al': {
      const n = S.durum.secimNo - 1;
      const s = S.secimler[n];
      if (!confirm(`Son seçim (${n + 1}. seçim${s ? `: ${s.ad} – ${takimAdi(s.takim)}` : ''}) geri alınsın mı? Sıra o takıma döner.`)) return;
      await D.sonSecimiGeriAl();
      return bildir('Son seçim geri alındı');
    }
    case 'ekran':
      if (!confirm(id === 'lig' ? 'Herkesin ekranı lig ekranına (puan durumu, takımlar, boştakiler…) geçsin mi?' : 'Herkesin ekranı draft ekranına dönsün mü?')) return;
      await D.ekranDegistir(id);
      return;
    case 'sezon-baslat':
      if (!confirm(`Sezon başlasın mı? Dizilişler kilitlenir; puanlama ${S.ayar.baslangicHaftasi}. haftadan başlar.`)) return;
      await D.sezonuBaslat(S.kadrolar, S.ayar.baslangicHaftasi);
      location.hash = '#/puan';
      return;
    case 'sifirla':
      if (!confirm('Bütün seçimler, kadrolar, takaslar ve hareketler silinecek. Emin misin?')) return;
      if (prompt('Onaylamak için SIFIRLA yaz') !== 'SIFIRLA') return;
      await D.draftiSifirla(takimlar().map(t => t.id), S.ayar.secimSuresi);
      return bildir('Draft sıfırlandı');
    default:
  }
}

// ---------- Veri ----------
// Yönetici: sitedeki oyuncu listesini ve mevkileri draft havuzu olarak Firestore'a yazar
async function havuzuGuncelle() {
  const havuz = C.havuzSirala([...S.rehber.values()], o => mevki(o.id));
  await D.mevkileriYaz(Object.fromEntries([...S.rehber.values()].map(o => [o.id, mevki(o.id)])));
  await D.havuzuYukle(havuz);
  await havuzuYukleIstemci(true);
}

async function havuzuYukleIstemci(zorla = false) {
  if (S.havuzYukleniyor && !zorla) return;
  S.havuzYukleniyor = true;
  try {
    const liste = (await D.havuzuGetir()).sort((a, b) => a.sira - b.sira);
    S.havuz = liste;
    S.havuzMap = new Map(liste.map(o => [o.id, o]));
    S.havuzYuklendi = true;
    ciz();
  } finally {
    S.havuzYukleniyor = false;
  }
}

function secimleriDinle() {
  if (secimDinleyici) return;
  secimDinleyici = D.secimleriDinle(v => { S.secimler = v; ciz(); }, dinlemeHatasi);
}

async function haftalariYukle() {
  if (S.haftalarYukleniyor || !S.index || !S.ayar) return;
  S.haftalarYukleniyor = true;
  const gerekli = S.index.haftalar.filter(h => h.hafta >= S.ayar.baslangicHaftasi && h.hafta <= S.index.guncelHafta + 1
    && h.ilkMac && new Date(h.ilkMac).getTime() <= simdi());
  await Promise.all(gerekli.map(async h => {
    try { S.haftalar[h.hafta] = await jsonGetir(`data/hafta/${h.hafta}.json`); } catch { /* henüz yazılmamış hafta */ }
  }));
  S.haftalarYuklendi = true;
  S.haftalarYukleniyor = false;
  ciz();
}

function veriGeldi(ad, v) {
  if (ad !== 'durum') {
    S[ad] = v;
    if (ad === 'ayar') S.hazir = !!(S.ayar && S.durum);
    if (ad === 'ayar' && asama() === 'sezon' && !S.haftalarYuklendi) haftalariYukle();
    return ciz();
  }
  if (!v) { // lig silinmiş
    S.ligYok = true;
    S.hazir = true;
    return ciz();
  }
  const onceki = S.durum;
  S.durum = v;
  if (onceki && ligEkraniMi(onceki) !== ligEkraniMi(v)) location.hash = ligEkraniMi(v) ? '#/puan' : '#/draft';
  S.hazir = !!(S.ayar && S.durum);
  const a = v.asama;
  if (['kura', 'draft', 'duraklatildi', 'kadro'].includes(a)) secimleriDinle();
  if (DRAFT_ASAMALARI.includes(a) && (!S.havuzYuklendi || (onceki && onceki.asama !== a && a === 'draft'))) havuzuYukleIstemci(true);
  if (a === 'sezon' && !S.haftalarYuklendi) haftalariYukle();
  if (a === 'kurulum' && onceki && onceki.asama !== 'kurulum') S.secimler = {};
  if (a !== 'kadro') S.ui.dizilis = null;
  // Sıra bana geldi: ses ve titreşim
  const tid = v.secimSirasi?.[v.secimNo];
  if (a === 'draft' && tid && tid === benimTakimim() && S.sonUyarilan !== v.secimNo) {
    S.sonUyarilan = v.secimNo;
    S.ui.draftSekme = 'oyuncular';
    bip();
    navigator.vibrate?.([200, 100, 200]);
  }
  // Yönetici açıkken: kadro değişikliklerinin geçerli olabileceği en erken haftayı ilerlet
  if (yonetici() && a === 'sezon' && S.index && S.ayar) {
    const h = C.etkinHafta(S.index, S.ayar.baslangicHaftasi, simdi());
    if (h > (v.aktifHafta ?? 0) && S.aktifHaftaYazilan !== h) {
      S.aktifHaftaYazilan = h;
      D.aktifHaftayiKaydet(h).catch(hataGoster);
    }
  }
  ciz();
}

function dinlemeHatasi(e) {
  console.error(e);
  bildir('Bağlantı hatası: sayfayı yenile.', true);
}

function bip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(t => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* ses yoksa sorun değil */ }
}

// ---------- Otomatik seçim ----------
// Süre dolunca açık olan bütün menajer ekranları seçimi yapmaya çalışır; Firestore işlemi sayesinde
// sadece biri başarılı olur, diğerleri "zaten yapıldı" diye vazgeçer.
let otoMesgul = false;
let otoBekle = 0;
let otoGecikme = Math.random() * 2000;

async function otomatikKontrol() {
  const d = S.durum;
  if (!d || d.asama !== 'draft' || !S.ben || otoMesgul || !S.havuz.length) return;
  const kalan = kalanMs();
  if (kalan == null || kalan > -(1500 + otoGecikme) || Date.now() < otoBekle) return;
  otoMesgul = true;
  try {
    const n = d.secimNo;
    const tid = d.secimSirasi[n];
    const adaylar = C.otomatikAdaylar(S.havuz, new Set(sahipler().keys()), izinliTipler(tid));
    if (!adaylar.length) throw new D.Hata('Otomatik seçim için uygun oyuncu yok.');
    await D.secimYap({ takim: tid, oyuncu: C.rastgele(adaylar), otomatik: true, beklenenNo: n, dizilis: draftDizilisi });
  } catch (e) {
    if (!(e instanceof D.Hata)) console.warn('Otomatik seçim yapılamadı', e);
    otoBekle = Date.now() + 2500;
  } finally {
    otoMesgul = false;
    otoGecikme = Math.random() * 2000;
  }
}

setInterval(() => {
  sayacGuncelle();
  if (asama() === 'kura') {
    const acilan = kuraAcilan();
    if (acilan !== S.kuraAcilan) { S.kuraAcilan = acilan; ciz(); }
  }
  otomatikKontrol();
}, 250);

// Sunucu saati farkını arada bir tazele (bilgisayarın saati kayabilir)
setInterval(() => { if (S.uid && !S.ligYok) D.saatFarki(S.uid).then(f => { S.saatFarki = f; }).catch(() => {}); }, 5 * 60 * 1000);

// ---------- Başlangıç ----------
async function girisYap() {
  const u = await D.uyelik(S.uid);
  if (S.kod) {
    const tid = C.kodTakimi(S.kod);
    if (!tid) {
      localStorage.removeItem(KOD_ANAHTARI);
      S.kod = null;
      bildir('Giriş linki hatalı.', true);
    } else if (u?.kod === S.kod) {
      S.ben = u.takim;
    } else {
      try {
        await D.koduBagla(S.uid, S.kod, tid);
        S.ben = tid;
        bildir(tid === 'admin' ? 'Yönetici olarak giriş yapıldı' : 'Takımına giriş yapıldı');
      } catch (e) {
        console.warn(e);
        localStorage.removeItem(KOD_ANAHTARI);
        S.kod = null;
        bildir('Giriş linki geçersiz ya da yenilenmiş. Yöneticiden yeni link iste.', true);
      }
    }
  }
  if (!S.ben && u) S.ben = u.takim;
}

async function basla() {
  if (!YEREL && String(firebaseConfig.apiKey).startsWith('BURAYA')) {
    S.hataMesaji = 'Firebase ayarları girilmemiş: <code>site/config.js</code> dosyasını KURULUM.md\'deki gibi doldurun.';
    return ciz();
  }
  try {
    await signInAnonymously(auth);
    // Tarayıcıda kayıtlı anonim kullanıcı geçersizse (silinmişse) yeni bir anonim girişle devam et;
    // menajer kodu cihazda saklı olduğu için takım bağlantısı aşağıda yeniden kurulur
    try {
      await auth.currentUser.getIdToken(true);
    } catch {
      await signOut(auth);
      await signInAnonymously(auth);
    }
    S.uid = auth.currentUser.uid;
    const params = new URLSearchParams(location.search);
    const linkKodu = params.get('kod');
    if (linkKodu) {
      localStorage.setItem(KOD_ANAHTARI, linkKodu);
      params.delete('kod');
      history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    }
    S.kod = localStorage.getItem(KOD_ANAHTARI);
    const [index, rehber] = await Promise.all([jsonGetir('data/index.json'), jsonGetir('data/oyuncular.json')]);
    S.index = index;
    S.rehber = new Map(rehber.map(o => [o.id, o]));
    if (!(await D.ligVarMi())) {
      S.ligYok = true;
      S.hazir = true;
      return ciz();
    }
    await girisYap();
    D.dinle(veriGeldi, dinlemeHatasi);
    // Sunucu saati farkı arka planda ölçülür; sayfanın açılmasını bekletmesin
    D.saatFarki(S.uid).then(f => { S.saatFarki = f; }).catch(e => console.warn('Sunucu saati alınamadı', e));
  } catch (e) {
    console.error(e);
    S.hataMesaji = `Bağlantı kurulamadı: ${esc(e.message)}. ${YEREL ? 'Firebase emülatörü çalışıyor mu?' : 'Firebase ayarlarını ve Anonim girişin açık olduğunu kontrol edin.'}`;
    ciz();
  }
}

basla();
