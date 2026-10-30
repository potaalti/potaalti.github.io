// Ağ öncelikli önbellek: bağlantı yokken ya da zayıfken son görülen sayfa dosyaları ve veriler açılır.
// Sadece sitenin kendi dosyaları önbelleğe alınır (Firebase ve diğer adresler doğrudan ağa gider).
const ONBELLEK = 'bsl-fantezi-v1';
const KABUK = ['./', 'index.html', 'style.css', 'app.js', 'core.js', 'db.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(ONBELLEK).then(c => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(adlar => Promise.all(adlar.filter(a => a.startsWith('bsl-fantezi-') && a !== ONBELLEK).map(a => caches.delete(a))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const anahtar = e.request.url.split('?')[0];
  // Eski kod kullanılmasın: her istekte sunucuya güncel mi diye sorulur (sayfa gezinmesi değiştirilemez)
  const istek = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(istek)
      .then(yanit => {
        if (yanit.ok) {
          const kopya = yanit.clone();
          caches.open(ONBELLEK).then(c => c.put(anahtar, kopya));
        }
        return yanit;
      })
      .catch(() => caches.match(anahtar).then(y => y ?? caches.match('./')))
  );
});
