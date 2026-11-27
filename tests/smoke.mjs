// Parcours complet en mode démo sur un iPhone simulé.
//   python3 -m http.server 8123 &   puis   node tests/smoke.mjs [dossier-captures]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // playwright installé globalement
import assert from 'node:assert/strict';

const URL = 'http://localhost:8123/';
const shots = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
// Force le mode démo, quelle que soit la config du repo.
await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = ''; export const VAPID_PUBLIC_KEY = '';" }));
const snap = (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

async function loginAs(pseudo, code = 'NOEL24') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(URL);
  await page.fill('input[name=pseudo]', pseudo);
  await page.fill('input[name=code]', code);
  await page.click('text=Entrer');
  await page.waitForSelector('.people');
  return page;
}

const val = await loginAs('Valentin');
await snap(val, '1-accueil');
assert.equal(await val.textContent('.badge'), '1', 'Valentin a 1 notification');
await val.click('text=Richard');
await val.waitForSelector('.gift');
const visible = await val.$$eval('.gift', (els) => els.filter((e) => e.getBoundingClientRect().bottom <= innerHeight).length);
assert.ok(visible >= 8, `au moins 8 cadeaux visibles sans défiler (vu : ${visible})`);
await snap(val, '2-richard');

// Thibaut réserve, Valentin le voit en direct et reçoit la notif
const thi = await loginAs('Thibaut');
await thi.click('text=Richard');
await thi.click('[aria-label="Je réserve LEGO Batman"]');
await thi.waitForSelector('#toast.show >> text=Partager');
await val.waitForSelector('.gift[data-name="LEGO Batman"] input[aria-label="Réservé par Thibaut"]');
assert.equal((await val.textContent('.gift[data-name="LEGO Batman"] .price')).replace(/\s/g, ' ').trim(), '39,99 €', 'celui qui a ajouté le cadeau voit son prix');
const lea = await loginAs('Léa2');
await lea.click('.person:has-text("Richard")');
await lea.waitForSelector('.gift[data-name="LEGO Batman"] .hidden-price');
await lea.close();
await val.click('.gift[data-name="LEGO Batman"] .gift-link');
await val.waitForSelector('#pop:not([hidden]) >> text=Réservé par Thibaut');
assert.ok(await val.$('#pop a[href*="amazon"]'), 'l’infobulle propose le lien d’achat');
await snap(val, '2b-infobulle');
await val.click('.phead h1');
assert.ok(await val.isHidden('#pop'), 'l’infobulle se ferme en touchant ailleurs');
assert.ok(await val.isDisabled('.gift[data-name="LEGO Batman"] input'), 'Valentin ne peut pas décocher la réservation de Thibaut');
await val.waitForSelector('.badge:has-text("2")');
await val.click('[aria-label=Notifications]');
await val.waitForSelector('text=Thibaut a réservé LEGO Batman pour Richard');
const nbNotifs = (await val.$$('.list li')).length;
await val.click('.list li:has-text("LEGO Batman") [data-act=del-notif]');
await val.waitForFunction((n) => document.querySelectorAll('.list li').length === n - 1, nbNotifs);
await val.click('[aria-label="Boutiques en ligne"]');
await val.waitForSelector('.person >> text=Darty');
assert.ok((await val.$$('.person[href^="https://www."]')).length >= 8, 'au moins 8 boutiques');
await snap(val, '3-boutiques');

// Valentin crée son propre profil : il ne voit pas ce qu'on lui réserve
await val.click('.brand');
await val.click('text=Ajouter');
await val.fill('#sheet input[name=name]', 'Valentin');
await val.check('#sheet input[name=me]');
await val.click('#sheet >> text=Créer');
await val.waitForSelector('.phead >> text=Ta liste');
await val.click('[aria-label="Ajouter un cadeau"]');
await val.fill('#sheet input[name=url]', 'fnac.com/velo');
await val.fill('#sheet input[name=name]', 'Vélo');
await val.fill('#sheet input[name=price]', '199,90');
await val.fill('#sheet input[name=image-url]', 'https://example.com/velo.jpg');
await val.dispatchEvent('#sheet input[name=image-url]', 'change');
await val.click('#sheet >> text=Ajouter');
await val.waitForSelector('.gift[data-name="Vélo"]');
await val.click('.gift[data-name="Vélo"] .gift-link');
assert.equal(await val.getAttribute('#pop a', 'href'), 'https://fnac.com/velo');
await val.click('.phead h1');
assert.equal(await val.getAttribute('.gift[data-name="Vélo"] img', 'src'), 'https://example.com/velo.jpg', 'image par adresse web');
assert.equal(await val.$('.gift[data-name="Vélo"] input'), null, 'pas de case à cocher sur sa propre liste');
await snap(val, '4-ma-liste');

await thi.click('.brand');
await thi.click('.person:has-text("Valentin")');
await thi.click('[aria-label="Je réserve Vélo"]');
await thi.waitForSelector('.gift.taken[data-name="Vélo"]');
await val.waitForTimeout(500);
assert.equal(await val.$('.gift.taken[data-name="Vélo"]'), null, 'Valentin ne voit pas qu’on lui offre le vélo');
assert.ok(!(await val.textContent('.badge')).includes('3'), 'pas de notif pour son propre profil');

// Familles : profil à cheval sur deux familles, filtre
await val.click('[aria-label="Familles et réglages"]');
await val.fill('[data-form=join] input', 'sapin1');
await val.click('[data-form=join] button');
await val.waitForSelector('.fam >> text=Belle-famille');
await val.click('.brand');
await val.click('.chip:has-text("Belle-famille")');
const names = await val.$$eval('.person b', (b) => b.map((x) => x.textContent));
assert.deepEqual(names.sort(), ['Ajouter', 'Léa', 'Mamie Jo'], 'le filtre ne montre que la belle-famille');
await snap(val, '5-filtre');

// Supprimer une famille créée par soi
await val.click('[aria-label="Familles et réglages"]');
await val.fill('[data-form=create] input', 'Famille test');
await val.click('[data-form=create] button');
await val.waitForSelector('.card:has-text("Famille test")');
val.once('dialog', (d) => d.accept());
await val.click('.card:has-text("Famille test") [data-act=del-family]');
await val.waitForSelector('.card:has-text("Famille test")', { state: 'detached' });

// Appui long sur une vignette : modification du cadeau
await val.click('[aria-label=Accueil]');
await val.click('.chip:has-text("Tout le monde")');
await val.click('.person:has-text("Richard")');
await val.waitForSelector('.gift[data-name="Livre Astérix"]');
await val.waitForTimeout(400);
const box = await val.locator('.gift[data-name="Livre Astérix"] .gift-link img').boundingBox();
await val.mouse.move(box.x + 5, box.y + 5); await val.mouse.down(); await val.waitForTimeout(700); await val.mouse.up();
await val.waitForSelector('#sheet h2:has-text("Modifier le cadeau")');
assert.equal(await val.inputValue('#sheet input[name=price]'), '12,5', 'le formulaire est prérempli');
await val.fill('#sheet input[name=price]', '13,90');
await val.click('#sheet >> text=Enregistrer');
await val.waitForSelector('.gift[data-name="Livre Astérix"] .price:has-text("13,90")');
assert.equal(val.url().includes('#/p/'), true, 'l’appui long n’a pas ouvert le lien d’achat');

// Tri par prix, puis modification d'un membre depuis Familles (âge, prénom)
await val.click('[aria-label=Accueil]');
await val.click('.person:has-text("Richard")');
await val.selectOption('[data-sort]', 'price-asc');
assert.equal(await val.getAttribute('.gift', 'data-name'), 'Livre Astérix', 'le moins cher en premier');
await val.click('[aria-label="Familles et réglages"]');
await val.click('.members button:has-text("Richard")');
await val.fill('#sheet input[name=age]', '9');
await val.fill('#sheet input[name=name]', 'Richou');
await val.click('#sheet >> text=Enregistrer');
await val.click('.members a:has-text("Richou"), .members button:has-text("Richou")');
await val.click('#sheet >> text=Annuler');
await val.click('[aria-label=Accueil]');
await val.click('.person:has-text("Richou")');
await val.waitForSelector('.phead small:has-text("9 ans")');
await val.selectOption('[data-sort]', 'added');
await snap(val, '6-tri-age');

// Sauvegarde : export puis import par quelqu'un d'autre, sur un appareil vierge
await val.click('[aria-label="Familles et réglages"]');
const [download] = await Promise.all([val.waitForEvent('download'), val.click('[data-act=export]')]);
const backup = await download.path();
const fresh = await browser.newContext({ ...devices['iPhone 13'] });
await fresh.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = ''; export const VAPID_PUBLIC_KEY = '';" }));
const imp = await fresh.newPage();
imp.on('pageerror', (e) => { throw e; });
await imp.goto(URL);
await imp.click('#switch');
await imp.fill('input[name=pseudo]', 'Restaurateur');
await imp.fill('input[name=family]', 'Vide');
await imp.click('text=Créer la famille');
await imp.waitForSelector('[data-import]', { state: 'attached' });
imp.once('dialog', (d) => d.accept());
await imp.setInputFiles('[data-import]', backup);
await imp.waitForSelector('#toast.show >> text=Import terminé');
await imp.click('[aria-label=Accueil]');
await imp.click('.person:has-text("Richou")');
await imp.waitForSelector('.gift[data-name="Astérix chez les Pictes"], .gift[data-name="Livre Astérix"]');
assert.ok((await imp.$$('.gift')).length >= 8, 'les cadeaux de Richou sont restaurés');
await imp.click('[aria-label="Familles et réglages"]');
imp.once('dialog', (d) => d.accept());
await imp.setInputFiles('[data-import]', backup);
await imp.waitForSelector('#toast.show >> text=0 famille(s), 0 membre(s), 0 cadeau(x)');
await fresh.close();

await browser.close();
console.log('smoke OK');
