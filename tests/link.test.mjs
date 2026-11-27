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
