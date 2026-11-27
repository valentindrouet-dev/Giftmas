-- v0.23 : prix masqués une fois le cadeau réservé.
-- À lancer une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql pour une nouvelle installation).
begin;
set local search_path = giftmas;

-- Prix d'un cadeau réservé : visible seulement par celui qui l'a ajouté et celui qui l'a réservé.
-- La personne elle-même garde le prix sur sa liste (sinon elle devinerait la réservation).
create or replace function is_reserved(g uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from reservations where gift_id = g) $$;
create or replace function reserved_by_me(g uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from reservations where gift_id = g and same(reserved_by, my_pseudo())) $$;
create or replace function can_see_price(g uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select not is_reserved(g) or reserved_by_me(g) or is_my_gift(g)
       or exists (select 1 from gifts where id = g and same(added_by, my_pseudo())) $$;

-- L'app lit les cadeaux par cette vue ; la table ne livre plus la colonne prix.
create or replace view gifts_v as
  select id, profile_id, name, url, image, added_by, created_at, case when can_see_price(id) then price end as price
  from gifts where can_see_profile(profile_id);

-- Modifier un cadeau sans voir son prix (masqué) ne doit pas l'effacer.
create or replace function update_gift(p_gift uuid, p_name text, p_price numeric, p_url text, p_image text) returns void
language plpgsql security definer set search_path = giftmas as $$
declare g gifts;
begin
  select * into g from gifts where id = p_gift;
  if g.id is null or not can_see_profile(g.profile_id)
     or not (same(g.added_by, my_pseudo()) or can_manage_profile(g.profile_id)) then
    raise exception 'Non autorisé';
  end if;
  update gifts set name = trim(p_name), url = p_url, image = p_image,
    price = case when can_see_price(p_gift) then p_price else g.price end
  where id = p_gift;
end $$;

revoke select on gifts from authenticated;
grant select (id, profile_id, name, url, image, added_by, created_at) on gifts to authenticated;
grant select on gifts_v to authenticated;
revoke execute on function is_reserved(uuid), reserved_by_me(uuid), can_see_price(uuid) from public;
grant execute on function is_reserved(uuid), reserved_by_me(uuid), can_see_price(uuid) to authenticated;

commit;
