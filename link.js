// Lecture d'un lien produit collé ou partagé : adresse, nom probable, titres à ignorer.

// Texte partagé par une appli ("LEGO Le manoir hanté … https://amzn.eu/d/abc") → { url, name }
export function parseShared(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/https?:\/\/\S+/i);
  if (!m) return { url: /^[\w-]+(\.[\w-]+)+\/?\S*$/.test(t) ? `https://${t}` : '', name: '' };
  const name = t.slice(0, m.index)
    .replace(/^(découvrez|regarde|je te conseille|check out)\s*:?\s*/i, '')
    .replace(/\s*(sur|chez|on)\s+(amazon|fnac|darty|cdiscount|boulanger)[\w.]*\s*:?\s*$/i, '')
    .replace(/[\s:–—-]+$/, '')
    .trim();
  return { url: m[0].replace(/[).,;]+$/, ''), name: name.length >= 3 ? name.slice(0, 120) : '' };
}

// Titre sans intérêt (page d'accueil, page anti-robot) : on l'ignore.
export function isGenericTitle(title) {
  const t = String(title ?? '').trim();
  return t.length < 4 || /^(www\.)?(amazon|fnac|darty|cdiscount|boulanger|cultura|decathlon|sephora|etsy)(\.[a-z.]+)?$/i.test(t)
    || /robot check|captcha|access denied|page introuvable|404|attention required/i.test(t);
}

// Nom lisible tiré de l'adresse : le plus long segment "mots-séparés-par-des-tirets".
export function nameFromUrl(url) {
  let path;
  try { path = decodeURIComponent(new URL(url).pathname); } catch { return ''; }
  const best = path.split('/')
    .filter((s) => s.includes('-') && /[a-zà-ÿ]{3}/i.test(s) && !/^(dp|gp|product|ref)/i.test(s))
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return '';
  const words = best.replace(/\.(html?|aspx)$/i, '').split(/[-_]+/).filter(Boolean);
  return words.length >= 2 ? words.join(' ').slice(0, 120) : '';
}
