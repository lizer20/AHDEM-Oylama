# AHDEM Oylama — Proje Planı

Meclis simülasyonu için, ahdem.online'dan **tamamen bağımsız** ama aynı temayı
kullanan bir oylama uygulaması. Kurulum adımları için `README.md`.

## Kararlar

| Konu | Karar |
|---|---|
| Oy verme | Her vekil kendi telefonundan |
| Kimlik | Sadece ad-soyad; isim kilidi + cihaz kilidi |
| Sonuç | Canlı, anlık |
| Yayın | GitHub Pages → sonra oylama.ahdem.online |
| Veri | Supabase (ücretsiz), canlı yayın (realtime) |
| Ekranlar | Vekil (`index.html`), Yansıtma (`ekran.html`), Divan (`divan.html`) |
| Seçenekler | Serbest N seçenek + hazır şablonlar |
| Oy tipi | Tek seçim |
| Karar kuralı | Otomatik karar yok — sadece sayılar ve yüzdeler |
| Gizlilik | Oylama başına: açık / gizli (gizlilik RLS ile gerçek) |
| Gruplar | Yok (her konferansta değiştiği için kaldırıldı) |
| Akış | Süre yok · oy değiştirilebilir · yoklama göstergesi var |
| Aynı anda | Tek aktif oylama |
| Divan | Tek paylaşılan şifre, sınırsız eşzamanlı kullanıcı |
| Tutanak | Excel (`.csv`, UTF-8, `;` ayraçlı) |
| Dil | Türkçe |

## Tema (ahdem.online'dan alındı)

```
--ink:   #12203A   --ink-2: #1A2C4B   --ink-soft: #2E4260
--paper: #FAF7F1   --paper-2: #F1ECE3
--gold:  #B8862F   --gold-soft: #E8D5AC
--line:  #D9D1C4   --line-2: #E6E0D5   --muted: #6B7A90
font: Poppins · köşe yarıçapı: 3px
```

Vekil ve divan ekranları açık (kağıt) temadadır. Yansıtma ekranı, projeksiyonda
okunaklılık için koyu lacivert zemin + altın vurgu kullanır; renkler yine
aynı palettendir.

## Dosya düzeni

```
index.html              vekil ekranı (telefon)
ekran.html              yansıtma ekranı (projeksiyon)
divan.html              yönetici paneli
assets/config.js        Supabase adresi ve anahtarı — kurulumda doldurulur
assets/app.js           ortak yardımcılar
assets/style.css        ortak stil (açık + koyu tema)
supabase/schema.sql     veritabanı şeması, güvenlik kuralları, trigger'lar
logolar/                AHDEM logoları
```

## Sonraya bırakılanlar

* Karar yeter sayısı / nitelikli çoğunluk hesabı (veri modelinde yeri hazır)
* Geri sayım süresi
* Grup/parti dökümü
* Perdede QR kod
