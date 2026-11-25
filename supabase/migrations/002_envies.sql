-- v0.10 : texte "envies" par profil, affiché au-dessus de la liste.
-- À lancer une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql pour une nouvelle installation).
begin;
set local search_path = giftmas;

alter table profiles add column if not exists note text check (length(note) <= 500);

-- Seuls la personne elle-même ou le créateur du profil peuvent écrire ses envies.
create or replace function set_profile_note(p_profile uuid, p_note text) returns void
language plpgsql security definer set search_path = giftmas as $$
begin
  if not (can_see_profile(p_profile) and can_manage_profile(p_profile)) then raise exception 'Non autorisé'; end if;
  update profiles set note = nullif(trim(p_note), '') where id = p_profile;
end $$;
revoke execute on function set_profile_note(uuid, text) from public;
grant execute on function set_profile_note(uuid, text) to authenticated;

commit;
