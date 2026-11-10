// THE STAGE'S PANELS, ONE LIST FOR THE MAC AND THE PHONE (10 Nov 2026,
// mockup 114). Lifted out of NovaMac.jsx so the phone stage shows exactly the
// panels the Mac shows, from the same card data, in the same order:
//   kept (pinned) panels, then ones brought back, then the lookup's pages and
//   clips, then the answer's own panels (code's first, then the model's), then
//   the pending proposal as its own panel.
// A panel is drawn only when its card can be (cardDrawable), never twice for
// the same key, never when he put it away, and never a second time for a
// later card that says what an earlier one already says (cardLineKey: his
// real brief once had the Coach line twice). A page or video beat the model
// wrote is a LIGHT on the lookup's own card, never a second card.
// Pure; tested in server/test/stagePanels.test.js.

import { cardDrawable, cardLineKey } from './stageFormFacts.js';

/** The lookup card a page or video beat points at ("lk:p<n>" / "lk:v<n>"),
 *  or null when the card is not such a beat. Pure. */
export function panelLight(card) {
  if (card?.kind === 'page' && !card.lookup && card.source) return `lk:p${card.source}`;
  if (card?.kind === 'video' && !card.lookup && card.clip) return `lk:v${card.clip}`;
  return null;
}

const pairs = (x) => (x ? [...x] : []);

/**
 * The stage's panels, in order. `pinned` and `brought` are Maps (or arrays of
 * [key, card]); `lookup` is [{ key, card }]; `model` is [{ key, card }] (code's
 * panels first, then the model's); `proposal` is the proposal's own card (from
 * proposalCard) or null; `gone` holds the keys he put away.
 * Returns [{ key, card, pinned?, brought? }]. Pure.
 */
export function stagePanels({ pinned = null, brought = null, lookup = [], model = [], proposal = null, gone = null } = {}) {
  const seen = new Set();
  const said = new Set();
  const out = [];
  const add = (key, card, extra = {}) => {
    if (!key || !card || seen.has(key) || gone?.has(key) || !cardDrawable(card)) return;
    const line = cardLineKey(card);
    if (line && said.has(line)) return;
    if (line) said.add(line);
    seen.add(key);
    out.push({ key, card, ...extra });
  };
  for (const [key, card] of pairs(pinned)) add(key, card, { pinned: true });
  for (const [key, card] of pairs(brought)) add(key, card, { brought: true });
  for (const l of lookup || []) add(l.key, l.card);
  for (const p of model || []) { if (panelLight(p.card)) continue; add(p.key, p.card); }
  if (proposal) add(proposal.key, proposal);
  return out;
}
