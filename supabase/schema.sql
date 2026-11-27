-- Giftmas : schéma et sécurité (RLS), isolés dans le schéma "giftmas".
-- À coller tel quel dans Supabase > SQL Editor > Run. Tout ou rien : en cas d'erreur, rien n'est créé.
-- Ne touche à rien dans "public" : cohabite sans risque avec une autre app du même projet.
-- Identité : connexion anonyme Supabase (un compte par appareil) + pseudo.
-- Le pseudo sert d'identité "humaine" (créateur de profil, réservations, notifications),
-- pour qu'un même pseudo retrouve ses droits sur un nouvel appareil.

begin;
create schema giftmas;
set local search_path = giftmas;

-- ───────────── Tables ─────────────
create table app_users (
  id uuid primary key default auth.uid(),
  pseudo text not null check (length(trim(pseudo)) between 1 and 40)
);

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  code text not null unique,
  created_by text,                    -- pseudo du créateur (seul à pouvoir supprimer la famille)
  created_at timestamptz not null default now()
);

create table memberships (
  user_id uuid not null default auth.uid(),
  family_id uuid not null references families on delete cascade,
  primary key (user_id, family_id)
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  photo text check (photo ~ '^(https://|data:image/)' and length(photo) < 300000),
  created_by text not null,           -- pseudo du créateur (reçoit les notifications)
  owner text,                         -- pseudo de la personne elle-même ("c'est moi"), sinon null
  note text check (length(note) <= 500), -- envies, visibles au-dessus de la liste
  birth_year smallint check (birth_year between 1900 and 2100), -- âge approximatif
  created_at timestamptz not null default now()
);

create table profile_families (
  profile_id uuid not null references profiles on delete cascade,
  family_id uuid not null references families on delete cascade,
  primary key (profile_id, family_id)
);

create table gifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  price numeric(10,2) check (price >= 0),
  url text check (url ~* '^https?://' and length(url) < 2000),
  image text check (image ~ '^(https://|data:image/)' and length(image) < 300000),
  added_by text not null,
  created_at timestamptz not null default now()
);

create table reservations (
  gift_id uuid primary key references gifts on delete cascade,  -- un seul acheteur par cadeau
  reserved_by text not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table notifications (
  id bigint generated always as identity primary key,
  recipient text not null,
  profile_id uuid not null references profiles on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid(),
  pseudo text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- ───────────── Fonctions d'aide (security definer : contournent la RLS sans récursion) ─────────────
create function my_pseudo() returns text language sql stable security definer set search_path = giftmas as
$$ select pseudo from app_users where id = auth.uid() $$;

create function same(a text, b text) returns boolean language sql immutable as
$$ select lower(trim(a)) = lower(trim(b)) $$;

create function is_member(f uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from memberships where family_id = f and user_id = auth.uid()) $$;

create function can_see_profile(p uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from profile_families pf join memberships m using (family_id)
                  where pf.profile_id = p and m.user_id = auth.uid()) $$;

create function can_see_gift(g uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from gifts where id = g and can_see_profile(profile_id)) $$;

-- Vrai si le cadeau est sur MON profil : on me cache alors qui l'a réservé (effet surprise).
create function is_my_gift(g uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from gifts gi join profiles p on p.id = gi.profile_id
                  where gi.id = g and same(p.owner, my_pseudo())) $$;

create function can_manage_profile(p uuid) returns boolean language sql stable security definer set search_path = giftmas as
$$ select exists (select 1 from profiles where id = p and (same(created_by, my_pseudo()) or same(owner, my_pseudo()))) $$;

-- ───────────── RPC appelées par l'app ─────────────
create function create_family(p_name text) returns families language plpgsql security definer set search_path = giftmas as $$
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

create function join_family(p_code text) returns families language plpgsql security definer set search_path = giftmas as $$
declare f families;
begin
  if my_pseudo() is null then raise exception 'Choisis un pseudo d''abord'; end if;
  select * into f from families where code = upper(trim(p_code));
  if f.id is null then raise exception 'Code famille inconnu'; end if;
  insert into memberships (user_id, family_id) values (auth.uid(), f.id) on conflict do nothing;
  return f;
end $$;

create function create_profile(p_name text, p_photo text, p_is_me boolean, p_families uuid[])
returns uuid language plpgsql security definer set search_path = giftmas as $$
declare pid uuid; f uuid;
begin
  if my_pseudo() is null then raise exception 'Choisis un pseudo d''abord'; end if;
  if coalesce(array_length(p_families, 1), 0) = 0 then raise exception 'Choisis au moins une famille'; end if;
  foreach f in array p_families loop
    if not is_member(f) then raise exception 'Famille non autorisée'; end if;
  end loop;
  insert into profiles (name, photo, created_by, owner)
  values (trim(p_name), p_photo, my_pseudo(), case when p_is_me then my_pseudo() end)
  returning id into pid;
  insert into profile_families select pid, unnest(p_families);
  return pid;
end $$;

create function add_profile_to_family(p_profile uuid, p_family uuid) returns void
language plpgsql security definer set search_path = giftmas as $$
begin
  if not (can_see_profile(p_profile) and is_member(p_family)) then raise exception 'Non autorisé'; end if;
  insert into profile_families values (p_profile, p_family) on conflict do nothing;
end $$;

create function set_profile_note(p_profile uuid, p_note text) returns void
language plpgsql security definer set search_path = giftmas as $$
begin
  if not (can_see_profile(p_profile) and can_manage_profile(p_profile)) then raise exception 'Non autorisé'; end if;
  update profiles set note = nullif(trim(p_note), '') where id = p_profile;
end $$;

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

-- ───────────── Notification au créateur du profil à chaque réservation ─────────────
create function notify_reservation() returns trigger language plpgsql security definer set search_path = giftmas as $$
declare g gifts; p profiles;
begin
  select * into g from gifts where id = new.gift_id;
  select * into p from profiles where id = g.profile_id;
  -- pas de notif à soi-même, ni à la personne qui a créé son propre profil (surprise)
  if not same(p.created_by, new.reserved_by) and not coalesce(same(p.created_by, p.owner), false) then
    insert into notifications (recipient, profile_id, body)
    values (p.created_by, p.id, format('%s a réservé %s pour %s', new.reserved_by, g.name, p.name));
  end if;
  return new;
end $$;

create trigger on_reservation after insert on reservations
for each row execute function notify_reservation();

-- Cibles push d'une notification : abonnés au bon pseudo ET membres d'une famille du profil.
create function push_targets(p_profile uuid, p_recipient text) returns setof push_subscriptions
language sql stable security definer set search_path = giftmas as $$
  select s.* from push_subscriptions s
  where same(s.pseudo, p_recipient)
    and exists (select 1 from memberships m join profile_families pf using (family_id)
                where m.user_id = s.user_id and pf.profile_id = p_profile)
$$;

-- ───────────── RLS ─────────────
alter table app_users enable row level security;
alter table families enable row level security;
alter table memberships enable row level security;
alter table profiles enable row level security;
alter table profile_families enable row level security;
alter table gifts enable row level security;
alter table reservations enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

create policy me_read on app_users for select to authenticated using (id = auth.uid());
create policy me_insert on app_users for insert to authenticated with check (id = auth.uid());
create policy me_update on app_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy fam_read on families for select to authenticated using (is_member(id));
create policy mem_read on memberships for select to authenticated using (user_id = auth.uid());

create policy prof_read on profiles for select to authenticated using (can_see_profile(id));
create policy prof_delete on profiles for delete to authenticated using (can_see_profile(id) and same(created_by, my_pseudo()));
create policy pf_read on profile_families for select to authenticated using (is_member(family_id));

create policy gift_read on gifts for select to authenticated using (can_see_profile(profile_id));
create policy gift_insert on gifts for insert to authenticated
  with check (can_see_profile(profile_id) and same(added_by, my_pseudo()));
create policy gift_delete on gifts for delete to authenticated
  using (can_see_profile(profile_id) and (same(added_by, my_pseudo()) or can_manage_profile(profile_id)));

create policy resa_read on reservations for select to authenticated
  using (can_see_gift(gift_id) and not is_my_gift(gift_id));
create policy resa_insert on reservations for insert to authenticated
  with check (can_see_gift(gift_id) and not is_my_gift(gift_id)
              and same(reserved_by, my_pseudo()) and user_id = auth.uid());
create policy resa_delete on reservations for delete to authenticated
  using (can_see_gift(gift_id) and same(reserved_by, my_pseudo()));

create policy notif_read on notifications for select to authenticated
  using (same(recipient, my_pseudo()) and can_see_profile(profile_id));
create policy notif_delete on notifications for delete to authenticated
  using (same(recipient, my_pseudo()) and can_see_profile(profile_id));
create policy notif_update on notifications for update to authenticated
  using (same(recipient, my_pseudo()) and can_see_profile(profile_id));

create policy push_read on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and same(pseudo, my_pseudo()));
create policy push_update on push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and same(pseudo, my_pseudo()));
create policy push_delete on push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ───────────── Temps réel ─────────────
alter publication supabase_realtime add table profiles, profile_families, gifts, reservations, notifications;

-- ───────────── Droits : rien pour "anon", tout passe par la RLS pour "authenticated" ─────────────
grant usage on schema giftmas to authenticated, service_role;
grant all on all tables in schema giftmas to authenticated, service_role;
grant all on all sequences in schema giftmas to authenticated, service_role;
revoke execute on all functions in schema giftmas from public;
grant execute on all functions in schema giftmas to authenticated, service_role;
revoke execute on function push_targets(uuid, text) from authenticated;
revoke insert, update on notifications from authenticated;

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
grant update (read) on notifications to authenticated;

commit;
