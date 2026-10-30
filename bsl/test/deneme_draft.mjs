// Deneme draftı: yerel Firebase emülatöründe 17 takımlık bütün draftı ve sezon işlemlerini oynatır,
// güvenlik kurallarının hileli denemeleri reddettiğini kontrol eder. Sadece geliştirme içindir.
//   1) firebase emulators:start --only firestore,auth --project demo-bsl-draft
//   2) cd test && npm install && node deneme_draft.mjs [seçim süresi sn, varsayılan 2]
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as F from 'firebase/firestore';
import * as C from '../../site/bsl/core.js';

F.setLogLevel('silent');
const PROJE = 'demo-bsl-draft';
const SURE = Number(process.argv[2] ?? 2);
const rehber = JSON.parse(readFileSync(new URL('../../site/bsl/data/oyuncular.json', import.meta.url), 'utf-8'));
const mevkiListesi = JSON.parse(readFileSync(new URL('../../site/bsl/data/mevkiler.json', import.meta.url), 'utf-8'));
const havuz = C.havuzSirala(rehber, o => mevkiListesi[o.id] ?? o.mevkiTahmini ?? 'arka');
const havuzMap = new Map(havuz.map(o => [o.id, o]));
const tablo = C.kadroTablosu();
const dizilis = idler => C.dizilisOner(idler.map(id => havuzMap.get(id)), C.varsayilanKural);
const bilgi = id => havuzMap.get(id) ?? { mevki: 'arka', turk: false };
const dizilisHatasi = k => C.dizilisHatasi(k.as.map(bilgi), k.yedek.map(bilgi));
const bekle = ms => new Promise(r => setTimeout(r, ms));

let basarili = 0;
let hatali = 0;
function kontrol(kosul, mesaj) {
  if (kosul) { basarili++; console.log(`  ✓ ${mesaj}`); } else { hatali++; console.log(`  ✗ ${mesaj}`); }
}
async function reddedilmeli(is, mesaj) {
  try {
    await is();
    kontrol(false, `${mesaj} (KABUL EDİLDİ!)`);
  } catch (e) {
    kontrol(e?.code === 'permission-denied' || e?.name === 'Hata' || e?.constructor?.name === 'Hata', `${mesaj} reddedildi (${e.code ?? e.message})`);
  }
}

// Her kullanıcı (bot) kendi Firebase uygulaması ve kendi db.js kopyasıyla çalışır.
// Menajerler ve yönetici Google hesabıyla (emülatörün sahte Google hesapları), izleyici anonim girer.
let sayac = 0;
async function kullanici({ google = true } = {}) {
  const app = initializeApp({ projectId: PROJE, apiKey: 'demo-key' }, `bot${sayac++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = F.getFirestore(app);
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const hesap = { email: `menajer${sayac}@ornek.com`, ad: `Menajer ${sayac}` };
  if (google) {
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: `g${sayac}`, email: hesap.email, email_verified: true, name: hesap.ad })));
  } else {
    await signInAnonymously(auth);
  }
  const D = await import(`../../site/bsl/db.js?bot=${sayac}`);
  D.baglan(F, db);
  return { uid: auth.currentUser.uid, db, D };
}

async function oku(db, ...yol) {
  return (await F.getDoc(F.doc(db, ...yol))).data();
}
async function hepsi(db, ad) {
  const s = await F.getDocs(F.collection(db, ad));
  return Object.fromEntries(s.docs.map(d => [d.id, d.data()]));
}

async function main() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJE}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJE}/accounts`, { method: 'DELETE' });

  console.log('Kurulum');
  const admin = await kullanici();
  const anonimKurucu = await kullanici({ google: false });
  await reddedilmeli(() => anonimKurucu.D.ligiKur(anonimKurucu.uid, { email: null }, { ad: 'Anonim', baslangicHaftasi: 6 }), 'Google hesabı olmadan lig kurma');
  const { kodlar } = await admin.D.ligiKur(admin.uid, { email: 'menajer1@ornek.com', ad: 'Yönetici' }, { ad: 'Deneme Ligi', secimSuresi: SURE, baslangicHaftasi: 6 });
  kontrol((await admin.D.uyelik(admin.uid))?.takim === 'admin', 'Lig kuruldu, kuran Google hesabı yönetici');
  const izleyici = await kullanici();
  await reddedilmeli(() => izleyici.D.ligiKur(izleyici.uid, { email: 'menajer2@ornek.com' }, { ad: 'Korsan', baslangicHaftasi: 6 }), 'Lig kurulduktan sonra ikinci kurulum');

  // Davetler: anonim (Google'sız) katılım olmaz, davet linki tek kullanımlık
  const anonim = await kullanici({ google: false });
  await reddedilmeli(() => anonim.D.davetleKatil(anonim.uid, { email: null }, kodlar.t01, 't01'), 'Google hesabı olmadan davetle katılma');
  const takimlar = {};
  for (const [tid, kod] of Object.entries(kodlar)) {
    const k = await kullanici();
    await k.D.davetleKatil(k.uid, { email: `menajer${sayac}@ornek.com`, ad: '' }, kod, tid);
    takimlar[tid] = k;
  }
  const tidler = Object.keys(takimlar);
  kontrol(tidler.length === 17 && Object.keys(await hepsi(admin.db, 'kodlar')).length === 0, '17 menajer davetle katıldı, bütün davet kodları kullanıldı');
  await reddedilmeli(() => izleyici.D.davetleKatil(izleyici.uid, { email: 'menajer2@ornek.com' }, kodlar.t05, 't05'), 'Kullanılmış davet linkiyle ikinci kişinin katılması');
  await reddedilmeli(() => izleyici.D.davetleKatil(izleyici.uid, { email: 'menajer2@ornek.com' }, 't01-uydurmakod1234', 't01'), 'Uydurma davetle katılma');
  const yeniKod = await admin.D.koduYenile('t17', null);
  await reddedilmeli(() => izleyici.D.davetleKatil(izleyici.uid, { email: 'menajer2@ornek.com' }, yeniKod, 't01'), 't17 davetiyle t01 olarak katılma');
  await reddedilmeli(() => izleyici.D.davetleKatil(izleyici.uid, { email: 'menajer2@ornek.com' }, yeniKod, 'admin'), 'Takım davetiyle yönetici olarak katılma');
  await reddedilmeli(() => izleyici.D.davetleKatil(izleyici.uid, { email: 'baskasi@ornek.com' }, yeniKod, 't17'), 'Başkasının e-postasıyla katılma');
  await reddedilmeli(() => takimlar.t04.D.uyeyiCikar(takimlar.t05.uid), 'Menajerin başka menajeri takımdan çıkarması');
  const uyeler = await admin.D.uyeleriGetir();
  kontrol(uyeler.filter(u => u.takim !== 'admin').length === 17 && uyeler.every(u => u.email), 'Yönetici takımlara bağlı hesapları görüyor');
  await admin.D.koduYenile('t17', yeniKod);
  await reddedilmeli(() => takimlar.t03.D.kodlariGetir(), 'Menajerin giriş kodlarını okuması');
  await reddedilmeli(() => takimlar.t03.D.havuzuYukle(havuz.slice(0, 3)), 'Menajerin oyuncu havuzunu değiştirmesi');
  await reddedilmeli(() => takimlar.t03.D.kuraCek(tidler), 'Menajerin kura çekmesi');
  await reddedilmeli(() => F.updateDoc(F.doc(takimlar.t03.db, 'takimlar', 't04'), { ad: 'Ele geçirildi' }), 'Başka takımın adını değiştirme');
  await takimlar.t03.D.takimAdiKaydet('t03', 'Üçüncüler');
  kontrol((await oku(admin.db, 'takimlar', 't03')).ad === 'Üçüncüler', 'Menajer kendi takım adını değiştirdi');

  // Takım sayısı serbest: kura öncesi yönetici takım ekleyip çıkarabilir
  await reddedilmeli(() => takimlar.t03.D.takimEkle(), 'Menajerin takım eklemesi');
  const yeniTakim = await admin.D.takimEkle();
  kontrol(yeniTakim === 't18' && (await oku(admin.db, 'lig', 'ayar')).takimSayisi === 18 && (await oku(admin.db, 'lig', 'durum')).toplamSecim === 126
    && !!(await oku(admin.db, 'kadrolar', 't18')), 'Yönetici 18. takımı ekledi (126 seçim)');
  const kod18 = Object.entries(await admin.D.kodlariGetir()).find(([t]) => t === 't18')?.[1];
  await admin.D.sonTakimiCikar(kod18);
  kontrol((await oku(admin.db, 'lig', 'ayar')).takimSayisi === 17 && (await oku(admin.db, 'lig', 'durum')).toplamSecim === 119
    && !(await oku(admin.db, 'takimlar', 't18')), 'Yönetici son takımı çıkardı (yine 17 takım)');

  await admin.D.havuzuYukle(havuz);
  kontrol(Object.keys(await hepsi(admin.db, 'oyuncular')).length === havuz.length, `Havuz yüklendi (${havuz.length} oyuncu)`);

  console.log('Kura ve draft');
  const sira = await admin.D.kuraCek(tidler);
  const durum0 = await oku(admin.db, 'lig', 'durum');
  kontrol(durum0.secimSirasi.length === 119 && durum0.secimSirasi[17] === sira[16] && durum0.secimSirasi[34] === sira[0], 'Yılan sırası doğru (18. seçim 17. takımın, 35. seçim yine 17. takımın)');
  await reddedilmeli(() => takimlar[sira[0]].D.secimYap({ takim: sira[0], oyuncu: havuz[0], otomatik: false, dizilis }), 'Draft başlamadan seçim');
  await admin.D.draftiBaslat(SURE);

  // Yönetici yetkisi verilen takım (hem oynar hem yönetir)
  // Hile denemelerinde kullanılan takımlardan farklı bir takım (t01/t02 testlerde "başka takım" olarak kullanılıyor)
  const yonTakim = sira.find((t, i) => i >= 9 && !['t01', 't02'].includes(t));
  const siradanTakim = sira[3];
  await reddedilmeli(() => takimlar[siradanTakim].D.yoneticiTakimlariniKaydet([siradanTakim]), 'Menajerin kendine yönetici yetkisi vermesi');
  await admin.D.yoneticiTakimlariniKaydet([yonTakim]);
  await takimlar[yonTakim].D.duraklat(SURE);
  kontrol((await oku(admin.db, 'lig', 'durum')).asama === 'duraklatildi', 'Yönetici takım menajeri draftı duraklattı');
  await reddedilmeli(() => takimlar[siradanTakim].D.devamEt(SURE), 'Yönetici olmayan menajerin draftı devam ettirmesi');
  await takimlar[yonTakim].D.devamEt(SURE);
  kontrol((await oku(admin.db, 'lig', 'durum')).asama === 'draft', 'Yönetici takım menajeri draftı devam ettirdi');

  // Bir takım Türk seçmekten, bir başkası Arka seçmekten kaçınsın: kural onları zorlasın
  const turksuz = sira[5];
  const arkasiz = sira[8];
  let kisitDenendi = 0;
  let otomatikSayisi = 0;
  let yarisTesti = false;
  let geriAlindi = false;
  let istekNo = null;
  for (let n = 0; n < 119; n++) {
    const d = await oku(admin.db, 'lig', 'durum');
    const tid = d.secimSirasi[n];
    const kadrolar = await hepsi(admin.db, 'kadrolar');
    const alinan = new Set(Object.values(kadrolar).flatMap(k => [...k.as, ...k.yedek]));
    const musait = havuz.filter(o => !alinan.has(o.id));
    const izin = C.izinliTipler(kadrolar[tid].tip, tablo);
    const izinli = o => izin.includes(C.tipi(o.mevki, o.turk));
    const ben = takimlar[tid];
    const baska = takimlar[tidler.find(t => t !== tid)];

    if (n === 3) {
      await reddedilmeli(() => baska.D.secimYap({ takim: tid, oyuncu: musait[0], otomatik: false, dizilis }), 'Sırası olmayan takımın başkası adına seçimi');
      await reddedilmeli(() => baska.D.secimYap({ takim: tid, oyuncu: musait[0], otomatik: true, dizilis }), 'Süre dolmadan otomatik seçim');
      const alinmis = havuz.find(o => alinan.has(o.id));
      await reddedilmeli(() => sahteSecim(ben, d, tid, alinmis), 'Başka takımdaki oyuncuyu seçme (kurallar)');
      await reddedilmeli(() => sahteSecim(baska, d, tid, musait[0], { otomatik: true }), 'Süre dolmadan otomatik seçim (kurallar)');
      await bekle(SURE * 1000 + 1200);
      await reddedilmeli(() => sahteSecim(baska, d, tid, musait[40], { otomatik: true }), 'Süre dolunca otomatik seçimde en iyi 15 dışından oyuncu (kurallar)');
    }
    if ((tid === turksuz || tid === arkasiz) && izin.length < 4) {
      const yasak = musait.find(o => !izinli(o));
      await reddedilmeli(() => sahteSecim(ben, d, tid, yasak), `Kadro kuralını bozacak seçim: ${C.kisitMetni(izin)} seçebilecekken ${C.MEVKI_ADI[yasak.mevki]}${yasak.turk ? ' Türk' : ' yabancı'} (kurallar)`);
      kisitDenendi++;
    }

    if (istekNo == null && n >= 25 && tid !== turksuz && tid !== arkasiz) {
      // İstek listesi: süre dolunca takımın listesindeki (en iyi 15 dışından da olabilir) oyuncu seçilir; liste o ana kadar gizli
      istekNo = n;
      const uygunlar = musait.filter(izinli);
      const istenen = uygunlar[45];
      const alinmis = havuz.find(o => alinan.has(o.id));
      await ben.D.istekListesiKaydet(tid, [alinmis.id, istenen.id]);
      await reddedilmeli(() => F.getDoc(F.doc(baska.db, 'istekler', tid)), 'Başka takımın istek listesini süre dolmadan okuma');
      await reddedilmeli(() => baska.D.istekListesiKaydet(tid, []), 'Başka takımın istek listesini değiştirme');
      kontrol((await ben.D.istekListesiGetir(tid)).length === 2, 'Takım kendi istek listesini okuyabiliyor');
      await bekle(SURE * 1000 + 1200);
      const liste = await baska.D.istekListesiGetir(tid);
      kontrol(liste.includes(istenen.id), 'Süre dolunca istek listesi otomatik seçim için okunabildi');
      await reddedilmeli(() => sahteSecim(baska, d, tid, uygunlar[46], { otomatik: true }), 'İstek listesinde olmayan, en iyi 15 dışından oyuncuyu otomatik seçme (kurallar)');
      const secilecek = liste.map(id => havuzMap.get(id)).find(o => !alinan.has(o.id) && izinli(o));
      await baska.D.secimYap({ takim: tid, oyuncu: secilecek, otomatik: true, beklenenNo: n, dizilis });
      kontrol((await oku(admin.db, 'secimler', String(n))).oyuncu === istenen.id, `Süre dolunca istek listesindeki ilk müsait oyuncu (${istenen.ad}, ${istenen.sira}. sıradaki) otomatik seçildi`);
      continue;
    }

    let oyuncu;
    const elle = (Math.random() < 0.55 || tid === turksuz || tid === arkasiz) && n !== 20;
    if (elle) {
      // Türksüz takım Türk, Arkasız takım Arka almamaya çalışır (izin varsa)
      let uygun = musait.filter(izinli);
      const kacin = tid === turksuz ? (o => o.turk) : tid === arkasiz ? (o => o.mevki === 'arka') : null;
      if (kacin && uygun.some(o => !kacin(o))) uygun = uygun.filter(o => !kacin(o));
      oyuncu = uygun[Math.floor(Math.random() * Math.min(5, uygun.length))];
      await ben.D.secimYap({ takim: tid, oyuncu, otomatik: false, beklenenNo: n, dizilis });
    } else {
      // Süre dolsun; açık olan bütün ekranlar (17 menajer + yönetici) aynı anda otomatik seçimi dener
      await bekle(SURE * 1000 + 1200);
      const herkes = [admin, ...Object.values(takimlar)];
      const sonuc = await Promise.allSettled(herkes.map(k => {
        const adaylar = C.otomatikAdaylar(havuz, alinan, izin);
        return k.D.secimYap({ takim: tid, oyuncu: C.rastgele(adaylar), otomatik: true, beklenenNo: n, dizilis });
      }));
      const olan = sonuc.filter(r => r.status === 'fulfilled').length;
      if (olan !== 1) kontrol(false, `${n + 1}. seçimde ${olan} otomatik seçim başarılı oldu`);
      if (!yarisTesti) { kontrol(olan === 1, `18 ekran aynı anda otomatik seçimi denedi, sadece 1 tanesi yapıldı`); yarisTesti = true; }
      otomatikSayisi++;
    }
    if (n === 20 && !geriAlindi) {
      geriAlindi = true;
      // Yönetici son seçimi geri alır, aynı takım tekrar seçer
      const geri = await admin.D.sonSecimiGeriAl();
      const d2 = await oku(admin.db, 'lig', 'durum');
      kontrol(d2.secimNo === 20 && !(await oku(admin.db, 'alinan', geri.oyuncu)), 'Yönetici son seçimi geri aldı');
      n--;
    }
  }
  console.log(`  (${otomatikSayisi} seçim otomatik yapıldı)`);

  console.log('Draft sonu kontrolleri');
  const durum = await oku(admin.db, 'lig', 'durum');
  const kadrolar = await hepsi(admin.db, 'kadrolar');
  const secimler = await hepsi(admin.db, 'secimler');
  const tumOyuncular = Object.values(kadrolar).flatMap(k => [...k.as, ...k.yedek]);
  kontrol(durum.asama === 'kadro' && durum.secimNo === 119, 'Draft bitti (119 seçim), aşama: diziliş kurulumu');
  kontrol(Object.keys(secimler).length === 119, '119 seçim kaydı var');
  kontrol(new Set(tumOyuncular).size === 119, 'Her oyuncu sadece bir takımda');
  kontrol(Object.values(kadrolar).every(k => k.as.length === 5 && k.yedek.length === 2), 'Her takımda 5 As + 2 Yedek');
  const turkMu = p => !!havuzMap.get(p)?.turk;
  const hatalar = Object.entries(kadrolar).map(([t, k]) => [t, dizilisHatasi(k)]).filter(([, h]) => h);
  kontrol(!hatalar.length, `Her takımın dizilişi kurala uygun: As 3 Ön + 2 Arka, As'ta ve Yedekte Türk${hatalar.length ? ` (${hatalar.map(x => x.join(': ')).join('; ')})` : ''}`);
  const tum = k => [...k.as, ...k.yedek];
  kontrol(tum(kadrolar[turksuz]).filter(turkMu).length === 2, 'Türk almamaya çalışan takım tam 2 Türk almak zorunda kaldı');
  kontrol(tum(kadrolar[arkasiz]).filter(p => havuzMap.get(p).mevki === 'arka').length === 2, 'Arka almamaya çalışan takım tam 2 Arka almak zorunda kaldı');
  kontrol(kisitDenendi >= 2, `Kuralı bozan seçim denemeleri yapıldı (${kisitDenendi})`);
  kontrol(Object.values(kadrolar).every(k => C.TIPLER.every(x => k.tip[x] === tum(k).filter(p => C.tipi(havuzMap.get(p).mevki, havuzMap.get(p).turk) === x).length)), 'Ön/Arka × Türk/yabancı sayaçları doğru');
  kontrol(Object.values(secimler).filter(s => s.otomatik && s.no !== istekNo).every(s => {
    const o = havuzMap.get(s.oyuncu);
    return o.sira <= s.no + 15 || o.tipSira <= s.no + 15;
  }), 'Otomatik seçimler (istek listesinden olan hariç) hep müsait en iyi 15 içinden');

  const t1 = sira[0];
  const k1 = kadrolar[t1];
  const yeniDizilis = { as: [k1.yedek[0], ...k1.as.slice(1)], yedek: [k1.as[0], k1.yedek[1]] };
  await takimlar[t1].D.dizilisKaydet(t1, yeniDizilis.as, yeniDizilis.yedek);
  kontrol((await oku(admin.db, 'kadrolar', t1)).as[0] === k1.yedek[0], 'Sezon öncesi diziliş serbestçe değişti');
  await reddedilmeli(() => takimlar[sira[1]].D.dizilisKaydet(t1, k1.as, k1.yedek), 'Başka takımın dizilişini değiştirme');
  await reddedilmeli(() => takimlar[t1].D.dizilisKaydet(t1, [...k1.as, k1.yedek[0]], [k1.yedek[1]]), '6 As ile diziliş');

  // Yönetici takım menajeri yapılmış bir seçimi başka oyuncuyla değiştirir (kadro kuralına uygun: aynı tip)
  {
    const s5 = await oku(admin.db, 'secimler', '5');
    const tip = C.tipi(s5.mevki, s5.turk);
    const ks = await hepsi(admin.db, 'kadrolar');
    const al = new Set(Object.values(ks).flatMap(x => [...x.as, ...x.yedek]));
    const yerine = havuz.find(o => !al.has(o.id) && C.tipi(o.mevki, o.turk) === tip);
    await reddedilmeli(() => takimlar[siradanTakim].D.secimDuzelt({ n: 5, oyuncu: yerine, dizilis }), 'Yönetici olmayan menajerin seçim değiştirmesi');
    await takimlar[yonTakim].D.secimDuzelt({ n: 5, oyuncu: yerine, dizilis });
    const k5 = await oku(admin.db, 'kadrolar', s5.takim);
    kontrol((await oku(admin.db, 'secimler', '5')).oyuncu === yerine.id && [...k5.as, ...k5.yedek].includes(yerine.id)
      && ![...k5.as, ...k5.yedek].includes(s5.oyuncu) && !(await oku(admin.db, 'alinan', s5.oyuncu))
      && (await oku(admin.db, 'alinan', yerine.id)).takim === s5.takim, 'Yönetici 6. seçimi başka oyuncuyla değiştirdi');
  }

  console.log('Sezon');
  await admin.D.sezonuBaslat(await hepsi(admin.db, 'kadrolar'), 6);
  await reddedilmeli(() => takimlar[t1].D.dizilisKaydet(t1, k1.as, k1.yedek), 'Sezon başladıktan sonra ücretsiz diziliş değişikliği');

  // As–Yedek değişikliği: 1 hak
  let k = await oku(admin.db, 'kadrolar', t1);
  await takimlar[t1].D.asYedekDegistir(t1, k.as[1], k.yedek[1], 7);
  k = await oku(admin.db, 'kadrolar', t1);
  kontrol(k.degisiklik === 1 && k.gecmis.length === 2 && k.gecmis[1].hafta === 7, 'As–Yedek değişikliği yapıldı (7. haftadan geçerli)');
  await reddedilmeli(() => takimlar[t1].D.asYedekDegistir(t1, k.as[1], k.yedek[1], 7), 'İkinci As–Yedek değişikliği');
  await reddedilmeli(() => F.updateDoc(F.doc(takimlar[t1].db, 'kadrolar', t1), {
    as: [k.yedek[0], ...k.as.slice(1)], yedek: [k.as[0], k.yedek[1]], degisiklik: 1,
    gecmis: [...k.gecmis, { hafta: 7, as: [k.yedek[0], ...k.as.slice(1)], yedek: [k.as[0], k.yedek[1]], tur: 'degisiklik' }],
  }), 'Hak sayacını artırmadan değişiklik (kurallar)');
  await reddedilmeli(() => F.updateDoc(F.doc(takimlar[t1].db, 'kadrolar', t1), { gecmis: [{ hafta: 6, as: k.as, yedek: k.yedek }] }), 'Geçmiş haftaların kadrosunu değiştirme');

  // Serbest oyuncu: 2 hak
  const serbestler = async () => {
    const ks = await hepsi(admin.db, 'kadrolar');
    const beklemede = await hepsi(admin.db, 'bekleme');
    const al = new Set(Object.values(ks).flatMap(x => [...x.as, ...x.yedek]));
    return havuz.filter(o => !al.has(o.id) && !beklemede[o.id]);
  };
  const t2 = sira[1];
  const birakilanlar = [];
  for (let i = 0; i < 2; i++) {
    const kk = await oku(admin.db, 'kadrolar', t2);
    const birak = [...kk.as, ...kk.yedek].find(p => !havuzMap.get(p).turk);
    const al = (await serbestler())[0];
    await takimlar[t2].D.serbestAl(t2, birak, al, 7);
    birakilanlar.push(birak);
    kontrol((await oku(admin.db, 'alinan', al.id))?.takim === t2 && !(await oku(admin.db, 'alinan', birak)), `${i + 1}. serbest oyuncu alındı, bırakılan serbest kaldı`);
  }
  // Bekleme: bırakılan oyuncu 24 saat alınamaz
  {
    const birak = birakilanlar[0];
    kontrol(!!(await oku(admin.db, 'bekleme', birak))?.zaman, 'Bırakılan oyuncu için 24 saatlik bekleme başladı');
    const t3 = sira[2];
    const k3 = await oku(admin.db, 'kadrolar', t3);
    const tip = C.tipi(havuzMap.get(birak).mevki, havuzMap.get(birak).turk);
    const yeri = [...k3.as, ...k3.yedek].find(p => C.tipi(havuzMap.get(p).mevki, havuzMap.get(p).turk) === tip);
    if (yeri) {
      await reddedilmeli(() => sahteSerbest(takimlar[t3], t3, k3, yeri, birak), 'Beklemedeki oyuncuyu serbest oyuncu olarak alma (kurallar)');
      await reddedilmeli(() => takimlar[t3].D.serbestAl(t3, yeri, havuzMap.get(birak), 7), 'Beklemedeki oyuncuyu alma (uygulama)');
      await reddedilmeli(() => F.deleteDoc(F.doc(takimlar[t3].db, 'bekleme', birak)), 'Menajerin beklemeyi kaldırması');
      const keyfi = (await serbestler())[0].id;
      await reddedilmeli(() => F.setDoc(F.doc(takimlar[t3].db, 'bekleme', keyfi), { zaman: F.serverTimestamp() }), 'Menajerin keyfi bir oyuncuya bekleme koyması');
      await takimlar[yonTakim].D.beklemeyiKaldir(birak);
      await takimlar[t3].D.serbestAl(t3, yeri, havuzMap.get(birak), 7);
      kontrol((await oku(admin.db, 'alinan', birak))?.takim === t3, 'Yönetici beklemeyi kaldırınca oyuncu alınabildi');
      // Talep ve kura: bekleme süresindeki oyuncuya takımlar talip olur, süre bitince kura çekilir
      const talepli = birakilanlar[1];
      const tipOf = pid => C.tipi(havuzMap.get(pid).mevki, havuzMap.get(pid).turk);
      const ayniTip = (kk, pid) => [...kk.as, ...kk.yedek].find(p => tipOf(p) === tipOf(pid));
      const [ta, tb, tc] = sira.slice(8).filter(t => t !== yonTakim);
      const kad = async t => oku(admin.db, 'kadrolar', t);
      const yeriA = ayniTip(await kad(ta), talepli);
      const yeriB = ayniTip(await kad(tb), talepli);
      await takimlar[ta].D.talepEt(talepli, ta, yeriA);
      await takimlar[tb].D.talepEt(talepli, tb, yeriB);
      kontrol(Object.keys((await oku(admin.db, 'bekleme', talepli)).talepler).length === 2, 'İki takım bekleme süresindeki oyuncuya talip oldu');
      await reddedilmeli(() => F.updateDoc(F.doc(takimlar[ta].db, 'bekleme', talepli), new F.FieldPath('talepler', tb), yeriA), 'Başka takımın talebini değiştirme');
      await reddedilmeli(() => takimlar[tc].D.talepEt(talepli, tc, yeriA), 'Kadrosunda olmayan oyuncuyu bırakacağını söyleyerek talep');
      await admin.D.yoneticiHaklar(tc, { fa: 2, degisiklik: 0 });
      await reddedilmeli(async () => takimlar[tc].D.talepEt(talepli, tc, ayniTip(await kad(tc), talepli)), 'Serbest oyuncu hakkı bitmiş takımın talebi');
      await admin.D.yoneticiHaklar(tc, { fa: 0, degisiklik: 0 });
      await takimlar[tb].D.talepGeriCek(talepli, tb);
      kontrol(!(await oku(admin.db, 'bekleme', talepli)).talepler[tb], 'Takım talebini geri çekti');
      await takimlar[tb].D.talepEt(talepli, tb, yeriB);
      await reddedilmeli(() => admin.D.talepKurasi(talepli, 7, dizilisHatasi), 'Talep süresi bitmeden kura');
      await reddedilmeli(async () => sahteSerbest(takimlar[ta], ta, await kad(ta), yeriA, talepli), 'Talep süresindeki oyuncuyu doğrudan alma (kurallar)');
      // 36 saat geçmiş gibi
      await F.updateDoc(F.doc(admin.db, 'bekleme', talepli), { zaman: F.Timestamp.fromMillis(Date.now() - 37 * 3600 * 1000) });
      await reddedilmeli(async () => takimlar[tc].D.talepEt(talepli, tc, ayniTip(await kad(tc), talepli)), 'Süre bittikten sonra talep');
      await reddedilmeli(async () => sahteSerbest(takimlar[ta], ta, await kad(ta), yeriA, talepli), 'Kura çekilmeden talepli oyuncuyu doğrudan alma (kurallar)');
      const faOnce = { [ta]: (await kad(ta)).fa, [tb]: (await kad(tb)).fa };
      const sonuc = await takimlar[yonTakim].D.talepKurasi(talepli, 7, dizilisHatasi);
      const kazanan = sonuc?.kazanan;
      const kk = await kad(kazanan);
      const birakti = kazanan === ta ? yeriA : yeriB;
      kontrol([ta, tb].includes(kazanan) && (await oku(admin.db, 'alinan', talepli))?.takim === kazanan && [...kk.as, ...kk.yedek].includes(talepli)
        && !(await oku(admin.db, 'bekleme', talepli)) && kk.fa === faOnce[kazanan] + 1 && !!(await oku(admin.db, 'bekleme', birakti)),
        `Kura çekildi: oyuncu talip olanlardan ${kazanan}'e gitti, hakkı düştü, bıraktığı oyuncunun beklemesi başladı`);
      const th = Object.values(await hepsi(admin.db, 'hareketler')).find(h => h.tur === 'talep');
      kontrol(th?.takim === kazanan && th.talipler.length === 2, 'Kura, talip olanlarla birlikte Hareketler sayfasına yazıldı');
      // Kimse talep etmezse süre bitince boştakilere düşer
      await F.updateDoc(F.doc(admin.db, 'bekleme', birakti), { zaman: F.Timestamp.fromMillis(Date.now() - 37 * 3600 * 1000) });
      const kc0 = await kad(tc);
      await takimlar[tc].D.serbestAl(tc, ayniTip(kc0, birakti), havuzMap.get(birakti), 7);
      kontrol((await oku(admin.db, 'alinan', birakti))?.takim === tc, 'Talep edilmeyen oyuncu süre bitince boştakilerden alınabildi');
    } else {
      kontrol(false, 'Bekleme testi için uygun yuva bulunamadı');
    }
    // Lige yeni katılan oyuncu: yönetici ekranı bekleme yazar
    const yeni = (await serbestler())[0];
    await admin.D.beklemeleriBaslat({ [yeni.id]: new Date() });
    kontrol((await serbestler()).every(o => o.id !== yeni.id), 'Lige yeni katılan oyuncu için bekleme başlatıldı');
  }
  {
    const kk = await oku(admin.db, 'kadrolar', t2);
    const al = (await serbestler())[0];
    await reddedilmeli(() => takimlar[t2].D.serbestAl(t2, kk.as[0], al, 7), '3. serbest oyuncu');
    const t3 = sira[2];
    const k3 = await oku(admin.db, 'kadrolar', t3);
    const baskasinin = kk.as[0];
    await reddedilmeli(() => sahteSerbest(takimlar[t3], t3, k3, k3.as[0], baskasinin), 'Başka takımdaki oyuncuyu serbest gibi alma (kurallar)');
    await reddedilmeli(() => sahteSerbest(takimlar[t3], t3, k3, k3.as[0], al.id, { bedava: true }), 'Hak kullanmadan serbest oyuncu alma (kurallar)');
    await reddedilmeli(() => F.deleteDoc(F.doc(takimlar[t3].db, 'alinan', baskasinin)), 'Başka takımın oyuncusunu serbest bırakma');
  }

  // Lisansı düşen oyuncu: takım yerine boştakilerden oyuncu alır, serbest oyuncu hakkından düşmez
  {
    const tz = sira[5];
    const kz = await oku(admin.db, 'kadrolar', tz);
    const dusen = kz.as[0];
    const tip = C.tipi(havuzMap.get(dusen).mevki, havuzMap.get(dusen).turk);
    const yerine = (await serbestler()).find(o => C.tipi(o.mevki, o.turk) === tip);
    const baska = sira[7];
    const kb7 = await oku(admin.db, 'kadrolar', baska);
    const yerine2 = (await serbestler()).find(o => o.id !== yerine.id);
    await reddedilmeli(() => takimlar[tz].D.lisanssizlariKaydet([dusen]), 'Menajerin lisansı düşen listesini yazması');
    await admin.D.lisanssizlariKaydet([dusen]);
    await reddedilmeli(() => takimlar[baska].D.serbestAl(baska, kb7.as[0], yerine2, 7, true), 'Lisansı düşmeyen oyuncu için hak kullanmadan değişiklik (kurallar)');
    await takimlar[tz].D.serbestAl(tz, dusen, yerine, 7, true);
    const kz2 = await oku(admin.db, 'kadrolar', tz);
    kontrol(kz2.as[0] === yerine.id && kz2.fa === kz.fa && (await oku(admin.db, 'alinan', yerine.id))?.takim === tz,
      'Lisansı düşen oyuncunun yerine oyuncu alındı, serbest oyuncu hakkı düşmedi');
  }

  // Takas
  const [a, b, c] = [sira[3], sira[4], sira[6]];
  let ka = await oku(admin.db, 'kadrolar', a);
  let kb = await oku(admin.db, 'kadrolar', b);
  await takimlar[a].D.teklifGonder({ veren: a, alan: b, verilen: [ka.as[0], ka.yedek[0]], alinan: [kb.as[2], kb.as[3]], not: 'Deneme' });
  const teklifler = await hepsi(admin.db, 'teklifler');
  const [tid1] = Object.keys(teklifler);
  await reddedilmeli(() => takimlar[c].D.teklifKabul(tid1), 'Üçüncü takımın başkasının teklifini kabul etmesi');
  await reddedilmeli(() => takimlar[a].D.teklifKabul(tid1), 'Teklif verenin kendi teklifini kabul etmesi');
  await reddedilmeli(() => F.addDoc(F.collection(takimlar[c].db, 'teklifler'), { veren: a, alan: b, verilen: [ka.as[1]], alinan: [kb.as[1]], durum: 'bekliyor', zaman: F.serverTimestamp() }), 'Başka takım adına teklif');
  await reddedilmeli(() => admin.D.takasOnayla(tid1, 7), 'Karşı taraf kabul etmeden yönetici onayı');
  await takimlar[b].D.teklifKabul(tid1);
  kontrol((await oku(admin.db, 'teklifler', tid1)).durum === 'onay' && (await oku(admin.db, 'kadrolar', a)).as[0] === ka.as[0],
    'Karşı taraf kabul etti: takas yönetici onayına gitti, oyuncular henüz yer değiştirmedi');
  await reddedilmeli(() => takimlar[b].D.takasOnayla(tid1, 7), 'Yönetici olmayan menajerin takası onaylaması');
  await reddedilmeli(() => F.updateDoc(F.doc(takimlar[b].db, 'teklifler', tid1), { durum: 'kabul' }), 'Menajerin teklifi kendisi "kabul" yapması');
  await admin.D.takasOnayla(tid1, 7);
  const ka2 = await oku(admin.db, 'kadrolar', a);
  const kb2 = await oku(admin.db, 'kadrolar', b);
  kontrol(ka2.as[0] === kb.as[2] && ka2.yedek[0] === kb.as[3] && kb2.as[2] === ka.as[0] && kb2.as[3] === ka.yedek[0], '2\'ye 2 takas: oyuncular birbirinin yuvasına geçti');
  kontrol((await oku(admin.db, 'alinan', ka.as[0])).takim === b && (await oku(admin.db, 'teklifler', tid1)).durum === 'kabul', 'Oyuncuların takımı ve teklif durumu güncellendi');
  await reddedilmeli(() => admin.D.takasOnayla(tid1, 7), 'Aynı takası ikinci kez onaylama');
  await reddedilmeli(() => takimlar[b].D.teklifKabul(tid1), 'Tamamlanan teklifi yeniden kabul etme');
  ka = ka2; kb = kb2;
  await takimlar[a].D.teklifGonder({ veren: a, alan: c, verilen: [ka.as[1]], alinan: [(await oku(admin.db, 'kadrolar', c)).as[0]] });
  const t2id = Object.keys(await hepsi(admin.db, 'teklifler')).find(x => x !== tid1);
  await takimlar[c].D.teklifReddet(t2id);
  kontrol((await oku(admin.db, 'teklifler', t2id)).durum === 'red', 'Teklif reddedildi');
  const yeniTeklif = async (verilen, alinan) => {
    const once = new Set(Object.keys(await hepsi(admin.db, 'teklifler')));
    await takimlar[a].D.teklifGonder({ veren: a, alan: c, verilen, alinan });
    return Object.keys(await hepsi(admin.db, 'teklifler')).find(x => !once.has(x));
  };
  {
    const kc = await oku(admin.db, 'kadrolar', c);
    const tr = await yeniTeklif([ka.as[1]], [kc.as[0]]);
    await takimlar[c].D.teklifKabul(tr);
    await takimlar[yonTakim].D.takasReddet(tr);
    kontrol((await oku(admin.db, 'teklifler', tr)).durum === 'yonetici-red' && (await oku(admin.db, 'kadrolar', c)).as[0] === kc.as[0], 'Yönetici takası reddetti, oyuncular yer değiştirmedi');
    const tg = await yeniTeklif([ka.as[1]], [kc.as[0]]);
    await takimlar[c].D.teklifKabul(tg);
    await takimlar[a].D.teklifIptal(tg);
    kontrol((await oku(admin.db, 'teklifler', tg)).durum === 'iptal', 'Teklif veren, yönetici onayı beklerken teklifi geri çekti');
    await reddedilmeli(() => admin.D.takasOnayla(tg, 7), 'Geri çekilen takası onaylama');
  }
  {
    const kc = await oku(admin.db, 'kadrolar', c);
    const yabanci = x => [...x.as, ...x.yedek].filter(p => !havuzMap.get(p)?.turk).slice(0, 3);
    const ver = yabanci(await oku(admin.db, 'kadrolar', a));
    const al = yabanci(kc);
    await takimlar[a].D.teklifGonder({ veren: a, alan: c, verilen: ver, alinan: al });
    const t3id = Object.entries(await hepsi(admin.db, 'teklifler')).find(([, x]) => x.durum === 'bekliyor')[0];
    const kontrolFn = (v, y) => dizilisHatasi(v) || dizilisHatasi(y);
    try {
      await takimlar[c].D.teklifKabul(t3id);
      await admin.D.takasOnayla(t3id, 7, kontrolFn);
      const kc2 = await oku(admin.db, 'kadrolar', c);
      kontrol(ver.every(p => [...kc2.as, ...kc2.yedek].includes(p)), "3'e 3 takas kabul edildi");
    } catch (e) {
      kontrol(/Türk|Ön/.test(e.message), `3'e 3 takas kadro kuralı yüzünden yapılmadı: ${e.message}`);
    }
  }

  // Yönetici: kadrolara tam yetki (haklar ve bekleme aranmaz)
  {
    const kc = await oku(admin.db, 'kadrolar', c);
    const al = (await serbestler())[0];
    const birak = kc.yedek[0];
    await reddedilmeli(() => takimlar[siradanTakim].D.yoneticiOyuncuDegistir(c, birak, al, 7), 'Yönetici olmayan menajerin başka takımın kadrosunu değiştirmesi');
    await takimlar[yonTakim].D.yoneticiOyuncuDegistir(c, birak, al, 7);
    const kc2 = await oku(admin.db, 'kadrolar', c);
    kontrol(kc2.yedek[0] === al.id && (await oku(admin.db, 'alinan', al.id))?.takim === c && !(await oku(admin.db, 'alinan', birak))
      && kc2.fa === kc.fa && kc2.gecmis.at(-1).tur === 'yonetici', 'Yönetici takıma boştan oyuncu koydu (hak düşmedi, geçmişe yazıldı)');
    const as = [kc2.yedek[1], ...kc2.as.slice(1)];
    const yedek = [kc2.as[0], kc2.yedek[0]];
    await reddedilmeli(() => takimlar[c].D.yoneticiDizilis(c, as, yedek, 7), 'Menajerin hakkı olmadan dizilişi değiştirmesi');
    await admin.D.yoneticiDizilis(c, as, yedek, 7);
    kontrol((await oku(admin.db, 'kadrolar', c)).as[0] === kc2.yedek[1], 'Yönetici dizilişi doğrudan değiştirdi');
    await admin.D.yoneticiHaklar(t2, { fa: 0, degisiklik: 0 });
    kontrol((await oku(admin.db, 'kadrolar', t2)).fa === 0, 'Yönetici takımın kullanılan haklarını sıfırladı');
    await reddedilmeli(() => takimlar[t2].D.yoneticiHaklar(t2, { fa: 0, degisiklik: 0 }), 'Menajerin kendi haklarını sıfırlaması');
    const yh = Object.values(await hepsi(admin.db, 'hareketler')).filter(h => h.tur === 'yonetici');
    kontrol(yh.length === 1 && yh[0].alinan === al.id, 'Yönetici değişikliği Hareketler\'e yazıldı');
  }

  // Puanlama: 6. haftanın verisiyle (varsa) ya da 5. haftayla hesap
  const hafta = JSON.parse(readFileSync(new URL('../../site/bsl/data/hafta/5.json', import.meta.url), 'utf-8'));
  const ks = await hepsi(admin.db, 'kadrolar');
  const ts = Object.entries(ks).map(([id, x]) => {
    const kad = C.haftaKadrosu(x, 7);
    return { id, ad: id, as: kad.as.map(p => havuzMap.get(p) ?? rehber.find(o => o.id === p)), yedek: kad.yedek.map(p => havuzMap.get(p) ?? rehber.find(o => o.id === p)) };
  });
  const sonuc = C.haftaSiralamasi(ts, { ...hafta, hafta: 7 });
  kontrol(sonuc.length === 17 && sonuc[0].puan === 5 && sonuc.every(s => s.aslar.length === 5), `Haftalık sıralama hesaplandı (lider ${sonuc[0].id}: ${sonuc[0].toplam} VP)`);

  console.log('Sıfırlama');
  await reddedilmeli(() => takimlar[a].D.draftiSifirla(tidler, SURE), 'Menajerin draftı sıfırlaması');
  await admin.D.draftiSifirla(tidler, SURE);
  const sifir = await hepsi(admin.db, 'kadrolar');
  kontrol((await oku(admin.db, 'lig', 'durum')).asama === 'kurulum' && Object.values(sifir).every(x => x.as.length === 0)
    && !Object.keys(await hepsi(admin.db, 'secimler')).length && !Object.keys(await hepsi(admin.db, 'teklifler')).length
    && !Object.keys(await hepsi(admin.db, 'bekleme')).length && !Object.keys(await hepsi(admin.db, 'istekler')).length, 'Yönetici draftı sıfırladı');

  // Yönetici de oynuyor: kendi takımına katılır, o takım yönetici takımı olur, yöneticiliği sürer
  {
    const kod = await admin.D.koduYenile('t17', null);
    const ayar = await oku(admin.db, 'lig', 'ayar');
    await admin.D.yoneticiTakimlariniKaydet([...(ayar.yoneticiTakimlar ?? []), 't17']);
    await admin.D.davetleKatil(admin.uid, { email: 'menajer1@ornek.com', ad: 'Yönetici' }, kod, 't17');
    await admin.D.ayarlariKaydet({ secimSuresi: SURE });
    kontrol((await admin.D.uyelik(admin.uid)).takim === 't17', 'Yönetici kendi takımına katıldı ve yönetici işlemi yapabiliyor');
  }

  console.log(`\nSonuç: ${basarili} kontrol geçti, ${hatali} kontrol başarısız.`);
  process.exit(hatali ? 1 : 0);
}

// Uygulamanın kontrollerini atlayıp doğrudan Firestore'a yazan "hileli" seçim (kuralları sınamak için)
async function sahteSecim(k, d, takim, oyuncu, { otomatik = false } = {}) {
  const n = d.secimNo;
  const db = k.db;
  await F.runTransaction(db, async tx => {
    const kadro = (await tx.get(F.doc(db, 'kadrolar', takim))).data();
    const yeni = dizilis([...kadro.as, ...kadro.yedek, oyuncu.id]);
    const x = C.tipi(oyuncu.mevki, oyuncu.turk);
    tx.set(F.doc(db, 'secimler', String(n)), {
      no: n, tur: 1, takim, oyuncu: oyuncu.id, ad: oyuncu.ad, bslTakim: oyuncu.takim, turk: !!oyuncu.turk, mevki: oyuncu.mevki, otomatik, zaman: F.serverTimestamp(),
    });
    tx.set(F.doc(db, 'alinan', oyuncu.id), { takim, secim: n });
    tx.update(F.doc(db, 'kadrolar', takim), { ...yeni, tip: { ...kadro.tip, [x]: kadro.tip[x] + 1 }, sonSecim: n });
    tx.update(F.doc(db, 'lig', 'durum'), { secimNo: n + 1, saatBaslangic: F.serverTimestamp(), saatSure: SURE, asama: 'draft' });
  });
}

async function sahteSerbest(k, tid, kadro, birak, alId, { bedava = false } = {}) {
  const db = k.db;
  const yeni = C.yerineKoy(kadro, birak, alId);
  const b = F.writeBatch(db);
  b.update(F.doc(db, 'kadrolar', tid), { ...yeni, fa: kadro.fa + (bedava ? 0 : 1), sonFa: alId, gecmis: [...kadro.gecmis, { hafta: 7, ...yeni, tur: 'serbest' }] });
  b.delete(F.doc(db, 'alinan', birak));
  b.set(F.doc(db, 'alinan', alId), { takim: tid, fa: true });
  await b.commit();
}

main().catch(e => { console.error(e); process.exit(1); });
