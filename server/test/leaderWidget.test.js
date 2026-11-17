import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Its OWN data dir: without one these tests would read and write his live
// server/data (leader.json holds his real work situation).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-leaderwidget-'));
process.env.NOVA_DATA_DIR = dir;

let W;
before(async () => { W = await import('../lib/leaderWidget.js'); });

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Invented content only.
const SIT = {
  headline: 'Two rosters, one person short',
  stands: 'The late shift is one short. The team is cutting corners on the close.',
  question: 'Did you raise the gap, or cover it again?',
  openCount: 99, daysSinceUpdate: 99, stale: true,
};
const entry = (date, over = {}) => ({
  date, kind: 'action', title: `Idea for ${date}`, line: 'Hand over the outcome. Leave the method to them.',
  why: 'People care more about work they shape.', refs: ['Sample note · Outcomes', 'Second ref'],
  situation: SIT, createdAt: `${date}T07:00:00.000Z`, ...over,
});
const struggle = (text, when, over = {}) => ({ text, at: when.toISOString(), ...over });

const write = (state) => fs.writeFileSync(path.join(dir, 'leader.json'), JSON.stringify(state));
beforeEach(() => {
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true, recursive: true });
});

test('today: the lead carries only the idea, src is the first ref', () => {
  const now = at(2026, 11, 18, 9);
  const state = { daily: [entry('2026-11-17'), entry('2026-11-18', { kind: 'reminder' })], profile: { struggles: [], working: [] } };
  const p = W.composeLeaderWidget(state, now);
  assert.equal(p.date, '2026-11-18');
  assert.deepEqual(p.lead, {
    date: '2026-11-18', kind: 'reminder', title: 'Idea for 2026-11-18',
    line: 'Hand over the outcome. Leave the method to them.', why: 'People care more about work they shape.', src: 'Sample note · Outcomes',
  });
  assert.equal(p.previous.date, '2026-11-17');
});

test('the lead object never carries situation text', () => {
  const now = at(2026, 11, 18, 9);
  const state = {
    daily: [entry('2026-11-17'), entry('2026-11-18')],
    profile: { struggles: [struggle('A struggle on file', at(2026, 11, 16))], working: [] },
  };
  const p = W.composeLeaderWidget(state, now);
  for (const L of [p.lead, p.previous]) {
    assert.deepEqual(Object.keys(L).sort(), ['date', 'kind', 'line', 'src', 'title', 'why']);
    const flat = JSON.stringify(L);
    for (const s of [SIT.headline, SIT.stands, SIT.question, 'A struggle on file', 'situation']) assert.ok(!flat.includes(s), `lead leaked: ${s}`);
  }
  // and the situation is still there, on its own
  assert.equal(p.situation.headline, SIT.headline);
});

test('not written yet: no lead today, the newest earlier one is previous', () => {
  const now = at(2026, 11, 18, 6);
  const state = { daily: [entry('2026-11-15'), entry('2026-11-17')], profile: { struggles: [], working: [] } };
  const p = W.composeLeaderWidget(state, now);
  assert.equal(p.lead, null);
  assert.equal(p.previous.date, '2026-11-17');
  assert.equal(p.previous.title, 'Idea for 2026-11-17');
});

test('an entry dated after today is not today and not previous', () => {
  const now = at(2026, 11, 18, 6);
  const p = W.composeLeaderWidget({ daily: [entry('2026-11-16'), entry('2026-11-19')] }, now);
  assert.equal(p.lead, null);
  assert.equal(p.previous.date, '2026-11-16');
});

test('a broken entry is skipped; an unknown kind reads as an idea; no refs is null', () => {
  const now = at(2026, 11, 18, 9);
  const p = W.composeLeaderWidget({ daily: [entry('2026-11-16', { kind: 'shout', refs: [] }), entry('2026-11-17', { title: '  ' }), entry('2026-11-18', { line: '' })] }, now);
  assert.equal(p.lead, null);
  assert.equal(p.previous.date, '2026-11-16');
  assert.equal(p.previous.kind, 'idea');
  assert.equal(p.previous.src, null);
});

test('situation: counted by code, never the model\'s numbers; first sentence of stands', () => {
  const now = at(2026, 11, 18, 9);
  const state = {
    daily: [entry('2026-11-17')],
    profile: {
      struggles: [
        struggle('one', at(2026, 11, 10)),
        struggle('two', at(2026, 11, 15, 9)),
        struggle('done', at(2026, 11, 17), { resolvedAt: at(2026, 11, 17).toISOString() }),
      ],
      working: [],
    },
  };
  const s = W.composeLeaderWidget(state, now).situation;
  assert.deepEqual(s, {
    headline: SIT.headline, question: SIT.question, stands: 'The late shift is one short.', days: 3, openCount: 2,
  });
});

test('situation: the newest daily read that has one, even when today has none', () => {
  const now = at(2026, 11, 18, 9);
  const state = {
    daily: [entry('2026-11-15', { situation: { ...SIT, headline: 'Older' } }), entry('2026-11-16'), entry('2026-11-17', { situation: null })],
    profile: { struggles: [struggle('x', at(2026, 11, 18, 8))], working: [] },
  };
  const s = W.composeLeaderWidget(state, now).situation;
  assert.equal(s.headline, SIT.headline);
  assert.equal(s.days, 0);
});

test('situation: nothing open is null, whatever an old read says', () => {
  const now = at(2026, 11, 18, 9);
  const state = { daily: [entry('2026-11-17')], profile: { struggles: [struggle('x', at(2026, 11, 1), { resolvedAt: 'z' })], working: [] } };
  assert.equal(W.composeLeaderWidget(state, now).situation, null);
});

test('situation: open things but no read yet keeps the counts, words null', () => {
  const now = at(2026, 11, 18, 9);
  const state = { daily: [entry('2026-11-17', { situation: undefined })], profile: { struggles: [struggle('x', at(2026, 11, 17, 9))], working: [] } };
  assert.deepEqual(W.composeLeaderWidget(state, now).situation, { headline: null, question: null, stands: null, days: 1, openCount: 1 });
});

test('firstSentence', () => {
  assert.equal(W.firstSentence('One. Two.'), 'One.');
  assert.equal(W.firstSentence('He said "go." Then left.'), 'He said "go."');
  assert.equal(W.firstSentence('No stop here'), 'No stop here');
  assert.equal(W.firstSentence('Version 2.5 works. Then'), 'Version 2.5 works.');
  assert.equal(W.firstSentence('  '), null);
});

test('build: reads leader.json from its own data dir, never runs a model, reports the lane switch', async () => {
  const now = new Date();
  write({ daily: [entry(iso(now))], profile: { struggles: [], working: [] } });
  let p = await W.buildLeaderWidget({ now });
  assert.equal(p.lead.title, `Idea for ${iso(now)}`);
  assert.deepEqual(p.off, { lead: false, situation: false });
  fs.writeFileSync(path.join(dir, 'model-prefs.json'), JSON.stringify({ lanes: { 'leader-daily': { enabled: false } } }));
  p = await W.buildLeaderWidget({ now });
  assert.deepEqual(p.off, { lead: true, situation: true });
});

test('build: no file at all is an honest empty payload', async () => {
  const p = await W.buildLeaderWidget({ now: at(2026, 11, 18) });
  assert.deepEqual([p.lead, p.previous, p.situation], [null, null, null]);
});
