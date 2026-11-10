-- Floodline: client records and financial records (3 November 2026).
-- Clients are created automatically from website quote requests (matched on e-mail); invoices and records link to them.
-- Every table is administrator-only (public.is_admin()), like the quotes and invoices.

create table if not exists public.floodline_clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 160),
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  kind text not null default 'other' check (kind in ('developer', 'town planner', 'architect', 'land surveyor', 'engineer', 'environmental', 'municipality', 'mine', 'estate agent', 'property owner', 'other')),
  city text not null default '',
  province text not null default '',
  source text not null default '',
  status text not null default 'lead' check (status in ('lead', 'active', 'past', 'do not contact', 'test')),
  notes text not null default '',
  tags text[] not null default '{}'
);
create unique index if not exists floodline_clients_email_uq on public.floodline_clients (lower(email)) where email <> '';
create index if not exists floodline_clients_name_idx on public.floodline_clients (lower(name));
alter table public.floodline_clients enable row level security;
revoke all on public.floodline_clients from anon;
grant select, insert, update, delete on public.floodline_clients to authenticated;
drop policy if exists "floodline clients: admin only" on public.floodline_clients;
create policy "floodline clients: admin only" on public.floodline_clients for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.floodline_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  entry_date date not null default current_date,
  kind text not null check (kind in ('income', 'expense')),
  category text not null check (char_length(category) between 1 and 60),
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  client_id uuid references public.floodline_clients(id) on delete set null,
  quote_id uuid references public.floodline_quotes(id) on delete set null,
  invoice_id uuid references public.floodline_invoices(id) on delete set null,
  method text not null default '',
  reference text not null default '',
  notes text not null default ''
);
create index if not exists floodline_ledger_date_idx on public.floodline_ledger (entry_date desc);
create index if not exists floodline_ledger_client_idx on public.floodline_ledger (client_id);
alter table public.floodline_ledger enable row level security;
revoke all on public.floodline_ledger from anon;
grant select, insert, update, delete on public.floodline_ledger to authenticated;
drop policy if exists "floodline ledger: admin only" on public.floodline_ledger;
create policy "floodline ledger: admin only" on public.floodline_ledger for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.floodline_quotes add column if not exists client_id uuid references public.floodline_clients(id) on delete set null;
alter table public.floodline_invoices add column if not exists client_id uuid references public.floodline_clients(id) on delete set null;
create index if not exists floodline_quotes_client_idx on public.floodline_quotes (client_id);
create index if not exists floodline_invoices_client_idx on public.floodline_invoices (client_id);

create or replace function public.floodline_touch_updated() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists floodline_clients_touch on public.floodline_clients;
create trigger floodline_clients_touch before update on public.floodline_clients for each row execute function public.floodline_touch_updated();

-- Only an address at a reserved test domain (example.com, .test, .invalid, localhost), which no real person can receive
-- mail at, is marked "test". Nothing else is ever guessed: the administrator marks other test records by hand.
create or replace function public.floodline_looks_test(p_email text, p_name text) returns boolean language sql immutable as $$
  select coalesce(p_email, '') ~* '@(.+\.)?(example\.(com|net|org)|example|test|invalid|localhost)$'
$$;

-- Find or create the client of a quote request. Never blocks the request: any error leaves client_id empty.
create or replace function public.floodline_quote_client() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if new.client_id is not null or coalesce(new.email, '') = '' then return new; end if;
  begin
    select id into cid from public.floodline_clients where lower(email) = lower(new.email) limit 1;
    if cid is null then
      insert into public.floodline_clients (name, company, email, phone, source, status)
      values (left(coalesce(nullif(new.full_name, ''), new.email), 160), coalesce(new.company, ''), lower(new.email), coalesce(new.phone, ''), 'Website quote request',
              case when public.floodline_looks_test(new.email, new.full_name) then 'test' else 'lead' end)
      on conflict do nothing
      returning id into cid;
      if cid is null then select id into cid from public.floodline_clients where lower(email) = lower(new.email) limit 1; end if;
    else
      update public.floodline_clients set phone = case when phone = '' then coalesce(new.phone, '') else phone end,
        company = case when company = '' then coalesce(new.company, '') else company end where id = cid;
    end if;
    new.client_id := cid;
  exception when others then
    new.client_id := null;
  end;
  return new;
end $$;
drop trigger if exists floodline_quotes_client on public.floodline_quotes;
create trigger floodline_quotes_client before insert on public.floodline_quotes for each row execute function public.floodline_quote_client();

-- Invoices take the client of their quote, or the client with the same e-mail.
create or replace function public.floodline_invoice_client() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is null then
    begin
      if new.quote_id is not null then select client_id into new.client_id from public.floodline_quotes where id = new.quote_id; end if;
      if new.client_id is null and coalesce(new.client_email, '') <> '' then select id into new.client_id from public.floodline_clients where lower(email) = lower(new.client_email) limit 1; end if;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
drop trigger if exists floodline_invoices_client on public.floodline_invoices;
create trigger floodline_invoices_client before insert or update of quote_id, client_email on public.floodline_invoices for each row execute function public.floodline_invoice_client();

revoke all on function public.floodline_quote_client() from public, anon, authenticated;
revoke all on function public.floodline_invoice_client() from public, anon, authenticated;

-- Backfill: one client per e-mail address of the existing requests (latest name and phone), then link requests and invoices.
insert into public.floodline_clients (name, company, email, phone, source, status, created_at)
select distinct on (lower(q.email)) left(coalesce(nullif(q.full_name, ''), q.email), 160), q.company, lower(q.email), q.phone, 'Website quote request',
       case when public.floodline_looks_test(q.email, q.full_name) then 'test' when q.status = 'won' then 'active' else 'lead' end,
       (select min(created_at) from public.floodline_quotes q2 where lower(q2.email) = lower(q.email))
from public.floodline_quotes q where coalesce(q.email, '') <> ''
order by lower(q.email), q.created_at desc
on conflict do nothing;
update public.floodline_quotes q set client_id = c.id from public.floodline_clients c where q.client_id is null and lower(q.email) = lower(c.email);
update public.floodline_invoices v set client_id = q.client_id from public.floodline_quotes q where v.client_id is null and v.quote_id = q.id;
update public.floodline_invoices v set client_id = c.id from public.floodline_clients c where v.client_id is null and v.client_email <> '' and lower(v.client_email) = lower(c.email);
