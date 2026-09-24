// SEEN, NOT TICKED. Replayed against all 78 of his real priorities (29 Aug to
// 24 Sep) before shipping: 37 are checkable from the vault, 29 of those were
// done, and of the 8 he marked himself the log agrees on 7. The eighth he
// marked skipped on a day the log holds that session; his mark wins. The cases
// below are his real wordings, including every false claim the first two cuts
// made, each pinned so it cannot come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  priorityKind, namedRoutine, proteinPromise, observePriority, openingClause,
  promiseKey, samePromise, stuckPriorities, staleTodos, isSettled,
} from '../lib/planObserve.js';

const facts = (o = {}) => ({ sessions: [], entries: [], dayOver: true, ...o });
const session = (routineName, finishedAt = '2026-09-23T10:38:00Z') => ({ routineName, finishedAt });
const meal = (name, p, time = '09:49', slot) => ({ name, macros: { p }, time, ...(slot ? { slot } : {}) });

test('sessions are training; the reading, the decision and the rest day are not', () => {
  assert.equal(priorityKind("Run today's Pull session lighter per the coach's advisory"), 'train');
  assert.equal(priorityKind('Complete the 07:30 Pull workout (9 exercises) as scheduled'), 'train');
  assert.equal(priorityKind('At the 07:00 slot, finish the 5 remaining Upper Body make-up exercises'), 'train');
  assert.equal(priorityKind("Pull 'Training Frequency for Hypertrophy in Intermediate Lifters' out of the Library into today's session"), null);
  assert.equal(priorityKind('Make the explicit call on Barbell Bench Press and Cable Bicep Curl in the Push session'), null);
  assert.equal(priorityKind("In today's 07:30 slot — an active-rest day with no competing session"), null);
  assert.equal(priorityKind('Treat today strictly as the prescribed active-rest day — no weights'), null);
});

test('eating protein is protein; planning meals around it is not', () => {
  assert.equal(priorityKind('Eat a fixed ~40g protein source at your first meal today and log it'), 'protein');
  assert.equal(priorityKind('Hit the 150g protein floor today, front-loading toward the 179g rotation plan'), 'protein', 'a word in the reasons must not veto the promise');
  assert.equal(priorityKind('When you plan meals and shopping at 17:00 tonight, lock a specific 40g protein item'), null);
  assert.equal(priorityKind("At the 17:00 meal-plan/shopping block, build next week's list around protein"), null);
});

test('the promise is the opening clause', () => {
  assert.equal(openingClause('Run the 07:00 Leg Day session in full — fold in the overdue Pull carryovers'), 'Run the 07:00 Leg Day session in full');
  assert.equal(priorityKind("Run the 07:00 Leg Day session in full — instead of letting them slip to Sunday's rest day"), 'train');
  assert.equal(priorityKind('During the 07:15 workout block, finish the 4 leftover Pull lifts from Wednesday'), 'train', 'the session word can live in the preamble');
  assert.equal(priorityKind('During the 15:30 work block, just open the podcast and play the first minute'), null);
});

test('the routine named is the earliest one, and adjectives are not routines', () => {
  assert.equal(namedRoutine("Complete today's full Leg Day session plus the 6 carried-over Upper Body lifts"), 'leg');
  assert.equal(namedRoutine('At the 07:30 session, work through the 7 stranded Push carryovers'), 'push');
  assert.equal(namedRoutine('Run the session as scheduled'), null);
});

test('a named session must be that session', () => {
  const leg = 'Run the 07:00 Leg Day session in full';
  assert.equal(observePriority(leg, facts({ sessions: [session('Leg Day')] })).state, 'done');
  const wrong = observePriority(leg, facts({ sessions: [session('Tricep Top-Up — Light')] }));
  assert.equal(wrong.state, 'missed');
  assert.match(wrong.evidence, /not Leg/);
  assert.equal(observePriority('Run the session as scheduled', facts({ sessions: [session('Pull')] })).state, 'done');
});

test('a day still going says not yet, a finished day says missed', () => {
  const p = "Run today's Pull session as scheduled";
  assert.equal(observePriority(p, facts({ dayOver: false })).state, 'not-yet');
  assert.equal(observePriority(p, facts({ dayOver: true })).state, 'missed');
});

test("protein: a single ~40g entry at any logged time counts, because his log times are when he logged", () => {
  const p = 'Eat the fixed 40g protein source in the same slot right after this morning\'s workout';
  const late = observePriority(p, facts({ entries: [meal('Almond Butter Blueberry Protein Smoothie', 44, '21:16', 'breakfast')] }));
  assert.equal(late.state, 'done');
  assert.match(late.evidence, /44g in Almond Butter Blueberry Protein Smoothie at 21:16/);
  assert.equal(observePriority(p, facts({ entries: [meal('Yogurt', 17), meal('Toast', 8)] })).state, 'missed');
  assert.equal(observePriority(p, facts({ entries: [meal('Chicken', 35)] })).state, 'done', '35 is within 15% of 40');
});

test('protein: a floor is the day total', () => {
  const p = 'Hit the 150g protein floor today, front-loaded early';
  assert.deepEqual(proteinPromise(p), { kind: 'total', g: 150 });
  assert.equal(observePriority(p, facts({ entries: [meal('a', 100), meal('b', 86)] })).state, 'done');
  const short = observePriority(p, facts({ entries: [meal('a', 74)] }));
  assert.equal(short.state, 'missed');
  assert.equal(short.evidence, '74 of 150g logged');
});

test('what the vault cannot see is left to him', () => {
  assert.equal(observePriority('During the 15:30 work block, actually watch and write up the saved podcast', facts()), null);
  assert.equal(observePriority('Message or call Nanna and Pa for their wedding anniversary', facts()), null);
  assert.equal(observePriority('anything', null), null);
});

test('his mark and a seen done both settle; a seen miss does not', () => {
  assert.equal(isSettled({ outcome: 'done' }), true);
  assert.equal(isSettled({ outcome: 'skipped' }), true);
  assert.equal(isSettled({ observed: { state: 'done' } }), true);
  assert.equal(isSettled({ observed: { state: 'missed' } }), false);
  assert.equal(isSettled({}), false);
});

test('one promise across its rewordings is one key', () => {
  const a = promiseKey('During the 15:30 work block, actually watch and write up the saved podcast (youtu.be/MGxcosNuC8k).');
  const b = promiseKey('Watch and write up the saved podcast (https://youtu.be/MGxcosNuC8k) before the 15:30 work block');
  assert.ok(samePromise(a, b), `${a} vs ${b}`);
  assert.ok(!samePromise(promiseKey('Run the Pull session'), promiseKey('Call Nanna and Pa')));
});

const plan = (date, ...ps) => ({ date, priorities: ps.map((p) => (typeof p === 'string' ? { do: p } : p)) });

test('stuck: listed on three days and settled on none', () => {
  const podcast = 'Watch and write up the saved podcast before the work block';
  const protein = { do: 'Eat a fixed 40g protein source at breakfast', observed: { state: 'done' } };
  const plans = [
    plan('2026-09-24', podcast, protein),
    plan('2026-09-23', `During the work block, actually ${podcast.toLowerCase()}`, protein),
    plan('2026-09-22', podcast, protein),
    plan('2026-09-21', 'Call the physio', protein),
  ];
  const stuck = stuckPriorities(plans);
  assert.equal(stuck.length, 1, 'the protein item repeats but it was DONE every day, which is not stuck');
  assert.equal(stuck[0].days, 3);
  assert.equal(stuck[0].since, '2026-09-22');
  assert.equal(stuckPriorities(plans.slice(0, 2)).length, 0, 'two days is not yet a pattern');
});

test('one done day unsticks a promise', () => {
  const plans = [plan('3', 'Backfill the missing steps'), plan('2', { do: 'Backfill the missing steps', outcome: 'done' }), plan('1', 'Backfill the missing steps')];
  assert.equal(stuckPriorities(plans).length, 0);
});

test('stale to-dos: open and older than two weeks, oldest first', () => {
  const items = [
    { text: 'old', added: '2026-08-23', checked: false },
    { text: 'fresh', added: '2026-09-20', checked: false },
    { text: 'done', added: '2026-08-01', checked: true },
    { text: 'undated', added: null, checked: false },
  ];
  assert.deepEqual(staleTodos(items, '2026-09-25').map((t) => [t.text, t.days]), [['old', 33]]);
});

test("his answers: let go is for good, not now lasts three days, restore undoes either", async () => {
  const { mkdtempSync } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-stuck-'));
  const { decideStuck, readStuckDecisions, answeredFor } = await import('../lib/planObserve.js');
  const key = promiseKey('Watch and write up the saved podcast');
  const now = new Date('2026-09-25T09:00:00');
  await decideStuck(key, 'later', { text: 'Watch and write up the saved podcast', now });
  let d = await readStuckDecisions();
  assert.equal(d[key].until, '2026-09-28');
  assert.ok(answeredFor(key, d, '2026-09-27'), 'hidden while not-now lasts');
  assert.equal(answeredFor(key, d, '2026-09-28'), null, 'back on the 28th');
  const undo = await decideStuck(key, 'drop', { now });
  assert.equal(undo.prior.action, 'later', 'the prior answer comes back for the undo');
  d = await readStuckDecisions();
  assert.ok(answeredFor(promiseKey('During the block, actually watch and write up the saved podcast'), d, '2027-01-01'), 'a reworded promise is still the one he let go');
  await decideStuck(key, 'restore');
  assert.deepEqual(await readStuckDecisions(), {});
  await assert.rejects(decideStuck(key, 'burn'), /later', 'drop' or 'restore'/);
  await assert.rejects(decideStuck('', 'drop'), /no key/);
});

test('start it with me: the item rides in, the rules forbid the pep talk, and an empty item is refused', async () => {
  const { buildStartQuestion } = await import('../lib/rituals.js');
  const q = buildStartQuestion('Watch and write up the saved podcast', 4);
  assert.match(q, /"Watch and write up the saved podcast"/);
  assert.match(q, /on 4 days/);
  assert.match(q, /under two minutes/);
  assert.match(q, /No motivation/);
  assert.throws(() => buildStartQuestion('  '), /no item/);
});

test('the same link is the same promise, however it is worded', async () => {
  const { linkKey } = await import('../lib/planObserve.js');
  assert.equal(linkKey('During the 15:30 work block, actually watch and write up the saved podcast (youtu.be/MGxcosNuC8k).'), 'yt:MGxcosNuC8k');
  assert.equal(linkKey('Research and analyse video podcast https://youtu.be/MGxcosNuC8k?si=ViCNnsot'), 'yt:MGxcosNuC8k');
  assert.equal(linkKey('https://www.youtube.com/watch?v=MGxcosNuC8k'), 'yt:MGxcosNuC8k');
  assert.equal(linkKey('Read https://example.com/post/'), 'example.com/post');
  assert.equal(linkKey('Call Nanna and Pa'), null);
});
