// Parses a literal CSS declaration string ("display:flex;gap:14px") into a
// React style object. Lets us reuse the original design's inline style
// strings verbatim instead of hand-converting hundreds of them to camelCase
// object literals.
export function css(str) {
  const out = {};
  if (!str) return out;
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) continue;
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = val;
  }
  return out;
}
