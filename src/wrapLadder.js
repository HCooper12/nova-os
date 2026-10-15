// THE LADDER BEHIND "TOMORROW NEEDS" (15 Oct 2026; mockup "Nova motion set"
// #s7, his approval). Wrap the day's one thing for tomorrow is chosen by code,
// server/lib/wrapDay.js askFor(): five checks in a fixed order, the first
// that fires wins (an empty fridge, a missed protein floor, a stale weigh-in,
// tomorrow's training, otherwise hold the line). The card draws those five
// checks as rows, each with the fact it looked at, and a glass lens settles
// on the one askFor picked. The rows are the real ladder in the real order;
// the lens goes where the server's answer (`ask.kind`) says, never a guess.
//
// Pure: valsMission builds it from GET /api/wrap's { facts, ask }.

export const LADDER = ['cook', 'protein', 'weigh', 'train', 'hold'];

const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-AU');

export function wrapLadder(facts, ask) {
  if (!facts || !ask || !LADDER.includes(ask.kind)) return null;
  const f = facts;
  const portions = (f.fridge || []).reduce((s, x) => s + (Number(x?.portions) || 0), 0);
  const floor = f.targets?.protein || null;
  const eatenP = Math.max(0, Math.round(f.eaten?.p || 0));
  const t = f.tomorrow;
  const rows = [
    { key: 'cook', label: 'Fridge', value: portions ? `${portions} portion${portions === 1 ? '' : 's'} cooked` : 'Empty' },
    { key: 'protein', label: 'Protein', value: floor ? `${eatenP} / ${floor} g` : `${eatenP} g, no floor set` },
    { key: 'weigh', label: 'Weigh-in', value: f.weighStaleDays == null ? 'No reading' : f.weighStaleDays === 0 ? 'Today' : `${f.weighStaleDays} day${f.weighStaleDays === 1 ? '' : 's'} ago` },
    { key: 'train', label: 'Tomorrow', value: !t ? 'Not known' : t.kind === 'train' ? (t.name || 'Training') : t.kind === 'active-rest' ? 'Active rest' : 'Rest day' },
    { key: 'hold', label: 'Hold the line', value: f.targets?.kcal ? `${n(f.targets.kcal)} kcal` : 'No targets set' },
  ];
  const text = String(ask.text || '').trim();
  return {
    date: f.date || null,
    rows,
    hero: LADDER.indexOf(ask.kind),
    why: text ? text[0].toUpperCase() + text.slice(1) : '',
  };
}

// The counted sentence without its last clause, when the ladder is drawn
// beneath it: the card says "Tomorrow: …" once, as the lens and its reason,
// not twice. Spoken, the whole sentence is still read (speakWrap reads the
// server's line).
export function lineWithoutTomorrow(line, ask) {
  const s = String(line || '');
  const tail = ask?.text ? ` Tomorrow: ${ask.text}` : null;
  if (!tail || !s.includes(tail)) return s;
  return s.replace(tail, '').replace(/\s{2,}/g, ' ').trim();
}
