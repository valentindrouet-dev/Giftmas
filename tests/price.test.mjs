// node tests/price.test.mjs
import assert from 'node:assert/strict';
import { parsePrice } from '../price.js';

const cases = [
  ['39,99 €', 39.99], ['39,99€', 39.99], ['1 299,00 €', 1299], ['1 299,00 €', 1299],
  ['EUR 39.99', 39.99], ['1,299.00', 1299], ['1.299,00', 1299], ['12', 12], ['12,5', 12.5],
  ['1.299', 1299], ['24.90', 24.9], ['', null], ['Indisponible', null], [null, null], ['0,00 €', null],
];
for (const [input, expected] of cases) assert.equal(parsePrice(input), expected, `parsePrice(${JSON.stringify(input)})`);
console.log('price OK');
