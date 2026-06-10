-- Журнал клиентских ошибок (наблюдаемость для беты).
-- Запись разрешена всем (включая анонимов — ошибки логина случаются до входа),
-- чтение — только через дашборд / service role: select-политики нет намеренно.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  context text not null,
  message text not null,
  details jsonb,
  url text,
  user_agent text
);

alter table public.client_errors enable row level security;

-- Табличные привилегии: только INSERT (читать таблицу клиентам нельзя)
grant insert on table public.client_errors to anon, authenticated;

create policy client_errors_insert_any
  on public.client_errors
  for insert
  to anon, authenticated
  with check (
    char_length(context) <= 100
    and char_length(message) <= 500
  );
