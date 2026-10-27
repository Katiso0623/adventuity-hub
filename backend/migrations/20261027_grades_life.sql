-- 2026-10-27 Grades 10–11 and Life Sciences: learner grade, subject 'life', Life Sciences fee.
-- Additive: one new nullable column; the subject lists are widened; existing rows keep their values.
alter table public.profiles add column if not exists grade smallint check (grade between 8 and 12);

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

