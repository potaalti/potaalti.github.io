// TBL Fantezi'nin Firestore verilerinin yedeği ve geri yüklemesi (GitHub Actions; .github/workflows/fantezi-yedek.yml).
// 2026-11-11'de talepler (bekleme) silindi ve geri getirilemedi: bir daha olursa son yedekten geri yüklenir.
//
//   node veri/fantezi_yedek.mjs yedekle <klasör>                     bütün koleksiyonlar -> <klasör>/tbl/<zaman>.json (şifreli)
//   node veri/fantezi_yedek.mjs goster <dosya>                       yedeğin özeti (koleksiyon ve belge sayıları)
//   node veri/fantezi_yedek.mjs geri <dosya> <koleksiyon> [--uygula] o koleksiyonun belgelerini yedekteki haline getirir
//                                                                   (--uygula olmadan yalnızca neyin değişeceğini yazar)
// Giriş: Firebase hizmet hesabı (GitHub sırrı FIREBASE_TBL_HESAP, robot yöneticiyle aynı). Depo herkese açık olduğu için yedek
// AES-256-GCM ile şifrelenir; anahtar hizmet hesabının gizli anahtarından türetilir (yani yalnızca GitHub'daki iş açabilir).
// İçerik değişmediyse yeni dosya yazılmaz. Saklama: son 2 günün her yedeği, daha eskilerden günün son yedeği (30 gün). Yedek
// dalı her seferinde tek kayıt olarak yeniden yazılır (geçmiş birikmez, telefondaki kopya şişmez).
import { createSign, createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const hesap = process.env.FIREBASE_TBL_HESAP ? JSON.parse(process.env.FIREBASE_TBL_HESAP) : null;
if (!hesap) { console.log('FIREBASE_TBL_HESAP yok: yedek alınmadı.'); process.exit(0); }
const KOK = `https://firestore.googleapis.com/v1/projects/${hesap.project_id}/databases/(default)/documents`;
const anahtar = createHash('sha256').update(`${hesap.private_key}|pota-alti-yedek`).digest();

async function erisim() {
  const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
  const simdi = Math.floor(Date.now() / 1000);
  const imzasiz = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: hesap.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: simdi, exp: simdi + 3600 })}`;
  const jwt = `${imzasiz}.${createSign('RSA-SHA256').update(imzasiz).sign(hesap.private_key).toString('base64url')}`;
  const r = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
  if (!r.access_token) throw new Error('Hizmet hesabı anahtarı alınamadı');
  return { Authorization: `Bearer ${r.access_token}` };
}

const sifrele = metin => {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', anahtar, iv);
  const veri = Buffer.concat([c.update(gzipSync(Buffer.from(metin, 'utf8'))), c.final()]);  // önce sıkıştırılır
  return JSON.stringify({ surum: 1, iv: iv.toString('base64'), etiket: c.getAuthTag().toString('base64'), veri: veri.toString('base64') });
};
const coz = dosya => {
  const s = JSON.parse(readFileSync(dosya, 'utf8'));
  const d = createDecipheriv('aes-256-gcm', anahtar, Buffer.from(s.iv, 'base64'));
  d.setAuthTag(Buffer.from(s.etiket, 'base64'));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(Buffer.from(s.veri, 'base64')), d.final()])).toString('utf8'));
};

async function hepsiniOku(yetki) {
  const r = await (await fetch(`${KOK}:listCollectionIds`, { method: 'POST', headers: { ...yetki, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageSize: 100 }) })).json();
  const koleksiyonlar = {};
  for (const ad of (r.collectionIds ?? []).sort()) {
    const belgeler = [];
    let sayfa = '';
    do {
      const y = await (await fetch(`${KOK}/${ad}?pageSize=300${sayfa ? `&pageToken=${encodeURIComponent(sayfa)}` : ''}`, { headers: yetki })).json();
      if (y.error) throw new Error(`${ad}: ${y.error.message}`);
      for (const b of y.documents ?? []) belgeler.push({ ad: b.name.split('/documents/')[1], fields: b.fields ?? {} });
      sayfa = y.nextPageToken;
    } while (sayfa);
    koleksiyonlar[ad] = belgeler;
  }
  return koleksiyonlar;
}

function budama(klasor) {
  // son 2 günün her yedeği; daha eskilerden her günün son yedeği; 30 günden eskiler silinir
  const dosyalar = readdirSync(klasor).filter(f => /^\d{4}-\d\d-\d\dT\d\d-\d\d\.json$/.test(f)).sort();
  const simdi = Date.now(), gunSonu = new Map();
  for (const f of dosyalar) gunSonu.set(f.slice(0, 10), f);
  for (const f of dosyalar) {
    const yas = (simdi - Date.parse(`${f.slice(0, 10)}T00:00:00Z`)) / 864e5;
    if (yas > 30 || (yas > 2 && gunSonu.get(f.slice(0, 10)) !== f)) rmSync(join(klasor, f));
  }
}

const [mod, a1, a2] = process.argv.slice(2);
if (mod === 'yedekle') {
  const klasor = join(a1, 'tbl');
  mkdirSync(klasor, { recursive: true });
  // YEDEK_DENE: Firestore'a gitmeden şifreleme ve budamayı denemek için örnek veri (JSON)
  const koleksiyonlar = process.env.YEDEK_DENE ? JSON.parse(process.env.YEDEK_DENE) : await hepsiniOku(await erisim());
  const metin = JSON.stringify(koleksiyonlar);
  const ozet = createHash('sha256').update(metin).digest('hex');
  const sonYol = join(klasor, 'son.json');
  const son = existsSync(sonYol) ? JSON.parse(readFileSync(sonYol, 'utf8')) : {};
  const sayilar = Object.fromEntries(Object.entries(koleksiyonlar).map(([k, v]) => [k, v.length]));
  console.log('belge sayıları:', JSON.stringify(sayilar));
  if (son.ozet === ozet) { console.log('değişiklik yok: yeni yedek yazılmadı'); process.exit(0); }
  const zaman = new Date().toISOString().slice(0, 16).replace(':', '-');
  writeFileSync(join(klasor, `${zaman}.json`), sifrele(JSON.stringify({ zaman: new Date().toISOString(), proje: hesap.project_id, koleksiyonlar })));
  writeFileSync(sonYol, JSON.stringify({ zaman: new Date().toISOString(), dosya: `${zaman}.json`, ozet, sayilar }, null, 1));
  budama(klasor);
  console.log('yedek yazıldı:', `${zaman}.json`);
} else if (mod === 'goster') {
  const y = coz(a1);
  console.log(y.zaman, Object.entries(y.koleksiyonlar).map(([k, v]) => `${k}: ${v.length}`).join(', '));
} else if (mod === 'geri') {
  const y = coz(a1), ad = a2, uygula = process.argv.includes('--uygula');
  const belgeler = y.koleksiyonlar[ad];
  if (!belgeler) throw new Error(`Yedekte "${ad}" koleksiyonu yok (var olanlar: ${Object.keys(y.koleksiyonlar).join(', ')})`);
  const yetki = await erisim();
  let degisen = 0;
  for (const b of belgeler) {
    const simdiki = await (await fetch(`${KOK}/${b.ad}`, { headers: yetki })).json();
    if (JSON.stringify(simdiki.fields ?? {}) === JSON.stringify(b.fields)) continue;
    degisen++;
    console.log(`${uygula ? 'geri yükleniyor' : 'değişecek'}: ${b.ad}`);
    if (uygula) {
      const r = await fetch(`${KOK}/${b.ad}`, { method: 'PATCH', headers: { ...yetki, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: b.fields }) });
      if (!r.ok) throw new Error(`${b.ad}: ${r.status} ${await r.text()}`);
    }
  }
  console.log(`${y.zaman} yedeğinden "${ad}": ${belgeler.length} belge, ${degisen} tanesi ${uygula ? 'geri yüklendi' : 'farklı (uygulamak için --uygula)'}`);
} else {
  console.log('kullanım: yedekle <klasör> | goster <dosya> | geri <dosya> <koleksiyon> [--uygula]');
}
