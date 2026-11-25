-- v0.13 : modifier un cadeau par un appui long sur sa vignette.
-- À lancer une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql pour une nouvelle installation).
begin;
set local search_path = giftmas;

-- Modifier un cadeau : celui qui l'a ajouté ou le gestionnaire du profil (mêmes droits que la suppression).
create or replace function update_gift(p_gift uuid, p_name text, p_price numeric, p_url text, p_image text) returns void
language plpgsql security definer set search_path = giftmas as $$
declare g gifts;
begin
  select * into g from gifts where id = p_gift;
  if g.id is null or not can_see_profile(g.profile_id)
     or not (same(g.added_by, my_pseudo()) or can_manage_profile(g.profile_id)) then
    raise exception 'Non autorisé';
  end if;
  update gifts set name = trim(p_name), price = p_price, url = p_url, image = p_image where id = p_gift;
end $$;
revoke execute on function update_gift(uuid, text, numeric, text, text) from public;
grant execute on function update_gift(uuid, text, numeric, text, text) to authenticated;

commit;
