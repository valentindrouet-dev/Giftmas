# 🎁 Giftmas

Listes de cadeaux partagées en famille : une vignette par personne, ses idées de cadeaux avec visuel, prix et lien d'achat, et une case à cocher pour réserver. La réservation est synchronisée en temps réel chez tout le monde.

- Connexion par pseudo + code famille, sans mot de passe
- Plusieurs familles, et un même profil peut appartenir à plusieurs familles
- « C'est moi » : la personne ne voit pas ce qu'on lui a réservé
- Journal (qui a réservé quoi, pour qui, quand), partage WhatsApp et Messages
- Notifications au créateur du profil (« Thibaut a réservé LEGO Batman pour Richard »), dans l'app et en push sur le téléphone

HTML/CSS/JS sans build, Supabase pour la base, le temps réel et le push.
Sans configuration, l'app tourne en **mode démo** avec des données locales au navigateur (code `NOEL24` ou `SAPIN1`).

## Mise en route

### 1. Supabase (≈ 10 min)
Giftmas vit dans son propre schéma `giftmas` : il peut partager un projet existant sans toucher à ses tables (`public`).

1. **Vérification préalable si le projet sert déjà à une autre app.** Les connexions anonymes valent pour tout le projet : un visiteur anonyme de Giftmas devient `authenticated` pour l'autre app aussi. Dans **SQL Editor**, lance :

   ```sql
   select 'règle' as type, tablename as objet, policyname as nom, cmd, roles::text as roles, qual as condition, with_check
   from pg_policies where schemaname = 'public'
   union all
   select 'trigger auth', event_object_table, trigger_name, event_manipulation, null, action_statement, null
   from information_schema.triggers where event_object_schema = 'auth'
   union all
   select 'table sans RLS', relname, null, null, null, null, null
   from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity
   order by 1, 2;
   ```

   À surveiller : une règle `authenticated` dont la condition ne vérifie pas `auth.uid()` (ou vaut `true`), et un trigger sur `auth.users` qui crée des lignes pour chaque nouvel utilisateur.
2. **SQL Editor** : colle le contenu de `supabase/schema.sql`, puis **Run**. Tout ou rien : en cas d'erreur, rien n'est créé.
3. **Project Settings > Data API > Exposed schemas** : ajoute `giftmas` à la liste (garde `public`), puis **Save**.
4. **Authentication > Sign In / Providers** : active **Allow anonymous sign-ins**.
5. **Project Settings > API** : copie l'URL du projet et la clé `anon public` dans `config.js`.

### 2. GitHub Pages
**Settings > Pages** : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
Ouvre le lien, choisis « En créer une » pour créer ta famille, puis envoie l'invitation depuis 👪 > **Inviter**. Le lien d'invitation contient le code.

### 3. Notifications push (optionnel)
À lancer sur ton ordinateur (Node installé) :

```bash
npx web-push generate-vapid-keys
```

Mets la clé **publique** dans `config.js` (`VAPID_PUBLIC_KEY`), puis :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase secrets set GIFTMAS_VAPID_PUBLIC_KEY=<publique> GIFTMAS_VAPID_PRIVATE_KEY=<privée> GIFTMAS_VAPID_SUBJECT=mailto:<ton-email>
npx supabase functions deploy giftmas-push
npx supabase functions deploy giftmas-preview
```

Enfin, **Database > Webhooks > Create** : table `giftmas.notifications`, événement `Insert`, type **Supabase Edge Functions**, fonction `giftmas-push`.

`giftmas-preview` est facultative : elle pré-remplit le nom et l'image depuis le lien produit. Amazon la bloque souvent, il suffit alors d'ajouter une photo.

### 4. Sur iPhone
Safari > Partager > **Sur l'écran d'accueil**, puis ouvre Giftmas depuis l'icône. Dans 🔔, touche **Recevoir les notifications**. Chaque personne qui veut le push sur son téléphone doit faire cette manip ; les autres voient leurs notifications dans l'app.

## Tests
```bash
# Règles d'accès : dans une base Postgres vide, depuis la racine du repo
psql -v ON_ERROR_STOP=1 -f tests/rls.sql
# Parcours complet en mode démo (Playwright)
python3 -m http.server 8123 &
node tests/smoke.mjs
```

## Bon à savoir
- L'identité, c'est le pseudo : deux personnes avec le même pseudo partagent les mêmes droits. Utilisez des pseudos distincts.
- Les photos sont réduites (≈ 30 Ko) et stockées directement en base. Ça suffit pour quelques centaines de cadeaux.
- Décocher un cadeau retire aussi la ligne du journal.
