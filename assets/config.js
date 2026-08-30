// ============================================================
//  AHDEM Oylama — ayarlar
//  Supabase kurulumundan sonra aşağıdaki üç değeri doldur.
//  Supabase panelinde: Project Settings > API
// ============================================================

export const CONFIG = {
  // "Project URL" — örn. https://abcdefgh.supabase.co
  supabaseUrl: "https://rihsxwvfieuyyjivyker.supabase.co",

  // API Keys sayfasındaki "Publishable key" (sb_publishable_... ile başlar).
  // Eski panellerde adı "anon public" idi; ikisi de çalışır.
  // Bu anahtarın herkese görünür olması normaldir; veriyi koruyan şey
  // veritabanındaki RLS kurallarıdır.
  // "Secret key" (sb_secret_... / service_role) BURAYA ASLA YAZILMAZ.
  supabaseAnonKey: "sb_publishable_OMCkC2MWCUwJO0CJllEN9g_xAq5jM_A",

  // Divan panelinin giriş yaptığı hesabın e-postası.
  // Supabase > Authentication > Users içinde oluşturduğun kullanıcı.
  // Şifreyi buraya YAZMA; şifre giriş ekranında sorulur.
  adminEmail: "divan@ahdem.online",

  // Salonda perdeye yansıtılacak ekranın başlığı
  kurumAdi: "AHDEM",
  meclisAdi: "Genel Kurul",
};
