// Deneme draftı: yerel Firebase emülatöründe 17 takımlık bütün draftı ve sezon işlemlerini oynatır,
// güvenlik kurallarının hileli denemeleri reddettiğini kontrol eder. Sadece geliştirme içindir.
//   1) firebase emulators:start --only firestore,auth --project demo-bsl-draft
//   2) cd test && npm install && node deneme_draft.mjs [seçim süresi sn, varsayılan 2]
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import * as F from 'firebase/firestore';
import * as C from '../site/core.js';

F.setLogLevel('silent');
const PROJE = 'demo-bsl-draft';
const SURE = Number(process.argv[2] ?? 2);
const rehber = JSON.parse(readFileSync(new URL('../site/data/oyuncular.json', import.meta.url), 'utf-8'));
const mevkiListesi = JSON.parse(readFileSync(new URL('../site/data/mevkiler.json', import.meta.url), 'utf-8'));
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

// Her kullanıcı (bot) kendi Firebase uygulaması ve kendi db.js kopyasıyla çalışır
let sayac = 0;
async function kullanici() {
  const app = initializeApp({ projectId: PROJE, apiKey: 'demo-key' }, `bot${sayac++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = F.getFirestore(app);
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  await signInAnonymously(auth);
  const D = await import(`../site/db.js?bot=${sayac}`);
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
  const { adminKod, kodlar } = await admin.D.ligiKur(admin.uid, { ad: 'Deneme Ligi', secimSuresi: SURE, baslangicHaftasi: 6 });
  kontrol(C.kodTakimi(adminKod) === 'admin', 'Lig kuruldu, yönetici kodu oluştu');
  const izleyici = await kullanici();
  await reddedilmeli(() => izleyici.D.ligiKur(izleyici.uid, { ad: 'Korsan', baslangicHaftasi: 6 }), 'Lig kurulduktan sonra ikinci kurulum');

  const takimlar = {};
  for (const [tid, kod] of Object.entries(kodlar)) {
    const k = await kullanici();
    await k.D.koduBagla(k.uid, kod, tid);
    takimlar[tid] = k;
  }
  const tidler = Object.keys(takimlar);
  kontrol(tidler.length === 17, '17 menajer kendi koduyla bağlandı');
  await reddedilmeli(() => izleyici.D.koduBagla(izleyici.uid, 't01-uydurmakod1234', 't01'), 'Uydurma kodla giriş');
  await reddedilmeli(() => izleyici.D.koduBagla(izleyici.uid, kodlar.t02, 't01'), 't02 koduyla t01 olarak giriş');
  await reddedilmeli(() => izleyici.D.koduBagla(izleyici.uid, kodlar.t02, 'admin'), 'Takım koduyla yönetici olarak giriş');
  await reddedilmeli(() => takimlar.t03.D.kodlariGetir(), 'Menajerin giriş kodlarını okuması');
  await reddedilmeli(() => takimlar.t03.D.havuzuYukle(havuz.slice(0, 3)), 'Menajerin oyuncu havuzunu değiştirmesi');
  await reddedilmeli(() => takimlar.t03.D.kuraCek(tidler), 'Menajerin kura çekmesi');
  await reddedilmeli(() => F.updateDoc(F.doc(takimlar.t03.db, 'takimlar', 't04'), { ad: 'Ele geçirildi' }), 'Başka takımın adını değiştirme');
  await takimlar.t03.D.takimAdiKaydet('t03', 'Üçüncüler');
  kontrol((await oku(admin.db, 'takimlar', 't03')).ad === 'Üçüncüler', 'Menajer kendi takım adını değiştirdi');

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
  kontrol(Object.values(secimler).filter(s => s.otomatik).every(s => {
    const o = havuzMap.get(s.oyuncu);
    return o.sira <= s.no + 15 || o.tipSira <= s.no + 15;
  }), 'Otomatik seçimler hep müsait en iyi 15 içinden');

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
  const serbestler = () => hepsi(admin.db, 'kadrolar').then(ks => {
    const al = new Set(Object.values(ks).flatMap(x => [...x.as, ...x.yedek]));
    return havuz.filter(o => !al.has(o.id));
  });
  const t2 = sira[1];
  for (let i = 0; i < 2; i++) {
    const kk = await oku(admin.db, 'kadrolar', t2);
    const birak = [...kk.as, ...kk.yedek].find(p => !havuzMap.get(p).turk);
    const al = (await serbestler())[0];
    await takimlar[t2].D.serbestAl(t2, birak, al, 7);
    kontrol((await oku(admin.db, 'alinan', al.id))?.takim === t2 && !(await oku(admin.db, 'alinan', birak)), `${i + 1}. serbest oyuncu alındı, bırakılan serbest kaldı`);
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
  await reddedilmeli(() => takimlar[c].D.teklifKabul(tid1, 7), 'Üçüncü takımın başkasının teklifini kabul etmesi');
  await reddedilmeli(() => takimlar[a].D.teklifKabul(tid1, 7), 'Teklif verenin kendi teklifini kabul etmesi');
  await reddedilmeli(() => F.addDoc(F.collection(takimlar[c].db, 'teklifler'), { veren: a, alan: b, verilen: [ka.as[1]], alinan: [kb.as[1]], durum: 'bekliyor', zaman: F.serverTimestamp() }), 'Başka takım adına teklif');
  await takimlar[b].D.teklifKabul(tid1, 7);
  const ka2 = await oku(admin.db, 'kadrolar', a);
  const kb2 = await oku(admin.db, 'kadrolar', b);
  kontrol(ka2.as[0] === kb.as[2] && ka2.yedek[0] === kb.as[3] && kb2.as[2] === ka.as[0] && kb2.as[3] === ka.yedek[0], '2\'ye 2 takas: oyuncular birbirinin yuvasına geçti');
  kontrol((await oku(admin.db, 'alinan', ka.as[0])).takim === b && (await oku(admin.db, 'teklifler', tid1)).durum === 'kabul', 'Oyuncuların takımı ve teklif durumu güncellendi');
  await reddedilmeli(() => takimlar[b].D.teklifKabul(tid1, 7), 'Aynı teklifi ikinci kez kabul etme');
  ka = ka2; kb = kb2;
  await takimlar[a].D.teklifGonder({ veren: a, alan: c, verilen: [ka.as[1]], alinan: [(await oku(admin.db, 'kadrolar', c)).as[0]] });
  const t2id = Object.keys(await hepsi(admin.db, 'teklifler')).find(x => x !== tid1);
  await takimlar[c].D.teklifReddet(t2id);
  kontrol((await oku(admin.db, 'teklifler', t2id)).durum === 'red', 'Teklif reddedildi');
  {
    const kc = await oku(admin.db, 'kadrolar', c);
    const yabanci = x => [...x.as, ...x.yedek].filter(p => !havuzMap.get(p)?.turk).slice(0, 3);
    const ver = yabanci(await oku(admin.db, 'kadrolar', a));
    const al = yabanci(kc);
    await takimlar[a].D.teklifGonder({ veren: a, alan: c, verilen: ver, alinan: al });
    const t3id = Object.keys(await hepsi(admin.db, 'teklifler')).find(x => x !== tid1 && x !== t2id);
    const kontrolFn = (v, y) => dizilisHatasi(v) || dizilisHatasi(y);
    try {
      await takimlar[c].D.teklifKabul(t3id, 7, kontrolFn);
      const kc2 = await oku(admin.db, 'kadrolar', c);
      kontrol(ver.every(p => [...kc2.as, ...kc2.yedek].includes(p)), "3'e 3 takas kabul edildi");
    } catch (e) {
      kontrol(/Türk|Ön/.test(e.message), `3'e 3 takas kadro kuralı yüzünden yapılmadı: ${e.message}`);
    }
  }

  // Puanlama: 6. haftanın verisiyle (varsa) ya da 5. haftayla hesap
  const hafta = JSON.parse(readFileSync(new URL('../site/data/hafta/5.json', import.meta.url), 'utf-8'));
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
    && !Object.keys(await hepsi(admin.db, 'secimler')).length && !Object.keys(await hepsi(admin.db, 'teklifler')).length, 'Yönetici draftı sıfırladı');

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
