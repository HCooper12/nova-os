// HOW A TURN IS TAKEN (src/turnFold.js, server/lib/talk.js, src/greetDue.js;
// design/TALK-STUDY.md, his ask of 21 Oct 2026).
// Pins: the MORE fold (the turn said, the rest held, machinery kept with the
// turn), the stream never showing the rest or a half-typed mark, "go on"
// and only a closed set of words revealing it, the turn rules last before
// his words for Nova, the Coach and the Leader and never for a consulted or
// one-shot turn, the settle putting the rest on `more`, and the doorman
// greeting only an arrival (the 20 Oct pattern: every three hours to an
// empty room, twice per return across two devices).
//
// NOVA_DATA_DIR is set BEFORE any import (the 30-fake-greetings lesson).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-turns-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-turns-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { foldReply, cutHeld, asksForRest } = await import('../../src/turnFold.js');
const { greetDue, standsDown, notePresence, RETURN_GAP_MS } = await import('../../src/greetDue.js');
const { TURN_TAKING } = await import('../lib/talk.js');
const { buildAskPrompt, buildCoachPrompt, buildLeaderPrompt, buildGreetingPrompt, settleAskReply } = await import('../lib/claudeCode.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('a MORE line splits the turn he hears from the rest that is held', () => {
  const r = foldReply('Bench is up 5 kg in a month.\nWant the breakdown?\nMORE\nWeek one you did 80 × 6.\n\nWeek four, 85 × 6.');
  assert.equal(r.said, 'Bench is up 5 kg in a month.\nWant the breakdown?');
  assert.equal(r.held, 'Week one you did 80 × 6.\n\nWeek four, 85 × 6.');
});

test('directives and document tokens after the mark stay with the turn; VIS lines in the rest are dropped', () => {
  const r = foldReply('Drafted the swap.\nMORE\nVIS {"kind":"key","label":"WHY"}\nThe seated raise spares your back.\n[[artifact:abc-123]]\nPROPOSE {"kind":"capture","text":"x"}');
  assert.equal(r.said, 'Drafted the swap.\n[[artifact:abc-123]]\nPROPOSE {"kind":"capture","text":"x"}');
  assert.equal(r.held, 'The seated raise spares your back.');
});

test('no mark, an empty rest, or a mark with nothing before it: nothing is held and nothing is lost', () => {
  assert.deepEqual(foldReply('Just this.'), { said: 'Just this.', held: null });
  assert.equal(foldReply('Just this.\nMORE\n').held, null);
  const lead = foldReply('MORE\nEverything came after it.');
  assert.equal(lead.held, null);
  assert.equal(lead.said, 'Everything came after it.');
  // "More" in a sentence is a word, not the mark
  assert.equal(foldReply('More protein would help.\nMore sleep too.').held, null);
});

test('a reply still arriving never shows the rest, nor a half-typed mark', () => {
  assert.equal(cutHeld('Short answer.\nMORE\nThe long part'), 'Short answer.');
  assert.equal(cutHeld('Short answer.\nMO'), 'Short answer.');
  assert.equal(cutHeld('Short answer.\nM'), 'Short answer.');
  assert.equal(cutHeld('Short answer.\nMaybe'), 'Short answer.\nMaybe');
  assert.equal(cutHeld('Short answer.'), 'Short answer.');
});

test('"go on" reveals the rest; a bare yes only after an offer and never over a waiting decision', () => {
  const line = { text: 'Bench is up 5 kg. Want the breakdown?', more: 'Week one…' };
  for (const w of ['go on', 'Go on.', 'tell me more', 'yeah, go on', 'the rest', 'what else?', 'Nova, keep going', 'more please']) {
    assert.equal(asksForRest(w, line), true, w);
  }
  assert.equal(asksForRest('yes', line), true, 'the turn offered the rest');
  assert.equal(asksForRest('yes', line, { pending: true }), false, 'a draft is waiting: the yes is for it');
  assert.equal(asksForRest('yes', { text: 'Bench is up 5 kg.', more: 'x' }), false, 'no offer, no reveal on a bare yes');
  assert.equal(asksForRest('go on, what about squat', line), false, 'a new question goes to the model');
  assert.equal(asksForRest('go on', { ...line, moreSaid: true }), false, 'said once');
  assert.equal(asksForRest('go on', { text: 'x' }), false, 'nothing held');
});

test('the turn rules ride last before his words, for Nova, the Coach and the Leader', () => {
  for (const p of [
    buildAskPrompt({ question: 'how is my bench', context: 'c' }),
    buildCoachPrompt({ question: 'how is my bench', context: 'c' }),
    buildLeaderPrompt({ question: 'my week', context: 'c' }),
  ]) {
    assert.ok(p.startsWith('NOVA OPERATING LENS'), 'the lens still leads');
    const at = p.indexOf(TURN_TAKING);
    assert.ok(at > 0, 'the rules are in the prompt');
    assert.match(p.slice(at + TURN_TAKING.length).trim(), /^Hayden (asks|says):/, 'and nothing else sits between them and his words');
  }
  assert.match(TURN_TAKING, /^.*MORE/m, 'the rules name the shared mark');
});

test('a consulted turn and the hands-free one-shot carry no turn rules', () => {
  assert.ok(!buildAskPrompt({ question: 'q', context: 'c', direct: true }).includes(TURN_TAKING), 'Siri hears one reply and no rest');
  assert.ok(!buildAskPrompt({ question: 'q', context: 'c', consulted: { by: 'coach', question: 'q' } }).includes(TURN_TAKING));
  assert.ok(!buildCoachPrompt({ question: 'q', context: 'c', consulted: { by: 'nova', question: 'q' } }).includes(TURN_TAKING));
});

test('the settle says the turn and puts the rest on `more`; the one-shot drops it', async () => {
  const job = { id: 't1', status: 'running' };
  await settleAskReply(vault, 'Bench is up 5 kg this month. Want the breakdown?\nMORE\nWeek one was 80 kg for six.', job, { question: 'how is my bench' });
  assert.equal(job.status, 'ready', job.error);
  assert.equal(job.result.text, 'Bench is up 5 kg this month. Want the breakdown?');
  assert.equal(job.result.more, 'Week one was 80 kg for six.');
  const direct = { id: 't2', status: 'running' };
  await settleAskReply(vault, 'Up 5 kg.\nMORE\nWeek one was 80 kg.', direct, { question: 'how is my bench', direct: true });
  assert.equal(direct.result.text, 'Up 5 kg.');
  assert.equal(direct.result.more, null);
});

test('a return greeting is a few words and carries no Inbox count; a new day stays short', () => {
  const back = buildGreetingPrompt({ facts: 'f', gap: 'return' });
  assert.match(back, /under 15 words/);
  assert.match(back, /No Inbox counts/);
  assert.match(buildGreetingPrompt({ facts: 'f' }), /under 30 words/);
});

const H = 3600e3;
const today = 'Tue Oct 20 2026';

test('the doorman does not greet an empty room: an open page with nobody at it stays quiet', () => {
  const now = Date.parse('2026-10-20T02:05:00+11:00');
  // the 20 Oct pattern: greeted at 23:05, page left open, a sync at 02:05
  const last = { date: today, at: now - 3 * H - 60e3 };
  assert.equal(greetDue({ now, today, last, presenceAt: now - 3 * H - 60e3, awayFrom: 0 }), null);
  assert.equal(greetDue({ now, today: 'Wed Oct 21 2026', last, presenceAt: now - 5 * 3600e3 }), null, 'not even at the day change');
  assert.equal(greetDue({ now, today, last: {}, presenceAt: now, visible: false }), null, 'a hidden page is nobody');
});

test('his first arrival of the day, and a real return after three quiet hours, are greeted', () => {
  const now = Date.parse('2026-10-20T08:18:00+11:00');
  assert.equal(greetDue({ now, today, last: { date: 'Mon Oct 19 2026', at: now - 10 * H }, presenceAt: now }), 'new-day');
  const p = notePresence({ now, prevAt: now - 4 * H });
  assert.equal(p.awayFrom, now - 4 * H, 'the gap opened a return');
  assert.equal(greetDue({ now, today, last: { date: today, at: now - 5 * H }, ...p }), 'return');
  // a touch an hour after the last one is not a return
  const q = notePresence({ now, prevAt: now - H });
  assert.equal(greetDue({ now, today, last: { date: today, at: now - 5 * H }, ...q }), null);
});

test('one hello per return across his devices: the second device stands down', () => {
  const now = Date.now();
  assert.equal(standsDown('return', { greet: { at: new Date(now - 4 * 60e3).toISOString() } }, now), true, 'the phone said it four minutes ago');
  assert.equal(standsDown('return', { greet: { at: new Date(now - RETURN_GAP_MS - 1).toISOString() } }, now), false);
  assert.equal(standsDown('new-day', { today: 'd', greet: { date: 'd' } }, now), true);
  assert.equal(standsDown('new-day', { today: 'd', briefedToday: true }, now), true);
  assert.equal(standsDown('return', null, now), false, 'no word from the server: this device decides');
});
