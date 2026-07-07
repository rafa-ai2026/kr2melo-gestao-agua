-- KR²MELO v5.2 — Sincronização Supabase
-- Execute este script uma única vez em Supabase > SQL Editor.
-- Não use a chave service_role no site. Use somente a chave anon/publishable.

create table if not exists public.kr2melo_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kr2melo_sync_state enable row level security;

grant select, insert, update, delete on public.kr2melo_sync_state to authenticated;

drop policy if exists "kr2melo_select_own" on public.kr2melo_sync_state;
drop policy if exists "kr2melo_insert_own" on public.kr2melo_sync_state;
drop policy if exists "kr2melo_update_own" on public.kr2melo_sync_state;
drop policy if exists "kr2melo_delete_own" on public.kr2melo_sync_state;

create policy "kr2melo_select_own"
  on public.kr2melo_sync_state for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "kr2melo_insert_own"
  on public.kr2melo_sync_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "kr2melo_update_own"
  on public.kr2melo_sync_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "kr2melo_delete_own"
  on public.kr2melo_sync_state for delete to authenticated
  using ((select auth.uid()) = user_id);
