-- Выполните весь этот SQL один раз в Supabase -> SQL Editor -> New query.

-- Публичные контакты, которые администратор меняет из панели сайта.
create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

-- Начальный публичный email для связи с Натальей Самохиной.
insert into public.site_settings (key, value)
values ('email', 'Terra.snow@bk.ru')
on conflict (key) do update set value = excluded.value;
alter table public.site_settings enable row level security;

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings for select
using (true);

drop policy if exists "Authenticated admins can insert settings" on public.site_settings;
create policy "Authenticated admins can insert settings"
on public.site_settings for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admins can update settings" on public.site_settings;
create policy "Authenticated admins can update settings"
on public.site_settings for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated admins can delete settings" on public.site_settings;
create policy "Authenticated admins can delete settings"
on public.site_settings for delete
using (auth.role() = 'authenticated');

-- Публичный bucket: посетители видят загруженные файлы, только вошедший
-- администратор может добавлять и удалять их.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view public media" on storage.objects;
create policy "Anyone can view public media"
on storage.objects for select
using (bucket_id = 'media');

drop policy if exists "Authenticated admins can upload media" on storage.objects;
create policy "Authenticated admins can upload media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media');

drop policy if exists "Authenticated admins can delete media" on storage.objects;
create policy "Authenticated admins can delete media"
on storage.objects for delete
to authenticated
using (bucket_id = 'media');
