-- 2026-10-28 Tutors schedule their own lessons (several at once), tutors add learners; sponsors and sponsor invoices.
-- Additive: new tables (sponsors, invoices), new nullable columns, new and replaced functions. No existing rows change.

-- ---------------------------------------------------------------- sponsors (organisations that pay for learners, e.g. SAILI)
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 160),
  bill_lines text not null default '',            -- lines under the name on the invoice (attention, city, …), one per line
  email text not null default '',
  rate numeric(10,2) not null default 200 check (rate >= 0 and rate <= 10000),   -- per hour of delivered lessons
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;
drop policy if exists "sponsors: admin all" on public.sponsors;
create policy "sponsors: admin all" on public.sponsors for all using (public.is_admin()) with check (public.is_admin());
-- the sponsors themselves (e.g. SAILI) are added by the director under Analysis → Sponsors

alter table public.profiles add column if not exists sponsor_id uuid references public.sponsors(id) on delete set null;   -- who pays for this learner
alter table public.profiles add column if not exists created_by uuid references public.profiles(id) on delete set null;   -- the tutor who added the learner

-- learners and tutors may edit their contact details but never their role, approval, sponsor or who added them
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- only API callers (anon/authenticated) are restricted; the service role and the database owner may change approval
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_admin() then
    new.role := old.role; new.approved := old.approved; new.blocked := old.blocked; new.email := old.email;
    new.tutor_rate := old.tutor_rate; new.tutor_subjects := old.tutor_subjects;
    new.sponsor_id := old.sponsor_id; new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- the invoice settings (banking details, contact line) are for the director only, unlike the other private settings
drop policy if exists "private settings: signed-in read" on public.private_settings;
create policy "private settings: signed-in read" on public.private_settings for select using (
  auth.uid() is not null and key <> 'invoice' and (key <> 'payment' or public.is_admin()
    or exists (select 1 from public.bookings where learner_id = auth.uid() and status in ('accepted','completed'))));

-- ---------------------------------------------------------------- invoices (director only)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                    -- YYMMDD + 3 digits, e.g. 261028001 (as the Adventuity invoices so far)
  sponsor_id uuid references public.sponsors(id) on delete set null,
  bill_to jsonb not null default '{}',             -- copy of the sponsor's name, lines and e-mail when the invoice was made
  issue_date date not null default ((now() at time zone 'Africa/Johannesburg')::date),
  period_from date,
  period_to date,
  lines jsonb not null default '[]',               -- [{desc, qty, rate, amount}]
  total numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','paid')),
  notes text not null default '',
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
drop policy if exists "invoices: admin all" on public.invoices;
create policy "invoices: admin all" on public.invoices for all using (public.is_admin()) with check (public.is_admin());
alter table public.bookings add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
create index if not exists bookings_invoice on public.bookings(invoice_id);
-- the sponsor who pays for this lesson, fixed when it is booked (the learner's fee is then R0); invoices use this, so a lesson the
-- learner pays for themselves is never also billed to a sponsor
alter table public.bookings add column if not exists sponsor_id uuid references public.sponsors(id) on delete set null;
create index if not exists bookings_sponsor on public.bookings(sponsor_id) where sponsor_id is not null;

-- the director makes one invoice for a sponsor: every delivered, not yet invoiced lesson of the sponsor's learners in the period
create or replace function public.make_sponsor_invoice(p_sponsor uuid, p_from date, p_to date)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare sp public.sponsors; inv public.invoices; d text; n int; lns jsonb; tot numeric; dname text;
begin
  if not public.is_admin() then raise exception 'Only the director can make invoices.'; end if;
  select * into sp from public.sponsors where id = p_sponsor;
  if not found then raise exception 'Choose a sponsor.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose the period.'; end if;
  select full_name into dname from public.profiles where id = auth.uid();
  create temp table _inv_b on commit drop as
    select b.id, b.subject, b.learner_id, b.tutor_id, extract(epoch from (b.ends_at - b.starts_at)) / 3600.0 as hrs
    from public.bookings b
    where b.sponsor_id = p_sponsor and b.invoice_id is null and b.class_id is null
      and (b.status = 'completed' or (b.status = 'accepted' and b.delivered_at is not null))
      and (b.starts_at at time zone 'Africa/Johannesburg')::date between p_from and p_to;
  if not exists (select 1 from _inv_b) then raise exception 'No delivered lessons to invoice for % in that period.', sp.name; end if;
  -- one line per learner, subject and tutor, like the invoices made by hand so far
  select jsonb_agg(x.line order by x.line->>'desc'), sum((x.line->>'amount')::numeric) into lns, tot from (
    select jsonb_build_object(
      'desc', (case g.subject when 'maths' then 'Mathematics' when 'phys' then 'Physical Sciences' when 'chem' then 'Physical Sciences' else 'Life Sciences' end)
              || case when g.all_hour then (case when g.cnt = 1 then ' – one-hour online lesson for ' else ' – one-hour online lessons for ' end)
                      else ' – online lessons (' || g.cnt || ', ' || replace(rtrim(rtrim(round(g.hrs, 2)::text, '0'), '.'), '.', ',') || ' h) for ' end
              || coalesce(nullif(l.full_name, ''), 'learner') || coalesce(' (' || nullif(l.school, '') || ')', '')
              || ', tutor ' || coalesce(nullif(t.full_name, ''), dname, 'Adventuity'),
      'qty', case when g.all_hour then g.cnt else round(g.hrs, 2) end,
      'unit', case when g.all_hour then 'lesson' else 'hour' end,
      'rate', sp.rate,
      'amount', round(case when g.all_hour then g.cnt else round(g.hrs, 2) end * sp.rate, 2)) as line
    from (select learner_id, subject, tutor_id, count(*) as cnt, sum(hrs) as hrs, bool_and(abs(hrs - 1) < 0.01) as all_hour
            from _inv_b group by learner_id, subject, tutor_id) g
    join public.profiles l on l.id = g.learner_id left join public.profiles t on t.id = g.tutor_id) x;
  d := to_char(now() at time zone 'Africa/Johannesburg', 'YYMMDD');
  select coalesce(max(substr(number, 7)::int), 0) + 1 into n from public.invoices where number ~ ('^' || d || '[0-9]{3}$');
  insert into public.invoices (number, sponsor_id, bill_to, period_from, period_to, lines, total, notes)
  values (d || lpad(n::text, 3, '0'), sp.id, jsonb_build_object('name', sp.name, 'lines', sp.bill_lines, 'email', sp.email), p_from, p_to, lns, round(tot, 2),
          'Lessons delivered from ' || to_char(p_from, 'FMDD FMMonth YYYY') || ' to ' || to_char(p_to, 'FMDD FMMonth YYYY') || ', at R' || replace(rtrim(rtrim(sp.rate::text, '0'), '.'), '.', ',') || ' per hour.')
  returning * into inv;
  update public.bookings set invoice_id = inv.id where id in (select id from _inv_b);
  return inv;
end $$;
revoke execute on function public.make_sponsor_invoice(uuid, date, date) from public, anon;

-- ---------------------------------------------------------------- tutors schedule their own lessons
-- Lessons booked through tutor_schedule() skip the learner booking rules (notice, fee table, the director's diary);
-- tutors have no insert right on bookings of their own, so this is the only way they add lessons.
create or replace function public.price_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare rates jsonb; rate numeric; hrs numeric; c public.classes%rowtype; taken int; sp uuid; via_tutor boolean;
begin
  via_tutor := coalesce(current_setting('adv.tutor_schedule', true), '') = 'on' and public.is_tutor() and new.tutor_id = auth.uid();
  if tg_op = 'INSERT' and not public.is_admin() and not via_tutor then
    new.status := 'pending'; new.paid := false; new.paid_at := null; new.pop_path := null; new.room := null; new.admin_message := '';
    new.tutor_id := null; new.delivered_at := null; new.tutor_note := ''; new.invoice_id := null; new.sponsor_id := null;
    new.learner_note := left(coalesce(new.learner_note, ''), 1000); new.topics := left(coalesce(new.topics, ''), 400);
    if new.class_id is not null then
      select * into c from public.classes where id = new.class_id;
      if not found or not c.published or c.starts_at < now() then raise exception 'This class is not open for booking.'; end if;
      select count(*) into taken from public.bookings where class_id = c.id and status in ('pending','accepted');
      if taken >= c.capacity then raise exception 'This class is full.'; end if;
      if exists (select 1 from public.bookings where class_id = c.id and learner_id = new.learner_id and status in ('pending','accepted')) then
        raise exception 'You have already requested this class.'; end if;
      new.fee := c.fee; new.kind := 'group'; new.subject := c.subject;
      new.starts_at := c.starts_at; new.ends_at := c.starts_at + make_interval(mins => c.minutes);
    else
      hrs := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;
      if hrs < 0.5 or hrs > 4 then raise exception 'Choose a lesson length between 30 minutes and 4 hours.'; end if;
      if new.starts_at < now() + interval '1 hour' or new.starts_at > now() + interval '120 days' then raise exception 'That time is no longer available – pick another.'; end if;
      -- the admin's own diary (lessons other tutors teach do not block it), and the learner's own lessons
      if exists (select 1 from public.bookings x where x.kind = 'one-on-one' and x.status in ('pending','accepted')
                 and x.starts_at < new.ends_at and x.ends_at > new.starts_at
                 and (x.tutor_id is null or x.learner_id = new.learner_id
                      or exists (select 1 from public.profiles t where t.id = x.tutor_id and t.role = 'admin'))) then
        raise exception 'That time is no longer available – pick another.'; end if;
      if (select count(*) from public.bookings where learner_id = new.learner_id and status = 'pending' and starts_at > now()) >= 6 then
        raise exception 'You already have 6 requests waiting – wait for the tutor to answer them first.'; end if;
      select value into rates from public.public_settings where key = 'fees';
      rate := coalesce((rates->>new.subject)::numeric, (rates->>'default')::numeric, (rates->>'maths')::numeric, 0);
      new.fee := round(rate * hrs, 2); new.kind := 'one-on-one';
    end if;
  end if;
  -- one-on-one lessons of a sponsored learner are billed to the sponsor (fee R0): always for the learner's own requests and
  -- for tutors; the director's lessons when booked without a fee (a fee typed in means the learner pays)
  if tg_op = 'INSERT' and new.class_id is null then
    select sponsor_id into sp from public.profiles where id = new.learner_id;
    if sp is not null and (not public.is_admin() or coalesce(new.fee, 0) = 0) then new.sponsor_id := coalesce(new.sponsor_id, sp); new.fee := 0;
    elsif not public.is_admin() then new.sponsor_id := null; end if;
  end if;
  if tg_op = 'UPDATE' and new.paid and not old.paid and new.paid_at is null then new.paid_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;

-- a tutor books one or many lessons for one of their learners: p_slots = [{"s": "2026-10-28T18:00:00+02:00", "m": 60}, …]
create or replace function public.tutor_schedule(p_learner uuid, p_subject text, p_slots jsonb, p_note text default '', p_room text default '')
returns table (id uuid, ref text, starts_at timestamptz, ends_at timestamptz, room text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); sp uuid; rates jsonb; rate numeric; link text; cnt int; clash text;
begin
  if not public.is_tutor() then raise exception 'Only tutors can schedule here.'; end if;
  -- one booking at a time per tutor and per learner, so two requests sent together cannot double-book
  perform pg_advisory_xact_lock(hashtext('tutor_schedule:' || me::text)); perform pg_advisory_xact_lock(hashtext('tutor_schedule:' || p_learner::text));
  if p_subject is null or p_subject not in ('maths','phys','chem','life') then raise exception 'Choose the subject.'; end if;
  if not exists (select 1 from public.assignments a where a.learner_id = p_learner and a.tutor_id = me and a.subject = p_subject and a.active) then
    raise exception 'This learner is not assigned to you for that subject – ask the director.'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then raise exception 'Add at least one lesson time.'; end if;
  if jsonb_array_length(p_slots) > 60 then raise exception 'Schedule at most 60 lessons at once.'; end if;
  create temp table _ts on commit drop as
    select (e->>'s')::timestamptz as s, (e->>'s')::timestamptz + make_interval(mins => coalesce((e->>'m')::int, 60)) as e, coalesce((e->>'m')::int, 60) as m
    from jsonb_array_elements(p_slots) e;
  if exists (select 1 from _ts where s is null or m < 15 or m > 240) then raise exception 'Each lesson needs a start time and a length between 15 minutes and 4 hours.'; end if;
  -- "now" is fine (a lesson agreed on WhatsApp that starts straight away), a lesson that started earlier is not
  select to_char(s at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI') into clash from _ts where s < now() - interval '15 minutes' order by s limit 1;
  if clash is not null then raise exception 'The lesson on % has already started or is over – choose a later time.', clash; end if;
  if exists (select 1 from _ts where s > now() + interval '200 days') then raise exception 'Schedule at most 200 days ahead.'; end if;
  select to_char(a.s at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI') into clash from _ts a join _ts b on a.ctid <> b.ctid and a.s < b.e and a.e > b.s order by a.s limit 1;
  if clash is not null then raise exception 'Two of the lessons overlap (%). Change one of them.', clash; end if;
  select to_char(x.starts_at at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI') into clash
    from public.bookings x join _ts t on x.starts_at < t.e and x.ends_at > t.s
    where x.status in ('pending','accepted') and (x.tutor_id = me or x.learner_id = p_learner) order by x.starts_at limit 1;
  if clash is not null then raise exception 'You or this learner already have a lesson on % – choose another time.', clash; end if;
  select count(*) into cnt from public.bookings x where x.learner_id = p_learner and x.status = 'accepted' and x.ends_at > now();
  if cnt + jsonb_array_length(p_slots) > 150 then raise exception 'This learner would have more than 150 upcoming lessons – ask the director.'; end if;
  select sponsor_id into sp from public.profiles where profiles.id = p_learner;
  select value into rates from public.public_settings where key = 'fees';
  -- sponsored learners pay nothing themselves (the sponsor is invoiced); others pay the director's fee for the subject
  rate := case when sp is not null then 0 else coalesce((rates->>p_subject)::numeric, (rates->>'default')::numeric, (rates->>'maths')::numeric, 0) end;
  link := btrim(coalesce(p_room, ''));
  if link <> '' and (length(link) > 400 or link !~ '^https://[^[:space:]<>"]{6,}$') then raise exception 'Paste the full meeting link, starting with https://'; end if;
  if link = '' then select coalesce(meet_link, '') into link from public.profiles where profiles.id = me; end if;
  perform set_config('adv.tutor_schedule', 'on', true);
  return query
    insert into public.bookings as nb (learner_id, tutor_id, subject, kind, starts_at, ends_at, status, fee, paid, admin_message, room, sponsor_id)
    select p_learner, me, p_subject, 'one-on-one', t.s, t.e, 'accepted', round(rate * t.m / 60.0, 2), false, left(coalesce(p_note, ''), 500),
           case when link <> '' then link else 'AdventuityLesson-' || substr(md5(random()::text || t.s::text), 1, 10) end, sp
    from _ts t order by t.s
    returning nb.id, nb.ref, nb.starts_at, nb.ends_at, nb.room;
  perform set_config('adv.tutor_schedule', '', true);
end $$;
revoke execute on function public.tutor_schedule(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.tutor_schedule(uuid, text, jsonb, text, text) to authenticated;

-- the learners assigned to a tutor, with what the tutor needs to reach them and send login details
drop function if exists public.tutor_learners();
create or replace function public.tutor_learners()
returns table (learner_id uuid, full_name text, school text, subject text, hours numeric, note text, taught numeric,
               booked numeric, phone text, guardian_phone text, email text, grade smallint, first_login_pending boolean, added_by_me boolean)
language sql stable security definer set search_path = public as $$
  select a.learner_id, p.full_name, p.school, a.subject, a.hours, a.note,
         coalesce((select round(sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600.0)::numeric, 1) from public.bookings b
                   where b.learner_id = a.learner_id and b.tutor_id = a.tutor_id and b.subject = a.subject
                     and (b.status = 'completed' or (b.status = 'accepted' and b.delivered_at is not null))), 0),
         coalesce((select round(sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600.0)::numeric, 1) from public.bookings b
                   where b.learner_id = a.learner_id and b.tutor_id = a.tutor_id and b.subject = a.subject
                     and b.status = 'accepted' and b.delivered_at is null), 0),
         -- contact details only for learners this tutor added; the director's learners stay private
         case when p.created_by = a.tutor_id then p.phone end, case when p.created_by = a.tutor_id then p.guardian_phone end,
         case when p.created_by = a.tutor_id then p.email end, p.grade, coalesce(p.must_change_password, false), coalesce(p.created_by = a.tutor_id, false)
  from public.assignments a join public.profiles p on p.id = a.learner_id
  where public.is_tutor() and a.tutor_id = auth.uid() and a.active
  order by p.full_name, a.subject;
$$;
