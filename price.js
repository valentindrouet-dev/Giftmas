// Transforme un prix affiché ("1 299,00 €", "39,99€", "EUR 39.99", "1,299.00") en nombre, ou null.
export function parsePrice(text) {
  const m = String(text ?? '').replace(/[\s  ]/g, '').match(/\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/[.,]$/, '');
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  // le dernier séparateur est décimal s'il est suivi de 1 ou 2 chiffres, sinon c'est un séparateur de milliers
  if (last >= 0 && s.length - last - 1 <= 2) s = s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1);
  else s = s.replace(/[.,]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
