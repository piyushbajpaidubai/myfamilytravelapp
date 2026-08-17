-- =====================================================================
--  Trip Stories — a bisect, not a fix.
--
--  Established so far:
--    · the path the app sends is correct        bu2er44/<uuid>/1.jpeg
--    · the request carries a valid signed-in token
--    · the policy condition passes as `authenticated` (RLS applied)
--    · Postgres ACCEPTS the exact insert the app makes
--
--  And yet the upload is refused as an RLS violation. So the refusal is
--  not coming from the condition itself. Two candidates remain, and this
--  separates them by replacing the insert check with the same trivial one
--  trip-media uses — a bucket test and nothing more.
--
--  IT WORKS  → the expression is evaluated differently inside the storage
--              service than in a direct insert. Rebuild the membership
--              check in a form the service tolerates, then re-tighten.
--  IT FAILS  → the policy was never the cause. The request is not arriving
--              as `authenticated` at all, whatever the client believes, and
--              the headers are the place to look.
--
--  READING IS UNTOUCHED. Only who may WRITE into the bucket is relaxed —
--  from members of that trip to any signed-in account. Nothing becomes
--  visible to anyone new: watching is still trip members and invited
--  viewers, still only while live, still nothing at all for share links.
--  Tighten this back as soon as the answer is known.
-- =====================================================================

drop policy if exists "members upload their stories" on storage.objects;

create policy "members upload their stories"
on storage.objects for insert to authenticated
with check (bucket_id = 'trip-stories');

-- The membership check this replaces, kept here so re-tightening is a copy:
--
--   with check (
--     bucket_id = 'trip-stories'
--     and public.story_path_is_mine(name, auth.uid())
--   );
