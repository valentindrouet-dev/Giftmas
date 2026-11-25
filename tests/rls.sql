-- Test des règles d'accès sur un Postgres vierge (pas Supabase) :
--   psql -v ON_ERROR_STOP=1 -f tests/rls.sql   (dans une base vide, lancé depuis la racine du repo)
-- Imite le minimum de Supabase (rôles, auth.uid(), publication), charge le schéma puis vérifie.
do $$ begin create role anon; create role authenticated; create role service_role;
exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create publication supabase_realtime;
-- Une table "profiles" de l'autre app, pour vérifier la cohabitation
create table public.profiles (id int);

\i supabase/schema.sql
set search_path = giftmas, public;

-- Données de test
insert into families (id, name, code) values ('00000000-0000-0000-0000-0000000000f1', 'Famille démo', 'NOEL24');
insert into profiles (id, name, created_by) values ('00000000-0000-0000-0000-0000000000a1', 'Richard', 'Valentin');
insert into profile_families values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1');
insert into gifts (profile_id, name, price, url, added_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'LEGO Batman', 39.99, 'https://www.amazon.fr/s?k=lego+batman', 'Valentin'),
  ('00000000-0000-0000-0000-0000000000a1', 'Livre Astérix', 12.50, 'https://www.fnac.com/SearchResult/ResultList.aspx?Search=asterix', 'Valentin');

create function as_user(u text) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u, false) $$;
create function check_(ok boolean, what text) returns void language plpgsql as
$$ begin if not ok then raise exception 'ÉCHEC : %', what; end if; raise notice 'ok : %', what; end $$;
grant execute on function check_(boolean, text) to authenticated;

-- U1 = Valentin (créateur de Richard), U2 = Thibaut, U3 = Richard (a son propre appareil), U4 = étranger
set role authenticated;
select as_user('11111111-1111-1111-1111-111111111111');
insert into app_users (pseudo) values ('Valentin');
select join_family('noel24');
select as_user('22222222-2222-2222-2222-222222222222');
insert into app_users (pseudo) values ('Thibaut');
select join_family('NOEL24');
select as_user('33333333-3333-3333-3333-333333333333');
insert into app_users (pseudo) values ('Richard');
select join_family('NOEL24');
select create_profile('Moi Richard', null, true, array['00000000-0000-0000-0000-0000000000f1'::uuid]);
select as_user('44444444-4444-4444-4444-444444444444');
insert into app_users (pseudo) values ('Intrus');
reset role;
set role anon;
do $$ begin
  perform count(*) from gifts;
  raise exception 'anon lit les cadeaux';
exception when insufficient_privilege or undefined_table then null; end $$;
set role authenticated;
select check_(true, 'le rôle anon (sans connexion) n''a aucun accès');

select check_((select count(*) from gifts) = 0, 'un étranger ne voit aucun cadeau');
select check_((select count(*) from families) = 0, 'un étranger ne voit aucune famille');

-- Thibaut réserve un cadeau de Richard (profil géré par Valentin)
select as_user('22222222-2222-2222-2222-222222222222');
select check_((select count(*) from gifts) = 2, 'un membre voit les cadeaux de sa famille');
insert into reservations (gift_id, reserved_by) select id, 'Thibaut' from gifts where name = 'LEGO Batman';
do $$ begin
  insert into reservations (gift_id, reserved_by) select id, 'Valentin' from gifts where name = 'Livre Astérix';
  raise exception 'usurpation acceptée';
exception when insufficient_privilege then null; end $$;
select check_(true, 'impossible de réserver au nom d''un autre');

-- Valentin voit la réservation et reçoit la notification
select as_user('11111111-1111-1111-1111-111111111111');
select check_((select count(*) from reservations) = 1, 'la réservation est visible par les autres');
select check_((select body from notifications) = 'Thibaut a réservé LEGO Batman pour Richard', 'notification au créateur du profil');
do $$ begin
  begin delete from reservations; end;
  if (select count(*) from reservations) <> 1 then raise exception 'ÉCHEC : Valentin a annulé la réservation de Thibaut'; end if;
end $$;
select check_(true, 'on ne peut pas décocher la réservation d''un autre');
update notifications set read = true;
select check_((select bool_and(read) from notifications), 'marquer comme lu');
do $$ begin
  update notifications set body = 'hack';
  raise exception 'modif du texte acceptée';
exception when insufficient_privilege then null; end $$;
select check_(true, 'le texte d''une notif est en lecture seule');

-- Surprise : Richard (profil "c'est moi") ne voit pas qui a réservé chez lui
select as_user('22222222-2222-2222-2222-222222222222');
insert into gifts (profile_id, name, added_by) select id, 'Pull moche', 'Thibaut' from profiles where name = 'Moi Richard';
insert into reservations (gift_id, reserved_by) select id, 'Thibaut' from gifts where name = 'Pull moche';
select as_user('33333333-3333-3333-3333-333333333333');
select check_((select count(*) from gifts where name = 'Pull moche') = 1, 'Richard voit les cadeaux de sa liste');
select check_((select count(*) from reservations r join gifts g on g.id = r.gift_id where g.name = 'Pull moche') = 0,
              'Richard ne voit pas les réservations sur son propre profil');
select check_((select count(*) from notifications) = 0, 'pas de notification à Richard pour son propre profil');
select check_((select count(*) from reservations) = 1, 'Richard voit les réservations des autres profils');

-- Envies : le créateur ou la personne peuvent les écrire, pas les autres
select as_user('11111111-1111-1111-1111-111111111111');
select set_profile_note('00000000-0000-0000-0000-0000000000a1', '  Fan de LEGO  ');
select check_((select note from profiles where name = 'Richard') = 'Fan de LEGO', 'le créateur écrit les envies');
select as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  perform set_profile_note('00000000-0000-0000-0000-0000000000a1', 'hack');
  raise exception 'envies modifiées par un autre';
exception when raise_exception then if sqlerrm <> 'Non autorisé' then raise; end if; end $$;
select check_(true, 'un autre membre ne peut pas modifier les envies');
do $$ begin
  update profiles set note = 'hack';
  if (select note from profiles where name = 'Richard') <> 'Fan de LEGO' then raise exception 'ÉCHEC : update direct accepté'; end if;
end $$;
select check_(true, 'pas de modification directe de la table profiles');
select as_user('33333333-3333-3333-3333-333333333333');
select set_profile_note((select id from profiles where name = 'Moi Richard'), 'Des chaussettes');
select check_((select note from profiles where name = 'Moi Richard') = 'Des chaussettes', 'la personne écrit ses propres envies');

-- Modifier un membre
select as_user('11111111-1111-1111-1111-111111111111');
select update_profile('00000000-0000-0000-0000-0000000000a1', ' Richou ', null, 'LEGO', 2018::smallint, array['00000000-0000-0000-0000-0000000000f1'::uuid]);
select check_((select name || birth_year from profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Richou2018', 'le créateur modifie le prénom et l''âge');
do $$ begin
  perform update_profile('00000000-0000-0000-0000-0000000000a1', 'Richou', null, null, null, '{}');
  raise exception 'profil sans famille accepté';
exception when raise_exception then if sqlerrm <> 'Le profil doit rester dans au moins une famille' then raise; end if; end $$;
select check_((select count(*) from profile_families where profile_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'un membre garde au moins une famille');
select as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  perform update_profile('00000000-0000-0000-0000-0000000000a1', 'Pirate', null, null, null, array['00000000-0000-0000-0000-0000000000f1'::uuid]);
  raise exception 'modif par un autre acceptée';
exception when raise_exception then if sqlerrm <> 'Non autorisé' then raise; end if; end $$;
select check_(true, 'un autre membre ne peut pas modifier le profil');

-- L'étranger ne peut rien faire
select as_user('44444444-4444-4444-4444-444444444444');
do $$ begin
  perform create_profile('X', null, false, array['00000000-0000-0000-0000-0000000000f1'::uuid]);
  raise exception 'profil créé dans une famille étrangère';
exception when raise_exception then
  if sqlerrm <> 'Famille non autorisée' then raise; end if;
end $$;
select check_(true, 'pas de profil dans une famille dont on n''est pas membre');
do $$ begin
  insert into gifts (profile_id, name, added_by) values ('00000000-0000-0000-0000-0000000000a1', 'X', 'Intrus');
  raise exception 'cadeau ajouté par un étranger';
exception when insufficient_privilege then null; end $$;
select check_(true, 'pas de cadeau ajouté par un étranger');
reset role;
