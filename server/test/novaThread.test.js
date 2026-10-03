// THE NOVA THREAD (29 Sep 2026, design/mockups/63-redesign-nova-r2.html, D ·
// Rising, his pick with his focus-mode amendment). Three layers pinned: the
// pure facts (src/novaThreadFacts.js) — where the page opens, what a finished
// stage settles into, the head's six states, the door markers, the kept
// recording's contract; the view model (src/vals/valsNovaThread.js) over a fake
// app, so "building it writes nothing" is a test; and the source contracts a
// screenshot would never catch breaking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  firstUnseenIndex, newestAt, sentenceCase, glassSnapshot, panelsOf, settleStage, gistOf, stageLine, stateOf, coreFormOf,
  doorOf, bylineOf, threadRows, keptTake, takeClock, failWords, takesAdd, takesRemove, takesPatch, failedLast, dayLabel,
} from '../../src/novaThreadFacts.js';
import { valsNovaThread } from '../../src/vals/valsNovaThread.js';
import { bubbleProse } from '../../src/bubbleProse.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const T0 = new Date(2026, 8, 29, 8, 0, 0).getTime();
const min = 60_000;

// ------------------------------------------------ where the page opens --

test('first unseen: no mark or nothing new opens at the foot; new lines open at the start of that exchange', () => {
  const lines = [
    { at: T0, who: 'you', text: 'a' }, { at: T0 + 1, who: 'nova', text: 'b' },
    { at: T0 + 10 * min, who: 'you', text: 'said on Fuel', via: 'presence' },
    { at: T0 + 10 * min + 5, who: 'nova', text: 'answered on Fuel', via: 'presence' },
  ];
  assert.equal(firstUnseenIndex(lines, null), -1, 'no mark yet: the foot');
  assert.equal(firstUnseenIndex(lines, T0 + 10 * min + 5), -1, 'all seen: the foot');
  assert.equal(firstUnseenIndex(lines, T0 + 1), 2, 'his question from the button opens with its answer');
  assert.equal(firstUnseenIndex(lines.slice(0, 3), T0 + 1), -1, 'only his own words are new: he has seen them');
  assert.equal(newestAt(lines), T0 + 10 * min + 5);
  assert.equal(newestAt([{ who: 'nova' }]), null);
});

// ------------------------------------------------------- the stage --

const beats = [
  { key: 'v0_a', at: 0, spec: { kind: 'bars', label: 'SLEEP THIS WEEK', bars: [{ name: 'M', value: 7.7 }, { name: 'T', value: 6.2 }] } },
  { key: 'v1_b', at: 43, spec: { kind: 'metric', label: 'NIGHTS OVER 7 H', value: '6', unit: 'of 7' } },
  { key: 'v2_c', at: 80, spec: { kind: 'media', label: 'WORTH HEARING', title: 'Sleep, the talk' } },
];

test('the stage settles: the snapshot keeps only what it showed; the card is the last panel, the others newest first, and the count', () => {
  const g = glassSnapshot(beats, { v2_c: { title: 'Sleep, the talk', src: 'x.jpg', stamp: '14:30' }, stray: { title: 'not shown' } });
  assert.deepEqual(Object.keys(g.visuals), ['v2_c'], 'a visual no beat named is not kept');
  assert.equal(g.beats.length, 3);
  assert.equal(glassSnapshot([], {}), null, 'nothing shown, nothing kept');
  assert.equal(glassSnapshot(null, null), null);
  const panels = panelsOf(g);
  assert.equal(panels[2].stamp, '14:30', 'the fetched picture merges into its frame');
  assert.equal(panels[2].pending, false);
  const unfetched = panelsOf(glassSnapshot(beats, {}));
  assert.equal(unfetched[2].pending, false, 'a picture that never came is a frame on the settled card, not a spinner');
  const s = settleStage(panels);
  assert.equal(s.last.kind, 'media');
  assert.deepEqual(s.others.map((p) => p.kind), ['metric', 'bars'], 'newest first');
  assert.equal(s.count, 3, 'nothing is dropped, so "all three" is the truth');
  assert.equal(settleStage([]), null);
});

test('a panel\'s gist is the words already on it, never a new number', () => {
  assert.deepEqual(gistOf({ kind: 'metric', label: 'PROTEIN', value: '96', unit: 'g' }), { b: '96 g', s: 'Protein' });
  assert.deepEqual(gistOf({ kind: 'steps', label: 'THIS WEEK', items: [{ name: 'a' }, { name: 'b' }] }), { b: 'This week', s: '2 points' });
  assert.equal(gistOf({ kind: 'bars', label: 'SLEEP', bars: [{ name: 'Mon' }, { name: 'Tue' }, { name: 'Sun' }] }).s, 'Mon to Sun');
  assert.equal(sentenceCase('DAYS ON TARGET'), 'Days on target');
  assert.equal(sentenceCase('Already mixed'), 'Already mixed', 'only an all-capitals label is changed');
  assert.equal(gistOf({ kind: 'media', title: 'The talk', stamp: '14:30' }).s, 'at 14:30');
  assert.equal(gistOf({ kind: 'media', title: 'The talk' }).s, '', 'no stamp, no timecode');
  assert.equal(gistOf(null), null);
});

test('her sentence: the spoken part lit, the rest of it and the next one dim, nothing ahead of that', () => {
  const t = 'Six of seven nights were over seven hours. Tuesday was the short one, at six ten. The rest were fine.';
  const at43 = stageLine(t, 43);
  assert.equal(at43.lit.trim(), 'Six of seven nights were over seven hours.');
  assert.equal(at43.later.trim(), 'Tuesday was the short one, at six ten.');
  assert.equal(at43.lit + at43.later, 'Six of seven nights were over seven hours. Tuesday was the short one, at six ten.', 'drawn as one run, its spacing its own');
  const mid = stageLine(t, 60);
  assert.equal(mid.lit, 'Tuesday was the s');
  assert.equal(mid.lit + mid.later, 'Tuesday was the short one, at six ten.', 'the seam keeps its spacing: never "T uesday"');
  assert.ok(!mid.later.includes('The rest'), 'one sentence of runway, not the whole reply');
  assert.equal(stageLine(t, 0).later, '', 'no audio position: all of it has been shown');
  assert.equal(stageLine('', 3), null);
});

// ------------------------------------------------------- the head --

test('six states, in words: offline outranks all, then listening, writing, speaking, thinking, failed, your turn', () => {
  assert.equal(stateOf({ offline: true, listening: true }).key, 'offline');
  assert.match(stateOf({ offline: true, lastReplyAt: T0 }).hint, /^last reply 08:00$/);
  assert.deepEqual(stateOf({ listening: true }), { key: 'listening', word: 'Listening', hint: 'a pause sends' });
  assert.equal(stateOf({ listening: true, blind: true }).hint, 'tap Nova to send');
  assert.equal(stateOf({ hearing: true, speaking: true }).word, 'Writing it down');
  assert.equal(stateOf({ speaking: true, busy: true }).key, 'speaking');
  assert.equal(stateOf({ busy: true }).key, 'thinking');
  assert.equal(stateOf({ failed: true }).key, 'failed');
  assert.deepEqual(stateOf({}), { key: 'turn', word: 'Your turn', hint: 'tap Nova or type' });
  assert.equal(stateOf({ demo: true }).hint, 'demo replies', 'demo says so');
  // the core's form, never its hue: thinking runs three times faster, offline is still
  assert.equal(coreFormOf('thinking').pace, 3);
  assert.equal(coreFormOf('thinking').spin, true);
  assert.equal(coreFormOf('offline').still, true);
  assert.equal(coreFormOf('listening').grow, true);
  assert.equal(coreFormOf('speaking').pulse, true);
  assert.deepEqual(coreFormOf('turn'), { pace: 1, grow: false, pulse: false, still: false, spin: false });
});

// ------------------------------------------------------- the lines --

test('the door: the Nova button names the page from the line itself, never from where he is now', () => {
  const nameOf = (k) => ({ recipes: 'Fuel', workouts: 'Train' }[k] || k);
  assert.equal(doorOf({ via: 'presence', on: 'recipes' }, nameOf).text, 'Said on Fuel, with the Nova button');
  assert.equal(doorOf({ via: 'presence' }, nameOf).text, 'Said with the Nova button', 'no page stamped: only the door');
  assert.equal(doorOf({ via: 'presence', on: 'voice' }, nameOf).text, 'Said with the Nova button');
  assert.equal(doorOf({ via: 'siri' }).text, 'Said through Siri');
  assert.equal(doorOf({ via: 'voice' }), null);
  assert.equal(doorOf({}), null);
});

test('rows: a day heading where the day changes, one door marker per run, kept takes in time order', () => {
  const now = T0 + 5 * min;
  const lines = [
    { at: T0 - 86_400_000, who: 'you', text: 'yesterday' },
    { at: T0, who: 'you', text: 'q', via: 'presence', on: 'recipes' },
    { at: T0 + 1000, who: 'nova', text: 'a', via: 'presence', on: 'recipes' },
    { at: T0 + 2 * min, who: 'you', text: 'here' },
  ];
  const rows = threadRows(lines, { takes: [{ id: 't1', at: T0 + 3 * min }], now, nameOf: () => 'Fuel' });
  assert.deepEqual(rows.map((r) => r.type), ['day', 'line', 'day', 'door', 'line', 'line', 'line', 'take']);
  assert.equal(rows[0].text, 'Yesterday');
  assert.equal(rows[2].text, 'Today');
  assert.equal(rows[3].text, 'Said on Fuel, with the Nova button');
  assert.equal(dayLabel(new Date(2026, 8, 20, 9).getTime(), now), 'Sun 20 Sep');
});

test('provenance is a seam only: no by/from, no byline', () => {
  assert.equal(bylineOf({ who: 'nova', text: 'x' }), null);
  assert.deepEqual(bylineOf({ by: 'Coach' }), { by: 'Coach', from: null });
});

// ------------------------------------------------ the kept recording --

test('the kept recording\'s contract: audio or nothing, its clock, the red card\'s words, the store\'s rules', () => {
  assert.equal(keptTake({ ms: 9000 }), null, 'no audio, nothing kept');
  const blob = { size: 4096 };
  const t = keptTake({ blob, at: T0, ms: 9400, vad: 'heard', reason: 'The operation timed out.' }, 'take-1');
  assert.deepEqual({ id: t.id, at: t.at, ms: t.ms, bytes: t.bytes, vad: t.vad, tries: t.tries }, { id: 'take-1', at: T0, ms: 9400, bytes: 4096, vad: 'heard', tries: 1 });
  assert.equal(t.blob, blob, 'the same bytes, for Try again');
  assert.equal(keptTake({ blob, vad: 'loud' }, 'x').vad, '', 'an unknown meter word is not kept');
  assert.equal(takeClock(9400), '0:09');
  assert.equal(takeClock(71_000), '1:11');
  const w = failWords(t);
  assert.equal(w.title, 'Nova couldn’t write that down');
  assert.match(w.body, /didn’t answer in 30 s\. The recording above is kept: Try again sends the same 9 seconds\./);
  assert.equal(failWords({ ...t, tries: 2 }).title, 'Still couldn’t write that down');
  assert.match(failWords({ ...t, reason: 'Nova is not connected to the Mac, so it cannot hear you' }).body, /isn’t connected/);
  // the store: newest last, a cap, one id once
  let list = [];
  for (let i = 0; i < 10; i++) list = takesAdd(list, { id: `t${i}`, at: T0 + i });
  assert.equal(list.length, 8);
  assert.equal(list[0].id, 't2', 'the oldest goes first');
  list = takesAdd(list, { id: 't9', at: T0 + 9, again: true });
  assert.equal(list.filter((x) => x.id === 't9').length, 1);
  assert.equal(takesRemove(list, 't9').length, 7);
  assert.equal(takesPatch(list, 't3', { tries: 2 }).find((x) => x.id === 't3').tries, 2);
  // the head says "didn't arrive" only while the take is the newest thing
  assert.equal(failedLast([{ at: T0 }], [{ at: T0 + 1 }]), true);
  assert.equal(failedLast([{ at: T0 + 2 }], [{ at: T0 + 1 }]), false);
  assert.equal(failedLast([{ at: T0 }], []), false);
});

test('useDictation keeps a failed take only when asked; the classic path still errors and still ends the turn', () => {
  const src = read('src/useDictation.js');
  assert.match(src, /keepFailed = false, onKept \} = \{\}\) \{/, 'off by default');
  assert.match(src, /const kept = !!\(failure && keepFailed && blob && blob\.size > 0\);/);
  assert.match(src, /if \(failure && !kept\) onError\?\.\(failure\.message \|\| 'Nova could not hear that'\);/);
  // not kept → onDone fires exactly as before
  assert.match(src, /if \(kept\) \{[\s\S]*?return;\n    \}\n    onDone\?\.\(composed\(\)\);/);
  assert.match(src, /return \{ supported: !!engine, on, toggle, hearing, blind, engine, resend \};/);
  // Try again sends the same bytes and only ends the turn on words
  const resend = src.slice(src.indexOf('const resend = async'), src.indexOf('const tickNova'));
  assert.match(resend, /transcribeRecording\(take\.blob/);
  assert.match(resend, /if \(!text\) return \{ ok: false/);
  assert.match(resend, /onDone\?\.\(text\);/);
  assert.doesNotMatch(resend, /openRecording/, 'nothing is recorded anew');
  // the thread asks for it; nothing else does
  assert.match(read('src/screens/NovaThread.jsx'), /keepFailed: true,/);
  assert.doesNotMatch(read('src/screens/Voice.jsx'), /keepFailed/);
});

// ------------------------------------------------------ the view model --

function fakeApp(state = {}) {
  const calls = [];
  const app = {
    state: {
      novaStyle: 'summary', screen: 'voice', connectionStatus: 'connected', voiceSpeaking: false, voiceBusy: false,
      glassBeats: [], glassVisuals: {}, glassSpokenTo: 0, orbInput: '', coreStyle: 'filament',
      voiceChat: [
        { at: T0, who: 'you', text: 'How did I sleep?' },
        { at: T0 + 1, who: 'nova', text: 'Six of seven nights were over seven hours.', glass: glassSnapshot(beats, {}) },
        { at: T0 + 2 * min, who: 'you', text: 'Log a shake', via: 'presence', on: 'recipes' },
        { at: T0 + 2 * min + 1, who: 'nova', text: 'Logged.', via: 'presence', on: 'recipes', acted: { title: 'Logged a shake', recordId: 'r1', undoable: true } },
      ],
      orbChat: [{ who: 'nova', text: 'demo line' }],
      ...state,
    },
    setState(p) { const x = typeof p === 'function' ? p(this.state) : p; if (x) this.state = { ...this.state, ...x }; },
  };
  for (const m of ['undoVoiceAct', 'resolveVoiceProposal', 'rememberFromChat', 'speakTtsSentence', 'navigate', 'startLiveTalk', 'openVerdict', 'undoChatRoute', 'walkThroughPlan', 'takePlanToCoach', 'keepPlanReport', 'openCapture']) {
    app[m] = (...a) => calls.push([m, ...a]);
  }
  return { app, calls };
}
const vOf = () => ({
  glass: null, briefQueue: null, speechBlocked: null, voiceEngineLabel: 'NOVA · DEFAULT', voiceEngineDetail: '',
  wakeWordSupported: true, wakeWordOn: false, setWakeWord: () => {}, briefMe: () => {}, ritualInvite: null, voiceLive: true,
  voiceContinuing: true, newVoiceChat: () => {}, voiceChatUndo: null, undoNewVoiceChat: () => {}, setTypedInputValue: () => {}, sendOrb: () => {},
  routePreview: (q) => (/list/.test(q) ? { lane: 'shopping', label: 'Shopping', why: 'a list word' } : { lane: 'ask' }), attach: { pending: [] }, openCaptureSheet: null,
});

test('the view model is null off summary and off the Nova tab, and building it calls nothing', () => {
  assert.equal(valsNovaThread(fakeApp({ novaStyle: 'cupertino' }).app, {}, vOf()).novaThread, null);
  assert.equal(valsNovaThread(fakeApp({ novaStyle: 'command' }).app, {}, vOf()).novaThread, null);
  assert.equal(valsNovaThread(fakeApp({ screen: 'recipes' }).app, {}, vOf()).novaThread, null);
  const { app, calls } = fakeApp();
  const T = valsNovaThread(app, { demoMode: false, isOffline: false }, vOf()).novaThread;
  assert.ok(T);
  assert.deepEqual(calls, [], 'building the view model called no app method');
  assert.deepEqual(Object.keys(valsNovaThread(app, {}, vOf())), ['novaThread'], 'it spreads one key and nothing another builder set');
});

test('the lines: the settled stage rides the reply, the button\'s exchange keeps its page and its Undo, Remember goes through the Inbox rail', () => {
  const { app, calls } = fakeApp();
  const T = valsNovaThread(app, { demoMode: false }, vOf()).novaThread;
  assert.equal(T.lines[1].settled.count, 3);
  assert.equal(T.lines[1].settled.last.kind, 'media');
  assert.equal(T.lines[3].on, 'recipes');
  assert.equal(T.lines[3].via, 'presence');
  T.lines[3].acted.undo();
  assert.deepEqual(calls.pop(), ['undoVoiceAct', 'r1', T0 + 2 * min + 1]);
  T.lines[1].remember();
  assert.deepEqual(calls.pop(), ['rememberFromChat', 'Six of seven nights were over seven hours.']);
  assert.equal(T.lines[0].remember, null, 'his own words are not Nova\'s to remember');
  assert.equal(T.lines[1].byline, null, 'the provenance seam is empty');
  assert.equal(T.bench, null);
  assert.equal(T.composer.route('add milk to the list').label, 'Shopping');
  assert.equal(T.composer.route('how did I sleep'), null, 'a question needs no label');
  assert.equal(T.nameOf('recipes'), 'Fuel');
});

test('demo: the demo lines, and no working verb on any of them', () => {
  const { app } = fakeApp({ orbChat: [{ at: T0, who: 'nova', text: 'demo', acted: { title: 'x', undoable: true, recordId: 'r' } }] });
  const T = valsNovaThread(app, { demoMode: true }, vOf()).novaThread;
  assert.equal(T.lines.length, 1);
  assert.equal(T.lines[0].acted, null);
  assert.equal(T.lines[0].remember, null);
  assert.equal(T.demo, true);
  assert.equal(T.offline, false, 'demo is not offline');
});

test('the talk door: the tab bar\'s Nova calls the page\'s own start inside the tap, or starts live talk with none registered', () => {
  const { app, calls } = fakeApp();
  const T = valsNovaThread(app, {}, vOf()).novaThread;
  T.dockTalk();
  assert.deepEqual(calls.pop(), ['startLiveTalk']);
  let started = 0;
  T.registerTalk(() => { started++; });
  valsNovaThread(app, {}, vOf()).novaThread.dockTalk();
  assert.equal(started, 1);
  assert.equal(calls.length, 0);
});

test('the focus door (30 Sep): enterFocus brings the core up through the page\'s own setter, a no-op with none registered; since 1 Oct the dock\'s hold uses it', () => {
  const { app, calls } = fakeApp();
  const T = valsNovaThread(app, {}, vOf()).novaThread;
  assert.doesNotThrow(() => T.enterFocus(), 'no thread mounted: nothing happens');
  assert.equal(calls.length, 0, 'and it calls no app method');
  let focused = 0;
  T.registerFocus(() => { focused++; });
  valsNovaThread(app, {}, vOf()).novaThread.enterFocus();
  assert.equal(focused, 1);
  T.registerFocus(null);
  valsNovaThread(app, {}, vOf()).novaThread.enterFocus();
  assert.equal(focused, 1, 'unregistered on unmount');
  const src = read('src/screens/NovaThread.jsx');
  // since 3 Oct the focus is the full-screen Nova, its own history entry
  // (App.openNovaFocus); the registration opens it the same way the name does
  assert.match(src, /T\.syncFocus\(\);\n    T\.registerFocus\(\(\) => T\.openFocus\(\)\);\n    return \(\) => T\.registerFocus\(null\);/);
  // 1 Oct (every door): the hold on the tab bar's Nova opens this page with
  // its core full screen and listening (App.holdNovaCore), no longer the
  // capture composer; a hold from another page waits for this registration
  assert.match(read('src/SummaryDock.jsx'), /onLongPress=\{v\.holdNovaCore \|\| v\.holdNovaText\}/);
  let consumed = 0;
  app.consumeNovaHold = () => { consumed++; };
  T.registerFocus(() => {});
  assert.equal(consumed, 1, 'registering the focus takes a waiting hold');
  T.registerFocus(null);
  assert.equal(consumed, 1, 'unregistering does not');
});

test('the head is the name and the state, no core; the core is drawn by the full-screen Nova only (30 Sep, 3 Oct)', () => {
  const src = read('src/screens/NovaThread.jsx');
  assert.equal((src.match(/<CoreFace /g) || []).length, 0, 'the thread\'s head draws no core');
  assert.match(src, /\{fxShown && \(\n\s*<NovaFocus /, 'the full screen draws it, in focus (and while it folds away)');
  assert.match(src, /if \(focus && !fxShown\) setFxShown\(true\);/, 'held in the same render the focus closes: never remounted on the way out');
  const fx = read('src/NovaFocus.jsx');
  assert.equal((fx.match(/<CoreFace /g) || []).length, 1, 'one core on the full screen');
  assert.match(src, /className="nv-nt-name" onClick=\{\(\) => \(focus \? T\.closeFocus\(\) : T\.openFocus\(\)\)\}/, 'the name still toggles the focus');
  assert.match(src, /className="nv-nt-more" onClick=\{\(\) => setStatusOpen\(true\)\}/, 'the › still opens status at rest');
});

test('the stage steps the thread back: a blur and a light dim under the head, stage and composer, solid under reduced transparency (30 Sep)', () => {
  const src = read('src/screens/NovaThread.jsx');
  assert.match(src, /\{\(shown \|\| leaving\) && !focus && \(\n\s*<div className=\{`nv-nt-stagedim\$\{!shown \? ' leaving' : ''\}`\} aria-hidden="true"/);
  const css = read('src/index.css');
  const rule = /\.nv-nt-stagedim \{([^}]*)\}/.exec(css.slice(css.indexOf('THE NOVA THREAD (29 Sep 2026)')));
  assert.ok(rule, 'the dim rule');
  assert.match(rule[1], /position: fixed; inset: 0; z-index: 11;/);
  assert.match(rule[1], /backdrop-filter: blur\(10px\)/);
  const z = (sel) => Number(new RegExp(`${sel} \\{[^}]*z-index: (\\d+)`).exec(css)[1]);
  assert.ok(z('\\.nv-nt-head') > 11 && z('\\.nv-nt-stagerail') > 11 && z('\\.nv-nt-composer') > 11, 'the head, the stage and the composer stay sharp and usable');
  const rt = css.slice(css.lastIndexOf('@media (prefers-reduced-transparency: reduce)'));
  assert.match(rt.slice(0, rt.indexOf('\n}\n') + 3), /\.nv-nt \.nv-nt-stagedim \{ background: color-mix\(in srgb, var\(--nv-void\) 86%, transparent\); \}/);
});

test('the settled stage says what it was and offers Replay in one line (30 Sep, "so I can refer back")', () => {
  const parts = read('src/NovaThreadParts.jsx');
  assert.match(parts, /<Ico name="stage" \/>Shown while she spoke\{time \? ` · \$\{time\}` : ''\}/);
  assert.match(parts, /className="nv-nt-streplay" onClick=\{onReplay\}/);
  assert.match(parts, /<StagePanel card=\{st\.last\} onOpen=\{onOpen\} \/>/, 'a tap on the panel opens it full width');
  assert.doesNotMatch(parts.slice(parts.indexOf('export function Settled')), /On the stage/);
});

test('the live stage: only while she speaks with a glass up; her sentence measured in the reply\'s own text', () => {
  const { app } = fakeApp({ voiceSpeaking: true, glassBeats: beats, glassSpokenTo: 43,
    voiceChat: [{ at: T0, who: 'nova', text: 'Six of seven nights were over seven hours. Tuesday was the short one.', streaming: true }] });
  const glass = { hero: { kind: 'metric', label: 'NIGHTS OVER 7 H', value: '6' }, rail: [{ kind: 'bars', label: 'SLEEP', bars: [] }] };
  const T = valsNovaThread(app, {}, { ...vOf(), glass }).novaThread;
  assert.equal(T.stage.n, 1);
  assert.equal(T.stage.total, 3);
  assert.equal(T.stage.line.lit.trim(), 'Six of seven nights were over seven hours.');
  const quiet = valsNovaThread(fakeApp({ voiceSpeaking: false }).app, {}, { ...vOf(), glass }).novaThread;
  assert.equal(quiet.stage, null, 'finished: the stage has settled into the thread');
});

// --------------------------------------------------- source contracts --

test('Voice.jsx hands over to the thread under summary only; the station is a separate component, untouched', () => {
  const src = read('src/screens/Voice.jsx');
  assert.match(src, /export function Voice\(\{ v \}\) \{\n  if \(v\.summary && v\.novaThread\) return <NovaThread v=\{v\} \/>;\n  return <VoiceClassic v=\{v\} \/>;\n\}/);
  assert.match(src, /function VoiceClassic\(\{ v \}\) \{/);
  assert.doesNotMatch(read('src/screens/NovaThread.jsx'), /from '\.\/Voice\.jsx'/, 'the thread never imports the station back');
});

test('App: the thread spreads last; a reply keeps its glass; a line from the Nova button keeps its page and what it carried', () => {
  const app = read('src/App.jsx');
  assert.match(app, /return \{ \.\.\.withSession, \.\.\.valsNovaThread\(this, ctx, withSession\) \};\n  \}/);
  assert.match(app, /const glass = glassSnapshot\(s\.glassBeats, s\.glassVisuals\) \|\| undefined;/);
  // the door a turn came in by rides both of its rows (`meta`, 1 Oct)
  assert.match(app, /const line = \{ at: Date\.now\(\), who, text, panel, proposal, acted, research, evidence, glass, \.\.\.\(from \? \{ from \} : \{\}\), \.\.\.\(meta \|\| \{\}\) \};/, 'the reply keeps its glass beside whom it consulted');
  assert.match(app, /chat\.push\(line\)/);
  // EVERY DOOR (1 Oct): the Nova button on another page runs the one
  // pipeline (doOrb → askNova), so everything its reply carried lands exactly
  // as the thread's own would; its rows keep the page it was said on
  assert.match(app, /this\.presenceTurn = \{ via: 'presence', on: this\.state\.screen, at: Date\.now\(\) \};/);
  assert.match(app, /this\.doOrb\(q\);\n    this\.presenceTurn = null;/);
  assert.match(app, /who: 'you', text: question, attached: attached\.length \? attached : undefined, \.\.\.\(meta \|\| \{\}\) \}/);
  assert.match(app, /this\.attachAskPoll\(conn, jobId, \{ agent, meta \}\);/);
  // the record never carries the glass (it sends text, who, via, device)
  assert.doesNotMatch(read('src/conversationSync.js'), /glass/);
  assert.match(read('src/SummaryDock.jsx'), /onClick=\{v\.novaThread\?\.dockTalk \|\| v\.startLiveTalk\}/);
  assert.equal(bubbleProse('**Hi** there'), 'Hi there', 'the bubble cleaner moved, unchanged');
  assert.match(read('src/vals/valsMisc.js'), /import \{ bubbleProse \} from '\.\.\/bubbleProse\.js';/);
});

test('NovaCore and StageCard draw exactly as before unless the thread asks', () => {
  const core = read('src/NovaCore.jsx');
  assert.match(core, /formOnly = false, pace = 1, still = false \}\) \{/);
  assert.match(core, /\(st\.speaking && !st\.formOnly \? 1 : 0\)/);
  const card = read('src/StageCard.jsx');
  assert.match(card, /export function StageCard\(\{ card, size = 'full', face \}\) \{/);
  assert.match(card, /const fz = \(n\) => \(S \? Math\.max\(13, n\) : n\);/);
  assert.match(read('src/NovaThreadParts.jsx'), /<StageCard card=\{card\} face="summary" \/>/);
});

test('the new files reach no network: every write is an app method the classic screen already calls', () => {
  for (const f of ['src/screens/NovaThread.jsx', 'src/NovaThreadParts.jsx', 'src/vals/valsNovaThread.js', 'src/novaThreadFacts.js', 'src/keptTakes.js']) {
    const src = read(f).replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /\bfetch\(/, `${f}: fetch`);
    assert.doesNotMatch(src, /\bapi\./, `${f}: api.`);
    assert.doesNotMatch(src, /from '\.\.?\/api\.js'/, `${f}: imports api.js`);
  }
});

test('every sheet is an aria-modal root closed by its own backdrop (the back swipe\'s contract)', () => {
  const src = read('src/screens/NovaThread.jsx');
  const roots = [...src.matchAll(/role="dialog" aria-modal="true"[^>]*onClick=\{onClose\}\s*\n\s*style=\{\{ position: 'fixed', inset: 0, zIndex: (\d+) \}\}/g)];
  assert.equal(roots.length, 2, 'the status sheet and the hold menu');
  for (const r of roots) assert.ok(Number(r[1]) > 72, 'over the tab bar');
  assert.match(src, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
});

test('no type in the thread is below 13px, and every selector wears .nv-nt', () => {
  const sizes = [];
  for (const f of ['src/screens/NovaThread.jsx', 'src/NovaThreadParts.jsx']) {
    const src = read(f);
    assert.doesNotMatch(src, /fontSize|font: ?['"`]/, `${f} sets type inline; the CSS block owns it`);
  }
  const css = read('src/index.css');
  const start = css.indexOf('THE NOVA THREAD (29 Sep 2026)');
  const end = css.indexOf('/* end of the Nova thread */');
  assert.ok(start > 0 && end > start, 'the .nv-nt-* block was not found');
  // appended at the end of the file when it landed; later blocks (the
  // full-screen Nova, 3 Oct) append after it, so what follows may only be
  // another block that opens with its own banner, never a stray rule
  const after = css.slice(end + '/* end of the Nova thread */'.length).trim();
  assert.ok(after === '' || after.startsWith('/*'), 'only a later block follows, opening with its banner');
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: rule[1].trim(), px: Number(px[1]) });
    }
    const sel = rule[1].trim();
    if (!/^(from|to|\d+%)/.test(sel)) assert.match(sel, /nv-nt/, `a selector outside the namespace: ${sel}`);
  }
  assert.ok(sizes.length > 40, `expected to read the page's type, found ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 13).map((s) => `${s.where}: ${s.px}px`);
  assert.deepEqual(small, [], `below the floor:\n  ${small.join('\n  ')}`);
  assert.match(block, /prefers-reduced-motion/);
  assert.match(block, /data-nv-calm="1"/);
  // reduce transparency: the app-wide guard, which must stay the file's last
  // such block, turns this page's floating glass solid
  const rt = css.slice(css.lastIndexOf('@media (prefers-reduced-transparency: reduce)'));
  assert.match(rt.slice(0, rt.indexOf('\n}\n') + 3), /\.nv-nt-head, \.nv-nt-stage, \.nv-nt-composer/);
  assert.ok(css.lastIndexOf('@media (prefers-reduced-transparency: reduce)') < start, 'the guard stays last');
});
