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
export const lig = { kod: 'bsl', kisa: 'BSL', ad: 'Pota Altı BSL Fantezi Ligi', yerelProje: 'demo-bsl-draft', kural: 'bsl', draft: true, mevki: true };
