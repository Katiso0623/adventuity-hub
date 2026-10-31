-- 2026-10-31 Lesson bundles: prepaid lesson hours (5 hours for R1 100, 10 hours for R2 000), used up automatically by lessons.
-- Additive: one new table, one new nullable column on bookings, one new public setting, replaced and new functions.
-- No existing rows change.

-- the bundles on offer (public: shown on the website and in the portal; the director can change them in Money)
insert into public.public_settings (key, value) values ('bundles', '[{"hours":5,"price":1100},{"hours":10,"price":2000}]'::jsonb)
on conflict (key) do nothing;

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  ref text not null default 'B' || upper(substr(md5(random()::text), 1, 5)),   -- payment reference
  learner_id uuid not null references public.profiles(id) on delete cascade,
  hours numeric(5,1) not null check (hours > 0 and hours <= 100),
  price numeric(10,2) not null check (price >= 0),
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled')),
  paid boolean not null default false,
  paid_at timestamptz,
  pop_path text,                                    -- proof of payment in the 'pop' bucket
  admin_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bundles_learner on public.bundles(learner_id);
alter table public.bundles enable row level security;
drop policy if exists "bundles: own or admin read" on public.bundles;
create policy "bundles: own or admin read" on public.bundles for select using (learner_id = auth.uid() or public.is_admin());
drop policy if exists "bundles: learner requests" on public.bundles;
create policy "bundles: learner requests" on public.bundles for insert with check (
  learner_id = auth.uid() and status = 'requested' and paid = false and pop_path is null
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'learner' and not blocked));
drop policy if exists "bundles: admin manages" on public.bundles;
create policy "bundles: admin manages" on public.bundles for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "bundles: admin deletes" on public.bundles;
create policy "bundles: admin deletes" on public.bundles for delete using (public.is_admin());

-- a learner's request gets its hours and price from the offer (never from the request); at most 2 open requests
create or replace function public.price_bundle() returns trigger
language plpgsql security definer set search_path = public as $$
declare offer jsonb; o jsonb;
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    select value into offer from public.public_settings where key = 'bundles';
    select x into o from jsonb_array_elements(coalesce(offer, '[]'::jsonb)) x where (x->>'hours')::numeric = new.hours limit 1;
    if o is null then raise exception 'Choose one of the bundles on offer.'; end if;
    if (select count(*) from public.bundles where learner_id = new.learner_id and status = 'requested') >= 2 then
      raise exception 'You already have a bundle request waiting – the tutor will answer it first.'; end if;
    new.price := (o->>'price')::numeric; new.status := 'requested'; new.paid := false; new.paid_at := null; new.pop_path := null; new.admin_message := '';
  end if;
  if tg_op = 'UPDATE' and new.paid and not old.paid and new.paid_at is null then new.paid_at := now(); end if;
  if tg_op = 'UPDATE' and not new.paid then new.paid_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists price_bundle on public.bundles;
create trigger price_bundle before insert or update on public.bundles for each row execute function public.price_bundle();

-- lessons taken from a bundle
alter table public.bookings add column if not exists bundle_id uuid references public.bundles(id) on delete set null;
create index if not exists bookings_bundle on public.bookings(bundle_id) where bundle_id is not null;

-- hours still open on a bundle (lessons requested, booked or done count; declined and cancelled ones give the hours back)
create or replace function public.bundle_hours_left(p_bundle uuid) returns numeric
language sql volatile security definer set search_path = public as $$
  select b.hours - coalesce((select sum(extract(epoch from (k.ends_at - k.starts_at)) / 3600.0) from public.bookings k
                             where k.bundle_id = b.id and k.status in ('pending','accepted','completed')), 0)
  from public.bundles b where b.id = p_bundle;
$$;
-- the accepted bundle (oldest first) that still has room for a lesson of p_hours
create or replace function public.bundle_for(p_learner uuid, p_hours numeric) returns uuid
language sql volatile security definer set search_path = public as $$
  select b.id from public.bundles b
  where b.learner_id = p_learner and b.status = 'accepted' and public.bundle_hours_left(b.id) >= p_hours - 0.001
  order by b.created_at limit 1;
$$;
revoke execute on function public.bundle_hours_left(uuid), public.bundle_for(uuid, numeric) from public, anon, authenticated;

-- the learner sends the proof of payment for an accepted bundle; cancels a request that is not answered yet
create or replace function public.attach_bundle_pop(b uuid, path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bundles set pop_path = path where id = b and learner_id = auth.uid() and status = 'accepted' and path like auth.uid()::text || '/%';
end $$;
create or replace function public.cancel_bundle(b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bundles set status = 'cancelled' where id = b and learner_id = auth.uid() and status = 'requested';
end $$;
revoke execute on function public.attach_bundle_pop(uuid, text), public.cancel_bundle(uuid) from public, anon;
grant execute on function public.attach_bundle_pop(uuid, text), public.cancel_bundle(uuid) to authenticated;

-- payment details: also for learners whose bundle the director accepted (still never for strangers)
drop policy if exists "private settings: signed-in read" on public.private_settings;
create policy "private settings: signed-in read" on public.private_settings for select using (
  auth.uid() is not null and key <> 'invoice' and (key <> 'payment' or public.is_admin()
    or exists (select 1 from public.bookings where learner_id = auth.uid() and status in ('accepted','completed'))
    or exists (select 1 from public.bundles where learner_id = auth.uid() and status = 'accepted')));

-- lesson fees: as before, plus prepaid hours. A one-on-one lesson of a learner with an accepted bundle that has room is taken
-- from the bundle (fee R0): the learner's own requests, tutors' lessons, and the director's lessons booked without a fee.
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
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.bundle_id := null; end if;
    if new.class_id is not null then new.bundle_id := null; end if;
  end if;
  -- one-on-one lessons of a sponsored learner are billed to the sponsor (fee R0): always for the learner's own requests and
  -- for tutors; the director's lessons when booked without a fee (a fee typed in means the learner pays)
  if tg_op = 'INSERT' and new.class_id is null then
    select sponsor_id into sp from public.profiles where id = new.learner_id;
    if sp is not null and (not public.is_admin() or coalesce(new.fee, 0) = 0) then new.sponsor_id := coalesce(new.sponsor_id, sp); new.fee := 0; new.bundle_id := null;
    else
      if not public.is_admin() then new.sponsor_id := null; end if;
      -- prepaid hours from a bundle
      if new.bundle_id is not null then   -- the director picked a bundle: it must be this learner's, accepted, with room
        if not exists (select 1 from public.bundles where id = new.bundle_id and learner_id = new.learner_id and status = 'accepted')
           or public.bundle_hours_left(new.bundle_id) < extract(epoch from (new.ends_at - new.starts_at)) / 3600.0 - 0.001 then
          raise exception 'That bundle has no hours left for this lesson.'; end if;
      elsif new.sponsor_id is null and (not public.is_admin() or coalesce(new.fee, 0) = 0) then
        perform pg_advisory_xact_lock(hashtext('bundle:' || new.learner_id::text));
        new.bundle_id := public.bundle_for(new.learner_id, extract(epoch from (new.ends_at - new.starts_at)) / 3600.0);
      end if;
      if new.bundle_id is not null then new.fee := 0; end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.paid and not old.paid and new.paid_at is null then new.paid_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
