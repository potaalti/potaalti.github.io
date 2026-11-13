// Ziyaret sayacı (GoatCounter: çerezsiz, kişisel veri tutmaz). Ana uygulama, TBL Fantezi ve BSL Fantezi sayfalarında yüklenir.
// Giriş: sayfa her açıldığında bir kez sayfa görüntüleme ('/', '/tbl/', '/bsl/'); GoatCounter aynı kişiyi (aynı cihaz ve tarayıcı)
// 8 saat içinde tekrar ziyaretçi saymaz, yenileme de yeni ziyaret değildir. Gezilen bölümler ayrıca "olay" olarak sayılır
// (maç/oyuncu numarası atılır: #/mac/bsl/123 -> /#/mac/bsl); ziyaretçi sayısına girmez, en çok bakılan bölümleri gösterir.
// Yöneticinin kendi gezintisi sayılmaz.
// İstatistikler: veri/istatistik.mjs (GitHub "Site istatistikleri" işi) GoatCounter'dan çekip data/istatistik.json'a yazar.
(function () {
  var KOD = 'potaalti'; // GoatCounter site kodu (ör. 'potaalti' -> potaalti.goatcounter.com); boşken sayaç kapalı
  if (!KOD) return;
  try { if (localStorage.getItem('potaAltiYonetici') === '1') return; } catch (e) { /* gizli sekme */ }
  var LIG = /^(bsl|tbl|el|ec|bcl|fec)$/;
  var son = null, girdi = false;
  function bolum() {
    var kok = location.pathname.replace(/index\.html$/, '');
    var p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return kok + '#/' + (p[0] || '') + (p[0] && p[1] && LIG.test(p[1]) ? '/' + p[1] : '');
  }
  function say() {
    var gc = window.goatcounter;
    if (!gc || !gc.count) return;
    if (!girdi) {
      girdi = true;
      gc.count({ path: location.pathname.replace(/index\.html$/, ''), title: document.title });
    }
    var yol = bolum();
    if (yol === son) return;
    son = yol;
    gc.count({ path: yol, title: document.title, event: true });
  }
  window.goatcounter = { no_onload: true };
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://' + KOD + '.goatcounter.com/count');
  s.onload = say;
  document.head.appendChild(s);
  window.addEventListener('hashchange', say);
})();
