-- Adventuity Learning Hub — back office schema (Supabase / Postgres)
-- Roles: 'admin' (the director), 'tutor' (staff accounts the admin creates) and 'learner'. Every table has row-level security.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- private config (service role only)
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;   -- no policies: only service role / security definer code can read

-- public settings (fees, availability, site text) – created early because is_approved() reads 'access'
create table if not exists public.public_settings (key text primary key, value jsonb not null, updated_at timestamptz default now());

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text default '',
  school text default '',
  guardian_phone text default '',
  role text not null default 'learner' check (role in ('learner','admin','tutor')),
  approved boolean not null default false,
  blocked boolean not null default false,
  must_change_password boolean not null default false,   -- set when the admin hands out a temporary password
  meet_link text not null default '',                     -- tutors: their own Google Meet link (default for their lessons)
  tutor_rate numeric(10,2) not null default 0,            -- tutors: pay per hour (admin only)
  tutor_subjects text not null default '',                -- tutors: e.g. 'maths,phys'
  grade smallint check (grade between 8 and 12),           -- learners: school grade (10, 11 or 12)
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists grade smallint check (grade between 8 and 12);
-- upgrade path for databases created before tutor accounts (2026-10-26)
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists meet_link text not null default '';
alter table public.profiles add column if not exists tutor_rate numeric(10,2) not null default 0;
alter table public.profiles add column if not exists tutor_subjects text not null default '';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('learner','admin','tutor'));
alter table public.profiles enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not blocked);
$$;
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and not p.blocked
    and (p.approved or p.role = 'admin'
         or coalesce((select (value->>'open')::boolean from public.public_settings where key = 'access'), false)));
$$;
-- tutors: staff accounts the admin creates; they see only their own lessons and assigned learners (through the functions below)
create or replace function public.is_tutor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor' and not blocked);
$$;

drop policy if exists "profiles: own or admin read" on public.profiles;
create policy "profiles: own or admin read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update" on public.profiles for update using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles: admin delete" on public.profiles;
create policy "profiles: admin delete" on public.profiles for delete using (public.is_admin());

-- learners may edit their contact details but never their role/approval
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
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- create a profile for every new auth user; the tutor's email becomes admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare admin_email text;
begin
  select value into admin_email from public.app_config where key = 'admin_email';
  insert into public.profiles (id, email, full_name, phone, school, guardian_phone, grade, role, approved)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          coalesce(new.raw_user_meta_data->>'phone', ''),
          coalesce(new.raw_user_meta_data->>'school', ''),
          coalesce(new.raw_user_meta_data->>'guardian_phone', ''),
          case when coalesce(new.raw_user_meta_data->>'grade', '') in ('8','9','10','11','12') then (new.raw_user_meta_data->>'grade')::smallint end,
          case when lower(new.email) = lower(coalesce(admin_email, '')) then 'admin' else 'learner' end,
          lower(new.email) = lower(coalesce(admin_email, '')))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- settings
alter table public.public_settings enable row level security;
drop policy if exists "public settings: anyone reads" on public.public_settings;
create policy "public settings: anyone reads" on public.public_settings for select using (true);
drop policy if exists "public settings: admin writes" on public.public_settings;
create policy "public settings: admin writes" on public.public_settings for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.private_settings (key text primary key, value jsonb not null, updated_at timestamptz default now());
alter table public.private_settings enable row level security;
drop policy if exists "private settings: admin writes" on public.private_settings;
create policy "private settings: admin writes" on public.private_settings for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- group classes
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('maths','phys','chem','life')),
  title text not null,
  starts_at timestamptz not null,
  minutes int not null default 90 check (minutes between 15 and 300),
  topics text default '',
  fee numeric(10,2) not null default 0 check (fee >= 0),
  capacity int not null default 30 check (capacity between 1 and 500),
  notes text default '',
  published boolean not null default true,
  created_at timestamptz default now()
);
alter table public.classes enable row level security;
drop policy if exists "classes: signed-in read published" on public.classes;
create policy "classes: signed-in read published" on public.classes for select using ((published and auth.uid() is not null) or public.is_admin());
drop policy if exists "classes: admin all" on public.classes;
create policy "classes: admin all" on public.classes for all using (public.is_admin()) with check (public.is_admin());

-- the meeting room and links of a class: tutor only (learners get the room on their accepted booking)
create table if not exists public.class_private (
  class_id uuid primary key references public.classes(id) on delete cascade,
  room text not null default ('AdventuityClass-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  link text default ''
);
alter table public.class_private enable row level security;
drop policy if exists "class private: admin" on public.class_private;
create policy "class private: admin" on public.class_private for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.class_private_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.class_private (class_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists class_private_row on public.classes;
create trigger class_private_row after insert on public.classes for each row execute function public.class_private_row();

-- ---------------------------------------------------------------- bookings
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null default upper(substr(md5(random()::text), 1, 6)),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  kind text not null default 'one-on-one' check (kind in ('one-on-one','group')),
  subject text not null check (subject in ('maths','phys','chem','life')),
  topics text default '',
  learner_note text default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','completed')),
  fee numeric(10,2) not null default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  pop_path text,
  room text,
  admin_message text default '',
  tutor_id uuid references public.profiles(id) on delete set null,   -- null = the admin teaches it
  delivered_at timestamptz,                                          -- set by the tutor after the lesson
  tutor_note text not null default '',                               -- the tutor's lesson log
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bookings add column if not exists tutor_id uuid references public.profiles(id) on delete set null;
alter table public.bookings add column if not exists delivered_at timestamptz;
alter table public.bookings add column if not exists tutor_note text not null default '';
create index if not exists bookings_tutor on public.bookings(tutor_id);
create index if not exists bookings_starts on public.bookings(starts_at);
create index if not exists bookings_learner on public.bookings(learner_id);
create index if not exists bookings_class on public.bookings(class_id);
alter table public.bookings enable row level security;
drop policy if exists "bookings: own or admin read" on public.bookings;
create policy "bookings: own or admin read" on public.bookings for select using (learner_id = auth.uid() or public.is_admin());
drop policy if exists "bookings: learner requests" on public.bookings;
create policy "bookings: learner requests" on public.bookings for insert with check (
  learner_id = auth.uid() and status = 'pending' and paid = false and room is null
  and exists (select 1 from public.profiles where id = auth.uid() and not blocked));
drop policy if exists "bookings: admin schedules" on public.bookings;
create policy "bookings: admin schedules" on public.bookings for insert with check (public.is_admin());
drop policy if exists "bookings: admin manages" on public.bookings;
create policy "bookings: admin manages" on public.bookings for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "bookings: admin deletes" on public.bookings;
create policy "bookings: admin deletes" on public.bookings for delete using (public.is_admin());

drop policy if exists "private settings: signed-in read" on public.private_settings;
create policy "private settings: signed-in read" on public.private_settings for select using (
  auth.uid() is not null and (key <> 'payment' or public.is_admin()
    or exists (select 1 from public.bookings where learner_id = auth.uid() and status in ('accepted','completed'))));

-- fee is always set by the server from the fee table, never by the learner; learner requests are validated here
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
      rate := coalesce((rates->>new.subject)::numeric, (rates->>'default')::numeric, (rates->>'maths')::numeric, 0);
      new.fee := round(rate * hrs, 2); new.kind := 'one-on-one';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.paid and not old.paid and new.paid_at is null then new.paid_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists price_booking on public.bookings;
create trigger price_booking before insert or update on public.bookings for each row execute function public.price_booking();

-- learners: cancel own pending/accepted booking, attach proof of payment
create or replace function public.cancel_booking(b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'cancelled'
   where id = b and learner_id = auth.uid()
     and ((status = 'pending' and starts_at > now()) or (status = 'accepted' and starts_at > now() + interval '24 hours'));
  if not found then raise exception 'This lesson can no longer be cancelled here – message the tutor.'; end if;
end $$;
create or replace function public.attach_pop(b uuid, path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set pop_path = path where id = b and learner_id = auth.uid() and path like auth.uid()::text || '/%';
end $$;

-- taken slots without names (so learners do not request a slot that is already booked)
create or replace function public.busy_slots(from_ts timestamptz, to_ts timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.ends_at from public.bookings b
  where b.kind = 'one-on-one' and b.status in ('pending','accepted') and b.starts_at < to_ts and b.ends_at > from_ts
    and (b.tutor_id is null or b.learner_id = auth.uid()
         or exists (select 1 from public.profiles t where t.id = b.tutor_id and t.role = 'admin'));
$$;
-- how many seats are taken in each class
create or replace function public.class_seats()
returns table (class_id uuid, taken bigint)
language sql stable security definer set search_path = public as $$
  select class_id, count(*) from public.bookings where class_id is not null and status in ('pending','accepted') group by class_id;
$$;

-- ---------------------------------------------------------------- tutor notes (annotations)
create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  target text not null,                         -- section id, practice question id or topic id
  body text not null,
  audience uuid references public.profiles(id) on delete cascade,   -- null = all learners, otherwise one learner
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists annotations_target on public.annotations(target);
create index if not exists annotations_audience on public.annotations(audience);
alter table public.annotations enable row level security;
drop policy if exists "annotations: learners read theirs" on public.annotations;
create policy "annotations: learners read theirs" on public.annotations for select using (public.is_admin() or (public.is_approved() and (audience is null or audience = auth.uid())));
drop policy if exists "annotations: admin all" on public.annotations;
create policy "annotations: admin all" on public.annotations for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- messages (tutor <-> learner chat)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,   -- the conversation
  sender uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_learner on public.messages(learner_id, created_at);
create index if not exists messages_sender on public.messages(sender);
alter table public.messages enable row level security;
drop policy if exists "messages: read own thread" on public.messages;
create policy "messages: read own thread" on public.messages for select using (learner_id = auth.uid() or public.is_admin());
drop policy if exists "messages: send in own thread" on public.messages;
create policy "messages: send in own thread" on public.messages for insert with check (
  sender = auth.uid() and (public.is_admin() or (learner_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and not blocked))));
drop policy if exists "messages: admin deletes" on public.messages;
create policy "messages: admin deletes" on public.messages for delete using (public.is_admin());
create or replace function public.mark_read(thread uuid) returns void
language sql security definer set search_path = public as $$
  update public.messages set read_at = now()
   where learner_id = thread and read_at is null and sender <> auth.uid()
     and (thread = auth.uid() or public.is_admin());
$$;

-- ---------------------------------------------------------------- learner progress (synced)
create table if not exists public.progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;
drop policy if exists "progress: own" on public.progress;
create policy "progress: own" on public.progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "progress: admin reads" on public.progress;
create policy "progress: admin reads" on public.progress for select using (public.is_admin());

-- ---------------------------------------------------------------- push notification subscriptions
create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  sub jsonb not null,
  created_at timestamptz default now()
);
create index if not exists push_subs_user on public.push_subs(user_id);
alter table public.push_subs enable row level security;
drop policy if exists "push: own" on public.push_subs;
create policy "push: own" on public.push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- study-material key (approved learners + admin)
create table if not exists public.content_keys (
  id text primary key,
  k text not null
);
alter table public.content_keys enable row level security;
drop policy if exists "content key: approved" on public.content_keys;
create policy "content key: approved" on public.content_keys for select using (public.is_approved());

-- ---------------------------------------------------------------- realtime for the admin dashboard and learner status
do $$ begin
  begin alter publication supabase_realtime add table public.bookings; exception when others then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------- storage: proof of payment
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pop', 'pop', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "pop: learner uploads own" on storage.objects;
create policy "pop: learner uploads own" on storage.objects for insert to authenticated with check (bucket_id = 'pop' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pop: own or admin read" on storage.objects;
create policy "pop: own or admin read" on storage.objects for select to authenticated using (bucket_id = 'pop' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------- tutor applications (public form → edge function → tutor only)
create table if not exists public.tutor_applications (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('T-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))),
  created_at timestamptz not null default now(),
  full_name text not null check (length(full_name) between 2 and 120),
  email text not null check (length(email) between 5 and 200),
  phone text not null check (length(phone) between 9 and 30),
  province text default '',
  town text default '',
  subjects text[] not null default '{}',
  grades text[] not null default '{}',
  qualification text not null check (length(qualification) between 2 and 200),
  institution text default '',
  experience_years int default 0 check (experience_years between 0 and 50),
  mode text not null default 'online' check (mode in ('online','in_person','both')),
  availability text default '',
  about text default '' check (length(about) <= 1500),
  referral text default '',
  cv_path text,
  cv_name text,
  cv_size int,
  status text not null default 'new' check (status in ('new','shortlisted','interview','accepted','declined')),
  admin_notes text default '',
  consent_at timestamptz not null default now(),
  ip_hash text
);
create index if not exists tutor_applications_created on public.tutor_applications(created_at desc);
create index if not exists tutor_applications_email on public.tutor_applications(lower(email));
create index if not exists tutor_applications_ip on public.tutor_applications(ip_hash, created_at);
alter table public.tutor_applications enable row level security;
-- no insert policy: only the tutor-apply edge function (service key) adds applications
create policy "tutor applications: tutor only" on public.tutor_applications for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
create policy "cvs: tutor reads" on storage.objects for select to authenticated using (bucket_id = 'cvs' and public.is_admin());
create policy "cvs: tutor deletes" on storage.objects for delete to authenticated using (bucket_id = 'cvs' and public.is_admin());

-- ---------------------------------------------------------------- tutors: learner assignments, lessons, lesson log
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (subject in ('maths','phys','chem','life')),
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

-- ---------------------------------------------------------------- Life Sciences (2026-10-27): widen the subject lists of existing databases
alter table public.bookings drop constraint if exists bookings_subject_check;
alter table public.bookings add constraint bookings_subject_check check (subject in ('maths','phys','chem','life'));
alter table public.classes drop constraint if exists classes_subject_check;
alter table public.classes add constraint classes_subject_check check (subject in ('maths','phys','chem','life'));
alter table public.assignments drop constraint if exists assignments_subject_check;
alter table public.assignments add constraint assignments_subject_check check (subject in ('maths','phys','chem','life'));
-- Life Sciences lessons start at the Mathematics hourly fee until the admin sets their own
update public.public_settings set value = value || jsonb_build_object('life', coalesce(value->'life', value->'maths', '250'::jsonb)), updated_at = now()
 where key = 'fees' and not (value ? 'life');

-- ---------------------------------------------------------------- function grants (least privilege)
revoke execute on function public.guard_profile() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.class_private_row() from public, anon, authenticated;
revoke execute on function public.price_booking() from public, anon, authenticated;
revoke execute on function public.attach_pop(uuid, text) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
revoke execute on function public.mark_read(uuid) from public, anon;
revoke execute on function public.busy_slots(timestamptz, timestamptz) from public, anon;
revoke execute on function public.class_seats() from public, anon;
grant execute on function public.attach_pop(uuid, text), public.cancel_booking(uuid), public.mark_read(uuid), public.busy_slots(timestamptz, timestamptz), public.class_seats() to authenticated;
revoke execute on function public.is_tutor() from public, anon;
revoke execute on function public.tutor_lessons(timestamptz), public.tutor_learners(), public.tutor_log_lesson(uuid, text, boolean), public.tutor_set_room(uuid, text), public.my_tutors() from public, anon;
grant execute on function public.is_tutor(), public.tutor_lessons(timestamptz), public.tutor_learners(), public.tutor_log_lesson(uuid, text, boolean), public.tutor_set_room(uuid, text), public.my_tutors() to authenticated;
