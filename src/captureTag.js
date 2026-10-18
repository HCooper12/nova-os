// THE TAG ON A CAPTURE (18 Oct 2026, mockup 103). His ask: "a tag that
// identifies this as a shopping list item just in case I realise that nova is
// interpreting it wrong". One pure reader of where a capture went, shared by
// both Inbox layouts: the words on the tag, its hue, and whether it can move.
// Each place owns its hue (rule 8): shopping good, to-do cyan, note and idea
// violet, journal gold, reminder orange; unsorted is dashed gold (undecided).

const HOUR = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short' });
const cap = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());

export const PLACES = [
  { route: 'shopping', label: 'Shopping list', sub: 'to buy' },
  { route: 'todo', label: 'To-do', sub: 'do it later' },
  { route: 'note', label: 'Note', sub: 'keep it' },
  { route: 'journal', label: 'Journal', sub: 'about your day' },
  { route: 'idea', label: 'Idea', sub: 'something to make' },
  { route: 'reminder', label: 'Reminder', sub: 'at a time' },
];

const AISLE = { 'Household & Other': 'Household', 'Meat & Protein': 'Meat', 'Dairy & Eggs': 'Dairy', 'Pantry & Seasonings': 'Pantry' };

function whenLabel(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? HOUR.format(d) : `${DAY.format(d)} ${HOUR.format(d)}`;
}

// { label, tone, movable } for an inbox record, or null when it is not a capture
export function captureTag(record, now = new Date()) {
  if (!record || record.kind) return null;
  if (record.status === 'classifying') return { label: 'Sorting…', tone: 'quiet', movable: false };
  if (record.status === 'undone') return { label: 'Undone', tone: 'quiet', movable: false };
  if (record.status === 'discarded') return null;
  const d = record.decision;
  if (record.status === 'error' || !d) return { label: 'Unsorted · pick a place', tone: 'unsorted', movable: true };
  if (d.unsorted) return { label: 'Unsorted · pick a place', tone: 'unsorted', movable: true };
  const p = d.payload || {};
  const waiting = record.status === 'pending' ? ' · waiting' : '';
  switch (d.route) {
    case 'shopping': {
      const cats = [...new Set((p.items || []).map((i) => AISLE[i.category] || i.category))];
      return { label: `Shopping list${cats.length === 1 ? ` · ${cats[0]}` : ''}${waiting}`, tone: 'shopping', movable: true };
    }
    case 'todo': return { label: `To-do${p.items?.[0]?.category ? ` · ${cap(p.items[0].category)}` : ''}${waiting}`, tone: 'todo', movable: true };
    case 'reminder': return { label: `Reminder · ${whenLabel(p.whenISO, now)}${waiting}`, tone: 'reminder', movable: true };
    case 'journal': return { label: `Journal${waiting}`, tone: 'journal', movable: true };
    case 'idea': return { label: `Idea${waiting}`, tone: 'note', movable: true };
    case 'note': return { label: `Note${waiting}`, tone: 'note', movable: true };
    case 'food': return { label: `Food log${waiting}`, tone: 'food', movable: false };
    case 'expense': return { label: `Money${waiting}`, tone: 'quiet', movable: false };
    case 'stash': return { label: `Saved link${waiting}`, tone: 'quiet', movable: false };
    default: return { label: cap(d.route), tone: 'quiet', movable: false };
  }
}

export const TAG_HUE = {
  shopping: 'var(--nv-good)', todo: 'var(--nv-cy)', note: 'var(--nv-vi)', journal: 'var(--nv-gold)',
  reminder: 'var(--nv-or, var(--nv-gold))', food: 'var(--nv-good)', unsorted: 'var(--nv-gold)', quiet: 'var(--nv-ink60)',
};

// A link worth the deep weave by itself (his ask, 18 Oct: a Diary of a CEO or
// Chris Williamson episode is analysed in full, transcript to vault, with
// connections). Long-form video and podcast episodes, not reels or shorts.
export function isLongForm(url) {
  const u = String(url || '');
  if (/\/shorts\/|\/reel\/|tiktok\.com|instagram\.com/i.test(u)) return false;
  return /youtube\.com\/watch\?|youtu\.be\/|youtube\.com\/live\/|vimeo\.com\/\d+|podcasts\.apple\.com\/.+\/podcast\//i.test(u);
}
