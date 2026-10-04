// RED WHEN NOVA PUSHES BACK, his call on 4 Oct 2026: when Nova disagrees with
// or advises against something he proposed or asked to do, that sentence is
// shown in red while it is spoken (the core, its subtitle underline, the
// label "Pushing back"); the reasons after it return to the speaking colour.
// Red means that and nothing else.
//
// The model NAMES the stance (`VIS {"stance":"contest"}` on its own line,
// before the sentence); code binds it to that one sentence and draws it. What
// this file pins, in the order the reply travels:
//   1. the parser: a stance is out of the words, bound to the sentence after
//      it, and is never a beat (never a panel, never counted, never fetched);
//   2. the contract the agents are given, and the reminders that restate it;
//   3. the binding: each spoken piece carries its stance, the captions keep
//      it, and `contest` is on exactly while that sentence is in the air
//      (on the captions' own clock, so the core and the subtitles agree);
//   4. the view-model fields: novaThread.contest, novaContest, novaThinking;
//   5. the client's strip paths (the speech queue and captions, the thread
//      line, the Coach and Leader logs), and the Coach/Leader read-back.
// The server's strip paths, which need a stubbed model, are in
// stanceStrip.test.js.
//
// Its own NOVA_DATA_DIR BEFORE anything is imported (agentSessions writes a
// receipt there); project modules are imported dynamically below it.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-stance-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const { parseVisualStream, normaliseStance, STANCES } = await import('../../src/visualBeats.js');
const { hostOf, marksOfHost } = await import('../../src/glassMarks.js');
const { stanceOfSpan, glassOf, dataStage } = await import('../../src/glassBeats.js');
const { noteSpokenSentence, spokenSentences, cutSpeech, beginReply, onSpeech, stanceNow, _resetSpeechClock } = await import('../../src/speechClock.js');
const { thinkingOf, contestOf, stateOf } = await import('../../src/novaThreadFacts.js');
const { valsNovaThread } = await import('../../src/vals/valsNovaThread.js');
const { valsChrome } = await import('../../src/vals/valsChrome.js');
const { streamShown } = await import('../../src/artifactClient.js');
const { speakableText } = await import('../../src/artifactBlocks.js');
const { toSpokenProse } = await import('../../src/spokenProse.js');
const { bubbleProse } = await import('../../src/bubbleProse.js');
const { GLASS_CONTRACT, attachVisuals } = await import('../lib/visualStream.js');
const { buildAskPrompt, buildCoachPrompt, buildLeaderPrompt, buildResumedAsk } = await import('../lib/claudeCode.js');
const { cleanTurnText, recordAgentSession, agentConversationContext, projectSlug } = await import('../lib/agentSessions.js');

// A reply shaped like the real thing: a panel, the line that acknowledges
// him, the line that pushes back, and the reason.
const RAW = [
  'VIS {"kind":"key","label":"THE ASK","caption":"a sixth training day"}',
  'I hear you on adding a sixth day.',
  'VIS {"stance":"contest"}',
  'I would not add it this block.',
  'Your sleep has averaged six hours, and recovery is the limit.',
].join('\n');
const CONTEST = 'I would not add it this block.';

// "leaks nothing": no directive word, no stance, no JSON
function assertClean(s, where) {
  const t = String(s ?? '');
  assert.doesNotMatch(t, /VIS/, `${where}: the directive word leaked: ${JSON.stringify(t)}`);
  assert.doesNotMatch(t, /stance|contest/i, `${where}: the stance leaked: ${JSON.stringify(t)}`);
  assert.doesNotMatch(t, /[{}]|"\w+":/, `${where}: JSON leaked: ${JSON.stringify(t)}`);
}

// App.attachAskPoll's speech queue, modelled line for line (the source
// contracts below pin that App still reads this way): the trailing-directive
// strip, then one sentence per piece with its offset and stance.
const stripShow = (t) => t.replace(/(^|\n)\s*(SHOW|PROPOSE|RESEARCH|CONSULT)\s*(\{[\s\S]*)?$/, '');
function streamPieces(text, stream, flushAll) {
  const out = [];
  const fresh = text.slice(stream.spokenUpTo);
  if (!fresh) return out;
  const startedAt = stream.spokenUpTo;
  if (flushAll) {
    const pieces = fresh.match(/[^.!?]*[.!?]+[\s]*|[^.!?]+$/g) || [fresh];
    let off = startedAt;
    for (const p of pieces) { if (p.trim()) out.push({ t: p, from: off, stance: stanceOfSpan(stream.stances, text, off, off + p.length) }); off += p.length; }
    stream.spokenUpTo = text.length;
    return out;
  }
  const m = fresh.match(/[\s\S]*[.!?](?=\s|$)/);
  if (m) {
    let off = startedAt;
    for (const p of m[0].match(/[\s\S]*?[.!?](?=\s|$)\s*/g) || [m[0]]) { if (p.trim()) out.push({ t: p, from: off, stance: stanceOfSpan(stream.stances, text, off, off + p.length) }); off += p.length; }
    stream.spokenUpTo += m[0].length;
  }
  return out;
}
// the reply arriving a few characters at a time, as the 150ms poll sees it
function streamReply(raw, step = 7) {
  const stream = { spokenUpTo: 0, stances: [] };
  const said = [];
  for (let n = step; n < raw.length + step; n += step) {
    const seen = parseVisualStream(streamShown(raw.slice(0, Math.min(n, raw.length))));
    stream.stances = seen.stances;
    const shown = stripShow(seen.text);
    if (shown) said.push(...streamPieces(shown, stream, false));
  }
  // onReady: the finished reply, as the server strips it, flushed
  said.push(...streamPieces(parseVisualStream(raw).text, stream, true));
  return said;
}

// --------------------------------------------------------- 1. the parser --

test('THE STANCE: a contest line leaves the words, binds to the sentence after it, and is never a beat', () => {
  const r = parseVisualStream(RAW);
  assert.equal(r.text, `I hear you on adding a sixth day.\n${CONTEST}\nYour sleep has averaged six hours, and recovery is the limit.`);
  assert.deepEqual(r.stances, [{ at: r.text.indexOf(CONTEST), stance: 'contest' }]);
  assert.equal(r.beats.length, 1, 'the key panel, and nothing for the stance');
  assert.equal(r.beats[0].spec.kind, 'key');
  assert.deepEqual(STANCES, ['contest']);
});

test('a stance never counts as a panel, never moves a panel\'s key, and never cuts a light off its panel', () => {
  const lines = [
    'VIS {"panel":"session","date":"2026-09-28","by":"coach"}',
    'VIS {"mark":{"lift":"Bench press"}}',
    'Your bench moved up last week.',
    'VIS {"stance":"contest"}',
    'VIS {"mark":{"lift":"Bench press","set":3}}',
    'I would not add a fourth set to it.',
    'VIS {"kind":"key","label":"WHY","caption":"set three already ground"}',
    'Set three was already a grind.',
  ];
  const a = parseVisualStream(lines.join('\n'));
  const b = parseVisualStream(lines.filter((l) => !l.includes('stance')).join('\n'));
  assert.equal(a.beats.length, 4, 'a session, two lights and a key panel: four beats, as without it');
  assert.deepEqual(a.beats.map((x) => x.key), b.beats.map((x) => x.key), 'every key exactly as without the stance');
  assert.ok(a.beats.every((x) => x.spec.kind !== 'stance' && !('stance' in x.spec)));
  // the second light still finds its panel, and the panel still counts two
  assert.equal(hostOf(a.beats, 2), 0);
  assert.deepEqual(marksOfHost(a.beats, 0), [1, 2]);
  const stage = dataStage(a.beats, 2, { visuals: {}, text: a.text, spokenTo: a.text.indexOf('Set three') });
  assert.equal(stage.n, 2);
  assert.equal(stage.total, 2, '"2 of 2", never "2 of 3"');
  assert.equal(a.stances.length, 1);
  assert.ok(a.text.slice(a.stances[0].at).startsWith('I would not add a fourth set'));
});

test('the glass never shows a stance: at every point of the reply the hero is a panel the model named', () => {
  const r = parseVisualStream(RAW);
  for (let to = 1; to <= r.text.length; to++) {
    const g = glassOf({ glassBeats: r.beats, glassVisuals: {}, glassSpokenTo: to, voiceChat: [{ who: 'nova', text: r.text }] }, null);
    assert.equal(g.hero.kind, 'key', `at ${to}`);
    assert.deepEqual(g.rail, []);
  }
});

test('only "contest" is a stance; any other value changes nothing', () => {
  for (const v of ['agree', 'disagree', 'pushback', '', null, 3, true, { contest: true }, ['contest']]) {
    const r = parseVisualStream(`VIS ${JSON.stringify({ stance: v })}\nFine by me.`);
    assert.deepEqual(r.stances, [], JSON.stringify(v));
    assert.deepEqual(r.beats, [], JSON.stringify(v));
    assert.equal(r.text, 'Fine by me.');
  }
  assert.equal(normaliseStance(' Contest '), 'contest', 'the same word, however it is cased');
  assert.equal(normaliseStance('contested'), null);
});

test('a stance line raises no panel however it reads; a panel line that also carries one keeps its panel', () => {
  const alone = parseVisualStream('VIS {"stance":"contest","caption":"I disagree","label":"PUSHING BACK"}\nNo.');
  assert.deepEqual(alone.beats, [], 'no key panel inferred from a stray caption');
  assert.equal(alone.stances.length, 1);
  const both = parseVisualStream('VIS {"kind":"key","label":"NOT YET","caption":"no sixth day","stance":"contest"}\nNot this block.');
  assert.equal(both.beats.length, 1, 'the stance never replaces the panel');
  assert.equal(both.beats[0].spec.kind, 'key');
  assert.ok(!('stance' in both.beats[0].spec));
  assert.deepEqual(both.stances, [{ at: 0, stance: 'contest' }]);
});

test('streamed a keystroke at a time, a stance line never reaches the voice, and its place never moves', () => {
  for (let n = 1; n <= RAW.length; n++) assertClean(parseVisualStream(RAW.slice(0, n)).text, `prefix ${n}`);
  const typing = parseVisualStream('I hear you.\nVIS {"stance":"cont');
  assert.equal(typing.truncated, true, 'held whole while typed');
  assert.equal(typing.text, 'I hear you.\n');
  assert.deepEqual(typing.stances, []);
  const head = RAW.slice(0, RAW.indexOf(CONTEST) + 5);
  const at = parseVisualStream(head).stances[0].at;
  assert.equal(parseVisualStream(RAW).stances[0].at, at, 'the offset does not slide as the reply grows');
});

test('the server never fetches, resolves or checks a stance', () => {
  const logged = [];
  const job = attachVisuals({}, { vaultPath: null, log: (m) => logged.push(m) });
  job.onPartial('VIS {"stance":"contest"}\nI would not add it.');
  job.onPartial(RAW);
  assert.deepEqual(job.visuals, {}, 'nothing fetched');
  assert.deepEqual(job.markChecks, {}, 'nothing checked as a mark');
  assert.deepEqual(logged, [], 'nothing dropped as a mark with no panel');
});

// ------------------------------------------------------- 2. the contract --

test('the contract teaches the stance, and the line it teaches is the shape the parser reads', () => {
  assert.match(GLASS_CONTRACT, /WHEN YOU PUSH BACK/);
  assert.match(GLASS_CONTRACT, /write VIS \{"stance":"contest"\} on its own line immediately before each sentence that disagrees with, or advises against, something he proposed or asked to do; one line per such sentence/);
  assert.match(GLASS_CONTRACT, /Never mark bad news, a missed target, or a correction of a fact when he has not proposed anything/);
  assert.match(GLASS_CONTRACT, /The sentences that give your reasons carry no stance line/);
  assert.match(GLASS_CONTRACT, /Name the disagreement plainly in the words too/);
  assert.match(GLASS_CONTRACT, /so the colour is never the only signal/);
  assert.match(GLASS_CONTRACT, /A stance line raises no panel and does not count as one/);
  assert.ok(!GLASS_CONTRACT.includes('`'), 'a backtick in the template literal took the live service down once');
  const line = GLASS_CONTRACT.match(/VIS \{"stance":"contest"\}/)[0];
  const r = parseVisualStream(`${line}\nI would not add a sixth day.`);
  assert.deepEqual(r.stances, [{ at: 0, stance: 'contest' }]);
  assert.deepEqual(r.beats, []);
  assert.equal(r.text, 'I would not add a sixth day.');
});

test('every agent given the glass is given the rule, and the Coach and the Leader are reminded each turn', () => {
  for (const [name, p] of [
    ['ask', buildAskPrompt({ question: 'q', context: 'c' })],
    ['coach', buildCoachPrompt({ question: 'q', context: 'c' })],
    ['leader', buildLeaderPrompt({ question: 'q', context: 'c' })],
  ]) assert.ok(p.includes('WHEN YOU PUSH BACK'), `${name} was not told`);
  // a long session compacts turn one away; the reminders carry the syntax
  const src = read('server/lib/claudeCode.js');
  const coach = src.slice(src.indexOf('const COACH_TURN_REMINDER = ['), src.indexOf("].join('\\n');", src.indexOf('const COACH_TURN_REMINDER = [')));
  const leader = src.slice(src.indexOf('const LEADER_TURN_REMINDER = '), src.indexOf('\n', src.indexOf('const LEADER_TURN_REMINDER = ')));
  for (const [name, block] of [['coach', coach], ['leader', leader]]) {
    assert.match(block, /PUSHING BACK: VIS \{"stance":"contest"\} on its own line immediately before each sentence that disagrees with, or advises against, what he proposed or asked to do; never before your reasons, bad news or a missed target, and say the disagreement in words too\./, name);
  }
  // the resumed spoken turn stays the bare question (spokenSession.test.js)
  assert.doesNotMatch(buildResumedAsk({ question: 'q' }), /stance/);
});

// -------------------------------------------------------- 3. the binding --

test('each sentence queued for the voice carries its stance: the one that pushes back, and no other', () => {
  const said = streamReply(RAW);
  assert.deepEqual(said.map((p) => p.t.trim()), ['I hear you on adding a sixth day.', CONTEST, 'Your sleep has averaged six hours, and recovery is the limit.']);
  assert.deepEqual(said.map((p) => p.stance), [null, 'contest', null]);
  // every arrival rate binds it the same way
  for (const step of [1, 3, 11, 40, RAW.length]) {
    const s = streamReply(RAW, step);
    assert.deepEqual(s.filter((p) => p.stance).map((p) => p.t.trim()), [CONTEST], `step ${step}`);
  }
});

test('the flush-all splitter cuts "9.5 kg" in two; both halves are the sentence that pushes back', () => {
  const raw = 'Fine by me.\nVIS {"stance":"contest"}\nI would not go past 9.5 kg on it this week.\nThe last two sessions ground.';
  const said = streamPieces(parseVisualStream(raw).text, { spokenUpTo: 0, stances: parseVisualStream(raw).stances }, true);
  assert.deepEqual(said.map((p) => [p.t.trim(), p.stance]), [
    ['Fine by me.', null], ['I would not go past 9.', 'contest'], ['5 kg on it this week.', 'contest'], ['The last two sessions ground.', null],
  ]);
});

test('a stance whose sentence has not arrived marks nothing, and one before any sentence marks the first', () => {
  const t = 'I hear you.\n';
  assert.equal(stanceOfSpan([{ at: t.length, stance: 'contest' }], t, 0, t.length - 1), null);
  const first = parseVisualStream('VIS {"stance":"contest"}\nNo sixth day. Here is why.');
  assert.equal(stanceOfSpan(first.stances, first.text, 0, 14), 'contest');
  assert.equal(stanceOfSpan(first.stances, first.text, 14, first.text.length), null);
  assert.equal(stanceOfSpan([{ at: 0, stance: 'agree' }], 'No.', 0, 3), null, 'only contest');
});

test('the stance in the air is the newest sentence\'s: on for the pushback, off for the reason, off when he cuts in or a new reply starts', () => {
  _resetSpeechClock();
  const said = streamReply(RAW);
  const seen = [];
  let at = 0;
  for (const p of said) {
    // as App.drainTtsQueue notes each sentence the instant its audio starts
    noteSpokenSentence(toSpokenProse(speakableText(p.t, { final: true })), 1500, { at, stance: p.stance });
    seen.push(stanceNow());
    at += 1500;
  }
  assert.deepEqual(seen, [null, 'contest', null], 'the reasons return to the speaking colour');
  // he cuts in mid-pushback: the rest was never said, and it is not red
  _resetSpeechClock();
  noteSpokenSentence(CONTEST, 1500, { at: 0, stance: 'contest' });
  assert.equal(stanceNow(), 'contest');
  cutSpeech(400);
  assert.equal(stanceNow(), null);
  // a new reply starts clean
  noteSpokenSentence(CONTEST, 1500, { at: 5000, stance: 'contest' });
  beginReply();
  assert.equal(stanceNow(), null);
  assert.equal(stanceNow([]), null);
  _resetSpeechClock();
});

test('contestOf: red only while Nova is speaking a sentence in the air that pushes back', () => {
  assert.equal(contestOf({ voiceSpeaking: true, voiceStance: 'contest' }), true);
  assert.equal(contestOf({ voiceSpeaking: false, voiceStance: 'contest' }), false, 'red only while it is spoken');
  assert.equal(contestOf({ voiceSpeaking: true, voiceStance: null }), false);
  assert.equal(contestOf({ voiceSpeaking: true, voiceStance: 'agree' }), false);
  assert.equal(contestOf(null), false);
});

test('the captions keep the stance: a sentence that pushes back says so, every other says null', () => {
  _resetSpeechClock();
  noteSpokenSentence('I hear you on adding a sixth day.', 1500, { at: 0 });
  noteSpokenSentence(CONTEST, 1500, { at: 1500, stance: 'contest' });
  noteSpokenSentence('Your sleep has averaged six hours.', 1500, { at: 3000, stance: 'agree' });
  assert.deepEqual(spokenSentences().map((s) => s.stance), [null, 'contest', null]);
  cutSpeech(3200);
  assert.equal(spokenSentences()[1].stance, 'contest');
  _resetSpeechClock();
  noteSpokenSentence(CONTEST, 1500, { at: 0, stance: 'contest' });
  cutSpeech(500);
  assert.equal(spokenSentences()[0].stance, 'contest', 'a cut keeps what the sentence was');
  _resetSpeechClock();
});

test('App wires it: the poll keeps the stances, every piece carries its own, both voices hand it to the captions, and state mirrors the clock', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import \{ stanceOfSpan \} from '\.\/glassBeats\.js';/);
  assert.match(app, /const seen = parseVisualStream\(streamShown\(job\.partial\)\);\n\s*this\.setGlassBeats\(seen\.beats\);\n(?:\s*\/\/[^\n]*\n)*\s*stream\.stances = seen\.stances;\n\s*const shown = stripShow\(seen\.text\);/);
  assert.match(app, /const stream = \{ spokenUpTo: 0, stances: \[\] \};/);
  // both splitters, exactly as streamPieces above models them
  assert.match(app, /const pieces = fresh\.match\(\/\[\^\.!\?\]\*\[\.!\?\]\+\[\\s\]\*\|\[\^\.!\?\]\+\$\/g\) \|\| \[fresh\];\n\s*let off = startedAt;\n\s*for \(const p of pieces\) \{ if \(p\.trim\(\)\) say\(p, off, stanceOfSpan\(stream\.stances, text, off, off \+ p\.length\)\); off \+= p\.length; \}/);
  assert.match(app, /for \(const p of m\[0\]\.match\(\/\[\\s\\S\]\*\?\[\.!\?\]\(\?=\\s\|\$\)\\s\*\/g\) \|\| \[m\[0\]\]\) \{ if \(p\.trim\(\)\) say\(p, off, stanceOfSpan\(stream\.stances, text, off, off \+ p\.length\)\); off \+= p\.length; \}/);
  assert.match(app, /const stripShow = \(t\) => t\.replace\(\/\(\^\|\\n\)\\s\*\(SHOW\|PROPOSE\|RESEARCH\|CONSULT\)\\s\*\(\\\{\[\\s\\S\]\*\)\?\$\/, ''\);/);
  // the sentence, to whichever voice speaks it
  assert.match(app, /const say = \(t, from = null, stance = null\) => \{/);
  assert.match(app, /if \(elevenPath\) this\.speakTtsSentence\(heard, onPlay, \{ stance \}\);\n\s*else \{ this\.speakIncremental\(heard, \{ stance \}\); onPlay\(\); \}/);
  assert.match(app, /speakTtsSentence\(text, onPlay, \{ stance = null \} = \{\}\) \{/);
  assert.match(app, /if \(!conn \|\| !this\.ttsUsable\(\)\) \{ onPlay\?\.\(\); this\.speakIncremental\(clean, \{ stance \}\); return; \}/);
  assert.match(app, /const entry = \{ done: false, buffer: null, blob: null, onPlay, revealed: false, said: clean, stance \};/);
  assert.match(app, /this\.endSpeech\(\); this\.drainTtsQueue\(gen\);\n\s*\}, \{ stance: head\.stance \}\);/, 'the engine failed: the phone\'s voice says it, stance and all');
  assert.match(app, /speakIncremental\(text, \{ stance = null \} = \{\}\) \{[\s\S]{0,160}this\.speakFallback\(text, \(\) => this\.endSpeech\(\), \{ stance \}\);/);
  assert.match(app, /speakFallback\(text, finish, \{ stance = null \} = \{\}\) \{/);
  // the stance in the air, mirrored into state from the captions' clock (one
  // render per change), and cleared with the speaking, ended or stopped
  assert.match(app, /voiceStance: null,\n/);
  assert.match(app, /this\.offSpeechStance = onSpeech\(\(list\) => \{\n\s*const v = stanceNow\(list\);\n\s*if \(\(this\.state\.voiceStance \|\| null\) !== v\) this\.setState\(\{ voiceStance: v \}\);\n\s*\}\);/);
  assert.match(app, /this\.offSpeechStance\?\.\(\);/, 'unsubscribed on unmount');
  assert.match(app, /if \(this\.speechActive === 0\) \{[\s\S]{0,700}this\.setState\(\{ voiceSpeaking: false, voiceStance: null \}, \(\) => \{/);
  assert.match(app, /stopSpeaking\(\) \{[\s\S]{0,600}if \(this\.state\.voiceSpeaking \|\| this\.state\.voiceStance\) this\.setState\(\{ voiceSpeaking: false, voiceStance: null \}\);/);
  // and the stance is never app glass state: it lives on the sentence
  assert.doesNotMatch(app, /glassStances/);
});

// ------------------------------------------------- 4. the view-model fields --

const T0 = new Date('2026-10-04T09:00:00+10:00').getTime();
function fakeApp(state = {}) {
  const app = {
    renders: 0,
    state: {
      novaStyle: 'summary', screen: 'voice', connectionStatus: 'connected', voiceSpeaking: false, voiceBusy: false,
      glassBeats: [], glassVisuals: {}, glassSpokenTo: 0, orbInput: '', coreStyle: 'filament',
      voiceChat: [], orbChat: [], voiceHearing: {}, voiceStance: null,
      ...state,
    },
    setState(p) { const x = typeof p === 'function' ? p(this.state) : p; if (x) { this.state = { ...this.state, ...x }; this.renders++; } },
    navigate() {}, speakTtsSentence() {}, startLiveTalk() {},
  };
  return app;
}
const vOf = () => ({
  glass: null, briefQueue: null, speechBlocked: null, voiceEngineLabel: 'NOVA · DEFAULT', voiceEngineDetail: '',
  wakeWordSupported: false, wakeWordOn: false, setWakeWord: () => {}, briefMe: () => {}, ritualInvite: null, voiceLive: true,
  voiceContinuing: false, newVoiceChat: () => {}, voiceChatUndo: null, undoNewVoiceChat: () => {}, setTypedInputValue: () => {}, sendOrb: () => {},
  routePreview: () => ({ lane: 'ask' }), attach: { pending: [] }, openCaptureSheet: null,
});
const chromeCtx = {
  demoMode: false, isOffline: false, go: () => () => {}, warm: () => () => {}, userName: 'Hayden', wakeWord: false,
  usingLiveRecipes: false, usingLiveWorkouts: false, liveRoutines: [], usingLiveNotes: false, journalDays: [], shoppingItems: [],
  statusChip: {}, agentsLiveCount: 0, inboxPendingCount: 0,
};
// Nova mid-reply, with the stance of the sentence in the air
const speaking = (stance) => {
  const r = parseVisualStream(RAW);
  return { voiceSpeaking: true, voiceStance: stance, glassBeats: r.beats, voiceChat: [{ at: T0, who: 'you', text: 'Should I add a sixth day?' }, { at: T0 + 1, who: 'nova', text: r.text, streaming: true }] };
};

test('novaThread.contest: on while the sentence in the air pushes back, off for its reasons and when silent', () => {
  const T = (state) => valsNovaThread(fakeApp(state), { demoMode: false }, vOf()).novaThread;
  assert.equal(T(speaking('contest')).contest, true);
  assert.equal(T(speaking(null)).contest, false);
  assert.equal(T({ ...speaking('contest'), voiceSpeaking: false }).contest, false);
  assert.equal(T({}).contest, false, 'no reply, no stance');
});

test('the chrome: novaContest is the same answer for the tab bar and Home, and novaThinking is the head\'s Thinking', () => {
  const C = (state) => valsChrome(fakeApp(state), chromeCtx);
  for (const st of [speaking('contest'), speaking(null), { ...speaking('contest'), voiceSpeaking: false }, {}]) {
    assert.equal(C(st).novaContest, valsNovaThread(fakeApp(st), { demoMode: false }, vOf()).novaThread.contest, 'the chrome and the thread never disagree');
  }
  assert.equal(C(speaking('contest')).novaContest, true);
  assert.equal(C(speaking(null)).novaContest, false);
  assert.equal(C({}).novaContest, false);
  // thinking: a turn in flight, or his words being written down, while Nova
  // is neither speaking nor listening (the head's stateOf, app-wide)
  assert.equal(C({ voiceBusy: true }).novaThinking, true);
  assert.equal(C({ voiceHearing: { screen: true } }).novaThinking, true);
  assert.equal(C({ voiceHearing: { presence: true } }).novaThinking, true);
  assert.equal(C({ voiceBusy: true, voiceSpeaking: true }).novaThinking, false, 'speaking is not thinking');
  assert.equal(C({ voiceBusy: true, liveMicOpen: true }).novaThinking, false, 'listening is not thinking');
  assert.equal(C({ voiceHearing: { screen: true }, voiceScreenMic: true }).novaThinking, false);
  assert.equal(C({ voiceHearing: { screen: false, presence: false } }).novaThinking, false);
  assert.equal(C({}).novaThinking, false);
  // and it is the head's word for the same state
  for (const [st, thinking] of [[{ voiceBusy: true }, true], [{ voiceHearing: { screen: true } }, true], [{}, false]]) {
    const head = stateOf({ busy: !!st.voiceBusy, hearing: !!st.voiceHearing?.screen });
    assert.equal(head.key === 'thinking', thinking);
    assert.equal(thinkingOf(st), thinking);
  }
});

test('THE WHOLE CHAIN: a pushing-back reply, spoken, turns the subtitle, the thread and the chrome red for that one sentence', () => {
  _resetSpeechClock();
  // App's mirror, as componentDidMount subscribes it
  const app = fakeApp({ voiceSpeaking: true });
  const off = onSpeech((list) => { const v = stanceNow(list); if ((app.state.voiceStance || null) !== v) app.setState({ voiceStance: v }); });
  const rows = [];
  let at = 0;
  for (const p of streamReply(RAW)) {
    noteSpokenSentence(toSpokenProse(speakableText(p.t, { final: true })), 1500, { at, stance: p.stance });
    at += 1500;
    const sub = spokenSentences().at(-1);
    rows.push([sub.text, sub.stance, valsNovaThread(app, { demoMode: false }, vOf()).novaThread.contest, valsChrome(app, chromeCtx).novaContest]);
  }
  off();
  assert.deepEqual(rows, [
    ['I hear you on adding a sixth day.', null, false, false],
    [CONTEST, 'contest', true, true],
    ['Your sleep has averaged six hours, and recovery is the limit.', null, false, false],
  ]);
  // speaking ends: App's endSpeech clears it with voiceSpeaking
  app.setState({ voiceSpeaking: false, voiceStance: null });
  assert.equal(valsChrome(app, chromeCtx).novaContest, false);
  _resetSpeechClock();
});

test('hearing is reported per microphone: one never clears another, and an unchanged report renders nothing', () => {
  const app = fakeApp();
  const report = (owner, on) => valsChrome(app, chromeCtx).reportHearing(owner, on);
  report('presence', true);
  assert.deepEqual(app.state.voiceHearing, { presence: true });
  const before = app.renders;
  report('screen', false);
  assert.deepEqual(app.state.voiceHearing, { presence: true }, 'the screen\'s false leaves the presence hearing');
  report('presence', true);
  assert.equal(app.renders, before, 'unchanged: no render');
  assert.equal(thinkingOf(app.state), true);
  report('screen', true);
  report('presence', false);
  assert.deepEqual(app.state.voiceHearing, { presence: false, screen: true });
  assert.equal(thinkingOf(app.state), true, 'still hearing on the screen');
  report('screen', false);
  assert.equal(thinkingOf(app.state), false);
});

test('the three microphones that hand a turn to Nova report while the Mac writes his words down, and clear it when they go', () => {
  const presence = read('src/VoicePresence.jsx');
  assert.match(presence, /useEffect\(\(\) => \{ v\.reportHearing\?\.\('presence', dict\.hearing\);[^\n]*\}, \[dict\.hearing\]\);/);
  assert.match(presence, /useEffect\(\(\) => \(\) => v\.reportHearing\?\.\('presence', false\), \[\]\);/);
  const thread = read('src/screens/NovaThread.jsx');
  assert.match(thread, /useEffect\(\(\) => \{ v\.reportHearing\?\.\('screen', dict\.hearing \|\| !!retrying\);[^\n]*\}, \[dict\.hearing, retrying\]\);/, 'the same hearing the head reads (stateOf)');
  assert.match(thread, /useEffect\(\(\) => \(\) => v\.reportHearing\?\.\('screen', false\), \[\]\);/);
  const voice = read('src/screens/Voice.jsx');
  assert.match(voice, /useEffect\(\(\) => \{ v\.reportHearing\?\.\('screen', dict\.hearing\);[^\n]*\}, \[dict\.hearing\]\);/);
  assert.match(voice, /useEffect\(\(\) => \(\) => v\.reportHearing\?\.\('screen', false\), \[\]\);/);
  // the head reads the thread's hearing the same way
  assert.match(thread, /hearing: dict\.hearing \|\| !!retrying,/);
});

// -------------------------------------------- 5. the client's strip paths --

test('STRIP · the speech queue and the captions: every sentence a pushing-back reply queues, at every arrival rate, is clean words', () => {
  for (const step of [1, 2, 5, 13, 64, RAW.length]) {
    const said = streamReply(RAW, step);
    assert.ok(said.length >= 3, `step ${step}: the reply was spoken`);
    for (const p of said) {
      // what the voice says and what the captions are handed (speechClock
      // is given exactly this text, App.drainTtsQueue's head.said)
      const heard = toSpokenProse(speakableText(p.t, { final: true }));
      assertClean(heard, `step ${step}, heard`);
      assertClean(p.t, `step ${step}, the piece`);
    }
    assert.ok(said.some((p) => p.t.includes(CONTEST)), 'the sentence itself is still said');
  }
});

test('STRIP · the thread line: streaming, revealed as spoken, and settled, the words he reads are clean', () => {
  const r = parseVisualStream(RAW);
  const shown = stripShow(parseVisualStream(streamShown(RAW)).text);
  const revealed = streamReply(RAW).map((p) => p.t).join('');
  const lines = valsNovaThread(fakeApp({
    voiceChat: [
      { at: T0, who: 'you', text: 'Should I add a sixth day?' },
      { at: T0 + 1, who: 'nova', text: shown, streaming: true },
      { at: T0 + 2, who: 'nova', text: revealed, streaming: true },
      // settled: the server's own strip (claudeCode.js warm turn) of the same reply
      { at: T0 + 3, who: 'nova', text: r.text },
    ],
  }), { demoMode: false }, vOf()).novaThread.lines;
  for (const l of lines.slice(1)) {
    assertClean(l.text, 'thread line');
    assert.ok(l.text.includes(CONTEST));
  }
  assertClean(bubbleProse(shown), 'bubble');
});

test('STRIP · the Coach and Leader logs: a stance never shows while their answer streams (it did, before 4 Oct)', () => {
  const coachStrip = (t) => t.replace(/(^|\n)\s*(SHOW|PROPOSE|RESEARCH|CONSULT|WITHDRAW)\s*(\{[\s\S]*)?$/, '');
  const leaderStrip = (t) => t.replace(/(^|\n)\s*(REFLECT|CONSULT)\s*(\{[\s\S]*)?$/, '');
  const coachRaw = `${RAW}\nPROPOSE {"action":"tune","exercise":"Bench Press","stepKg":1.25,"reason":"r"}`;
  const leaderRaw = `${RAW}\nREFLECT {"working":["one-on-ones"]}`;
  // what the Coach tab and the Leader screen used to render: the stance
  // line, raw, mid-answer
  assert.match(coachStrip(streamShown(coachRaw)), /VIS \{"stance":"contest"\}/, 'the old pipeline WOULD have shown it');
  assert.match(leaderStrip(streamShown(leaderRaw)), /VIS \{"stance":"contest"\}/);
  for (const [who, raw, strip] of [['coach', coachRaw, coachStrip], ['leader', leaderRaw, leaderStrip]]) {
    for (let n = 1; n <= raw.length; n++) assertClean(strip(parseVisualStream(streamShown(raw.slice(0, n))).text), `${who} prefix ${n}`);
    assert.ok(strip(parseVisualStream(streamShown(raw)).text).includes(CONTEST), `${who}: the words survive`);
  }
  // and App runs exactly that, in both logs (documentsSurface.test.js too)
  const app = read('src/App.jsx');
  assert.match(app, /const stripDirective = \(t\) => t\.replace\(\/\(\^\|\\n\)\\s\*\(SHOW\|PROPOSE\|RESEARCH\|CONSULT\|WITHDRAW\)\\s\*\(\\\{\[\\s\\S\]\*\)\?\$\/, ''\);/);
  assert.match(app, /const stripDirective = \(t\) => t\.replace\(\/\(\^\|\\n\)\\s\*\(REFLECT\|CONSULT\)\\s\*\(\\\{\[\\s\\S\]\*\)\?\$\/, ''\);/);
  assert.match(app, /const shown = stripDirective\(parseVisualStream\(streamShown\(job\.partial\)\)\.text\);\n\s*if \(shown\) this\.applyStreamPartial\('coachChat', 'coach', shown\);/);
  assert.match(app, /const shown = stripDirective\(parseVisualStream\(streamShown\(job\.partial\)\)\.text\);\n\s*if \(shown\) this\.applyStreamPartial\('leaderChat', 'leader', shown\);/);
  // their settled answers, and the notices that carry them, are the server's
  // stripped text (stanceStrip.test.js proves the server side)
  assert.match(app, /this\.finalizeStream\('coachChat', \{\n\s*who: 'coach', text: job\.result\.text,/);
  assert.match(app, /this\.finalizeStream\('leaderChat', \{ who: 'leader', text: job\.result\.text \}/);
});

test('STRIP · the Coach and the Leader read back into Nova\'s context: a stance is never quoted as their words', async () => {
  assertClean(cleanTurnText(RAW), 'cleanTurnText');
  assert.equal(cleanTurnText(RAW), `I hear you on adding a sixth day.\n${CONTEST}\nYour sleep has averaged six hours, and recovery is the limit.`);
  assert.equal(cleanTurnText(`${RAW}\n\nPROPOSE {"action":"tune"}`).endsWith('the limit.'), true, 'the trailing directive still goes too');
  // the real reader, over a real-shaped CLI journal, under a fake HOME
  const home = mkdtempSync(path.join(tmpdir(), 'nova-stance-home-'));
  const realHomedir = os.homedir;
  os.homedir = () => home;
  try {
    const cwd = '/tmp/fake vault';
    const dir = path.join(home, '.claude', 'projects', projectSlug(cwd));
    mkdirSync(dir, { recursive: true });
    const lines = [
      { type: 'user', message: { role: 'user', content: '[Standing reminder: …]\n\nShould I add a sixth day?' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: RAW }] } },
    ];
    writeFileSync(path.join(dir, 'stance1.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8');
    await recordAgentSession('coach', cwd, 'stance1');
    const ctx = await agentConversationContext('coach', 'Coach');
    assert.ok(ctx && ctx.includes('Coach: I hear you on adding a sixth day.'), ctx);
    assertClean(ctx.slice(ctx.indexOf('\n')), 'agentConversationContext');
    assert.ok(ctx.includes(CONTEST.slice(0, 20)), 'his words and the agent\'s survive');
  } finally {
    os.homedir = realHomedir;
  }
});
