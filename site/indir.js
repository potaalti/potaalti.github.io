// Telefonda sayfanın en üstünde "Pota Altı'yı telefonuna ekle" şeridi. Uygulama olarak açıksa ya da şerit kapatıldıysa
// (7 gün) görünmez. Android/Chrome'da "Yükle" tek dokunuşla kurar; iPhone'da (Safari kuramaz) "Nasıl?" ana ekrana ekleme
// tarifini gösterir. Ana uygulama ve fantezi ligleri aynı uygulamayı kurar.
(() => {
  const ANAHTAR = 'indirSeridiKapandi';
  const BEKLE_GUN = 7;
  const uygulamada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (uygulamada || !matchMedia('(max-width: 759px)').matches) return;
  try {
    if (Date.now() - Number(localStorage.getItem(ANAHTAR) || 0) < BEKLE_GUN * 86400000) return;
  } catch { /* gizli pencere: şerit yine gösterilir */ }

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const kok = new URL('./', document.querySelector('link[rel=manifest]')?.href ?? location.href).href;
  let istem = null;
  let serit = null;

  function goster() {
    if (serit) return;
    serit = document.createElement('div');
    serit.className = 'indir-serit';
    serit.innerHTML = `<img src="${kok}icon-192.png" alt="" width="36" height="36">
      <div class="indir-yazi"><b>Pota Altı uygulaması</b><span>Ana ekrana ekle, uygulama gibi aç</span></div>
      <button class="indir-dugme" type="button">${istem ? 'Yükle' : 'Nasıl?'}</button>
      <button class="indir-kapat" type="button" aria-label="Kapat">✕</button>
      <div class="indir-tarif" hidden>${ios
        ? 'Safari\'de alttaki <b>Paylaş</b> simgesine (kare ve yukarı ok) dokun, <b>Ana Ekrana Ekle</b>\'yi seç, sonra <b>Ekle</b>.'
        : 'Tarayıcının <b>⋮</b> menüsünden <b>Ana ekrana ekle</b> ya da <b>Uygulamayı yükle</b>\'yi seç.'}</div>`;
    document.body.prepend(serit);
    serit.querySelector('.indir-kapat').addEventListener('click', kapat);
    serit.querySelector('.indir-dugme').addEventListener('click', async () => {
      if (istem) {
        istem.prompt();
        const { outcome } = await istem.userChoice;
        istem = null;
        if (outcome === 'accepted') kaldir();
        else serit.querySelector('.indir-dugme').textContent = 'Nasıl?';
        return;
      }
      const tarif = serit.querySelector('.indir-tarif');
      tarif.hidden = !tarif.hidden;
    });
  }
  function kaldir() { serit?.remove(); serit = null; }
  function kapat() {
    try { localStorage.setItem(ANAHTAR, String(Date.now())); } catch { /* gizli pencere */ }
    kaldir();
  }

  // Android/Chrome: tarayıcı kurulabilir dediğinde "Yükle"; demezse (başka tarayıcı) kısa süre sonra tarifle göster
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    istem = e;
    if (serit) serit.querySelector('.indir-dugme').textContent = 'Yükle';
    else goster();
  });
  addEventListener('appinstalled', kaldir);
  setTimeout(goster, ios ? 800 : 2500);
})();
