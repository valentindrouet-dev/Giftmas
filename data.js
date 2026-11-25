// Accès aux données : Supabase si configuré, sinon démo locale (même interface).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const DEMO = !SUPABASE_URL;
export const same = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

async function supabaseApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'giftmas' } });
  const ok = ({ data, error }) => {
    if (error) throw new Error(error.code === '23505' ? 'Déjà réservé par quelqu’un d’autre !' : error.message);
    return data;
  };
  let pseudo = null;
  return {
    async session() {
      if (!(await sb.auth.getSession()).data.session) return null;
      const u = ok(await sb.from('app_users').select('pseudo').maybeSingle());
      const m = ok(await sb.from('memberships').select('family_id').limit(1));
      return (pseudo = u && m.length ? u.pseudo : null);
    },
    async login(name) {
      let { session } = (await sb.auth.getSession()).data;
      if (!session) session = ok(await sb.auth.signInAnonymously()).session;
      ok(await sb.from('app_users').upsert({ id: session.user.id, pseudo: name }));
      pseudo = name;
    },
    logout: () => sb.auth.signOut(),
    joinFamily: async (code) => ok(await sb.rpc('join_family', { p_code: code })),
    createFamily: async (name) => ok(await sb.rpc('create_family', { p_name: name })),
    async load() {
      const q = (t) => sb.from(t).select('*');
      const [families, profiles, links, gifts, reservations, notifications] = (await Promise.all([
        q('families').order('name'), q('profiles').order('name'), q('profile_families'),
        q('gifts').order('created_at'), q('reservations'),
        q('notifications').order('created_at', { ascending: false }).limit(50),
      ])).map(ok);
      return { pseudo, families, profiles, links, gifts, reservations, notifications };
    },
    createProfile: async (p) => ok(await sb.rpc('create_profile', { p_name: p.name, p_photo: p.photo, p_is_me: p.isMe, p_families: p.families })),
    addProfileToFamily: async (pid, fid) => ok(await sb.rpc('add_profile_to_family', { p_profile: pid, p_family: fid })),
    deleteProfile: async (id) => ok(await sb.from('profiles').delete().eq('id', id)),
    addGift: async (g) => ok(await sb.from('gifts').insert({ ...g, added_by: pseudo })),
    deleteGift: async (id) => ok(await sb.from('gifts').delete().eq('id', id)),
    reserve: async (id) => ok(await sb.from('reservations').insert({ gift_id: id, reserved_by: pseudo })),
    unreserve: async (id) => ok(await sb.from('reservations').delete().eq('gift_id', id)),
    markRead: async () => ok(await sb.from('notifications').update({ read: true }).eq('read', false)),
    preview: async (url) => (await sb.functions.invoke('giftmas-preview', { body: { url } })).data ?? {},
    savePush: async (sub) => ok(await sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, pseudo, subscription: sub.toJSON() })),
    subscribe: (cb) => sb.channel('db').on('postgres_changes', { event: '*', schema: 'giftmas' }, cb).subscribe(),
  };
}

// ───────── Démo : localStorage partagé entre onglets, pseudo par onglet. Imite les règles du serveur. ─────────
function demoApi() {
  const KEY = 'giftmas-demo';
  const emoji = (e, bg) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect width="120" height="90" fill="${bg}"/><text x="60" y="58" font-size="44" text-anchor="middle">${e}</text></svg>`)}`;
  const seed = () => {
    const f1 = 'f1', f2 = 'f2', r = 'p-richard', m = 'p-mamie', l = 'p-lea';
    const items = [['LEGO Batman', 39.99, '🦇', '#2d3142'], ['Livre Astérix', 12.5, '📘', '#f4d35e'], ['Casque audio', 59, '🎧', '#ee6c4d'],
      ['Ballon de foot', 19.9, '⚽', '#3bb273'], ['Puzzle 1000 p.', 14.99, '🧩', '#7768ae'], ['Pyjama dino', 24, '🦖', '#57a773'],
      ['Jeu de société', 29.9, '🎲', '#e15554'], ['Peluche ours', 17, '🧸', '#c08552'], ['Montre', 45, '⌚', '#4d9de0'], ['Trottinette', 79, '🛴', '#e1bc29']];
    return {
      families: [{ id: f1, name: 'Famille Drouet', code: 'NOEL24' }, { id: f2, name: 'Belle-famille', code: 'SAPIN1' }],
      memberships: [{ pseudo: 'Thibaut', family_id: f1 }],
      profiles: [{ id: r, name: 'Richard', created_by: 'Valentin', owner: null }, { id: m, name: 'Mamie Jo', created_by: 'Valentin', owner: null },
        { id: l, name: 'Léa', created_by: 'Léa', owner: 'Léa' }],
      links: [{ profile_id: r, family_id: f1 }, { profile_id: m, family_id: f1 }, { profile_id: m, family_id: f2 }, { profile_id: l, family_id: f2 }],
      gifts: [...items.map(([name, price, e, bg], i) => ({ id: `g${i}`, profile_id: r, name, price, url: `https://www.amazon.fr/s?k=${encodeURIComponent(name)}`, image: emoji(e, bg), added_by: 'Valentin', created_at: `2026-11-0${i % 9 + 1}T10:00:00Z` })),
        { id: 'g-m1', profile_id: m, name: 'Plaid tout doux', price: 35, url: 'https://www.fnac.com', image: emoji('🛋️', '#d4a373'), added_by: 'Valentin', created_at: '2026-11-02T10:00:00Z' }],
      reservations: [{ gift_id: 'g2', reserved_by: 'Thibaut', created_at: '2026-11-20T18:30:00Z' }],
      notifications: [{ id: 1, recipient: 'Valentin', profile_id: r, body: 'Thibaut a réservé Casque audio pour Richard', read: false, created_at: '2026-11-20T18:30:00Z' }],
    };
  };
  const get = () => JSON.parse(localStorage.getItem(KEY) || 'null') ?? seed();
  const listeners = [];
  const mut = (fn) => { const s = get(); const out = fn(s); localStorage.setItem(KEY, JSON.stringify(s)); listeners.forEach((f) => f()); return out; };
  addEventListener('storage', (e) => e.key === KEY && listeners.forEach((f) => f()));
  const me = () => sessionStorage.getItem('giftmas-demo-pseudo');
  const now = () => new Date().toISOString();
  const fail = (m) => { throw new Error(m); };
  const view = (s) => {
    const families = s.families.filter((f) => s.memberships.some((m) => m.family_id === f.id && same(m.pseudo, me())));
    const links = s.links.filter((l) => families.some((f) => f.id === l.family_id));
    const profiles = s.profiles.filter((p) => links.some((l) => l.profile_id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
    const gifts = s.gifts.filter((g) => profiles.some((p) => p.id === g.profile_id));
    const mine = (id) => same(profiles.find((p) => p.id === gifts.find((g) => g.id === id)?.profile_id)?.owner, me());
    const reservations = s.reservations.filter((r) => gifts.some((g) => g.id === r.gift_id) && !mine(r.gift_id));
    const notifications = s.notifications.filter((n) => same(n.recipient, me())).reverse();
    return { pseudo: me(), families, profiles, links, gifts, reservations, notifications, mine };
  };
  const join = (s, f) => s.memberships.some((m) => m.family_id === f.id && same(m.pseudo, me())) || s.memberships.push({ pseudo: me(), family_id: f.id });
  return {
    async session() { return me() && view(get()).families.length ? me() : null; },
    async login(name) { sessionStorage.setItem('giftmas-demo-pseudo', name); },
    async logout() { sessionStorage.removeItem('giftmas-demo-pseudo'); },
    joinFamily: async (code) => mut((s) => { const f = s.families.find((f) => f.code === code.trim().toUpperCase()) ?? fail('Code famille inconnu'); join(s, f); return f; }),
    createFamily: async (name) => mut((s) => { const f = { id: crypto.randomUUID(), name, code: Math.random().toString(36).slice(2, 8).toUpperCase() }; s.families.push(f); join(s, f); return f; }),
    load: async () => view(get()),
    createProfile: async (p) => mut((s) => {
      const id = crypto.randomUUID();
      s.profiles.push({ id, name: p.name, photo: p.photo, created_by: me(), owner: p.isMe ? me() : null });
      p.families.forEach((fid) => s.links.push({ profile_id: id, family_id: fid }));
      return id;
    }),
    addProfileToFamily: async (pid, fid) => mut((s) => s.links.push({ profile_id: pid, family_id: fid })),
    deleteProfile: async (id) => mut((s) => { s.profiles = s.profiles.filter((p) => p.id !== id); }),
    addGift: async (g) => mut((s) => s.gifts.push({ ...g, id: crypto.randomUUID(), added_by: me(), created_at: now() })),
    deleteGift: async (id) => mut((s) => { s.gifts = s.gifts.filter((g) => g.id !== id); s.reservations = s.reservations.filter((r) => r.gift_id !== id); }),
    reserve: async (id) => mut((s) => {
      if (s.reservations.some((r) => r.gift_id === id)) fail('Déjà réservé par quelqu’un d’autre !');
      if (view(s).mine(id)) fail('C’est ta propre liste !');
      s.reservations.push({ gift_id: id, reserved_by: me(), created_at: now() });
      const g = s.gifts.find((g) => g.id === id), p = s.profiles.find((p) => p.id === g.profile_id);
      if (!same(p.created_by, me()) && !same(p.created_by, p.owner))
        s.notifications.push({ id: Date.now(), recipient: p.created_by, profile_id: p.id, body: `${me()} a réservé ${g.name} pour ${p.name}`, read: false, created_at: now() });
    }),
    unreserve: async (id) => mut((s) => { s.reservations = s.reservations.filter((r) => !(r.gift_id === id && same(r.reserved_by, me()))); }),
    markRead: async () => mut((s) => s.notifications.forEach((n) => same(n.recipient, me()) && (n.read = true))),
    preview: async () => ({}),
    savePush: async () => fail('Notifications push indisponibles en mode démo'),
    subscribe: (cb) => listeners.push(cb),
  };
}

export const api = DEMO ? demoApi() : await supabaseApi();
