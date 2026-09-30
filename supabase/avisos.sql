-- Meu Treino: avisos de fim do descanso (notificações no iPhone).
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".
-- Pode rodar mais de uma vez sem problema.

-- Aparelhos que aceitaram receber avisos.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- Avisos marcados para uma hora (o fim de cada descanso).
create table if not exists public.push_jobs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  send_at timestamptz not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists push_jobs_send_at_idx on public.push_jobs (send_at);

alter table public.push_jobs enable row level security;

drop policy if exists "push_jobs_own" on public.push_jobs;
create policy "push_jobs_own" on public.push_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.push_jobs to authenticated;

-- Chaves de envio dos avisos. Só o servidor lê (nenhuma regra libera para o app).
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid jsonb not null
);

alter table public.push_config enable row level security;
revoke all on table public.push_config from anon, authenticated;

-- Agendador: a cada 5 segundos, se algum aviso chegou na hora, chama a função "avisos".
-- Avisos esquecidos há mais de 10 minutos são descartados.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'meu-treino-avisos';

select cron.schedule(
  'meu-treino-avisos',
  '5 seconds',
  $$
    with antigos as (
      delete from public.push_jobs where send_at < now() - interval '10 minutes'
    )
    select net.http_post(
      url := 'https://ixyvffjhutuemvasezhc.supabase.co/functions/v1/avisos',
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
    where exists (select 1 from public.push_jobs where send_at <= now() + interval '1 second');
  $$
);
