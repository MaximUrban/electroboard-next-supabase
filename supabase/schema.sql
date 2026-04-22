create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Новый проект',
  data jsonb not null,
  plan_path text,
  plan_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists "mvp open read" on public.projects;
drop policy if exists "mvp open insert" on public.projects;
drop policy if exists "mvp open update" on public.projects;

create policy "mvp open read"
on public.projects
for select
to anon, authenticated
using (true);

create policy "mvp open insert"
on public.projects
for insert
to anon, authenticated
with check (true);

create policy "mvp open update"
on public.projects
for update
to anon, authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('plans', 'plans', true)
on conflict (id) do nothing;

drop policy if exists "mvp public storage read" on storage.objects;
drop policy if exists "mvp public storage upload" on storage.objects;
drop policy if exists "mvp public storage update" on storage.objects;

create policy "mvp public storage read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'plans');

create policy "mvp public storage upload"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'plans');

create policy "mvp public storage update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'plans')
with check (bucket_id = 'plans');

-- ВАЖНО:
-- Эти политики специально максимально простые, чтобы MVP заработал без авторизации.
-- Для реального production после проверки идеи нужно добавить вход пользователей и ограничения доступа.
