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
- **Fantezi → TBL Fantezi Ligi:** Takımım (takım seçimi cihazda hatırlanır), Haftalık sıralama, Genel klasman, takım sayfaları
  (As/Yedek, yerine giren yedek, haftalar), Boştakiler; sıralamalar görsel olarak paylaşılır/indirilir.
- Veriler (kadrolar, haftalık VP'ler, ayarlar) TBL Fantezi sitesinden okunur; geçmiş haftalar ve kadrolar aynen korunur.
- Puanlama, TBL Fantezi sitesinin `scoring.js` dosyasının birebir kopyası (`site/tbl-puanlama.js`) ile yapılır.
- `test/tbl-fantezi-karsilastir.mjs`: eski siteyle her haftanın sıralamasını, genel klasmanı ve her takımın her haftasındaki
  oyuncuları birebir karşılaştırır (2026-10-30: 71 karşılaştırma, 0 fark). Eski adres, geçiş günü bu karşılaştırma tekrar
  çalıştırıldıktan sonra uygulamaya yönlendirilecek.

## 3. aşama: BSL Fantezi Ligi uygulamanın içinde
- BSL Fantezi Ligi (eski `bsl-draft` deposu, bütün geçmişiyle) bu depoya alındı: web dosyaları `site/bsl/` (adres: `bsl/`),
  Firebase kuralları, veri betiği, `.bat` dosyaları, testler ve kurulum rehberi `bsl/` klasöründe (`bsl/KURULUM.md`).
- Fantezi menüsündeki BSL kartı ve davet linkleri `bsl/` sayfasını açar; başlıktaki Pota Altı simgesi ana uygulamaya döner.
  Telefona eklenince tek uygulama kurulur (ortak manifest ve service worker).
- `bsl/guncelle.bat` (günde 2 kez zamanlanmış) BSL verisini çeker, `veri/uret.py` ile TBL/BSL puan tablosu ve liderleri yeniler, ikisini birlikte yayınlar.
- Testler: `bsl/test/deneme_draft.mjs` (Firebase emülatörü `bsl/` klasöründen başlatılır), 2026-10-30: 119 kontrol, 0 hata.

## 4. aşama: YouTube ve ana sayfa
- **Yayın** sekmesi: Pota Altı YouTube kanalının ([@potaaltitv](https://www.youtube.com/@potaaltitv)) son canlı yayını oynatıcıda,
  altında geçmiş canlı yayınlar, videolar ve kısa videolar; dokunulan video uygulamanın içinde oynar. Kanala git / Katıl bağlantıları.
- **Ana sayfa:** en üstte son yayın; kanal canlıysa "🔴 Pota Altı şu an canlı" kartı. Canlı yayın, YouTube'un gömülü oynatıcısıyla
  birkaç dakikada bir sayfada kontrol edilir (API anahtarı gerekmez).
- Liste `veri/uret.py` ile üretilir (`site/data/youtube.json`): video akışı (RSS) ve kanalın Canlı sekmesi. Kanal `veri/uret.py`
  içindeki `YOUTUBE` ayarındadır.

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
