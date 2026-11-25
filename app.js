import { api, DEMO, same } from './data.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { parsePrice } from './price.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const euro = (n) => (n == null ? '' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }));
const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const appUrl = location.origin + location.pathname;
const VERSION = 'v0.16';
let sort = localStorage.getItem('giftmas-sort') || 'added';
const ico = (name) => `<img class="ico" src="assets/i-${name}.webp" alt="">`;
const empty = (img, text) => `<div class="empty"><img src="assets/empty-${img}.webp" alt="">${text}</div>`;
let D; // toutes les données visibles
let filter = localStorage.getItem('giftmas-filter') || '';

// ───────── Démarrage ─────────
const invite = new URLSearchParams(location.search).get('code');
navigator.serviceWorker?.register('sw.js');
if (await api.session()) {
  if (invite) await api.joinFamily(invite).catch((e) => toast(e.message));
  start();
} else login(invite);

async function start() {
  history.replaceState(null, '', location.pathname + location.hash);
  $('#app').innerHTML = `
    <header class="top">
      <a href="#/" class="brand"><img src="assets/hero-gift.webp" alt="">Giftmas <small class="version">${VERSION}</small></a>
      <nav>
        <a href="#/" aria-label="Accueil">${ico('home')}</a>
        <a href="#/boutiques" aria-label="Boutiques en ligne">${ico('journal')}</a>
        <a href="#/notifs" aria-label="Notifications">${ico('bell')}<b class="badge" hidden></b></a>
        <a href="#/familles" aria-label="Familles et réglages">${ico('family')}</a>
      </nav>
    </header>
    ${DEMO ? '<p class="demo">Mode démo</p>' : ''}
    <main id="view"></main>`;
  let t;
  api.subscribe(() => { clearTimeout(t); t = setTimeout(refresh, 250); });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
  addEventListener('hashchange', render);
  await refresh();
}

async function refresh() {
  D = await api.load();
  if (filter && !D.families.some((f) => f.id === filter)) filter = '';
  render();
}

// ───────── Connexion ─────────
function login(code = '', create = false) {
  $('#app').innerHTML = `
    <main class="login">
      <img class="logo" src="assets/hero-gift.webp" alt="">
      <h1>Giftmas <small class="version">${VERSION}</small></h1>
      <p>Les listes de cadeaux de la famille</p>
      <form id="login">
        <label>Ton prénom ou pseudo<input name="pseudo" required maxlength="40" autocomplete="nickname" value="${esc(localStorage.getItem('giftmas-pseudo'))}"></label>
        ${create
          ? '<label>Nom de la famille<input name="family" required maxlength="60" placeholder="Famille Martin"></label>'
          : `<label>Code famille<input name="code" required maxlength="6" autocapitalize="characters" autocomplete="off" value="${esc(code)}"></label>`}
        <button class="btn">${create ? 'Créer la famille' : 'Entrer'}</button>
      </form>
      <button class="link" type="button" id="switch">${create ? 'J’ai déjà un code famille' : 'Pas encore de famille ? En créer une'}</button>
      ${DEMO && !create ? '<p class="demo">Démo : code NOEL24 ou SAPIN1</p>' : ''}
    </main>`;
  $('#switch').onclick = () => login(code, !create);
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), btn = $('button', e.target);
    btn.disabled = true;
    try {
      const pseudo = f.get('pseudo').trim();
      await api.login(pseudo);
      localStorage.setItem('giftmas-pseudo', pseudo);
      if (create) {
        await api.createFamily(f.get('family').trim());
        location.hash = '#/familles';
      } else await api.joinFamily(f.get('code'));
      start();
    } catch (err) { toast(err.message); btn.disabled = false; }
  };
}

// ───────── Vues ─────────
function render() {
  const [, page, id] = location.hash.split('/');
  const unread = D.notifications.filter((n) => !n.read).length;
  $('#view').innerHTML = page === 'p' ? person(id) : page === 'boutiques' ? shops() : page === 'notifs' ? notifs() : page === 'familles' ? families() : home();
  document.querySelectorAll('.top nav a').forEach((a) => a.toggleAttribute('aria-current', a.hash === `#/${page ?? ''}`));
  const badge = $('.badge');
  badge.hidden = !unread;
  badge.textContent = unread;
  navigator.setAppBadge?.(unread).catch(() => {});
  if (page === 'notifs' && unread) api.markRead().then(refresh);
}

const inFilter = (profileId) => !filter || D.links.some((l) => l.profile_id === profileId && l.family_id === filter);
const avatar = (p) => p.photo
  ? `<img class="avatar" src="${esc(p.photo)}" alt="">`
  : `<span class="avatar" style="--c:hsl(${hue(p.name)} 60% 50%)" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span>`;
const famNames = (pid) => D.families.filter((f) => D.links.some((l) => l.profile_id === pid && l.family_id === f.id)).map((f) => esc(f.name)).join(' · ');
const age = (p) => (p.birth_year ? `${new Date().getFullYear() - p.birth_year} ans` : '');
const giftIco = (cls = '') => `<img class="gift-ico ${cls}" src="assets/hero-gift.webp" alt="">`;
const thumb = (g) => (g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : '<img src="assets/gift-placeholder.webp" alt="">');

const chips = () => D.families.length < 2 ? '' : `<div class="chips" role="group" aria-label="Filtrer par famille">
  ${[{ id: '', name: 'Tout le monde' }, ...D.families].map((f) =>
    `<button type="button" class="chip" data-act="filter" data-id="${f.id}" aria-pressed="${filter === f.id}">${esc(f.name)}</button>`).join('')}</div>`;

function home() {
  const people = D.profiles.filter((p) => inFilter(p.id)).map((p) => {
    const gifts = D.gifts.filter((g) => g.profile_id === p.id);
    const taken = gifts.filter((g) => D.reservations.some((r) => r.gift_id === g.id)).length;
    const counts = same(p.owner, D.pseudo)
      ? `<span class="counts" aria-label="${gifts.length} idées">${gifts.length} ${giftIco()}</span>`
      : `<span class="counts" aria-label="${gifts.length - taken} disponibles, ${taken} réservés">${gifts.length - taken} ${giftIco()} <i>|</i> ${taken} ${giftIco('off')}</span>`;
    return `<a class="person" href="#/p/${p.id}">${avatar(p)}<b>${esc(p.name)}</b>${counts}</a>`;
  });
  return `${chips()}<section class="people">${people.join('')}
    <button type="button" class="person add" data-act="new-profile"><span class="avatar" aria-hidden="true">${ico('plus')}</span><b>Ajouter</b><small>une personne</small></button>
  </section>`;
}

function person(id) {
  const p = D.profiles.find((p) => p.id === id);
  if (!p) return '<p class="empty">Profil introuvable. <a href="#/">Retour</a></p>';
  const mine = same(p.owner, D.pseudo);
  const manage = mine || same(p.created_by, D.pseudo);
  const taken = (g) => D.reservations.some((r) => r.gift_id === g.id);
  const tiles = sortGifts(D.gifts.filter((g) => g.profile_id === id), taken).map((g) => {
    const r = D.reservations.find((r) => r.gift_id === g.id);
    const byMe = r && same(r.reserved_by, D.pseudo);
    const inner = thumb(g); // le nom est dans l'infobulle
    return `<article class="gift${r ? ' taken' : ''}" data-id="${g.id}" data-name="${esc(g.name)}">
      <button type="button" class="gift-link" data-act="gift-info" data-id="${g.id}" aria-label="Détails de ${esc(g.name)}">${inner}</button>
      <div class="gift-foot"><span class="price">${euro(g.price)}</span>
        ${mine ? '' : `<label class="check"><input type="checkbox" data-reserve="${g.id}" ${r ? 'checked' : ''} ${r && !byMe ? 'disabled' : ''}
          aria-label="${r ? `Réservé par ${esc(r.reserved_by)}` : `Je réserve ${esc(g.name)}`}"></label>`}</div>
      ${same(g.added_by, D.pseudo) || manage ? `<button type="button" class="del" data-act="del-gift" data-id="${g.id}" aria-label="Supprimer ${esc(g.name)}">${ico('close')}</button>` : ''}
    </article>`;
  });
  return `<div class="phead">
      <a class="icon-btn" href="#/" aria-label="Retour">${ico('back')}</a>${avatar(p)}
      <h1>${esc(p.name)}<small>${mine ? 'Ta liste · les réservations te sont cachées 🤫' : [age(p), famNames(p.id)].filter(Boolean).join(' · ')}</small></h1>
      <button type="button" class="icon-btn" data-act="new-gift" data-id="${p.id}" aria-label="Ajouter un cadeau">${ico('plus')}</button>
      <label class="icon-btn sort-btn">${ico('sort')}<select data-sort aria-label="Trier les cadeaux">${SORTS.map(([k, label]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <button type="button" class="icon-btn" data-act="profile-menu" data-id="${p.id}" aria-label="Options du profil">${ico('more')}</button>
    </div>
    ${p.note ? `<div class="wish"><p onclick="this.classList.toggle('open')">${esc(p.note)}</p></div>` : ''}
    ${tiles.length ? `<section class="gifts">${tiles.join('')}</section>` : empty('gifts', 'Aucune idée pour l’instant.<br>Ajoute le premier cadeau avec le ＋ !')}`;
}

const SORTS = [['added', 'Ordre d’ajout'], ['price-asc', 'Prix croissant'], ['price-desc', 'Prix décroissant'], ['name', 'Nom'], ['shop', 'Enseigne'], ['free', 'Disponibles d’abord'], ['taken', 'Réservés d’abord']];
const shopOf = (g) => { try { return new URL(g.url).hostname.replace(/^www\./, ''); } catch { return '~'; } }; // sans lien : en dernier
function sortGifts(list, taken) {
  const by = {
    'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
    name: (a, b) => a.name.localeCompare(b.name, 'fr'),
    shop: (a, b) => shopOf(a).localeCompare(shopOf(b)),
    free: (a, b) => taken(a) - taken(b),
    taken: (a, b) => taken(b) - taken(a),
  }[sort];
  return by ? [...list].sort(by) : list;
}

const SHOPS = [
  ['Amazon', 'amazon.fr', 'De tout'], ['Fnac', 'fnac.com', 'Livres, high-tech'], ['Darty', 'darty.com', 'Électroménager'],
  ['Boulanger', 'boulanger.com', 'High-tech'], ['Cdiscount', 'cdiscount.com', 'De tout'], ['Cultura', 'cultura.com', 'Loisirs, livres'],
  ['King Jouet', 'king-jouet.com', 'Jouets'], ['JouéClub', 'joueclub.fr', 'Jouets'], ['Decathlon', 'decathlon.fr', 'Sport'],
  ['Sephora', 'sephora.fr', 'Beauté'], ['Nature & Découvertes', 'natureetdecouvertes.com', 'Idées cadeaux'], ['Etsy', 'etsy.com/fr', 'Fait main'],
];
function shops() {
  return `<h1 class="title">Boutiques</h1>
    <section class="people">${SHOPS.map(([name, site, what]) => `<a class="person" href="https://www.${site}" target="_blank" rel="noopener">
      <span class="avatar shop" style="--c:hsl(${hue(name)} 55% 45%)" aria-hidden="true">${esc(name.slice(0, 1))}<img src="https://www.google.com/s2/favicons?domain=${site.split('/')[0]}&amp;sz=128" alt="" onerror="this.remove()"></span><b>${esc(name)}</b><small>${what}</small></a>`).join('')}
    </section>`;
}

function notifs() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const push = 'PushManager' in window && VAPID_PUBLIC_KEY && !DEMO
    ? `<button type="button" class="btn green" data-act="enable-push">${ico('bell')} Recevoir les notifications sur cet appareil</button>`
    : /iPhone|iPad/.test(navigator.userAgent) && !standalone
      ? '<p class="card">Pour recevoir les notifications sur iPhone : bouton Partager ⎋ puis « Sur l’écran d’accueil », et ouvre Giftmas depuis l’icône.</p>'
      : '';
  return `<h1 class="title">Notifications</h1>${push}
    ${D.notifications.length ? `<ul class="list">${D.notifications.map((n) => `<li class="${n.read ? '' : 'unread'}"><img src="assets/i-bell.webp" alt="">
      <div>${esc(n.body)}<small>${date(n.created_at)}</small></div></li>`).join('')}</ul>`
      : empty('notifs', 'Tu seras prévenu ici quand quelqu’un réserve un cadeau sur un profil que tu as créé.')}`;
}

const canManage = (p) => same(p.owner, D.pseudo) || same(p.created_by, D.pseudo);

function families() {
  return `<h1 class="title">Familles</h1>
    ${D.families.map((f) => {
      const members = D.profiles.filter((p) => D.links.some((l) => l.profile_id === p.id && l.family_id === f.id));
      return `<div class="card"><div class="fam"><div><b>${esc(f.name)}</b><small>Code : <span class="code">${esc(f.code)}</span></small></div>
        <div class="fam-actions"><button type="button" class="btn small" data-act="invite" data-id="${f.id}">${ico('invite')} Inviter</button>
        ${!f.created_by || same(f.created_by, D.pseudo) ? `<button type="button" class="link danger-link" data-act="del-family" data-id="${f.id}">Supprimer</button>` : ''}</div></div>
        <div class="members">${members.map((p) => canManage(p)
          ? `<button type="button" data-act="edit-profile" data-id="${p.id}">${avatar(p)}<span>${esc(p.name)} ✎</span></button>`
          : `<a href="#/p/${p.id}">${avatar(p)}<span>${esc(p.name)}</span></a>`).join('') || '<small>Personne pour l’instant</small>'}</div></div>`;
    }).join('')}
    <div class="card stack"><b>Mon profil cadeaux</b>
      ${D.profiles.filter(canManage).map((p) =>
        `<button type="button" class="btn ghost" data-act="edit-profile" data-id="${p.id}">${avatar(p)} Modifier ${esc(p.name)}</button>`).join('')
        || '<small>Crée ton profil depuis l’accueil (＋ Ajouter, « C’est moi ») pour indiquer tes envies.</small>'}
    </div>
    <form class="card stack" data-form="join"><label>Rejoindre une autre famille<input name="code" required maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="Code"></label><button class="btn">Rejoindre</button></form>
    <form class="card stack" data-form="create"><label>Créer une nouvelle famille<input name="name" required maxlength="60" placeholder="Famille Martin"></label><button class="btn ghost">Créer</button></form>
    <p class="card">Connecté en tant que <b>${esc(D.pseudo)}</b>. <button type="button" class="link" data-act="logout">Se déconnecter</button></p>`;
}

// ───────── Fenêtres (ajout de profil, de cadeau, options) ─────────
function sheet(html, onSubmit) {
  const d = $('#sheet');
  d.innerHTML = `<form method="dialog" class="sheet-form">${html}</form>`;
  const form = $('form', d);
  form.onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    e.submitter.disabled = true;
    try { await onSubmit(new FormData(form), form); d.close(); } catch (err) { toast(err.message); }
    e.submitter.disabled = false;
  };
  d.showModal();
  return form;
}
const cancel = '<button class="btn ghost" value="cancel" formnovalidate>Annuler</button>';

// Réduit la photo (≈30 Ko) pour la stocker directement en base.
async function shrink(file, max = 400) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}
// Champ image : fichier, appareil photo (proposé par iOS), image collée, ou adresse web d'une image.
function imagePicker(form, name) {
  const input = $(`input[name="${name}-file"]`, form), link = $(`input[name="${name}-url"]`, form);
  const out = $(`input[name="${name}"]`, form), preview = $('.img-pick img', form);
  const set = (src) => { out.value = src; preview.src = src; preview.hidden = !src; };
  const take = async (file) => file?.type.startsWith('image/') && (link.value = '', set(await shrink(file).catch(() => '')));
  input.onchange = () => take(input.files[0]);
  form.addEventListener('paste', (e) => take(e.clipboardData.files[0]));
  preview.onerror = () => { preview.hidden = true; };
  link.onchange = () => {
    const v = link.value.trim();
    if (v && !/^https:\/\//i.test(v)) return toast('L’adresse de l’image doit commencer par https://');
    set(v);
  };
  return (src) => { link.value = /^https:/.test(src) ? src : ''; set(src); };
}
const imageField = (name, label) => `<div class="img-pick"><img alt="" hidden>
  <label class="btn ghost small">${ico('camera')} ${label}<input type="file" name="${name}-file" accept="image/*" hidden></label></div>
  <input name="${name}-url" inputmode="url" autocomplete="off" aria-label="Adresse web de l’image" placeholder="ou colle l’adresse d’une image (https://…)">
  <input type="hidden" name="${name}">`;

// Titre, image et prix de la page produit, via Microlink (gratuit, ~50 liens/jour, sans clé).
// Prix : champs propres à Amazon d'abord, puis balises standard des sites marchands.
async function preview(url) {
  const q = new URLSearchParams({
    url,
    // du plus fiable au plus générique : un sélecteur large attrape parfois le prix d'un autre produit
    'data.p1.selector': 'input[name="items[0.base][customerVisiblePrice][amount]"], #twister-plus-price-data-price',
    'data.p1.attr': 'value',
    'data.p2.selector': '#corePriceDisplay_desktop_feature_div .a-offscreen, #corePrice_feature_div .a-offscreen, #corePrice_desktop .a-offscreen',
    'data.p3.selector': 'meta[property="product:price:amount"], meta[property="og:price:amount"], [itemprop=price][content]',
    'data.p3.attr': 'content',
    'data.p4.selector': '[itemprop=price]',
  });
  const { data } = await (await fetch(`https://api.microlink.io/?${q}`)).json();
  const price = [data?.p1, data?.p2, data?.p3, data?.p4].map(parsePrice).find(Boolean) ?? null;
  return { image: data?.image?.url, title: data?.title, price };
}

function newProfile() {
  const form = sheet(`<h2>Nouvelle personne</h2>
    <label>Prénom<input name="name" required maxlength="40"></label>
    ${imageField('photo', 'Photo')}
    <label class="tick"><input type="checkbox" name="me"> C’est moi (je ne verrai pas ce qu’on m’offre)</label>
    <fieldset><legend>Dans quelle(s) famille(s) ?</legend>
      ${D.families.map((f) => `<label class="tick"><input type="checkbox" name="families" value="${f.id}" ${!filter || filter === f.id ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}
    </fieldset>
    <div class="row">${cancel}<button class="btn">Créer</button></div>`,
  async (f) => {
    const families = f.getAll('families');
    if (!families.length) throw new Error('Choisis au moins une famille');
    const id = await api.createProfile({ name: f.get('name').trim(), photo: f.get('photo') || null, isMe: f.has('me'), families });
    await refresh();
    location.hash = `#/p/${id}`;
  });
  imagePicker(form, 'photo');
}

const withScheme = (u) => (u = u.trim()) && !/^https?:\/\//i.test(u) ? `https://${u}` : u || null;

// Formulaire d'ajout, ou de modification quand on passe un cadeau existant.
function newGift(profileId, g = null) {
  const form = sheet(`<h2>${g ? 'Modifier le cadeau' : 'Nouveau cadeau'}</h2>
    <label>Lien d’achat (Amazon, Fnac…)<input name="url" inputmode="url" autocomplete="off" placeholder="https://" value="${esc(g?.url)}"></label>
    <label>Nom<input name="name" required maxlength="120" value="${esc(g?.name)}"></label>
    <label>Prix (€)<input name="price" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="29,90" value="${g?.price != null ? String(g.price).replace('.', ',') : ''}"></label>
    ${imageField('image', 'Image ou photo')}
    <div class="row">${cancel}<button class="btn">${g ? 'Enregistrer' : 'Ajouter'}</button></div>`,
  async (f) => {
    const price = f.get('price').trim();
    const data = { name: f.get('name').trim(), price: price ? Number(price.replace(',', '.')) : null, url: withScheme(f.get('url')) || null, image: f.get('image') || null };
    await (g ? api.updateGift({ id: g.id, ...data }) : api.addGift({ profile_id: profileId, ...data }));
    await refresh();
  });
  const setImage = imagePicker(form, 'image');
  if (g?.image) setImage(g.image);
  // Pré-remplit nom et image depuis la page produit quand le site le permet.
  form.url.onchange = async () => {
    const url = withScheme(form.url.value);
    if (!url || (form.image.value && form.price.value)) return;
    const hint = $('.img-pick', form).appendChild(Object.assign(document.createElement('small'), { textContent: 'Recherche de l’image et du prix…' }));
    const { image, title, price } = await preview(url).catch(() => ({}));
    hint.remove();
    if (title && !form.name.value) form.name.value = title.slice(0, 120);
    if (price && !form.price.value) form.price.value = String(price).replace('.', ',');
    if (image?.startsWith('https://') && !form.image.value) setImage(image);
  };
}

function editProfile(id) {
  const p = D.profiles.find((p) => p.id === id);
  const year = new Date().getFullYear();
  $('#sheet').close();
  const form = sheet(`<h2>${esc(p.name)}</h2>
    <label>Prénom<input name="name" required maxlength="40" value="${esc(p.name)}"></label>
    ${imageField('photo', 'Photo')}
    <label>Âge<input name="age" inputmode="numeric" pattern="[0-9]{1,3}" placeholder="ex. 8" value="${p.birth_year ? year - p.birth_year : ''}"></label>
    <label>Envies : goûts, tailles, idées, ce qu’il faut éviter…<textarea name="note" maxlength="500" rows="4">${esc(p.note)}</textarea></label>
    <fieldset><legend>Familles</legend>
      ${D.families.map((f) => `<label class="tick"><input type="checkbox" name="families" value="${f.id}" ${D.links.some((l) => l.profile_id === id && l.family_id === f.id) ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')}
    </fieldset>
    <div class="row">${cancel}<button class="btn">Enregistrer</button></div>`,
  async (f) => {
    const families = f.getAll('families');
    if (!families.length) throw new Error('Choisis au moins une famille');
    const a = f.get('age').trim();
    await api.updateProfile({ id, name: f.get('name').trim(), photo: f.get('photo') || null, note: f.get('note'), birthYear: a ? year - Number(a) : null, families });
    await refresh();
  });
  const setPhoto = imagePicker(form, 'photo');
  if (p.photo) setPhoto(p.photo);
}

function profileMenu(id) {
  const p = D.profiles.find((p) => p.id === id);
  const others = D.families.filter((f) => !D.links.some((l) => l.profile_id === id && l.family_id === f.id));
  sheet(`<h2>${esc(p.name)}</h2>
    ${others.map((f) => `<button type="button" class="btn ghost" data-act="add-to-family" data-id="${id}" data-fid="${f.id}">Ajouter aussi à ${esc(f.name)}</button>`).join('')}
    ${same(p.created_by, D.pseudo) || same(p.owner, D.pseudo) ? `<button type="button" class="btn ghost" data-act="edit-profile" data-id="${id}">Modifier le profil</button>` : ''}
    <button type="button" class="btn ghost" data-act="share-list" data-id="${id}">${ico('share')} Partager cette liste</button>
    ${same(p.created_by, D.pseudo) ? `<button type="button" class="btn danger" data-act="del-profile" data-id="${id}">Supprimer ce profil</button>` : ''}
    <button class="btn ghost" value="cancel">Fermer</button>`, () => {});
}

// ───────── Partage (WhatsApp, Messages… via la feuille de partage du téléphone) ─────────
async function share(text, url = appUrl) {
  if (navigator.share) return navigator.share({ text, url }).catch(() => {});
  open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
}

// ───────── Actions ─────────
const run = (fn) => fn().then(refresh).catch((e) => toast(e.message));
const actions = {
  filter: (b) => { filter = b.dataset.id; localStorage.setItem('giftmas-filter', filter); render(); },
  'new-profile': () => newProfile(),
  'edit-profile': (b) => editProfile(b.dataset.id),
  'new-gift': (b) => newGift(b.dataset.id),
  'gift-info': (b) => giftInfo(b),
  'profile-menu': (b) => profileMenu(b.dataset.id),
  'del-gift': (b) => confirm('Supprimer ce cadeau (et sa réservation) ?') && run(() => api.deleteGift(b.dataset.id)),
  'del-profile': (b) => confirm('Supprimer ce profil et tous ses cadeaux ?') && ($('#sheet').close(), location.hash = '#/', run(() => api.deleteProfile(b.dataset.id))),
  'del-family': (b) => {
    const f = D.families.find((f) => f.id === b.dataset.id);
    const only = D.profiles.filter((p) => D.links.some((l) => l.profile_id === p.id && l.family_id === f.id)
      && !D.links.some((l) => l.profile_id === p.id && l.family_id !== f.id)).map((p) => p.name);
    if (confirm(`Supprimer « ${f.name} » pour tout le monde ?${only.length ? `\n\nSeront aussi supprimés avec leurs listes : ${only.join(', ')}.` : ''}`)) run(() => api.deleteFamily(f.id));
  },
  'add-to-family': (b) => ($('#sheet').close(), run(() => api.addProfileToFamily(b.dataset.id, b.dataset.fid))),
  'share-list': (b) => share(`🎁 La liste de cadeaux de ${D.profiles.find((p) => p.id === b.dataset.id).name} sur Giftmas`, `${appUrl}#/p/${b.dataset.id}`),
  invite: (b) => { const f = D.families.find((f) => f.id === b.dataset.id); share(`🎄 Rejoins « ${f.name} » sur Giftmas pour nos listes de cadeaux ! Code : ${f.code}`, `${appUrl}?code=${f.code}`); },
  logout: async () => { await api.logout(); location.hash = ''; location.reload(); },
  'enable-push': () => enablePush().catch((e) => toast(e.message)),
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) actions[b.dataset.act](b);
});

// Appui long (½ s) sur une vignette de cadeau : modification, pour qui a le droit de la supprimer.
let pressTimer, pressed;
document.addEventListener('pointerdown', (e) => {
  const tile = e.target.closest('.gift');
  if (!tile || e.target.closest('.check, .del')) return;
  const start = [e.clientX, e.clientY];
  pressed = false;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => { pressed = true; editGift(tile.dataset.id); }, 500);
  const cancelPress = (ev) => {
    if (ev.type === 'pointermove' && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) < 10) return;
    clearTimeout(pressTimer);
    removeEventListener('pointermove', cancelPress); removeEventListener('pointerup', cancelPress); removeEventListener('pointercancel', cancelPress);
  };
  addEventListener('pointermove', cancelPress); addEventListener('pointerup', cancelPress); addEventListener('pointercancel', cancelPress);
});
// le relâchement d'un appui long ne doit pas ouvrir le lien d'achat
document.addEventListener('click', (e) => { if (pressed && e.target.closest('.gift')) { e.preventDefault(); e.stopPropagation(); pressed = false; } }, true);
document.addEventListener('contextmenu', (e) => { if (e.target.closest('.gift')) e.preventDefault(); });
// Infobulle d'un cadeau : nom, prix, qui l'a réservé, et le lien vers la boutique.
function giftInfo(el) {
  const g = D.gifts.find((g) => g.id === el.dataset.id), r = D.reservations.find((r) => r.gift_id === g.id);
  const pop = $('#pop');
  pop.innerHTML = `<b>${esc(g.name)}</b>${g.price != null ? `<span class="price">${euro(g.price)}</span>` : ''}
    ${r ? `<small>Réservé par ${same(r.reserved_by, D.pseudo) ? 'moi' : esc(r.reserved_by)}</small>` : ''}
    ${g.url ? `<a class="btn small" href="${esc(g.url)}" target="_blank" rel="noopener">${ico('link')} Voir sur le site</a>` : '<small>Pas de lien d’achat</small>'}`;
  pop.hidden = false;
  const t = el.closest('.gift').getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(t.left + t.width / 2 - w / 2, 8), innerWidth - w - 8);
  const below = t.bottom + h + 12 < innerHeight;
  pop.classList.toggle('above', !below);
  pop.style.left = `${left}px`;
  pop.style.top = `${(below ? t.bottom + 10 : t.top - h - 10) + scrollY}px`;
  pop.style.setProperty('--ax', `${t.left + t.width / 2 - left}px`);
}
const closePop = () => { $('#pop').hidden = true; };
document.addEventListener('click', (e) => { if (!e.target.closest('#pop, [data-act="gift-info"]')) closePop(); });
addEventListener('scroll', closePop, { passive: true });
addEventListener('hashchange', closePop);

function editGift(id) {
  closePop();
  const g = D.gifts.find((g) => g.id === id), p = D.profiles.find((p) => p.id === g.profile_id);
  if (!(same(g.added_by, D.pseudo) || canManage(p))) return toast(`Seul ${g.added_by} ou le gestionnaire de ${p.name} peut modifier ce cadeau`);
  navigator.vibrate?.(15);
  newGift(g.profile_id, g);
}

document.addEventListener('change', async (e) => {
  if (e.target.matches('[data-sort]')) { sort = e.target.value; localStorage.setItem('giftmas-sort', sort); return render(); }
  const id = e.target.dataset.reserve;
  if (!id) return;
  const box = e.target;
  box.disabled = true;
  try {
    if (box.checked) {
      await api.reserve(id);
      const g = D.gifts.find((g) => g.id === id), p = D.profiles.find((p) => p.id === g.profile_id);
      toast(`Réservé : ${g.name} ✓`, ['Partager', () => share(`🎁 ${D.pseudo} a réservé « ${g.name} » pour ${p.name} !`)]);
    } else await api.unreserve(id);
  } catch (err) { toast(err.message); }
  refresh();
});

document.addEventListener('submit', (e) => {
  const kind = e.target.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const v = new FormData(e.target);
  run(() => (kind === 'join' ? api.joinFamily(v.get('code')) : api.createFamily(v.get('name').trim())));
});

async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications refusées (Réglages > Notifications > Giftmas)');
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  await api.savePush(sub);
  toast('Notifications activées sur cet appareil 🔔');
}

let toastTimer;
function toast(msg, [label, fn] = []) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${label ? `<button type="button">${esc(label)}</button>` : ''}`;
  if (fn) $('button', t).onclick = () => { t.classList.remove('show'); fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), label ? 6000 : 3500);
}
