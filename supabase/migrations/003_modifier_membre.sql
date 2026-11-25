-- v0.11 : modifier un membre (prénom, photo, âge, envies, familles) depuis la page Familles.
-- À lancer une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql pour une nouvelle installation).
begin;
set local search_path = giftmas;

-- âge stocké en année de naissance pour vieillir tout seul (approximation d'un an selon l'anniversaire)
alter table profiles add column if not exists birth_year smallint check (birth_year between 1900 and 2100);

-- Seuls la personne elle-même ou le créateur du profil peuvent le modifier.
-- Les familles dont on n'est pas membre restent intactes ; le profil doit garder au moins une famille.
create or replace function update_profile(p_profile uuid, p_name text, p_photo text, p_note text, p_birth_year smallint, p_families uuid[])
returns void language plpgsql security definer set search_path = giftmas as $$
begin
  if not (can_see_profile(p_profile) and can_manage_profile(p_profile)) then raise exception 'Non autorisé'; end if;
  if exists (select 1 from unnest(coalesce(p_families, '{}')) f where not is_member(f)) then raise exception 'Famille non autorisée'; end if;
  update profiles set name = trim(p_name), photo = p_photo, note = nullif(trim(p_note), ''), birth_year = p_birth_year where id = p_profile;
  delete from profile_families where profile_id = p_profile and is_member(family_id) and not family_id = any(coalesce(p_families, '{}'));
  insert into profile_families select p_profile, unnest(coalesce(p_families, '{}')) on conflict do nothing;
  if not exists (select 1 from profile_families where profile_id = p_profile) then
    raise exception 'Le profil doit rester dans au moins une famille';
  end if;
end $$;
revoke execute on function update_profile(uuid, text, text, text, smallint, uuid[]) from public;
grant execute on function update_profile(uuid, text, text, text, smallint, uuid[]) to authenticated;

commit;
