// SHARED-ELEMENT NAMES, MINTED THE SAME WAY ON BOTH ENDS.
//
// A `viewTransitionName` is what makes a card EXPAND INTO its detail instead of
// cutting to it. It only works if the element you leave and the element you
// arrive at carry the SAME name — and if no two elements carry it at once.
// Both halves fail silently: the browser drops the morph and cross-fades, which
// looks like "the transition just isn't very good" rather than like a bug.
//
// The Library shipped with exactly that fault. Its shelf minted
// `lib-${hueOf(it.id)}-${i}` — a hash of the id plus the ARRAY INDEX — and the
// detail header built its own style object with no name at all. So the shelf
// promised a morph in a comment ("the cover flies into the detail header") that
// could never happen: the index is unknowable from the detail side, and half
// the pair was missing anyway. Verified in Safari on 16 Sep: opening a source
// left exactly one named element on the page, `root`.
//
// The index was not laziness. Nova's ids are VAULT PATHS —
// "Wiki/Sources/Harvey Specter's Five Confidence Keys (Blind Spot)" — full of
// spaces, slashes, apostrophes and em-dashes, none of which a CSS custom-ident
// may contain. Hashing made them legal; the index was there because a hash
// alone can collide.
//
// So: slug + hash. The slug keeps the name readable in devtools (which matters
// when you are looking for a duplicate), and the hash of the FULL id is what
// actually separates two sources whose titles slugify the same. Both halves
// come from the id alone, so either end can mint it without knowing the other.

// FNV-1a, 32-bit. Small, stable across reloads, and good enough to separate a
// few hundred vault paths — this is a CSS identifier, not a checksum.
function hash36(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * A stable, CSS-safe `viewTransitionName` for one thing.
 *
 * @param {string} prefix  the pair's family — 'lib', 'note', 'recipe'. Must
 *                         start with a letter; it is what keeps the whole name
 *                         a valid custom-ident even when the slug is empty.
 * @param {string} id      the thing's id. Any string: paths, titles, uuids.
 * @returns {string|null}  null when there is no id, so a caller can spread
 *                         `?? {}` rather than mint a name for nothing.
 */
export function vtName(prefix, id) {
  if (!id && id !== 0) return null;
  const raw = String(id);
  const slug = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip accents rather than drop the letter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');              // slice() can leave a trailing hyphen
  return `${prefix}-${slug ? `${slug}-` : ''}${hash36(raw)}`;
}

/**
 * The uniqueness guard, said once instead of at every call site.
 *
 * A name may be held by only ONE element at a time. The list card therefore
 * gives its name up while the detail holds it — otherwise both ends match, the
 * browser finds two, and drops the morph without a word.
 *
 * @param {string} prefix
 * @param {string} id       this row's id
 * @param {string} openId   the id currently open in the detail, if any
 */
export function vtNameUnlessOpen(prefix, id, openId) {
  return openId && String(openId) === String(id) ? null : vtName(prefix, id);
}

/** Spreadable: `...vtStyle('note', id, openId)` adds the property or nothing. */
export function vtStyle(prefix, id, openId) {
  const name = arguments.length >= 3 ? vtNameUnlessOpen(prefix, id, openId) : vtName(prefix, id);
  return name ? { viewTransitionName: name } : {};
}
