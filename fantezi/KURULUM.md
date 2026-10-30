# Pota Altı BSL Fantezi Ligi — Kurulum ve Kullanım Rehberi

Bu proje, TBL fantezi liginden **tamamen ayrı** bir sitedir. Menajerler (takım sayısı serbest) BSL oyuncularını canlı draftla
seçer; sezon boyunca takas, serbest oyuncu ve As–Yedek değişikliği yapar; puanlar BSL'deki VP'lerden
hesaplanır.

- **Site**: Pota Altı App'in bir bölümü olarak GitHub Pages'te yayınlanır (web dosyaları `site/bsl/`, adresi uygulamanın `bsl/` sayfası).
  Ortak fantezi lig motoru `site/fantezi/` (BSL ve TBL aynı kodu kullanır), Firebase kuralları ve testler `fantezi/`,
  BSL veri betiği ve `.bat` dosyaları `bsl/` klasöründe.
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
   projectId, storageBucket, messagingSenderId, appId) `site/bsl/config.js` dosyasına yapıştır
   (ya da bana gönder, ben yerleştireyim — bu bilgiler gizli değildir).
5. Sol menü **Build → Firestore Database** → **Create database** → konum: `eur3 (europe-west)` →
   **Start in production mode** → Oluştur.
6. Aynı sayfada **Rules** sekmesi → oradaki her şeyi sil → bu projedeki `fantezi/firestore.rules` dosyasının
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
   seçim süresini (90 sn = 1,5 dk) ve takım sayısını gir → **Ligi kur**. Takım sayısının sınırı yok; kura çekilene kadar
   Yönetici sayfasından **+ Takım ekle** / **Son takımı çıkar** ile değiştirilebilir (oyuncu havuzu bütün seçimlere
   yetmeli: takım başına 7 oyuncu).
3. Ligi kuran **Google hesabı yönetici** olur. Başka cihazdan da aynı Google hesabıyla girmen yeterli.
4. **Yönetici** sayfasında takım adlarını/menajerleri düzenle; her menajere kendi **davet linkini**
   **WhatsApp** düğmesiyle ya da **Linki kopyala** ile gönder.
   - Menajer linki açar → **Google ile giriş yap** → Google hesabı takımına bağlanır.
   - Davet linki **tek kullanımlıktır**: kullanıldıktan sonra başkası açsa da işe yaramaz.
   - Sonra menajer telefondan ya da bilgisayardan aynı Google hesabıyla **Giriş yap** der; link gerekmez.
   - Yönetici sayfasında her takımın hangi Google hesabına bağlı olduğu görünür. Yanlış hesap bağlandıysa
     **Çıkar** → takım için yeni davet linki oluşur, onu gönder.
   - Davet linki yanlış kişiye gittiyse (henüz kullanılmadan) **Yeni link** → eskisi iptal olur.
   - **Sen de oynuyorsan:** Yönetici sayfasında "Sen de oynuyor musun?" → takımını seç → **Takıma katıl**. Takımın
     yönetici takımı olur, yöneticiliğin sürer.
   - **Ortak menajer:** Bir takımı iki kişi yönetecekse takımın satırında **+ Ortak menajer davet et** → linki gönder.
     İkisi de takım adına her şeyi yapabilir; haklar (2 serbest oyuncu, 1 As–Yedek değişikliği) takımındır, kişi başı değil.
     Takım yönetici takımıysa ortak menajer de yönetici olur (ör. sen ve arkadaşın aynı takımda).

## 4. Draft günü

1. Draft'tan hemen önce bilgisayarda `guncelle.bat`'a çift tıkla (en güncel VP ortalamaları için),
   birkaç dakika bekle.
2. **Mevkiler** sayfasında (yönetici menüsü) oyuncuların mevkilerini kontrol et: **Ön** = uzun/forvet,
   **Arka** = oyun kurucu/şutör. Mevkiler yöneticinin hazırladığı listeden (`site/bsl/data/mevkiler.json`) gelir;
   sonradan BSL'ye katılan oyuncular istatistikten tahmin edilir. Her tıklama hemen kaydedilir.
3. Yönetici sayfası → **Oyuncu havuzunu yükle** (draftta seçilebilecek oyuncular, mevkileri ve otomatik
   seçim sıralaması bu anki VP ortalamalarıyla sabitlenir; draft başlatılırken son haliyle yeniden yüklenir).
4. **Kurayı çek** → herkesin ekranında sıra sondan başa doğru canlı açılır.
5. Herkes hazır olunca **Draftı başlat**.
6. Draft sırasında:
   - Sırası gelen menajerin ekranında "Sıra sende!" çıkar, ses ve titreşim olur.
   - **İstek listesi**: her menajer draft öncesinde ve sırasında oyuncu listesinde ☆'a basarak kendi
     sıralı listesini hazırlar (**İstek listem** sekmesinde ↑↓ ile sıralanır). Listeyi sadece o takım görür.
   - Süre dolarsa takımın istek listesindeki ilk müsait (ve kadro kuralına uyan) oyuncu seçilir; listede
     uygun oyuncu yoksa müsait en iyi 15 oyuncudan (sezon VP ortalamasına göre) rastgele biri otomatik seçilir.
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
- **Takas**: sınırsız, iki taraftan 1–3'er oyuncu. Karşı taraf kabul edince takas **yönetici onayına** gider:
  yöneticilerin 🔔 ve Takas sayfasında "Onayını bekleyen takaslar" çıkar, **Onayla** deyince oyuncular yer
  değiştirir, **Reddet** deyince takas iptal olur. Onay beklerken teklifi veren geri çekebilir. Gelen oyuncu
  gidenin yerine geçer; As'taki bir oyuncunun yerine aynı mevkiden oyuncu gelmeli.
- **Serbest Oyuncular**: sezon boyunca takım başına 2. Bir takımın bıraktığı ya da BSL'ye yeni katılan oyuncuyu
  **36 saat** kimse alamaz (⏳). Bu sürede takımlar Boştakiler'den ya da oyuncunun sayfasından **Talep et** der ve
  kazanırsa bırakacağı oyuncuyu seçer (serbest oyuncu hakkı kalmış olmalı). Kimlerin, kaç takımın talip olduğu
  oyuncunun sayfasında görünür. Süre bitince **talip olanlar arasında kura** çekilir: kazananın serbest oyuncu
  hakkından 1 düşer, bıraktığı oyuncunun 36 saati başlar; sonuç Hareketler'de talip olanlarla birlikte yazar.
  Talep eden olmazsa oyuncu boştakilere düşer ve isteyen doğrudan alır.
  - Kurayı bir **yöneticinin ekranı** otomatik çeker (site açıkken yarım dakikada bir bakar); süre bittiğinde
    hiçbir yönetici siteyi açmamışsa kura, bir yönetici açınca çekilir. Oyuncu sayfasında "Kurayı şimdi çek" de var.
  - Kura anında kurala uymayan talep (bırakacağı oyuncu artık kadrosunda değil, hakkı bitmiş, kadro kuralı
    bozuluyor) kuraya girmez.
  - Yeni katılanların 36 saatini de bir yöneticinin siteyi açması başlatır; yönetici oyuncu sayfasından beklemeyi
    kaldırabilir (talepler de silinir).
- **Oyuncu sayfası**: listelerde oyuncu adına dokununca sezon ortalamaları, maç maç dakika/sayı/ribaund/asist/VP
  (maça dokununca kutu skor), sıradaki maçlar, hangi fantezi takımında olduğu (ya da talepte/boşta) ve fantezi hareketleri görünür.
- **Maçlar**: maça dokununca çeyrek skorları ve iki takımın tam kutu skoru açılır; her oyuncunun altında fantezi takımı yazar,
  kendi oyuncuların vurgulanır. Kutu skorlar ve maç maç istatistikler TBL Fantezi Ligi sitesinin yayınladığı BSL verisinden okunur.
- **Puan durumu paylaşımı**: Genel klasman ve haftalık sıralamada **📤 Paylaş** (telefonda WhatsApp/Instagram menüsü açılır)
  ve **⬇** (görseli indir) düğmeleri var.
- **Boştakiler**: VP ortalaması, son haftanın VP'si ya da sayı ortalamasına göre sıralanır; aramada Türkçe karakter gerekmez
  ("sertac" yazınca "Sertaç" bulunur).
- **Telefona uygulama gibi ekleme**: Android'de Chrome menüsü → *Ana ekrana ekle*, iPhone'da Safari → Paylaş → *Ana Ekrana Ekle*.
  Bağlantı yokken ya da zayıfken son görülen veriler açılır.
- **Kadrom → As–Yedek değişikliği**: sezon boyunca takım başına 1.
- Bütün değişiklikler, ilk maçı henüz başlamamış ilk haftadan itibaren geçerlidir.
- **Hareketler**: herkesin görebildiği işlem geçmişi.

### Haftalık veri güncellemesi

- `bsl/guncelle.bat`'a çift tıkla: TBF'den BSL verilerini çeker, Pota Altı App'in TBL/BSL puan tablosu ve liderlerini
  (`veri/uret.py`) yeniler ve siteye gönderir (birkaç dakikada yayında).
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
- **Tam yetki (draft sonrası)**: bir takımın sayfasında (Takımlar → takım) "Yönetici: kadroyu düzenle" kutusu var:
  takımın herhangi bir oyuncusunu boştaki biriyle değiştir (hak ve bekleme aranmaz), As/Yedek dizilişini doğrudan
  kur, kullanılan serbest oyuncu / As–Yedek haklarını düzelt. Kural dışı bir kadro olacaksa site uyarır ama
  engellemez. Yönetici değişiklikleri Hareketler'de görünür.

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| "Firebase ayarları girilmemiş" | `site/bsl/config.js` doldurulmamış (1. bölüm, 4. adım). |
| "Bağlantı kurulamadı" / Google girişi açılmıyor | Google ve Anonymous girişi açık mı, Authorized domains'e site eklendi mi (1. bölüm, 7–8). |
| "Bu işleme izin yok" | Sayfayı yenile. Devam ederse `firestore.rules` Firebase'e yapıştırılmış mı? |
| Menajer davet linkini kaybetti (henüz katılmadıysa) | Yönetici → Linki kopyala → tekrar gönder. |
| Davet linki başkasının eline geçti | Kullanılmadıysa: Yönetici → Yeni link. Kullanıldıysa: o hesabı **Çıkar**, yeni linki doğru kişiye gönder. |
| "Bu Google hesabı bir takıma bağlı değil" | Kişi davet linkini açtığı hesaptan farklı bir Google hesabıyla girmiş; doğru hesapla çıkış/giriş yapsın. |
| Yanlış seçim yapıldı | Yönetici → Son seçimi geri al (sadece en son seçim). |

## Ücretsiz kota

Firebase Spark planı günde 50.000 okuma ve 20.000 yazma verir. 17 kişilik bir lig için (örnek) draft günü
dahil bu sınırın çok altında kalınır (site, sezon boyunca draft seçimlerini değil sadece kadroları
canlı dinler).

## Geliştirici notları

- `veri_guncelle.py`: TBF API (BSL lig id 22214, sezon 174). Biten maçlar `cache/`'de saklanır.
- `site/fantezi/`: iki ligin ortak motoru. `core.js`: draft sırası, otomatik seçim, kadro kuralları, puanlama;
  `db.js`: Firestore işlemleri (seçim, takas, serbest oyuncu… hepsi tek işlemde/transaction); `app.js`: ekranlar.
  Her ligin klasörü (`site/bsl/`, `site/tbl/`) sadece sayfa, `config.js` (Firebase projesi + lig ayarı) ve veri tutar;
  sayfadaki import map (`lig-ayar`) motora hangi ligin ayarını kullanacağını söyler.
- `fantezi/firestore.rules`: kim neyi yazabilir (sıra, süre, tek takım kuralı, haklar). İki ligin projesine de aynı kurallar yüklenir.
- Yerel deneme: `localhost`'ta açılan site Firebase emülatörüne bağlanır.
  `fantezi/` klasöründe `firebase emulators:start --only firestore,auth --project demo-bsl-draft` (iki ligin deneme
  projesi birlikte çalışır), depo kökünde `python -m http.server 8790 --directory site`
  (BSL: `http://localhost:8790/bsl/`, TBL: `http://localhost:8790/tbl/`), sonra `cd fantezi/test && npm install` ve
  `node deneme_draft.mjs` (17 takımlık tam BSL draftı ve kural testleri), `node tbl.mjs` (TBL içe aktarma ve menajer işlemleri).

## TBL Fantezi Ligi (menajer girişli)

TBL Fantezi Ligi de aynı motorla `tbl/` adresinde çalışır. Farkları:
- **Draft yok:** Yönetici ligi kurarken eski TBL Fantezi Ligi'nin takımları, menajer adları ve her haftanın kadrosu aktarılır
  ("Ligi kur ve kadroları aktar"); geçmiş haftaların puanları değişmez, sezon hemen başlar.
- **Kurallar** (`site/tbl/config.js`): 5 As + 2 Yedek, As'ta en fazla 2 yabancı (TÜRKİYE/KKTC Türk sayılır); sezonda **2 transfer hakkı**
  — serbest oyuncu almak da As–Yedek değişikliği de 1 hak kullanır (`ortakHak`); bırakılan ya da lige yeni katılan oyuncu için
  **24 saat** talep ve kura (`beklemeSaat`); takas ve Hareketler sayfası yok. Lisansı düşen yabancının yerine TBL takımının aldığı
  yabancı fantezi takımına otomatik geçer, hak düşmez; yerine kimse gelmezse menajer boştakilerden zorunlu değişiklik yapar (hak düşmez).
- **Veri:** Haftalık VP'ler, maçlar ve oyuncu listesi eski TBL Fantezi sitesinin dosyalarından okunur (Termux günceller); puanlar onunla
  birebir aynıdır. Haftaların başlangıç saatleri ve TBL kadro hareketleri `veri/uret.py` ile `site/tbl/data/`'ya yazılır.
  Eski site (`potaalti.github.io/tbl_fantezi_lig`) veri kaynağı olarak yayında kalır; yeni uygulama `potaalti.github.io` kökündedir,
  ikisi aynı anda çalışır.

### Yayına alma ve menajerleri dahil etme

**A. GitHub (bir kez, sen):**
1. `potaalti` organizasyonunda yeni depo: adı tam olarak **`potaalti.github.io`**, Public, README/gitignore ekleme (boş).
2. Depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Bana haber ver; bu klasörü o depoya gönderirim. `.github/workflows/yayinla.yml` `site/` klasörünü her gönderimde yayınlar:
   ana uygulama `https://potaalti.github.io/`, TBL Fantezi `https://potaalti.github.io/tbl/`, BSL Fantezi `https://potaalti.github.io/bsl/`.

**B. TBL için Firebase projesi (bir kez, sen):** 1. bölümdeki 1–8. adımlar, BSL'den **ayrı** bir proje olarak
(ör. ad: `pota-alti-tbl-fantezi`): Firestore (eur3, production), Rules'a `fantezi/firestore.rules`'un tamamı, Authentication'da
Google + Anonymous, Authorized domains'e `potaalti.github.io`. Web uygulamasının `firebaseConfig` değerlerini `site/tbl/config.js`'e
yapıştır ya da bana gönder (gizli değildir).

**Geçiş gününden önce deneme:** Ligi istediğin zaman kurup (C.3) yönetici olarak her ekranı dolaşabilirsin; menajerlere link
göndermediğin sürece kimse bir şey değiştiremez. Eski siteye yeni kadro değişiklikleri girdikçe **Yönetici → Eski siteden yeniden aktar**
ligi eski sitenin son haline getirir (kadrolar, haftalık geçmiş ve haklar baştan yazılır; takımlar, davet linkleri ve bağlı hesaplar kalır).
Geçiş gününde son bir yeniden aktarım yapıp linkleri gönderirsin. Menajerler yeni sitede değişiklik yapmaya başladıktan sonra kullanma.

**C. Geçiş günü** (bir haftanın maçları bitmiş, sıradaki hafta başlamamışken):
1. Eski sitede o güne kadarki bütün kadro değişikliklerinin girildiğinden emin ol (Termux güncellemesi de çalışmış olsun).
2. (İstersen ben yaparım) Karşılaştırmayı çalıştır: emülatör ve yerel site açıkken `cd fantezi/test && npm install && node tbl-karsilastir.mjs` → "0 fark" görmelisin.
3. `https://potaalti.github.io/tbl/` → **Google ile giriş yap** → kurulum ekranında:
   - **Şimdiye kadarki transferler** tablosunu kontrol et (her satırda hak / hak yok ve nedeni yazar).
   - **Kullanılan transfer hakkı** sütununu gerekirse düzelt (ör. TBF verisi gecikmiş bir otomatik değişiklik 1 hak sayıldıysa 0 yap).
   - **Ligi kur ve kadroları aktar**. Ligi kuran Google hesabı yönetici olur.
4. **Yönetici** sayfası → **Takımlar ve davetler**: her takımın satırındaki **WhatsApp** düğmesiyle menajerine kendi davet linkini gönder
   (link tek kullanımlık). Sen de bir takımı yönetiyorsan "Sen de oynuyor musun?" → takımını seç → **Takıma katıl**.
   Ortak menajerli takımlarda **+ Ortak menajer davet et**.
5. Gruba duyuru at (aşağıdaki metin). Yönetici sayfasında kimin bağlandığını (✓ e-posta) takip et; bağlanmayanlara linki tekrar hatırlat.
6. Bu tarihten sonra kadro değişiklikleri sadece yeni sistemden yapılır; eski sitedeki `kadrolar.csv` artık güncellenmez
   (eski site sadece veri kaynağı olarak çalışmaya devam eder). Herkes geçince eski sitenin ana sayfasına yeni adrese yönlendiren
   bir not/bağlantı eklenir.

**Gruba duyuru metni:**

> 🏀 Pota Altı TBL Fantezi Ligi yeni evine taşındı: **potaalti.github.io/tbl**
> Takımın, kadron ve bütün puanların aynen duruyor. Artık kadro değişikliklerini kendin yapacaksın:
> • Sezonda **2 transfer hakkın** var: serbest oyuncu almak da As–Yedek değişikliği de 1 hak.
> • Bırakılan ya da lige yeni gelen oyuncuyu **24 saat** kimse alamaz; bu sürede talep edenler arasında kura çekilir.
> • Yabancın lisansını kaybeder ve takımı yerine yabancı alırsa, yeni oyuncu sana **otomatik** geçer, hak gitmez.
> • As'ta en fazla 2 yabancı.
> Sana özel davet linkini birazdan özelden gönderiyorum. Linki aç, **Google ile giriş yap**, bitti. Sonraki girişlerde linke gerek yok,
> aynı Google hesabıyla girmen yeterli. Telefonda "Ana ekrana ekle" dersen uygulama gibi açılır.
