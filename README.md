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
