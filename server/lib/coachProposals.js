// COACH'S CHANGES, FROM ITS REPLY TO HIS CARDS — checked whole before any
// card exists, fixed by the Coach that wrote them, confirmed by code.
//
// 25 Sep 2026, his Coach chat, 11:01–11:26 AEST. He asked one straightforward
// thing: bring Upper Body closer to an hour without losing weekly volume.
// Twenty-five minutes later he had lost an exercise and was typing "You still
// failed and haven't added it to my push day yet." What went wrong, and the
// rule each fault left here:
//
//   1. Six of twelve PROPOSE lines were refused, and the refusal was tacked
//      onto the reply after the model had finished, so Coach never saw it and
//      kept telling him to approve cards that did not exist ("approve the
//      first four cards"). → Every line is validated BEFORE a card is filed.
//      A refused line goes back to the same Coach session, once, with the
//      exact reason; only what still fails reaches him, in plain words.
//   2. "Done. It's on Push now." — the model announced a result it could not
//      see; the add had been refused. → The model never states an outcome.
//      Code appends what actually happened, from the record it just wrote.
//   3. Two curl moves onto his Push day (his split, broken) → a refusal of
//      SUBSTANCE: the advice itself was wrong, so the reply is rewritten,
//      not patched with a card.
//   4. "Turn down both pending curl cards" — Coach's stale cards were his to
//      clean up. → WITHDRAW takes back Coach's own waiting card.
//
// Models decide, code acts: nothing here writes to his plan except an
// instructed change on his standing grant (getCoachEditConfig), through the
// same approve path his tap takes, with its undo.

import { parseCoachProposals, validateCoachEdit, createCoachEditRecord, getCoachEditConfig, routeForAction, proposalKey, hisWordsOf } from './coach.js';
import { COACH_ROUTES } from '../../src/coachSuggestions.js';

// One repair round. A Coach that cannot fix a card with the reason in front
// of it will not fix it on a third try either; he is told what did not land.
export const MAX_REPAIR_ROUNDS = 1;

const WITHDRAW_LINE = /^[ \t]*WITHDRAW\b.*$/gm;

// WITHDRAW {"ids":["5ba15605"]} — Coach taking back its own waiting card.
export function parseWithdraw(text) {
  let cleanText = String(text || '');
  const ids = [];
  for (const m of cleanText.matchAll(WITHDRAW_LINE)) {
    const json = m[0].replace(/^\s*WITHDRAW\s*/, '');
    try {
      const o = JSON.parse(json);
      for (const id of [].concat(o?.ids || o?.id || [])) {
        const v = String(id || '').trim();
        if (/^[0-9a-f]{6,12}$/i.test(v)) ids.push(v);
      }
    } catch { /* a prose WITHDRAW names nothing it can act on; it is still not his to read */ }
    cleanText = cleanText.replace(m[0], '');
  }
  return { cleanText: cleanText.replace(/\n{3,}/g, '\n\n').trim(), ids: [...new Set(ids)] };
}

// Every PROPOSE line in a reply, checked and nothing filed.
export async function checkProposals(vaultPath, text, { validate = validateCoachEdit, asked = null } = {}) {
  const { cleanText, proposals, badLines } = parseCoachProposals(text);
  const ok = [];
  const refused = [];
  for (const proposal of proposals) {
    try {
      const v = await validate(vaultPath, proposal, { asked });
      ok.push({ proposal, payload: v.payload, title: v.title, route: routeForAction(v.payload.action) });
    } catch (e) {
      refused.push({ proposal, line: `PROPOSE ${JSON.stringify(proposal)}`, reason: e.message, kind: e.kind || 'format' });
    }
  }
  for (const b of badLines || []) refused.push({ proposal: null, line: b.line, reason: `the line is ${b.why}`, kind: 'format' });
  return { cleanText, ok, refused };
}

// A REMOVE AND AN ADD OF ONE EXERCISE ARE A MOVE, whatever the model wrote.
// The prompt asks for "move"; this makes sure a move can never again be two
// cards he can half-approve (his rope extension, 25 Sep). The pair becomes
// one move card, placed and prescribed as the add said. It applies on his
// word only if BOTH halves were his instruction.
export async function pairMoves(vaultPath, ok, { validate = validateCoachEdit, asked = null } = {}) {
  const out = [...ok];
  for (const rem of ok.filter((c) => c.payload?.action === 'remove')) {
    const add = out.find((c) => c.payload?.action === 'add' && c.payload.routineId !== rem.payload.routineId && c.payload.addExerciseId && c.payload.addExerciseId === rem.payload.removeExerciseId);
    if (!add || !out.includes(rem)) continue;
    const raw = {
      action: 'move', exercise: rem.payload.removeName, from: rem.payload.routineName, to: add.payload.routineName,
      ...(add.payload.afterName ? { after: add.payload.afterName } : add.payload.position === 1 ? { position: 'first' } : {}),
      ...(add.payload.targetSets ? { targetSets: add.payload.targetSets } : {}),
      ...(add.payload.targetRepsLow ? { targetRepsLow: add.payload.targetRepsLow } : {}),
      ...(add.payload.targetRepsHigh ? { targetRepsHigh: add.payload.targetRepsHigh } : {}),
      reason: add.payload.reason || rem.payload.reason || '',
      ...(rem.proposal?.instructed === true && add.proposal?.instructed === true ? { instructed: true } : {}),
    };
    try {
      const v = await validate(vaultPath, raw, { asked });
      out.splice(out.indexOf(rem), 1, { proposal: raw, payload: v.payload, title: v.title, route: routeForAction('move') });
      out.splice(out.indexOf(add), 1);
    } catch { /* a move that cannot stand leaves both halves as they were checked */ }
  }
  return out;
}

// What the Coach is sent when a line is refused. A wording fault is fixed
// line by line and its answer stands; a refusal of substance means the advice
// was wrong for him, so the whole reply is written again.
export function repairRequest(refused, { rewrite = false } = {}) {
  const n = refused.length;
  const list = refused.map((r, i) => `${i + 1}. ${r.line}\n   refused: ${r.reason}`).join('\n');
  return `[Code check, before anything reaches him: ${n === 1 ? 'one of your PROPOSE lines' : `${n} of your PROPOSE lines`} could not become ${n === 1 ? 'a card' : 'cards'}, and nothing has been filed yet.
${list}
${rewrite
    ? 'At least one refusal means the change itself was wrong for him, so your advice has to change with it. Write your whole reply to him again with that fixed; it replaces the one above. Keep what was right, change what the check caught, and end with EVERY PROPOSE line the new reply recommends, including the ones that passed.'
    : 'Reply with ONLY the corrected PROPOSE lines, one per change, in the exact JSON form. Your answer to him stands as written, so do not repeat it. If a change should not be made after all, leave it out.'}
Never say a change is done, applied or on his plan: code confirms underneath what actually happened. Do not CONSULT.]`;
}

// A card's title the way he reads it.
const plain = (title) => String(title || '').replace(/^Coach:\s*/, '').replace(/\s+/g, ' ').trim();
const toHim = (s) => String(s || '').replace(/\bhis\b/g, 'your').replace(/\bHis\b/g, 'Your').replace(/\bhim\b/g, 'you').replace(/\bHE\b/g, 'you');

// What an applied change did, as a sentence he can hear.
function doneSentence(f) {
  const p = f.payload || {};
  const reps = p.targetRepsLow && p.targetRepsHigh && p.targetRepsLow !== p.targetRepsHigh ? `${p.targetRepsLow} to ${p.targetRepsHigh}` : p.targetRepsLow || p.targetRepsHigh || null;
  const sets = p.targetSets && reps ? `, ${p.targetSets} sets of ${reps}` : p.targetSets ? `, ${p.targetSets} sets` : '';
  const where = p.afterName ? `, straight after ${p.afterName}` : p.position === 1 ? ', first in the order' : '';
  if (f.route === 'routine-edit') {
    if (p.action === 'move') return `${p.removeName} is on ${p.routineName} now${where}${sets}, and off ${p.fromRoutineName}`;
    if (p.action === 'add') return `${p.addName} is on ${p.routineName} now${where}${sets}`;
    if (p.action === 'remove') return `${p.removeName} is off ${p.routineName}`;
    if (p.action === 'swap') return `${p.routineName} has ${p.addName} in place of ${p.removeName}${sets}`;
    if (p.action === 'reorder') return `${p.removeName} is number ${p.position} on ${p.routineName} now`;
    if (p.action === 'targets') return `${p.removeName} on ${p.routineName} is now${sets.replace(/^,/, '')}`;
  }
  if (f.route === 'schedule-edit') return `${String(p.day || '').replace(/^./, (c) => c.toUpperCase())} is ${p.routineName} now`;
  return plain(f.title);
}

// Code's own account of what happened, appended to the Coach's reply.
export function receiptLines({ filed = [], refused = [], withdrawn = [] } = {}) {
  const lines = [];
  for (const f of filed) {
    if (f.status === 'done') lines.push(`Done: ${doneSentence(f)}.`);
    else if (f.instructed && f.error) lines.push(`Not done yet: ${plain(f.title)}. ${toHim(f.error)}. It is waiting for your yes on the Coach tab.`);
  }
  const back = withdrawn.filter((w) => w.ok);
  if (back.length) lines.push(`Taken off the Coach tab: ${back.map((w) => plain(w.title)).join('; ')}.`);
  // only what still failed after the Coach's own repair reaches him. A reason
  // of substance is his business (it breaks his split, it is already there);
  // a wording fault is ours, and naming the JSON field would be noise.
  for (const r of refused) {
    const what = r.proposal ? describe(r.proposal) : 'one change';
    const why = r.kind === 'substance'
      ? toHim(r.reason).replace(/[.;]\s*Only if you asked for exactly this placement.*$/s, '').replace(/[.\s]+$/, '')
      : null;
    lines.push(why ? `Not on a card, so nothing changed: ${what}. ${why.charAt(0).toUpperCase()}${why.slice(1)}.` : `Not on a card, so nothing changed: ${what}. Ask Coach again and it will re-send it.`);
  }
  return lines;
}

// A refused proposal, named for him from its own fields.
function describe(p) {
  const a = String(p.action || '').toLowerCase();
  const name = p.exercise || p.add || p.remove || p.name || '';
  if (a === 'move') return `move ${name} from ${p.from || p.routine || '?'} to ${p.to || '?'}`;
  if (a === 'add') return `add ${name}${p.routine ? ` to ${p.routine}` : ''}`;
  if (a === 'remove') return `remove ${name}${p.routine ? ` from ${p.routine}` : ''}`;
  if (a === 'swap') return `swap ${p.remove || p.exercise} for ${p.add}${p.routine ? ` in ${p.routine}` : ''}`;
  if (a === 'schedule') return `${p.day} → ${p.routine}`;
  return `${a || 'a change'}${name ? ` for ${name}` : ''}`;
}

const isCoachCard = (r) => r?.kind === 'coach-program' || COACH_ROUTES.includes(r?.decision?.route);
const cardTitle = (r) => r?.decision?.title || String(r?.originalText || r?.text || '').split(/(?<=[.!?])\s/)[0] || 'a change';

// Coach taking back its own card. Not his decline — a withdrawn card is
// neither approved nor turned down, so nothing that learns from his answers
// (the trust ladder, respect-the-no, "ask why he declined") counts it.
export async function withdrawCards(ids, { store } = {}) {
  const s = store || await import('./inboxStore.js');
  const out = [];
  for (const id of ids || []) {
    const r = await s.getRecord(id);
    if (!r) { out.push({ id, ok: false, reason: 'no card has that id' }); continue; }
    if (!isCoachCard(r)) { out.push({ id, ok: false, title: cardTitle(r), reason: 'that is not one of your cards' }); continue; }
    if (r.status !== 'pending') { out.push({ id, ok: false, title: cardTitle(r), reason: `he has already answered it (${r.status})` }); continue; }
    await s.updateRecord(id, { status: 'withdrawn', withdrawnAt: new Date().toISOString(), withdrawnBy: 'coach' });
    out.push({ id, ok: true, title: cardTitle(r) });
  }
  return out;
}

// File what passed. The same change already waiting is that card, not a twin
// (a re-sent change used to mean a second card and a second push). An
// instructed change applies now, on his standing grant, through approveRecord.
export async function fileChanges(vaultPath, { question, ok = [], deps = {} }) {
  const store = deps.store || await import('./inboxStore.js');
  const approve = deps.approve || (async (id) => (await import('./inbox.js')).approveRecord(vaultPath, id));
  const config = deps.config || getCoachEditConfig;
  const direct = ok.some((c) => c.proposal?.instructed === true) ? (await config()).direct : false;
  const waiting = new Map((await store.listRecords())
    .filter((r) => r.status === 'pending' && r.decision?.route && r.decision?.payload)
    .map((r) => [proposalKey(r.decision.route, r.decision.payload), r]));
  const filed = [];
  const thisTurn = new Set();
  for (const c of ok) {
    const key = proposalKey(c.route, c.payload);
    if (thisTurn.has(key)) continue; // the same line twice in one reply
    thisTurn.add(key);
    let record = waiting.get(key);
    const reused = !!record;
    if (!record) record = await (deps.create || createCoachEditRecord)(vaultPath, { question, proposal: c.proposal, validated: { payload: c.payload, title: c.title } });
    const item = { recordId: record.id, title: record.decision?.title || c.title, route: c.route, payload: c.payload, instructed: c.proposal?.instructed === true, reused };
    if (item.instructed && direct) {
      try {
        const done = await approve(record.id);
        item.status = 'done';
        item.destination = done?.destination || null;
      } catch (e) {
        item.error = e.message;
      }
    }
    filed.push(item);
  }
  return filed;
}

// The whole of it: a finished Coach reply in, the text he reads and the cards
// out. `resume(text, { rewrite })` sends the repair to the same Coach session
// and resolves with its reply (or null if that turn failed — then he gets the
// first reply, what passed, and plain words about what did not).
export async function settleCoachChanges(vaultPath, { question, replyText, resume = null, onRepair = null, deps = {} }) {
  const validate = deps.validate || validateCoachEdit;
  // what HE said, for the one check that needs it (a split-breaking change is
  // his call only when his own words name it); never the deck's framing
  const hisWords = hisWordsOf(question);
  const w0 = parseWithdraw(replyText);
  let ids = w0.ids;
  const first = await checkProposals(vaultPath, w0.cleanText, { validate, asked: hisWords });
  let text = first.cleanText;
  let ok = first.ok;
  let refused = first.refused;
  let rounds = 0;
  while (refused.length && rounds < MAX_REPAIR_ROUNDS && resume) {
    rounds += 1;
    const rewrite = refused.some((r) => r.kind === 'substance');
    onRepair?.({ rewrite, text, refused });
    const reply = await resume(repairRequest(refused, { rewrite }), { rewrite });
    if (reply == null) break;
    const w = parseWithdraw(reply);
    ids = [...new Set([...ids, ...w.ids])];
    const again = await checkProposals(vaultPath, w.cleanText, { validate, asked: hisWords });
    if (rewrite) {
      // the rewrite is the whole answer and carries every change it wants
      if (again.cleanText) text = again.cleanText;
      ok = again.ok;
    } else {
      ok = [...ok, ...again.ok];
    }
    refused = again.refused;
  }
  ok = await pairMoves(vaultPath, ok, { validate, asked: hisWords });
  // withdraw BEFORE filing, so a card taken back and re-proposed in the same
  // reply becomes a fresh card, not the withdrawn one
  const withdrawn = ids.length ? await withdrawCards(ids, { store: deps.store }) : [];
  const filed = await fileChanges(vaultPath, { question, ok, deps });
  const receipts = receiptLines({ filed, refused, withdrawn });
  return { text: [text, ...receipts].filter(Boolean).join('\n\n'), filed, refused, withdrawn, rounds };
}
