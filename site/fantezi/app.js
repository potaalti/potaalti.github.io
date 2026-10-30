import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, signInAnonymously, signOut, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import * as F from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
// Lig ayarı ve Firebase projesi her ligin kendi klasöründeki config.js'tedir (sayfadaki import map: 'lig-ayar')
import { firebaseConfig, lig as LIG_AYARI } from 'lig-ayar';
import * as C from './core.js';
import * as D from './db.js';

// Aynı motor iki lig için çalışır. BSL: draftla kurulur, As 3 Ön + 2 Arka ve Türk kuralı.
// TBL: kadrolar eski TBL Fantezi Ligi'nden içe aktarılır (draft yok), As'ta en fazla 2 yabancı, fantezi hafta numaraları.
const LIG = {
  kod: 'bsl', kisa: 'BSL', ad: 'Pota Altı BSL Fantezi Ligi', yerelProje: 'demo-bsl-draft',
  kural: 'bsl', draft: true, mevki: true, takas: true, hareketler: true, fanteziHaftasi: false, iceAktar: null, ...LIG_AYARI,
};

// Bilgisayarda (localhost) açılınca gerçek Firebase yerine yerel emülatör kullanılır (deneme draftı için)
const YEREL = ['localhost', '127.0.0.1'].includes(location.hostname);
const app = initializeApp(YEREL ? { projectId: LIG.yerelProje, apiKey: 'demo-key', authDomain: `${LIG.yerelProje}.firebaseapp.com` } : firebaseConfig);
const auth = getAuth(app);
// Lig verisi telefonda da saklanır: bağlantı zayıfken ya da yokken son görülen veriler açılır
const fdb = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
if (YEREL) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  F.connectFirestoreEmulator(fdb, '127.0.0.1', 8080);
}
D.baglan(F, fdb);

// Açılmış ama henüz kullanılmamış davet linki (Google girişi sırasında sayfa yenilenince kaybolmasın)
const DAVET_ANAHTARI = `${LIG.kod}Davet`; // ligler aynı adreste: tarayıcıda saklananlar lige göre ayrı
const KURA_ARALIK_MS = 1500; // kurada takımlar son sıradan 1. sıraya doğru bu aralıkla açılır
const DRAFT_ASAMALARI = ['kurulum', 'kura', 'draft', 'duraklatildi'];

const S = {
  hazir: false, ligYok: false, hataMesaji: null,
  uid: null, kod: null, ben: null, saatFarki: 0,
  ayar: null, durum: null, takimlar: {}, kadrolar: {}, secimler: {}, teklifler: {}, hareketler: {},
  havuz: [], havuzMap: new Map(), havuzYuklendi: false, mevkiler: {}, mevkiListesi: {}, lisanssiz: [], bslHareketleri: [], maclar: {},
  bekleme: {}, beklemeYuklendi: false, beklemeYazilan: new Set(), istek: [],
  kutular: {}, kutuYukleniyor: new Set(), oyuncuMaclari: {}, oyuncuYukleniyor: new Set(),
  rehber: new Map(), index: null, haftalar: {}, haftalarYuklendi: false,
  kodlar: null, kuraAcilan: -1, sonUyarilan: null,
  ui: {
    draftSekme: 'oyuncular', ara: '', bslTakim: '', sadeceTurk: false, alinanlar: false, mevkiFiltre: '', belirsiz: false,
    puanSekme: 'genel', acik: null, faAl: null, dizilis: null,
    takasTakim: '', verilen: [], alinan: [], duzeltNo: null, duzeltAra: '',
    yAra: '', yBirak: '', yDizilis: null, yDizilisTakim: null, faSirala: 'vp',
  },
};
let secimDinleyici = null;
if (YEREL) window.S = S; // yerel denemede durumu konsoldan incelemek için

// ---------- Yardımcılar ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sayi = n => (Math.round((n ?? 0) * 10) / 10).toLocaleString('tr-TR');
const simdi = () => Date.now() + S.saatFarki;
// Bilgisayar ekranı: draft odası ve lig sayfaları iki sütunlu çizilir
const GENIS = matchMedia('(min-width: 1100px)');
const genis = () => GENIS.matches;
const TELEFON = matchMedia('(max-width: 759px)');
const telefon = () => TELEFON.matches;
const takimlar = () => Object.values(S.takimlar).sort((a, b) => a.no - b.no);
const takimAdi = tid => S.takimlar[tid]?.ad ?? tid;
const kadroBoyu = () => (S.ayar?.asSayisi ?? 5) + (S.ayar?.yedekSayisi ?? 2);
const benimTakimim = () => (S.ben && S.ben !== 'admin' ? S.ben : null);
// Yönetici: yönetici linkiyle girenler ve yönetici yetkisi verilen takımların menajerleri (hem oynar hem yönetir)
const yonetici = () => S.ben === 'admin' || (!!S.ben && (S.ayar?.yoneticiTakimlar ?? []).includes(S.ben));
const asama = () => S.durum?.asama;
// Herkesin ana ekranı (yönetici değiştirir): draft bitmeden hep draft ekranı, sonra 'draft' ya da 'lig'
const ligEkraniMi = d => ['kadro', 'sezon'].includes(d?.asama) && (d.ekran ?? (d.asama === 'sezon' ? 'lig' : 'draft')) === 'lig';
const ligEkrani = () => ligEkraniMi(S.durum);
// Aramada büyük/küçük harf ve Türkçe karakter farkı gözetilmez ("gultekin" → "Gültekin")
const aramaNorm = s => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tarih = ts => (ts?.toDate ? ts.toDate() : new Date(ts)).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function oyuncu(pid) {
  return S.rehber.get(pid) ?? S.havuzMap.get(pid)
    ?? { id: pid, ad: String(pid).startsWith('adsiz:') ? pid.slice(6) : Object.values(S.secimler).find(s => s.oyuncu === pid)?.ad ?? `Oyuncu ${pid}`, takim: '', turk: false, vpOrt: 0, mac: 0 };
}
const turkMu = pid => !!oyuncu(pid).turk;
// Oyuncunun mevkisi (Ön = uzun/forvet, Arka = oyun kurucu/şutör): yöneticinin sitede değiştirdiği,
// yoksa yöneticinin listesi (data/mevkiler.json), listede olmayan yeni oyuncu için istatistik tahmini
const mevki = pid => S.mevkiler[pid] ?? S.mevkiListesi[pid] ?? S.havuzMap.get(pid)?.mevki ?? oyuncu(pid).mevkiTahmini ?? 'arka';
const bilgi = pid => ({ id: pid, mevki: mevki(pid), turk: turkMu(pid), vpOrt: oyuncu(pid).vpOrt ?? 0 });
// Draftta kurallar havuzdaki mevkiye bakar
const havuzBilgi = pid => {
  const o = S.havuzMap.get(pid);
  return o ? { id: pid, mevki: o.mevki, turk: !!o.turk, vpOrt: o.vpOrt ?? 0 } : bilgi(pid);
};
const kural = () => ({ tur: LIG.kural, asOn: S.ayar.asOn ?? 3, asArka: S.ayar.asArka ?? 2, yedek: S.ayar.yedekSayisi, enFazlaYabanci: S.ayar.asEnFazlaYabanci ?? 2 });
// Kuralın kısa anlatımı (değişiklik ekranlarında)
const kuralCumlesi = () => (LIG.kural === 'tbl'
  ? `As'ta en fazla ${kural().enFazlaYabanci} yabancı oyuncu olabilir`
  : `As'taki bir oyuncunun yerine aynı mevkiden oyuncu gelmeli (As ${kural().asOn} Ön + ${kural().asArka} Arka)`);
// Sezonluk hak: 99 ve üstü sınırsız sayılır
// TBL'de serbest oyuncu ve As–Yedek değişikliği aynı haktan düşer: "transfer hakkı"
const ortakHak = () => !!(S.ayar?.ortakHak ?? LIG.ortakHak);
const hakAdi = () => (ortakHak() ? 'transfer hakkı' : 'serbest oyuncu hakkı');
const HakAdi = () => (ortakHak() ? 'Transfer hakkı' : 'Serbest oyuncu hakkı');
// Takım kartındaki hak satırı
const hakOzeti = (k, kisa) => (ortakHak() ? `Transfer hakkı: ${k?.fa ?? 0}/${S.ayar.faHakki}`
  : kisa ? `Serbest: ${k?.fa ?? 0}/${S.ayar.faHakki} · Değişiklik: ${hakSayaci(k?.degisiklik, S.ayar.degisiklikHakki)}`
    : `Serbest oyuncu: ${k?.fa ?? 0}/${S.ayar.faHakki} · As–Yedek değişikliği: ${hakSayaci(k?.degisiklik, S.ayar.degisiklikHakki)}`);
// Bırakılan ya da lige yeni katılan oyuncunun kimse tarafından alınamadığı süre (talep ve kura süresi)
const beklemeSaati = () => S.ayar?.beklemeSaat ?? LIG.beklemeSaat ?? 36;
const hakYazisi = n => (n >= 99 ? 'istediğin kadar' : `${n} kez`);
const hakSayaci = (kullanilan, hak) => (hak >= 99 ? `${kullanilan ?? 0} (sınırsız)` : `${kullanilan ?? 0}/${hak}`);
// Fantezi hafta numarası: TBL'de lig, TBL'nin başlangıç haftasında 1. hafta olarak başlar (eski TBL Fantezi gibi)
const hf = n => (LIG.fanteziHaftasi && S.ayar ? n - S.ayar.baslangicHaftasi + 1 : n);
let kadroTablosu = null;
const izinliTipler = tid => C.izinliTipler(S.kadrolar[tid]?.tip, kadroTablosu ??= C.kadroTablosu(kural()));
// Takımın sıradaki seçimi kısıtlıysa açıklaması ("sadece Türk Arka oyuncu"), değilse null
const secimKisiti = tid => C.kisitMetni(izinliTipler(tid));
const dizilisSorunu = k => C.dizilisHatasi(k.as.map(bilgi), k.yedek.map(bilgi), kural());
const draftDizilisi = idler => C.dizilisOner(idler.map(havuzBilgi), kural());
// BSL takım adı: telefonda kısaltması (BSK, ERK...), geniş ekranda tam adı
const bslTakimHucre = o => `<span class="uzun-ad">${esc(o.takim)}</span><span class="kisa-ad" title="${esc(o.takim)}">${esc(o.takimKod || o.takim)}</span>`;
// Oyuncuların Ön/Arka mevkisi herkese gösterilir; yönetici Mevkiler sayfasından gizleyebilir (ayar.mevkilerHazir)
const mevkilerHazir = () => LIG.mevki && S.ayar?.mevkilerHazir !== false;
const mevkiRozeti = m => !mevkilerHazir() ? '' : `<span class="rozet mv" title="${m === 'on' ? 'Ön saha (uzun/forvet)' : 'Arka saha (oyun kurucu/şutör)'}">${C.MEVKI_ADI[m]}</span>`;

// Oyuncu id -> fantezi takımı (kadrolardan)
function sahipler() {
  const m = new Map();
  for (const [tid, k] of Object.entries(S.kadrolar)) for (const p of [...(k.as ?? []), ...(k.yedek ?? [])]) m.set(p, tid);
  return m;
}

// Takımlardaki oyunculardan lisansı TBF'de artık görünmeyenler (ligden ayrılanlar): [{ pid, tid }]
function lisansiDusenler() {
  return [...sahipler()].filter(([pid]) => S.rehber.get(pid)?.aktif === false).map(([pid, tid]) => ({ pid, tid }));
}

// Takımın zorunlu değişiklik bekleyen oyuncuları (yöneticinin ekranının onayladığı liste)
function zorunluBekleyen(tid) {
  const k = S.kadrolar[tid];
  if (!k || asama() !== 'sezon') return [];
  return [...k.as, ...k.yedek].filter(p => S.lisanssiz.includes(p));
}

// Mevkisi henüz belirlenmemiş (yöneticinin listesinde olmayan) oyuncular: genelde yeni transferler
const mevkisizler = () => !LIG.mevki ? [] : [...S.rehber.values()].filter(o => o.aktif && !S.mevkiler[o.id] && !S.mevkiListesi[o.id]);

const GORULDU_ANAHTARI = `${LIG.kod}BildirimGoruldu`;
function bildirimGoruldu() {
  try { return localStorage.getItem(GORULDU_ANAHTARI) ?? ''; } catch { return ''; }
}
const gorulmemisHareketler = () => S.bslHareketleri.filter(h => h.zaman > bildirimGoruldu());
// İki takımın anlaştığı, yöneticinin onayını bekleyen takaslar
const onayBekleyen = () => Object.values(S.teklifler).filter(t => t.durum === 'onay');
const bildirimSayisi = () => (yonetici() ? mevkisizler().length + gorulmemisHareketler().length + onayBekleyen().length : 0);

// Bekleme: bırakılan ya da lige yeni katılan oyuncu beklemeSaati() kadar kimse tarafından alınamaz. Kalan ms (yoksa 0)
function beklemeKalani(pid) {
  if (asama() !== 'sezon') return 0;
  const yeni = S.bslHareketleri.filter(h => h.id === pid && h.tur === 'yeni')
    .map(h => new Date(h.zaman).getTime() + D.BEKLEME_MS - simdi());
  return Math.max(0, D.beklemeKalan(S.bekleme[pid]), ...yeni);
}
// Talep: bekleme süresinde takımlar oyuncuya talip olur, süre bitince talipler arasında kura çekilir.
// evre 'talep' (süre işliyor; acik: talep edilebilir) ya da 'kura' (süre bitti, kura bekleniyor); boştaysa null
function talepDurumu(pid) {
  if (asama() !== 'sezon') return null;
  const b = S.bekleme[pid];
  const talepler = b?.talepler ?? {};
  const talipler = Object.keys(talepler).sort((a, c) => (S.takimlar[a]?.no ?? 0) - (S.takimlar[c]?.no ?? 0));
  const kalan = beklemeKalani(pid);
  if (kalan > 0) return { evre: 'talep', kalan, talipler, talepler, acik: !!b };
  if (talipler.length) return { evre: 'kura', kalan: 0, talipler, talepler };
  return null;
}
const sureYazisi = ms => (ms >= 3600000 ? `${Math.ceil(ms / 3600000)} sa` : `${Math.max(1, Math.ceil(ms / 60000))} dk`);

// link: adı oyuncu sayfasına bağlar (düğme içinde kullanılmaz)
// Türk oyuncu rozeti: BSL'de kadro kuralı Türk sayısına bağlı; TBL'de gösterilmez
const trRozeti = o => (o?.turk && LIG.kural !== 'tbl' ? ' <span class="rozet tr" title="Türk oyuncu">TR</span>' : '');
function oyuncuAdi(pid, { takim = true, link = false } = {}) {
  const o = oyuncu(pid);
  const ad = link ? `<a href="#/oyuncu/${esc(pid)}" class="oyuncu-link">${esc(o.ad)}</a>` : esc(o.ad);
  return `${ad} ${mevkiRozeti(mevki(pid))}${trRozeti(o)}${takim && o.takim ? ` <span class="bsl">${esc(o.takimKod || o.takim)}</span>` : ''}`;
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

// Veri dosyaları: GitHub Pages önbelleği (10 dk) canlı skoru geciktirmesin diye her istekte yeni adres
async function jsonGetir(yol) {
  const r = await fetch(`${yol}?t=${Date.now()}`, { cache: 'no-store' });
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

// ---------- Giriş: davet linki + Google ----------
// Menajer davet linkini açar, Google hesabıyla girer; hesap takıma bağlanır ve davet kodu silinir (tek kullanımlık).
// Sonra her cihazdan aynı Google hesabıyla girer. Girmeyenler siteyi izleyici olarak görür.
const googleMi = () => !!auth.currentUser && !auth.currentUser.isAnonymous;
const hesapBilgisi = () => ({ email: auth.currentUser.email, ad: auth.currentUser.displayName ?? '' });

async function googleIleGir() {
  const saglayici = new GoogleAuthProvider();
  saglayici.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, saglayici);
  } catch (e) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
    // Açılır pencereye izin vermeyen tarayıcılarda sayfa Google'a gidip geri döner
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) return signInWithRedirect(auth, saglayici);
    throw e;
  }
  location.reload();
}

function davetiBirak() {
  S.davet = null;
  try { localStorage.removeItem(DAVET_ANAHTARI); } catch { /* tarayıcı izin vermiyorsa */ }
}

// Her sayfanın üstünde: davet linkiyle gelen ama henüz Google ile girmemiş kişiye, ya da takıma bağlı olmayan hesaba
function girisKarti() {
  if (S.davet && !googleMi()) {
    return `<div class="kart sira-sende davet-kart"><h2>🏀 ${esc(S.ayar?.ad ?? LIG.ad)}'ne davet edildin!</h2>
      <p>Takımına bağlanmak için Google hesabınla giriş yap. Sonraki girişlerde, telefondan ya da bilgisayardan, aynı Google hesabıyla girmen yeterli.</p>
      <button class="btn ana google-dugme" data-is="google-giris">${GOOGLE_LOGO} Google ile giriş yap</button></div>`;
  }
  if (googleMi() && !S.ben) {
    return `<div class="kart"><p style="margin:0"><b>${esc(auth.currentUser.email)}</b> ile giriş yaptın ama bu hesap bir takıma bağlı değil.
      Takımına katılmak için yöneticinin gönderdiği davet linkini aç.</p></div>`;
  }
  return '';
}

const GOOGLE_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

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
  $('#lig-adi').innerHTML = `<span class="uzun-baslik">${esc(S.ayar?.ad ?? LIG.ad)}</span><span class="kisa-baslik">${LIG.kisa} Fantezi</span>`;
  if ($('#lig-gecis')) $('#lig-gecis').innerHTML = ligGecisi();
  $('#menu').innerHTML = menu();
  $('#alt-menu').innerHTML = altMenu();
  // Telefonda menü yana kayar: açık sekme görünür kalsın
  const menuEl = $('#menu');
  const aktif = menuEl.querySelector('.aktif');
  if (aktif && (aktif.offsetLeft + aktif.offsetWidth > menuEl.scrollLeft + menuEl.clientWidth || aktif.offsetLeft < menuEl.scrollLeft)) {
    menuEl.scrollLeft = Math.max(0, aktif.offsetLeft - 16);
  }
  $('#kimlik').innerHTML = kimlik();
  requestAnimationFrame(haftaCipiniOrtala);
  $('#icerik').innerHTML = (S.hazir && !S.ligYok ? girisKarti() : '')
    + (S.hazir && !S.ligYok && !['bostakiler', 'serbest'].includes(rota()[0]) ? zorunluBandi() : '') + gorunum();
  if (odakId) {
    const el = document.getElementById(odakId);
    if (el) {
      el.focus();
      try { if (secim) el.setSelectionRange(...secim); } catch { /* number input */ }
    }
  }
  const benimSiram = siradakiTakim() && siradakiTakim() === benimTakimim() && asama() === 'draft';
  document.title = benimSiram ? '🔔 Sıra sende! · Fantezi' : (S.ayar?.ad ?? LIG.ad);
  sayacGuncelle();
}

function rota() {
  const parcalar = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return parcalar.length ? parcalar : [ligEkrani() ? 'puan' : 'draft'];
}

// Menü öğeleri: [sayfa, ad, ikon, rozet]. Lig ekranı: draft bittikten sonra yönetici açınca. Draft ekranı: kura ve canlı draft.
function menuOgeleri() {
  if (!S.hazir || S.ligYok || S.hataMesaji) return [];
  const a = asama();
  const gelen = Object.values(S.teklifler).filter(t => t.durum === 'bekliyor' && t.alan === benimTakimim()).length
    + (yonetici() ? onayBekleyen().length : 0);
  const yonetim = [yonetici() && ['bildirimler', 'Bildirimler', '🔔', bildirimSayisi()],
    yonetici() && ['yonetici', 'Yönetici', '⚙️'], LIG.mevki && yonetici() && ['mevkiler', 'Mevkiler', '🧭']];
  const zorunlu = benimTakimim() ? zorunluBekleyen(benimTakimim()).length : 0;
  return (ligEkrani() ? [
    ['puan', 'Puan Durumu', '🏆'],
    ['maclar', 'Maçlar', '📅'],
    benimTakimim() && ['kadrom', 'Kadrom', '📋'],
    LIG.takas && ['takas', 'Takas', '🔄', gelen],
    ['takimlar', 'Takımlar', '👥'],
    ['bostakiler', 'Boştakiler', '🧺', zorunlu],
    LIG.hareketler && ['hareketler', 'Hareketler', '📰'],
    LIG.draft && ['draft', 'Draft', '🏀'],
    ['kurallar', 'Kurallar', '📖'],
    ...yonetim,
  ] : [
    LIG.draft && ['draft', 'Draft', '🏀'],
    ['maclar', 'Maçlar', '📅'],
    ['takimlar', 'Takımlar', '👥'],
    benimTakimim() && ['kadro', 'sezon'].includes(a) && ['kadrom', 'Kadrom', '📋'],
    ['kurallar', 'Kurallar', '📖'],
    ...yonetim,
  ]).filter(Boolean);
}

const aktifMi = (id, sayfa) => sayfa === id || (sayfa === 'takim' && id === 'takimlar') || (sayfa === 'serbest' && id === 'bostakiler');
const rozetHtml = n => (n ? ` <span class="rozet uyari">${n}</span>` : '');

function menu() {
  const [sayfa] = rota();
  // Bildirimler bilgisayarda başlıktaki 🔔 ile açılır (menü sığsın diye üst menüde yok)
  return menuOgeleri().filter(([id]) => id !== 'bildirimler').map(([id, ad, ikon, n]) => `<a href="#/${id}" class="${aktifMi(id, sayfa) ? 'aktif' : ''}"><span class="ikon">${ikon}</span><span>${ad}</span>${rozetHtml(n)}</a>`).join('');
}

// Telefonun alt sekme çubuğu: ilk 4 öğe, gerisi "Diğer" sayfasında
function altMenu() {
  const ogeler = menuOgeleri();
  if (!ogeler.length) return '';
  const [sayfa] = rota();
  const kes = ogeler.length > 5 || hesapVarMi();
  const ana = kes ? ogeler.slice(0, 4) : ogeler;
  const diger = kes ? ogeler.slice(4) : [];
  const dugme = ([id, ad, ikon, n], aktif) => `<a href="#/${id}" class="${aktif ? 'aktif' : ''}"><span class="ikon">${ikon}</span><span>${ad.replace('Puan Durumu', 'Puan')}${n ? `<i class="nokta">${n}</i>` : ''}</span></a>`;
  return ana.map(o => dugme(o, aktifMi(o[0], sayfa))).join('')
    + (kes ? dugme(['diger', 'Diğer', '☰', diger.reduce((t, o) => t + (o[3] || 0), 0)], sayfa === 'diger' || diger.some(o => aktifMi(o[0], sayfa))) : '');
}

const hesapVarMi = () => !!(benimTakimim() || yonetici() || googleMi());

function gorunumDiger() {
  const ogeler = menuOgeleri();
  const kes = ogeler.length > 5 || hesapVarMi();
  return `${hesapKarti()}<div class="kart diger-liste">${(kes ? ogeler.slice(4) : []).map(([id, ad, ikon, n]) => `<a href="#/${id}"><span class="ikon">${ikon}</span><span>${ad}${rozetHtml(n)}</span><span class="ok">›</span></a>`).join('')}</div>`;
}

// Yan menünün altı (bilgisayar): fantezi ligleri arası geçiş
function ligGecisi() {
  const l = (yol, ad, aktif) => `<a href="${yol}" class="${aktif ? 'aktif' : ''}">${ad}</a>`;
  return `<span class="lig-gecis-baslik">Fantezi ligleri</span>
    ${l('../tbl/', '🏀 TBL Fantezi', LIG.kod === 'tbl')}${l('../bsl/', '🏆 BSL Fantezi', LIG.kod === 'bsl')}`;
}

const basHarfler = ad => String(ad ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2)
  .map(w => w[0]).join('').toLocaleUpperCase('tr') || '?';
// Telefon başlığında yazı yerine yuvarlak hesap simgesi: dokununca Diğer sayfasındaki hesap kartı açılır
function hesapSimgesi() {
  const ad = benimTakimim() ? takimAdi(benimTakimim()) : yonetici() ? 'Yönetici' : googleMi() ? auth.currentUser.email : '';
  return ad ? `<a href="#/diger" class="hesap-simge" title="Hesabım">${esc(basHarfler(ad))}</a>` : '';
}

function hesapKarti() {
  if (!S.hazir || S.ligYok) return '';
  const tid = benimTakimim();
  if (!tid && !yonetici() && !googleMi()) {
    return `<div class="kart hesap-kart"><span>Takımına girmek için yöneticinin gönderdiği davet linkini aç ya da giriş yap.</span>
      <button class="btn ana google-dugme" data-is="google-giris">${GOOGLE_LOGO} Giriş yap</button></div>`;
  }
  const ad = tid ? takimAdi(tid) : yonetici() ? 'Yönetici' : auth.currentUser.email;
  return `<div class="kart hesap-kart"><span class="hesap-simge buyuk">${esc(basHarfler(ad))}</span>
    <div class="ad"><b>${esc(ad)}</b><small>${esc(auth.currentUser?.email ?? '')}${yonetici() ? ' · Yönetici' : ''}</small></div>
    <a href="#" class="btn kucuk" data-is="cikis">Çıkış</a></div>`;
}

function kimlik() {
  if (!S.hazir || S.ligYok) return '';
  if (yonetici()) {
    const dugme = ['kadro', 'sezon'].includes(asama())
      && LIG.draft ? `<button class="ekran-dugme" data-is="ekran" data-id="${ligEkrani() ? 'draft' : 'lig'}" title="Herkesin ana ekranını değiştirir">${ligEkrani() ? '← Draft ekranı' : 'Lig ekranı →'}</button>` : '';
    const n = bildirimSayisi();
    const zil = `<a href="#/bildirimler" class="zil" title="Bildirimler">🔔${n ? `<i>${n}</i>` : ''}</a>`;
    const ad = benimTakimim() ? `${esc(takimAdi(benimTakimim()))} <span class="rozet yonetici-rozet">Yönetici</span>` : 'Yönetici';
    return `${dugme}${zil}<span class="kimlik-yazi"><b>${ad}</b> · <a href="#" data-is="cikis">çıkış</a></span>${hesapSimgesi()}`;
  }
  if (benimTakimim()) return `<span class="kimlik-yazi"><b>${esc(takimAdi(benimTakimim()))}</b> · <a href="#" data-is="cikis">çıkış</a></span>${hesapSimgesi()}`;
  if (googleMi()) return `<span class="kimlik-yazi">${esc(auth.currentUser.email)} · <a href="#" data-is="cikis">çıkış</a></span>${hesapSimgesi()}`;
  return '<button class="ekran-dugme google-dugme" data-is="google-giris">Giriş yap</button>';
}

function gorunum() {
  if (S.hataMesaji) return `<div class="kart hata-kutu">${S.hataMesaji}</div>`;
  if (!S.hazir) return '<p class="bos">Yükleniyor…</p>';
  if (S.ligYok) return `<div class="dar">${gorunumKurulum()}</div>`;
  const [sayfa, p1, p2] = rota();
  switch (sayfa) {
    case 'draft': return gorunumDraft();
    case 'puan': return gorunumPuan(p1 === 'hafta' ? Number(p2) : null);
    case 'takimlar': return gorunumTakimlar();
    case 'takim': return gorunumTakim(p1);
    case 'mac': return gorunumMac(Number(p1));
    case 'oyuncu': return `<div class="dar">${gorunumOyuncu(decodeURIComponent(p1 ?? ''))}</div>`;
    case 'kadrom': return asama() === 'sezon' ? gorunumKadrom() : `<div class="dar">${gorunumKadrom()}</div>`;
    case 'takas': return LIG.takas ? gorunumTakas() : '<p class="bos">Bu ligde takas yok.</p>';
    case 'serbest':
    case 'bostakiler': return gorunumSerbest();
    case 'hareketler': return LIG.hareketler ? `<div class="dar">${gorunumHareketler()}</div>` : '<p class="bos">Bu ligde Hareketler sayfası yok.</p>';
    case 'kurallar': return `<div class="dar">${gorunumKurallar()}</div>`;
    case 'diger': return gorunumDiger();
    case 'maclar': return `<div class="dar">${gorunumMaclar(Number(p1))}</div>`;
    case 'yonetici': return yonetici() ? `<div class="dar">${gorunumYonetici()}</div>` : '<p class="bos">Bu sayfa yönetici içindir.</p>';
    case 'mevkiler': return yonetici() ? gorunumMevkiler() : '<p class="bos">Bu sayfa yönetici içindir.</p>';
    case 'bildirimler': return yonetici() ? `<div class="dar">${gorunumBildirimler()}</div>` : '<p class="bos">Bu sayfa yönetici içindir.</p>';
    default: return gorunumDraft();
  }
}

// ---------- İlk kurulum ----------
// TBL: eski sitedeki kadro değişiklikleri (hak kullanıp kullanmadığıyla) ve takımların kullandığı haklar (düzenlenebilir)
function tblAktarimKartlari(kaynak) {
  const transferTablosu = kaynak.transferler.length ? `<div class="tablo-kap"><table>
      <thead><tr><th>Hafta</th><th>Takım</th><th>Çıkan → Giren</th><th>Hak</th></tr></thead>
      <tbody>${kaynak.transferler.map(x => `<tr><td>${x.hafta - kaynak.baslangic + 1}.</td><td>${esc(x.takim)}</td>
        <td>${esc(x.cikan)} → <b>${esc(x.giren)}</b><div class="kucuk soluk">${esc(x.neden)}</div></td>
        <td>${x.hak ? '<span class="rozet uyari">1 hak</span>' : '<span class="rozet as">hak yok</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="soluk">Henüz kadro değişikliği yapılmamış.</p>';
  const hakTablosu = `<div class="tablo-kap"><table><thead><tr><th>Takım</th><th class="sayi">Kullanılan ${hakAdi()}</th></tr></thead><tbody>
    ${kaynak.takimlar.map((t, i) => `<tr><td>${esc(t.ad)}${t.menajer ? ` <span class="soluk kucuk">${esc(t.menajer)}</span>` : ''}</td>
      <td class="sayi"><input type="number" id="fa-${i}" min="0" max="2" value="${t.fa}" style="width:64px"> / 2</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="kart"><h2>Şimdiye kadarki transferler</h2>
      <p class="kucuk soluk">Eski TBL Fantezi Ligi'nin haftalık kadrolarından. Lisansı düşen oyuncunun yerine alınan hak kullanmaz.</p>${transferTablosu}</div>
    <div class="kart"><h2>Kullanılan haklar</h2><p class="kucuk soluk">Yukarıdaki listeye göre hesaplandı; aktarmadan önce değiştirebilirsin (sonra da Yönetici → takım sayfasından düzenlenebilir).</p>${hakTablosu}</div>`;
}

// TBL kurulumunda ve yeniden aktarımda yazılan lig ayarları
const tblAktarimAyari = () => ({
  degisiklikHakki: LIG.degisiklikHakki ?? 99, ortakHak: !!LIG.ortakHak, beklemeSaat: LIG.beklemeSaat ?? 36, asEnFazlaYabanci: 2, mevkilerHazir: false,
});
// Kullanılan hak kutularındaki değerleri aktarılacak takımlara yazar
function hakKutulariniOku(kaynak) {
  kaynak.takimlar.forEach((t, i) => {
    const v = Number(deger(`fa-${i}`));
    if (Number.isInteger(v) && v >= 0 && v <= 2) t.fa = v;
  });
}

function gorunumKurulum() {
  if (S.kurulumSonucu) {
    return `<div class="kart">
      <h2>Lig kuruldu 🎉</h2>
      <p><b>${esc(auth.currentUser.email)}</b> Google hesabı artık <b>yönetici</b>. Başka bir cihazdan da aynı Google hesabıyla giriş yapman yeterli.</p>
      <p>Menajerlerin davet linkleri <b>Yönetici</b> sayfasında.</p>
      <p><a class="btn ana" href="#/yonetici" data-is="kurulum-bitti">Yönetici sayfasına git</a></p>
    </div>`;
  }
  if (!googleMi()) {
    return `<div class="kart"><h2>Ligi kur</h2>
      <p>Bu lig henüz kurulmamış. Ligi kuran Google hesabı <b>yönetici</b> olur; önce Google hesabınla giriş yap.</p>
      <button class="btn ana google-dugme" data-is="google-giris">${GOOGLE_LOGO} Google ile giriş yap</button></div>`;
  }
  if (LIG.iceAktar === 'tbl') {
    if (!S.tblKaynak) {
      if (!S.tblKaynakYukleniyor) {
        S.tblKaynakYukleniyor = true;
        tblKaynakKadrolar().then(k => { S.tblKaynak = k; }).catch(e => { S.tblKaynak = { hata: e.message }; }).finally(ciz);
      }
      return '<p class="bos">Eski TBL Fantezi Ligi kadroları okunuyor…</p>';
    }
    if (S.tblKaynak.hata) return `<div class="kart hata-kutu">Eski TBL Fantezi Ligi okunamadı: ${esc(S.tblKaynak.hata)}</div>`;
    return `<div class="kart sira-sende">
      <h2>Ligi kur</h2>
      <p>Puan durumu, haftalık sonuçlar, takımlar ve kadrolar lig kurulunca açılır. Ligi kuran Google hesabı
      (<b>${esc(auth.currentUser.email)}</b>) <b>yönetici</b> olur. Kurmadan önce aşağıdaki <b>kullanılan haklar</b>ı kontrol et.</p>
      <p>Eski TBL Fantezi Ligi'nin bütün takımları, menajer adları ve <b>her haftanın kadrosu</b> aktarılır; geçmiş haftaların puanları
      değişmez. Sezon hemen başlar: menajerler davet linkleriyle girip kendi kadro değişikliklerini yapar
      (sezonda ${2} transfer hakkı: serbest oyuncu ya da As–Yedek değişikliği; ${beklemeSaati()} saat talep ve kura; As'ta en fazla 2 yabancı).</p>
      <div class="form-izgara"><label for="k-ad">Lig adı</label><input type="text" id="k-ad" value="${esc(LIG.ad)}"></div>
      <p style="margin-top:16px"><button class="btn ana" data-is="tbl-kur">Ligi kur ve kadroları aktar</button></p></div>
      ${tblAktarimKartlari(S.tblKaynak)}`;
  }
  const varsayilanHafta = S.index ? C.etkinHafta(S.index, 1) : 1;
  return `<div class="kart">
    <h2>Ligi kur</h2>
    <p>Bu lig henüz kurulmamış. Ligi kuran Google hesabı (<b>${esc(auth.currentUser.email)}</b>) <b>yönetici</b> olur. Takım adları ve menajerler sonradan Yönetici sayfasından girilir; kura çekilene kadar takım eklenip çıkarılabilir.</p>
    <div class="form-izgara">
      <label for="k-ad">Lig adı</label><input type="text" id="k-ad" value="${esc(LIG.ad)}">
      <label for="k-hafta">Puanlamanın başlayacağı ${LIG.kisa} haftası</label><input type="number" id="k-hafta" min="1" max="40" value="${varsayilanHafta}">
      <label for="k-sure">Seçim süresi (saniye)</label><input type="number" id="k-sure" min="5" max="600" value="90">
      <label for="k-takim">Takım sayısı</label><input type="number" id="k-takim" min="2" max="99" value="17">
    </div>
    <p style="margin-top:16px"><button class="btn ana" data-is="ligi-kur">Ligi kur</button></p>
  </div>`;
}

function girisLinki(kod) {
  return `${location.origin}${location.pathname}?davet=${encodeURIComponent(kod)}`;
}

// ---------- Draft ----------
function gorunumDraft() {
  const a = asama();
  const draftta = DRAFT_ASAMALARI.includes(a);
  const sekmeler = [
    draftta && ['oyuncular', 'Oyuncular'],
    draftta && benimTakimim() && ['istek', `İstek listem${S.istek.length ? ` (${S.istek.length})` : ''}`],
    ['tahta', 'Draft tahtası'],
    ['kadrolar', 'Kadrolar'],
    ['sira', 'Kura sırası'],
  ].filter(Boolean);
  if (!sekmeler.some(([id]) => id === S.ui.draftSekme)) S.ui.draftSekme = sekmeler[0][0];
  if (!draftta) secimleriDinle();
  let icerik = '';
  switch (S.ui.draftSekme) {
    case 'oyuncular': icerik = draftOyunculari(); break;
    case 'istek': icerik = istekListesiKarti(); break;
    case 'tahta': icerik = draftTahtasi(); break;
    case 'kadrolar': icerik = draftKadrolari(); break;
    case 'sira': icerik = kuraKarti(false); break;
  }
  const sekmeHtml = `<div class="sekmeler">${sekmeler.map(([id, ad]) => `<button data-is="draft-sekme" data-id="${id}" class="${S.ui.draftSekme === id ? 'aktif' : ''}">${ad}</button>`).join('')}</div>`;
  if (['draft', 'duraklatildi'].includes(a)) {
    return `<div class="draft-duzen">
      <aside class="draft-yan">${durumKarti()}${yoneticiAraclari()}${sonSecimler()}${benimDraftim()}</aside>
      <section class="draft-ana">${sekmeHtml}${icerik}</section>
    </div>`;
  }
  return `${durumKarti()}${benimDraftim()}${sekmeHtml}${icerik}`;
}

// Draft sırasında yöneticilerin araç kutusu
function yoneticiAraclari() {
  if (!yonetici()) return '';
  const d = S.durum;
  const durdu = d.asama === 'duraklatildi';
  return `<div class="kart yonetici-araclari"><h3>Yönetici araçları</h3>
    <div class="satir">
      ${durdu ? '<button class="btn ana kucuk" data-is="devam">▶ Devam ettir</button>' : '<button class="btn kucuk" data-is="duraklat">⏸ Duraklat</button>'}
      <button class="btn kucuk" data-is="saat-ekle">+30 sn</button>
      <button class="btn kucuk" data-is="saat-bastan">⟲ Saati baştan başlat</button>
      ${d.secimNo > 0 ? '<button class="btn kucuk tehlike" data-is="geri-al">↶ Son seçimi geri al</button>' : ''}
    </div>
    <p class="kucuk soluk" style="margin:8px 0 0">Sıradaki takım adına seçmek için oyuncu listesinde <b>Seç</b>'e bas. Yapılmış bir seçimi değiştirmek için <b>Draft tahtası</b>'nda o seçime dokun.</p>
  </div>`;
}

const duzenlenebilir = () => yonetici() && ['draft', 'duraklatildi', 'kadro'].includes(asama());
const kuralTablosu = () => (kadroTablosu ??= C.kadroTablosu(kural()));

// Yapılmış seçimin yerine konacak oyuncu kadro kuralını bozuyor mu
function duzeltSorunu(s, o) {
  const k = S.kadrolar[s.takim];
  const tip = { ...k.tip };
  tip[C.tipi(s.mevki, s.turk)] -= 1;
  tip[C.tipi(o.mevki, o.turk)] += 1;
  return kuralTablosu()[C.tipAnahtari(tip)] ? null : 'Bu takımın kadro kuralını bozar (mevki ya da Türk oyuncu)';
}

function duzeltPaneli() {
  const n = S.ui.duzeltNo;
  const s = S.secimler[n];
  if (n == null || !s || !duzenlenebilir()) return '';
  const sahip = sahipler();
  const ara = aramaNorm(S.ui.duzeltAra);
  const adaylar = S.havuz.filter(o => !sahip.has(o.id) && (!ara || aramaNorm(o.ad).includes(ara))).slice(0, 12);
  return `<div class="kart sira-sende"><div class="baslik-satir"><h3>${n + 1}. seçimi değiştir</h3><button class="btn kucuk" data-is="duzelt-vazgec">Vazgeç</button></div>
    <p style="margin-top:0">${esc(takimAdi(s.takim))}: <b>${esc(s.ad)}</b> yerine kimi koymak istiyorsun? Sıra ve saat değişmez; çıkan oyuncu boşa düşer.</p>
    <input type="search" id="duzelt-ara" data-ui="duzeltAra" placeholder="Oyuncu ara" value="${esc(S.ui.duzeltAra)}" style="width:100%">
    <div class="tablo-kap"><table>${adaylar.map(o => {
      const sorun = duzeltSorunu(s, o);
      return `<tr><td>${esc(o.ad)} ${mevkiRozeti(o.mevki)}${trRozeti(o)}</td><td class="kucuk">${bslTakimHucre(o)}</td><td class="sayi">${sayi(o.vpOrt)}</td>
        <td class="sayi"><button class="btn kucuk ${sorun ? '' : 'ana'}" data-is="duzelt-onay" data-id="${o.id}" ${sorun ? `disabled title="${sorun}"` : ''}>Bununla değiştir</button></td></tr>`;
    }).join('') || '<tr><td class="bos">Oyuncu bulunamadı</td></tr>'}</table></div></div>`;
}

// Bilgisayarın yan panelinde son seçimler (ana ekranda draftı izleyenler için)
function sonSecimler() {
  const n = S.durum.secimNo;
  const liste = [];
  for (let i = n - 1; i >= 0 && liste.length < 6; i--) if (S.secimler[i]) liste.push(S.secimler[i]);
  if (!liste.length) return '';
  return `<div class="kart son-secimler-kart"><h3>Son seçimler</h3><ol class="son-secimler">${liste.map(s => `<li>
    <span class="no">${s.no + 1}</span>
    <span><b>${esc(s.ad)}</b>${s.mevki ? ` ${mevkiRozeti(s.mevki)}` : ''}${trRozeti(s)}${s.otomatik ? ' <span class="rozet oto">oto</span>' : ''}
      <br><span class="soluk kucuk">${esc(takimAdi(s.takim))} · ${esc(oyuncu(s.oyuncu).takimKod || s.bslTakim)}</span></span></li>`).join('')}</ol></div>`;
}

function durumKarti() {
  const d = S.durum;
  const toplam = d.toplamSecim;
  switch (d.asama) {
    case 'kurulum':
      return `<div class="kart"><h2>Draft henüz başlamadı</h2>
        <p>Önce yönetici kurayı çekecek; çıkan sıra herkese burada canlı gösterilir. Sonra draft başlar.</p>
        <p class="soluk">${S.ayar.takimSayisi} takım · Yılan draft: 1. tur 1→${S.ayar.takimSayisi}, 2. tur ${S.ayar.takimSayisi}→1, … · Her takım ${kadroBoyu()} oyuncu (As ${kural().asOn} Ön + ${kural().asArka} Arka, ${kural().yedek} Yedek) ·
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
        <div class="soluk saat-ust">Tur ${tur} · ${turSecimi}. seçim · Genel ${n + 1}/${toplam}</div>
        <div class="siradaki">${benimSiram ? 'Sıra sende!' : esc(takimAdi(tid))}</div>
        ${S.takimlar[tid]?.menajer && !benimSiram ? `<div class="soluk saat-menajer">${esc(S.takimlar[tid].menajer)}</div>` : ''}
        <div id="sayac" class="sayac">--:--</div>
        <div class="cubuk"><div id="cubuk" style="width:100%"></div></div>
        ${d.asama === 'duraklatildi' ? '<div class="uyari-kutu">Draft yönetici tarafından duraklatıldı.</div>' : ''}
        ${kisit ? `<div class="uyari-kutu">Kadro kuralı gereği ${benimSiram ? `bu seçimde ${kisit} seçebilirsin` : `bu takım ${kisit} seçebilir`}.</div>` : ''}
        ${sonrakiler.length ? `<div class="sonraki saat-sonraki"><span class="soluk" style="border:0;background:none">Sıradakiler:</span>${sonrakiler.map(t => `<span class="${t === benimTakimim() ? 'rozet uyari' : ''}">${esc(takimAdi(t))}</span>`).join('')}</div>` : ''}
        <p class="kucuk soluk saat-aciklama" style="margin-bottom:0">Süre dolarsa takımın istek listesindeki ilk uygun oyuncu, listede yoksa müsait en iyi 15 oyuncudan (sezon VP ortalamasına göre) rastgele biri seçilir.</p>
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
    ${canli && !bitti ? '<p class="soluk">Sıra sondan başa doğru açılıyor.</p>' : ''}
    <ol class="kura">${d.sira.map((tid, i) => {
      const acik = i >= T - acilan;
      const yeni = canli && i === T - acilan;
      return acik
        ? `<li class="${yeni ? 'yeni' : ''}"><span class="no">${i + 1}</span><span><b>${esc(takimAdi(tid))}</b>${S.takimlar[tid]?.menajer ? `<br><span class="soluk kucuk">${esc(S.takimlar[tid].menajer)}</span>` : ''}</span></li>`
        : `<li class="gizli"><span class="no">${i + 1}</span><span>?</span></li>`;
    }).join('')}</ol>
    ${canli && bitti ? '<p style="margin-bottom:0">Draft, yönetici başlatınca başlayacak.</p>' : ''}
    <p class="kucuk soluk" style="margin-bottom:0">Yılan draft: tek turlarda 1→${T}, çift turlarda ${T}→1.</p>
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
    <div class="baslik-satir"><h3>${esc(takimAdi(tid))} <span class="soluk kucuk">${oyuncular.length}/${kadroBoyu()}${mevkilerHazir() ? ` · Ön ${(k?.tip?.oT ?? 0) + (k?.tip?.oY ?? 0)} · Arka ${(k?.tip?.aT ?? 0) + (k?.tip?.aY ?? 0)}` : ''} · Türk ${(k?.tip?.oT ?? 0) + (k?.tip?.aT ?? 0)}</span></h3>
    ${siradaki != null && S.durum.asama !== 'kurulum' ? `<span class="soluk kucuk">Sıradaki seçimin: ${siradaki + 1}. seçim${siradaki > S.durum.secimNo ? ` (${siradaki - S.durum.secimNo} seçim sonra)` : ''}</span>` : ''}</div>
    <p class="kucuk soluk" style="margin:0 0 6px">Kadro kuralı: As ${kural().asOn} Ön + ${kural().asArka} Arka, ${kural().yedek} Yedek (mevki serbest); As'ta ve Yedekte en az 1'er Türk.</p>
    ${secimKisiti(tid) && oyuncular.length < kadroBoyu() && siradakiTakim() !== tid ? `<div class="uyari-kutu kucuk">Sıradaki seçiminde ${secimKisiti(tid)} seçebilirsin.</div>` : ''}
    ${oyuncular.length ? `<div>${[...k.as.map(p => [p, 'as']), ...k.yedek.map(p => [p, 'yedek'])].map(([p, rol]) => `<span class="secim-chip">${oyuncuAdi(p)} <span class="rozet ${rol}">${rol === 'as' ? 'As' : 'Yedek'}</span></span>`).join('')}</div>`
      : '<p class="soluk" style="margin:0">Henüz oyuncu seçmedin.</p>'}
    ${oyuncular.length < kadroBoyu() ? `<p class="kucuk soluk" style="margin:6px 0 0">${S.istek.length
      ? `İstek listende ${S.istek.length} oyuncu${istekSiradaki(tid) ? ` · süren dolarsa seçilecek: <b>${esc(istekSiradaki(tid).ad)}</b>` : ' · listede şu an uygun oyuncu yok'}`
      : 'Süren dolarsa diye'} · <a href="#" data-is="draft-sekme" data-id="istek">${S.istek.length ? 'Listeyi düzenle' : 'istek listeni hazırla'}</a></p>` : ''}
  </div>`;
}

// İstek listesinde, süre dolarsa seçilecek oyuncu: ilk müsait ve kadro kuralına uyan
function istekSiradaki(tid, liste = S.istek) {
  const sahip = sahipler();
  const izin = izinliTipler(tid);
  return liste.map(id => S.havuzMap.get(id)).find(o => o && !sahip.has(o.id) && izin.includes(C.tipi(o.mevki, o.turk)));
}

function istekListesiKarti() {
  const tid = benimTakimim();
  const sahip = sahipler();
  const izin = izinliTipler(tid);
  const siradaki = istekSiradaki(tid);
  const liste = S.istek.map(id => S.havuzMap.get(id) ?? { ...oyuncu(id), mevki: mevki(id) });
  return `<div class="kart"><h3>İstek listem</h3>
    <p class="kucuk soluk">Seçim süren dolarsa bu listedeki ilk müsait ve kadro kuralına uyan oyuncu senin adına otomatik seçilir; listede uygun oyuncu kalmazsa en iyi 15 oyuncudan rastgele biri seçilir. Listeni sadece sen (ve varsa ortak menajerin) görürsün. Oyuncu eklemek için <b>Oyuncular</b> sekmesinde ☆'a bas.</p>
    ${liste.length ? `<ol class="istek-liste">${liste.map((o, i) => {
      const kimde = sahip.get(o.id);
      const engel = !kimde && !izin.includes(C.tipi(o.mevki, o.turk));
      return `<li class="${kimde ? 'alindi' : ''}"><span><span class="no">${i + 1}</span> ${esc(o.ad)} ${mevkiRozeti(o.mevki)}${trRozeti(o)} <span class="bsl">${esc(o.takimKod || o.takim || '')}</span>
          ${kimde ? `<span class="soluk kucuk">· ${esc(takimAdi(kimde))} aldı</span>` : engel ? '<span class="soluk kucuk">· şu an kadro kuralına uymuyor</span>' : siradaki?.id === o.id ? '<span class="rozet as">sıradaki</span>' : ''}</span>
        <span class="satir" style="flex-wrap:nowrap">
          <button class="btn kucuk" data-is="istek-tasi" data-id="${o.id}" data-yon="-1" ${i === 0 ? 'disabled' : ''} title="Yukarı">↑</button>
          <button class="btn kucuk" data-is="istek-tasi" data-id="${o.id}" data-yon="1" ${i === liste.length - 1 ? 'disabled' : ''} title="Aşağı">↓</button>
          <button class="btn kucuk" data-is="istek" data-id="${o.id}" title="Listeden çıkar">✕</button></span></li>`;
    }).join('')}</ol>` : '<p class="soluk" style="margin:0">Listen boş.</p>'}
    ${liste.some(o => sahip.has(o.id)) ? '<button class="btn kucuk" data-is="istek-temizle" style="margin-top:8px">Alınanları listeden çıkar</button>' : ''}
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
  const ara = aramaNorm(S.ui.ara);
  const bslTakimlar = [...new Set(S.havuz.map(o => o.takim))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = S.havuz.filter(o => (S.ui.alinanlar || !sahip.has(o.id))
    && (!S.ui.sadeceTurk || o.turk)
    && (!S.ui.mevkiFiltre || o.mevki === S.ui.mevkiFiltre)
    && (!S.ui.bslTakim || o.takim === S.ui.bslTakim)
    && (!ara || aramaNorm(o.ad).includes(ara)));
  const musait = S.havuz.filter(o => !sahip.has(o.id)).length;
  return `<div class="kart">
    <div class="satir" style="margin-bottom:10px">
      <input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ara" value="${esc(S.ui.ara)}" class="ara">
      <select id="f-takim" data-ui="bslTakim"><option value="">Bütün ${LIG.kisa} takımları</option>${bslTakimlar.map(t => `<option ${t === S.ui.bslTakim ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      ${mevkilerHazir() ? `<select id="f-mevki" data-ui="mevkiFiltre"><option value="">Ön + Arka</option><option value="on" ${S.ui.mevkiFiltre === 'on' ? 'selected' : ''}>Sadece Ön</option><option value="arka" ${S.ui.mevkiFiltre === 'arka' ? 'selected' : ''}>Sadece Arka</option></select>` : ''}
      <label class="secenek"><input type="checkbox" id="f-turk" data-ui="sadeceTurk" ${S.ui.sadeceTurk ? 'checked' : ''}> Sadece Türkler</label>
      <label class="secenek"><input type="checkbox" id="f-alinan" data-ui="alinanlar" ${S.ui.alinanlar ? 'checked' : ''}> Seçilenleri de göster</label>
    </div>
    <p class="kucuk soluk">${musait} müsait oyuncu · Sıralama: bu sezonun maç başı VP ortalaması</p>
    <div class="tablo-kap"><table>
      <thead><tr><th class="sayi">#</th><th>Oyuncu</th><th>${LIG.kisa} takımı</th><th class="sayi">Maç</th><th class="sayi">VP ort.</th><th class="sayi dar-gizle">Sayı</th><th></th></tr></thead>
      <tbody>${liste.slice(0, 300).map(o => {
        const kimde = sahip.get(o.id);
        const engel = !izin.includes(C.tipi(o.mevki, o.turk));
        return `<tr class="${kimde ? 'alindi' : ''}">
          <td class="sayi soluk">${o.sira}</td>
          <td>${benimTakimim() && !kimde ? `<button class="yildiz ${S.istek.includes(o.id) ? 'acik' : ''}" data-is="istek" data-id="${o.id}" title="${S.istek.includes(o.id) ? 'İstek listemden çıkar' : 'İstek listeme ekle'}">${S.istek.includes(o.id) ? '★' : '☆'}</button>` : ''}<a href="#/oyuncu/${o.id}" class="oyuncu-link">${esc(o.ad)}</a> ${mevkiRozeti(o.mevki)}${trRozeti(o)}</td>
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
      const sinif = [simdiki && 'simdi', !s && 'bos-hucre', d.sira[c] === benimTakimim() && 'ben', s && duzenlenebilir() && 'tikla',
        S.ui.duzeltNo === n && 'duzeltilen'].filter(Boolean).join(' ');
      hucreler += `<td class="${sinif}" ${s && duzenlenebilir() ? `data-is="duzelt" data-id="${n}" title="Bu seçimi değiştir"` : ''}><span class="soluk">${n + 1}.</span> ${s
        ? `${esc(s.ad)}${s.mevki ? ` ${mevkiRozeti(s.mevki)}` : ''}${trRozeti(s)}${s.otomatik ? ' <span class="rozet oto" title="Süre doldu, otomatik seçildi">oto</span>' : ''}${s.duzeltildi ? ' <span class="rozet" title="Yönetici değiştirdi">düzeltildi</span>' : ''}<div class="bsl">${esc(oyuncu(s.oyuncu).takimKod || s.bslTakim)}</div>`
        : simdiki ? '<b>seçiyor…</b>' : ''}</td>`;
    }
    satirlar += `<tr><th>${r + 1}. tur ${r % 2 === 0 ? '→' : '←'}</th>${hucreler}</tr>`;
  }
  return `${duzeltPaneli()}<div class="kart"><div class="tablo-kap"><table class="tahta">
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
  const satir = (p, rol) => `<li><span>${oyuncuAdi(p, { link: true })}</span><span><span class="rozet ${rol}">${rol === 'as' ? 'As' : 'Yedek'}</span> <span class="soluk kucuk">${sayi(oyuncu(p).vpOrt)}</span></span></li>`;
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

// Genel sıralamada geçen haftaya göre değişim: takım id -> kaç sıra yükseldi (eksi: düştü)
function siraDegisimleri() {
  const haftalar = puanHaftalari();
  if (haftalar.length < 2) return new Map();
  const once = new Map(C.genelKlasman(haftaTakimlari, haftalar.slice(0, -1)).map(s => [s.id, s.sira]));
  return new Map(genelTablo().map(s => [s.id, (once.get(s.id) ?? s.sira) - s.sira]));
}
const degisimHtml = d => (d > 0 ? `<span class="degisim yukari" title="Geçen haftaya göre ${d} sıra yukarı">▲${d}</span>`
  : d < 0 ? `<span class="degisim asagi" title="Geçen haftaya göre ${-d} sıra aşağı">▼${-d}</span>` : '');
// Haftalık lig puanları küçük çubuklarla (tek seri, üzerine gelince hafta ayrıntısı)
function haftaCubuklari(s) {
  const enCok = Math.max(...C.PUAN_TABLOSU);
  return `<span class="cubuklar" role="img" aria-label="Haftalık puanlar: ${s.haftalar.map(h => h.puan).join(', ')}">${s.haftalar.map(h =>
    `<i style="height:${Math.max(8, (h.puan / enCok) * 100)}%" title="${hf(h.hafta)}. hafta: ${h.sira}. sıra · ${sayi(h.vp)} VP · +${h.puan} puan"></i>`).join('')}</span>`;
}

// Menajerin özeti: sırası, puanı, bu haftası, kalan hakkı ve varsa zorunlu değişiklik uyarısı
function benimOzetKarti() {
  const tid = benimTakimim();
  const k = tid && S.kadrolar[tid];
  const haftalar = puanHaftalari();
  if (!k || asama() !== 'sezon' || !S.haftalarYuklendi || !haftalar.length) return '';
  const g = genelTablo().find(s => s.id === tid);
  if (!g) return '';
  const son = haftalar.at(-1);
  const hs = C.haftaSiralamasi(haftaTakimlari(son.hafta), son).find(s => s.id === tid);
  const surdu = !C.haftaDurumu(son).tamamlandi;
  const zorunlu = zorunluBekleyen(tid);
  const kutu = (deger, ad, ek = '') => `<div class="ozet-kutu"><b>${deger}</b><span>${ad}</span>${ek}</div>`;
  return `<div class="kart benim-ozet">
    <div class="baslik-satir"><h2>${esc(takimAdi(tid))}</h2><a href="#/kadrom">Kadrom ›</a></div>
    <div class="ozet-kutular">
      ${kutu(`${g.sira}.`, 'Genel sıra', degisimHtml(siraDegisimleri().get(tid) ?? 0))}
      ${kutu(g.puan, 'Puan', `<small>${sayi(g.vp)} VP</small>`)}
      ${kutu(sayi(hs?.toplam ?? 0), `${hf(son.hafta)}. hafta VP`, hs ? `<small>${hs.sira}. sırada${surdu ? ' · sürüyor' : ''}</small>` : '')}
      ${kutu(`${S.ayar.faHakki - k.fa}/${S.ayar.faHakki}`, ortakHak() ? 'Transfer hakkı' : 'Serbest oyuncu hakkı')}
    </div>
    ${zorunlu.length ? `<div class="hata-kutu kucuk" style="margin:12px 0 0">⚠️ ${zorunlu.map(p => esc(oyuncu(p).ad)).join(', ')} artık lisanslı görünmüyor. <a href="#/bostakiler">Yerine oyuncu al ›</a></div>` : ''}
  </div>`;
}

function gorunumPuan(haftaNo) {
  if (asama() !== 'sezon') return `<div class="kart"><p class="bos">Puan durumu, yönetici sezonu başlatınca açılır (puanlama ${LIG.kisa} ${S.ayar.baslangicHaftasi}. haftasından başlar).</p></div>`;
  if (!S.haftalarYuklendi) return '<p class="bos">Haftalık veriler yükleniyor…</p>';
  const haftalar = puanHaftalari();
  if (!haftalar.length) {
    return `<div class="kart"><p class="bos">${hf(S.ayar.baslangicHaftasi)}. hafta maçları başlayınca puanlar burada görünür.</p></div>`;
  }
  S.ui.puanSekme = haftaNo ? 'hafta' : S.ui.puanSekme;
  const secili = haftaNo && S.haftalar[haftaNo] ? haftaNo : haftalar.at(-1).hafta;
  if (genis()) return `${benimOzetKarti()}<div class="iki-sutun puan-duzen">${genelKart(haftalar)}${haftaKart(haftalar, secili)}</div>`;
  const sekmeler = `<div class="sekmeler">
    <button data-is="puan-sekme" data-id="genel" class="${S.ui.puanSekme === 'genel' ? 'aktif' : ''}">Genel klasman</button>
    <button data-is="puan-sekme" data-id="hafta" class="${S.ui.puanSekme === 'hafta' ? 'aktif' : ''}">Haftalık</button></div>`;
  return benimOzetKarti() + sekmeler + (S.ui.puanSekme === 'genel' ? genelKart(haftalar) : haftaKart(haftalar, secili));
}

function genelKart(haftalar) {
  const tablo = genelTablo();
  const degisim = siraDegisimleri();
  const son = haftalar.at(-1);
  const devam = !C.haftaDurumu(son).tamamlandi;
  return `<div class="kart">
    <div class="baslik-satir"><h2>Genel klasman</h2>${paylasDugmeleri('genel')}</div>
    <p class="soluk kucuk">${hf(haftalar[0].hafta)}.–${hf(son.hafta)}. haftalar${devam ? ` · ${hf(son.hafta)}. hafta devam ediyor (puanlar kesin değil)` : ''} · Güncelleme: ${S.index?.guncelleme ? tarih(S.index.guncelleme) : '-'}</p>
    <div class="tablo-kap"><table>
      <thead><tr><th class="sayi">#</th><th>Takım</th><th class="sayi">Puan</th><th class="sayi">Toplam VP</th><th class="dar-gizle">Haftalar</th><th class="sayi dar-gizle">Son hafta</th></tr></thead>
      <tbody>${tablo.map(s => {
        const sh = s.haftalar.at(-1);
        return `<tr class="tikla ${s.id === benimTakimim() ? 'ben' : ''}" data-is="git" data-yol="#/takim/${s.id}">
          <td class="sayi"><span class="sira-hucre"><span class="madalya m${s.sira}">${s.sira}</span>${degisimHtml(degisim.get(s.id) ?? 0)}</span></td><td><b>${esc(s.ad)}</b> <span class="soluk kucuk">${esc(s.menajer ?? '')}</span></td>
          <td class="sayi"><b>${s.puan}</b></td><td class="sayi">${sayi(s.vp)}</td><td class="dar-gizle">${haftaCubuklari(s)}</td>
          <td class="sayi soluk dar-gizle" style="white-space:nowrap">${sh ? `${sh.sira}. · ${sayi(sh.vp)} VP` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="kucuk soluk" style="margin-bottom:0">Haftalık sıraya göre ${C.PUAN_TABLOSU.join(', ')} puan. Eşit puanda toplam VP yüksek olan üstte.</p>
  </div>`;
}

// ---------- Puan durumu görseli (WhatsApp / Instagram paylaşımı) ----------
const paylasDugmeleri = (tur, n = '') => `<span class="satir" style="flex-wrap:nowrap">
    <button class="btn kucuk" data-is="paylas" data-tur="${tur}" data-id="${n}">📤 Paylaş</button>
    <button class="btn kucuk" data-is="paylas" data-tur="${tur}" data-id="${n}" data-islem="indir" title="Görseli indir">⬇</button></span>`;

const GORSEL = {
  genislik: 1080, kenar: 40, baslikYuk: 210, sutunYuk: 64, satirYuk: 84, altYuk: 96,
  zemin: '#eef4f5', kart: '#ffffff', yazi: '#0f1f22', soluk: '#5f7377', cizgi: '#e3ecee', vurgu: '#097a88',
  madalya: ['#ca8a04', '#8a8f98', '#b0662f'], yaziTipi: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

function yuvarlakDikdortgen(ctx, sol, ust, gen, yuk, r) {
  ctx.beginPath();
  ctx.moveTo(sol + r, ust);
  ctx.arcTo(sol + gen, ust, sol + gen, ust + yuk, r);
  ctx.arcTo(sol + gen, ust + yuk, sol, ust + yuk, r);
  ctx.arcTo(sol, ust + yuk, sol, ust, r);
  ctx.arcTo(sol, ust, sol + gen, ust, r);
  ctx.closePath();
}

// Uzun takım adı kutuya sığmıyorsa küçültülür
function sigdir(ctx, metin, enBuyuk, genislik, font) {
  let boyut = enBuyuk;
  do ctx.font = font(boyut); while (ctx.measureText(metin).width > genislik && --boyut > 18);
}

// satirlar: [{ sira, ad, not, degerler: [...] }], sutunlar: ['VP', 'Puan']
async function siralamaGorseli({ baslik: ustYazi, altBaslik, sutunlar, satirlar }) {
  const g = GORSEL;
  const yukseklik = g.baslikYuk + g.sutunYuk + satirlar.length * g.satirYuk + g.altYuk + g.kenar;
  const tuval = document.createElement('canvas');
  tuval.width = g.genislik;
  tuval.height = yukseklik;
  const ctx = tuval.getContext('2d');
  const font = (agirlik, boyut) => `${agirlik} ${boyut}px ${g.yaziTipi}`;
  ctx.fillStyle = g.zemin;
  ctx.fillRect(0, 0, g.genislik, yukseklik);
  const degrade = ctx.createLinearGradient(0, 0, g.genislik, g.baslikYuk);
  degrade.addColorStop(0, '#0a8a99');
  degrade.addColorStop(1, '#06505b');
  ctx.fillStyle = degrade;
  ctx.fillRect(0, 0, g.genislik, g.baslikYuk);
  try {
    const logo = new Image();
    logo.src = 'icon-192.png';
    // Logo takılırsa paylaşım beklemede kalmasın
    await Promise.race([logo.decode(), new Promise((_, hata) => setTimeout(() => hata(new Error('logo')), 3000))]);
    ctx.drawImage(logo, g.kenar, 45, 120, 120);
  } catch { /* logo yüklenemezse görsel yine oluşur */ }
  ctx.fillStyle = '#ffffff';
  sigdir(ctx, ustYazi, 46, g.genislik - g.kenar * 2 - 150, b => font(800, b));
  ctx.fillText(ustYazi, g.kenar + 150, 100);
  ctx.fillStyle = '#d6f4f6';
  ctx.font = font(500, 32);
  ctx.fillText(altBaslik, g.kenar + 150, 148);

  const kartUst = g.baslikYuk + 16;
  ctx.fillStyle = g.kart;
  yuvarlakDikdortgen(ctx, g.kenar - 16, kartUst, g.genislik - 2 * (g.kenar - 16), g.sutunYuk + satirlar.length * g.satirYuk + 8, 24);
  ctx.fill();
  const sutunX = sutunlar.map((_, i) => g.genislik - g.kenar - 10 - (sutunlar.length - 1 - i) * 150);
  ctx.fillStyle = g.soluk;
  ctx.font = font(700, 24);
  ctx.textAlign = 'left';
  ctx.fillText('TAKIM', g.kenar + 80, kartUst + 44);
  ctx.textAlign = 'right';
  sutunlar.forEach((s, i) => ctx.fillText(s.toLocaleUpperCase('tr'), sutunX[i], kartUst + 44));
  const adGenisligi = sutunX[0] - 110 - (g.kenar + 80);
  satirlar.forEach((s, i) => {
    const ust = kartUst + g.sutunYuk + i * g.satirYuk;
    const orta = ust + g.satirYuk / 2;
    ctx.strokeStyle = g.cizgi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.kenar, ust);
    ctx.lineTo(g.genislik - g.kenar, ust);
    ctx.stroke();
    ctx.fillStyle = s.sira <= 3 ? g.madalya[s.sira - 1] : g.zemin;
    ctx.beginPath();
    ctx.arc(g.kenar + 30, orta, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.sira <= 3 ? '#ffffff' : g.yazi;
    ctx.font = font(800, 26);
    ctx.textAlign = 'center';
    ctx.fillText(String(s.sira), g.kenar + 30, orta + 9);
    ctx.textAlign = 'left';
    ctx.fillStyle = g.yazi;
    sigdir(ctx, s.ad, 31, adGenisligi, b => font(800, b));
    ctx.fillText(s.ad, g.kenar + 80, s.not ? orta - 4 : orta + 11);
    if (s.not) {
      ctx.fillStyle = g.soluk;
      sigdir(ctx, s.not, 22, adGenisligi, b => font(500, b));
      ctx.fillText(s.not, g.kenar + 80, orta + 26);
    }
    ctx.textAlign = 'right';
    s.degerler.forEach((d, j) => {
      const son = j === s.degerler.length - 1;
      ctx.fillStyle = son ? g.vurgu : g.yazi;
      ctx.font = font(800, son ? 34 : 31);
      ctx.fillText(String(d), sutunX[j], orta + 11);
    });
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = g.soluk;
  ctx.font = font(500, 24);
  const zaman = new Date().toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  ctx.fillText(`${location.host}${location.pathname.replace(/\/$/, '')} · ${zaman}`, g.genislik / 2, yukseklik - g.kenar - 10);
  return new Promise(ok => tuval.toBlob(ok, 'image/png'));
}

function gorselVerisi(tur, n) {
  if (tur === 'genel') {
    const haftalar = puanHaftalari();
    const tablo = genelTablo();
    const [ilk, son] = [haftalar[0].hafta, haftalar.at(-1).hafta];
    return {
      dosyaAdi: 'pota-alti-bsl-genel-klasman.png',
      bilgi: {
        baslik: S.ayar.ad, altBaslik: `Genel Klasman · ${ilk === son ? `${hf(ilk)}. hafta` : `${hf(ilk)}–${hf(son)}. haftalar`}`, sutunlar: ['VP', 'Puan'],
        satirlar: tablo.map(s => ({ sira: s.sira, ad: s.ad, not: s.menajer ?? '', degerler: [sayi(s.vp), s.puan] })),
      },
    };
  }
  const h = S.haftalar[n];
  const hd = C.haftaDurumu(h);
  return {
    dosyaAdi: `pota-alti-${LIG.kod}-${hf(n)}-hafta.png`,
    bilgi: {
      baslik: S.ayar.ad, altBaslik: `${hf(n)}. Hafta · ${hd.tamamlandi ? 'Kesin sonuç' : `Ara sonuç (${hd.bitti}/${hd.toplam} maç bitti)`}`, sutunlar: ['VP', 'Puan'],
      satirlar: C.haftaSiralamasi(haftaTakimlari(n), h).map(s => ({
        sira: s.sira, ad: s.ad, degerler: [sayi(s.toplam), `+${s.puan}`],
        not: s.vpEsitligi ? (s.enIyiTurk ? `Eşitlik: ${s.enIyiTurk.ad} ${sayi(s.enIyiTurk.vp)} VP` : 'Eşitlik: Türk oyuncu yok') : '',
      })),
    },
  };
}

function gorseliIndir(dosya) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(dosya);
  a.download = dosya.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Telefonlar paylaşım menüsünü ancak dokunuştan hemen sonra açtırır. Görsel hazırlanırken bu süre dolarsa
// (NotAllowedError) hazır görsel saklanır ve düğmeye ikinci dokunuşta hemen paylaşılır.
let hazirGorsel = null; // { anahtar, zaman, dosya, bilgi }
async function siralamayiPaylas(dugme, tur, n, indir = false) {
  const anahtar = `${tur}-${n}`;
  let hazir = hazirGorsel?.anahtar === anahtar && Date.now() - hazirGorsel.zaman < 60000 ? hazirGorsel : null;
  const ilkYazi = dugme.textContent;
  dugme.disabled = true;
  try {
    if (!hazir) {
      dugme.textContent = '…';
      const { bilgi, dosyaAdi } = gorselVerisi(tur, n);
      const blob = await siralamaGorseli(bilgi);
      hazir = hazirGorsel = { anahtar, zaman: Date.now(), dosya: new File([blob], dosyaAdi, { type: 'image/png' }), bilgi };
    }
    const { dosya, bilgi } = hazir;
    if (!indir && navigator.canShare?.({ files: [dosya] })) {
      try {
        await navigator.share({ files: [dosya], title: bilgi.baslik, text: `${bilgi.baslik} · ${bilgi.altBaslik}` });
        hazirGorsel = null;
      } catch (e) {
        if (e?.name === 'NotAllowedError') bildir('Görsel hazır: paylaşmak için Paylaş\'a tekrar dokun.');
        else if (e?.name === 'AbortError') hazirGorsel = null; // kullanıcı paylaşımı iptal etti
        else throw e;
      }
    } else {
      // İndir düğmesi ya da paylaşım menüsü yoksa (ör. bilgisayar) görsel indirilir
      gorseliIndir(dosya);
      hazirGorsel = null;
    }
  } catch (e) {
    hazirGorsel = null;
    bildir(`Paylaşılamadı: ${e?.message ?? e}`, true);
  } finally {
    dugme.disabled = false;
    dugme.textContent = ilkYazi;
  }
}

function haftaKart(haftalar, secili) {
  const h = S.haftalar[secili];
  const sonuc = C.haftaSiralamasi(haftaTakimlari(secili), h);
  const hd = C.haftaDurumu(h);
  return `<div class="kart">
    <div class="sekmeler">${haftalar.map(x => `<button data-is="git" data-yol="#/puan/hafta/${x.hafta}" class="${x.hafta === secili ? 'aktif' : ''}">${hf(x.hafta)}. hafta</button>`).join('')}</div>
    <div class="baslik-satir"><h2>${hf(secili)}. hafta${LIG.fanteziHaftasi ? ` <span class="soluk kucuk">${LIG.kisa} ${secili}. hafta</span>` : ''}</h2>${paylasDugmeleri('hafta', secili)}</div>
    <p class="soluk kucuk">${hd.bitti}/${hd.toplam} maç bitti${hd.canli ? ' · canlı maç var' : ''}</p>
    <div class="tablo-kap"><table>
      <thead><tr><th class="sayi">#</th><th>Takım</th><th class="sayi">VP</th><th class="sayi">Puan</th></tr></thead>
      <tbody>${sonuc.map(s => `<tr class="tikla ${s.id === benimTakimim() ? 'ben' : ''}" data-is="ac" data-id="${s.id}">
          <td class="sayi"><span class="madalya m${s.sira}">${s.sira}</span></td><td><b>${esc(s.ad)}</b> <span class="soluk kucuk">${esc(s.menajer ?? '')}</span>
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
  const satir = o => `<tr data-oyuncu="${esc(o.id)}" data-sayildi="${o.sayildi}"><td class="${o.sayildi ? '' : o.rol === 'as' ? 'cizik' : 'soluk'}">${esc(o.ad)}${trRozeti(o)}
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
      ? `<p class="kucuk soluk" style="margin:0 0 6px">${g ? `${g.sira}. sıra · ${g.puan} puan · ` : ''}${hakOzeti(k, true)}</p>` : '';
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
      <tbody>${g.haftalar.map(h => `<tr class="tikla" data-is="git" data-yol="#/puan/hafta/${h.hafta}" data-acik="${tid}"><td>${hf(h.hafta)}. hafta</td><td class="sayi">${sayi(h.vp)}</td><td class="sayi">${h.sira}.</td><td class="sayi"><b>${h.puan}</b></td></tr>`).join('')}
      <tr><td><b>Toplam</b> (${g.sira}. sırada)</td><td class="sayi"><b>${sayi(g.vp)}</b></td><td></td><td class="sayi"><b>${g.puan}</b></td></tr></tbody></table></div></div>` : '';
  }
  const hareket = Object.values(S.hareketler).filter(h => h.takim === tid || h.veren === tid);
  return `${takimKarti(tid, asama() === 'sezon' ? `<p class="kucuk soluk" style="margin:0 0 6px">${hakOzeti(k)}</p>` : '')}
    ${yoneticiKadroPaneli(tid)}
    ${haftalik}
    ${hareket.length ? `<div class="kart"><h3>Hareketler</h3>${hareket.map(hareketSatiri).join('')}</div>` : ''}`;
}

// Yönetici: takımın kadrosunu doğrudan düzenler (haklar, bekleme ve değişiklik kuralı aranmaz)
function yoneticiKadroPaneli(tid) {
  const k = S.kadrolar[tid];
  if (!yonetici() || !k || !['kadro', 'sezon'].includes(asama())) return '';
  const tum = [...k.as, ...k.yedek];
  if (!S.ui.yDizilis || S.ui.yDizilisTakim !== tid) { S.ui.yDizilis = new Set(k.as); S.ui.yDizilisTakim = tid; }
  const secili = S.ui.yDizilis;
  const dSorun = secili.size === S.ayar.asSayisi ? dizilisSorunu({ as: tum.filter(p => secili.has(p)), yedek: tum.filter(p => !secili.has(p)) }) : null;
  const sahip = sahipler();
  const ara = aramaNorm(S.ui.yAra.trim());
  const adaylar = ara.length >= 2 ? [...S.rehber.values()].filter(o => o.aktif && !sahip.has(o.id) && aramaNorm(o.ad).includes(ara))
    .sort((a, b) => b.vpOrt - a.vpOrt).slice(0, 10) : [];
  const birak = tum.includes(S.ui.yBirak) ? S.ui.yBirak : '';
  const sezon = asama() === 'sezon';
  return `<div class="kart yonetici-araclari"><h3>Yönetici: kadroyu düzenle</h3>
    <p class="kucuk soluk">Bu takımın kadrosunu doğrudan değiştirebilirsin; serbest oyuncu hakkı, bekleme süresi ve değişiklik hakkı aranmaz.${sezon ? ` Değişiklikler <b>${hf(etkinHafta())}. haftadan</b> itibaren geçerli olur ve Hareketler'de görünür.` : ''}</p>
    <h4>Oyuncu değiştir</h4>
    <div class="satir">
      <select id="y-birak" data-ui="yBirak"><option value="">Çıkacak oyuncu</option>${tum.map(p => `<option value="${p}" ${p === birak ? 'selected' : ''}>${esc(oyuncu(p).ad)} (${k.as.includes(p) ? 'As' : 'Yedek'})</option>`).join('')}</select>
      <input type="search" id="y-ara" data-ui="yAra" placeholder="Gelecek oyuncuyu ara (boştakiler)" value="${esc(S.ui.yAra)}" class="ara">
    </div>
    ${adaylar.length ? `<div class="tablo-kap"><table>${adaylar.map(o => {
      const kalan = beklemeKalani(o.id);
      return `<tr><td>${oyuncuAdi(o.id)}${kalan ? ` <span class="rozet uyari">⏳ ${sureYazisi(kalan)}</span>` : ''}</td><td class="sayi">${sayi(o.vpOrt)}</td>
        <td class="sayi"><button class="btn kucuk ana" data-is="y-degistir" data-id="${o.id}" ${birak ? '' : 'disabled title="Önce çıkacak oyuncuyu seç"'}>Bununla değiştir</button></td></tr>`;
    }).join('')}</table></div>` : ara.length >= 2 ? '<p class="soluk kucuk">Boştakilerde bu isimde oyuncu yok.</p>' : ''}
    <h4>As/Yedek dizilişi</h4>
    <div>${tum.map(p => `<button class="secim-chip ${secili.has(p) ? 'secili' : ''}" data-is="y-dizilis" data-id="${p}">${oyuncuAdi(p)}</button>`).join('')}</div>
    <p class="soluk kucuk">${secili.size}/${S.ayar.asSayisi} As seçili${dSorun ? ` · <span class="kirmizi-yazi">kural dışı: ${esc(dSorun)}</span>` : ''}</p>
    <button class="btn" data-is="y-dizilis-kaydet" ${secili.size === S.ayar.asSayisi ? '' : 'disabled'}>Dizilişi kaydet</button>
    ${sezon ? `<h4>Kullanılan haklar</h4><div class="satir">
      <label class="secenek">${ortakHak() ? 'Transfer hakkı' : 'Serbest oyuncu'} <input type="number" id="y-fa" min="0" max="${S.ayar.faHakki}" value="${k.fa}" style="width:56px"> / ${S.ayar.faHakki}</label>
      ${ortakHak() ? `<input type="hidden" id="y-dg" value="${k.degisiklik ?? 0}">` : `<label class="secenek">As–Yedek <input type="number" id="y-dg" min="0" max="${S.ayar.degisiklikHakki}" value="${k.degisiklik}" style="width:56px"> / ${S.ayar.degisiklikHakki}</label>`}
      <button class="btn" data-is="y-haklar">Kaydet</button></div>` : ''}
  </div>`;
}

// ---------- Oyuncu sayfası ----------
// Oyuncunun maç kütüğü için bütün oynanmış haftalar yüklenir (puan durumu sadece başlangıç haftasından sonrasını kullanır)
async function tumHaftalariYukle() {
  if (S.tumHaftalarYukleniyor || S.tumHaftalarYuklendi || !S.index) return;
  S.tumHaftalarYukleniyor = true;
  const gerekli = S.index.haftalar.filter(h => !S.haftalar[h.hafta] && h.ilkMac && new Date(h.ilkMac).getTime() <= simdi());
  await Promise.all(gerekli.map(async h => {
    try { S.haftalar[h.hafta] = await VERI.hafta(h.hafta); } catch { /* henüz yazılmamış hafta */ }
  }));
  S.tumHaftalarYuklendi = true;
  S.tumHaftalarYukleniyor = false;
  ciz();
}

async function oyuncuMaclariniYukle(pid) {
  if (S.oyuncuMaclari[pid] !== undefined || S.oyuncuYukleniyor.has(pid)) return;
  S.oyuncuYukleniyor.add(pid);
  try {
    S.oyuncuMaclari[pid] = await VERI.oyuncuMaclari(pid);
  } catch {
    S.oyuncuMaclari[pid] = null; // dosya yoksa (hiç maç kadrosuna girmemiş) haftalık veriden gösterilir
  }
  S.oyuncuYukleniyor.delete(pid);
  ciz();
}

function gorunumOyuncu(pid) {
  const o = S.rehber.get(pid) ?? S.havuzMap.get(pid);
  if (!o) return '<div class="kart"><p class="bos">Oyuncu bulunamadı.</p></div>';
  tumHaftalariYukle();
  const sahip = sahipler().get(pid);
  const k = sahip && S.kadrolar[sahip];
  const kalan = beklemeKalani(pid);
  const td = talepDurumu(pid);
  const durum = sahip
    ? `<a href="#/takim/${sahip}"><b>${esc(takimAdi(sahip))}</b></a> <span class="rozet ${k.as.includes(pid) ? 'as' : 'yedek'}">${k.as.includes(pid) ? 'As' : 'Yedek'}</span>`
    : o.aktif === false ? '<span class="rozet uyari">TBF\'de lisansı görünmüyor</span>'
      : td?.evre === 'kura' ? '<span class="rozet uyari">🎲 Talep süresi bitti, kura bekleniyor</span>'
        : kalan ? `<span class="rozet uyari">⏳ Talep süresinde · ${sureYazisi(kalan)} kaldı</span>` : '<span class="rozet">Boşta</span>';
  const benimT = benimTakimim();
  const hakVar = benimT && S.kadrolar[benimT] && S.kadrolar[benimT].fa < S.ayar.faHakki;
  const talepKarti = !sahip && td ? `<div class="kart ${td.talepler[benimT] ? 'sira-sende' : ''}"><h3>Talepler <span class="soluk">(${td.talipler.length})</span></h3>
      <p class="kucuk soluk" style="margin-top:0">${td.evre === 'talep'
        ? `Bu oyuncuyu ${sureYazisi(td.kalan)} daha kimse alamaz. Bu sürede talep eden takımlar arasında süre bitince kura çekilir; kimse talep etmezse boştakilere düşer.`
        : 'Talep süresi bitti; kura, bir yöneticinin ekranında otomatik çekilecek.'}</p>
      ${td.talipler.length ? `<ul class="oyuncu-liste">${td.talipler.map(t => `<li><span><a href="#/takim/${t}"><b>${esc(takimAdi(t))}</b></a></span>${t === benimT ? `<span class="soluk kucuk">bırakacağın: ${esc(oyuncu(td.talepler[t]).ad)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="soluk" style="margin:0">Henüz talip olan yok.</p>'}
      <div class="satir" style="margin-top:8px">
        ${td.evre === 'talep' && td.acik && benimT ? (td.talepler[benimT]
          ? `<button class="btn" data-is="talep-git" data-id="${esc(pid)}">Bırakacağımı değiştir</button><button class="btn tehlike" data-is="talep-geri" data-id="${esc(pid)}">Talebi geri çek</button>`
          : hakVar ? `<button class="btn ana" data-is="talep-git" data-id="${esc(pid)}">Talep et</button>` : `<span class="soluk kucuk">${HakAdi()}n kalmadığı için talep edemezsin.</span>`) : ''}
        ${td.evre === 'kura' && yonetici() ? `<button class="btn ana" data-is="talep-kura" data-id="${esc(pid)}">🎲 Kurayı şimdi çek</button>` : ''}
      </div></div>` : '';
  const secim = Object.values(S.secimler).find(s => s.oyuncu === pid);
  const istatistik = [['Maç', o.mac], ['VP', sayi(o.vpOrt)], ['Sayı', sayi(o.sayiOrt)], ['Ribaund', sayi(o.ribOrt)], ['Asist', sayi(o.astOrt)], ['Süre', o.sureOrt ?? '-']];
  // Maç maç istatistikler (TBL Fantezi Ligi'nin yayınladığı BSL oyuncu dosyası); gelmezse haftalık VP ve süre
  if (S.oyuncuMaclari[pid] === undefined) oyuncuMaclariniYukle(pid);
  const macMac = S.oyuncuMaclari[pid];
  const kutuk = macMac?.length ? [...macMac].sort((a, b) => b.hafta - a.hafta || String(b.tarih).localeCompare(String(a.tarih))).map(x => {
    const oynadi = sureSn(x.sure) > 0;
    const sonuc = x.durum === 'canli' ? '<span class="canli-yazi">canlı</span>' : x.skor != null
      ? `<span class="${Number(x.skor) > Number(x.rakipSkor) ? 'yesil-yazi' : 'kirmizi-yazi'}">${Number(x.skor) > Number(x.rakipSkor) ? 'G' : 'M'}</span> ${x.skor}-${x.rakipSkor}` : '';
    return `<tr class="tikla ${oynadi ? '' : 'oynamadi'}" data-is="git" data-yol="#/mac/${x.mac}"><td>${x.hafta}.</td>
      <td class="kucuk">${x.evde ? '' : '@ '}${esc(baslik(x.rakip))}<div class="soluk">${sonuc}</div></td>
      <td class="sayi">${oynadi ? x.sure.split(':')[0] : '—'}</td><td class="sayi">${oynadi ? x.sayi : ''}</td><td class="sayi">${oynadi ? x.rib : ''}</td>
      <td class="sayi">${oynadi ? x.ast : ''}</td><td class="sayi"><b>${oynadi ? x.vp : ''}</b></td></tr>`;
  }) : Object.values(S.haftalar).filter(h => h.oyuncular?.[pid]).sort((a, b) => b.hafta - a.hafta).map(h => {
    const v = h.oyuncular[pid];
    const m = h.maclar.find(x => x.evId === v.takimId || x.depId === v.takimId);
    const ev = m?.evId === v.takimId;
    const rakip = m ? (ev ? m.dep : m.ev) : '';
    const biz = m && Number(ev ? m.evSkor : m.depSkor);
    const onlar = m && Number(ev ? m.depSkor : m.evSkor);
    const sonuc = m && m.durum === 'bitti' ? `<span class="${biz > onlar ? 'yesil-yazi' : 'kirmizi-yazi'}">${biz > onlar ? 'G' : 'M'}</span> ${biz}-${onlar}` : m?.durum === 'canli' ? 'canlı' : '';
    return `<tr><td>${h.hafta}.</td><td class="kucuk">${ev ? '' : '@ '}${esc(baslik(rakip))}<div class="soluk">${sonuc}</div></td>
      <td class="sayi">${v.saniye ? Math.floor(v.saniye / 60) : '—'}</td><td></td><td></td><td></td><td class="sayi"><b>${sayi(v.vp)}</b></td></tr>`;
  });
  const gelecek = Object.values(S.maclar).flat().filter(m => m && m.durum !== 'bitti' && (m.evId === o.takimId || m.depId === o.takimId))
    .sort((a, b) => String(a.tarih).localeCompare(String(b.tarih))).slice(0, 3);
  const ilgili = Object.values(S.hareketler).filter(h => [h.alinan, h.birakilan, h.asaGecen, h.yedegeGecen, h.verilen].flat().includes(pid))
    .sort((a, b) => (b.zaman?.toMillis?.() ?? 0) - (a.zaman?.toMillis?.() ?? 0));
  return `<div class="kart oyuncu-baslik">
      ${o.foto ? `<img src="${esc(o.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div><h2 style="margin:0">${esc(o.ad)} ${mevkiRozeti(mevki(pid))}${trRozeti(o)}</h2>
        <div class="soluk">${esc(o.takim)}${o.ulke ? ` · ${esc(o.ulke)}` : ''}</div>
        <div style="margin-top:6px">${durum}</div>
        ${secim ? `<div class="kucuk soluk" style="margin-top:4px">Draft: ${secim.no + 1}. seçim (${esc(takimAdi(secim.takim))})${secim.otomatik ? ' · otomatik' : ''}</div>` : ''}
        ${yonetici() && !sahip && kalan && S.bekleme[pid] ? `<button class="btn kucuk" data-is="bekleme-kaldir" data-id="${esc(pid)}" style="margin-top:6px">Beklemeyi kaldır</button>` : ''}
      </div></div>
    ${talepKarti}
    <div class="kart"><h3>Sezon ortalamaları</h3><div class="istatistik">${istatistik.map(([ad, d]) => `<div><b>${d}</b><span>${ad}</span></div>`).join('')}</div></div>
    <div class="kart"><h3>Maç maç</h3>${kutuk.length ? `<div class="tablo-kap"><table class="mac-mac">
      <thead><tr><th>Hf</th><th>Rakip</th><th class="sayi">Dk</th><th class="sayi">Sy</th><th class="sayi">Rb</th><th class="sayi">As</th><th class="sayi">VP</th></tr></thead>
      <tbody>${kutuk.join('')}</tbody></table></div>${macMac?.length ? '<p class="soluk kucuk" style="margin:6px 0 0">Maça dokununca kutu skor açılır.</p>' : ''}`
      : `<p class="soluk" style="margin:0">${S.tumHaftalarYuklendi && macMac !== undefined ? 'Bu sezon henüz maçı yok.' : 'Yükleniyor…'}</p>`}
      ${gelecek.length ? `<h4>Sıradaki maçlar</h4>${gelecek.map(m => `<div class="kucuk">${tarih(m.tarih)} · ${m.evId === o.takimId ? `${esc(m.dep)} (iç saha)` : `@ ${esc(m.ev)}`}</div>`).join('')}` : ''}</div>
    ${ilgili.length ? `<div class="kart"><h3>Fantezi hareketleri</h3>${ilgili.map(hareketSatiri).join('')}</div>` : ''}`;
}

// ---------- Kadrom ----------
// Sahada 5 As, altında yedek kulübesi. Hak varsa bir As'a ve bir Yedeğe dokunarak yer değiştirilir.
function sahaKarti(tid, k, secilebilir) {
  const zorunlu = zorunluBekleyen(tid);
  const kart = (p, rol) => {
    const o = oyuncu(p);
    const secili = rol === 'as' ? S.ui.secAs === p : S.ui.secYedek === p;
    const ic = `<b>${esc(o.ad)}</b><small>${esc(baslik(o.takimKod || o.takim || ''))}</small><span class="saha-vp">${sayi(o.vpOrt)} <i>VP</i></span>${mevkiRozeti(mevki(p))}`;
    const sinif = `saha-oyuncu ${rol} ${secili ? 'secili' : ''} ${zorunlu.includes(p) ? 'uyari' : ''}`;
    return secilebilir ? `<button class="${sinif}" data-is="sec-${rol}" data-id="${esc(p)}" aria-pressed="${secili}">${ic}</button>`
      : `<a class="${sinif}" href="#/oyuncu/${esc(p)}">${ic}</a>`;
  };
  const yabanci = LIG.kural === 'tbl' ? k.as.filter(p => !turkMu(p)).length : null;
  let cubuk = '';
  if (secilebilir && (S.ui.secAs || S.ui.secYedek)) {
    const asP = k.as.includes(S.ui.secAs) ? S.ui.secAs : null;
    const yP = k.yedek.includes(S.ui.secYedek) ? S.ui.secYedek : null;
    const sorun = asP && yP ? dizilisSorunu({ as: k.as.map(p => (p === asP ? yP : p)), yedek: k.yedek.map(p => (p === yP ? asP : p)) }) : null;
    cubuk = `<div class="degisim-cubugu">
      <span>${asP ? `<b>${esc(oyuncu(asP).ad)}</b> yedeğe` : 'Yedeğe geçecek As\'ı seç'} ⇄ ${yP ? `<b>${esc(oyuncu(yP).ad)}</b> As'a` : 'As\'a geçecek Yedeği seç'}</span>
      ${sorun ? `<span class="kirmizi-yazi kucuk">Olmaz: ${esc(sorun)}</span>` : ''}
      <span class="satir"><button class="btn ana" data-is="degistir" ${asP && yP && !sorun ? '' : 'disabled'}>Değiştir${ortakHak() ? ' (1 hak)' : ''}</button><button class="btn" data-is="sec-temizle">Vazgeç</button></span></div>`;
  }
  return `<div class="kart saha-kart">
    <div class="baslik-satir"><h2>${esc(takimAdi(tid))}</h2>${yabanci != null ? `<span class="rozet ${yabanci > kural().enFazlaYabanci ? 'uyari' : ''}">As'ta yabancı: ${yabanci}/${kural().enFazlaYabanci}</span>` : ''}</div>
    <div class="saha"><div class="saha-cizgi"></div>${k.as.map(p => kart(p, 'as')).join('')}</div>
    <div class="kulube"><span class="kulube-ad">Yedek</span>${k.yedek.map(p => kart(p, 'yedek')).join('')}</div>
    ${cubuk}
  </div>`;
}

// Kadrodaki oyuncuların bu haftaki maçları; maç başladıysa VP'leri
function haftaMaclariKarti(tid) {
  const k = S.kadrolar[tid];
  const n = maclarVarsayilanHafta();
  const maclar = n && S.maclar[n];
  if (!k || !maclar?.length) return '';
  const hv = S.haftalar[n];
  const satir = (p, rol) => {
    const o = oyuncu(p);
    const m = o.takimId && maclar.find(x => x.evId === o.takimId || x.depId === o.takimId);
    const ev = m && m.evId === o.takimId;
    const v = hv?.oyuncular?.[p];
    const durum = !m ? 'bu hafta maçı yok'
      : m.durum === 'oynanmadi' ? `${gunBasligi(m.tarih)} · ${saatYazisi(m.tarih)}`
        : m.durum === 'canli' ? '<span class="canli-yazi">canlı</span>' : `MS ${m.evSkor}-${m.depSkor}`;
    return `<li><span><b>${esc(o.ad)}</b> <span class="rozet ${rol}">${rol === 'as' ? 'As' : 'Yedek'}</span>
      <small class="soluk" style="display:block">${m ? `${ev ? 'vs' : '@'} ${esc(baslik(ev ? m.dep : m.ev))} · ` : ''}${durum}</small></span>
      <span class="sayi"><b>${m && m.durum !== 'oynanmadi' && v ? sayi(v.vp) : '–'}</b></span></li>`;
  };
  return `<div class="kart"><div class="baslik-satir"><h3>${hf(n)}. hafta maçları</h3><a href="#/maclar/${n}">Fikstür ›</a></div>
    <ul class="oyuncu-liste hafta-maclari">${k.as.map(p => satir(p, 'as')).join('')}${k.yedek.map(p => satir(p, 'yedek')).join('')}</ul></div>`;
}

function gorunumKadrom() {
  const tid = benimTakimim();
  if (!tid) return '<div class="kart"><p class="bos">Bu sayfa için yöneticinin gönderdiği menajer linkinle girmelisin.</p></div>';
  const k = S.kadrolar[tid];
  if (!k) return '<p class="bos">Yükleniyor…</p>'; // sayfa yenilenince kadrolar bir an sonra gelir
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
  }
  const adKarti = `<div class="kart"><h3>Takım adı</h3><div class="satir">
      <input type="text" id="takim-adi" maxlength="30" value="${esc(t.ad)}" class="ara">
      <button class="btn" data-is="takim-adi">Kaydet</button></div></div>`;
  if (asama() !== 'sezon') return `${takimKarti(tid)}${ana}${adKarti}`;
  const hak = ortakHak() ? S.ayar.faHakki - k.fa : S.ayar.degisiklikHakki - k.degisiklik;
  const zorunlu = zorunluBekleyen(tid).length > 0;
  const aciklama = `<div class="kart"><h3>As–Yedek değişikliği</h3>
    ${zorunlu ? '<p class="kirmizi-yazi" style="margin:0">Önce lisansı düşen oyuncunun yerine <a href="#/bostakiler">boştakilerden</a> oyuncu almalısın.</p>'
      : hak > 0 ? `<p style="margin:0">Sahadan bir As'a, sonra kulübeden bir Yedeğe dokun; ikisi yer değiştirir. ${ortakHak() ? `Her değişiklik <b>transfer hakkından 1</b> düşer (kalan: <b>${hak}</b>).`
        : `Sezon boyunca <b>${hakYazisi(S.ayar.degisiklikHakki)}</b> değiştirebilirsin.`} ${kuralCumlesi()}. Değişiklik <b>${hf(etkinHafta())}. haftadan</b> itibaren geçerli olur.</p>`
        : `<p class="soluk" style="margin:0">${ortakHak() ? 'Transfer hakkın kalmadı.' : 'As–Yedek değişikliği hakkını kullandın.'}</p>`}
    <p class="kucuk" style="margin:10px 0 0">${HakAdi()}n: <b>${S.ayar.faHakki - k.fa}</b> / ${S.ayar.faHakki} · <a href="#/bostakiler">Boştaki oyuncular ›</a>${LIG.takas ? ' · <a href="#/takas">Takas ›</a>' : ''}</p></div>`;
  return `<div class="kadrom-duzen"><div>${sahaKarti(tid, k, hak > 0 && !zorunlu)}${aciklama}</div>
    <div>${haftaMaclariKarti(tid)}${adKarti}</div></div>`;
}

// ---------- Serbest oyuncular ----------
function gorunumSerbest() {
  if (!['kadro', 'sezon'].includes(asama())) return '<div class="kart"><p class="bos">Boştaki oyuncular draft bitince burada görünür.</p></div>';
  const alimAcik = asama() === 'sezon';
  const tid = benimTakimim();
  const k = tid && S.kadrolar[tid];
  const sahip = sahipler();
  const ara = aramaNorm(S.ui.ara);
  const bslTakimlar = [...new Set([...S.rehber.values()].filter(o => o.aktif).map(o => o.takim))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = [...S.rehber.values()].filter(o => o.aktif && !sahip.has(o.id)
    && (!S.ui.sadeceTurk || o.turk) && (!S.ui.bslTakim || o.takim === S.ui.bslTakim)
    && (!S.ui.mevkiFiltre || mevki(o.id) === S.ui.mevkiFiltre)
    && (!ara || aramaNorm(o.ad).includes(ara)));
  // Sıralama: VP ortalaması, son oynanan haftanın VP'si ya da sayı ortalaması
  const sonHafta = Object.values(S.haftalar).filter(h => h.maclar?.some(m => m.durum !== 'oynanmadi')).sort((a, b) => b.hafta - a.hafta)[0];
  const SIRALAR = { vp: ['VP ort.', o => o.vpOrt ?? 0], ...(sonHafta ? { hafta: [`${sonHafta.hafta}. hafta VP`, o => sonHafta.oyuncular[o.id]?.vp ?? -99] } : {}), sayi: ['Sayı ort.', o => o.sayiOrt ?? 0] };
  const sirala = SIRALAR[S.ui.faSirala] ? S.ui.faSirala : 'vp';
  liste.sort((a, b) => SIRALAR[sirala][1](b) - SIRALAR[sirala][1](a));
  const haftaSutunu = sirala === 'hafta';
  const hak = k && alimAcik ? S.ayar.faHakki - k.fa : 0;
  const zorunlu = tid ? zorunluBekleyen(tid) : [];
  const alabilir = hak > 0 || zorunlu.length > 0;
  let panel = '';
  const td = S.ui.faAl && talepDurumu(S.ui.faAl);
  if (S.ui.faAl && k && td?.evre === 'talep') {
    const al = oyuncu(S.ui.faAl);
    const benim = td.talepler[tid];
    panel = `<div class="kart sira-sende"><h3>${esc(al.ad)} ${trRozeti(al)} <span class="soluk kucuk">${esc(al.takim)}</span></h3>
      <p>Bu oyuncu talep süresinde (<b>${sureYazisi(td.kalan)}</b> kaldı, şu an ${td.talipler.length} takım talip). Süre bitince talip olan takımlar arasında <b>kura</b> çekilir.
      Kazanırsan seçtiğin oyuncu bırakılır, ${al.ad} onun yerine (As ya da Yedek) geçer ve ${hakAdi()}ndan 1 düşer. As'taki bir oyuncunun yerine aynı mevkiden oyuncu alınmalı.</p>
      <div class="satir"><select id="fa-birak"><option value="">Kazanırsam bırakacağım oyuncu</option>
        ${[...k.as.map(p => [p, 'As']), ...k.yedek.map(p => [p, 'Yedek'])].map(([p, rol]) => `<option value="${p}" ${benim === p ? 'selected' : ''}>${esc(oyuncu(p).ad)} (${rol})</option>`).join('')}</select>
      <button class="btn ana" data-is="talep-onayla">${benim ? 'Talebi güncelle' : 'Talep et'}</button><button class="btn" data-is="fa-vazgec">Vazgeç</button></div></div>`;
  } else if (S.ui.faAl && k) {
    const al = oyuncu(S.ui.faAl);
    // Hakkı bittiyse sadece lisansı düşen oyuncunun yerine alabilir
    const birakilabilir = [...k.as.map(p => [p, 'As']), ...k.yedek.map(p => [p, 'Yedek'])]
      .filter(([p]) => hak > 0 || zorunlu.includes(p))
      .sort(([a], [b]) => zorunlu.includes(b) - zorunlu.includes(a));
    panel = `<div class="kart sira-sende"><h3>${esc(al.ad)} ${trRozeti(al)} <span class="soluk kucuk">${esc(al.takim)}</span></h3>
      <p>Kimin yerine alıyorsun? Gelen oyuncu, bıraktığın oyuncunun yerine (As ya da Yedek) geçer; ${kuralCumlesi()}. Değişiklik <b>${hf(etkinHafta())}. haftadan</b> itibaren sayılır. Bıraktığın oyuncu serbest kalır.</p>
      <div class="satir"><select id="fa-birak"><option value="">Bırakılacak oyuncu</option>
        ${birakilabilir.map(([p, rol]) => `<option value="${p}" ${zorunlu[0] === p ? 'selected' : ''}>${esc(oyuncu(p).ad)} (${rol})${zorunlu.includes(p) ? ' · lisansı düştü, hak kullanmaz' : ''}</option>`).join('')}</select>
      <button class="btn ana" data-is="fa-onayla">Onayla</button><button class="btn" data-is="fa-vazgec">Vazgeç</button></div></div>`;
  }
  const alHucresi = o => {
    const td = talepDurumu(o.id);
    return td ? talepHucresi(o.id, td, hak > 0) : alabilir ? `<button class="btn kucuk ana" data-is="fa-al" data-id="${o.id}">Al</button>` : '';
  };
  const adLinki = o => `<a href="#/oyuncu/${o.id}" class="oyuncu-link" data-is="oyuncu-panel" data-id="${o.id}">${esc(o.ad)}</a>`;
  const gosterilen = liste.slice(0, 300);
  const listeHtml = telefon()
    ? `<div class="fa-liste">${gosterilen.map(o => `<div class="fa-kart">
        <div class="ad">${adLinki(o)} ${mevkiRozeti(mevki(o.id))}${trRozeti(o)}<small>${esc(baslik(o.takim))} · ${o.mac} maç</small></div>
        <div class="fa-vp"><b>${haftaSutunu ? (sonHafta.oyuncular[o.id] ? sayi(sonHafta.oyuncular[o.id].vp) : '–') : sirala === 'sayi' ? sayi(o.sayiOrt) : sayi(o.vpOrt)}</b><small>${SIRALAR[sirala][0]}</small></div>
        <div class="fa-al">${alHucresi(o)}</div></div>`).join('') || '<p class="bos">Oyuncu bulunamadı</p>'}</div>`
    : `<div class="tablo-kap"><table>
        <thead><tr><th>Oyuncu</th><th>${LIG.kisa} takımı</th><th class="sayi ${haftaSutunu ? 'dar-gizle' : ''}">Maç</th><th class="sayi">VP ort.</th>${haftaSutunu ? `<th class="sayi">${sonHafta.hafta}. hf</th>` : '<th class="sayi dar-gizle">Sayı</th>'}<th></th></tr></thead>
        <tbody>${gosterilen.map(o => `<tr class="${S.ui.panel === o.id ? 'ben' : ''}">
          <td>${adLinki(o)} ${mevkiRozeti(mevki(o.id))}${trRozeti(o)}</td><td class="kucuk">${bslTakimHucre(o)}</td>
          <td class="sayi ${haftaSutunu ? 'dar-gizle' : ''}">${o.mac}</td><td class="sayi"><b>${sayi(o.vpOrt)}</b></td>${haftaSutunu ? `<td class="sayi"><b>${sonHafta.oyuncular[o.id] ? sayi(sonHafta.oyuncular[o.id].vp) : '–'}</b></td>` : `<td class="sayi dar-gizle">${sayi(o.sayiOrt)}</td>`}
          <td class="sayi">${alHucresi(o)}</td></tr>`).join('')
          || '<tr><td colspan="6" class="bos">Oyuncu bulunamadı</td></tr>'}</tbody>
      </table></div>`;
  const panelOyuncu = genis() && S.ui.panel && S.rehber.get(S.ui.panel);
  const cekmece = panelOyuncu ? `<div class="cekmece-arka" data-is="panel-kapat"></div>
    <aside class="cekmece" aria-label="${esc(panelOyuncu.ad)}">
      <div class="cekmece-ust"><a href="#/oyuncu/${panelOyuncu.id}" class="kucuk">Oyuncu sayfası ›</a>
        ${!sahip.has(panelOyuncu.id) && !talepDurumu(panelOyuncu.id) && alabilir ? `<button class="btn ana" data-is="fa-al" data-id="${panelOyuncu.id}">Al</button>` : ''}
        <button class="btn" data-is="panel-kapat" aria-label="Kapat">✕</button></div>
      ${gorunumOyuncu(panelOyuncu.id)}</aside>` : '';
  return `<div class="kart"><h2>Boştaki oyuncular</h2>
    <p style="margin-bottom:0">Hiçbir takımda olmayan ${LIG.kisa} oyuncuları. ${!alimAcik ? 'Serbest oyuncu alımı sezon başlayınca açılır.'
      : tid ? `Kalan ${hakAdi()}n: <b>${hak}</b> / ${S.ayar.faHakki} (sezon boyunca).` : ''}
      ${alimAcik ? ` Bir takımın bıraktığı ya da lige yeni katılan oyuncu <b>${beklemeSaati()} saat</b> kimse tarafından alınamaz (⏳); bu sürede takımlar <b>talep</b> eder, süre bitince talip olanlar arasında kura çekilir. Talep eden olmazsa oyuncu boştakilere düşer.` : ''}</p>
    ${zorunlu.length ? `<div class="hata-kutu"><b>Zorunlu değişiklik:</b> ${zorunlu.map(p => esc(oyuncu(p).ad)).join(', ')} artık TBF'de lisanslı görünmüyor. Aşağıdan kadro kuralına uygun bir oyuncu seçip <b>Al</b>'a bas; bu değişiklik ${hakAdi()}ndan düşmez.</div>` : ''}</div>
    ${panel}
    <div class="kart">
      <div class="satir" style="margin-bottom:10px">
        <input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ara" value="${esc(S.ui.ara)}" class="ara">
        <select id="f-takim" data-ui="bslTakim"><option value="">Bütün ${LIG.kisa} takımları</option>${bslTakimlar.map(t => `<option ${t === S.ui.bslTakim ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        ${mevkilerHazir() ? `<select id="f-mevki" data-ui="mevkiFiltre"><option value="">Ön + Arka</option><option value="on" ${S.ui.mevkiFiltre === 'on' ? 'selected' : ''}>Sadece Ön</option><option value="arka" ${S.ui.mevkiFiltre === 'arka' ? 'selected' : ''}>Sadece Arka</option></select>` : ''}
        <label class="secenek"><input type="checkbox" id="f-turk" data-ui="sadeceTurk" ${S.ui.sadeceTurk ? 'checked' : ''}> Sadece Türkler</label>
      </div>
      <div class="secenekler">${Object.entries(SIRALAR).map(([k2, [ad]]) => `<button class="secenek ${k2 === sirala ? 'aktif' : ''}" data-is="fa-sirala" data-id="${k2}">${ad}</button>`).join('')}</div>
      ${listeHtml}
    </div>${cekmece}`;
}

// Talep süresindeki oyuncunun satırı: kalan süre, talip sayısı, talep et / geri çek
function talepHucresi(pid, td, hakVar) {
  const tid = benimTakimim();
  const talip = td.talipler.length ? `<a href="#/oyuncu/${pid}" class="kucuk">${td.talipler.length} talip</a>` : '';
  if (td.evre === 'kura') return `<div class="talep-hucre"><span class="rozet uyari" title="Talep süresi bitti, kura çekilecek">🎲 Kura</span>${talip}</div>`;
  const rozet = `<span class="rozet uyari" title="${beklemeSaati()} saat kimse alamaz; süre bitince talip olanlar arasında kura çekilir">⏳ ${sureYazisi(td.kalan)}</span>${talip}`;
  if (!tid || !td.acik) return `<div class="talep-hucre">${rozet}</div>`;
  if (td.talepler[tid]) return `<div class="talep-hucre">${rozet}<span class="rozet as">talip oldun</span><button class="btn kucuk" data-is="talep-geri" data-id="${pid}">Geri çek</button></div>`;
  return `<div class="talep-hucre">${rozet}${hakVar ? `<button class="btn kucuk ana" data-is="fa-al" data-id="${pid}">Talep et</button>` : ''}</div>`;
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
  const durumlar = { bekliyor: 'Bekliyor', onay: 'Yönetici onayı bekleniyor', kabul: 'Tamamlandı', red: 'Reddedildi', iptal: 'İptal edildi', 'yonetici-red': 'Yönetici reddetti' };
  const acik = ['bekliyor', 'onay'].includes(t.durum);
  const sorun = acik ? teklifGecerliligi(t) : null;
  return `<div class="teklif">
    <div class="baslik-satir"><span class="kucuk soluk">${t.zaman ? tarih(t.zaman) : ''}</span><span class="rozet ${t.durum === 'kabul' ? 'as' : t.durum === 'onay' ? 'uyari' : ''}">${durumlar[t.durum] ?? t.durum}</span></div>
    <div class="yon">
      <div><b>${esc(takimAdi(t.veren))}</b> verir:<br>${t.verilen.map(p => `${oyuncuAdi(p, { link: true })}${acik ? ` <span class="soluk kucuk">(${rolu(t.veren, p)})</span>` : ''}`).join('<br>')}</div>
      <div class="ok">⇄</div>
      <div><b>${esc(takimAdi(t.alan))}</b> verir:<br>${t.alinan.map(p => `${oyuncuAdi(p, { link: true })}${acik ? ` <span class="soluk kucuk">(${rolu(t.alan, p)})</span>` : ''}`).join('<br>')}</div>
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
  const onayda = hepsi.filter(t => t.durum === 'onay' && (yonetici() || t.veren === tid || t.alan === tid));
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
      <p class="kucuk soluk">Her iki taraftan aynı sayıda (1–3) oyuncu seç. Seçim sırası eşleşmeyi belirler: 1. verdiğinin yerine 1. aldığın geçer (As ya da Yedek). ${kuralCumlesi()}. Karşı taraf kabul edince takas yönetici onayına gider; yönetici onaylayınca o an kadro değişikliğinin geçerli olabileceği ilk haftadan (şu an <b>${hf(etkinHafta())}. hafta</b>) itibaren geçerli olur.</p>
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
  const gelenHtml = gelen.length ? `<div class="kart"><h3>Sana gelen teklifler</h3>${gelen.map(t => teklifKarti(t, `<button class="btn ana" data-is="teklif-kabul" data-id="${t.id}" ${teklifGecerliligi(t) ? 'disabled' : ''}>Kabul et</button><button class="btn tehlike" data-is="teklif-red" data-id="${t.id}">Reddet</button>`)).join('')}</div>` : '';
  const onayHtml = onayda.length ? `<div class="kart ${yonetici() ? 'sira-sende' : ''}"><h3>${yonetici() ? 'Onayını bekleyen takaslar' : 'Yönetici onayı bekleyen takasların'}</h3>
    ${onayda.map(t => teklifKarti(t, [
      yonetici() && `<button class="btn ana" data-is="takas-onayla" data-id="${t.id}" ${teklifGecerliligi(t) ? 'disabled' : ''}>Onayla</button><button class="btn tehlike" data-is="takas-reddet" data-id="${t.id}">Reddet</button>`,
      t.veren === tid && `<button class="btn" data-is="teklif-iptal" data-id="${t.id}">Geri çek</button>`,
    ].filter(Boolean).join(''))).join('')}</div>` : '';
  const gidenHtml = giden.length ? `<div class="kart"><h3>Gönderdiğin teklifler</h3>${giden.map(t => teklifKarti(t, `<button class="btn" data-is="teklif-iptal" data-id="${t.id}">Geri çek</button>`)).join('')}</div>` : '';
  const ligHtml = `<div class="kart"><h3>Ligdeki takaslar</h3>${biten.length ? biten.map(t => teklifKarti(t)).join('') : '<p class="soluk" style="margin:0">Henüz takas yapılmadı.</p>'}</div>`;
  const giris = tid ? '' : '<div class="kart"><p style="margin:0">Takas teklif etmek için menajer linkinle gir.</p></div>';
  if (genis()) return `${giris}<div class="iki-sutun"><div>${yeni}${gidenHtml}</div><div>${onayHtml}${gelenHtml}${ligHtml}</div></div>`;
  return `${giris}${onayHtml}${gelenHtml}${yeni}${gidenHtml}${ligHtml}`;
}

// ---------- Hareketler ----------
function hareketSatiri(h) {
  let metin = '';
  const ad = p => oyuncuAdi(p, { link: true });
  if (h.tur === 'zorunlu') metin = `<b>${esc(takimAdi(h.takim))}</b> lisansı düşen ${ad(h.birakilan)} yerine ${ad(h.alinan)} aldı (zorunlu değişiklik).`;
  else if (h.tur === 'serbest') metin = `<b>${esc(takimAdi(h.takim))}</b> serbest oyuncu aldı: ${ad(h.alinan)} · Bıraktı: ${ad(h.birakilan)}`;
  else if (h.tur === 'degisiklik') metin = `<b>${esc(takimAdi(h.takim))}</b> As–Yedek değişikliği: As'a geçen ${ad(h.asaGecen)} · Yedeğe geçen ${ad(h.yedegeGecen)}`;
  else if (h.tur === 'takas') metin = `<b>${esc(takimAdi(h.veren))}</b> ⇄ <b>${esc(takimAdi(h.takim))}</b> takası (yönetici onayladı): ${h.verilen.map(ad).join(', ')} ⇄ ${h.alinan.map(ad).join(', ')}`;
  else if (h.tur === 'talep') metin = `<b>${esc(takimAdi(h.takim))}</b> talep kurasını kazandı: ${ad(h.alinan)} · Bıraktı: ${ad(h.birakilan)}
    <div class="kucuk soluk">Talip olanlar (${h.talipler.length}): ${h.talipler.map(t => esc(takimAdi(t))).join(', ')}</div>`;
  else if (h.tur === 'talep-yok') metin = `${ad(h.alinan)} için talep eden takımların hiçbiri o an kurala uymadığı için oyuncu boştakilere düştü.`;
  else if (h.tur === 'otomatik') metin = `<b>${esc(takimAdi(h.takim))}</b>: lisansı düşen ${ad(h.birakilan)} yerine aynı ${LIG.kisa} takımına gelen ${ad(h.alinan)} otomatik geçti (hak kullanılmadı).`;
  else if (h.tur === 'yonetici') metin = `Yönetici, <b>${esc(takimAdi(h.takim))}</b> kadrosunda ${ad(h.birakilan)} yerine ${ad(h.alinan)} koydu.`;
  else if (h.tur === 'yonetici-dizilis') metin = `Yönetici, <b>${esc(takimAdi(h.takim))}</b> dizilişini değiştirdi. As: ${h.as.map(ad).join(', ')} · Yedek: ${h.yedek.map(ad).join(', ')}`;
  else metin = esc(h.metin ?? h.tur);
  return `<div class="teklif"><div class="kucuk soluk">${h.zaman ? tarih(h.zaman) : ''}${h.hafta ? ` · ${hf(h.hafta)}. haftadan geçerli` : ''}</div>${metin}</div>`;
}

function gorunumHareketler() {
  const liste = Object.values(S.hareketler).sort((a, b) => (b.zaman?.toMillis?.() ?? 0) - (a.zaman?.toMillis?.() ?? 0));
  return `<div class="kart"><h2>Hareketler</h2>${liste.length ? liste.map(hareketSatiri).join('') : '<p class="soluk">Henüz hareket yok.</p>'}</div>`;
}

// ---------- Kurallar ----------
function gorunumKurallar() {
  const a = S.ayar;
  const tbl = LIG.kural === 'tbl';
  const hakSayisi = n => (n >= 99 ? 'istediği kadar' : `${n} kez`);
  return `<div class="kart kurallar"><h2>Kurallar</h2>
    ${tbl ? `<h3>Kadrolar</h3><ul>
      <li>${a.takimSayisi} takım; her takımda ${a.asSayisi} As + ${a.yedekSayisi} Yedek. Kadrolar sezon başında belirlendi (draft yok).</li>
      <li>As'ta en fazla ${kural().enFazlaYabanci} yabancı oyuncu olabilir (TÜRKİYE ve KKTC oyuncuları Türk sayılır); Yedekte sınır yok.</li>
    </ul>` : `<h3>Draft</h3><ul>
      <li>${a.takimSayisi} takım. Draft sırası sistemde kurayla belirlenir ve herkese canlı gösterilir.</li>
      <li>Yılan draft: 1. tur 1→${a.takimSayisi}, 2. tur ${a.takimSayisi}→1, 3. tur yine 1→${a.takimSayisi}…</li>
      <li>Her takım ${kadroBoyu()} oyuncu seçer: ${a.asSayisi} As + ${a.yedekSayisi} Yedek (toplam ${a.takimSayisi * kadroBoyu()} seçim). Bir oyuncu sadece bir takımda olabilir.</li>
      <li>Her seçim için süre ${sureMetni(a.secimSuresi)}. Süre dolarsa, takımın istek listesindeki ilk müsait (ve kadro kuralına uyan) oyuncu seçilir; listede uygun oyuncu yoksa müsait oyuncular içinden bu sezonun ${LIG.kisa} maç başı VP ortalamasına göre en iyi 15 oyuncudan rastgele biri otomatik seçilir. İstek listesini sadece takımın kendisi görür.</li>
      <li>Aynı ${LIG.kisa} takımından istediğin kadar oyuncu seçebilirsin.</li>
      <li>Her oyuncu <b>Ön</b> (uzun/forvet) ya da <b>Arka</b> (oyun kurucu/şutör) sahadır. As beşi <b>${kural().asOn} Ön + ${kural().asArka} Arka</b>; ${kural().yedek} Yedeğin mevkisi serbest.</li>
      <li>As'ta en az 1, Yedekte en az 1 Türk oyuncu (TÜRKİYE / KKTC) olmalı.</li>
      <li>Draftta bu kuralı imkânsız hale getirecek oyuncu seçilemez (ör. 4 yabancı Ön alan takım 5. seçimde yabancı Ön alamaz); site o an seçebileceğin oyuncu türlerini gösterir. Otomatik seçim de buna uyar.</li>
      <li>Seçilen oyuncular kadroya mevkilerine göre yerleşir; draft bitince sezon başlayana kadar dizilişini serbestçe değiştirebilirsin.</li>
    </ul>`}
    <h3>Sezon</h3><ul>
      ${LIG.takas ? `<li>Takaslar sınırsız; iki taraf da kabul etmeli ve yönetici onaylamalı (oyuncular yönetici onaylayınca yer değiştirir). İki taraftan aynı sayıda (1–3) oyuncu verilir; gelen oyuncu gidenin yerine (As/Yedek) geçer.</li>` : ''}
      ${ortakHak() ? `<li>Her takımın sezon boyunca <b>${a.faHakki} transfer hakkı</b> var. Serbest oyuncu almak (hiçbir takımda olmayan oyuncu; alırken bir oyuncunu bırakırsın) ve As–Yedek değişikliği yapmak 1'er hak kullanır.</li>`
        : `<li>Her takım sezon boyunca en fazla ${a.faHakki} serbest oyuncu (hiçbir takımda olmayan oyuncu) alabilir; alırken bir oyuncusunu bırakır.</li>`}
      <li>Bir takımın bıraktığı ya da ${LIG.kisa}'ye yeni katılan (lisansı yeni çıkan) oyuncuyu ${beklemeSaati()} saat kimse alamaz. Bu sürede takımlar oyuncuya talep eder (kazanırsa bırakacağı oyuncuyu seçer); süre bitince talip olanlar arasında kura çekilir ve kazanan takımın ${hakAdi()}ndan 1 düşer. Talep eden olmazsa oyuncu boştakilere düşer ve isteyen alır. Kimlerin talip olduğu oyuncunun sayfasında görünür.</li>
      ${LIG.otomatikYerine ? `<li>Fantezi takımındaki yabancı bir oyuncunun lisansı düşer ve ${LIG.kisa} takımı yerine yabancı bir oyuncu alırsa, yeni oyuncu fantezi takımına <b>otomatik</b> geçer; ${hakAdi()}ndan düşmez. Yerine kimse gelmezse takım boştakilerden oyuncu almak zorundadır (bu da hakkından düşmez).</li>` : ''}
      <li>Yöneticiler gerektiğinde her takımın kadrosunu düzenleyebilir${LIG.hareketler ? "; yaptıkları değişiklikler Hareketler'de görünür" : ''}.</li>
      ${ortakHak() ? '' : `<li>Her takım sezon boyunca ${hakSayisi(a.degisiklikHakki)} As–Yedek değişikliği yapabilir.</li>`}
      <li>${tbl ? `As–Yedek değişikliği${LIG.takas ? ', takas' : ''} ve serbest oyuncu sonrasında da As'ta en fazla ${kural().enFazlaYabanci} yabancı kalmalı.`
        : `Diziliş, As–Yedek değişikliği, takas ve serbest oyuncu sonrasında da As ${kural().asOn} Ön + ${kural().asArka} Arka olmalı ve As'ta en az 1, Yedekte en az 1 Türk kalmalı. Bu yüzden As'taki bir oyuncunun yerine ancak aynı mevkiden oyuncu gelebilir.`}</li>
      <li>Kadro değişiklikleri, ilk maçı henüz başlamamış ilk haftadan itibaren geçerlidir (hafta ortasında yapılan değişiklik bir sonraki haftadan sayılır). Geçmiş haftalar değişmez.</li>
    </ul>
    <h3>Puanlama</h3><ul>
      <li>Puanlama ${a.baslangicHaftasi}. ${LIG.kisa} haftasından itibaren başlar${LIG.fanteziHaftasi ? ` (fantezi ligin 1. haftası)` : ''}.</li>
      <li>Takımın haftalık puanı, ${a.asSayisi} As oyuncunun o hafta ${LIG.kisa}'de aldığı verimlilik (VP) puanlarının toplamıdır.</li>
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
    davetleriYenile();
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
  const uyeler = S.uyeler ?? [];
  adimlar.push(`<div class="kart"><h3>Takımlar ve davetler</h3>
    <p class="kucuk soluk">Her menajere kendi davet linkini gönder. Menajer linki açıp Google hesabıyla girince hesabı takıma bağlanır ve
    link bir daha kullanılamaz. Sonra her cihazdan aynı Google hesabıyla girer. Bir takımı iki kişi yönetecekse "Ortak menajer davet et".
    Yanlış hesap bağlandıysa "Çıkar" de.</p>
    <div class="tablo-kap"><table><thead><tr><th>#</th><th>Takım adı</th><th>Menajer</th><th>Hesap / davet</th></tr></thead><tbody>
    ${takimlar().map(t => {
      const kod = S.kodlar?.[t.id];
      const link = kod ? girisLinki(kod) : '';
      const mesaj = `${S.ayar.ad} davetin (${t.ad}): linki aç ve Google hesabınla giriş yap. Link tek kullanımlık, kimseyle paylaşma: ${link}`;
      const bagli = uyeler.filter(u => u.takim === t.id);
      // Bağlı hesaplar (ortak menajerler dahil) ve varsa kullanılmamış davet linki
      const hesaplar = bagli.map(u => `<span class="kucuk">✓ ${esc(u.email)}</span> <button class="btn kucuk tehlike" data-is="uye-cikar" data-id="${u.uid}">Çıkar</button>`).join('<br>');
      const davet = kod ? `<span class="rozet">${bagli.length ? 'ortak menajer daveti bekliyor' : 'davet bekliyor'}</span>
          <button class="btn kucuk" data-is="kopyala" data-metin="${esc(link)}">Linki kopyala</button>
          <a class="btn kucuk" href="https://wa.me/?text=${encodeURIComponent(mesaj)}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn kucuk tehlike" data-is="kod-yenile" data-id="${t.id}" title="Eski link iptal olur">${bagli.length ? 'Daveti iptal et' : 'Yeni link'}</button>`
        : !S.uyeler ? '<span class="soluk kucuk">yükleniyor…</span>'
          : bagli.length ? `<button class="btn kucuk" data-is="ortak-davet" data-id="${t.id}">+ Ortak menajer davet et</button>`
            : `<button class="btn kucuk" data-is="kod-yenile" data-id="${t.id}">Davet linki oluştur</button>`;
      const hesap = [hesaplar, davet].filter(Boolean).join('<br>');
      return `<tr><td>${t.no}</td>
        <td><input type="text" id="ta-${t.id}" value="${esc(t.ad)}" maxlength="30" style="width:150px"></td>
        <td><input type="text" id="tm-${t.id}" value="${esc(t.menajer)}" maxlength="40" style="width:130px"></td>
        <td><div class="satir"><button class="btn kucuk" data-is="takim-kaydet" data-id="${t.id}">Kaydet</button> ${hesap}</div></td></tr>`;
    }).join('')}</tbody></table></div>
    ${takimEkleCikar()}
    <p class="kucuk soluk" style="margin-bottom:0">Yönetici hesapları: ${uyeler.filter(u => u.takim === 'admin').map(u => esc(u.email)).join(', ') || '-'}
    (ve yönetici yetkisi verilen takımların menajerleri)</p>
    ${S.ben === 'admin' ? `<div class="uyari-kutu"><b>Sen de oynuyor musun?</b> Kendi takımını seç: Google hesabın o takıma bağlanır, takım yönetici takımı olur
      ve yöneticiliğin devam eder. (Kendi takımının davet linkini açman da aynı işi yapar.)
      <div class="satir" style="margin-top:8px"><select id="kendi-takim"><option value="">Takımını seç</option>
      ${takimlar().filter(t => S.kodlar?.[t.id]).map(t => `<option value="${t.id}">${esc(t.ad)}</option>`).join('')}</select>
      <button class="btn ana" data-is="kendi-takim">Takıma katıl</button></div></div>` : ''}</div>`);
  const yoneticiler = S.ayar.yoneticiTakimlar ?? [];
  adimlar.push(`<div class="kart"><h3>Yöneticiler</h3>
    <p class="kucuk soluk">Yönetici yetkisi verdiğin takımların menajerleri kendi takımlarıyla oynarken yönetici işlerini de yapar
    (draftı duraklatma, seçimi geri alma ya da değiştirme, mevkiler, bildirimler…). Yönetici linki her zaman yöneticidir.</p>
    <div>${takimlar().map(t => `<button class="secim-chip ${yoneticiler.includes(t.id) ? 'secili' : ''}" data-is="yonetici-takim" data-id="${t.id}">${yoneticiler.includes(t.id) ? '✓ ' : ''}${esc(t.ad)}${t.menajer ? ` <span class="kucuk">(${esc(t.menajer)})</span>` : ''}</button>`).join('')}</div></div>`);
  adimlar.push(`<div class="kart"><h3>Ayarlar</h3><div class="form-izgara">
      <label for="ay-sure">Seçim süresi (saniye)</label><input type="number" id="ay-sure" min="5" max="600" value="${S.ayar.secimSuresi}">
      <label for="ay-hafta">Puanlamanın başlayacağı ${LIG.kisa} haftası</label><input type="number" id="ay-hafta" min="1" max="40" value="${S.ayar.baslangicHaftasi}" ${a === 'sezon' ? 'disabled' : ''}>
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
    ${a === 'sezon' ? `<p class="kucuk soluk">Kadro değişikliklerinin geçerli olabileceği en erken hafta: ${hf(d.aktifHafta)}. hafta (bu sayfa açılınca otomatik güncellenir).</p>` : ''}</div>`);
  if (LIG.draft) adimlar.push(`<div class="kart"><h3>Tehlikeli bölge</h3>
    <p class="kucuk">Deneme draftından sonra gerçek drafta temiz başlamak için: bütün seçimleri, kadroları, takasları ve hareketleri siler. Takım adları, menajerler ve giriş linkleri kalır.</p>
    <button class="btn tehlike" data-is="sifirla">Draftı sıfırla</button></div>`);
  return adimlar.join('');
}

// ---------- Yönetici: mevkiler ----------
function gorunumMevkiler() {
  const ara = aramaNorm(S.ui.ara);
  const tum = [...S.rehber.values()].filter(o => o.aktif);
  const belirsizMi = o => !S.mevkiler[o.id] && !S.mevkiListesi[o.id] && !o.mevkiTahmini;
  const bslTakimlar = [...new Set(tum.map(o => o.takim))].sort((a, b) => a.localeCompare(b, 'tr'));
  const liste = tum.filter(o => (!S.ui.bslTakim || o.takim === S.ui.bslTakim)
    && (!S.ui.belirsiz || belirsizMi(o)) && (!S.ui.mevkiFiltre || mevki(o.id) === S.ui.mevkiFiltre)
    && (!ara || aramaNorm(o.ad).includes(ara)));
  const sayim = m => tum.filter(o => mevki(o.id) === m).length;
  return `<div class="kart"><h2>Mevkiler</h2>
    <p><button class="btn ${mevkilerHazir() ? '' : 'ana'}" data-is="mevki-goster">${mevkilerHazir() ? 'Mevkileri herkesten gizle' : 'Mevkiler kesinleşti, herkese göster'}</button>
    <span class="soluk kucuk">${mevkilerHazir() ? 'Oyuncuların yanında Ön/Arka herkese görünüyor.' : 'Şu an oyuncuların yanında Ön/Arka yazmıyor (sadece bu sayfada görünür).'}</span></p>
    <p><b>Ön</b> = uzun/forvet, <b>Arka</b> = oyun kurucu/şutör. Mevkiler yöneticinin listesinden geliyor; listede olmayan yeni
    oyuncular istatistikten tahmin edilir (ribaund ve blok asistin iki katından fazlaysa Ön), hiç oynamamışsa <b>?</b> ile işaretlenir.
    Buradaki her tıklama hemen kaydedilir.</p>
    <p class="kucuk soluk">Ön: ${sayim('on')} · Arka: ${sayim('arka')} · Belirsiz: ${tum.filter(belirsizMi).length}.
    ${['draft', 'duraklatildi', 'kadro', 'sezon'].includes(asama()) ? 'Draft başladıktan sonra bir takımdaki oyuncunun mevkisini değiştirmek o takımın dizilişini kurala aykırı yapabilir.' : ''}</p>
    <div class="satir" style="margin-bottom:10px">
      <input type="search" id="ara" data-ui="ara" placeholder="Oyuncu ara" value="${esc(S.ui.ara)}" class="ara">
      <select id="f-takim" data-ui="bslTakim"><option value="">Bütün ${LIG.kisa} takımları</option>${bslTakimlar.map(t => `<option ${t === S.ui.bslTakim ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select id="f-mevki" data-ui="mevkiFiltre"><option value="">Ön + Arka</option><option value="on" ${S.ui.mevkiFiltre === 'on' ? 'selected' : ''}>Sadece Ön</option><option value="arka" ${S.ui.mevkiFiltre === 'arka' ? 'selected' : ''}>Sadece Arka</option></select>
      <label class="secenek"><input type="checkbox" id="f-belirsiz" data-ui="belirsiz" ${S.ui.belirsiz ? 'checked' : ''}> Sadece belirsizler</label>
    </div>
    <div class="tablo-kap"><table>
      <thead><tr><th>Oyuncu</th><th>${LIG.kisa} takımı</th><th class="sayi">Maç</th><th class="sayi">VP</th><th class="sayi">Rib.</th><th class="sayi">Ast.</th><th>Mevki</th></tr></thead>
      <tbody>${liste.map(o => {
        const m = mevki(o.id);
        return `<tr><td>${esc(o.ad)}${trRozeti(o)}${belirsizMi(o) ? ' <span class="rozet uyari" title="Tahmin yok">?</span>' : ''}</td>
          <td class="kucuk">${bslTakimHucre(o)}</td><td class="sayi">${o.mac}</td><td class="sayi">${sayi(o.vpOrt)}</td>
          <td class="sayi">${sayi(o.ribOrt)}</td><td class="sayi">${sayi(o.astOrt)}</td>
          <td><div class="satir" style="flex-wrap:nowrap">${['on', 'arka'].map(x => `<button class="btn kucuk ${m === x ? 'ana' : ''}" data-is="mevki" data-id="${o.id}" data-mevki="${x}">${C.MEVKI_ADI[x]}</button>`).join('')}</div></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="bos">Oyuncu bulunamadı</td></tr>'}</tbody>
    </table></div></div>`;
}

// ---------- Maçlar: BSL fikstürü ve sonuçlar (TBL fantezi ligindeki Maçlar sekmesi gibi) ----------
// BÜYÜK HARFLİ takım adlarını okunur yapar: "FENERBAHÇE TARFİN" -> "Fenerbahçe Tarfin" (kısaltmalar kalır)
const baslik = ad => String(ad ?? '').split(' ').map(k =>
  k !== k.toLocaleUpperCase('tr') || k.replace(/\./g, '').length <= 3 ? k
    : k.toLocaleLowerCase('tr').replace(/(^|[.\-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr'))
).join(' ').replace(/Technıc/u, 'Technic');
const gunBasligi = iso => new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
// TBF saati henüz belli olmayan maçları 00:00 olarak verir
const saatYazisi = iso => (iso.endsWith('T00:00:00') ? 'Saat belli değil'
  : new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
const kazananSinifi = (m, taraf) => {
  if (m.durum !== 'bitti') return '';
  const ev = Number(m.evSkor);
  const dep = Number(m.depSkor);
  return (taraf === 'ev' ? ev > dep : dep > ev) ? 'kazanan' : '';
};

// Varsayılan hafta: TBF'nin güncel haftası; o hafta bittiyse sıradaki
function maclarVarsayilanHafta() {
  const hs = S.index?.haftalar ?? [];
  const g = S.index?.guncelHafta ?? hs[0]?.hafta;
  return hs.find(h => h.hafta === g)?.bitti && hs.some(h => h.hafta === g + 1) ? g + 1 : g;
}

async function maclariYukle(n) {
  if (S.maclarYukleniyor === n) return;
  S.maclarYukleniyor = n;
  try {
    S.maclar[n] = await VERI.maclar(n);
  } catch {
    S.maclar[n] = [];
  }
  S.maclarYukleniyor = null;
  ciz();
}

async function haftaVerisiYukle(n) {
  if (S.haftalar[n] || S.haftaYukleniyor === n) return;
  S.haftaYukleniyor = n;
  try { S.haftalar[n] = await VERI.hafta(n); } catch { /* oynanmamış hafta */ }
  S.haftaYukleniyor = null;
  ciz();
}

function haftaCipiniOrtala() {
  const aktif = document.querySelector('.kaydir-ortala .aktif');
  if (!aktif) return;
  const satir = aktif.parentElement;
  satir.scrollLeft = aktif.offsetLeft - satir.offsetLeft - (satir.clientWidth - aktif.offsetWidth) / 2;
}

function gorunumMaclar(istenen) {
  const haftalar = (S.index?.haftalar ?? []).map(h => h.hafta);
  if (!haftalar.length) return '<p class="bos">Fikstür henüz yok.</p>';
  const n = haftalar.includes(istenen) ? istenen : maclarVarsayilanHafta();
  const cipler = `<div class="secenekler hafta-cipleri kaydir-ortala">${haftalar.map(k =>
    `<a class="secenek ${k === n ? 'aktif' : ''}" href="#/maclar/${k}">${k}. hafta</a>`).join('')}</div>`;
  const maclar = S.maclar[n];
  if (!maclar) {
    maclariYukle(n);
    return `${cipler}<p class="bos">Yükleniyor…</p>`;
  }
  const i = haftalar.indexOf(n);
  const bitti = maclar.filter(m => m.durum === 'bitti').length;
  const durum = !maclar.length ? 'Fikstür belli değil' : bitti === maclar.length ? 'Tamamlandı'
    : `${bitti}/${maclar.length} maç bitti${maclar.some(m => m.durum === 'canli') ? ' · canlı' : ''}`;
  const fantezi = S.ayar && n >= S.ayar.baslangicHaftasi ? 'Fantezi puanına sayılır · ' : '';
  const ok = (hedef, isaret) => (hedef === undefined ? `<span class="pasif">${isaret}</span>`
    : `<a href="#/maclar/${hedef}" aria-label="${hedef}. hafta">${isaret}</a>`);
  const secici = `<div class="hafta-secici">${ok(haftalar[i - 1], '‹')}
    <div class="baslik"><strong>${LIG.kisa} ${n}. Hafta</strong><small>${fantezi}${durum}</small></div>${ok(haftalar[i + 1], '›')}</div>`;
  const gunler = new Map();
  for (const m of maclar) gunler.set(m.tarih.slice(0, 10), [...(gunler.get(m.tarih.slice(0, 10)) ?? []), m]);
  const bloklar = [...gunler.values()].map(g => `<section class="kart mac-gun"><h2>${gunBasligi(g[0].tarih)}</h2>
    ${g.map(m => macSatiri(m, n)).join('')}</section>`).join('');
  // Bay geçen takımlar
  const oynayan = new Set(maclar.flatMap(m => [m.evId, m.depId]));
  const takimAdlari = new Map([...S.rehber.values()].filter(o => o.aktif).map(o => [o.takimId, o.takim]));
  const bay = [...takimAdlari].filter(([id]) => !oynayan.has(id)).map(([, ad]) => baslik(ad));
  return `${cipler}${secici}${bloklar || '<p class="bos">Bu haftanın maçları henüz belli değil.</p>'}
    ${maclar.length && bay.length ? `<p class="soluk kucuk">Bay: ${bay.map(esc).join(', ')}</p>` : ''}
    <p class="soluk kucuk">Maça dokununca kutu skor ve o maçtaki fantezi oyuncuları açılır. ${S.tblVerisi && eksikHaftalar().includes(n)
      ? `Canlı skorlar TBL Fantezi Ligi'nin güncellemesinden, dakikada bir yenilenir (son: ${S.tblVerisi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}).`
      : `Son güncelleme: ${S.index?.guncelleme ? tarih(S.index.guncelleme) : '-'}.`}</p>`;
}

// Canlı maçın son güncellemedeki durumu: "3. Çeyrek · 04:12", "Devre arası", "Maç sonu · kesinleşiyor"
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

function macSatiri(m, n) {
  const orta = m.durum === 'oynanmadi'
    ? `<strong>${saatYazisi(m.tarih)}</strong>${m.yayin ? `<small>${esc(m.yayin)}</small>` : ''}`
    : `<strong>${m.evSkor ?? 0} - ${m.depSkor ?? 0}</strong><small>${m.durum === 'canli' ? `<span class="canli-yazi">${canliYazisi(m)}</span>` : 'MS'}</small>`;
  return `<a class="mac" href="#/mac/${m.id}">
      <span class="${kazananSinifi(m, 'ev')}">${esc(baslik(m.ev))}</span>
      <span class="skor">${orta}</span>
      <span class="dep ${kazananSinifi(m, 'dep')}">${esc(baslik(m.dep))}</span>
    </a>`;
}

// ---------- Maç sayfası: kutu skor (TBL Fantezi Ligi'nin yayınladığı BSL kutu skorları) ----------
function macBul(id) {
  for (const [n, liste] of Object.entries(S.maclar)) {
    const m = (liste ?? []).find(x => x.id === id);
    if (m) return { m, n: Number(n) };
  }
  for (const h of Object.values(S.haftalar)) {
    const m = h.maclar?.find(x => x.id === id);
    if (m) return { m, n: h.hafta };
  }
  return null;
}

async function kutuYukle(id) {
  if (S.kutular[id] !== undefined || S.kutuYukleniyor.has(id)) return;
  S.kutuYukleniyor.add(id);
  try {
    S.kutular[id] = tblMacOnbellek.get(id) ?? await jsonGetir(`${TBL_VERI}/mac/${id}.json`);
  } catch {
    S.kutular[id] = null; // maç oynanmadıysa kutu skor yoktur
  }
  S.kutuYukleniyor.delete(id);
  ciz();
}

const atis = ([b, d] = [0, 0]) => `${b}/${d}`;
const KUTU_SUTUNLARI = [
  ['Dk', o => o.sure], ['Sy', o => o.sayi], ['2S', o => atis(o.iki)], ['3S', o => atis(o.uc)], ['SA', o => atis(o.sa)],
  ['Rb', o => o.rib], ['As', o => o.ast], ['Tç', o => o.tc], ['Bl', o => o.blk], ['Tk', o => o.tk], ['F', o => o.faul], ['VP', o => o.vp],
];

function kutuSkorTablosu(t) {
  const sahip = sahipler();
  const benim = benimTakimim();
  const oyuncular = t.oyuncular ?? [];
  const satirlar = oyuncular.map(o => {
    const tid = sahip.get(String(o.id));
    const ad = S.rehber.has(String(o.id)) ? `<a href="#/oyuncu/${o.id}" class="oyuncu-link">${esc(o.ad)}</a>` : esc(o.ad);
    return `<tr class="${sureSn(o.sure) > 0 ? '' : 'oynamadi'} ${tid && tid === benim ? 'ben' : ''}">
      <th>${o.ilk5 ? `<b>${ad}</b>` : ad}${tid ? `<div class="fantezi-sahip">${esc(takimAdi(tid))}</div>` : ''}</th>
      ${KUTU_SUTUNLARI.map(([b, f]) => `<td class="${b === 'VP' ? 'vp' : ''}">${esc(f(o))}</td>`).join('')}</tr>`;
  }).join('');
  const topla = alan => oyuncular.reduce((x, o) => x + (Number(o[alan]) || 0), 0);
  const toplaAtis = alan => atis([0, 1].map(i => oyuncular.reduce((x, o) => x + (o[alan]?.[i] ?? 0), 0)));
  return `<div class="kart"><h3>${esc(baslik(t.ad))}</h3><div class="tablo-kap"><table class="kutu">
    <thead><tr><th>Oyuncu</th>${KUTU_SUTUNLARI.map(([b]) => `<td>${b}</td>`).join('')}</tr></thead>
    <tbody>${satirlar}<tr class="toplam"><th>Toplam</th><td></td><td>${topla('sayi')}</td><td>${toplaAtis('iki')}</td><td>${toplaAtis('uc')}</td>
      <td>${toplaAtis('sa')}</td><td>${topla('rib')}</td><td>${topla('ast')}</td><td>${topla('tc')}</td><td>${topla('blk')}</td>
      <td>${topla('tk')}</td><td>${topla('faul')}</td><td class="vp">${topla('vp')}</td></tr></tbody></table></div></div>`;
}

function ceyrekTablosu(k) {
  const n = Math.max(k.ev.ceyrekler?.length ?? 0, k.dep.ceyrekler?.length ?? 0);
  if (!n) return '';
  const hucre = i => (i < 4 ? `Ç${i + 1}` : `U${i - 3}`);
  const satir = t => `<tr><th>${esc(baslik(t.ad))}</th>${Array.from({ length: n }, (_, i) => `<td>${t.ceyrekler?.[i] ?? '–'}</td>`).join('')}<td><b>${t.skor ?? 0}</b></td></tr>`;
  return `<div class="kart"><div class="tablo-kap"><table class="kutu ceyrek">
    <thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<td>${hucre(i)}</td>`).join('')}<td>T</td></tr></thead>
    <tbody>${satir(k.ev)}${satir(k.dep)}</tbody></table></div></div>`;
}

function gorunumMac(id) {
  const bulunan = macBul(id);
  const kutu = S.kutular[id];
  if (kutu === undefined) kutuYukle(id);
  if (!bulunan && !kutu) return kutu === null ? '<p class="bos">Maç bulunamadı.</p>' : '<p class="bos">Yükleniyor…</p>';
  // Canlı maçta liste (dakikada bir yenilenir) kutu skordan daha güncel olabilir
  const m = bulunan?.m ?? { id, tarih: kutu.tarih, durum: kutu.durum, ev: kutu.ev.ad, dep: kutu.dep.ad, evSkor: kutu.evSkor, depSkor: kutu.depSkor, salon: kutu.salon, yayin: kutu.yayin };
  const n = bulunan?.n ?? kutu.hafta;
  const durum = m.durum === 'canli' ? `<span class="canli-yazi">Canlı · ${canliYazisi(m)}</span>` : m.durum === 'bitti' ? 'Maç sonu' : saatYazisi(m.tarih);
  const bilgi = [gunBasligi(m.tarih), m.salon, m.yayin].filter(Boolean).map(esc).join(' · ');
  const ust = `<p style="margin:0 0 10px"><a href="#/maclar/${n}">‹ ${n}. hafta maçları</a></p>
    <div class="kart mac-baslik"><div class="mac-takimlar">
      <strong class="${kazananSinifi(m, 'ev')}">${esc(baslik(m.ev))}</strong>
      <div class="mac-skor"><strong>${m.durum === 'oynanmadi' ? '–' : `${m.evSkor ?? 0} - ${m.depSkor ?? 0}`}</strong><small>${durum}</small></div>
      <strong class="${kazananSinifi(m, 'dep')}">${esc(baslik(m.dep))}</strong></div>
      <p class="soluk kucuk" style="margin:8px 0 0;text-align:center">${LIG.kisa} ${n}. hafta · ${bilgi}</p></div>`;
  const fantezi = bulunan && m.evId ? `<div class="kart"><h3>Bu maçtaki fantezi oyuncuları</h3>${macDetayi(m, n)}</div>` : '';
  if (!kutu) {
    return `${ust}${kutu === null || m.durum === 'oynanmadi' ? `<p class="bos">${m.durum === 'oynanmadi' ? 'Maç henüz oynanmadı.' : 'Kutu skor henüz gelmedi.'}</p>` : '<p class="bos">Kutu skor yükleniyor…</p>'}${fantezi}`;
  }
  return `${ust}${ceyrekTablosu(kutu)}${kutuSkorTablosu(kutu.ev)}${kutuSkorTablosu(kutu.dep)}
    <p class="soluk kucuk">Kalın: ilk 5 · 2S/3S/SA: isabet/deneme · Oyuncunun altında fantezi takımı yazar${benimTakimim() ? ', senin oyuncuların vurgulu' : ''}.</p>`;
}

// Maçtaki fantezi oyuncuları: iki BSL takımında olup bir fantezi takımında olan oyuncular ve o haftaki VP'leri
function macDetayi(m, n) {
  const sahip = sahipler();
  const hafta = S.haftalar[n];
  if (!hafta && m.durum !== 'oynanmadi') haftaVerisiYukle(n);
  const taraf = id => [...sahip].map(([pid, tid]) => ({ o: oyuncu(pid), pid, tid }))
    .filter(x => (hafta?.oyuncular[x.pid]?.takimId ?? x.o.takimId) === id)
    .sort((a, b) => (hafta?.oyuncular[b.pid]?.vp ?? b.o.vpOrt) - (hafta?.oyuncular[a.pid]?.vp ?? a.o.vpOrt));
  const satir = x => {
    const st = hafta?.oyuncular[x.pid];
    const deger = m.durum === 'oynanmadi' ? `<span class="soluk">ort. ${sayi(x.o.vpOrt)}</span>`
      : st ? `<b>${sayi(st.vp)}</b> <span class="soluk">VP · ${Math.floor(st.saniye / 60)} dk</span>` : '<span class="soluk">oynamadı</span>';
    return `<li><span>${oyuncuAdi(x.pid, { takim: false })} <span class="soluk kucuk">${esc(takimAdi(x.tid))}</span></span><span class="kucuk">${deger}</span></li>`;
  };
  const blok = (ad, id) => {
    const liste = taraf(id);
    return `<div><b class="kucuk">${esc(baslik(ad))}</b>${liste.length ? `<ul class="oyuncu-liste">${liste.map(satir).join('')}</ul>`
      : '<p class="soluk kucuk" style="margin:4px 0">Fantezi takımlarında oyuncusu yok.</p>'}</div>`;
  };
  return `<div class="iki-kolon">${blok(m.ev, m.evId)}${blok(m.dep, m.depId)}</div>`;
}

// ---------- Zorunlu değişiklik bandı (lisansı düşen oyuncusu olan takıma her sayfada) ----------
function zorunluBandi() {
  const tid = benimTakimim();
  const liste = tid ? zorunluBekleyen(tid) : [];
  if (!liste.length) return '';
  return `<div class="kart hata-kutu zorunlu-bant"><b>⚠️ Zorunlu değişiklik:</b> ${liste.map(p => `<b>${esc(oyuncu(p).ad)}</b>`).join(', ')}
    artık TBF'de lisanslı görünmüyor (ligden ayrıldı). Yerine boştakilerden kurallara uygun bir oyuncu almalısın; bu değişiklik
    ${hakAdi()}ndan düşmez. Değişikliği yapana kadar ${LIG.takas ? 'takas ve ' : ''}As–Yedek değişikliği yapamazsın.
    <a class="btn kucuk ana" href="#/bostakiler">Oyuncu seç</a></div>`;
}

// Kura çekilmeden takım sayısı serbestçe değişir; havuz bütün seçimlere yetmeli
function takimEkleCikar() {
  const n = takimlar().length;
  const secim = n * kadroBoyu();
  const yetersiz = S.havuz.length && S.havuz.length < secim;
  const son = takimlar().at(-1);
  const sonBagli = son && (S.uyeler ?? []).some(u => u.takim === son.id);
  if (asama() !== 'kurulum') return `<p class="kucuk soluk">${n} takım · draftta ${secim} seçim.</p>`;
  return `<div class="satir" style="margin:10px 0">
      <span><b>${n} takım</b> · draftta ${secim} seçim</span>
      <button class="btn kucuk" data-is="takim-ekle">+ Takım ekle</button>
      <button class="btn kucuk tehlike" data-is="takim-cikar" ${n <= 2 || sonBagli ? `disabled title="${sonBagli ? 'Son takıma hesap bağlı; önce Çıkar ile hesabı ayır' : 'En az 2 takım'}"` : ''}>Son takımı çıkar</button>
    </div>
    ${yetersiz ? `<div class="hata-kutu kucuk">Havuzda ${S.havuz.length} oyuncu var, ${n} takımın draftı için ${secim} oyuncu gerekiyor. Takım sayısını azalt.</div>` : ''}`;
}

// ---------- Yönetici: bildirimler ----------
function gorunumBildirimler() {
  const mevkisiz = mevkisizler().sort((a, b) => b.vpOrt - a.vpOrt);
  const dusen = lisansiDusenler();
  const goruldu = bildirimGoruldu();
  const sahip = sahipler();
  const turAdi = { yeni: '🆕 Lige katıldı', transfer: '🔁 Takım değiştirdi', ayrildi: '👋 Ligden ayrıldı' };
  const onay = onayBekleyen();
  return `${onay.length ? `<div class="kart sira-sende"><h2>Onayını bekleyen takaslar <span class="soluk">(${onay.length})</span></h2>
      ${onay.map(t => teklifKarti(t, `<button class="btn ana" data-is="takas-onayla" data-id="${t.id}" ${teklifGecerliligi(t) ? 'disabled' : ''}>Onayla</button><button class="btn tehlike" data-is="takas-reddet" data-id="${t.id}">Reddet</button>`)).join('')}</div>` : ''}
    ${!LIG.mevki ? '' : `<div class="kart"><h2>Mevkisi belirlenecek oyuncular <span class="soluk">(${mevkisiz.length})</span></h2>
      <p class="kucuk soluk">Listende olmayan oyuncular (genelde yeni transferler). Mevkisini seçince bu listeden çıkar.</p>
      ${mevkisiz.length ? `<div class="tablo-kap"><table>${mevkisiz.map(o => `<tr>
        <td><a href="#/oyuncu/${o.id}" class="oyuncu-link">${esc(o.ad)}</a>${trRozeti(o)}<div class="kucuk soluk">${o.mac} maç · VP ${sayi(o.vpOrt)} · rib ${sayi(o.ribOrt)} · ast ${sayi(o.astOrt)}${o.mevkiTahmini ? ` · tahmin: ${C.MEVKI_ADI[o.mevkiTahmini]}` : ''}</div></td>
        <td class="kucuk">${bslTakimHucre(o)}</td>
        <td><div class="satir" style="flex-wrap:nowrap">${['on', 'arka'].map(x => `<button class="btn kucuk" data-is="mevki" data-id="${o.id}" data-mevki="${x}">${C.MEVKI_ADI[x]}</button>`).join('')}</div></td></tr>`).join('')}</table></div>`
        : '<p class="soluk" style="margin:0">Hepsi tamam ✓</p>'}</div>`}
    <div class="kart"><h2>Lisansı düşen oyuncular <span class="soluk">(${dusen.length})</span></h2>
      <p class="kucuk soluk">Bir fantezi takımında olup TBF'de artık lisanslı görünmeyenler. O takımın menajeri yerine boştakilerden oyuncu almak zorunda (hakkından düşmez).</p>
      ${dusen.length ? dusen.map(({ pid, tid }) => `<div class="teklif"><b>${esc(oyuncu(pid).ad)}</b> <span class="soluk kucuk">${esc(oyuncu(pid).takim)}</span>
        → <b>${esc(takimAdi(tid))}</b> <span class="rozet ${S.lisanssiz.includes(pid) ? 'uyari' : ''}">${asama() === 'sezon' ? 'değişiklik bekleniyor' : 'sezon başlayınca'}</span></div>`).join('')
        : '<p class="soluk" style="margin:0">Yok ✓</p>'}</div>
    <div class="kart"><div class="baslik-satir"><h2>${LIG.kisa} kadro hareketleri</h2>
      ${gorulmemisHareketler().length ? '<button class="btn kucuk" data-is="bildirim-gordum">Hepsini gördüm</button>' : ''}</div>
      <p class="kucuk soluk">TBF kadrolarındaki değişiklikler (veriler her güncellendiğinde, son 90 gün).</p>
      ${S.bslHareketleri.length ? S.bslHareketleri.map(h => `<div class="teklif ${h.zaman > goruldu ? 'yeni-bildirim' : ''}">
        <div class="kucuk soluk">${tarih(h.zaman)} · ${turAdi[h.tur] ?? h.tur}</div>
        <b>${esc(h.ad)}</b> ${h.tur === 'transfer' ? `${esc(h.eskiTakim)} → ${esc(h.yeniTakim)}` : esc(h.yeniTakim ?? h.eskiTakim ?? '')}
        ${sahip.has(h.id) ? ` · <span class="rozet">${esc(takimAdi(sahip.get(h.id)))}</span>` : ''}</div>`).join('')
        : '<p class="soluk" style="margin:0">Henüz hareket yok.</p>'}</div>`;
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

GENIS.addEventListener('change', () => ciz());
TELEFON.addEventListener('change', () => ciz());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.ui.panel) { S.ui.panel = null; ciz(); } });

window.addEventListener('hashchange', () => {
  S.ui.faAl = S.ui.faAlSonraki ?? null;
  S.ui.faAlSonraki = null;
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
    case 'google-giris':
      await googleIleGir();
      return;
    case 'cikis':
      if (!confirm('Çıkış yapılsın mı? Tekrar girmek için Google ile giriş yapman yeterli.')) return;
      await signOut(auth);
      location.reload();
      return;
    case 'kendi-takim': {
      const tid = deger('kendi-takim');
      if (!tid) return bildir('Takımını seç.', true);
      if (!confirm(`${takimAdi(tid)} senin takımın olacak ve yönetici yetkisi alacak. Onaylıyor musun?`)) return;
      await yoneticiTakimaKatil(tid, S.kodlar[tid]);
      await davetleriYenile();
      return;
    }
    case 'uye-cikar': {
      if (id === S.uid) return bildir('Kendi hesabını çıkaramazsın; bunu diğer yönetici yapabilir.', true);
      const u = S.uyeler.find(x => x.uid === id);
      const kalan = S.uyeler.filter(x => x.takim === u.takim && x.uid !== id).length;
      if (!confirm(`${u.email} hesabı ${takimAdi(u.takim)} takımından çıkarılsın mı?${kalan ? '' : ' Takım için yeni davet linki oluşturulur.'}`)) return;
      await D.uyeyiCikar(id);
      // Takımda başka menajer kalmadıysa takım için yeni davet linki
      if (u.takim !== 'admin' && !kalan && !S.kodlar[u.takim]) S.kodlar[u.takim] = await D.koduYenile(u.takim, null);
      await davetleriYenile();
      return bildir(kalan ? 'Hesap takımdan çıkarıldı' : 'Hesap takımdan çıkarıldı, yeni davet linki oluştu');
    }
    case 'ortak-davet': {
      const yonetimde = (S.ayar.yoneticiTakimlar ?? []).includes(id);
      if (!confirm(`${takimAdi(id)} için ortak menajer davet linki oluşturulsun mu? Linki açıp Google ile giren kişi bu takımı da yönetir${yonetimde ? ' ve takım yönetici takımı olduğu için yönetici olur' : ''}.`)) return;
      S.kodlar[id] = await D.koduYenile(id, null);
      ciz();
      return bildir('Ortak menajer davet linki oluşturuldu; Linki kopyala ya da WhatsApp ile gönder');
    }
    case 'ligi-kur': {
      const hafta = Number(deger('k-hafta'));
      const sure = Number(deger('k-sure'));
      const takimSayisi = Number(deger('k-takim'));
      if (!hafta || !sure) return bildir('Hafta ve süreyi gir.', true);
      if (!Number.isInteger(takimSayisi) || takimSayisi < 2 || takimSayisi > 99) return bildir('Takım sayısı 2 ile 99 arasında olmalı.', true);
      el.disabled = true;
      const sonuc = await D.ligiKur(S.uid, hesapBilgisi(), {
        ad: deger('k-ad') || LIG.ad, secimSuresi: sure, baslangicHaftasi: hafta, takimSayisi,
      });
      S.ben = 'admin';
      S.kurulumSonucu = sonuc;
      return ciz();
    }
    case 'tbl-kur': {
      el.disabled = true;
      el.textContent = 'Kadrolar aktarılıyor…';
      const kaynak = S.tblKaynak ?? await tblKaynakKadrolar();
      hakKutulariniOku(kaynak);
      const sonuc = await D.ligiKur(S.uid, hesapBilgisi(), {
        ad: deger('k-ad') || LIG.ad, secimSuresi: 90, baslangicHaftasi: kaynak.baslangic, takimSayisi: kaynak.takimlar.length,
      });
      await D.kadrolariIceAktar(kaynak.takimlar, { aktifHafta: C.etkinHafta(S.index, kaynak.baslangic), ayar: tblAktarimAyari() });
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
      if (zorunluBekleyen(benimTakimim()).length) return bildir('Önce lisansı düşen oyuncunun yerine boştakilerden oyuncu almalısın.', true);
      const asP = deger('dg-as') || S.ui.secAs;
      const yP = deger('dg-yedek') || S.ui.secYedek;
      if (!asP || !yP) return bildir('Bir As ve bir Yedek seç.', true);
      const kk = S.kadrolar[benimTakimim()];
      const turkHata = dizilisSorunu({ as: kk.as.map(p => (p === asP ? yP : p)), yedek: kk.yedek.map(p => (p === yP ? asP : p)) });
      if (turkHata) return bildir(`Bu değişiklik olmaz: ${turkHata}.`, true);
      const h = etkinHafta();
      if (!confirm(`${oyuncu(asP).ad} yedeğe, ${oyuncu(yP).ad} As'a geçecek (${hf(h)}. haftadan itibaren). ${ortakHak() ? 'Transfer hakkından 1 kullanılacak. ' : S.ayar.degisiklikHakki >= 99 ? '' : 'As–Yedek değişikliği hakkından 1 kullanılacak. '}Onaylıyor musun?`)) return;
      await D.asYedekDegistir(benimTakimim(), asP, yP, h);
      S.ui.secAs = null;
      S.ui.secYedek = null;
      return bildir('Değişiklik yapıldı');
    }
    case 'takim-adi': {
      const ad = deger('takim-adi');
      if (ad.length < 2) return bildir('Takım adı en az 2 harf olmalı.', true);
      await D.takimAdiKaydet(benimTakimim(), ad);
      return bildir('Takım adı kaydedildi');
    }
    case 'fa-al': S.ui.faAl = id; S.ui.panel = null; ciz(); window.scrollTo(0, 0); return;
    case 'sec-as': S.ui.secAs = S.ui.secAs === id ? null : id; return ciz();
    case 'sec-yedek': S.ui.secYedek = S.ui.secYedek === id ? null : id; return ciz();
    case 'sec-temizle': S.ui.secAs = null; S.ui.secYedek = null; return ciz();
    // Bilgisayarda oyuncu sağdan açılan panelde, telefonda kendi sayfasında
    case 'oyuncu-panel':
      if (!genis()) { location.hash = `#/oyuncu/${id}`; return; }
      S.ui.panel = id;
      return ciz();
    case 'panel-kapat': S.ui.panel = null; return ciz();
    case 'fa-sirala': S.ui.faSirala = id; return ciz();
    case 'paylas': return siralamayiPaylas(el, el.dataset.tur, Number(id), el.dataset.islem === 'indir');
    case 'talep-git': S.ui.faAlSonraki = id; location.hash = '#/bostakiler'; return;
    case 'talep-onayla': {
      const birak = deger('fa-birak');
      if (!birak) return bildir('Kazanırsan bırakacağın oyuncuyu seç.', true);
      const tid = benimTakimim();
      const al = oyuncu(S.ui.faAl);
      const sorun = dizilisSorunu(C.yerineKoy(S.kadrolar[tid], birak, al.id));
      if (sorun) return bildir(`Bu değişiklik olmaz: ${sorun}.`, true);
      await D.talepEt(al.id, tid, birak);
      S.ui.faAl = null;
      ciz();
      return bildir(`${al.ad} için talebin alındı. Süre bitince kura çekilecek.`);
    }
    case 'talep-geri': {
      if (!confirm(`${oyuncu(id).ad} için talebini geri çekiyor musun?`)) return;
      await D.talepGeriCek(id, benimTakimim());
      return bildir('Talebin geri çekildi');
    }
    case 'talep-kura': {
      const sonuc = await D.talepKurasi(id, etkinHafta(), dizilisSorunu);
      return bildir(sonuc ? `Kura çekildi: ${oyuncu(id).ad} → ${takimAdi(sonuc.kazanan)}` : `Uygun talep yoktu, ${oyuncu(id).ad} boştakilere düştü`);
    }
    case 'fa-vazgec': S.ui.faAl = null; return ciz();
    case 'fa-onayla': {
      const birak = deger('fa-birak');
      if (!birak) return bildir('Bırakacağın oyuncuyu seç.', true);
      const tid = benimTakimim();
      const al = oyuncu(S.ui.faAl);
      if (talepDurumu(al.id)) return bildir(`${al.ad} talep süresinde; doğrudan alınamaz.`, true);
      const yeni = C.yerineKoy(S.kadrolar[tid], birak, al.id);
      const turkHata = dizilisSorunu(yeni);
      if (turkHata) return bildir(`Bu değişiklik olmaz: ${turkHata}.`, true);
      const h = etkinHafta();
      const zorunlu = zorunluBekleyen(tid).includes(birak);
      if (!confirm(`${al.ad} alınacak, ${oyuncu(birak).ad} bırakılacak (${hf(h)}. haftadan itibaren). ${zorunlu ? 'Lisansı düşen oyuncunun yerine alındığı için hakkından düşmez.' : `${HakAdi()}ndan 1 kullanılacak.`} Onaylıyor musun?`)) return;
      await D.serbestAl(tid, birak, al, h, zorunlu);
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
      if (zorunluBekleyen(benimTakimim()).length) return bildir('Önce lisansı düşen oyuncunun yerine boştakilerden oyuncu almalısın.', true);
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
      if (zorunluBekleyen(benimTakimim()).length) return bildir('Önce lisansı düşen oyuncunun yerine boştakilerden oyuncu almalısın.', true);
      if (!confirm('Takası kabul ediyor musun? Yönetici onaylayınca oyuncular yer değiştirecek.')) return;
      await D.teklifKabul(id);
      return bildir('Kabul ettin, takas yönetici onayına gitti');
    }
    case 'takas-onayla': {
      const t = S.teklifler[id];
      const h = etkinHafta();
      if (!confirm(`${takimAdi(t.veren)} ⇄ ${takimAdi(t.alan)} takasını onaylıyor musun? ${hf(h)}. haftadan itibaren geçerli olacak.`)) return;
      await D.takasOnayla(id, h, (v, a) => takasSorunu(t.veren, t.alan, v, a));
      return bildir('Takas onaylandı, oyuncular yer değiştirdi');
    }
    case 'takas-reddet': {
      if (!confirm('Takası reddediyor musun? Oyuncular yer değiştirmeyecek.')) return;
      await D.takasReddet(id);
      return bildir('Takas reddedildi');
    }
    case 'istek': {
      const liste = S.istek.includes(id) ? S.istek.filter(p => p !== id) : [...S.istek, id];
      if (liste.length > 150) return bildir('İstek listesine en fazla 150 oyuncu eklenebilir.', true);
      return istekKaydet(liste);
    }
    case 'istek-tasi': {
      const liste = [...S.istek];
      const i = liste.indexOf(id);
      const j = i + Number(el.dataset.yon);
      if (i < 0 || j < 0 || j >= liste.length) return;
      [liste[i], liste[j]] = [liste[j], liste[i]];
      return istekKaydet(liste);
    }
    case 'istek-temizle': {
      const sahip = sahipler();
      return istekKaydet(S.istek.filter(p => !sahip.has(p)));
    }
    case 'bekleme-kaldir': {
      if (!confirm(`${oyuncu(id).ad} için bekleme kaldırılsın mı? Varsa talepler de silinir ve oyuncu hemen alınabilir olur.`)) return;
      await D.beklemeyiKaldir(id);
      return bildir('Bekleme kaldırıldı');
    }
    case 'y-degistir': {
      const tid = rota()[1];
      const birak = S.ui.yBirak;
      const al = oyuncu(id);
      const yeni = C.yerineKoy(S.kadrolar[tid], birak, al.id);
      const sorun = dizilisSorunu(yeni);
      const h = asama() === 'sezon' ? etkinHafta() : null;
      if (!confirm(`${takimAdi(tid)}: ${oyuncu(birak).ad} çıkacak, ${al.ad} girecek${h ? ` (${hf(h)}. haftadan itibaren)` : ''}.${sorun ? `\n\nDikkat, kadro kural dışı olacak: ${sorun}.` : ''} Onaylıyor musun?`)) return;
      await D.yoneticiOyuncuDegistir(tid, birak, al, h);
      S.ui.yBirak = '';
      S.ui.yAra = '';
      S.ui.yDizilis = null;
      return bildir(`${al.ad} ${takimAdi(tid)} kadrosuna girdi`);
    }
    case 'y-dizilis': {
      const s = S.ui.yDizilis;
      if (s.has(id)) s.delete(id); else if (s.size < S.ayar.asSayisi) s.add(id);
      return ciz();
    }
    case 'y-dizilis-kaydet': {
      const tid = rota()[1];
      const k = S.kadrolar[tid];
      const tum = [...k.as, ...k.yedek];
      const as = tum.filter(p => S.ui.yDizilis.has(p));
      const yedek = tum.filter(p => !S.ui.yDizilis.has(p));
      const sorun = dizilisSorunu({ as, yedek });
      const h = asama() === 'sezon' ? etkinHafta() : null;
      if (!confirm(`${takimAdi(tid)} dizilişi kaydedilsin mi${h ? ` (${hf(h)}. haftadan itibaren)` : ''}?${sorun ? `\n\nDikkat, kural dışı: ${sorun}.` : ''}`)) return;
      await D.yoneticiDizilis(tid, as, yedek, h);
      S.ui.yDizilis = null;
      return bildir('Diziliş kaydedildi');
    }
    case 'y-haklar': {
      const tid = rota()[1];
      const fa = Number(deger('y-fa'));
      const degisiklik = Number(deger('y-dg'));
      if (![fa, degisiklik].every(n => Number.isInteger(n) && n >= 0)) return bildir('Geçerli bir sayı gir.', true);
      await D.yoneticiHaklar(tid, { fa, degisiklik });
      return bildir('Haklar güncellendi');
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
    case 'saat-ekle': {
      const kalan = S.durum.asama === 'duraklatildi' ? (S.durum.kalanSure ?? 0) : Math.max(0, (kalanMs() ?? 0) / 1000);
      await D.saatEkle(S.durum, kalan, 30);
      return bildir('Süreye 30 saniye eklendi');
    }
    case 'saat-bastan':
      await D.devamEt(S.ayar.secimSuresi);
      return bildir('Saat baştan başladı');
    case 'duzelt':
      S.ui.duzeltNo = Number(id);
      S.ui.duzeltAra = '';
      ciz();
      window.scrollTo(0, 0);
      return;
    case 'duzelt-vazgec': S.ui.duzeltNo = null; return ciz();
    case 'duzelt-onay': {
      const s = S.secimler[S.ui.duzeltNo];
      const o = S.havuzMap.get(id);
      if (!confirm(`${S.ui.duzeltNo + 1}. seçim: ${s.ad} yerine ${o.ad} (${takimAdi(s.takim)}). Onaylıyor musun?`)) return;
      await D.secimDuzelt({ n: S.ui.duzeltNo, oyuncu: o, dizilis: draftDizilisi });
      S.ui.duzeltNo = null;
      return bildir(`Seçim değiştirildi: ${o.ad}`);
    }
    case 'yonetici-takim': {
      const liste = S.ayar.yoneticiTakimlar ?? [];
      const ver = !liste.includes(id);
      if (!confirm(`${takimAdi(id)} menajerine yönetici yetkisi ${ver ? 'verilsin' : 'alınsın'} mı?`)) return;
      await D.yoneticiTakimlariniKaydet(ver ? [...liste, id] : liste.filter(t => t !== id));
      return bildir(ver ? 'Yönetici yetkisi verildi' : 'Yönetici yetkisi alındı');
    }
    case 'bildirim-gordum':
      try { localStorage.setItem(GORULDU_ANAHTARI, S.bslHareketleri[0]?.zaman ?? new Date().toISOString()); } catch { /* tarayıcı izin vermiyorsa */ }
      return ciz();
    case 'mevki-goster':
      await D.ayarlariKaydet({ mevkilerHazir: !mevkilerHazir() });
      return bildir(mevkilerHazir() ? 'Mevkiler gizlendi' : 'Mevkiler herkese gösteriliyor');
    case 'mevki':
      await D.mevkiKaydet(id, el.dataset.mevki, S.havuzMap.has(id));
      if (S.havuzMap.has(id)) S.havuzMap.get(id).mevki = el.dataset.mevki;
      return;
    case 'takim-kaydet':
      await D.takimiKaydet(id, { ad: deger(`ta-${id}`) || S.takimlar[id].ad, menajer: deger(`tm-${id}`) });
      return bildir('Kaydedildi');
    case 'kod-yenile': {
      if (S.kodlar[id] && !confirm(`${takimAdi(id)} için yeni davet linki oluşturulsun mu? Eski link artık çalışmaz.`)) return;
      S.kodlar[id] = await D.koduYenile(id, S.kodlar[id]);
      ciz();
      return bildir('Yeni davet linki oluşturuldu');
    }
    case 'ayar-kaydet': {
      const secimSuresi = Number(deger('ay-sure'));
      const baslangicHaftasi = Number(deger('ay-hafta'));
      if (secimSuresi < 5) return bildir('Süre en az 5 saniye olmalı.', true);
      await D.ayarlariKaydet({ secimSuresi, ...(asama() === 'sezon' ? {} : { baslangicHaftasi }) });
      if (asama() !== 'sezon' && S.durum.aktifHafta !== baslangicHaftasi) await D.aktifHaftayiKaydet(baslangicHaftasi);
      return bildir('Ayarlar kaydedildi');
    }
    case 'takim-ekle': {
      await D.takimEkle();
      await davetleriYenile();
      return bildir('Takım eklendi, davet linki hazır');
    }
    case 'takim-cikar': {
      const son = takimlar().at(-1);
      if (!confirm(`${son.ad} ligden çıkarılsın mı? Davet linki de iptal olur.`)) return;
      await D.sonTakimiCikar(S.kodlar?.[son.id]);
      await davetleriYenile();
      return bildir(`${son.ad} çıkarıldı`);
    }
    case 'kura':
      if (S.havuz.length < takimlar().length * kadroBoyu()) return bildir(`Havuzdaki oyuncu sayısı ${takimlar().length} takımın draftına yetmiyor.`, true);
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

async function istekKaydet(liste) {
  const onceki = S.istek;
  S.istek = liste;
  ciz();
  try {
    await D.istekListesiKaydet(benimTakimim(), liste);
  } catch (e) {
    S.istek = onceki;
    throw e;
  }
}

let istekDinleyici = null;
function istekListesiniDinle() {
  const tid = benimTakimim();
  if (istekDinleyici || !tid) return;
  istekDinleyici = D.istekListesiDinle(tid, l => { S.istek = l; ciz(); }, e => console.warn('İstek listesi okunamadı', e));
}

// Yönetici ekranı: talep süresi biten oyuncular için talip olanlar arasında kura çeker (iki yönetici ekranı aynı anda
// denerse işlem sayesinde sadece biri çeker)
const kuraDenenen = new Map();
function talepKuralariniCek() {
  if (!yonetici() || asama() !== 'sezon' || !S.beklemeYuklendi) return;
  for (const [pid, b] of Object.entries(S.bekleme)) {
    if (!Object.keys(b.talepler ?? {}).length || D.beklemeKalan(b) > 0 || Date.now() - (kuraDenenen.get(pid) ?? 0) < 60000) continue;
    kuraDenenen.set(pid, Date.now());
    D.talepKurasi(pid, etkinHafta(), dizilisSorunu)
      .then(sonuc => bildir(sonuc ? `Talep kurası: ${oyuncu(pid).ad} → ${takimAdi(sonuc.kazanan)} (${sonuc.talipler.length} talip)` : `${oyuncu(pid).ad}: uygun talep yoktu, boştakilere düştü`))
      .catch(e => { if (!(e instanceof D.Hata)) console.warn('Talep kurası çekilemedi', e); });
  }
}
setInterval(talepKuralariniCek, 30000);

// Yönetici ekranı: lige yeni katılan oyuncular için beklemeyi Firestore'a yazar (kurallar buna bakar)
function beklemeleriEsitle() {
  if (!yonetici() || asama() !== 'sezon' || !S.beklemeYuklendi) return;
  const sahip = sahipler();
  const otomatik = new Set(otomatikYerineAdaylari().map(e => e.giren));
  const eksik = {};
  for (const h of S.bslHareketleri) {
    if (otomatik.has(h.id)) continue;
    const z = new Date(h.zaman);
    if (h.tur !== 'yeni' || sahip.has(h.id) || S.beklemeYazilan.has(h.id) || z.getTime() + D.BEKLEME_MS <= simdi()) continue;
    if ((S.bekleme[h.id]?.zaman?.toMillis?.() ?? 0) >= z.getTime()) continue;
    eksik[h.id] = z;
    S.beklemeYazilan.add(h.id);
  }
  if (Object.keys(eksik).length) D.beklemeleriBaslat(eksik).catch(hataGoster);
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
    try { S.haftalar[h.hafta] = await VERI.hafta(h.hafta); } catch { /* henüz yazılmamış hafta */ }
  }));
  S.haftalarYuklendi = true;
  S.haftalarYukleniyor = false;
  ciz();
  canliYenile(); // dosyadaki haftalar TBL'nin daha yeni canlı verisinin üstüne yazılmasın
}

function veriGeldi(ad, v) {
  if (ad !== 'durum') {
    S[ad] = v;
    if (ad === 'ayar') S.hazir = !!(S.ayar && S.durum);
    if (ad === 'ayar') D.beklemeSaatiniAyarla(S.ayar?.beklemeSaat);
    if (ad === 'ayar' && asama() === 'sezon' && !S.haftalarYuklendi) haftalariYukle();
    lisanssizlariEsitle();
    otomatikYerineCalistir(); // aday yoksa hemen döner
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
  if (a === 'kadro' && yonetici() && !S.havuzYuklendi) havuzuYukleIstemci(true); // seçim düzeltme için
  if (a === 'sezon' && !S.haftalarYuklendi) haftalariYukle();
  if (a === 'kurulum' && onceki && onceki.asama !== 'kurulum') S.secimler = {};
  if (a !== 'kadro') S.ui.dizilis = null;
  if (DRAFT_ASAMALARI.includes(a)) istekListesiniDinle();
  lisanssizlariEsitle();
  otomatikYerineCalistir();
  beklemeleriEsitle();
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

// Yönetici ekranı: takımlarda olup lisansı düşen oyuncuların listesini Firestore'a yazar; ilgili takım
// zorunlu değişikliği bu listeyle yapar (kurallar serbest oyuncu hakkından düşmemesine bu listeyle izin verir)
function lisanssizlariEsitle() {
  if (!yonetici() || asama() !== 'sezon' || !S.rehber.size || !Object.keys(S.kadrolar).length) return;
  const liste = lisansiDusenler().map(x => x.pid).sort();
  const yazi = JSON.stringify(liste);
  if (yazi === JSON.stringify([...S.lisanssiz].sort()) || yazi === S.lisanssizYazilan) return;
  S.lisanssizYazilan = yazi;
  D.lisanssizlariKaydet(liste).catch(hataGoster);
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
    // Süresi dolan takımın istek listesi (süre dolunca okunabilir): ilk müsait ve kurala uyan oyuncu
    const istenen = istekSiradaki(tid, await D.istekListesiGetir(tid));
    const adaylar = C.otomatikAdaylar(S.havuz, new Set(sahipler().keys()), izinliTipler(tid));
    if (!istenen && !adaylar.length) throw new D.Hata('Otomatik seçim için uygun oyuncu yok.');
    await D.secimYap({ takim: tid, oyuncu: istenen ?? C.rastgele(adaylar), otomatik: true, beklenenNo: n, dizilis: draftDizilisi });
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
setInterval(() => { if (S.uid && !S.ligYok) D.saatFarki(S.uid).then(f => { S.saatFarki = f; D.saatFarkiniAyarla(f); }).catch(() => {}); }, 5 * 60 * 1000);

// ---------- Canlı maçlar: TBL Fantezi Ligi'nin yayınladığı BSL verisinden ----------
// TBL Fantezi Ligi'nin telefondaki güncellemesi maç saatlerinde 3 dakikada bir BSL'nin canlı skorlarını ve kutu
// skorlarını (oyuncu VP'leri) yayınlıyor. Bu ve sıradaki haftanın başlamış ama bizim verimizde henüz kesinleşmemiş
// maçları oradan okunur (dakikada bir); kesin sonuçlar günde 2 bizim güncellememizle gelir.
const TBL_VERI = 'https://potaalti.github.io/tbl_fantezi_lig/data';

// ---------- Veri kaynağı ----------
// BSL: kendi data/ klasörü (bsl/veri_guncelle.py). TBL: eski TBL Fantezi Ligi sitesinin dosyaları (Termux günceller;
// puanlar onunla birebir aynı), motorun biçimine çevrilerek. TBL'nin data/ klasöründe sadece haftaların başlangıç
// saatleri ve kadro hareketleri vardır (veri/uret.py).
const takimKimligi = ad => String(ad ?? '').replace(/İ/g, 'I').replace(/ı/g, 'i').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TURK_ULKELER = new Set(['TÜRKİYE', 'KKTC']);
const macCevir = m => ({ ...m, evId: takimKimligi(m.ev), depId: takimKimligi(m.dep) });
const tblHaftaCevir = h => ({
  hafta: h.hafta, maclar: h.maclar.map(macCevir),
  oyuncular: Object.fromEntries(Object.entries(h.oyuncular).map(([id, o]) => [id, { ...o, takimId: takimKimligi(o.takim), mac: o.maclar?.length ?? 1 }])),
});
const VERI = LIG.kod !== 'tbl' ? {
  index: () => jsonGetir('data/index.json'),
  rehber: () => jsonGetir('data/oyuncular.json'),
  hafta: n => jsonGetir(`data/hafta/${n}.json`),
  maclar: async n => (await jsonGetir(`data/maclar/${n}.json`)).maclar,
  oyuncuMaclari: async pid => (await jsonGetir(`${TBL_VERI}/bsl-oyuncu/${pid}.json`)).maclar ?? [],
  hareketler: () => jsonGetir('data/bsl_hareketleri.json'),
  mevkiler: () => jsonGetir('data/mevkiler.json'),
} : {
  index: async () => {
    const [h, kaynak] = await Promise.all([jsonGetir('data/index.json'), jsonGetir(`${TBL_VERI}/hafta/index.json`).catch(() => null)]);
    return { ...h, guncelleme: kaynak?.guncelleme ?? h.guncelleme };
  },
  rehber: async () => Object.entries(await jsonGetir(`${TBL_VERI}/oyuncular.json`))
    .map(([id, o]) => ({ id, ...o, takimId: takimKimligi(o.takim), turk: TURK_ULKELER.has(o.ulke) })),
  hafta: async n => tblHaftaCevir(await jsonGetir(`${TBL_VERI}/hafta/${n}.json`)),
  maclar: async n => (await jsonGetir(`${TBL_VERI}/maclar/tbl-${n}.json`)).maclar.map(macCevir),
  oyuncuMaclari: async pid => { const d = await jsonGetir(`${TBL_VERI}/oyuncu/${pid}.json`); return Array.isArray(d) ? d : d.maclar ?? []; },
  hareketler: () => jsonGetir('data/hareketler.json'),
  mevkiler: async () => ({}),
};

// TBL: eski TBL Fantezi Ligi'nin takımları, menajerleri ve her haftanın kadrosu (kimliği olmayan oyuncu 'adsiz:<ad>')
async function tblKaynakKadrolar() {
  const [ayarlar, { haftalar }] = await Promise.all([jsonGetir(`${TBL_VERI}/ayarlar.json`), jsonGetir(`${TBL_VERI}/kadro/index.json`)]);
  const dosyalar = await Promise.all(haftalar.map(n => jsonGetir(`${TBL_VERI}/kadro/${n}.json`)));
  const pidOf = p => p.id || `adsiz:${p.ad}`;
  const takimlar = dosyalar.at(-1).map(t => ({
    ad: t.ad, menajer: t.sahibi ?? '',
    gecmis: haftalar.map((n, i) => {
      const x = dosyalar[i].find(y => y.ad === t.ad);
      return x && { hafta: n, as: x.as.map(pidOf), yedek: x.yedek.map(pidOf), tur: 'aktarim' };
    }).filter(Boolean),
  }));
  // Şimdiye kadarki kadro değişiklikleri: aynı oyuncu (kimlik düzeltmesi) sayılmaz; lisansı düşen oyuncunun yerine alınan
  // hak kullanmaz (aynı TBL takımına gelen yabancıysa otomatik kural); diğerleri serbest oyuncu hakkından 1 düşer.
  // Ortak hakta (TBL) kadroda kalıp Yedekten As'a geçen her oyuncu bir As–Yedek değişikliğidir, o da 1 hak kullanır.
  const transferler = [];
  for (let i = 1; i < haftalar.length; i++) {
    for (const t of dosyalar[i]) {
      const o = dosyalar[i - 1].find(y => y.ad === t.ad);
      if (!o) continue;
      const eski = [...o.as, ...o.yedek];
      const yeni = [...t.as, ...t.yedek];
      const cikan = eski.filter(p => !yeni.some(x => pidOf(x) === pidOf(p)));
      const giren = yeni.filter(p => !eski.some(x => pidOf(x) === pidOf(p)));
      cikan.forEach((c, j) => {
        const g = giren[j];
        if (!g || c.ad === g.ad) return;
        const rc = S.rehber.get(c.id);
        const rg = S.rehber.get(g.id);
        const lisansYok = !rc || rc.aktif === false;
        // Yabancının yerine aynı TBL takımının yabancısı: TBF verisi gecikse de (çıkan hâlâ lisanslı görünse, gelen henüz
        // listede olmasa) takımı oyuncuyu değiştirmiştir → otomatik kural, hak kullanmaz. Takım adı kadro dosyasından da okunur.
        const kulupC = c.tblTakim || rc?.takim;
        const ayniTakim = !!kulupC && kulupC === (g.tblTakim || rg?.takim) && !rc?.turk && !rg?.turk;
        transferler.push({
          hafta: haftalar[i], takim: t.ad, cikan: c.ad, giren: g.ad, hak: !lisansYok && !ayniTakim,
          neden: ayniTakim ? 'yabancının yerine takımı yabancı aldı (otomatik)' : !lisansYok ? 'serbest oyuncu' : 'lisansı düştü (zorunlu değişiklik)',
        });
      });
      if (LIG.ortakHak) {
        for (const p of t.as.filter(x => o.yedek.some(y => pidOf(y) === pidOf(x)))) {
          const inen = o.as.find(x => t.yedek.some(y => pidOf(y) === pidOf(x)));
          transferler.push({ hafta: haftalar[i], takim: t.ad, cikan: inen ? `${inen.ad} (Yedeğe)` : 'Yedek', giren: `${p.ad} (As'a)`, hak: true, neden: 'As–Yedek değişikliği' });
        }
      }
    }
  }
  for (const t of takimlar) t.fa = Math.min(2, transferler.filter(x => x.takim === t.ad && x.hak).length);
  return { baslangic: ayarlar.baslangicHaftasi, takimlar, transferler };
}

// TBL: lisansı düşen yabancının yerine aynı TBL takımına gelen yabancı (son 30 günde lige katılan ya da takıma gelen)
// fantezi takımına otomatik geçer. Takımda birden çok çıkan/gelen varsa sırayla eşleşir.
const OTOMATIK_GUN = 30;
function otomatikYerineAdaylari() {
  if (!LIG.otomatikYerine || asama() !== 'sezon') return [];
  const sahip = sahipler();
  const gelenler = new Map();
  for (const h of S.bslHareketleri) {
    if (!['yeni', 'transfer'].includes(h.tur) || simdi() - new Date(h.zaman).getTime() > OTOMATIK_GUN * 86400000) continue;
    const o = S.rehber.get(h.id);
    if (!o?.aktif || o.turk || sahip.has(h.id) || o.takim !== h.yeniTakim) continue;
    const liste = gelenler.get(o.takimId) ?? [];
    if (!liste.some(x => x.id === h.id)) liste.push({ id: h.id, zaman: h.zaman });
    gelenler.set(o.takimId, liste);
  }
  const eslesmeler = [];
  const cikanlar = new Map();
  for (const { pid, tid } of lisansiDusenler()) {
    const o = oyuncu(pid);
    if (o.turk || !o.takimId) continue;
    cikanlar.set(o.takimId, [...(cikanlar.get(o.takimId) ?? []), { pid, tid }]);
  }
  for (const [takim, cik] of cikanlar) {
    const gel = (gelenler.get(takim) ?? []).sort((a, b) => a.zaman.localeCompare(b.zaman));
    cik.forEach((c, i) => { if (gel[i]) eslesmeler.push({ ...c, giren: gel[i].id }); });
  }
  return eslesmeler;
}

let otomatikCalisiyor = false;
setInterval(() => otomatikYerineCalistir(), 60 * 1000);
async function otomatikYerineCalistir() {
  if (!yonetici() || otomatikCalisiyor) return;
  const liste = otomatikYerineAdaylari();
  if (!liste.length) return;
  otomatikCalisiyor = true;
  for (const e of liste) {
    try {
      await D.otomatikYerine(e.tid, e.pid, oyuncu(e.giren), etkinHafta());
      bildir(`${takimAdi(e.tid)}: ${oyuncu(e.pid).ad} yerine ${oyuncu(e.giren).ad} otomatik geçti`);
    } catch (err) {
      if (!(err instanceof D.Hata)) console.warn('Otomatik değişiklik yapılamadı', err);
    }
  }
  otomatikCalisiyor = false;
}
const tblMacOnbellek = new Map(); // biten maçların kutu skoru değişmez

// Saati gelmiş ama bizim verimizde henüz bitmemiş maçı olan haftalar
function eksikHaftalar() {
  const g = S.index?.guncelHafta;
  if (g == null) return [];
  const simdiMs = Date.now();
  return [g, g + 1].filter(n => (S.maclar[n] ?? []).some(m => m.durum !== 'bitti' && !m.tarih.endsWith('T00:00:00')
    && simdiMs >= new Date(m.tarih).getTime() - 10 * 60000));
}

const sureSn = sure => {
  const [dk, sn] = String(sure ?? '0:00').split(':').map(Number);
  return (dk || 0) * 60 + (sn || 0);
};

// TBL sitesindeki BSL haftası bizim hafta biçimimize: maçlar (takım kimlikleriyle) ve oyuncuların haftalık VP'si
async function tblHaftasi(n) {
  const liste = (await jsonGetir(`${TBL_VERI}/maclar/${LIG.kod}-${n}.json`)).maclar;
  const bizim = new Map((S.maclar[n] ?? []).map(m => [m.id, m]));
  const takimId = new Map([...S.rehber.values()].map(o => [o.takim, o.takimId]));
  const maclar = liste.map(m => ({
    id: m.id, tarih: m.tarih, durum: m.durum, ev: m.ev, dep: m.dep, evSkor: m.evSkor, depSkor: m.depSkor,
    salon: m.salon, yayin: m.yayin, canliDurum: m.canliDurum,
    evId: bizim.get(m.id)?.evId ?? takimId.get(m.ev), depId: bizim.get(m.id)?.depId ?? takimId.get(m.dep),
  }));
  const oyuncular = {};
  await Promise.all(maclar.filter(m => m.durum !== 'oynanmadi').map(async m => {
    let kutu = tblMacOnbellek.get(m.id);
    if (!kutu) {
      kutu = await jsonGetir(`${TBL_VERI}/mac/${m.id}.json`);
      if (m.durum === 'bitti') tblMacOnbellek.set(m.id, kutu);
    }
    S.kutular[m.id] = kutu; // maç sayfası canlı güncellensin
    for (const taraf of ['ev', 'dep']) {
      for (const o of kutu[taraf]?.oyuncular ?? []) {
        if (String(o.id).startsWith('fiba-')) continue; // TBF kimliği henüz bilinmeyen canlı oyuncu
        const x = (oyuncular[o.id] ??= { ad: o.ad, takim: m[taraf], takimId: m[`${taraf}Id`], vp: 0, saniye: 0, mac: 0 });
        x.vp += o.vp ?? 0;
        x.saniye += sureSn(o.sure);
        x.mac += 1;
      }
    }
  }));
  return { hafta: n, maclar, oyuncular };
}

async function canliYenile() {
  if (!S.index || document.hidden || S.canliYenileniyor) return;
  const haftalar = eksikHaftalar();
  if (!haftalar.length) return;
  S.canliYenileniyor = true;
  try {
    for (const n of haftalar) {
      const fantezi = S.haftalar[n] || (S.ayar && n >= S.ayar.baslangicHaftasi);
      if (LIG.kod === 'tbl') {
        // TBL: eski TBL Fantezi'nin hafta dosyası (Termux 3 dakikada bir yazar), puanlar onunla aynı kalsın
        S.maclar[n] = await VERI.maclar(n);
        if (fantezi) S.haftalar[n] = await VERI.hafta(n).catch(() => S.haftalar[n]);
        continue;
      }
      const h = await tblHaftasi(n);
      S.maclar[n] = h.maclar;
      if (fantezi) S.haftalar[n] = h;
    }
    S.tblVerisi = new Date();
    ciz();
  } catch (e) {
    console.warn('TBL Fantezi Ligi verisi okunamadı', e);
  }
  S.canliYenileniyor = false;
}
setInterval(canliYenile, 60 * 1000);

// Yönetici kendi takımına katılır: önce takıma yönetici yetkisi verilir (yöneticilik sürsün), sonra hesap takıma bağlanır
async function yoneticiTakimaKatil(tid, kod) {
  // Davet linkiyle açılışta lig ayarları henüz dinlenmeye başlamamış olabilir
  const ayar = S.ayar ?? (await F.getDoc(F.doc(fdb, 'lig', 'ayar'))).data();
  const liste = ayar.yoneticiTakimlar ?? [];
  if (!liste.includes(tid)) await D.yoneticiTakimlariniKaydet([...liste, tid]);
  await D.davetleKatil(S.uid, hesapBilgisi(), kod, tid);
  S.ben = tid;
  bildir('Takımına katıldın; yöneticiliğin devam ediyor 🎉');
  ciz();
}

// Yönetici sayfası: takımlara bağlı hesaplar ve kullanılmamış davet kodları
async function davetleriYenile() {
  try {
    [S.kodlar, S.uyeler] = await Promise.all([D.kodlariGetir(), D.uyeleriGetir()]);
    ciz();
  } catch (e) {
    hataGoster(e);
  }
}

// ---------- Başlangıç ----------
async function girisYap() {
  const u = googleMi() ? await D.uyelik(S.uid) : null;
  if (u) S.ben = u.takim;
  if (!S.davet) return;
  const tid = C.kodTakimi(S.davet);
  if (!tid || tid === 'admin') {
    davetiBirak();
    bildir('Davet linki hatalı.', true);
    return;
  }
  if (!googleMi()) return; // davet kartı Google ile girişi ister
  if (u && u.takim !== 'admin') {
    if (u.takim !== tid) bildir('Bu Google hesabı zaten başka bir takıma bağlı. Davet linkini takımın menajeri kendi Google hesabıyla açmalı.', true);
    davetiBirak();
    return;
  }
  if (u?.takim === 'admin') {
    // Yönetici kendi takımına katılıyor: yöneticiliği o takım üzerinden devam eder
    try {
      await yoneticiTakimaKatil(tid, S.davet);
    } catch (e) {
      hataGoster(e);
    }
    davetiBirak();
    return;
  }
  try {
    await D.davetleKatil(S.uid, hesapBilgisi(), S.davet, tid);
    S.ben = tid;
    bildir('Takımına katıldın 🎉');
  } catch (e) {
    console.warn(e);
    bildir('Bu davet linki kullanılmış ya da iptal edilmiş. Yöneticiden yeni davet iste.', true);
  }
  davetiBirak();
}

async function basla() {
  if (!YEREL && String(firebaseConfig.apiKey).startsWith('BURAYA')) {
    S.hataMesaji = 'Firebase ayarları girilmemiş: <code>site/config.js</code> dosyasını KURULUM.md\'deki gibi doldurun.';
    return ciz();
  }
  try {
    // Google ile girmiş kullanıcı tarayıcıda kayıtlıdır; yoksa izleyici olarak anonim girilir
    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    // Tarayıcıda kayıtlı kullanıcı geçersizse (silinmişse) yeniden anonim gir
    try {
      await auth.currentUser.getIdToken(true);
    } catch (e) {
      // Bağlantı yoksa oturum korunur (çevrim dışı açılış); hesap gerçekten geçersizse yeniden anonim girilir
      if (e?.code !== 'auth/network-request-failed') {
        await signOut(auth);
        await signInAnonymously(auth);
      }
    }
    S.uid = auth.currentUser.uid;
    const params = new URLSearchParams(location.search);
    const linkKodu = params.get('davet') ?? params.get('kod');
    if (linkKodu) {
      try { localStorage.setItem(DAVET_ANAHTARI, linkKodu); } catch { /* tarayıcı izin vermiyorsa sadece bu açılışta */ }
      params.delete('davet');
      params.delete('kod');
      history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    }
    try { S.davet = linkKodu ?? localStorage.getItem(DAVET_ANAHTARI); } catch { S.davet = linkKodu; }
    const [index, rehber, mevkiListesi, bslHareketleri] = await Promise.all([VERI.index(), VERI.rehber(),
      VERI.mevkiler().catch(() => ({})), VERI.hareketler().catch(() => [])]);
    S.mevkiListesi = mevkiListesi;
    S.bslHareketleri = bslHareketleri;
    S.index = index;
    S.rehber = new Map(rehber.map(o => [o.id, o]));
    // Bu ve sıradaki haftanın maçları: başlamış ama bizim verimizde bitmemiş maç varsa TBL'nin canlı verisi okunur
    Promise.all([index.guncelHafta, index.guncelHafta + 1].map(n => VERI.maclar(n)
      .then(m => { S.maclar[n] = m; }).catch(() => {}))).then(() => { ciz(); canliYenile(); });
    if (!(await D.ligVarMi())) {
      S.ligYok = true;
      S.hazir = true;
      return ciz();
    }
    await girisYap();
    D.dinle(veriGeldi, dinlemeHatasi);
    D.beklemeleriDinle(v => { S.bekleme = v; S.beklemeYuklendi = true; beklemeleriEsitle(); talepKuralariniCek(); ciz(); }, dinlemeHatasi);
    // Sunucu saati farkı arka planda ölçülür; sayfanın açılmasını bekletmesin
    D.saatFarki(S.uid).then(f => { S.saatFarki = f; D.saatFarkiniAyarla(f); }).catch(e => console.warn('Sunucu saati alınamadı', e));
  } catch (e) {
    console.error(e);
    S.hataMesaji = `Bağlantı kurulamadı: ${esc(e.message)}. ${YEREL ? 'Firebase emülatörü çalışıyor mu?' : 'Firebase ayarlarını, Google ve Anonim girişin açık olduğunu kontrol edin.'}`;
    ciz();
  }
}

basla();

// Ana ekrana eklenen uygulama gibi çalışsın: sayfa dosyaları ve veriler önbellekte (yerel denemede kapalı)
// Pota Altı App'in ortak service worker'ı (davet linkiyle doğrudan bu sayfaya gelenler için de)
if ('serviceWorker' in navigator && !YEREL) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
