-- Floodline: EFT payments and automatic quotations (3 November 2026)

-- EFT: the client's "I have paid by EFT" notice, how an invoice was paid, and who confirmed it
alter table public.floodline_invoices
  add column if not exists eft_at timestamptz,
  add column if not exists eft_note text not null default '',
  add column if not exists method text check (method is null or method in ('card', 'eft')),
  add column if not exists confirmed_by uuid;

-- automatic quotations: what the cost matrix produced for each request
--   auto_status: null = waiting, working, sent, manual (needs the engineer), skipped, dismissed, error, before (received before go-live)
alter table public.floodline_quotes
  add column if not exists auto_status text,
  add column if not exists auto_quote jsonb,
  add column if not exists quoted_at timestamptz,
  add column if not exists invoice_id uuid references public.floodline_invoices(id) on delete set null;
create index if not exists floodline_quotes_auto_waiting on public.floodline_quotes (created_at) where auto_status is null;

-- requests received before automatic quotations existed are never quoted automatically
update public.floodline_quotes set auto_status = 'before' where auto_status is null;

-- settings edited on pricing.html (the cost matrix); administrators only
create table if not exists public.floodline_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.floodline_settings enable row level security;
drop policy if exists "floodline settings: admin only" on public.floodline_settings;
create policy "floodline settings: admin only" on public.floodline_settings for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.floodline_settings from anon;

-- start with the default matrix (the function fills in every value) and automatic quotes switched on from now
insert into public.floodline_settings (key, value)
values ('pricing', jsonb_build_object('version', 1, 'auto', jsonb_build_object('enabled', true, 'delay_minutes', 10, 'since', now())))
on conflict (key) do nothing;

-- the scheduler's key: generated here, never shown; the function compares it
insert into public.floodline_private_assets (name, encoding, body, sha256, updated_at)
values ('autoquote-cron', 'text', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), '', now())
on conflict (name) do nothing;

-- every minute: call the function only when a request has waited the set delay, or an e-mail needs a retry
select cron.unschedule(jobid) from cron.job where jobname = 'floodline-autoquote';
select cron.schedule('floodline-autoquote', '* * * * *', $job$
  select net.http_post(
    url := 'https://sxbpjowkcpysoxurfqzo.supabase.co/functions/v1/floodline-autoquote',
    body := jsonb_build_object('action', 'run', 'key', (select body from public.floodline_private_assets where name = 'autoquote-cron')),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000)
  where exists (
    select 1
    from public.floodline_quotes q, public.floodline_settings s
    where s.key = 'pricing'
      and coalesce((s.value -> 'auto' ->> 'enabled')::boolean, false)
      and ((q.auto_status is null
            and q.created_at >= coalesce((s.value -> 'auto' ->> 'since')::timestamptz, now())
            and q.created_at <= now() - make_interval(mins => coalesce((s.value -> 'auto' ->> 'delay_minutes')::int, 10)))
        -- quotation e-mails the relay did not accept are retried for about 6 hours
        or (q.auto_status = 'sent' and q.auto_quote ->> 'emailed' = 'false'
            and coalesce((q.auto_quote ->> 'mail_attempts')::int, 1) < 12
            and q.quoted_at > now() - interval '12 hours')))
$job$);
