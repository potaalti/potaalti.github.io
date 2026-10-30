// TBL Fantezi Ligi'nin Firebase projesinin ayarları (BSL'ninkinden ayrı bir proje).
// Firebase konsolu > Proje ayarları (dişli simgesi) > Genel > "Uygulamalarınız" > Web uygulaması >
// "SDK setup and configuration" > "Config" kısmındaki değerleri aşağıya yapıştırın.
// Bu bilgiler gizli değildir; güvenliği firestore.rules sağlar.
export const firebaseConfig = {
  apiKey: 'BURAYA_YAPISTIRIN',
  authDomain: 'BURAYA_YAPISTIRIN.firebaseapp.com',
  projectId: 'BURAYA_YAPISTIRIN',
  storageBucket: 'BURAYA_YAPISTIRIN.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: 'BURAYA_YAPISTIRIN',
};

// Lig ayarı (ortak motor): draft yok, kadrolar eski TBL Fantezi Ligi'nden içe aktarılır; As'ta en fazla 2 yabancı.
// Hafta numaraları fantezi haftasıdır (TBL'nin başlangıç haftası 1. hafta). ortakHak: serbest oyuncu ve As–Yedek değişikliği aynı 2 transfer hakkından düşer
export const lig = {
  kod: 'tbl', kisa: 'TBL', ad: 'Pota Altı TBL Fantezi Ligi', yerelProje: 'demo-tbl-fantezi',
  kural: 'tbl', draft: false, takas: false, hareketler: false, mevki: false, fanteziHaftasi: true, iceAktar: 'tbl', ortakHak: true, beklemeSaat: 24,
  // Lisansı düşen yabancının yerine aynı TBL takımına gelen yabancı fantezi takımına otomatik geçer (hak kullanmaz)
  otomatikYerine: true,
};
