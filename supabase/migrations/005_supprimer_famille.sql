-- v0.15 : supprimer une famille (par son créateur).
-- À lancer une fois dans Supabase > SQL Editor (déjà inclus dans schema.sql pour une nouvelle installation).
begin;
set local search_path = giftmas;

alter table families add column if not exists created_by text;

create or replace function create_family(p_name text) returns families language plpgsql security definer set search_path = giftmas as $$
declare f families;
begin
  if my_pseudo() is null then raise exception 'Choisis un pseudo d''abord'; end if;
  insert into families (name, code, created_by)
  values (trim(p_name),
          (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
           from generate_series(1, 6)),
          my_pseudo())
  returning * into f;
  insert into memberships (user_id, family_id) values (auth.uid(), f.id);
  return f;
end $$;

-- Supprimer une famille : son créateur seulement (familles d'avant v0.15 sans créateur : tout membre).
-- Les profils qui n'appartenaient qu'à cette famille sont supprimés avec leurs cadeaux (sinon invisibles pour tous).
create or replace function delete_family(p_family uuid) returns void language plpgsql security definer set search_path = giftmas as $$
declare members uuid[];
begin
  if not exists (select 1 from families where id = p_family and is_member(id) and (created_by is null or same(created_by, my_pseudo()))) then
    raise exception 'Seul le créateur de la famille peut la supprimer';
  end if;
  select array_agg(profile_id) into members from profile_families where family_id = p_family;
  delete from families where id = p_family;
  delete from profiles p where p.id = any(coalesce(members, '{}'))
    and not exists (select 1 from profile_families pf where pf.profile_id = p.id);
end $$;
revoke execute on function delete_family(uuid) from public;
grant execute on function delete_family(uuid) to authenticated;

commit;
