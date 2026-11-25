// Parcours complet en mode démo sur un iPhone simulé.
//   python3 -m http.server 8123 &   puis   node tests/smoke.mjs [dossier-captures]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright'); // playwright installé globalement
import assert from 'node:assert/strict';

const URL = 'http://localhost:8123/';
const shots = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
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
await val.waitForSelector('.gift:has-text("LEGO Batman") .by:has-text("Thibaut")');
assert.ok(await val.isDisabled('.gift:has-text("LEGO Batman") input'), 'Valentin ne peut pas décocher la réservation de Thibaut');
await val.waitForSelector('.badge:has-text("2")');
await val.click('[aria-label=Notifications]');
await val.waitForSelector('text=Thibaut a réservé LEGO Batman pour Richard');
await val.click('[aria-label="Journal des cadeaux"]');
await val.waitForSelector('.list >> text=LEGO Batman');
await snap(val, '3-journal');

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
await val.click('#sheet >> text=Ajouter');
await val.waitForSelector('.gift:has-text("Vélo")');
assert.equal(await val.getAttribute('.gift:has-text("Vélo") a', 'href'), 'https://fnac.com/velo');
assert.equal(await val.$('.gift:has-text("Vélo") input'), null, 'pas de case à cocher sur sa propre liste');
await snap(val, '4-ma-liste');

await thi.click('.brand');
await thi.click('.person:has-text("Valentin")');
await thi.click('[aria-label="Je réserve Vélo"]');
await thi.waitForSelector('.gift:has-text("Vélo") .by');
await val.waitForTimeout(500);
assert.equal(await val.$('.gift:has-text("Vélo") .by'), null, 'Valentin ne voit pas qui lui offre le vélo');
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

await browser.close();
console.log('smoke OK');
