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
  // Yeni sisteme geçerken kadrolardan çıkmış ama talep süresi hiç başlamamış oyuncular (Alp Karahan, Troy Şav, Josh Nzeakor):
  // yönetici uygulamayı ilk açtığında 24 saatlik talep süreleri bir kez başlar (lig/ayar.acilisTalepleriBasladi)
  acilisTalepleri: ['123649', '225810', '778243'],
  // Tek seferlik istisna: Alp Karahan'ın talep süresi 2 saate indirildi (31 Ekim 15:35'te biter); kurayı kazanan onu bu hafta
  // (TBL 9. hafta, Mersin Spor 16:00'da oynuyor) kullanır. Sadece o tarihte başlamış talep süresine uygulanır.
  talepIstisnalari: { 123649: { baslangic: '2026-10-31T10:35:14.455Z', bitis: '2026-10-31T12:35:14.455Z', hafta: 9 } },
};
