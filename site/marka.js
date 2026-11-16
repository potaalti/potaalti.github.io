// Pota Altı marka öğeleri: "POTA ALTI" logosu ve YouTube · X · Instagram @PotaAltiTV şeridi (Avrupa, rekor ve Fantezi sıralama
// görsellerinde). Logo 2026-11-16'dan beri kullanıcının gönderdiği resim (marka/logo.webp: beyaz yazı, gölge, krem halka, saydam);
// kullanıcının kendi şablonlarındaki logolara dokunulmaz.
const YAZI = 'https://fonts.googleapis.com/css2?family=Russo+One&family=Montserrat:wght@600;700&display=block';
let hazir;
export function markaYazilari() {
  hazir ??= new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = YAZI; l.onload = ok; l.onerror = ok;
    document.head.append(l);
  }).then(() => Promise.all([...['60px "Russo One"', '600 30px Montserrat'].map(f => document.fonts.load(f, 'POTALI@')), logoYukle()]));
  return Promise.race([hazir, new Promise(ok => setTimeout(ok, 6000))]);
}

export const LOGO_ADRESI = new URL('./marka/logo.webp', import.meta.url).href;
let logoResmi = null, logoSozu;
export function logoYukle() {
  logoSozu ??= new Promise(ok => { const i = new Image(); i.onload = () => { logoResmi = i; ok(i); }; i.onerror = () => ok(null); i.src = LOGO_ADRESI; });
  return logoSozu;
}

// Logo: (cx, cy) merkezli, r yarıçaplı (halkanın dış çapı 2r). Kullanıcının logosu yüklendiyse o; yüklenemediyse yedek olarak
// kodla çizilen beyaz halka ve iki satır "POTA" / "ALTI"
export function logoCiz(g, cx, cy, r, renk = '#ffffff') {
  if (logoResmi) { g.drawImage(logoResmi, cx - r, cy - r, r * 2, r * 2); return; }
  g.save();
  g.strokeStyle = renk; g.lineWidth = r * 0.12;
  g.beginPath(); g.arc(cx, cy, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
  g.fillStyle = renk; g.textAlign = 'center'; g.textBaseline = 'middle';
  const boy = r * 0.56;
  g.font = `${boy}px "Russo One"`;
  const gen = Math.max(g.measureText('POTA').width, g.measureText('ALTI').width), sx = Math.min(1, (r * 1.32) / gen);
  for (const [metin, dy] of [['POTA', -0.25], ['ALTI', 0.3]]) {
    g.save(); g.translate(cx, cy + r * dy); g.scale(sx, 1); g.fillText(metin, 0, 0); g.restore();
  }
  g.restore();
}

function yuvarlak(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// X logosu (24x24 yolu)
const X_YOLU = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';

// Sosyal şerit: h simge yüksekliği; hiza 'sol' | 'orta' | 'sag' (x o kenar/merkez). Genişliğini döndürür.
export function sosyalCiz(g, x, y, h, { hiza = 'orta', renk = '#ffffff', metin = '@PotaAltiTV' } = {}) {
  g.save();
  g.font = `600 ${h * 0.82}px Montserrat`;
  const bosluk = h * 0.32, yw = h * 1.42, tw = g.measureText(metin).width;
  const toplam = yw + bosluk + h + bosluk + h + bosluk * 1.2 + tw;
  let sx = hiza === 'orta' ? x - toplam / 2 : hiza === 'sag' ? x - toplam : x;
  const ust = y - h / 2;
  // YouTube
  yuvarlak(g, sx, ust + h * 0.08, yw, h * 0.84, h * 0.22); g.fillStyle = '#ff0000'; g.fill();
  g.beginPath(); g.moveTo(sx + yw * 0.4, ust + h * 0.3); g.lineTo(sx + yw * 0.4, ust + h * 0.7); g.lineTo(sx + yw * 0.66, ust + h * 0.5); g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  sx += yw + bosluk;
  // X
  g.save(); g.translate(sx, ust); g.scale(h / 24, h / 24); g.fillStyle = renk; g.fill(new Path2D(X_YOLU)); g.restore();
  sx += h + bosluk;
  // Instagram
  const ig = g.createLinearGradient(sx, ust + h, sx + h, ust);
  ig.addColorStop(0, '#feda75'); ig.addColorStop(0.3, '#fa7e1e'); ig.addColorStop(0.6, '#d62976'); ig.addColorStop(1, '#4f5bd5');
  yuvarlak(g, sx, ust, h, h, h * 0.26); g.fillStyle = ig; g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = h * 0.085;
  yuvarlak(g, sx + h * 0.2, ust + h * 0.2, h * 0.6, h * 0.6, h * 0.17); g.stroke();
  g.beginPath(); g.arc(sx + h / 2, ust + h / 2, h * 0.14, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(sx + h * 0.68, ust + h * 0.32, h * 0.045, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  sx += h + bosluk * 1.2;
  // @PotaAltiTV
  g.fillStyle = renk; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(metin, sx, y + h * 0.04);
  g.restore();
  return toplam;
}

// Takım logosu beyaz daire içinde: logonun boş (saydam/beyaz) kenarları atılır, çapraz uzunluğu daireye sığacak kadar
// küçültülür ve daireye kırpılır; böylece geniş ya da köşeli logolar beyaz alandan taşmaz (2026-11-16 kullanıcı isteği)
const logoKutulari = new WeakMap();
function doluKutu(img) {
  if (logoKutulari.has(img)) return logoKutulari.get(img);
  let kutu = [0, 0, img.width, img.height];
  try {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const k = (y * c.width + x) * 4;
      if (d[k + 3] > 20 && !(d[k] > 238 && d[k + 1] > 238 && d[k + 2] > 238)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 >= x0) kutu = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  } catch { /* başka kaynaktan resim okunamazsa tamamı */ }
  logoKutulari.set(img, kutu);
  return kutu;
}
export function logoDaire(g, img, cx, cy, r) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  if (img) {
    g.clip();
    const [x, y, w, h] = doluKutu(img);
    const k = (r * 2 * 0.86) / Math.hypot(w, h);  // çapraz, iç payıyla daireye sığar
    g.drawImage(img, x, y, w, h, cx - (w * k) / 2, cy - (h * k) / 2, w * k, h * k);
  }
  g.restore();
}
