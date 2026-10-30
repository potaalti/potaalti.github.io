# Pota Altı App

TBL ve BSL için tek uygulama: canlı skorlar, kutu skorlar, puan tablosu, istatistik liderleri, takım ve oyuncu
sayfaları; ileride TBL ve BSL fantezi ligleri ve Pota Altı YouTube yayınları.

## 1. aşama (bu sürüm): herkese açık bölüm
- **Ana sayfa:** iki ligin bu haftaki maçları (canlı), puan tablosu özeti, liderler, fantezi bağlantıları
- **Maçlar:** lig ve hafta seçimi, canlı skor (maç saatlerinde dakikada bir yenilenir), maç sayfasında çeyrekler ve kutu skor (+/- dahil)
- **TBL / BSL:** puan tablosu (G/M, averaj, son 5 maç), istatistik liderleri, takımlar, oyuncular (arama ve sıralama)
- **Takım sayfası:** maç başı takım istatistikleri, maçlar, kadro
- **Oyuncu sayfası:** sezon ortalamaları, maç maç istatistikler
- Telefona uygulama gibi eklenebilir (PWA), giriş gerekmez

## 2. aşama: TBL Fantezi Ligi uygulamanın içinde
- İlk sürümdeki salt okunur TBL Fantezi bölümü kaldırıldı; TBL Fantezi artık ortak fantezi motoruyla `tbl/` adresinde çalışır
  (bkz. "TBL Fantezi: menajerler kendi değişikliklerini yapar"). Eski `#/fantezi/tbl` adresi `tbl/` sayfasına yönlenir.

## 3. aşama: BSL Fantezi Ligi uygulamanın içinde
- BSL Fantezi Ligi (eski `bsl-draft` deposu, bütün geçmişiyle) bu depoya alındı: web dosyaları `site/bsl/` (adres: `bsl/`),
  veri betiği ve `.bat` dosyaları `bsl/` klasöründe; ortak motorun Firebase kuralları, testleri ve kurulum rehberi `fantezi/` klasöründe (`fantezi/KURULUM.md`).
- Fantezi menüsündeki BSL kartı ve davet linkleri `bsl/` sayfasını açar; başlıktaki Pota Altı simgesi ana uygulamaya döner.
  Telefona eklenince tek uygulama kurulur (ortak manifest ve service worker).
- `bsl/guncelle.bat` (günde 2 kez zamanlanmış) BSL verisini çeker, `veri/uret.py` ile TBL/BSL puan tablosu ve liderleri yeniler, ikisini birlikte yayınlar.
- Testler: `fantezi/test/deneme_draft.mjs` (Firebase emülatörü `fantezi/` klasöründen başlatılır), 2026-10-30: 120 kontrol, 0 hata.

## 4. aşama: YouTube ve ana sayfa
- **Yayın** sekmesi: Pota Altı YouTube kanalının ([@potaaltitv](https://www.youtube.com/@potaaltitv)) son canlı yayını oynatıcıda,
  altında geçmiş canlı yayınlar, videolar ve kısa videolar; dokunulan video uygulamanın içinde oynar. Kanala git / Katıl bağlantıları.
- **Ana sayfa:** en üstte son yayın; kanal canlıysa "🔴 Pota Altı şu an canlı" kartı. Canlı yayın, YouTube'un gömülü oynatıcısıyla
  birkaç dakikada bir sayfada kontrol edilir (API anahtarı gerekmez).
- Liste `veri/uret.py` ile üretilir (`site/data/youtube.json`): video akışı (RSS) ve kanalın Canlı sekmesi. Kanal `veri/uret.py`
  içindeki `YOUTUBE` ayarındadır.

## TBL Fantezi: menajerler kendi değişikliklerini yapar
- BSL Fantezi'nin motoru ortak hale getirildi (`site/fantezi/`); TBL Fantezi aynı kodla `tbl/` adresinde, kendi Firebase projesiyle çalışır.
- Draft yok: eski TBL Fantezi'nin kadroları ve haftalık geçmişi içe aktarılır. Kurallar: 5 As + 2 Yedek, As'ta en fazla 2 yabancı,
  sezonda 2 serbest oyuncu, 36 saat talep ve kura, sınırsız As–Yedek değişikliği. TBL'de takas ve Hareketler sayfası yok
  (`site/tbl/config.js`: `takas: false, hareketler: false`).
- Yabancı oyuncunun lisansı düşer ve TBL takımı yerine yabancı alırsa, yeni oyuncu fantezi takımına otomatik geçer (hak düşmez).
- Kurulum ekranı eski sitedeki transferleri listeler ve takımların kullandığı serbest oyuncu haklarını hesaplar (aktarmadan önce değiştirilebilir).
- Puanlar ve kadrolar eski siteyle birebir aynı (2026-10-30: 2 hafta, 17 takımın her haftaki oyuncuları, genel klasman ve bugünkü kadrolar, 54 karşılaştırma, 0 fark).
- Testler emülatörde ayrı projelerde çalışır (`demo-tbl-test`, `demo-bsl-test`), yerel önizlemenin verisini bozmaz; `tbl-karsilastir.mjs` önizlemenin projesine (`demo-tbl-fantezi`) temiz aktarım yapar.
- TBL'de oyuncuların yanında Türk (TR) rozeti gösterilmez.
- Testler: `fantezi/test/tbl.mjs` (21 kontrol), `fantezi/test/tbl-karsilastir.mjs` (eski siteyle puan karşılaştırması). Kurulum: `fantezi/KURULUM.md` → "TBL Fantezi Ligi".

## Arayüz: bilgisayar ve telefon ayrı düzen
- Bilgisayarda (1100 px ve üstü) solda sabit yan menü, ana sayfada iki lig yan yana; fantezi liglerinde hesap kutusu ve ana sayfaya dönüş yan menünün altında.
- Telefonda (760 px altı) uygulama görünümü: altta sekmeler, ana sayfada TBL | BSL seçici (seçim cihazda hatırlanır), maçlar skor uygulaması gibi alt alta.
- Ortak görsel katman `site/cila.css` (ana uygulama ve iki fantezi ligi birlikte kullanır): gölgeli kartlar, ilk üçe madalya, degrade düğmeler.

## Veriler
- Canlı veriler (maç listeleri, kutu skorlar) TBL Fantezi Ligi sitesinin yayınladığı dosyalardan okunur
  (`https://potaalti.github.io/tbl_fantezi_lig/data`); bu dosyaları telefondaki Termux güncellemesi üretir.
- Puan tablosu, liderler, takım ve oyuncu sezon istatistikleri `veri/uret.py` ile üretilir (`site/data/`):

```
python veri/uret.py
```

  İlk çalıştırmada bütün kutu skorlar indirilir (birkaç dakika); biten maçlar `cache/` klasöründe saklanır, sonraki
  çalıştırmalar saniyeler sürer. Yerel kopyadan üretmek için: `python veri/uret.py --kaynak C:/.../tbl-fantezi/site/data`

## Yerelde çalıştırma
```
python -m http.server 8790 --directory site
```
Sonra tarayıcıda `http://localhost:8790`.

## Notlar
- Puan tablosu galibiyete, eşitlikte sayı averajına göre sıralanır; TBF'nin resmi sıralamasında ikili averaj gibi farklı
  eşitlik kuralları olabilir.
- Kaynakta saati belli olmayan ileri tarihli maçlar skorsuz "canli" gelebiliyor; uygulama ve veri üreticisi bunları
  "oynanmadı" sayar.
