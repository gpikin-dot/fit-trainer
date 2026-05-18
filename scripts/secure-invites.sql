-- ============================================================
-- Security hardening: invites + client↔trainer привязка
-- Закрывает BUG-001 (инвайты world-readable) и BUG-003 (клиент
-- цепляется к любому тренеру через signup-метаданные).
--
-- Идемпотентно. Прогонять в Supabase SQL Editor.
-- ПОРЯДОК ВЫКАТА:
--   1) применить на STAGING
--   2) выкатить фронт на staging
--   3) проверить: регистрация тренера, инвайт, регистрация клиента
--   4) только потом то же самое на PRODUCTION
-- ============================================================

-- ── 1. Профиль создаётся БЕЗ доверия metadata.trainer_id ──────
-- role берётся из метаданных (trainer|client), но trainer_id у
-- клиента НЕ из метаданных — он null до принятия инвайта.
-- Заменяем тело функции, которую дёргает существующий триггер
-- on auth.users (в дашборде он привязан к public.handle_new_user).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Без имени');
  v_role text := new.raw_user_meta_data->>'role';
begin
  if v_role not in ('trainer', 'client') then
    v_role := 'client';
  end if;

  insert into public.profiles (id, name, role, trainer_id)
  values (new.id, v_name, v_role, null)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Гарантируем, что триггер существует и привязан к нашей функции.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Валидация инвайта без раскрытия таблицы invites ────────
-- Возвращает только имя тренера + статус. Доступна anon.
create or replace function public.validate_invite(p_token text)
returns table (valid boolean, reason text, trainer_name text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invites%rowtype;
begin
  select * into v_inv from public.invites where token = p_token;
  if not found then
    return query select false, 'not_found'::text, null::text; return;
  end if;
  if v_inv.used_by is not null then
    return query select false, 'used'::text, null::text; return;
  end if;
  if v_inv.expires_at < now() then
    return query select false, 'expired'::text, null::text; return;
  end if;
  return query
    select true, 'ok'::text, p.name
    from public.profiles p
    where p.id = v_inv.trainer_id;
end;
$$;

revoke all on function public.validate_invite(text) from public;
grant execute on function public.validate_invite(text) to anon, authenticated;

-- ── 3. Атомарное принятие инвайта залогиненным клиентом ───────
-- Вызывается ПОСЛЕ signUp (сессия уже есть). Привязывает
-- trainer_id и помечает инвайт использованным в одной транзакции.
create or replace function public.accept_invite(p_token text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv from public.invites where token = p_token for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_inv.used_by is not null then raise exception 'invite_used'; end if;
  if v_inv.expires_at < now() then raise exception 'invite_expired'; end if;

  update public.profiles
    set trainer_id = v_inv.trainer_id
    where id = v_uid and role = 'client';

  update public.invites
    set used_by = v_uid
    where id = v_inv.id and used_by is null;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- ── 4. RLS: инвайты больше НЕ world-readable ──────────────────
drop policy if exists "invites_select" on public.invites;
create policy "invites_select" on public.invites
  for select using (trainer_id = auth.uid());

drop policy if exists "invites_update" on public.invites;
create policy "invites_update" on public.invites
  for update using (trainer_id = auth.uid());

-- invites_insert оставляем как есть: with check (trainer_id = auth.uid())
