// TBL Fantezi Ligi'nin Firebase projesinin ayarları (BSL'ninkinden ayrı bir proje).
// Firebase konsolu > Proje ayarları (dişli simgesi) > Genel > "Uygulamalarınız" > Web uygulaması >
// "SDK setup and configuration" > "Config" kısmındaki değerleri aşağıya yapıştırın.
// Bu bilgiler gizli değildir; güvenliği firestore.rules sağlar.
export const firebaseConfig = {
  apiKey: 'AIzaSyBscz7xgCz_A8f0UcjPjYgxkNX5h3pri4w',
  authDomain: 'pota-alti-tbl-fantezi.firebaseapp.com',
  projectId: 'pota-alti-tbl-fantezi',
  storageBucket: 'pota-alti-tbl-fantezi.firebasestorage.app',
  messagingSenderId: '493370099196',
  appId: '1:493370099196:web:9f0d3af1defae497e41e79',
};

// Lig ayarı (ortak motor): draft yok, kadrolar eski TBL Fantezi Ligi'nden içe aktarılır; As'ta en fazla 2 yabancı.
// Hafta numaraları fantezi haftasıdır (TBL'nin başlangıç haftası 1. hafta). ortakHak: serbest oyuncu ve As–Yedek değişikliği aynı 2 transfer hakkından düşer
export const lig = {
  kod: 'tbl', kisa: 'TBL', ad: 'Pota Altı TBL Fantezi Ligi', yerelProje: 'demo-tbl-fantezi',
  kural: 'tbl', draft: false, takas: false, hareketler: false, mevki: false, fanteziHaftasi: true, iceAktar: 'tbl', ortakHak: true, beklemeSaat: 24,
  // Lisansı düşen yabancının yerine aynı TBL takımına gelen yabancı fantezi takımına otomatik geçer (hak kullanmaz)
  otomatikYerine: true,
};
