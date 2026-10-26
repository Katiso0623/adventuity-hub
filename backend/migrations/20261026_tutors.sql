-- 2026-10-26 tutor accounts: tutor role, learner assignments, lessons taught by tutors, lesson log.
-- Additive: new columns, a wider role check, new table and functions; existing rows keep their values.
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists meet_link text not null default '';
alter table public.profiles add column if not exists tutor_rate numeric(10,2) not null default 0;
alter table public.profiles add column if not exists tutor_subjects text not null default '';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('learner','admin','tutor'));
alter table public.bookings add column if not exists tutor_id uuid references public.profiles(id) on delete set null;
alter table public.bookings add column if not exists delivered_at timestamptz;
alter table public.bookings add column if not exists tutor_note text not null default '';
create index if not exists bookings_tutor on public.bookings(tutor_id);

create or replace function public.is_tutor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor' and not blocked);
$$;

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- only API callers (anon/authenticated) are restricted; the service role and the database owner may change approval
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_admin() then
    new.role := old.role; new.approved := old.approved; new.blocked := old.blocked; new.email := old.email;
    new.tutor_rate := old.tutor_rate; new.tutor_subjects := old.tutor_subjects;
  end if;
  return new;
end $$;

drop policy if exists "bookings: admin schedules" on public.bookings;
create policy "bookings: admin schedules" on public.bookings for insert with check (public.is_admin());

create or replace function public.price_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare rates jsonb; rate numeric; hrs numeric; c public.classes%rowtype; taken int;
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    new.status := 'pending'; new.paid := false; new.paid_at := null; new.pop_path := null; new.room := null; new.admin_message := '';
    new.tutor_id := null; new.delivered_at := null; new.tutor_note := '';
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
      rate := coalesce((rates->>new.subject)::numeric, (rates->>'default')::numeric, 0);
      new.fee := round(rate * hrs, 2); new.kind := 'one-on-one';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.paid and not old.paid and new.paid_at is null then new.paid_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.busy_slots(from_ts timestamptz, to_ts timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.ends_at from public.bookings b
  where b.kind = 'one-on-one' and b.status in ('pending','accepted') and b.starts_at < to_ts and b.ends_at > from_ts
    and (b.tutor_id is null or b.learner_id = auth.uid()
         or exists (select 1 from public.profiles t where t.id = b.tutor_id and t.role = 'admin'));
$$;

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (subject in ('maths','phys','chem')),
  hours numeric(6,1) not null default 0 check (hours >= 0 and hours <= 500),   -- hours allocated (0 = open)
  note text not null default '',                                              -- for the tutor
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (learner_id, tutor_id, subject)
);
create index if not exists assignments_tutor on public.assignments(tutor_id);
create index if not exists assignments_learner on public.assignments(learner_id);
alter table public.assignments enable row level security;
drop policy if exists "assignments: admin all" on public.assignments;
create policy "assignments: admin all" on public.assignments for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "assignments: tutor reads own" on public.assignments;
create policy "assignments: tutor reads own" on public.assignments for select using (tutor_id = auth.uid() and public.is_tutor());

-- a tutor's lessons, without fees or payment details
create or replace function public.tutor_lessons(from_ts timestamptz)
returns table (id uuid, ref text, learner_id uuid, learner_name text, school text, subject text, kind text, topics text, learner_note text,
               starts_at timestamptz, ends_at timestamptz, status text, room text, admin_message text, tutor_note text, delivered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.ref, b.learner_id, p.full_name, p.school, b.subject, b.kind, b.topics, b.learner_note,
         b.starts_at, b.ends_at, b.status, b.room, b.admin_message, b.tutor_note, b.delivered_at
  from public.bookings b join public.profiles p on p.id = b.learner_id
  where public.is_tutor() and b.tutor_id = auth.uid() and b.status in ('accepted','completed','cancelled')
    and b.starts_at >= coalesce(from_ts, now() - interval '120 days')
  order by b.starts_at;
$$;
-- the learners assigned to a tutor (name and school only), with the hours taught so far
create or replace function public.tutor_learners()
returns table (learner_id uuid, full_name text, school text, subject text, hours numeric, note text, taught numeric)
language sql stable security definer set search_path = public as $$
  select a.learner_id, p.full_name, p.school, a.subject, a.hours, a.note,
         coalesce((select round(sum(extract(epoch from (b.ends_at - b.starts_at)) / 3600.0)::numeric, 1) from public.bookings b
                   where b.learner_id = a.learner_id and b.tutor_id = a.tutor_id and b.subject = a.subject
                     and (b.status = 'completed' or (b.status = 'accepted' and b.delivered_at is not null))), 0)
  from public.assignments a join public.profiles p on p.id = a.learner_id
  where public.is_tutor() and a.tutor_id = auth.uid() and a.active
  order by p.full_name, a.subject;
$$;
-- the tutor logs a lesson: a note any time, "delivered" once it has started
create or replace function public.tutor_log_lesson(b uuid, note text, delivered boolean)
returns void language plpgsql security definer set search_path = public as $$
declare st timestamptz;
begin
  if not public.is_tutor() then raise exception 'Only tutors can log lessons.'; end if;
  select starts_at into st from public.bookings where id = b and tutor_id = auth.uid() and status in ('accepted','completed');
  if not found then raise exception 'This lesson is not assigned to you.'; end if;
  if delivered and st > now() + interval '15 minutes' then raise exception 'Mark the lesson as delivered once it has started.'; end if;
  update public.bookings set tutor_note = left(coalesce(note, ''), 2000),
         delivered_at = case when delivered then coalesce(delivered_at, now()) else null end
   where id = b;
end $$;
-- the tutor sets the meeting link of one lesson (b), or (b = null) their default link: saved on their profile and used for
-- upcoming lessons that have the built-in room or the previous default link. Empty link = the built-in private room.
create or replace function public.tutor_set_room(b uuid, link text)
returns int language plpgsql security definer set search_path = public as $$
declare l text := btrim(coalesce(link, '')); n int; old text;
begin
  if not public.is_tutor() then raise exception 'Only tutors can change lesson links.'; end if;
  if l <> '' and (length(l) > 400 or l !~ '^https://[^[:space:]<>"]{6,}$') then raise exception 'Paste the full meeting link, starting with https://'; end if;
  if b is null then
    select meet_link into old from public.profiles where id = auth.uid();
    update public.profiles set meet_link = l where id = auth.uid();
    update public.bookings set room = case when l = '' then 'AdventuityLesson-' || substr(md5(random()::text || id::text), 1, 10) else l end
     where tutor_id = auth.uid() and status = 'accepted' and ends_at > now()
       and ((l <> '' and (room is null or room !~ '^https://')) or (coalesce(old, '') <> '' and room = old));
    get diagnostics n = row_count;
    return n;
  end if;
  update public.bookings set room = case when l = '' then 'AdventuityLesson-' || substr(md5(random()::text || id::text), 1, 10) else l end
   where id = b and tutor_id = auth.uid() and status = 'accepted' and ends_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'This lesson is not assigned to you or is already over.'; end if;
  return n;
end $$;
-- learners: names of the tutors who teach them
create or replace function public.my_tutors()
returns table (tutor_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from public.profiles p
  where p.role in ('tutor','admin') and (
    exists (select 1 from public.bookings b where b.learner_id = auth.uid() and b.tutor_id = p.id)
    or exists (select 1 from public.assignments a where a.learner_id = auth.uid() and a.tutor_id = p.id and a.active));
$$;

revoke execute on function public.is_tutor() from public, anon;
revoke execute on function public.tutor_lessons(timestamptz), public.tutor_learners(), public.tutor_log_lesson(uuid, text, boolean), public.tutor_set_room(uuid, text), public.my_tutors() from public, anon;
grant execute on function public.is_tutor(), public.tutor_lessons(timestamptz), public.tutor_learners(), public.tutor_log_lesson(uuid, text, boolean), public.tutor_set_room(uuid, text), public.my_tutors() to authenticated;
