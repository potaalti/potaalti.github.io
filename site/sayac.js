// Ziyaret sayacı (GoatCounter: çerezsiz, kişisel veri tutmaz). Ana uygulama, TBL Fantezi ve BSL Fantezi sayfalarında yüklenir.
// Sayfa adresi #/ ile değiştiği için her BÖLÜM değişiminde bir kez sayılır (maç/oyuncu numarası atılır: #/mac/bsl/123 -> /#/mac/bsl);
// böylece aylık sayım sınırı şişmez, yönetici İstatistik bölümünde bölümler toplu görünür. Yöneticinin kendi gezintisi sayılmaz.
// İstatistikler: veri/istatistik.mjs (GitHub "Site istatistikleri" işi) GoatCounter'dan çekip data/istatistik.json'a yazar.
(function () {
  var KOD = ''; // GoatCounter site kodu (ör. 'potaalti' -> potaalti.goatcounter.com); boşken sayaç kapalı
  if (!KOD) return;
  try { if (localStorage.getItem('potaAltiYonetici') === '1') return; } catch (e) { /* gizli sekme */ }
  var LIG = /^(bsl|tbl|el|ec|bcl|fec)$/;
  var son = null;
  function bolum() {
    var kok = location.pathname.replace(/index\.html$/, '');
    var p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return kok + '#/' + (p[0] || '') + (p[0] && p[1] && LIG.test(p[1]) ? '/' + p[1] : '');
  }
  function say() {
    var yol = bolum();
    if (yol === son || !window.goatcounter || !window.goatcounter.count) return;
    son = yol;
    window.goatcounter.count({ path: yol, title: document.title });
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
