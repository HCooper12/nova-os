// The morning brief's new duties (his 21-Aug ask): name what is UNUSUAL on
// the calendar, raise what his body is flagging and ASK about pain when the
// evidence warrants it, and end on a question. Plus the cards that ride each
// beat — the glass keeping up with the voice.
import test from 'node:test';
import assert from 'node:assert/strict';

const { composeShow, unusualEvents } = await import('../lib/morningShow.js');
const { metricCard, barsCard, listCard } = await import('../lib/spokenCards.js');

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const YESTERDAY = localDate(new Date(Date.now() - 86_400_000));

const baseDeps = {
  recentDays: async () => [{ date: YESTERDAY, steps: 8000, hrv: 60, restingHr: 50 }],
  foodToday: async () => ({ entries: [] }),
  records: async () => [],
  eventsForDay: async () => [],
  panel: async () => null,
};

test('unusualEvents: only what is absent from the trailing fortnight', () => {
  const history = [{ label: 'Gym' }, { label: 'Work 💰' }, { label: 'Cook 👨‍🍳' }];
  const today = [{ label: 'Gym' }, { label: 'Dentist' }, { label: 'work 💰' }];
  const odd = unusualEvents(today, history);
  assert.deepEqual(odd.map((e) => e.label), ['Dentist'], 'routine events are not news; case and emoji do not fool it');
  assert.deepEqual(unusualEvents(today, []).length, 3, 'no history means everything is new');
});

test('an open injury raises a beat that ASKS about it', async () => {
  const deps = {
    ...baseDeps,
    injuries: async () => [{ area: 'Left shoulder', severity: 'niggle' }],
    lastSessions: async () => [],
  };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning' }, deps);
  const beat = steps.find((s) => /left shoulder/i.test(s.say));
  assert.ok(beat, 'the flagged area is spoken');
  assert.match(beat.say, /how is it feeling/i, 'and he is actually asked');
  assert.equal(beat.asks, true, 'the beat is marked as a question, so the mic opens for it');
  assert.equal(beat.card.kind, 'list');
  assert.equal(beat.card.items[0].tone, 'warn');
});

test('pain logged in a recent session raises it too — from his own training log', async () => {
  const deps = {
    ...baseDeps,
    injuries: async () => [],
    lastSessions: async () => [{
      date: new Date().toISOString().slice(0, 10),
      exercises: [{ name: 'Barbell Row', sets: [{ reps: 8, pain: 'lower back' }] }],
    }],
  };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning' }, deps);
  assert.ok(steps.some((s) => /barbell row/i.test(s.say) && /how is it feeling/i.test(s.say)));
});

test('no injury, no pain, steady heart rate → no health beat at all (never a daily formality)', async () => {
  const deps = { ...baseDeps, injuries: async () => [], lastSessions: async () => [] };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning' }, deps);
  assert.equal(steps.some((s) => /keep in mind|feeling this morning/i.test(s.say)), false);
});

test('resting heart rate well above his own baseline earns a mention', async () => {
  const deps = {
    ...baseDeps,
    recentDays: async () => [
      { date: 'a', restingHr: 49 }, { date: 'b', restingHr: 50 }, { date: 'c', restingHr: 51 }, { date: YESTERDAY, restingHr: 70 },
    ],
    injuries: async () => [], lastSessions: async () => [],
  };
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning' }, deps);
  const beat = steps.find((s) => /resting heart rate/i.test(s.say));
  assert.ok(beat, '+20bpm over baseline is worth a sentence');
  assert.match(beat.card.items[0].note, /70 vs 50 bpm/);
});

test('the morning brief ends on a question; the evening one does not', async () => {
  const morning = await composeShow('/tmp/vault', { variant: 'morning' }, baseDeps);
  const last = morning.steps[morning.steps.length - 1];
  assert.match(last.say, /\?$/, 'the morning closes by asking him something');
  assert.equal(last.asks, true);
  const evening = await composeShow('/tmp/vault', { variant: 'evening' }, baseDeps);
  const eveLast = evening.steps[evening.steps.length - 1];
  assert.doesNotMatch(eveLast.say, /\?$/, 'the evening lets him go');
});

test('beats carry cards built from the same numbers they speak', async () => {
  const { steps } = await composeShow('/tmp/vault', { variant: 'morning' }, baseDeps);
  const stepsBeat = steps.find((s) => /8,000 steps/.test(s.say));
  assert.equal(stepsBeat.card.kind, 'metric');
  assert.equal(stepsBeat.card.value, '8,000', 'the card shows exactly what the voice said');
});

test('card builders refuse to invent: no value, no card', () => {
  assert.equal(metricCard({ label: 'x', value: null }), null);
  assert.equal(barsCard({ label: 'x', bars: [{ name: 'only', value: 3 }] }), null, 'one bar is a number, not a chart');
  assert.equal(listCard({ label: 'x', items: [] }), null);
  const bars = barsCard({ label: 'x', bars: [{ name: 'a', value: 5 }, { name: 'b', value: 10 }] });
  assert.deepEqual(bars.bars.map((b) => b.pct), [50, 100], 'bars scale to the largest value');
});
