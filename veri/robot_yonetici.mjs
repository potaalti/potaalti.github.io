// Robot yönetici (GitHub Actions, .github/workflows/robot-yonetici.yml, 15 dakikada bir): TBL Fantezi uygulamasını yönetici
// yetkisiyle arka planda açar; yönetici ekranının otomatik işleri kimse uygulamayı açmasa da yapılır:
//   - lige yeni katılan oyuncunun talep süresi başlar (hareketler.json'daki zamanla), süresi biten taleplerin kurası çekilir
// Giriş: Firebase hizmet hesabı (GitHub sırrı FIREBASE_TBL_HESAP, JSON) ile 'robot-yonetici' kullanıcısına özel jeton;
// bu kullanıcının uyeler belgesi (takim: 'admin') hizmet hesabıyla bir kez yazılır. Sır yoksa bir şey yapmadan çıkar.
// Ayrıca telefonun verisi 3 saatten eskiyse (telefon görevi durmuş) bir kez hata verir, GitHub e-postayla bildirir.
//   FIREBASE_TBL_HESAP='{...}' node veri/robot_yonetici.mjs
import { createSign } from 'node:crypto';
import puppeteer from 'puppeteer-core';

const SITE = 'https://potaalti.github.io';
const UID = 'robot-yonetici';
const BEKLE_MS = 75000; // talep süresi ve kura ekranın 30 sn'lik döngüsünde yapılır: en az iki tur
const CHROME = process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');

// Telefon verisi: 3–3,5 saat eskiyse hata (her 15 dakikada değil, durduğu ilk yarım saatte bir iki kez uyarır)
let telefonUyarisi = null;
try {
  const meta = await (await fetch(`${SITE}/data/meta.json?t=${Date.now()}`)).json();
  const saat = (Date.now() - Date.parse(meta.guncelleme)) / 3600e3;
  if (saat >= 3 && saat < 3.5) telefonUyarisi = `Telefon ${saat.toFixed(1)} saattir veri göndermiyor (son: ${meta.guncelleme})`;
} catch (e) { console.log('meta.json okunamadı:', e.message); }
// Canlı skor (eski TBL sitesinin verisi, telefonun maç döngüsü 3 dakikada bir yazar): maç saatinde 20–35 dakikadır
// güncellenmediyse bir kez hata. Telefon bekçisi takılan döngüyü kendisi yeniden başlatır; bu uyarı o da olmazsa gelir.
try {
  const idx = await (await fetch(`${SITE}/tbl_fantezi_lig/data/hafta/index.json?t=${Date.now()}`)).json();
  // macSaatleri Türkiye saatinde, saat dilimi yazılmadan
  const tr = s => Date.parse(`${s}+03:00`);
  const suren = (idx.macSaatleri ?? []).filter(m => !m.bitti && !m.tarih.endsWith('T00:00:00')
    && Date.now() >= tr(m.tarih) && Date.now() <= tr(m.tarih) + 150 * 60e3);
  // Gecikme, son güncellemeden ya da (veri maçtan önce kaldıysa) maçın başlamasından sayılır
  const dk = suren.length ? (Date.now() - Math.max(Date.parse(idx.guncelleme), Math.min(...suren.map(m => tr(m.tarih))))) / 60e3 : 0;
  if (suren.length && dk >= 20 && dk < 35) {
    telefonUyarisi = `${telefonUyarisi ? `${telefonUyarisi}. ` : ''}Maç saatinde canlı skor ${Math.round(dk)} dakikadır güncellenmiyor (son: ${idx.guncelleme})`;
  }
} catch (e) { console.log('Canlı skor verisi okunamadı:', e.message); }

const hesap = process.env.FIREBASE_TBL_HESAP ? JSON.parse(process.env.FIREBASE_TBL_HESAP) : null;
if (!hesap) {
  console.log('FIREBASE_TBL_HESAP yok: robot yönetici çalışmadı.');
} else {
  const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
  const jwt = govde => {
    const imzasiz = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(govde)}`;
    return `${imzasiz}.${createSign('RSA-SHA256').update(imzasiz).sign(hesap.private_key).toString('base64url')}`;
  };
  const simdi = Math.floor(Date.now() / 1000);

  // Hizmet hesabının erişim anahtarı (Firestore'a kurallardan bağımsız yazar): robotun üyelik belgesi
  const erisim = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt({
      iss: hesap.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: simdi, exp: simdi + 3600 }) }),
  })).json();
  if (!erisim.access_token) throw new Error(`Hizmet hesabı anahtarı alınamadı: ${JSON.stringify(erisim)}`);
  const belge = `https://firestore.googleapis.com/v1/projects/${hesap.project_id}/databases/(default)/documents/uyeler/${UID}`;
  const yetki = { Authorization: `Bearer ${erisim.access_token}` };
  const uye = await (await fetch(belge, { headers: yetki })).json();
  if (uye.fields?.takim?.stringValue !== 'admin') {
    const r = await fetch(belge, { method: 'PATCH', headers: { ...yetki, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {
      takim: { stringValue: 'admin' }, kod: { stringValue: '' }, email: { stringValue: '' }, ad: { stringValue: 'Robot yönetici (otomatik)' } } }) });
    if (!r.ok) throw new Error(`Robot üyeliği yazılamadı: ${r.status} ${await r.text()}`);
    console.log('Robot üyeliği yazıldı.');
  }

  // Uygulama bu jetonla girer (app.js: window.robotJetonu)
  const jeton = jwt({ iss: hesap.client_email, sub: hesap.client_email, uid: UID, iat: simdi, exp: simdi + 3600,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit' });
  // Talep süreleri (bekleme belgeleri, herkese açık) önce/sonra: robotun başlattığı talep süresi ve biten (kurası çekilen) talepler kayda
  const beklemeler = async () => {
    const d = await (await fetch(`https://firestore.googleapis.com/v1/projects/${hesap.project_id}/databases/(default)/documents/bekleme?pageSize=300`)).json();
    return new Map((d.documents ?? []).map(b => [b.name.split('/').pop(), b.fields?.zaman?.timestampValue]));
  };
  const once = await beklemeler();
  const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const s = await tarayici.newPage();
    const kayit = [];
    s.on('console', m => { if (/BİLDİRİM|Talep kurası|hata|error/i.test(m.text())) kayit.push(m.text()); });
    s.on('pageerror', e => kayit.push(`sayfa hatası: ${e.message}`));
    await s.evaluateOnNewDocument(j => { window.robotJetonu = j; }, jeton);
    await s.goto(`${SITE}/tbl/?t=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await s.waitForFunction(() => window.robotDurumu, { timeout: 90000 });
    const durum = await s.evaluate(() => window.robotDurumu);
    if (durum.ben !== 'admin') throw new Error(`Robot yönetici olarak girilemedi (takım: ${durum.ben})`);
    await new Promise(ok => setTimeout(ok, BEKLE_MS));
    const sonra = await beklemeler();
    for (const [pid, z] of sonra) if (once.get(pid) !== z) kayit.push(`Talep süresi başladı: oyuncu ${pid} (başlangıç ${z})`);
    for (const pid of once.keys()) if (!sonra.has(pid)) kayit.push(`Talep süresi kapandı (kura çekildi ya da talep yoktu): oyuncu ${pid}`);
    console.log(kayit.length ? kayit.join('\n') : 'Yapılacak iş yoktu.');
  } finally {
    await tarayici.close();
  }
}

if (telefonUyarisi) {
  console.log(`::error title=Telefon veri göndermiyor (canlı skor ya da istatistik)::${telefonUyarisi}`);
  process.exit(1);
}
