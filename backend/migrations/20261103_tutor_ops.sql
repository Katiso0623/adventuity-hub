-- 2026-11-03 Tutor operations: learner allocation sheets assigned to tutors, tutor bank details and monthly tutor invoices.
-- Additive: new tables, two new nullable columns on assignments, one new storage bucket, new and replaced functions.
-- No existing rows change.

-- ---------------------------------------------------------------- learners allocated to Adventuity (imported from a sheet)
create table if not exists public.allocations (
  id uuid primary key default gen_random_uuid(),
  batch text not null default '',                     -- e.g. "SAILI 3 Nov 2026"
  sponsor_id uuid references public.sponsors(id) on delete set null,
  learner_name text not null check (length(learner_name) between 2 and 120),
  school text not null default '',
  grade smallint check (grade between 8 and 12),
  subject text not null check (subject in ('maths','phys','life')),   -- phys = Physical Sciences (physics and chemistry)
  hours numeric(6,1) not null default 0 check (hours >= 0 and hours <= 500),
  learner_phone text not null default '',
  guardian_phone text not null default '',
  email text not null default '',
  note text not null default '',
  status text not null default 'new' check (status in ('new','assigned','active','done','cancelled')),
  tutor_id uuid references public.profiles(id) on delete set null,
  learner_id uuid references public.profiles(id) on delete set null,   -- the learner's login, once there is one
  assigned_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists allocations_tutor on public.allocations(tutor_id);
create index if not exists allocations_status on public.allocations(status);
alter table public.allocations enable row level security;
drop policy if exists "allocations: admin all" on public.allocations;
create policy "allocations: admin all" on public.allocations for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "allocations: tutor reads own" on public.allocations;
create policy "allocations: tutor reads own" on public.allocations for select using (tutor_id = auth.uid() and public.is_tutor() and status in ('assigned','active'));

-- an assignment made from an allocation lets the tutor see the learner's numbers (they arrange the lessons)
alter table public.assignments add column if not exists share_contacts boolean not null default false;
alter table public.assignments add column if not exists allocation_id uuid references public.allocations(id) on delete set null;

-- the director assigns an allocated learner to a tutor; the tutor gets a message to contact the learner
create or replace function public.assign_allocation(p_alloc uuid, p_tutor uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a public.allocations; t public.profiles; sp text; s text; subj text[]; msg text; sname text;
begin
  if not public.is_admin() then raise exception 'Only the director can assign learners.'; end if;
  select * into a from public.allocations where id = p_alloc for update;
  if not found or a.status in ('done','cancelled') then raise exception 'Choose an open allocation.'; end if;
  select * into t from public.profiles where id = p_tutor and role = 'tutor' and not blocked;
  if not found then raise exception 'Choose a tutor.'; end if;
  subj := case a.subject when 'phys' then array['phys','chem'] else array[a.subject] end;
  sname := case a.subject when 'maths' then 'Mathematics' when 'phys' then 'Physical Sciences' else 'Life Sciences' end;
  select name into sp from public.sponsors where id = a.sponsor_id;
  -- a different tutor before: their assignment for this allocation ends
  if a.tutor_id is not null and a.tutor_id <> p_tutor then
    update public.assignments set active = false, share_contacts = false where allocation_id = a.id and tutor_id = a.tutor_id;
  end if;
  if a.learner_id is not null then
    foreach s in array subj loop
      insert into public.assignments (learner_id, tutor_id, subject, hours, note, active, share_contacts, allocation_id)
      values (a.learner_id, p_tutor, s, case when s = 'chem' then 0 else a.hours end, left(a.note, 500), true, true, a.id)
      on conflict (learner_id, tutor_id, subject) do update set hours = excluded.hours, active = true, share_contacts = true, allocation_id = excluded.allocation_id,
        note = case when excluded.note <> '' then excluded.note else public.assignments.note end;
    end loop;
    if a.sponsor_id is not null then update public.profiles set sponsor_id = a.sponsor_id where id = a.learner_id and sponsor_id is null; end if;
    -- numbers from the sheet fill the learner's empty contact fields
    update public.profiles set phone = case when coalesce(phone, '') = '' then a.learner_phone else phone end,
      guardian_phone = case when coalesce(guardian_phone, '') = '' then a.guardian_phone else guardian_phone end where id = a.learner_id;
  end if;
  update public.allocations set tutor_id = p_tutor, status = case when a.learner_id is not null then 'active' else 'assigned' end, assigned_at = now() where id = a.id;
  msg := 'New learner for you: ' || a.learner_name
    || coalesce(' (' || nullif(concat_ws(', ', case when a.grade is not null then 'Grade ' || a.grade end, nullif(a.school, '')), '') || ')', '')
    || ' – ' || sname || case when a.hours > 0 then ', ' || replace(rtrim(rtrim(a.hours::text, '0'), '.'), '.', ',') || ' hours' else '' end
    || coalesce(' (' || sp || ')', '') || '.' || chr(10)
    || coalesce(nullif(concat_ws(' · ', 'Learner: ' || nullif(a.learner_phone, ''), 'Parent: ' || nullif(a.guardian_phone, ''), 'E-mail: ' || nullif(a.email, '')), '') || chr(10), '')
    || case when a.note <> '' then 'Note: ' || a.note || chr(10) else '' end
    || 'Please contact them within 2 days to arrange the lesson times. '
    || case when a.learner_id is not null then 'They already have a login – schedule the lessons under Schedule.'
            else 'Then open My learners → New learners to set up their login, and schedule the lessons under Schedule.' end;
  insert into public.messages (learner_id, sender, body) values (p_tutor, auth.uid(), left(msg, 4000));
  return msg;
end $$;
revoke execute on function public.assign_allocation(uuid, uuid) from public, anon;
grant execute on function public.assign_allocation(uuid, uuid) to authenticated;

-- the learners assigned to a tutor; contact details for learners the tutor added or was allocated
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
         case when p.created_by = a.tutor_id or a.share_contacts then p.phone end,
         case when p.created_by = a.tutor_id or a.share_contacts then p.guardian_phone end,
         case when p.created_by = a.tutor_id or a.share_contacts then p.email end,
         p.grade, coalesce(p.must_change_password, false), coalesce(p.created_by = a.tutor_id, false)
  from public.assignments a join public.profiles p on p.id = a.learner_id
  where public.is_tutor() and a.tutor_id = auth.uid() and a.active
  order by p.full_name, a.subject;
$$;
revoke execute on function public.tutor_learners() from public, anon;
grant execute on function public.tutor_learners() to authenticated;

-- ---------------------------------------------------------------- tutor bank details (the tutor and the director only)
create table if not exists public.tutor_bank (
  tutor_id uuid primary key references public.profiles(id) on delete cascade,
  bank text not null default '' check (length(bank) <= 60),
  account_holder text not null default '' check (length(account_holder) <= 120),
  account_number text not null default '' check (account_number ~ '^[0-9]{0,20}$'),
  branch_code text not null default '' check (branch_code ~ '^[0-9]{0,8}$'),
  account_type text not null default 'savings' check (account_type in ('savings','current','transmission')),
  updated_at timestamptz not null default now()
);
alter table public.tutor_bank enable row level security;
drop policy if exists "tutor bank: own or admin read" on public.tutor_bank;
create policy "tutor bank: own or admin read" on public.tutor_bank for select using (tutor_id = auth.uid() or public.is_admin());
drop policy if exists "tutor bank: tutor saves own" on public.tutor_bank;
create policy "tutor bank: tutor saves own" on public.tutor_bank for insert with check ((tutor_id = auth.uid() and public.is_tutor()) or public.is_admin());
drop policy if exists "tutor bank: tutor updates own" on public.tutor_bank;
create policy "tutor bank: tutor updates own" on public.tutor_bank for update using ((tutor_id = auth.uid() and public.is_tutor()) or public.is_admin())
  with check ((tutor_id = auth.uid() and public.is_tutor()) or public.is_admin());

-- ---------------------------------------------------------------- a tutor's month: their invoice and the director's payment
create table if not exists public.tutor_months (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  month text not null check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  invoice_path text,                                   -- the tutor's own invoice in the 'tutor-invoices' bucket
  invoice_name text not null default '',
  invoice_amount numeric(10,2) check (invoice_amount is null or invoice_amount >= 0),
  use_statement boolean not null default false,        -- the tutor accepts the portal statement as their invoice
  note text not null default '' check (length(note) <= 500),
  submitted_at timestamptz,
  paid boolean not null default false,
  paid_amount numeric(10,2),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tutor_id, month)
);
alter table public.tutor_months enable row level security;
drop policy if exists "tutor months: own or admin read" on public.tutor_months;
create policy "tutor months: own or admin read" on public.tutor_months for select using (tutor_id = auth.uid() or public.is_admin());
drop policy if exists "tutor months: tutor submits own" on public.tutor_months;
create policy "tutor months: tutor submits own" on public.tutor_months for insert with check ((tutor_id = auth.uid() and public.is_tutor()) or public.is_admin());
drop policy if exists "tutor months: tutor updates own until paid" on public.tutor_months;
create policy "tutor months: tutor updates own until paid" on public.tutor_months for update using ((tutor_id = auth.uid() and public.is_tutor() and not paid) or public.is_admin())
  with check ((tutor_id = auth.uid() and public.is_tutor()) or public.is_admin());
drop policy if exists "tutor months: admin deletes" on public.tutor_months;
create policy "tutor months: admin deletes" on public.tutor_months for delete using (public.is_admin());
-- tutors never set the payment fields; submitting stamps the time
create or replace function public.guard_tutor_month() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then new.paid := false; new.paid_amount := null; new.paid_at := null;
    else new.paid := old.paid; new.paid_amount := old.paid_amount; new.paid_at := old.paid_at; new.tutor_id := old.tutor_id; new.month := old.month; end if;
    if new.invoice_path is not null and new.invoice_path not like new.tutor_id::text || '/%' then raise exception 'Upload the invoice again.'; end if;
    if new.invoice_path is not null or new.use_statement then new.submitted_at := now(); end if;
  end if;
  if new.paid and new.paid_at is null then new.paid_at := now(); end if;
  if not new.paid then new.paid_at := null; end if;
  return new;
end $$;
drop trigger if exists guard_tutor_month on public.tutor_months;
create trigger guard_tutor_month before insert or update on public.tutor_months for each row execute function public.guard_tutor_month();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-invoices', 'tutor-invoices', false, 5242880, array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
drop policy if exists "tutor invoices: tutor uploads own" on storage.objects;
create policy "tutor invoices: tutor uploads own" on storage.objects for insert to authenticated
  with check (bucket_id = 'tutor-invoices' and (storage.foldername(name))[1] = auth.uid()::text and public.is_tutor());
drop policy if exists "tutor invoices: own or admin read" on storage.objects;
create policy "tutor invoices: own or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'tutor-invoices' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------- the tutor contract template is for the director only
drop policy if exists "private settings: signed-in read" on public.private_settings;
create policy "private settings: signed-in read" on public.private_settings for select using (
  auth.uid() is not null and key not in ('invoice', 'contract') and (key <> 'payment' or public.is_admin()
    or exists (select 1 from public.bookings where learner_id = auth.uid() and status in ('accepted','completed'))
    or exists (select 1 from public.bundles where learner_id = auth.uid() and status = 'accepted')));

-- an allocation marked done or cancelled ends that tutor's access to the learner (contacts, scheduling); reopening restores it
create or replace function public.allocation_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('done', 'cancelled') and old.status is distinct from new.status then
    update public.assignments set active = false, share_contacts = false where allocation_id = new.id;
  elsif new.status = 'active' and old.status in ('done', 'cancelled') then   -- reopened: the same tutor carries on
    update public.assignments set active = true, share_contacts = true where allocation_id = new.id and tutor_id = new.tutor_id;
  end if;
  return new;
end $$;
revoke execute on function public.allocation_closed() from public, anon, authenticated;
drop trigger if exists allocation_closed on public.allocations;
create trigger allocation_closed after update of status on public.allocations for each row execute function public.allocation_closed();
