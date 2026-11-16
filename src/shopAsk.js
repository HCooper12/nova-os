// ALREADY ON THE LIST (mockup 118, his yes 17 Nov 2026). Adding a recipe
// whose lines are already on the list, unticked, for that same recipe used
// to add them again without a word: the lettuce that read ×3 when he
// remembered adding it once. Now the add asks first. Pure: the App asks,
// the recipe page draws the question.
//
// The server keeps a recipe line's words after its leading amount as the
// item's name (shoppingList.js splitAmount), so a line matches an item when
// the line ends with that name. Each item answers one line at most, so a
// recipe already on twice is matched twice before a third add asks.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function alreadyOn(items, lines, source) {
  const all = (lines || []).map((l) => String(l));
  if (!source) return { on: [], missing: all };
  const open = (items || []).filter((i) => i && i.name && !i.checked && i.source === source);
  const used = new Set();
  const on = [];
  const missing = [];
  for (const line of all) {
    const l = norm(line);
    const hit = open.find((i) => {
      if (used.has(i.id)) return false;
      const n = norm(i.name);
      return n && (l === n || l.endsWith(` ${n}`));
    });
    if (hit) { used.add(hit.id); on.push({ line, item: hit }); } else missing.push(line);
  }
  return { on, missing };
}

// how an item already on the list reads in the ask: "400 g", "4", "2 × 160 g"
export function onAmount(item) {
  const qty = Math.max(1, Number(item?.qty) || 1);
  const a = String(item?.amount || '').trim();
  if (!a) return qty > 1 ? `× ${qty}` : '';
  return qty > 1 ? `${a} × ${qty}` : a;
}
