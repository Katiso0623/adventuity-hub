-- Floodline: EFT as a full payment method (18 November 2026)
-- Clients attach a proof of payment on the pay page; the file is kept in a private bucket that only the
-- floodline-pay function (service key) can read or write. Administrators open it through a 10-minute signed link.
alter table public.floodline_invoices
  add column if not exists proof_path text,
  add column if not exists proof_name text,
  add column if not exists proof_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('floodline-pop', 'floodline-pop', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- no storage.objects policies for this bucket on purpose: anon and signed-in users have no access at all
