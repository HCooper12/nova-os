// The show composer's contract: receipts only, honest skips for missing
// sources, the highlight prefers agent-produced work, and the spoken-yes
// gate is armed exactly when something is pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeShow, leisureEventToday } from '../lib/morningShow.js';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = local(new Date());
const YESTERDAY = local(new Date(Date.now() - 86_400_000));
const NOW_ISO = new Date().toISOString();
// Clock-aware beats are pinned rather than left to whenever the suite runs.
const atHour = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const AT_7AM = atHour(7);
const AT_9AM = atHour(9);
const AT_8PM = atHour(20);

const deps = {
  recentDays: async () => [
    { date: YESTERDAY, steps: 8538, hrv: 61.2, sleepAsleepMinutes: 431 },
    { date: TODAY, steps: 2100, sleepAsleepMinutes: 402 },
  ],
  foodToday: async () => ({ entries: [{ macros: { p: 80, kcal: 1900 } }] }),
  records: async () => [
    { id: 'aaa', kind: 'coach', status: 'pending', createdAt: NOW_ISO, text: 'coach verdict on squats' },
    { id: 'bbb', kind: 'research', status: 'pending', createdAt: NOW_ISO, question: 'creatine timing evidence' },
    { id: 'ccc', kind: 'capture', status: 'filed', createdAt: NOW_ISO, text: 'done thing' },
  ],
  eventsForDay: async () => [{ label: 'Push Day', time: '17:30' }],
  panel: async (vp, d) => ({ type: d.panel, data: { stub: true } }),
};

test('morning show: receipts spoken in order, times humanized, spoken-yes armed on the produced item', async () => {
  const { steps, pending } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_7AM }, deps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /morning, sir/i);
  assert.match(all, /6 hours 42 minutes/, 'sleep read from today\'s file');
  assert.match(all, /8,538 steps yesterday/);
  assert.match(all, /Push Day at 5:30 pm/, '24h times become spoken 12h');
  // all-day entries speak like a person, never "at 12:00 am"
  const withAllDay = { ...deps, eventsForDay: async () => [
    { label: "Aarush's Birthday 🥳", time: '00:00' },
    { label: 'Push Day', time: '17:30' },
  ] };
  const again = await composeShow('/tmp/vault', { variant: 'morning', now: AT_7AM }, withAllDay);
  const cal = again.steps.map((s) => s.say).join(' | ');
  assert.match(cal, /it's Aarush's Birthday; one timed thing, next is Push Day at 5:30 pm/);
  assert.doesNotMatch(cal, /12:00 am|🥳/, 'no midnight times, no emoji in speech');
  assert.match(all, /research agent drafted/i, 'overnight produce is narrated');
  assert.match(all, /Say the word/, 'the approval callout closes the brief');
  assert.equal(pending.recordId, 'bbb', 'highlight prefers agent-produced work over coach housekeeping');
});

test('evening show: today\'s numbers, tomorrow\'s shape, fuel beat carries its panel', async () => {
  const { steps } = await composeShow('/tmp/vault', { variant: 'evening' }, deps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /evening, sir/i);
  assert.match(all, /2,100 steps today/);
  assert.match(all, /80 grams of protein and 1,900 calories/);
  assert.match(all, /Tomorrow: one timed thing, first is Push Day at 5:30 pm/);
  const fuel = steps.find((s) => s.say.includes('protein'));
  assert.equal(fuel.panel?.type, 'nutrition-week', 'evidence pane rides its beat');
});

test('missing sources lose their beats silently — never filler, never a crash', async () => {
  const bare = {
    recentDays: async () => [],
    foodToday: async () => { throw new Error('no log'); },
    records: async () => [],
    eventsForDay: async () => { throw new Error('caldav down'); },
    panel: async () => { throw new Error('no panel'); },
  };
  const { steps, pending } = await composeShow('/tmp/vault', { variant: 'morning' }, bare);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /morning, sir/i, 'greeting survives everything');
  assert.doesNotMatch(all, /steps|calendar|Inbox|undefined|NaN/);
  assert.equal(pending, null);
  assert.ok(steps.length >= 2, 'greeting + close at minimum');
});

test('leisureEventToday: finds a leisure/rest event by keyword, ignores ordinary ones, never guesses', () => {
  assert.equal(leisureEventToday([{ label: 'Push Day', time: '17:30' }]), null, 'training is not leisure');
  assert.equal(leisureEventToday([{ label: 'Dentist', time: '09:00' }]), null, 'an appointment is not leisure');
  assert.equal(leisureEventToday([]), null);
  assert.equal(leisureEventToday(null), null, 'never throws on a missing calendar read');
  const movie = { label: 'Movie Marathon with the boys', time: '19:00' };
  assert.equal(leisureEventToday([{ label: 'Push Day', time: '17:30' }, movie]), movie, 'finds it anywhere in the day, not just first');
  assert.equal(leisureEventToday([{ label: 'Team space planning' }]), null, 'word-boundary match — "spa" must not hide inside "space"');
});

test('morning show: a leisure event on the calendar earns a warm, specific line — never on the evening variant', async () => {
  const withLeisure = { ...deps, eventsForDay: async () => [{ label: 'Movie Marathon', time: '14:00' }] };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning' }, withLeisure);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /movie marathon/i);
  assert.match(all, /enjoy|earned the downtime|make the most of it/i);

  // the evening variant reads the SAME event back as part of tomorrow's
  // shape (expected — that beat runs regardless of variant); what must be
  // absent is the warm REMARK itself, morning-only by design
  const evening = await composeShow('/tmp/vault', { variant: 'evening' }, withLeisure);
  assert.doesNotMatch(evening.steps.map((s) => s.say).join(' | '), /enjoy your|earned the downtime|make the most of it/i, 'the leisure remark is morning-only');

  const { steps: plain } = await composeShow('/tmp/vault', { variant: 'morning' }, deps);
  assert.doesNotMatch(plain.map((s) => s.say).join(' | '), /enjoy your|earned the downtime/i, 'no event, no remark — never invented');
});

// ---------------------------------------------------------------------------
// THE CLOCK IS CONTEXT. He opened the brief at 9am and was told his day starts
// with a 7:30 workout he had already missed, then asked what he wanted before
// it. Nova has to know what time it is relative to what it is describing.
// ---------------------------------------------------------------------------

const gymDeps = { ...deps, eventsForDay: async () => [{ label: 'Gym — Push', time: '07:30' }] };

test('clock: a timed event that has already passed is never announced as what is next', async () => {
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_9AM }, gymDeps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.doesNotMatch(all, /next is Gym/, 'a 7:30 event is not "next" at 9am');
  assert.doesNotMatch(all, /starting with Gym/, 'nor what the day starts with');
  assert.match(all, /already behind you/, 'it says the true thing instead');
  assert.match(all, /Gym — Push at 7:30 am/, 'and still names it');
});

test('clock: the same event before it happens is still announced as next', async () => {
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: atHour(6) }, gymDeps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /next is Gym — Push at 7:30 am/);
  assert.doesNotMatch(all, /behind you/);
});

test('clock: with some done and some to come, only what remains is "next"', async () => {
  const mixed = { ...deps, eventsForDay: async () => [
    { label: 'Gym — Push', time: '07:30' },
    { label: 'Standup', time: '14:00' },
  ] };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_9AM }, mixed);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /one timed thing left, next is Standup at 2:00 pm/);
});

test("clock: tomorrow's list is never described as time-worn", async () => {
  const { steps } = await composeShow('/tmp/vault', { variant: 'evening', now: AT_8PM }, gymDeps);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /Tomorrow: one timed thing, first is Gym — Push at 7:30 am/,
    'a 7:30 event tomorrow is ahead of him even though 7:30 today has passed');
  assert.doesNotMatch(all, /behind you|left,/);
});

// ---------------------------------------------------------------------------
// SPOKEN DATES — "14 Aug" is how a calendar writes it, not how a person says it
// ---------------------------------------------------------------------------

test('dates: shorthand in a calendar label is spoken as a person would say it', async () => {
  const dated = { ...deps, eventsForDay: async () => [{ label: 'Invoice due 14 Aug', time: '09:00' }] };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: atHour(6) }, dated);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /the fourteenth of August/);
  assert.doesNotMatch(all, /14 Aug\b/);
});

test('dates: ISO and month-first forms too, but never a measurement', async () => {
  const cases = [
    { label: 'Review 2026-08-14', want: /the fourteenth of August/ },
    { label: 'Deadline Aug 3', want: /the third of August/ },
    { label: 'Trip 1st September', want: /the first of September/ },
  ];
  for (const c of cases) {
    const d = { ...deps, eventsForDay: async () => [{ label: c.label, time: '09:00' }] };
    const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: atHour(6) }, d);
    assert.match(steps.map((s) => s.say).join(' | '), c.want, c.label);
  }
  // a rep count is not a date
  const reps = { ...deps, eventsForDay: async () => [{ label: 'Push Day Aug 12 reps', time: '09:00' }] };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: atHour(6) }, reps);
  assert.match(steps.map((s) => s.say).join(' | '), /Aug 12 reps/, 'a unit after the number means it is a measurement');
});

// The audit beat: the reassuring half of the report. A findings-only brief
// never says "six things came back clean", which is the part that makes the
// silences trustworthy.
test('audit beat: this week\'s audit is spoken, with clean and pending states shown', async () => {
  const weekOf = (() => { const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return local(m); })();
  const withAudit = { ...deps, latestAudit: async () => ({
    weekOf,
    summary: 'I ran 8 checks over your program this week; nothing needs a decision; 7 came back clean; 1 can\'t be answered yet.',
    checks: [
      { id: 'junk-volume', label: 'A muscle past the point more sets help', status: 'clear', detail: 'peak was 18' },
      { id: 'tenure', label: 'Same lift long enough to be worth rotating', status: 'not-yet', detail: 'needs 16 weeks' },
    ],
  }) };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_7AM }, withAudit);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /I ran 8 checks/);
  assert.match(all, /7 came back clean/);
  const card = steps.find((s) => s.card?.label?.includes('PROGRAM AUDIT'))?.card;
  assert.ok(card, 'the beat carries its evidence pane');
  // It is now a CHART, not a list: three bars, so the clean checks are as
  // visible as the ones needing a decision — that reassurance is the half a
  // wall of speech loses.
  assert.equal(card.kind, 'bars');
  assert.deepEqual(card.bars.map((b) => b.name), ['Decide', 'Clean', 'Not yet']);
  assert.equal(card.bars.find((b) => b.name === 'Clean').value, 1);
  assert.match(card.foot, /nothing needs a decision/);
});

test('audit beat: a stale audit from a previous week is not spoken as this week\'s', async () => {
  const stale = { ...deps, latestAudit: async () => ({ weekOf: '2020-01-06', summary: 'ancient audit', checks: [] }) };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_7AM }, stale);
  assert.doesNotMatch(steps.map((s) => s.say).join(' | '), /ancient audit/);
});

test('audit beat: never on the evening variant', async () => {
  const weekOf = (() => { const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return local(m); })();
  const withAudit = { ...deps, latestAudit: async () => ({ weekOf, summary: 'audit line here', checks: [] }) };
  const { steps } = await composeShow('/tmp/vault', { variant: 'evening', now: AT_8PM }, withAudit);
  assert.doesNotMatch(steps.map((s) => s.say).join(' | '), /audit line here/);
});

// Librarian Phase 3's brief hook — occasional, and honest about provenance.
test('library beat: an idea resurfaces with its concepts, flagged if only researched', async () => {
  const withLib = { ...deps, libraryResurface: async () => ({
    line: 'From your library, sir: "Deep Work" by Cal Newport — Attention Residue.',
    item: { title: 'Deep Work', concepts: ['Attention Residue', 'Shallow Work'], provenance: 'researched' },
    reason: 'new',
  }) };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_7AM }, withLib);
  const all = steps.map((s) => s.say).join(' | ');
  assert.match(all, /Attention Residue/);
  const card = steps.find((s) => s.card?.label?.includes('FROM YOUR LIBRARY'))?.card;
  assert.ok(card, 'the beat carries its concepts as evidence');
  assert.match(card.foot, /researched, not read/, 'provenance survives into the brief');
});

test('library beat: rate-limited to silence, never filler', async () => {
  const quiet = { ...deps, libraryResurface: async () => null };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning', now: AT_7AM }, quiet);
  assert.doesNotMatch(steps.map((s) => s.say).join(' | '), /From your library/);
});

test('library beat: never on the evening variant', async () => {
  const withLib = { ...deps, libraryResurface: async () => ({ line: 'library line here', item: { concepts: [] }, reason: 'new' }) };
  const { steps } = await composeShow('/tmp/vault', { variant: 'evening', now: AT_8PM }, withLib);
  assert.doesNotMatch(steps.map((s) => s.say).join(' | '), /library line here/);
});
