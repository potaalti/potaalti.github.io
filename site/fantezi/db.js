// Firestore işlemleri. Firebase modülü dışarıdan verilir (tarayıcıda CDN'den, testlerde npm'den).
import {
  yilanSirasi, secimBilgisi, takimId, yeniKod, karistir, takasKadrolari, yerineKoy,
  kadroTablosu, varsayilanKural, tipi, bosTip,
} from './core.js';

let F, db;
const yol = (...p) => F.doc(db, ...p);
const koleksiyon = (ad) => F.collection(db, ad);
const simdi = () => F.serverTimestamp();

export function baglan(firestoreModulu, veritabani) {
  F = firestoreModulu;
  db = veritabani;
}

export class Hata extends Error {}

// ---------- Kurulum ----------

// Ligi ilk kez kurar: ayarlar, takımlar, kadrolar ve davet kodları. Kuran Google hesabı yönetici olur.
// Takım sayısı sınırsızdır; kura çekilene kadar yönetici takım ekleyip çıkarabilir.
// hesap: { email, ad } (Google hesabı). Takımların davet kodlarını döndürür.
export async function ligiKur(uid, hesap, { ad, takimSayisi = 17, menajerler = [], secimSuresi = 90, baslangicHaftasi }) {
  const kodlar = {};
  const b = F.writeBatch(db);
  b.set(yol('lig', 'ayar'), {
    ad, takimSayisi, asSayisi: 5, yedekSayisi: 2, asOn: varsayilanKural.asOn, asArka: varsayilanKural.asArka,
    secimSuresi, baslangicHaftasi, faHakki: 2, degisiklikHakki: 1, olusturuldu: simdi(),
  });
  // Draftta geçerli kadro durumları (Ön/Arka × Türk/yabancı sayıları); kurallar seçimleri bununla denetler
  b.set(yol('lig', 'kadroKurali'), { gecerli: kadroTablosu(varsayilanKural) });
  b.set(yol('lig', 'mevkiler'), { m: {} });
  b.set(yol('lig', 'lisanssiz'), { liste: [] });
  b.set(yol('lig', 'durum'), {
    asama: 'kurulum', sira: null, secimSirasi: [], secimNo: 0, toplamSecim: takimSayisi * 7,
    saatBaslangic: null, saatSure: secimSuresi, aktifHafta: baslangicHaftasi,
  });
  b.set(yol('uyeler', uid), { takim: 'admin', kod: 'kurulum', email: hesap.email, ad: hesap.ad ?? '' });
  for (let i = 0; i < takimSayisi; i++) {
    const tid = takimId(i);
    const kod = yeniKod(tid);
    kodlar[tid] = kod;
    b.set(yol('takimlar', tid), { no: i + 1, ad: `Takım ${i + 1}`, menajer: menajerler[i] || '' });
    b.set(yol('kadrolar', tid), bosKadro());
    b.set(yol('kodlar', kod), { takim: tid });
  }
  await b.commit();
  return { kodlar };
}

function bosKadro() {
  return { as: [], yedek: [], tip: bosTip(), fa: 0, degisiklik: 0, gecmis: [], sonSecim: null, sonFa: null, sonTeklif: null };
}

// Yönetici, kura çekilmeden yeni takım ekler (boş kadro ve davet linkiyle)
export async function takimEkle() {
  return F.runTransaction(db, async tx => {
    const ayar = (await tx.get(yol('lig', 'ayar'))).data();
    const d = (await tx.get(yol('lig', 'durum'))).data();
    if (d.asama !== 'kurulum') throw new Hata('Takımlar sadece kura çekilmeden önce eklenip çıkarılabilir.');
    const i = ayar.takimSayisi;
    const tid = takimId(i);
    const kod = yeniKod(tid);
    tx.set(yol('takimlar', tid), { no: i + 1, ad: `Takım ${i + 1}`, menajer: '' });
    tx.set(yol('kadrolar', tid), bosKadro());
    tx.set(yol('kodlar', kod), { takim: tid });
    tx.update(yol('lig', 'ayar'), { takimSayisi: i + 1 });
    tx.update(yol('lig', 'durum'), { toplamSecim: (i + 1) * (ayar.asSayisi + ayar.yedekSayisi) });
    return tid;
  });
}

// Yönetici, kura çekilmeden son takımı çıkarır (hesap bağlı değilse). kod: o takımın kullanılmamış davet kodu
export async function sonTakimiCikar(kod) {
  return F.runTransaction(db, async tx => {
    const ayar = (await tx.get(yol('lig', 'ayar'))).data();
    const d = (await tx.get(yol('lig', 'durum'))).data();
    if (d.asama !== 'kurulum') throw new Hata('Takımlar sadece kura çekilmeden önce eklenip çıkarılabilir.');
    const n = ayar.takimSayisi;
    if (n <= 2) throw new Hata('Ligde en az 2 takım olmalı.');
    const tid = takimId(n - 1);
    tx.delete(yol('takimlar', tid));
    tx.delete(yol('kadrolar', tid));
    if (kod) tx.delete(yol('kodlar', kod));
    tx.update(yol('lig', 'ayar'), { takimSayisi: n - 1, yoneticiTakimlar: (ayar.yoneticiTakimlar ?? []).filter(t => t !== tid) });
    tx.update(yol('lig', 'durum'), { toplamSecim: (n - 1) * (ayar.asSayisi + ayar.yedekSayisi) });
    return tid;
  });
}

// TBL: eski TBL Fantezi Ligi'nden aktarılan takımlar (ligiKur'dan sonra, yönetici olarak).
// takimlar: [{ ad, menajer, gecmis: [{ hafta, as, yedek, tur }] }] — kadro son haftanınkidir, geçmiş haftalar puanlamada aynen kullanılır.
export async function kadrolariIceAktar(takimlar, { aktifHafta, ayar }) {
  const islemler = [];
  takimlar.forEach((t, i) => {
    const tid = takimId(i);
    const son = t.gecmis.at(-1);
    islemler.push(b => b.update(yol('takimlar', tid), { ad: t.ad, menajer: t.menajer ?? '' }));
    islemler.push(b => b.update(yol('kadrolar', tid), { as: son.as, yedek: son.yedek, gecmis: t.gecmis, fa: t.fa ?? 0, degisiklik: 0 }));
    for (const pid of [...son.as, ...son.yedek]) {
      if (!pid.startsWith('adsiz:')) islemler.push(b => b.set(yol('alinan', pid), { takim: tid, aktarim: true }));
    }
  });
  islemler.push(b => b.update(yol('lig', 'ayar'), ayar));
  islemler.push(b => b.update(yol('lig', 'durum'), { asama: 'sezon', ekran: 'lig', aktifHafta }));
  await topluYaz(islemler);
}

// TBL: lisansı düşen yabancı oyuncunun yerine aynı TBL takımına gelen yabancı, fantezi takımına otomatik geçer
// (serbest oyuncu hakkından düşmez; yeni oyuncunun beklemesi ve talepleri kalkar). Yönetici ekranı yapar.
export async function otomatikYerine(tid, cikan, giren, hafta) {
  return F.runTransaction(db, async tx => {
    const ref = yol('kadrolar', tid);
    const k = (await tx.get(ref)).data();
    if ((await tx.get(yol('alinan', giren.id))).exists()) throw new Hata(`${giren.ad} başka bir takımda.`);
    if (![...k.as, ...k.yedek].includes(cikan)) throw new Hata('Kadro değişmiş.');
    const yeni = yerineKoy(k, cikan, giren.id);
    tx.update(ref, { ...yeni, gecmis: [...k.gecmis, { hafta, as: yeni.as, yedek: yeni.yedek, tur: 'otomatik' }] });
    tx.delete(yol('alinan', cikan));
    tx.set(yol('alinan', giren.id), { takim: tid, otomatik: true });
    tx.delete(yol('bekleme', giren.id));
    hareket(tx, { tur: 'otomatik', takim: tid, alinan: giren.id, birakilan: cikan, hafta });
  });
}

// Davet linkiyle katılma: Google hesabı takıma bağlanır, davet kodu aynı işlemde silinir (tek kullanımlık)
export async function davetleKatil(uid, hesap, kod, takim) {
  const b = F.writeBatch(db);
  b.set(yol('uyeler', uid), { takim, kod, email: hesap.email, ad: hesap.ad ?? '' });
  b.delete(yol('kodlar', kod));
  await b.commit();
}

// Yönetici: takımlara bağlı Google hesapları { uid, takim, email, ad }
export async function uyeleriGetir() {
  const s = await F.getDocs(koleksiyon('uyeler'));
  return s.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Yönetici: hesabı takımdan çıkarır (o kişi artık takım adına işlem yapamaz; yeni davet gönderilir)
export async function uyeyiCikar(uid) {
  await F.deleteDoc(yol('uyeler', uid));
}

export async function uyelik(uid) {
  const s = await F.getDoc(yol('uyeler', uid));
  return s.exists() ? s.data() : null;
}

// Sunucu saatiyle yerel saat arasındaki fark (ms): geri sayım herkeste aynı görünsün
export async function saatFarki(uid) {
  const once = Date.now();
  await F.setDoc(yol('saat', uid), { t: simdi() });
  const s = await F.getDoc(yol('saat', uid));
  const sonra = Date.now();
  return s.data().t.toMillis() - (once + sonra) / 2;
}

// ---------- Canlı dinleme ----------

// cb(ad, veri) her değişiklikte çağrılır. Bir oyuncunun hangi takımda olduğu kadrolardan bulunur. Dinlemeyi bırakmak için dönen fonksiyon çağrılır.
export function dinle(cb, hata) {
  const kapat = [];
  // Bağlantı kurulamadığında Firestore önce boş bir önbellek görüntüsü verebilir: "belge yok" sayılmasın
  const tekil = (ad, ref) => kapat.push(F.onSnapshot(ref, s => {
    if (!s.exists() && s.metadata.fromCache) return;
    cb(ad, s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null);
  }, hata));
  const coklu = (ad, ref) => kapat.push(F.onSnapshot(ref, s => {
    const v = {};
    s.forEach(d => { v[d.id] = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }; });
    cb(ad, v);
  }, hata));
  tekil('ayar', yol('lig', 'ayar'));
  tekil('durum', yol('lig', 'durum'));
  kapat.push(F.onSnapshot(yol('lig', 'lisanssiz'), s => cb('lisanssiz', s.data()?.liste ?? []), hata));
  kapat.push(F.onSnapshot(yol('lig', 'mevkiler'), s => cb('mevkiler', s.data()?.m ?? {}), hata));
  coklu('takimlar', koleksiyon('takimlar'));
  coklu('kadrolar', koleksiyon('kadrolar'));
  coklu('teklifler', F.query(koleksiyon('teklifler'), F.orderBy('zaman', 'desc'), F.limit(60)));
  coklu('hareketler', F.query(koleksiyon('hareketler'), F.orderBy('zaman', 'desc'), F.limit(300))); // sezonun tamamı (Transferler sayfası)
  return () => kapat.forEach(f => f());
}

// Draft seçimleri: sadece draft sırasında canlı dinlenir (Firestore okuma kotası için)
export function secimleriDinle(cb, hata) {
  return F.onSnapshot(koleksiyon('secimler'), s => {
    const v = {};
    s.forEach(d => { v[d.id] = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }; });
    cb(v);
  }, hata);
}

export async function havuzuGetir() {
  const s = await F.getDocs(koleksiyon('oyuncular'));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function ligVarMi() {
  return (await F.getDoc(yol('lig', 'ayar'))).exists();
}

// ---------- Draft ----------

// Seçim yapar (otomatik=true ise süresi dolan takım adına). Sıra bu arada değiştiyse Hata fırlatır.
// oyuncu: havuzdaki kayıt (mevki ve Türk bilgisiyle). beklenenNo: ekranda görülen seçim numarası
// (o arada başka seçim yapıldıysa işlem yapılmaz). dizilis(idler): kadronun As/Yedek yerleşimi.
export async function secimYap({ takim, oyuncu, otomatik, beklenenNo, dizilis }) {
  return F.runTransaction(db, async tx => {
    const durumRef = yol('lig', 'durum');
    const ayarRef = yol('lig', 'ayar');
    const kadroRef = yol('kadrolar', takim);
    const alinanRef = yol('alinan', oyuncu.id);
    const [dS, aS, kS, alS] = [await tx.get(durumRef), await tx.get(ayarRef), await tx.get(kadroRef), await tx.get(alinanRef)];
    const d = dS.data();
    const ayar = aS.data();
    if (d.asama !== 'draft') throw new Hata('Draft şu an devam etmiyor.');
    if (beklenenNo != null && d.secimNo !== beklenenNo) throw new Hata('Bu seçim zaten yapıldı.');
    if (d.secimSirasi[d.secimNo] !== takim) throw new Hata('Sıra bu takımda değil.');
    if (alS.exists()) throw new Hata(`${oyuncu.ad} başka bir takımda.`);
    const n = d.secimNo;
    const kadro = kS.data();
    const yeni = dizilis([...kadro.as, ...kadro.yedek, oyuncu.id]);
    const tip = tipi(oyuncu.mevki, oyuncu.turk);
    tx.set(yol('secimler', String(n)), {
      no: n, tur: secimBilgisi(n, ayar.takimSayisi).tur, takim, oyuncu: oyuncu.id, ad: oyuncu.ad,
      bslTakim: oyuncu.takim, turk: !!oyuncu.turk, mevki: oyuncu.mevki, otomatik: !!otomatik, zaman: simdi(),
    });
    tx.set(alinanRef, { takim, secim: n });
    tx.update(kadroRef, { as: yeni.as, yedek: yeni.yedek, sonSecim: n, tip: { ...kadro.tip, [tip]: kadro.tip[tip] + 1 } });
    tx.update(durumRef, {
      secimNo: n + 1, saatBaslangic: simdi(), saatSure: ayar.secimSuresi,
      asama: n + 1 === d.toplamSecim ? 'kadro' : 'draft',
    });
    return n;
  });
}

// ---------- Yönetici: draft akışı ----------

export async function kuraCek(takimIdleri) {
  const sira = karistir(takimIdleri);
  await F.updateDoc(yol('lig', 'durum'), {
    asama: 'kura', sira, secimSirasi: yilanSirasi(sira, 7), secimNo: 0, toplamSecim: sira.length * 7, kuraZamani: simdi(), ekran: 'draft',
  });
  return sira;
}

// Herkesin ana ekranı: 'draft' (kura, canlı draft) ya da 'lig' (puan durumu, takımlar, boştakiler...)
export async function ekranDegistir(ekran) {
  await F.updateDoc(yol('lig', 'durum'), { ekran });
}

export async function draftiBaslat(secimSuresi) {
  await F.updateDoc(yol('lig', 'durum'), { asama: 'draft', saatBaslangic: simdi(), saatSure: secimSuresi });
}

export async function duraklat(kalanSn) {
  await F.updateDoc(yol('lig', 'durum'), { asama: 'duraklatildi', kalanSure: Math.max(5, Math.round(kalanSn)) });
}

export async function devamEt(kalanSn) {
  await F.updateDoc(yol('lig', 'durum'), { asama: 'draft', saatBaslangic: simdi(), saatSure: kalanSn });
}

export async function sonSecimiGeriAl() {
  return F.runTransaction(db, async tx => {
    const durumRef = yol('lig', 'durum');
    const d = (await tx.get(durumRef)).data();
    const ayar = (await tx.get(yol('lig', 'ayar'))).data();
    if (d.secimNo === 0) throw new Hata('Geri alınacak seçim yok.');
    const n = d.secimNo - 1;
    const secimRef = yol('secimler', String(n));
    const s = (await tx.get(secimRef)).data();
    const kadroRef = yol('kadrolar', s.takim);
    const k = (await tx.get(kadroRef)).data();
    tx.delete(secimRef);
    tx.delete(yol('alinan', s.oyuncu));
    tx.update(kadroRef, {
      as: k.as.filter(p => p !== s.oyuncu), yedek: k.yedek.filter(p => p !== s.oyuncu),
      tip: { ...k.tip, [tipi(s.mevki, s.turk)]: k.tip[tipi(s.mevki, s.turk)] - 1 },
    });
    tx.update(durumRef, {
      secimNo: n, saatBaslangic: simdi(), saatSure: ayar.secimSuresi,
      asama: d.asama === 'duraklatildi' ? 'duraklatildi' : 'draft', kalanSure: ayar.secimSuresi,
    });
    return s;
  });
}

// Yönetici, yapılmış bir seçimi başka bir (müsait) oyuncuyla değiştirir; sıra ve saat etkilenmez.
// dizilis(idler): takımın yeni As/Yedek yerleşimi
export async function secimDuzelt({ n, oyuncu, dizilis }) {
  return F.runTransaction(db, async tx => {
    const secimRef = yol('secimler', String(n));
    const sS = await tx.get(secimRef);
    if (!sS.exists()) throw new Hata('Bu seçim bulunamadı.');
    const s = sS.data();
    const kadroRef = yol('kadrolar', s.takim);
    const k = (await tx.get(kadroRef)).data();
    if ((await tx.get(yol('alinan', oyuncu.id))).exists()) throw new Hata(`${oyuncu.ad} başka bir takımda.`);
    const yeni = dizilis([...k.as, ...k.yedek].map(p => (p === s.oyuncu ? oyuncu.id : p)));
    const eskiTip = tipi(s.mevki, s.turk);
    const yeniTip = tipi(oyuncu.mevki, oyuncu.turk);
    const tip = { ...k.tip, [eskiTip]: k.tip[eskiTip] - 1 };
    tip[yeniTip] += 1;
    tx.update(secimRef, {
      oyuncu: oyuncu.id, ad: oyuncu.ad, bslTakim: oyuncu.takim, turk: !!oyuncu.turk, mevki: oyuncu.mevki,
      duzeltildi: true, eskiOyuncu: s.oyuncu,
    });
    tx.delete(yol('alinan', s.oyuncu));
    tx.set(yol('alinan', oyuncu.id), { takim: s.takim, secim: n });
    tx.update(kadroRef, { as: yeni.as, yedek: yeni.yedek, tip });
    return s;
  });
}

// Yönetici: sürenin kalanına saniye ekler (duraklatılmışsa kalan süreye)
export async function saatEkle(d, kalanSn, ekSn) {
  if (d.asama === 'duraklatildi') await F.updateDoc(yol('lig', 'durum'), { kalanSure: Math.round(kalanSn + ekSn) });
  else await devamEt(Math.round(kalanSn + ekSn));
}

// Yönetici: takımlarda olup lisansı TBF'den düşen oyuncuların listesi (zorunlu değişiklik için)
export async function lisanssizlariKaydet(liste) {
  await F.setDoc(yol('lig', 'lisanssiz'), { liste });
}

// Yönetici yetkisi verilen takımlar (menajerleri hem oynar hem yönetir)
export async function yoneticiTakimlariniKaydet(takimlar) {
  await F.updateDoc(yol('lig', 'ayar'), { yoneticiTakimlar: takimlar });
}

// Draft havuzunu (oyuncu listesi) Firestore'a yükler: kurallar Türk oyuncu ve otomatik seçim kontrolünde kullanır
export async function havuzuYukle(havuz) {
  const eski = await F.getDocs(koleksiyon('oyuncular'));
  const yeniIdler = new Set(havuz.map(o => o.id));
  const islemler = [
    ...eski.docs.filter(d => !yeniIdler.has(d.id)).map(d => b => b.delete(d.ref)),
    ...havuz.map(o => b => b.set(yol('oyuncular', o.id), {
      ad: o.ad, takim: o.takim, takimId: o.takimId, takimKod: o.takimKod ?? '', turk: !!o.turk, vpOrt: o.vpOrt, mac: o.mac,
      sayiOrt: o.sayiOrt ?? 0, sira: o.sira, mevki: o.mevki, tipSira: o.tipSira,
    })),
  ];
  await topluYaz(islemler);
}

async function topluYaz(islemler) {
  for (let i = 0; i < islemler.length; i += 400) {
    const b = F.writeBatch(db);
    islemler.slice(i, i + 400).forEach(f => f(b));
    await b.commit();
  }
}

// Havuz yüklenirken bütün oyuncuların mevkisi de lig/mevkiler'e yazılır (tahmin + yöneticinin düzeltmeleri)
export async function mevkileriYaz(m) {
  await F.setDoc(yol('lig', 'mevkiler'), { m });
}

// Yönetici bir oyuncunun mevkisini değiştirir (havuzdaysa havuzdaki kaydı da)
export async function mevkiKaydet(pid, mevki, havuzda) {
  const b = F.writeBatch(db);
  b.update(yol('lig', 'mevkiler'), new F.FieldPath('m', pid), mevki);
  if (havuzda) b.update(yol('oyuncular', pid), { mevki });
  await b.commit();
}

export async function ayarlariKaydet(ayar) {
  await F.updateDoc(yol('lig', 'ayar'), ayar);
}

export async function aktifHaftayiKaydet(hafta) {
  await F.updateDoc(yol('lig', 'durum'), { aktifHafta: hafta });
}

export async function takimiKaydet(tid, veri) {
  await F.updateDoc(yol('takimlar', tid), veri);
}

// Sezonu başlatır: her takımın draft sonrası dizilişi, başlangıç haftasından geçerli ilk kadro olur
export async function sezonuBaslat(kadrolar, baslangicHaftasi) {
  const b = F.writeBatch(db);
  for (const [tid, k] of Object.entries(kadrolar)) {
    b.update(yol('kadrolar', tid), { gecmis: [{ hafta: baslangicHaftasi, as: k.as, yedek: k.yedek, tur: 'draft' }] });
  }
  b.update(yol('lig', 'durum'), { asama: 'sezon', aktifHafta: baslangicHaftasi, ekran: 'lig' });
  await b.commit();
}

// Takımın davet kodunu yeniler (eski davet linki artık çalışmaz)
export async function koduYenile(tid, eskiKod) {
  const kod = yeniKod(tid);
  const b = F.writeBatch(db);
  if (eskiKod) b.delete(yol('kodlar', eskiKod));
  b.set(yol('kodlar', kod), { takim: tid });
  await b.commit();
  return kod;
}

export async function kodlariGetir() {
  const s = await F.getDocs(koleksiyon('kodlar'));
  const kodlar = {};
  s.forEach(d => { kodlar[d.data().takim] = d.id; });
  return kodlar;
}

// Draftı sıfırlar (takımlar ve kodlar kalır): deneme draftından sonra gerçek drafta başlamak için
export async function draftiSifirla(takimIdleri, secimSuresi) {
  // Önce durum: silme yarıda kalırsa bile lig "kurulum" aşamasında olur ve sıfırlama tekrarlanabilir
  await F.updateDoc(yol('lig', 'durum'), {
    asama: 'kurulum', sira: null, secimSirasi: [], secimNo: 0, saatBaslangic: null, saatSure: secimSuresi, kalanSure: null, ekran: 'draft',
  });
  const silinecek = [];
  for (const ad of ['secimler', 'alinan', 'teklifler', 'hareketler', 'bekleme', 'istekler']) {
    (await F.getDocs(koleksiyon(ad))).forEach(d => silinecek.push(b => b.delete(d.ref)));
  }
  await topluYaz([
    ...silinecek,
    ...takimIdleri.map(tid => b => b.set(yol('kadrolar', tid), bosKadro())),
  ]);
}

// ---------- Menajer: kadro işlemleri ----------

function hareket(tx, veri) {
  tx.set(F.doc(koleksiyon('hareketler')), { ...veri, zaman: simdi() });
}

// Draft bitti, sezon başlamadı: As/Yedek dizilişini serbestçe kur
export async function dizilisKaydet(tid, as, yedek) {
  await F.updateDoc(yol('kadrolar', tid), { as, yedek });
}

// Sezonda tek As–Yedek değişikliği: asPid yedeğe, yedekPid As'a geçer
export async function asYedekDegistir(tid, asPid, yedekPid, hafta) {
  return F.runTransaction(db, async tx => {
    const ref = yol('kadrolar', tid);
    const k = (await tx.get(ref)).data();
    const ayar = (await tx.get(yol('lig', 'ayar'))).data();
    // TBL: As–Yedek değişikliği de serbest oyuncu gibi transfer hakkından düşer (ortak hak)
    if (ayar.ortakHak ? k.fa >= ayar.faHakki : k.degisiklik >= ayar.degisiklikHakki) {
      throw new Hata(ayar.ortakHak ? 'Transfer hakkın kalmadı.' : 'As–Yedek değişikliği hakkın kalmadı.');
    }
    if (!k.as.includes(asPid) || !k.yedek.includes(yedekPid)) throw new Hata('Kadro değişmiş, sayfayı yenile.');
    const as = k.as.map(p => (p === asPid ? yedekPid : p));
    const yedek = k.yedek.map(p => (p === yedekPid ? asPid : p));
    const sayac = ayar.ortakHak ? { fa: k.fa + 1 } : { degisiklik: k.degisiklik + 1 };
    tx.update(ref, { as, yedek, ...sayac, gecmis: [...k.gecmis, { hafta, as, yedek, tur: 'degisiklik' }] });
    hareket(tx, { tur: 'degisiklik', takim: tid, asaGecen: yedekPid, yedegeGecen: asPid, hafta });
  });
}

// Serbest oyuncu al: birak takımdan çıkar, al aynı yuvaya girer.
// zorunlu: bırakılan oyuncunun lisansı düştü; serbest oyuncu hakkından düşmez
export async function serbestAl(tid, birak, al, hafta, zorunlu = false) {
  return F.runTransaction(db, async tx => {
    const ref = yol('kadrolar', tid);
    const k = (await tx.get(ref)).data();
    const ayar = (await tx.get(yol('lig', 'ayar'))).data();
    const alS = await tx.get(yol('alinan', al.id));
    const bS = await tx.get(yol('bekleme', al.id));
    if (!zorunlu && k.fa >= ayar.faHakki) throw new Hata('Serbest oyuncu alma hakkın kalmadı.');
    if (alS.exists()) throw new Hata(`${al.ad} artık serbest değil.`);
    if (beklemede(bS.data())) throw new Hata(`${al.ad} bekleme süresinde, henüz alınamaz.`);
    if (![...k.as, ...k.yedek].includes(birak)) throw new Hata('Kadro değişmiş, sayfayı yenile.');
    const yeni = yerineKoy(k, birak, al.id);
    tx.update(ref, { ...yeni, fa: k.fa + (zorunlu ? 0 : 1), sonFa: al.id, gecmis: [...k.gecmis, { hafta, ...yeni, tur: zorunlu ? 'zorunlu' : 'serbest' }] });
    tx.delete(yol('alinan', birak));
    tx.set(yol('alinan', al.id), { takim: tid, fa: true });
    tx.set(yol('bekleme', birak), { zaman: simdi() });
    hareket(tx, { tur: zorunlu ? 'zorunlu' : 'serbest', takim: tid, alinan: al.id, birakilan: birak, hafta });
  });
}

// ---------- Bekleme ve talep: bırakılan ya da lige yeni gelen oyuncu belli bir süre (lig ayarı beklemeSaat, yoksa 36 saat)
// kimse tarafından alınamaz ----------
// Bu sürede takımlar talepte bulunur; süre bitince yöneticinin ekranı talip olanlar arasında kura çeker.

export let BEKLEME_MS = 36 * 3600 * 1000;
export function beklemeSaatiniAyarla(saat) { BEKLEME_MS = (saat || 36) * 3600 * 1000; }
let saatFarkiMs = 0;
export function saatFarkiniAyarla(ms) { saatFarkiMs = ms || 0; }
// b: bekleme belgesi ({ zaman }); bekleme bitmediyse kalan ms, bittiyse 0
export function beklemeKalan(b) {
  const z = b?.zaman?.toMillis?.();
  return z ? Math.max(0, z + BEKLEME_MS - (Date.now() + saatFarkiMs)) : 0;
}
const beklemede = b => beklemeKalan(b) > 0;

export function beklemeleriDinle(cb, hata) {
  return F.onSnapshot(koleksiyon('bekleme'), s => {
    const v = {};
    s.forEach(d => { v[d.id] = d.data({ serverTimestamps: 'estimate' }); });
    cb(v);
  }, hata);
}

// Yönetici: lige yeni gelen oyuncular için bekleme başlatır. zamanlar: { pid: Date (lisans/transfer zamanı) }
export async function beklemeleriBaslat(zamanlar) {
  await topluYaz(Object.entries(zamanlar).map(([pid, z]) => b => b.set(yol('bekleme', pid), { zaman: F.Timestamp.fromDate(z) })));
}

export async function beklemeZamaniniDegistir(pid, zaman) {
  await F.updateDoc(yol('bekleme', pid), { zaman: F.Timestamp.fromDate(zaman) });
}

export async function beklemeyiKaldir(pid) {
  await F.deleteDoc(yol('bekleme', pid));
}

// Takım bekleme süresindeki oyuncuya talip olur; kurayı kazanırsa birak kadrosundan çıkar
export async function talepEt(pid, tid, birak) {
  await F.updateDoc(yol('bekleme', pid), new F.FieldPath('talepler', tid), birak);
}

export async function talepGeriCek(pid, tid) {
  await F.updateDoc(yol('bekleme', pid), new F.FieldPath('talepler', tid), F.deleteField());
}

// Yönetici ekranı: talep süresi biten oyuncu için talip olanlar arasında kura çeker. Kazanan takımın bırakacağı
// oyuncu yerine geçer (serbest oyuncu hakkından 1 düşer), bırakılan oyuncunun beklemesi başlar. O an kurala
// uymayan (oyuncusu gitmiş, hakkı bitmiş, kadro kuralı bozuluyor) talepler kuraya girmez.
// kontrol(yeniKadro): kural ihlali varsa hata mesajı. Dönüş: { kazanan, talipler } ya da kimse kazanmadıysa null
export async function talepKurasi(pid, hafta, kontrol) {
  return F.runTransaction(db, async tx => {
    const bRef = yol('bekleme', pid);
    const bS = await tx.get(bRef);
    if (!bS.exists() || !Object.keys(bS.data().talepler ?? {}).length) throw new Hata('Bu oyuncu için kura yok.');
    const b = bS.data();
    if (beklemeKalan(b) > 0) throw new Hata('Talep süresi henüz bitmedi.');
    const ayar = (await tx.get(yol('lig', 'ayar'))).data();
    const alinmis = (await tx.get(yol('alinan', pid))).exists();
    const talipler = Object.keys(b.talepler);
    const kadrolar = {};
    for (const t of talipler) kadrolar[t] = (await tx.get(yol('kadrolar', t))).data();
    const gecerli = alinmis ? [] : talipler.filter(t => {
      const k = kadrolar[t];
      const birak = b.talepler[t];
      return k && [...k.as, ...k.yedek].includes(birak) && k.fa < ayar.faHakki && !kontrol?.(yerineKoy(k, birak, pid));
    });
    tx.delete(bRef);
    if (!gecerli.length) {
      if (!alinmis) hareket(tx, { tur: 'talep-yok', alinan: pid, talipler, hafta });
      return null;
    }
    const kazanan = karistir(gecerli)[0];
    const k = kadrolar[kazanan];
    const birak = b.talepler[kazanan];
    const yeni = yerineKoy(k, birak, pid);
    tx.update(yol('kadrolar', kazanan), { ...yeni, fa: k.fa + 1, sonFa: pid, gecmis: [...k.gecmis, { hafta, ...yeni, tur: 'talep' }] });
    tx.delete(yol('alinan', birak));
    tx.set(yol('alinan', pid), { takim: kazanan, fa: true, talep: true });
    tx.set(yol('bekleme', birak), { zaman: simdi() });
    hareket(tx, { tur: 'talep', takim: kazanan, alinan: pid, birakilan: birak, talipler, gecerli, hafta });
    return { kazanan, talipler };
  });
}

// ---------- Yönetici: kadrolara tam yetki (haklar, bekleme ve sıra kuralı aranmaz) ----------

function yoneticiGecmisi(k, yeni, hafta, sezonda) {
  return sezonda ? { gecmis: [...k.gecmis, { hafta, as: yeni.as, yedek: yeni.yedek, tur: 'yonetici' }] } : {};
}

// Takımdan birak çıkar, takımı olmayan al aynı yuvaya girer
export async function yoneticiOyuncuDegistir(tid, birak, al, hafta) {
  return F.runTransaction(db, async tx => {
    const ref = yol('kadrolar', tid);
    const k = (await tx.get(ref)).data();
    const d = (await tx.get(yol('lig', 'durum'))).data();
    if ((await tx.get(yol('alinan', al.id))).exists()) throw new Hata(`${al.ad} başka bir takımda.`);
    if (![...k.as, ...k.yedek].includes(birak)) throw new Hata('Kadro değişmiş, sayfayı yenile.');
    const yeni = yerineKoy(k, birak, al.id);
    tx.update(ref, { ...yeni, ...yoneticiGecmisi(k, yeni, hafta, d.asama === 'sezon') });
    tx.delete(yol('alinan', birak));
    tx.set(yol('alinan', al.id), { takim: tid, yonetici: true });
    if (d.asama === 'sezon') tx.set(yol('bekleme', birak), { zaman: simdi() });
    hareket(tx, { tur: 'yonetici', takim: tid, alinan: al.id, birakilan: birak, hafta });
  });
}

// As/Yedek dizilişini doğrudan kurar (hak kullanılmaz)
export async function yoneticiDizilis(tid, as, yedek, hafta) {
  return F.runTransaction(db, async tx => {
    const ref = yol('kadrolar', tid);
    const k = (await tx.get(ref)).data();
    const d = (await tx.get(yol('lig', 'durum'))).data();
    const once = new Set([...k.as, ...k.yedek]);
    if (once.size !== as.length + yedek.length || ![...as, ...yedek].every(p => once.has(p))) throw new Hata('Kadro değişmiş, sayfayı yenile.');
    tx.update(ref, { as, yedek, ...yoneticiGecmisi(k, { as, yedek }, hafta, d.asama === 'sezon') });
    hareket(tx, { tur: 'yonetici-dizilis', takim: tid, as, yedek, hafta });
  });
}

// Kalan hakları ayarlar: fa (kullanılan serbest oyuncu), degisiklik (kullanılan As–Yedek değişikliği)
export async function yoneticiHaklar(tid, { fa, degisiklik }) {
  await F.updateDoc(yol('kadrolar', tid), { fa, degisiklik });
}

// ---------- Draft istek listesi (gizli; süre dolunca otomatik seçim önce buradan) ----------

export async function istekListesiKaydet(tid, liste) {
  await F.setDoc(yol('istekler', tid), { liste });
}

export function istekListesiDinle(tid, cb, hata) {
  return F.onSnapshot(yol('istekler', tid), s => cb(s.data()?.liste ?? []), hata);
}

// Süresi dolan takımın listesi (sadece süre dolunca okunabilir); okunamazsa boş liste.
// İşlem (transaction) içinde okunur: sürekli açık dinleme bağlantısında kurallar süreyi bağlantının açıldığı ana göre
// değerlendirebiliyor, tek seferlik okuma o anki saate bakar.
export async function istekListesiGetir(tid) {
  try {
    return await F.runTransaction(db, async tx => (await tx.get(yol('istekler', tid))).data()?.liste ?? []);
  } catch {
    return [];
  }
}

// ---------- Takaslar ----------

export async function teklifGonder({ veren, alan, verilen, alinan, not }) {
  const veri = { veren, alan, verilen, alinan, durum: 'bekliyor', zaman: simdi() };
  if (not) veri.not = not;
  await F.addDoc(koleksiyon('teklifler'), veri);
}

export async function teklifIptal(id) {
  await F.updateDoc(yol('teklifler', id), { durum: 'iptal', yanitZamani: simdi() });
}

export async function teklifReddet(id) {
  await F.updateDoc(yol('teklifler', id), { durum: 'red', yanitZamani: simdi() });
}

// Teklifi alan takım kabul eder: takas yönetici onayına gider (oyuncular henüz yer değiştirmez)
export async function teklifKabul(id) {
  await F.updateDoc(yol('teklifler', id), { durum: 'onay', yanitZamani: simdi() });
}

export async function takasReddet(id) {
  await F.updateDoc(yol('teklifler', id), { durum: 'yonetici-red', onayZamani: simdi() });
}

// Yönetici onayı: iki takımın kadrosu ve oyuncuların takımı tek işlemde değişir.
// kontrol(verenYeni, alanYeni) kural ihlali varsa hata mesajı döndürür (ör. Türk oyuncu kalmıyor).
export async function takasOnayla(id, hafta, kontrol) {
  return F.runTransaction(db, async tx => {
    const tRef = yol('teklifler', id);
    const t = (await tx.get(tRef)).data();
    if (t.durum !== 'onay') throw new Hata('Bu takas artık onay beklemiyor.');
    const vRef = yol('kadrolar', t.veren);
    const aRef = yol('kadrolar', t.alan);
    const v = (await tx.get(vRef)).data();
    const a = (await tx.get(aRef)).data();
    const alinanlar = [];
    for (const pid of [...t.verilen, ...t.alinan]) alinanlar.push([pid, (await tx.get(yol('alinan', pid))).data()]);
    if (!t.verilen.every(p => [...v.as, ...v.yedek].includes(p)) || !t.alinan.every(p => [...a.as, ...a.yedek].includes(p))) {
      throw new Hata('Tekliftaki oyunculardan biri artık o takımda değil.');
    }
    const yeni = takasKadrolari(v, a, t.verilen, t.alinan);
    const sorun = kontrol?.(yeni.veren, yeni.alan);
    if (sorun) throw new Hata(sorun);
    tx.update(vRef, { ...yeni.veren, sonTeklif: id, gecmis: [...v.gecmis, { hafta, ...yeni.veren, tur: 'takas' }] });
    tx.update(aRef, { ...yeni.alan, sonTeklif: id, gecmis: [...a.gecmis, { hafta, ...yeni.alan, tur: 'takas' }] });
    for (const [pid, eski] of alinanlar) {
      const yeniTakim = t.verilen.includes(pid) ? t.alan : t.veren;
      tx.set(yol('alinan', pid), { ...eski, takim: yeniTakim, teklif: id });
    }
    tx.update(tRef, { durum: 'kabul', onayZamani: simdi() });
    hareket(tx, { tur: 'takas', takim: t.alan, veren: t.veren, verilen: t.verilen, alinan: t.alinan, teklif: id, hafta });
  });
}

export async function takimAdiKaydet(tid, ad) {
  await F.updateDoc(yol('takimlar', tid), { ad });
}
