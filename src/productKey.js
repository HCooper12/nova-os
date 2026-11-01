// The one name for an ingredient line, shared by the phone and the server
// (server/lib/products.js), so a product linked on one is found by the other.
// The AMOUNT is not part of the name: "400g extra lean beef mince" and
// "500g extra lean beef mince" are the same ingredient, and his product stays
// linked when the amount changes (the change he made on 31 Oct). Pure.
const AMOUNT = /^\s*(?:\d+(?:[.,/]\d+)?\s*(?:x\s*)?(?:kg|g|ml|l|tbsp|tsp|cups?|slices?|scoops?)?\b\s*)+/i;
export const lineKey = (line) => String(line || '').replace(AMOUNT, '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** The count a line starts with ("3 eggs" → 3), when it carries no weight. Pure. */
export const leadingCount = (line) => { const m = /^\s*(\d+(?:\.\d+)?)\s+(?!(?:kg|g|ml|l)\b)/i.exec(String(line || '')); return m ? Number(m[1]) : null; };
