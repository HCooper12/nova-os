// TEXT → LAYOUT: what a capture actually became (15 Oct 2026; mockup "Nova
// motion set" #s5, his approval). When he says "add oats and greek yoghurt
// to the shop", the conversation answers with a receipt for the capture; the
// Inbox then classifies and files it. This reads the Inbox record behind that
// receipt and says what CODE filed: the shopping items, by the names the
// shopping list was written with. The screen flies those words out of his
// sentence into the rows they became. Nothing here guesses: a record that is
// not filed (still routing, waiting on his call, failed) carries no rows, and
// a word that is not in his sentence verbatim is never flown, only faded in.
//
// Pure, so node can test it; the thread view models (valsNovaThread,
// valsMisc's orbMsgs) call filedFor, the screens call findWords at flight time.

const FRESH_MS = 60 * 1000;
const LIST_PREFIX = /^Shopping List — /;

// the names the shopping list was written with. The destination string is the
// filer's own receipt ("Shopping List — Oats, Greek yoghurt", from the items
// addItemsDirect really added); it is used when it agrees with the parsed
// payload item for item, otherwise the parsed names stand.
function shoppingRows(record) {
  const items = record?.decision?.payload?.items;
  if (!Array.isArray(items) || !items.length) return null;
  const parsed = items.map((it) => ({ name: String(it?.name || '').trim(), amount: it?.amount ? String(it.amount).trim() : null })).filter((it) => it.name);
  if (!parsed.length) return null;
  const dest = typeof record.destination === 'string' && LIST_PREFIX.test(record.destination)
    ? record.destination.replace(LIST_PREFIX, '').split(', ').map((s) => s.trim()).filter(Boolean)
    : null;
  if (dest && dest.length === parsed.length) return parsed.map((it, i) => ({ ...it, name: dest[i] }));
  return parsed;
}

// The record behind a conversation line's capture receipt, and the sentence
// it came from. `chat` is the raw chat array, `i` the line, `items` the
// Inbox's records. Returns null when the line is not a capture receipt.
//   state 'waiting' — routing now (or the receipt is under a minute old and
//                     the record has not reached this device yet)
//   state 'filed'   — filed as shopping: `rows` are what was written
//   state 'other'   — anything else (filed elsewhere, pending, failed, gone)
export function filedFor(chat, i, items, now = Date.now()) {
  const m = chat?.[i];
  const id = m?.acted?.record?.id;
  if (!id) return null;
  let from = null;
  for (let j = i - 1; j >= 0; j--) { if (chat[j]?.who === 'you') { from = j; break; } }
  const record = (items || []).find((r) => r && r.id === id) || null;
  if (!record) {
    const fresh = Number.isFinite(m.at) && now - m.at < FRESH_MS;
    return { id, from, state: fresh ? 'waiting' : 'other', rows: null };
  }
  if (record.status === 'classifying' || record.status === 'routing') return { id, from, state: 'waiting', rows: null };
  if (record.status === 'filed' && record.decision?.route === 'shopping') {
    const rows = shoppingRows(record);
    if (rows) return { id, from, state: 'filed', label: 'Shopping', rows };
  }
  return { id, from, state: 'other', rows: null };
}

// Where each filed name sits in his sentence: case-insensitive, whole words,
// never two names on the same words. A name not found verbatim gets null (it
// fades into its row; it is never flown from a place it was not said).
export function findWords(sentence, names) {
  const text = String(sentence || '');
  const low = text.toLowerCase();
  const taken = [];
  const isWord = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
  return (names || []).map((name) => {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    let at = low.indexOf(needle);
    while (at >= 0) {
      const end = at + needle.length;
      const bounded = !isWord(low[at - 1]) && !isWord(low[end]);
      const clash = taken.some(([a, b]) => at < b && end > a);
      if (bounded && !clash) { taken.push([at, end]); return [at, end]; }
      at = low.indexOf(needle, at + 1);
    }
    return null;
  });
}
