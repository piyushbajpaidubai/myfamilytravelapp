-- =====================================================================
--  My Travel Hub — Trip Stories: the storage half only.
--
--  Section 5 of supabase-stories.sql did not take: the trip-stories bucket
--  does not exist, which is why uploads answered 400. The table and its
--  policies are fine and are NOT repeated here.
--
--  CREATE THE BUCKET IN THE DASHBOARD FIRST, not from SQL:
--      Storage → New bucket
--      Name:   trip-stories
--      Public: OFF          ← this is the whole point; leave it unchecked
--
--  Inserting into storage.buckets from the SQL editor is unreliable —
--  depending on how the project was provisioned the editor's role may not
--  own that table, and the statement fails or is skipped. The dashboard
--  goes through the storage service itself and always works.
--
--  Then run this file. If any statement below fails with "must be owner of
--  table objects", say so — the policies can be added from
--  Storage → Policies in the dashboard instead, and that error means the
--  SQL route is closed on this project rather than that anything is wrong.
-- =====================================================================

-- Safety net: fail loudly rather than silently leaving the app broken.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'trip-stories') then
    raise exception 'The trip-stories bucket does not exist yet. Create it in the dashboard first (Storage → New bucket, Public OFF), then run this file.';
  end if;
  if (select public from storage.buckets where id = 'trip-stories') then
    raise exception 'The trip-stories bucket is PUBLIC. Stories would be readable by anyone with a URL. Set it to private in the dashboard before continuing.';
  end if;
end $$;

drop policy if exists "trip can read its live stories"  on storage.objects;
drop policy if exists "members upload their stories"    on storage.objects;
drop policy if exists "author or captain deletes story" on storage.objects;

-- Read: on the trip, and the story still live. The liveness check matters —
-- without it a path noted earlier would keep working until the cleanup job
-- next ran, up to fifteen minutes after the story was supposed to be gone.
create policy "trip can read its live stories"
on storage.objects for select to authenticated
using (
  bucket_id = 'trip-stories'
  and public.story_is_live(name)
  and exists (
    select 1 from public.trips t
    where  t.id = split_part(name, '/', 1)
      and (t.owner_uid = auth.uid()
           or auth.uid() = any(t.member_uids)
           or auth.uid() = any(t.viewer_uids))
  )
);

create policy "members upload their stories"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'trip-stories'
  and exists (
    select 1 from public.trips t
    where  t.id = split_part(name, '/', 1)
      and (t.owner_uid = auth.uid() or auth.uid() = any(t.member_uids))
  )
);

-- Delete: whoever owns the row that points at this file, or a captain.
-- Membership alone is not enough, or one traveller could delete another's.
create policy "author or captain deletes story"
on storage.objects for delete to authenticated
using (
  bucket_id = 'trip-stories'
  and (
    exists (select 1 from public.trip_stories s
            where  s.storage_path = name and s.author_uid = auth.uid())
    or public.is_trip_captain(split_part(name, '/', 1), auth.uid())
  )
);

-- =====================================================================
--  VERIFY:
--    select id, public from storage.buckets where id = 'trip-stories';
--      → one row, public = false
--    select policyname from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like '%stor%';
--      → the three above
-- =====================================================================
