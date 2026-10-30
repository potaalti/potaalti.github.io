# Pota Altı BSL Fantezi Ligi — Kurulum ve Kullanım Rehberi

Bu proje, TBL fantezi liginden **tamamen ayrı** bir sitedir. 17 menajer BSL oyuncularını canlı draftla
seçer; sezon boyunca takas, serbest oyuncu ve As–Yedek değişikliği yapar; puanlar BSL'deki VP'lerden
hesaplanır.

- **Site**: GitHub Pages'te yayınlanan statik sayfa (`site/` klasörü).
- **Canlı veri** (draft, kadrolar, takaslar): Google'ın ücretsiz **Firebase Firestore** veritabanı
  (Spark planı, kredi kartı gerekmez).
- **BSL verisi** (oyuncular, haftalık VP): bilgisayarda `guncelle.bat` ile TBF'den çekilir ve siteye
  gönderilir (TBF sitesi GitHub sunucularını engellediği için bilgisayardan).

---

## 1. Firebase projesini oluştur (bir kez, ~10 dakika)

1. <https://console.firebase.google.com> adresine Google hesabınla gir.
2. **Proje oluştur** (Create a project) → ad: `bsl-draft-ligi` (istediğin bir ad) → Google Analytics'i
   **kapat** → Oluştur.
3. **Web uygulaması ekle**: proje ana sayfasında `</>` simgesine bas → takma ad: `site` →
   "Firebase Hosting" kutusunu **işaretleme** → Uygulamayı kaydet.
4. Çıkan ekranda `const firebaseConfig = { ... }` bloğunu gör. İçindeki değerleri (apiKey, authDomain,
   projectId, storageBucket, messagingSenderId, appId) `site/config.js` dosyasına yapıştır
   (ya da bana gönder, ben yerleştireyim — bu bilgiler gizli değildir).
5. Sol menü **Build → Firestore Database** → **Create database** → konum: `eur3 (europe-west)` →
   **Start in production mode** → Oluştur.
6. Aynı sayfada **Rules** sekmesi → oradaki her şeyi sil → bu projedeki `firestore.rules` dosyasının
   tamamını yapıştır → **Publish**.
7. Sol menü **Build → Authentication** → **Get started** → **Sign-in method**:
   - **Google** → **Enable** → "Project support email" olarak kendi Gmail adresini seç → Save.
     (Menajerler davet linkini açıp Google hesabıyla girer; şifre yok.)
   - **Anonymous** → **Enable** → Save. (Giriş yapmayanlar siteyi izleyici olarak görebilsin diye.)
8. Authentication → **Settings** → **Authorized domains** → **Add domain** → `potaalti.github.io`.

> `firestore.rules` ileride değişirse 6. adımı tekrarla (kuralları yeniden yapıştır, Publish).

## 2. Siteyi yayınla (GitHub)

1. Bu klasör GitHub'da ayrı bir depo olarak yayınlanır (ör. `potaalti/bsl_draft_ligi`).
2. GitHub'da depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Her gönderimde (push) site otomatik yayınlanır:
   `https://potaalti.github.io/<depo-adı>/`

## 3. Ligi kur (bir kez)

1. Siteyi aç → **Google ile giriş yap** → "Ligi kur" ekranı gelir (lig henüz kurulmadıysa).
2. Lig adını, puanlamanın başlayacağı **BSL haftasını** (draftın bittiği haftadan sonraki ilk hafta)
   ve seçim süresini (90 sn = 1,5 dk) gir; istersen menajer adlarını yaz → **Ligi kur**.
3. Ligi kuran **Google hesabı yönetici** olur. Başka cihazdan da aynı Google hesabıyla girmen yeterli.
4. **Yönetici** sayfasında takım adlarını/menajerleri düzenle; her menajere kendi **davet linkini**
   **WhatsApp** düğmesiyle ya da **Linki kopyala** ile gönder.
   - Menajer linki açar → **Google ile giriş yap** → Google hesabı takımına bağlanır.
   - Davet linki **tek kullanımlıktır**: kullanıldıktan sonra başkası açsa da işe yaramaz.
   - Sonra menajer telefondan ya da bilgisayardan aynı Google hesabıyla **Giriş yap** der; link gerekmez.
   - Yönetici sayfasında her takımın hangi Google hesabına bağlı olduğu görünür. Yanlış hesap bağlandıysa
     **Çıkar** → takım için yeni davet linki oluşur, onu gönder.
   - Davet linki yanlış kişiye gittiyse (henüz kullanılmadan) **Yeni link** → eskisi iptal olur.

## 4. Draft günü

1. Draft'tan hemen önce bilgisayarda `guncelle.bat`'a çift tıkla (en güncel VP ortalamaları için),
   birkaç dakika bekle.
2. **Mevkiler** sayfasında (yönetici menüsü) oyuncuların mevkilerini kontrol et: **Ön** = uzun/forvet,
   **Arka** = oyun kurucu/şutör. Mevkiler yöneticinin hazırladığı listeden (`site/data/mevkiler.json`) gelir;
   sonradan BSL'ye katılan oyuncular istatistikten tahmin edilir. Her tıklama hemen kaydedilir.
3. Yönetici sayfası → **Oyuncu havuzunu yükle** (draftta seçilebilecek oyuncular, mevkileri ve otomatik
   seçim sıralaması bu anki VP ortalamalarıyla sabitlenir; draft başlatılırken son haliyle yeniden yüklenir).
4. **Kurayı çek** → herkesin ekranında sıra 17'den 1'e doğru canlı açılır.
5. Herkes hazır olunca **Draftı başlat**.
6. Draft sırasında:
   - Sırası gelen menajerin ekranında "Sıra sende!" çıkar, ses ve titreşim olur.
   - Süre dolarsa müsait en iyi 15 oyuncudan (sezon VP ortalamasına göre) rastgele biri otomatik seçilir.
     Bunu açık olan herhangi bir menajer ekranı yapar; en az bir menajerin (ya da yöneticinin) sayfası
     açık olmalı.
   - **Kadro kuralı**: As beşi **3 Ön + 2 Arka**, 2 Yedeğin mevkisi serbest. As'ta en az 1, Yedekte
     en az 1 Türk oyuncu (TÜRKİYE/KKTC). Bu kuralı imkânsız kılacak seçime izin verilmez (ör. 4 yabancı
     Ön alan takım 5. seçimde yabancı Ön alamaz); site, sırası gelen takımın o an seçebileceği oyuncu
     türlerini gösterir. Otomatik seçim de buna uyar.
   - Yönetici: **Duraklat / Devam ettir**, **Son seçimi geri al**, gerekirse sıradaki takım adına
     **Seç** (oyuncular listesinde).
7. Draft bitince takımlar **Kadrom** sayfasından As/Yedek dizilişini serbestçe kurar
   (As 3 Ön + 2 Arka; As'ta ve Yedekte en az 1'er Türk).
8. Puanlamanın başlayacağı haftanın ilk maçından önce yönetici **Sezonu başlat**'a basar →
   dizilişler kilitlenir.

> **Deneme draftı:** Gerçek drafttan önce süreyi 10 sn yapıp birkaç arkadaşla deneyebilirsin.
> Sonra Yönetici → **Draftı sıfırla** ile her şey silinir (takımlar, menajerler ve linkler kalır),
> süreyi tekrar 90 sn yap.

## 5. Sezon boyunca

- **Puan Durumu**: haftalık sıralama ve genel klasman. Haftalık puanlar
  5,5,5,4,4,4,4,3,3,3,3,2,2,2,1,1,1. Puanlar TBL fantezi ligiyle aynı kurallarla hesaplanır
  (As'ların VP toplamı; süre almayan As'ın yerine en yüksek VP'li yedek sayılır; eşitlikte en iyi
  Türk oyuncunun VP'si).
- **Takas**: sınırsız, iki taraf kabul etmeli, iki taraftan 1–3'er oyuncu. Gelen oyuncu gidenin yerine
  geçer; As'taki bir oyuncunun yerine aynı mevkiden oyuncu gelmeli.
- **Serbest Oyuncular**: sezon boyunca takım başına 2.
- **Kadrom → As–Yedek değişikliği**: sezon boyunca takım başına 1.
- Bütün değişiklikler, ilk maçı henüz başlamamış ilk haftadan itibaren geçerlidir.
- **Hareketler**: herkesin görebildiği işlem geçmişi.

### Haftalık veri güncellemesi

- `guncelle.bat`'a çift tıkla: TBF'den verileri çeker ve siteye gönderir (birkaç dakikada yayında).
  Haftanın maçları bitince (genelde Pazartesi gecesi) bir kez yeterli; istersen maç günlerinde de
  çalıştırabilirsin.
- **Otomatik güncelleme:** `gorev_kur.bat`'a bir kez çift tıkla. Bilgisayar açık ve internete bağlı olduğu sürece her gün
  **12:30 ve 23:45'te** arka planda (pencere açılmadan) tam güncelleme yapılır: oyuncu listesi, transferler, fikstür,
  biten haftaların kesin VP'leri. Ne olduğunu klasördeki `guncelle.log` dosyasında görebilirsin. Kaldırmak için `gorev_kaldir.bat`.
- **Canlı skor ve VP:** Bilgisayarda bir şey gerekmez. TBL Fantezi Ligi'nin telefondaki (Termux) güncellemesi maç
  saatlerinde 3 dakikada bir BSL'nin canlı skorlarını ve kutu skorlarını yayınlıyor; BSL Fantezi sitesi, bu haftanın
  başlamış ama kesinleşmemiş maçlarını oradan dakikada bir okur. Puan durumu ve Maçlar sekmesi canlı değişir.
  - TBL tarafındaki güncelleme durursa canlı veri de durur (günde 2 güncelleme kesin sonuçları yine getirir). O durumda
    yedek olarak bilgisayardan 3 dakikalık canlı güncelleme açılabilir: komut isteminde `gorev_kur.bat canli`.

### Yöneticiler ve bildirimler

- **Yönetici sayfası → Yöneticiler**: seçtiğin takımların menajerleri kendi takımlarıyla oynarken yönetici de olur
  (sen ve arkadaşın için). Ligi kuran Google hesabı her zaman yöneticidir.
- Yöneticilerin başlığında **🔔** var: mevkisi belirlenmemiş oyuncular (yeni transferler, Ön/Arka tek dokunuşla seçilir),
  lisansı düşen oyuncular ve BSL kadro hareketleri (lige katılan, takım değiştiren, ayrılan) orada görünür.
- **Lisansı düşen oyuncu**: bir takımdaki oyuncu TBF kadrolarından çıkarsa (ligden ayrılırsa) o takımın menajerine her
  sayfada uyarı çıkar; boştakilerden kurallara uygun bir oyuncu almak zorundadır (serbest oyuncu hakkından düşmez).
  Bu değişikliği yapana kadar takas ve As–Yedek değişikliği yapamaz. (Listeyi bir yöneticinin siteyi açması günceller.)
- **Draft sırasında** yöneticilerin yan panelinde araç kutusu var: duraklat/devam, +30 sn, saati baştan başlat,
  son seçimi geri al. Draft tahtasında bir seçime dokunarak o seçimi başka bir oyuncuyla değiştirebilirsin
  (sezon başlayana kadar).

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| "Firebase ayarları girilmemiş" | `site/config.js` doldurulmamış (1. bölüm, 4. adım). |
| "Bağlantı kurulamadı" / Google girişi açılmıyor | Google ve Anonymous girişi açık mı, Authorized domains'e site eklendi mi (1. bölüm, 7–8). |
| "Bu işleme izin yok" | Sayfayı yenile. Devam ederse `firestore.rules` Firebase'e yapıştırılmış mı? |
| Menajer davet linkini kaybetti (henüz katılmadıysa) | Yönetici → Linki kopyala → tekrar gönder. |
| Davet linki başkasının eline geçti | Kullanılmadıysa: Yönetici → Yeni link. Kullanıldıysa: o hesabı **Çıkar**, yeni linki doğru kişiye gönder. |
| "Bu Google hesabı bir takıma bağlı değil" | Kişi davet linkini açtığı hesaptan farklı bir Google hesabıyla girmiş; doğru hesapla çıkış/giriş yapsın. |
| Yanlış seçim yapıldı | Yönetici → Son seçimi geri al (sadece en son seçim). |

## Ücretsiz kota

Firebase Spark planı günde 50.000 okuma ve 20.000 yazma verir. 17 kişilik bir lig için draft günü
dahil bu sınırın çok altında kalınır (site, sezon boyunca draft seçimlerini değil sadece kadroları
canlı dinler).

## Geliştirici notları

- `veri_guncelle.py`: TBF API (BSL lig id 22214, sezon 174). Biten maçlar `cache/`'de saklanır.
- `site/core.js`: draft sırası, otomatik seçim, Türk kuralı, puanlama (saf fonksiyonlar).
- `site/db.js`: Firestore işlemleri (seçim, takas, serbest oyuncu… hepsi tek işlemde/transaction).
- `firestore.rules`: kim neyi yazabilir (sıra, süre, tek takım kuralı, haklar, Türk kuralı).
- Yerel deneme: `localhost`'ta açılan site Firebase emülatörüne bağlanır.
  `firebase emulators:start --only firestore,auth --project demo-bsl-draft`, ardından
  `python -m http.server 8765 --directory site` ve `cd test && npm install && node deneme_draft.mjs`
  (17 takımlık tam deneme draftı ve kural testleri).
