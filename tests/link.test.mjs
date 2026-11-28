// node tests/link.test.mjs
import assert from 'node:assert/strict';
import { parseShared, isGenericTitle, nameFromUrl } from '../link.js';

assert.deepEqual(parseShared('LEGO Creator 3-en-1 Le manoir hanté 31167 https://amzn.eu/d/0abcDEF'),
  { url: 'https://amzn.eu/d/0abcDEF', name: 'LEGO Creator 3-en-1 Le manoir hanté 31167' });
assert.deepEqual(parseShared('Découvrez Pokémon Battle Disc sur Amazon.fr : https://amzn.eu/d/x1'),
  { url: 'https://amzn.eu/d/x1', name: 'Pokémon Battle Disc' });
assert.deepEqual(parseShared('https://www.fnac.com/a123/Livre'), { url: 'https://www.fnac.com/a123/Livre', name: '' });
assert.deepEqual(parseShared('fnac.com/a123'), { url: 'https://fnac.com/a123', name: '' });
assert.deepEqual(parseShared('pas un lien'), { url: '', name: '' });

assert.ok(isGenericTitle('Amazon.fr'));
assert.ok(isGenericTitle('amazon.fr'));
assert.ok(isGenericTitle('Robot Check'));
assert.ok(isGenericTitle(''));
assert.ok(!isGenericTitle('LEGO Creator Le manoir hanté'));

assert.equal(nameFromUrl('https://www.amazon.fr/LEGO-Creator-Manoir-Hant%C3%A9-31167/dp/B0CFW3/ref=sr_1_1'), 'LEGO Creator Manoir Hanté 31167');
assert.equal(nameFromUrl('https://www.fnac.com/a17234543/LEGO-Spidey-Le-bateau-pirate'), 'LEGO Spidey Le bateau pirate');
assert.equal(nameFromUrl('https://amzn.eu/d/0abcDEF'), '');
assert.equal(nameFromUrl('pas une url'), '');
console.log('link OK');

// Liste de cadeaux collée
import { parseGiftList } from '../link.js';
import { parsePrice } from '../price.js';
const list = parseGiftList([
  '```',
  'Nom | prix | lien | image',
  '- LEGO Creator Le manoir hanté | 69,99 € | https://www.amazon.fr/dp/B0CFW3 | https://m.media-amazon.com/images/I/a.jpg',
  '2. Livre Astérix | 12.50 | | ',
  'Peluche | | pas-un-lien | http://image-non-securisee.jpg',
  'phrase sans séparateur',
  '# titre ignoré',
  '```',
].join('\n'), parsePrice);
assert.deepEqual(list.gifts, [
  { name: 'LEGO Creator Le manoir hanté', price: 69.99, url: 'https://www.amazon.fr/dp/B0CFW3', image: 'https://m.media-amazon.com/images/I/a.jpg' },
  { name: 'Livre Astérix', price: 12.5, url: null, image: null },
  { name: 'Peluche', price: null, url: null, image: null },
]);
assert.deepEqual(list.errors, [6], 'la phrase sans séparateur est signalée');
console.log('liste OK');
