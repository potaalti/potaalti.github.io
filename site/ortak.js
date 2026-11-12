// Uygulamanın bütün bölümlerinde kullanılan yardımcılar

export const KAYNAK_SITE = 'https://potaalti.github.io/tbl_fantezi_lig';
export const KAYNAK = `${KAYNAK_SITE}/data`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sayi = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('tr-TR');
export const isaretli = n => (n > 0 ? `+${n}` : String(n));
// Aramada büyük/küçük harf ve Türkçe karakter farkı gözetilmez ("gultekin" → "Gültekin")
export const aramaNorm = s => String(s ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
// TBF'deki BÜYÜK HARF adları: "FENERBAHÇE BEKO" -> "Fenerbahçe Beko" (3 harf ve altı kısaltmalar olduğu gibi)
export const baslik = ad => String(ad ?? '').split(' ').map(k =>
  k !== k.toLocaleUpperCase('tr') || k.replace(/\./g, '').length <= 3 ? k
    : k.toLocaleLowerCase('tr').replace(/(^|[.\-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr')),
).join(' ').replace(/Technıc/u, 'Technic');
export const gunBasligi = iso => new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
// TBF saati henüz belli olmayan maçları 00:00 olarak verir
export const saatYazisi = iso => (iso.endsWith('T00:00:00') ? 'Saat belli değil' : new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
// Maç sayfasındaki tarih ve saat: "14 Kasım Cumartesi, 13:00" (saati belli değilse yalnızca gün)
export const gunSaat = iso => (iso ? `${gunBasligi(iso)}${iso.endsWith('T00:00:00') ? '' : `, ${saatYazisi(iso)}`}` : '');
export const tarihSaat = iso => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const sureSn = s => { const [dk, sn] = String(s || '0:00').split(':').map(Number); return (dk || 0) * 60 + (sn || 0); };

export async function getir(url) {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} okunamadı (${r.status})`);
  return r.json();
}

// Canlı maçın son güncellemedeki durumu: "3. Çeyrek · 04:12", "Devre arası", "Maç sonu · kesinleşiyor"
export function canliYazisi(m) {
  const c = m?.canliDurum;
  if (!c?.periyot) return 'Canlı';
  const ad = c.uzatma ? 'Uzatma' : `${c.periyot}. Çeyrek`;
  if (c.saat && c.saat !== '00:00') return `${ad} · ${c.saat}`;
  if (c.uzatma) return `${ad} sonu`;
  if (c.periyot === 2) return 'Devre arası';
  if (c.periyot >= 4) return Number(m.evSkor) !== Number(m.depSkor) ? 'Maç sonu · kesinleşiyor' : '4. Çeyrek sonu';
  return `${c.periyot}. Çeyrek sonu`;
}

// ---------- Sıralama görseli (WhatsApp / Instagram paylaşımı) ----------
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

function sigdir(ctx, metin, enBuyuk, genislik, font) {
  let boyut = enBuyuk;
  do ctx.font = font(boyut); while (ctx.measureText(metin).width > genislik && --boyut > 18);
}

// { baslik, altBaslik, sutunlar: ['VP', 'Puan'], satirlar: [{ sira, ad, not, degerler: [...] }] } -> PNG Blob
export async function siralamaGorseli({ baslik: ustYazi, altBaslik, sutunlar, satirlar }) {
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
    await Promise.race([logo.decode(), new Promise((_, hata) => setTimeout(() => hata(new Error('logo')), 3000))]);
    // Pota Altı logosunun kare zemini şeritten farklı renkte: sadece yuvarlak kısmı çizilir
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.kenar + 60, 105, 120 * 0.465, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, g.kenar, 45, 120, 120);
    ctx.restore();
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
  ctx.fillText(`Pota Altı · ${zaman}`, g.genislik / 2, yukseklik - g.kenar - 10);
  return new Promise(ok => tuval.toBlob(ok, 'image/png'));
}

export const paylasDugmeleri = (tur, n = '') => `<span class="satir" style="flex-wrap:nowrap">
    <button class="secenek" data-is="paylas" data-tur="${tur}" data-id="${n}">📤 Paylaş</button>
    <button class="secenek" data-is="paylas" data-tur="${tur}" data-id="${n}" data-islem="indir" title="Görseli indir">⬇</button></span>`;

function gorseliIndir(dosya) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(dosya);
  a.download = dosya.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Telefonlar paylaşım menüsünü ancak dokunuştan hemen sonra açtırır. Görsel hazırlanırken bu süre dolarsa
// (NotAllowedError) hazır görsel saklanır ve düğmeye ikinci dokunuşta hemen paylaşılır.
// veri(): { bilgi, dosyaAdi }
let hazirGorsel = null;
export async function gorseliPaylas(dugme, anahtar, veri, indir = false) {
  let hazir = hazirGorsel?.anahtar === anahtar && Date.now() - hazirGorsel.zaman < 60000 ? hazirGorsel : null;
  const ilkYazi = dugme.textContent;
  dugme.disabled = true;
  try {
    if (!hazir) {
      dugme.textContent = '…';
      const { bilgi, dosyaAdi } = veri();
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
        else if (e?.name === 'AbortError') hazirGorsel = null;
        else throw e;
      }
    } else {
      gorseliIndir(dosya);
      hazirGorsel = null;
    }
  } catch (e) {
    hazirGorsel = null;
    bildir(`Paylaşılamadı: ${e?.message ?? e}`);
  } finally {
    dugme.disabled = false;
    dugme.textContent = ilkYazi;
  }
}

export function bildir(metin) {
  const kutu = document.createElement('div');
  kutu.className = 'bildirim';
  kutu.textContent = metin;
  document.body.appendChild(kutu);
  setTimeout(() => kutu.remove(), 3000);
}
