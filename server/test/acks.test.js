// THE ACK THAT HEARD HIM (15 Oct 2026, server/lib/acks.js). His note: the
// prebuilt quick replies "get old quickly and become too expected and
// premeditated because it is the same responses". These pin the three things
// that answer it: the ack says HIS thing back (the topic), it is never the
// same frame twice in a day until the set is spent and never the same sentence
// twice in a day at all, and a reflex, a verb, a thank-you or a two-word ask
// gets none.
//
// NOVA_DATA_DIR is set BEFORE import: a test without its own data dir writes
// into his live server/data (the 30-fake-greetings lesson).
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-acks-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { extractTopic, composeAck, readAckLedger, recordAck, nextAck, FRAMES, BARE_FRAMES } = await import('../lib/acks.js');
const ledgerFile = path.join(dataDir, 'voice', 'acks.json');

test.after(() => rm(dataDir, { recursive: true, force: true }));

test('the topic is his noun phrase, his "my" said back as "your"', () => {
  const cases = [
    ['can you check how my sleep has been this week', 'your sleep this week'],
    ['what should I do about my shoulder', 'your shoulder'],
    ["how did Tuesday's session go", "Tuesday's session"],
    ['Nova, how\'s my protein looking today?', 'your protein today'],
    ["what's on my calendar tomorrow", 'your calendar tomorrow'],
    ['how am I doing on protein', 'protein'],
    ['tell me about the Ryan conversation I have on Friday', 'the Ryan conversation'],
    ['can you pull up my bench press progress please', 'your bench press progress'],
    ['what do you think about my training volume over the last month', 'your training volume'],
    ['how was my HRV last night', 'your HRV last night'],
    ['remind me what I said about creatine', 'creatine'],
    ['what did the podcast say about zone 2 training', 'zone 2 training'],
    ['how should I handle the conflict with Sam at work', 'the conflict with Sam'],
    ['give me a summary of my week', 'summary of your week'],
    ['Evie, can you check the calibration of my targeting matrix?', 'the calibration'],
  ];
  for (const [q, want] of cases) assert.equal(extractTopic(q), want, q);
});

test('words with no thing in them give no topic, never a verb read out as a noun', () => {
  for (const q of ['should I deload next week', 'is it worth doing cardio before legs', 'what is it', 'why is that', 'can you help me with something']) {
    assert.equal(extractTopic(q), null, q);
  }
});

test('topics stay short: four words at most', () => {
  for (const q of ['can you look at my squat and bench and deadlift numbers from the last six weeks', 'pull up every recipe I saved from that Japanese cooking channel last month']) {
    const t = extractTopic(q);
    assert.ok(t === null || t.split(' ').length <= 4, `${q} → ${t}`);
  }
});

test('each lane has its own frames, and a frame without a topic', () => {
  const day = new Date('2026-10-15T09:00:00');
  const ask = composeAck({ question: 'can you check how my sleep has been this week', lane: 'ask', now: day });
  assert.ok(FRAMES.ask.some((f) => f.id === ask.id));
  assert.match(ask.text, /your sleep this week/i);
  const coach = composeAck({ question: 'what should I do about my shoulder', lane: 'coach', now: day });
  assert.match(coach.id, /^coach\./);
  assert.match(coach.text, /Coach/);
  assert.match(coach.text, /your shoulder/i);
  const leader = composeAck({ question: 'how should I handle the conflict with Sam at work', lane: 'leader', now: day });
  assert.match(leader.id, /^leader\./);
  assert.match(leader.text, /the conflict with Sam/);
  const bare = composeAck({ question: 'is it worth doing cardio before legs', lane: 'ask', now: day });
  assert.ok(BARE_FRAMES.ask.some((f) => f.id === bare.id), 'no topic: a bare frame');
  assert.equal(bare.topic, null);
  // any lane the router names that is not coach or leader is Nova's
  assert.match(composeAck({ question: 'can you check how my sleep has been', lane: 'research', now: day }).id, /^ask\./);
  // a consult to a known agent is said as one
  assert.match(composeAck({ question: 'can you check how my sleep has been', lane: 'ask', consult: 'researcher', now: day }).text, /the Researcher/);
});

test('"sir" lives in at most one frame per lane, and every template is five words or fewer', () => {
  for (const [lane, frames] of Object.entries(FRAMES)) {
    assert.ok(frames.filter((f) => /\bsir\b/i.test(f.t)).length <= 1, lane);
    for (const f of [...frames, ...BARE_FRAMES[lane]]) {
      const words = f.t.replace(/\{[Tt]opic\}|\{agent\}/g, '').split(/\s+/).filter((w) => /[a-z]/i.test(w));
      assert.ok(words.length <= 5, `${f.id}: ${f.t}`);
    }
  }
});

test('nothing for a reflex, a verb, small talk, or a short ask', () => {
  const q = 'can you check how my sleep has been this week';
  assert.equal(composeAck({ question: q, lane: 'reflex' }), null);
  assert.equal(composeAck({ question: q, lane: 'verb' }), null);
  for (const t of ['Perfect, thanks Nova', 'thank you', 'ok cheers mate', 'yes', 'good morning', 'hey nova']) assert.equal(composeAck({ question: t, lane: 'ask' }), null, t);
  assert.equal(composeAck({ question: 'my sleep?', lane: 'ask' }), null, 'under 12 characters');
});

test('across 20 asks in one day: no frame twice until the set is spent, never one twice running, never a sentence twice', async () => {
  await rm(ledgerFile, { force: true });
  const now = new Date('2026-10-15T08:00:00');
  const questions = [
    'can you check how my sleep has been this week', 'what should I do about my shoulder', "how did Tuesday's session go",
    "what's on my calendar tomorrow", 'how am I doing on protein', 'can you pull up my bench press progress please',
    'how was my HRV last night', 'remind me what I said about creatine', 'what did the podcast say about zone 2 training',
    'give me a summary of my week', 'how is my squat tracking', 'what about my deadlift', 'check my steps today please',
    'tell me about my weight trend', 'how did my run go', "what's my resting heart rate been",
    'can you look at my macros for today', 'how is my recovery looking', 'pull up my last chest session', 'show me my journal from Monday',
  ];
  const got = [];
  for (const q of questions) {
    const a = await nextAck({ question: q, lane: 'ask', now });
    if (a) got.push(a);
  }
  assert.ok(got.length >= 18, `most asks get an ack (${got.length})`);
  const texts = got.map((a) => a.text.toLowerCase());
  assert.equal(new Set(texts).size, texts.length, 'never the same sentence twice in a day');
  const ids = got.map((a) => a.id);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `frame twice running at ${i}`);
  // the first full set: every frame once before any repeats
  const n = FRAMES.ask.length;
  const topical = got.filter((a) => !a.id.includes('.bare.')).map((a) => a.id);
  assert.equal(new Set(topical.slice(0, n)).size, Math.min(n, topical.slice(0, n).length), 'no frame repeats inside one rotation');
  const led = JSON.parse(await readFile(ledgerFile, 'utf8'));
  assert.equal(led.day, '2026-10-15');
  assert.equal(led.texts.length, got.length);
});

test('the same question asked again the same day gets a different sentence, and silence once every one is spent', async () => {
  await rm(ledgerFile, { force: true });
  const now = new Date('2026-10-15T08:00:00');
  const q = 'what should I do about my shoulder';
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const a = await nextAck({ question: q, lane: 'coach', now });
    if (!a) break;
    seen.push(a.text);
  }
  assert.equal(new Set(seen).size, seen.length, 'each sentence once');
  assert.equal(seen.length, FRAMES.coach.length + BARE_FRAMES.coach.length, 'every topic frame, then every bare one');
  assert.equal(await nextAck({ question: q, lane: 'coach', now }), null, 'then silence, never a repeat');
});

test('the ledger is his local day: a new day starts empty', async () => {
  await rm(ledgerFile, { force: true });
  const today = new Date('2026-10-15T23:30:00');
  const a = await nextAck({ question: 'can you check how my sleep has been this week', lane: 'ask', now: today });
  assert.equal(readAckLedger(today).used.length, 1);
  const tomorrow = new Date('2026-10-16T00:10:00');
  assert.deepEqual(readAckLedger(tomorrow), { day: '2026-10-16', used: [], texts: [] });
  const b = await nextAck({ question: 'can you check how my sleep has been this week', lane: 'ask', now: tomorrow });
  assert.ok(b, 'yesterday\'s sentences are free again');
  const led = JSON.parse(await readFile(ledgerFile, 'utf8'));
  assert.equal(led.day, '2026-10-16');
  assert.deepEqual(led.texts, [b.text]);
  assert.ok(a.text);
});

test('a broken ledger file reads as an empty day, never a crash', async () => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(ledgerFile), { recursive: true });
  await writeFile(ledgerFile, '{not json', 'utf8');
  const now = new Date('2026-10-15T10:00:00');
  assert.deepEqual(readAckLedger(now), { day: '2026-10-15', used: [], texts: [] });
  await recordAck({ id: 'ask.pull', text: 'Pulling x.' }, now);
  assert.deepEqual(readAckLedger(now).used, ['ask.pull']);
});
