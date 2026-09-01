-- ============================================================
--  AHDEM Oylama — Supabase veritabanı şeması
--  Supabase panelinde SQL Editor'e yapıştırıp RUN'a bas.
--  Tek seferde çalıştırılabilir; tekrar çalıştırmak zarar vermez.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tablolar ----------

-- Salona giren vekiller. id = Supabase'in verdiği anonim oturum kimliği.
create table if not exists public.voters (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null check (char_length(btrim(full_name)) between 3 and 80),
  name_key   text not null unique,           -- normalize edilmiş isim (mükerrer kilidi)
  created_at timestamptz not null default now()
);

-- Oylamalar. Aynı anda yalnızca bir tanesi 'open' olur.
create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,                  -- ekranın üstünde yazan konu
  subtitle   text,                            -- opsiyonel alt açıklama
  options    jsonb not null,                  -- ["Kabul","Ret","Çekimser"]
  secret     boolean not null default false,  -- gizli oylama mı
  status     text not null default 'draft' check (status in ('draft','open','closed')),
  created_at timestamptz not null default now(),
  opened_at  timestamptz,
  closed_at  timestamptz
);

-- Oylar. Bir vekil bir oylamada tek satır tutar (oy değiştirince güncellenir).
create table if not exists public.votes (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null references public.polls(id) on delete cascade,
  voter_id     uuid not null references public.voters(id) on delete cascade,
  option_index int  not null check (option_index >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (poll_id, voter_id)
);

-- Canlı sonuç sayacı. Trigger doldurur; kimse doğrudan yazamaz.
-- Gizli oylamada da herkesin güvenle okuyabildiği tek kaynak budur.
create table if not exists public.poll_tally (
  poll_id      uuid not null references public.polls(id) on delete cascade,
  option_index int  not null,
  count        int  not null default 0,
  primary key (poll_id, option_index)
);

alter table public.poll_tally replica identity full;
alter table public.votes      replica identity full;

-- ---------- Divan yetkisi ----------

-- Divan yetkisi olan kullanıcılar YALNIZCA bu tabloda tutulur.
--
-- DİKKAT — burada "anonim değilse divandır" DENMEZ. Denseydi, e-posta ile
-- hesap açan herhangi biri divan yetkisi kazanırdı: oylama açıp kapatabilir,
-- vekilleri ve oyları silebilirdi. Yetki kişiye bağlıdır, oturum türüne değil.
--
-- Tabloda RLS açık ve hiçbir politika yok; ayrıca yetkiler geri alınmıştır.
-- Yani istemci tarafından ne okunur ne yazılır. Sadece aşağıdaki
-- security definer fonksiyon okuyabilir.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admins where user_id = auth.uid())
$fn$;

-- ---------- Yardımcı fonksiyonlar ----------

-- Oy eklendikçe / değiştikçe sayacı güncelle
create or replace function public.sync_tally() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    insert into poll_tally (poll_id, option_index, count) values (new.poll_id, new.option_index, 1)
      on conflict (poll_id, option_index) do update set count = poll_tally.count + 1;

  elsif tg_op = 'UPDATE' then
    if new.option_index is distinct from old.option_index then
      update poll_tally set count = greatest(count - 1, 0)
        where poll_id = old.poll_id and option_index = old.option_index;
      insert into poll_tally (poll_id, option_index, count) values (new.poll_id, new.option_index, 1)
        on conflict (poll_id, option_index) do update set count = poll_tally.count + 1;
    end if;

  elsif tg_op = 'DELETE' then
    update poll_tally set count = greatest(count - 1, 0)
      where poll_id = old.poll_id and option_index = old.option_index;
  end if;
  return null;
end $fn$;

-- Yeni oylamanın her seçeneği 0 ile başlasın (ekranda hepsi görünsün diye)
create or replace function public.init_tally() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'UPDATE' and new.options is distinct from old.options then
    delete from poll_tally where poll_id = new.id;
  end if;
  insert into poll_tally (poll_id, option_index, count)
    select new.id, i, 0 from generate_series(0, jsonb_array_length(new.options) - 1) i
    on conflict do nothing;
  return new;
end $fn$;

create or replace function public.touch_vote() returns trigger
language plpgsql as $fn$
begin new.updated_at = now(); return new; end $fn$;

drop trigger if exists votes_tally    on public.votes;
drop trigger if exists votes_touch    on public.votes;
drop trigger if exists polls_tally_in on public.polls;
drop trigger if exists polls_tally_up on public.polls;

create trigger votes_tally    after insert or update or delete on public.votes
  for each row execute function public.sync_tally();
create trigger votes_touch    before update on public.votes
  for each row execute function public.touch_vote();
create trigger polls_tally_in after insert on public.polls
  for each row execute function public.init_tally();
create trigger polls_tally_up after update on public.polls
  for each row execute function public.init_tally();

-- Yoklama görünümü: KİMİN oy kullandığı görünür, NE oy verdiği görünmez.
-- Gizli oylamada da güvenle kullanılabilir.
create or replace view public.poll_participants
with (security_invoker = false) as
  select v.poll_id, v.voter_id, o.full_name, v.updated_at
  from public.votes v
  join public.voters o on o.id = v.voter_id;

-- Bu görünüm RLS'i bypass eder (security_invoker = false). Bu yüzden yalnızca
-- salona girmiş (oturum açmış) kullanıcılara verilir. "anon" rolüne verilseydi,
-- publishable anahtarı bilen herkes giriş bile yapmadan katılımcı listesini
-- okuyabilirdi.
revoke select on public.poll_participants from anon;
grant  select on public.poll_participants to authenticated;

-- ---------- Güvenlik (RLS) ----------

alter table public.voters     enable row level security;
alter table public.polls      enable row level security;
alter table public.votes      enable row level security;
alter table public.poll_tally enable row level security;

drop policy if exists voters_read   on public.voters;
drop policy if exists voters_insert on public.voters;
drop policy if exists voters_update on public.voters;
drop policy if exists voters_delete on public.voters;
create policy voters_read   on public.voters for select to authenticated using (true);
create policy voters_insert on public.voters for insert to authenticated with check (id = auth.uid());
create policy voters_update on public.voters for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy voters_delete on public.voters for delete to authenticated using (public.is_admin());

drop policy if exists polls_read  on public.polls;
drop policy if exists polls_write on public.polls;
create policy polls_read  on public.polls for select to authenticated using (true);
create policy polls_write on public.polls for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Oy satırları: herkes kendi oyunu ve AÇIK oylamaların tamamını görür.
-- Gizli oylamada tek tek oylar kimseye görünmez — divana bile. Gizlilik
-- "arayüzde göstermemek" ile değil, veritabanı düzeyinde sağlanır.
drop policy if exists votes_read   on public.votes;
drop policy if exists votes_insert on public.votes;
drop policy if exists votes_update on public.votes;
drop policy if exists votes_delete on public.votes;
create policy votes_read on public.votes for select to authenticated using (
  voter_id = auth.uid()
  or exists (select 1 from public.polls p where p.id = poll_id and p.secret = false)
);
create policy votes_insert on public.votes for insert to authenticated with check (
  voter_id = auth.uid()
  and exists (select 1 from public.polls p where p.id = poll_id and p.status = 'open')
);
create policy votes_update on public.votes for update to authenticated using (
  voter_id = auth.uid()
  and exists (select 1 from public.polls p where p.id = poll_id and p.status = 'open')
) with check (voter_id = auth.uid());
create policy votes_delete on public.votes for delete to authenticated using (public.is_admin());

-- Sayaç herkese açık okunur, kimseye açık yazılmaz (sadece trigger yazar).
drop policy if exists tally_read on public.poll_tally;
create policy tally_read on public.poll_tally for select to authenticated using (true);

-- ---------- Canlı yayın (Realtime) ----------

do $blk$
begin
  begin execute 'alter publication supabase_realtime add table public.polls';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.poll_tally'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.voters';     exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.votes';      exception when duplicate_object then null; end;
end $blk$;

-- ---------- Divan hesabını yetkilendir ----------
--
-- Bu adım, Authentication > Users içinde divan hesabı OLUŞTURULDUKTAN SONRA
-- çalışır. Hesap henüz yoksa hiçbir şey eklemez, hata da vermez — hesabı
-- açtıktan sonra bu bloğu tek başına tekrar çalıştırman yeterlidir.
--
-- E-posta adresini değiştirdiysen aşağıdaki adresi de değiştir.
-- İkinci bir divan hesabı eklemek istersen yine bu bloğu kullan.

insert into public.admins (user_id, note)
  select id, 'divan' from auth.users where email = 'divan@ahdem.online'
  on conflict (user_id) do nothing;

-- Kontrol: kaç divan hesabı yetkili? Boş dönerse hesap henüz oluşturulmamıştır.
select u.email, a.note, a.created_at
  from public.admins a join auth.users u on u.id = a.user_id;
