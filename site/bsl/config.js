// Firebase projesinin ayarları.
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

// Lig ayarı (ortak motor): BSL draftla kurulur; As 3 Ön + 2 Arka, As'ta ve Yedekte en az 1'er Türk
export const lig = {
  kod: 'bsl', kisa: 'BSL', ad: 'Pota Altı BSL Fantezi Ligi', yerelProje: 'demo-bsl-draft', kural: 'bsl', draft: true, mevki: true,
  // Kullanıcı 2026-11-25: serbest oyuncu ve As–Yedek değişikliği sınırsız (99 ve üstü sınırsız sayılır), talep süresi 24 saat.
  // Kurulumda varsayılan; lig kurulduktan sonra yönetici uygulamayı açınca lig/ayar'a bir kez yazılır (Firestore kuralları buna bakar)
  degisiklikHakki: 999, beklemeSaat: 24,
  ayarGuncelle: { faHakki: 999, degisiklikHakki: 999, beklemeSaat: 24 },
  // Lisansı düşen yabancının yerine aynı takıma gelen yabancı fantezi takımına otomatik GEÇMEZ (TBL'de geçiyor)
  otomatikYerine: false,
  // Kulübün veda ettiği (TBF lisansı henüz düşmeyen) ve fantezi ligden çıkarılan oyuncular: takımlarından çıkarılmış sayılır,
  // menajere "yerine oyuncu ekle" uyarısı gider (hakkından düşmez); çıkarılanlar boştakilerde görünmez, alınamaz.
  // Oyuncu kimliği (TBF personId) ve açıklama: vedaEdenler: ['123456'], // Ad Soyad (takım)
  vedaEdenler: [],
  haricOyuncular: [],
};
