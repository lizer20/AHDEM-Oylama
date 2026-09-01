# AHDEM Oylama

Meclis simülasyonu için oylama uygulaması. ahdem.online'dan tamamen bağımsızdır;
yalnızca renkleri, yazı tipi ve logosu aynıdır.

| Sayfa | Kim kullanır | Ne yapar |
|---|---|---|
| `index.html` | Vekiller (telefon) | Ad-soyad ile salona girer, oy verir |
| `ekran.html` | Projeksiyon | Konuyu ve canlı sonucu perdeye yansıtır |
| `divan.html` | Divan | Oylama oluşturur, açar, kapatır, Excel'e aktarır |

Site **statik**tir (GitHub Pages'te çalışır). Oylar ücretsiz bir Supabase
veritabanında tutulur — cihazlar arası canlı sonuç bu sayede mümkün olur.

---

## Kurulum

### 1. Supabase projesi aç

1. https://supabase.com adresinden ücretsiz hesap aç.
2. **New project** → bir isim ver (örn. `ahdem-oylama`), bölge olarak
   **Frankfurt** veya **London** seç (Türkiye'ye en yakın olanlar).
3. Veritabanı şifresini bir yere kaydet. Projenin hazırlanması ~2 dakika sürer.

### 2. Veritabanını kur

1. Sol menüden **SQL Editor** → **New query**.
2. `supabase/schema.sql` dosyasının **tamamını** kopyalayıp yapıştır.
3. **Run** de. "Success" yazmalı.

### 3. Anonim girişi aç

Vekiller hesap açmadan oy verebilsin diye gerekli.

* **Authentication** → **Sign In / Providers** → **Anonymous sign-ins** → aç.

### 4. ⚠️ Hız sınırını yükselt — bu adımı atlama

Supabase varsayılan olarak **saatte yalnızca 30 anonim giriş** kabul eder ve bu
sınır **IP adresi başına**dır. Salondaki 140 kişi aynı Wi-Fi'ı kullanacağı için
hepsi tek bir IP'den görünür — sınır 30'da kalırsa 31. kişiden sonrası salona
giremez.

* **Authentication** → **Rate Limits** → *Rate limit for anonymous users*
  değerini **500** (veya daha yüksek) yap ve kaydet.

### 5. Divan hesabını oluştur ve yetkilendir

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. E-posta: `divan@ahdem.online` (istediğin bir adres olabilir).
3. Güçlü bir şifre yaz — divana girecek herkes bu tek şifreyi kullanacak.
4. **Auto Confirm User** kutusunu **işaretle**.

**Sonra yetkiyi ver.** Hesabı açmak tek başına divan yetkisi vermez; kullanıcının
`admins` tablosuna eklenmesi gerekir. **SQL Editor**'e dön ve şunu çalıştır:

```sql
insert into public.admins (user_id, note)
  select id, 'divan' from auth.users where email = 'divan@ahdem.online'
  on conflict (user_id) do nothing;

select u.email from public.admins a join auth.users u on u.id = a.user_id;
```

İkinci sorgu divan adresini döndürmeli. Boş dönerse e-posta adresi eşleşmiyordur.

> **Neden böyle?** Yetki, oturumun türüne değil kişiye bağlıdır. "Anonim olmayan
> herkes divandır" denseydi, projede e-posta kaydı açık olduğu için dışarıdan
> hesap açan biri divan yetkisi kazanır; oylama açıp kapatabilir, vekilleri ve
> oyları silebilirdi. `admins` tablosu bunu engeller — kayıtlar açık kalsa bile
> yeni bir hesabın hiçbir yetkisi olmaz.

### 6. Anahtarları siteye gir

**Project Settings** → **API Keys** sayfasından iki değeri kopyala ve
`assets/config.js` dosyasına yapıştır:

```js
supabaseUrl:     "https://xxxxxxxx.supabase.co",
supabaseAnonKey: "sb_publishable_...",
adminEmail:      "divan@ahdem.online",
```

İkinci değer **Publishable key**'dir (eski panellerde adı `anon public` idi;
ikisi de çalışır). Herkese görünür olması normaldir — veriyi koruyan şey
veritabanındaki RLS kurallarıdır.

**Secret key** (`sb_secret_...` / `service_role`) buraya asla yazılmaz; o anahtar
bütün güvenlik kurallarını atlar.

### 7. GitHub Pages'e yükle

```bash
git init
git add .
git commit -m "AHDEM oylama sitesi"
git branch -M main
git remote add origin https://github.com/KULLANICI/DEPO.git
git push -u origin main
```

Sonra depoda **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Bir iki dakika içinde `https://KULLANICI.github.io/DEPO/` adresinde yayına girer.

### 8. Kendi alan adına bağla (isteğe bağlı)

`oylama.ahdem.online` için alan adı sağlayıcında bir **CNAME** kaydı aç:
`oylama` → `KULLANICI.github.io`. Ardından GitHub'da
**Settings → Pages → Custom domain** alanına `oylama.ahdem.online` yaz.

---

## Konferans günü akışı

1. Perdedeki bilgisayarda `ekran.html`'i aç, tam ekran yap (F11).
2. Divan `divan.html`'i açıp şifreyle girer.
3. Vekiller telefonlarından siteye girip ad-soyadlarını yazar.
4. Divan konuyu ve seçenekleri girip **Oluştur ve Aç** der.
5. Herkesin telefonunda konu ve seçenekler belirir; oylar perdede canlı sayılır.
6. Divan **Oylamayı Kapat** der, sonuç kesinleşir.
7. Gerekirse **Excel'e Aktar** ile tutanak indirilir.

---

## Nasıl çalışıyor

* **Kimlik:** Vekiller hesap açmaz. Tarayıcı arka planda anonim bir oturum alır;
  ad-soyad bu oturuma bağlanır. Aynı isim ikinci kez kayıt olamaz (isim kilidi),
  aynı tarayıcı ikinci bir isim açamaz (cihaz kilidi).
* **Oy değişikliği:** Oylama kapanana kadar serbesttir; veritabanında tek satır
  güncellenir, sayaç otomatik düzeltilir.
* **Gizli oylama:** Tek tek oyları kimse okuyamaz — divan dahil. Bu, arayüzde
  gizlemekle değil, veritabanı kurallarıyla (RLS) sağlanır. Yalnızca toplam
  sayılar ve "kimin oy kullandığı" (yoklama) görünür.
* **Açık oylama:** Kimin ne oy verdiği divan panelinde ve tutanakta görünür.
* **Karar:** Sistem çoğunluk hesabı yapmaz, yalnızca sayıları ve yüzdeleri
  gösterir. Kararı başkan ilan eder.

## Bilinen sınırlar

* Divan şifresi tektir ve paylaşılır; kimin hangi işlemi yaptığı ayrıştırılmaz.
* Oylama açıkken bir vekilin kaydı silinirse verdiği oy da silinir, sayaç düşer.
* Excel çıktısı `.csv` biçimindedir (UTF-8 + noktalı virgül); Excel çift tıkla
  doğrudan açar, Türkçe karakterler ve sütunlar bozulmaz.
