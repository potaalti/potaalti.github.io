// TBL Fantezi Ligi (ortak motor) testi: eski TBL Fantezi'nin kadroları içe aktarılır, menajerler kendi değişikliklerini yapar.
//   1) cd fantezi && firebase emulators:start --only firestore,auth --project demo-bsl-draft
//   2) cd fantezi/test && npm install && node tbl.mjs
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as F from 'firebase/firestore';
import * as C from '../../site/fantezi/core.js';

F.setLogLevel('silent');
const PROJE = 'demo-tbl-fantezi';
const TBL = 'https://potaalti.github.io/tbl_fantezi_lig/data';
const getir = async yol => (await fetch(`${TBL}/${yol}?t=${Date.now()}`)).json();

let basarili = 0;
let hatali = 0;
const kontrol = (kosul, mesaj) => { if (kosul) { basarili++; console.log(`  ✓ ${mesaj}`); } else { hatali++; console.log(`  ✗ ${mesaj}`); } };
async function reddedilmeli(is, mesaj) {
  try { await is(); kontrol(false, `${mesaj} (KABUL EDİLDİ!)`); } catch (e) { kontrol(e?.code === 'permission-denied' || e?.constructor?.name === 'Hata', `${mesaj} reddedildi (${e.code ?? e.message})`); }
}
let n = 0;
async function kullanici(email) {
  const app = initializeApp({ projectId: PROJE, apiKey: 'demo-key' }, `tbl${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = F.getFirestore(app);
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
  const D = await import(`../../site/fantezi/db.js?tbl=${n}`);
  D.baglan(F, db);
  return { uid: auth.currentUser.uid, db, D, email };
}
const oku = async (db, ...yol) => (await F.getDoc(F.doc(db, ...yol))).data();

await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJE}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJE}/accounts`, { method: 'DELETE' });

console.log('Kadro kuralı (As\'ta en fazla 2 yabancı)');
const k = { tur: 'tbl', enFazlaYabanci: 2 };
const y = { turk: false };
const tr = { turk: true };
kontrol(C.dizilisHatasi([y, y, tr, tr, tr], [y, y], k) === null, '2 yabancı As + 2 yabancı Yedek: uygun');
kontrol(/en fazla 2 yabancı/.test(C.dizilisHatasi([y, y, y, tr, tr], [tr, tr], k) ?? ''), '3 yabancı As: kural dışı');
kontrol(C.dizilisHatasi([tr, tr, tr, tr, tr], [y, y], k) === null, 'Hepsi Türk As, iki yabancı Yedek: uygun');

console.log('Kurulum ve içe aktarma');
const [ayarlar, { haftalar }, rehberHam] = await Promise.all([getir('ayarlar.json'), getir('kadro/index.json'), getir('oyuncular.json')]);
const dosyalar = await Promise.all(haftalar.map(h => getir(`kadro/${h}.json`)));
const pidOf = p => p.id || `adsiz:${p.ad}`;
const takimlar = dosyalar.at(-1).map(t => ({
  ad: t.ad, menajer: t.sahibi ?? '',
  gecmis: haftalar.map((h, i) => { const x = dosyalar[i].find(z => z.ad === t.ad); return x && { hafta: h, as: x.as.map(pidOf), yedek: x.yedek.map(pidOf), tur: 'aktarim' }; }).filter(Boolean),
}));
const turkMu = pid => ['TÜRKİYE', 'KKTC'].includes(rehberHam[pid]?.ulke);
const admin = await kullanici('yonetici@ornek.com');
const { kodlar } = await admin.D.ligiKur(admin.uid, { email: admin.email, ad: 'Yönetici' }, { ad: 'Pota Altı TBL Fantezi Ligi', secimSuresi: 90, baslangicHaftasi: ayarlar.baslangicHaftasi, takimSayisi: takimlar.length });
const menajer = await kullanici('menajer1@ornek.com');
const menajer2 = await kullanici('menajer2@ornek.com');
await menajer.D.davetleKatil(menajer.uid, { email: menajer.email }, kodlar.t01, 't01');
await menajer2.D.davetleKatil(menajer2.uid, { email: menajer2.email }, kodlar.t02, 't02');
await reddedilmeli(() => menajer.D.kadrolariIceAktar(takimlar, { aktifHafta: 9, ayar: {} }), 'Menajerin kadroları içe aktarması');
const AKTIF = haftalar.at(-1);
await admin.D.kadrolariIceAktar(takimlar, { aktifHafta: AKTIF, ayar: { degisiklikHakki: 99, asEnFazlaYabanci: 2, mevkilerHazir: false } });
const durum = await oku(admin.db, 'lig', 'durum');
const k1 = await oku(admin.db, 'kadrolar', 't01');
const alinanlar = (await F.getDocs(F.collection(admin.db, 'alinan'))).size;
const sahipli = takimlar.flatMap(t => [...t.gecmis.at(-1).as, ...t.gecmis.at(-1).yedek]).filter(p => !p.startsWith('adsiz:'));
kontrol(durum.asama === 'sezon' && durum.aktifHafta === AKTIF, `Sezon başladı (değişiklikler ${AKTIF}. TBL haftasından)`);
kontrol((await oku(admin.db, 'takimlar', 't01')).ad === takimlar[0].ad && k1.gecmis.length === takimlar[0].gecmis.length, `Takım adları ve ${haftalar.length} haftalık kadro geçmişi aktarıldı`);
kontrol(alinanlar === sahipli.length, `Takımlardaki ${sahipli.length} oyuncunun sahipliği yazıldı`);

console.log('Menajer işlemleri');
const bos = () => Object.entries(rehberHam).filter(([id, o]) => o.aktif).map(([id]) => id);
const tumSahipli = async () => new Set((await F.getDocs(F.collection(admin.db, 'alinan'))).docs.map(d => d.id));
const bekleyen = async () => new Set((await F.getDocs(F.collection(admin.db, 'bekleme'))).docs.map(d => d.id));
// Serbest oyuncu: kadro kuralına uyan (As'ta en fazla 2 yabancı) boştaki bir oyuncuyla yedek değiştirilir
async function serbest(kim, tid) {
  const kk = await oku(admin.db, 'kadrolar', tid);
  const s = await tumSahipli();
  const b = await bekleyen();
  const birak = kk.yedek[0];
  const al = bos().find(id => !s.has(id) && !b.has(id));
  const yeni = C.yerineKoy(kk, birak, al);
  kontrol(C.dizilisHatasi(yeni.as.map(p => ({ turk: turkMu(p) })), yeni.yedek.map(p => ({ turk: turkMu(p) })), k) === null, 'Değişiklik kadro kuralına uygun');
  await kim.D.serbestAl(tid, birak, { id: al, ad: rehberHam[al].ad }, AKTIF);
  return { birak, al };
}
const s1 = await serbest(menajer, 't01');
kontrol((await oku(admin.db, 'alinan', s1.al))?.takim === 't01' && !!(await oku(admin.db, 'bekleme', s1.birak)), '1. serbest oyuncu alındı, bırakılan oyuncunun 36 saati başladı');
await serbest(menajer, 't01');
kontrol((await oku(admin.db, 'kadrolar', 't01')).fa === 2, '2. serbest oyuncu alındı (sezonluk 2 hak doldu)');
await reddedilmeli(() => serbest(menajer, 't01'), '3. serbest oyuncu');
// As–Yedek değişikliği: sınırsız (birden çok kez)
for (let i = 1; i <= 3; i++) {
  const kk = await oku(admin.db, 'kadrolar', 't02');
  const asP = kk.as.find(p => turkMu(p) || !turkMu(kk.yedek[0])) ?? kk.as[0];
  await menajer2.D.asYedekDegistir('t02', asP, kk.yedek[0], AKTIF);
}
kontrol((await oku(admin.db, 'kadrolar', 't02')).degisiklik === 3, 'As–Yedek değişikliği 3 kez yapılabildi (sınırsız)');
await reddedilmeli(async () => { const kk = await oku(admin.db, 'kadrolar', 't02'); await menajer.D.asYedekDegistir('t02', kk.as[0], kk.yedek[0], AKTIF); }, 'Başka takımın As–Yedek değişikliği');
// Talep: t02 bırakılan oyuncuya talip olur
const k2 = await oku(admin.db, 'kadrolar', 't02');
await menajer2.D.talepEt(s1.birak, 't02', k2.yedek[1]);
kontrol(Object.keys((await oku(admin.db, 'bekleme', s1.birak)).talepler ?? {}).includes('t02'), 'Bırakılan oyuncuya talep edildi');
// Takas: yönetici onayıyla
const ka = await oku(admin.db, 'kadrolar', 't01');
const kb = await oku(admin.db, 'kadrolar', 't02');
await menajer.D.teklifGonder({ veren: 't01', alan: 't02', verilen: [ka.yedek[1]], alinan: [kb.yedek[1]] });
const teklif = (await F.getDocs(F.collection(admin.db, 'teklifler'))).docs[0].id;
await menajer2.D.teklifKabul(teklif);
await reddedilmeli(() => menajer2.D.takasOnayla(teklif, AKTIF), 'Yönetici olmayanın takası onaylaması');
await admin.D.takasOnayla(teklif, AKTIF);
kontrol((await oku(admin.db, 'kadrolar', 't01')).yedek.includes(kb.yedek[1]) && (await oku(admin.db, 'alinan', ka.yedek[1]))?.takim === 't02', 'Takas yönetici onayıyla tamamlandı');
// Otomatik yerine geçme: lisansı düşen yabancının yerine aynı TBL takımına gelen yabancı (hak kullanılmaz)
{
  const kk = await oku(admin.db, 'kadrolar', 't03');
  const cikan = kk.as.find(p => !turkMu(p)) ?? kk.as[0];
  const s = await tumSahipli();
  const giren = bos().find(id => !s.has(id) && !turkMu(id)) ?? bos().find(id => !s.has(id)); // boşta yabancı kalmamış olabilir
  await F.setDoc(F.doc(admin.db, 'bekleme', giren), { zaman: F.serverTimestamp() });
  await reddedilmeli(() => menajer.D.otomatikYerine('t03', cikan, { id: giren, ad: rehberHam[giren].ad }, AKTIF), 'Yönetici olmayanın otomatik değişiklik yapması');
  await admin.D.otomatikYerine('t03', cikan, { id: giren, ad: rehberHam[giren].ad }, AKTIF);
  const k3 = await oku(admin.db, 'kadrolar', 't03');
  const h = (await F.getDocs(F.collection(admin.db, 'hareketler'))).docs.map(d => d.data()).find(x => x.tur === 'otomatik');
  kontrol([...k3.as, ...k3.yedek].includes(giren) && !(await oku(admin.db, 'alinan', cikan)) && (await oku(admin.db, 'alinan', giren))?.takim === 't03'
    && k3.fa === kk.fa && !(await oku(admin.db, 'bekleme', giren)) && h?.alinan === giren && k3.gecmis.at(-1).tur === 'otomatik',
    'Lisansı düşen oyuncunun yerine gelen otomatik geçti: hak düşmedi, bekleme kalktı, hareket kaydı yazıldı');
}
// Geçmiş haftalar değişmedi
const g = (await oku(admin.db, 'kadrolar', 't01')).gecmis;
kontrol(JSON.stringify(g.slice(0, takimlar[0].gecmis.length)) === JSON.stringify(takimlar[0].gecmis) && g.every(x => x.hafta <= AKTIF || x.hafta >= AKTIF),
  'Geçmiş haftaların kadroları değişmeden kaldı; yeni değişiklikler geçmişin sonuna eklendi');

console.log(`\nSonuç: ${basarili} kontrol geçti, ${hatali} kontrol başarısız.`);
process.exit(hatali ? 1 : 0);
