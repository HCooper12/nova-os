import { findingCard } from './findingCards.js';
import { metricCard, listCard } from './spokenCards.js';

// THE CLOSE: one question at a time.
//
// His ask, in his words — the brief tells him a great deal and then leaves
// him to remember all of it and act later, which means he acts on none of
// it. So the brief now finishes by walking the open decisions ONE AT A TIME:
// Nova asks, he answers yes or no (spoken or tapped), it is filed, and the
// next one comes. Nothing to hold in his head, nothing to come back to.
//
// This does NOT invent a new state machine. Every question here is an
// existing pending record on the inbox rails, and yes/no map exactly onto
// approve/discard — the same two calls the Inbox screen makes, with the same
// undo. The queue is a better way to ASK; it is not a new way to write.

// The order he should be asked in: the ones with a real consequence first,
// receipts last. Anything unranked sorts after these.
const ORDER = ['coach-program', 'fuel-cross', 'read-next', 'coach-audit'];

// A record that can be answered yes/no. Deliberately narrow — a capture
// waiting to be filed as a todo is not a DECISION, it is admin, and putting
// admin in this queue is how a useful ritual becomes a chore.
const ASKABLE = new Set(ORDER);

const clean = (s) => String(s || '').replace(/^(Coach|Librarian|Fuel × training):\s*/i, '').replace(/\s+/g, ' ').trim();
const firstSentence = (s) => {
  const t = clean(s);
  const m = t.match(/^(.{20,150}?[.!?])\s/);
  return (m ? m[1] : t.slice(0, 150)).trim();
};

// What Nova actually says when it reaches this one. The question has to
// carry the decision — "shall I apply it?" against a finding he heard four
// beats ago is a memory test, which is the whole thing he is complaining
// about — so each question restates its subject in one line.
export function questionFor(record) {
  const text = clean(record.text);
  switch (record.kind) {
    case 'coach-program':
      return record.fix
        ? `${firstSentence(text)} Shall I make that change, sir?`
        : `${firstSentence(text)} Do you want me to keep that on your list, or let it go?`;
    case 'fuel-cross':
      return `${firstSentence(text)} Worth acting on, or shall I drop it?`;
    case 'read-next':
      return `${firstSentence(text)} Shall I keep that as your next read?`;
    case 'coach-audit':
      return `${firstSentence(text)} Happy for me to file that, sir?`;
    default:
      return `${firstSentence(text)} Yes or no?`;
  }
}

// The picture that goes with the question. A decision he can SEE is one he
// can make; the same rule as everywhere else — real numbers off the record,
// never a fabricated illustration.
export function cardFor(record) {
  const drawn = record.finding ? findingCard(record.finding) : null;
  if (drawn) return drawn;
  if (record.kind === 'coach-audit' && Array.isArray(record.meta?.checks)) {
    const n = (s) => record.meta.checks.filter((c) => c.status === s).length;
    return metricCard({
      label: 'Program audit',
      value: n('fired'),
      caption: 'NEED A DECISION',
      foot: `${n('clear')} clean · ${n('not-yet')} not answerable yet`,
      tone: n('fired') ? 'warn' : 'good',
    });
  }
  return listCard({
    label: label(record.kind),
    items: [{ name: firstSentence(record.text).slice(0, 46), tone: 'gold' }],
    foot: 'yes files it · no leaves it alone',
  });
}

function label(kind) {
  return kind === 'coach-program' ? 'COACH'
    : kind === 'fuel-cross' ? 'FUEL × TRAINING'
      : kind === 'read-next' ? 'LIBRARIAN'
        : kind === 'coach-audit' ? 'PROGRAM AUDIT' : 'NOVA';
}

// Pure so the ordering and the cap are testable without a store.
export function buildQueue(records = [], { cap = 5 } = {}) {
  // `= []` only covers undefined; a store that hands back null would throw
  const open = (Array.isArray(records) ? records : [])
    .filter((r) => r && ASKABLE.has(r.kind) && r.status === 'pending' && r.id && clean(r.text));
  open.sort((a, b) => {
    const d = ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);
    if (d) return d;
    // oldest first within a kind — the one that has waited longest is the
    // one most likely to be quietly rotting
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  // A CAP, and an honest one. Fifty drafts is not a conversation, it is an
  // interrogation; five decisions is a morning. The rest keep waiting in the
  // Inbox exactly as they did before, and the close says how many are left.
  const asked = open.slice(0, cap);
  return {
    decisions: asked.map((r) => ({
      recordId: r.id,
      kind: r.kind,
      label: label(r.kind),
      question: questionFor(r),
      detail: clean(r.text),
      card: cardFor(r),
    })),
    total: open.length,
    remaining: Math.max(0, open.length - asked.length),
  };
}

export async function briefDecisions(deps = {}) {
  const { listRecords } = deps.store || await import('./inboxStore.js');
  return buildQueue(await listRecords(), { cap: deps.cap ?? 5 });
}
