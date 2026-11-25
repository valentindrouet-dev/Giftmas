-- v0.20 : chacun peut supprimer ses propres notifications.
-- À lancer une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql pour une nouvelle installation).
begin;
set local search_path = giftmas;

create policy notif_delete on notifications for delete to authenticated
  using (same(recipient, my_pseudo()) and can_see_profile(profile_id));
grant delete on notifications to authenticated;

commit;
