// THE FULL-SCREEN NOVA (3 Oct 2026) — his pick after design/mockups/68-nova-
// focus.html: A's field for his turn, C's stage while they talk, the core in
// its state colours. Four layers pinned: the caption engine (src/
// subtitlePace.js, word timing paced honestly across each sentence's audio,
// with a seam for real timings); the speech clock the queue feeds (src/
// speechClock.js); the screen's rules (src/novaFocusFacts.js: the phase, the
// tint table, the steps, the speaker, the asks); and the source contracts a
// screenshot would never catch breaking (its own history entry, the CSS
// namespace and type floor, the canvas that stops when the page is hidden).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  splitWords, wordWeight, paceSentence, wordAt, sentenceAt, wordLook, estimateSpeechMs, COMMA_REST, WORD_BASE,
} from '../../src/subtitlePace.js';
import {
  noteSpokenSentence, beginReply, cutSpeech, spokenSentences, onSpeech, freezeClock, clockNow, _resetSpeechClock,
} from '../../src/speechClock.js';
import {
  focusPhase, PHASE_HOLD_MS, focusTint, EMBER_RGB, FIELD_EMBERS, FIELD_EMBERS_CAP, focusSteps, speakerOf, focusAsks, peekLine,
  lastYours, CAPTIONS_KEY, captionsOn,
} from '../../src/novaFocusFacts.js';
import { valsNovaThread } from '../../src/vals/valsNovaThread.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ------------------------------------------------------ the pace engine --

test('the words of a sentence are paced across exactly its audio: contiguous, in order, summing to the span', () => {
  const at = 1000;
  const dur = 3000;
  const { real, spans } = paceSentence({ text: 'That puts six of seven nights over your line.', at, dur });
  assert.equal(real, false, 'paced, and it says so');
  assert.equal(spans.length, 9);
  assert.equal(spans[0].st, at, 'the first word starts with the audio');
  assert.equal(spans[spans.length - 1].en, at + dur, 'the last ends exactly when the audio does');
  for (let i = 1; i < spans.length; i++) assert.ok(near(spans[i].st, spans[i - 1].en), `word ${i} starts where ${i - 1} ended`);
  const total = spans.reduce((s, w) => s + (w.en - w.st), 0);
  assert.ok(near(total, dur), `the spans sum to the sentence: ${total}`);
  assert.deepEqual(spans.map((w) => w.text), splitWords('That puts six of seven nights over your line.'));
  // a longer word is said for longer
  const len = (w) => w.en - w.st;
  assert.ok(len(spans[5]) > len(spans[2]), '"nights" outlasts "six"');
});

test('a comma rests: the word before it holds for the pause, by the same weight everywhere', () => {
  assert.equal(wordWeight('six'), 3 + WORD_BASE);
  assert.equal(wordWeight('six,'), 3 + WORD_BASE + COMMA_REST);
  for (const w of ['line;', 'this:', 'well—', 'said,”']) assert.ok(wordWeight(w) > wordWeight(w.replace(/[,;:—”]+$/, '')), `${w} rests`);
  const { spans } = paceSentence({ text: 'Tuesday was short, at six ten.', at: 0, dur: 2000 });
  const short = spans.find((w) => w.text === 'short,');
  const ten = spans.find((w) => w.text === 'ten.');
  assert.ok(short.en - short.st > (ten.en - ten.st) * 1.5, 'the comma\'s word is held through the rest');
  assert.equal(wordWeight('Seven'), wordWeight('seven'), 'case does not change a beat');
  assert.equal(wordWeight('don’t'), 5 + WORD_BASE, 'an apostrophe is part of the word');
});

test('real word timings win when present, and the paced version is only the fallback', () => {
  const words = [{ t: 0, text: 'Here' }, { t: 420, text: 'is' }, { t: 600, text: 'your' }, { t: 850, text: 'week.' }];
  const r = paceSentence({ text: 'Here is your week.', at: 500, dur: 1300, words });
  assert.equal(r.real, true);
  assert.deepEqual(r.spans.map((w) => [w.text, w.st, w.en]), [['Here', 500, 920], ['is', 920, 1100], ['your', 1100, 1350], ['week.', 1350, 1800]]);
  // out of order, outside the span, or empty: cleaned, never trusted blindly
  const messy = paceSentence({ text: 'x', at: 0, dur: 1000, words: [{ t: 700, text: 'b' }, { t: -50, text: 'a' }, { t: 2000, text: 'c' }, { t: 10, text: '  ' }] });
  assert.deepEqual(messy.spans.map((w) => [w.text, w.st, w.en]), [['a', 0, 700], ['b', 700, 1000], ['c', 1000, 1000]]);
  assert.equal(paceSentence({ text: 'Two words.', at: 0, dur: 800, words: [] }).real, false, 'no timings: paced');
});

test('which word and which sentence are in the air, and how a word looks at a moment', () => {
  const { spans } = paceSentence({ text: 'one two three', at: 100, dur: 900 });
  assert.equal(wordAt(spans, 50), -1, 'before the audio');
  assert.equal(wordAt(spans, 100), 0);
  assert.equal(wordAt(spans, spans[1].st + 1), 1);
  assert.equal(wordAt(spans, 1000), 3, 'after the last');
  assert.equal(sentenceAt([{ at: 0 }, { at: 2000 }, { at: 5000 }], 2500), 1);
  assert.equal(sentenceAt([{ at: 100 }], 50), -1);
  const w = spans[1];
  assert.deepEqual(wordLook(w, w.st - 1), { e: 0, lit: 0, p: 0 }, 'not yet said: not shown');
  const mid = wordLook(w, (w.st + w.en) / 2);
  assert.equal(mid.lit, 1, 'lit while it is said');
  assert.ok(near(mid.p, 0.5), 'the underline is half way across it');
  const after = wordLook(w, w.en + 1000);
  assert.equal(after.lit, 0, 'white once said');
  assert.equal(after.e, 1);
  assert.deepEqual(wordLook(w, w.st + 10, { cut: w.st }), { e: 0, lit: 0, p: 0 }, 'a word after the cut never appears');
});

test('with no audio length, the sentence is paced on an estimate (and the clock marks it)', () => {
  assert.equal(estimateSpeechMs(''), 0);
  assert.equal(estimateSpeechMs('Hi.'), 600, 'a floor, so a word is never a flash');
  assert.equal(estimateSpeechMs('x'.repeat(160)), 10000, 'sixteen characters a second');
});

// ------------------------------------------------------- the speech clock --

test('the speech clock: a sentence noted as its audio starts, estimated without a length, cut where he stopped her, cleared per reply', () => {
  _resetSpeechClock();
  const seen = [];
  const off = onSpeech((l) => seen.push(l.length));
  freezeClock(10_000);
  assert.equal(clockNow(), 10_000);
  const a = noteSpokenSentence('Seven hours twenty last night.', 1900);
  assert.deepEqual({ at: a.at, dur: a.dur, estimated: a.estimated }, { at: 10_000, dur: 1900, estimated: false });
  const b = noteSpokenSentence('The phone said this.', null, { at: 12_000 });
  assert.equal(b.estimated, true, 'the phone\'s own voice reports no length: estimated, and marked');
  assert.equal(b.dur, estimateSpeechMs('The phone said this.'));
  assert.equal(noteSpokenSentence('   ', 500), null, 'nothing said, nothing noted');
  cutSpeech(12_400);
  assert.equal(spokenSentences()[1].cut, 12_400, 'the sentence in the air ends where her voice did');
  cutSpeech(12_900);
  assert.equal(spokenSentences()[1].cut, 12_400, 'cut once');
  beginReply();
  assert.equal(spokenSentences().length, 0, 'a new reply starts clean');
  for (let i = 0; i < 20; i++) noteSpokenSentence(`s${i}`, 100, { at: 20_000 + i * 100 });
  assert.equal(spokenSentences().length, 12, 'a long brief keeps the last dozen');
  noteSpokenSentence('An hour later, the research is ready.', 2000, { at: 20_000 + 3_600_000 });
  assert.deepEqual(spokenSentences().map((s) => s.text), ['An hour later, the research is ready.'], 'a new moment long after the last starts clean');
  assert.ok(seen.length >= 4, 'readers hear every change');
  off();
  _resetSpeechClock();
});

test('App feeds the clock at the instant each sentence\'s audio starts, on every path, and cuts it on a stop', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import \{ noteSpokenSentence, cutSpeech, beginReply \} from '\.\/speechClock\.js';/);
  // the decoded buffer: its exact length
  assert.match(app, /this\.currentSource = src;\n[\s\S]{0,200}noteSpokenSentence\(head\.said, head\.buffer\.duration \* 1000\);\n\s*try \{ head\.onPlay\?\.\(\);/);
  // the <audio> element: once it is genuinely playing
  assert.match(app, /this\.noteSpeechHeard\(\);\n[\s\S]{0,200}noteSpokenSentence\(head\.said, Number\.isFinite\(audio\.duration\) \? audio\.duration \* 1000 : null\);/);
  // the phone's own voice: as the utterance starts, estimated
  assert.match(app, /u\.onstart = \(\) => noteSpokenSentence\(text, null\);/);
  assert.match(app, /stopSpeaking\(\) \{\n\s*cutSpeech\(\);/);
  assert.match(app, /this\.resetGlass\(\);[^\n]*\n\s*beginReply\(\);/);
});

// ------------------------------------------------------------ the rules --

test('the phase: his turn is the field; the moment the conversation moves it is the stage', () => {
  for (const k of ['turn', 'failed', 'offline']) assert.equal(focusPhase(k), 'field', k);
  for (const k of ['listening', 'thinking', 'speaking']) assert.equal(focusPhase(k), 'stage', k);
  assert.equal(focusPhase('turn', { streaming: true }), 'stage', 'a reply still arriving keeps the stage');
  assert.ok(PHASE_HOLD_MS >= 600 && PHASE_HOLD_MS <= 1500, 'the gap inside one exchange never sends it home');
});

test('the state → tint table: violet listening, gold speaking, her blue at rest and thinking', () => {
  assert.deepEqual(focusTint('listening'), { hue: 'violet', listening: true, speaking: false });
  assert.deepEqual(focusTint('speaking'), { hue: 'gold', listening: false, speaking: true });
  for (const k of ['turn', 'thinking', 'failed', 'offline', 'anything']) assert.deepEqual(focusTint(k), { hue: 'blue', listening: false, speaking: false }, k);
  assert.deepEqual(Object.keys(EMBER_RGB).sort(), ['blue', 'gold', 'violet'], 'the embers carry the same three');
  // the full screen asks the core for its tints; the thread's face stays form-only
  const fx = read('src/NovaFocus.jsx');
  assert.match(fx, /<CoreFace stateKey=\{S\.key\} engine=\{T\.engine\} focus tinted size=\{300\} leanRef=\{leanRef\} \/>/);
  const parts = read('src/NovaThreadParts.jsx');
  assert.match(parts, /export function CoreFace\(\{ stateKey, engine, focus, tinted = false, size = CORE_BIG, leanRef = null \}\) \{/);
  assert.match(parts, /<NovaCore size=\{size\} engine=\{engine\} formOnly=\{!tinted\} tintStill=\{tinted\} leanRef=\{leanRef\}/);
  assert.match(parts, /listening=\{stateKey === 'listening'\} speaking=\{stateKey === 'speaking'\}/, 'the core is told the state, which its own tints read');
  const core = read('src/NovaCore.jsx');
  assert.match(core, /leanRef = null, tintStill = false, formOnly = false, pace = 1, still = false \}\) \{/, 'the lean and the still tint are optional; every other caller draws as before');
  // under reduced motion the full screen's one still frame wears the state colour, redrawn when it changes
  assert.match(core, /draw\(engine === 'hologram' \? 3\.2 : 1\.7, tintStill\);/);
  assert.match(core, /stillDraw\.current\?\.\(engine === 'hologram' \? 3\.2 : 1\.7, true\);\n  \}, \[speaking, listening, formOnly, engine\]\);/);
  assert.match(core, /const k = snap \? 1 : 0\.07;/);
});

test('the steps are what code can see: the Mac writing it down (spoken turns only), then the vault, each ticked by the next state', () => {
  assert.deepEqual(focusSteps({ hearing: true }), [{ key: 'written', label: 'Your Mac is writing down what you said', done: false }]);
  assert.deepEqual(focusSteps({ heard: true, busy: true }).map((s) => [s.key, s.done]), [['written', true], ['vault', false]]);
  assert.deepEqual(focusSteps({ busy: true }).map((s) => s.key), ['vault'], 'a typed question has no transcription step');
  assert.deepEqual(focusSteps({ heard: true, answering: true }).map((s) => [s.label, s.done]), [['Your Mac wrote it down', true], ['Read your vault', true]]);
  assert.deepEqual(focusSteps({}), []);
});

test('the speaker is the reply\'s own agent, in the hue the Agent World gave it; one reply, one speaker', () => {
  assert.deepEqual(speakerOf(null), { key: 'nova', name: 'Nova', hue: 'var(--nv-cy)', voiced: false });
  assert.deepEqual(speakerOf('Coach'), { key: 'coach', name: 'Coach', hue: 'var(--nv-m-chest)', voiced: true });
  assert.equal(speakerOf('Leader').hue, 'var(--nv-mg)');
});

test('what to ask: at most two, only doors the app already offers, none offline, none invented', () => {
  const briefMe = () => {};
  const start = () => {};
  assert.deepEqual(focusAsks({ ritual: { label: 'Morning brief', start }, briefMe }).map((a) => [a.label, a.icon]), [['Morning brief', 'sun'], ['Brief me', 'brief']]);
  assert.equal(focusAsks({ ritual: { label: 'Evening reflection', start } })[0].icon, 'moon');
  assert.deepEqual(focusAsks({ briefMe }, { offline: true }), []);
  assert.deepEqual(focusAsks({}), [], 'nothing to offer, no pills');
  assert.deepEqual(focusAsks(null), []);
});

test('the peek and the words he asked: the thread\'s newest line; his question until she answers it', () => {
  const lines = [{ who: 'you', text: 'How did I sleep?' }, { who: 'nova', agent: 'Coach', text: 'Seven  hours\ntwenty.' }];
  assert.deepEqual(peekLine(lines), { who: 'Coach', text: 'Seven hours twenty.' });
  assert.deepEqual(peekLine([{ who: 'you', text: 'Hi' }, { who: 'nova', text: '  ' }]), { who: 'You', text: 'Hi' });
  assert.equal(peekLine([]), null);
  assert.equal(lastYours([{ who: 'you', text: 'How did I sleep?' }]), 'How did I sleep?');
  assert.equal(lastYours([{ who: 'you', text: 'q' }, { who: 'nova', text: 'part', streaming: true }]), 'q', 'still arriving: his question stays');
  assert.equal(lastYours([{ who: 'you', text: 'q' }, { who: 'nova', text: 'done' }]), null, 'answered');
});

test('subtitles On/Off persist per device, on unless he turned them off', () => {
  assert.equal(CAPTIONS_KEY, 'novaos.captions');
  assert.equal(captionsOn(null), true);
  assert.equal(captionsOn('on'), true);
  assert.equal(captionsOn('off'), false);
  const fx = read('src/NovaFocus.jsx');
  assert.match(fx, /localStorage\.getItem\(CAPTIONS_KEY\)/);
  assert.match(fx, /localStorage\.setItem\(CAPTIONS_KEY, on \? 'on' : 'off'\)/);
  assert.match(fx, /aria-pressed=\{captions\}/);
});

// ------------------------------------------------------- the history entry --

test('focus is its own history entry, folded into pagesFromHistory; the thread asks for it, never holds it', () => {
  const app = read('src/App.jsx');
  assert.match(app, /pushState\(\{ novaDepth: depthOf\(st\) \+ 1, novaOverlay: 'novafocus' \}, ''\)/);
  assert.match(app, /closeNovaFocus\(\) \{\n\s*if \(typeof window !== 'undefined' && window\.history\.state\?\.novaOverlay === 'novafocus'\) \{ window\.history\.back\(\); return; \}/);
  assert.match(app, /\.\.\.this\.recordFromHistory\(\), \.\.\.this\.novaFocusFromHistory\(\) \};/);
  assert.match(app, /novaFocusFromHistory\(\) \{[\s\S]{0,300}if \(!onEntry && this\.state\.novaFocus\) return \{ novaFocus: false \};\n\s*if \(onEntry && !this\.state\.novaFocus\) return \{ novaFocus: true \};/);
  assert.match(app, /novaFocus: false,/, 'closed at boot');
  const thread = read('src/screens/NovaThread.jsx');
  assert.match(thread, /const focus = !!T\.focus && \(typeof window === 'undefined' \|\| window\.history\.state\?\.novaOverlay === 'novafocus'\);/, 'only on its own entry: a stale flag never draws');
  assert.doesNotMatch(thread, /setFocus\(/, 'no local copy of the focus');
  assert.match(thread, /T\.syncFocus\(\);/, 'a focus left open on an old entry closes on arrival');
});

test('the view model offers the door and walks it only when asked', () => {
  const calls = [];
  const app = {
    state: { novaStyle: 'summary', screen: 'voice', voiceChat: [], orbChat: [], glassBeats: [], novaFocus: true },
    openNovaFocus: () => calls.push('open'), closeNovaFocus: () => calls.push('close'), syncNovaFocus: () => calls.push('sync'),
  };
  const v = { glass: null, briefQueue: null, attach: { pending: [] }, routePreview: () => ({ lane: 'ask' }) };
  const T = valsNovaThread(app, {}, v).novaThread;
  assert.equal(T.focus, true);
  assert.deepEqual(calls, [], 'building it walks nothing');
  T.openFocus(); T.closeFocus(); T.syncFocus();
  assert.deepEqual(calls, ['open', 'close', 'sync']);
  assert.equal(valsNovaThread({ ...app, state: { ...app.state, novaFocus: false } }, {}, v).novaThread.focus, false);
});

// ------------------------------------------------------ source contracts --

test('the full screen: an aria-modal page the edge swipe can take, the ⌄ its close, and three ways back', () => {
  const fx = read('src/NovaFocus.jsx');
  assert.match(fx, /role="dialog" aria-modal="true" aria-label="Nova, full screen" data-edge-page/);
  assert.match(fx, /style=\{\{ zIndex: 71, '--fx-hue': speaker\.hue \}\}/, 'over the top bar (70), under the tab bar (72)');
  assert.match(fx, /className="nv-fx-btn" data-edge-close onClick=\{T\.closeFocus\} aria-label="Back to the thread"/);
  assert.match(fx, /if \(d && phase === 'stage' && d\.moved < 10 && performance\.now\(\) - d\.t < 600\) T\.closeFocus\(\);/, 'a tap outside the plate on the stage');
  assert.match(fx, /e\.target\.closest\('button, a, input, \.nv-fx-plate, \.nv-fx-dock'\)/, 'never a tap on the plate or a panel');
  assert.match(fx, /if \(d\.dy < -48 \|\| d\.v < -0\.5\) onBack\(\);/, 'a swipe up on the peek, past 48 px or a flick');
  assert.match(fx, /<StageCard card=\{stage\.hero\} face="summary" \/>/, 'panels dock as the house StageCard');
  // the thread: the newest line at the foot when he returns
  const thread = read('src/screens/NovaThread.jsx');
  assert.match(thread, /if \(m\) m\.scrollTop = m\.scrollHeight;/);
});

test('the field canvas: one canvas, a capped count, stopped while the page is hidden, still under reduced motion', () => {
  assert.ok(FIELD_EMBERS <= FIELD_EMBERS_CAP && FIELD_EMBERS_CAP <= 140, `fewer and finer than the mockup's 230: ${FIELD_EMBERS}`);
  const fx = read('src/NovaFocus.jsx');
  assert.equal((fx.match(/<canvas /g) || []).length, 1, 'one canvas');
  const field = fx.slice(fx.indexOf('function useEmberField'));
  assert.match(field, /Array\.from\(\{ length: FIELD_EMBERS \}/);
  assert.match(field, /document\.addEventListener\('visibilitychange', onVis\)/);
  assert.match(field, /if \(document\.visibilityState === 'visible'\) raf = requestAnimationFrame\(loop\);/);
  assert.match(field, /if \(reducedMotion\(\)\) \{\n\s*\/\/ one still frame[^\n]*\n\s*step\(0, 0\); draw\(\);\n\s*return/);
  assert.match(field, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/, 'the canvas resolution is capped');
  // the captions' loop stops while hidden too
  const caps = fx.slice(fx.indexOf('function Captions'), fx.indexOf('function Peek'));
  assert.match(caps, /visibilitychange/);
  assert.doesNotMatch(fx, /fontSize|font: ?['"`]/, 'type lives in the CSS block');
});

test('the CSS: namespaced .nv-fx-*, after the thread\'s block at the end, never below 15px, 44px targets, both reduced settings honoured', () => {
  const css = read('src/index.css');
  const start = css.indexOf('THE FULL-SCREEN NOVA (3 Oct 2026)');
  const endMark = '/* end of the full-screen Nova */';
  const end = css.indexOf(endMark);
  assert.ok(start > 0 && end > start, 'the .nv-fx-* block');
  assert.ok(start > css.indexOf('/* end of the Nova thread */'), 'after the thread\'s block');
  const after = css.slice(end + endMark.length).trim();
  assert.ok(after === '' || after.startsWith('/*'), 'only a later block follows, opening with its banner');
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const sizes = [];
  for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = rule[1].trim();
    if (!/^(from|to|\d+%)/.test(sel)) assert.match(sel, /nv-fx/, `a selector outside the namespace: ${sel}`);
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ sel, px: Number(px[1]) });
    }
  }
  assert.ok(sizes.length >= 12, `read the full screen's type: ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 15).map((s) => `${s.sel}: ${s.px}px`);
  assert.deepEqual(small, [], `below 15px in focus:\n  ${small.join('\n  ')}`);
  for (const cls of ['nv-fx-btn', 'nv-fx-ask', 'nv-fx-send']) {
    const rule = new RegExp(`\\.${cls} \\{[^}]*height: (\\d+)px`).exec(block);
    assert.ok(rule && Number(rule[1]) >= 44, `${cls} is a 44px target`);
  }
  assert.match(block, /\.nv-fx-peek \{[^}]*min-height: 52px/);
  assert.match(block, /\.nv-fx-corehit \{ position: absolute; inset: 0;/, 'the core itself is the talk target');
  // the travel: transform only, 480 ms on the house ease; reduced motion cuts it
  assert.match(block, /\.nv-fx-core \{[^}]*transition: transform calc\(480ms \* var\(--fx-slow\)\) var\(--nv-ease\)/);
  assert.match(block, /\.nv-fx\[data-phase="stage"\] \.nv-fx-core \{ transform: translate\(var\(--fx-sx, 0px\), var\(--fx-sy, 0px\)\) scale\(\.4\); \}/);
  const rm = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.nv-fx-core, [^{]*\{ transition: opacity \.2s ease; \}/, 'reduced motion: the travel is a cut');
  assert.match(rm, /\.nv-fx-sky i, [^{]*\{ animation: none; \}/, 'and the sky holds still');
  // reduced transparency: the app-wide guard (which must stay the file's last
  // such block) turns the full screen's glass solid
  assert.ok(css.lastIndexOf('@media (prefers-reduced-transparency: reduce)') < start);
  const rt = css.slice(css.lastIndexOf('@media (prefers-reduced-transparency: reduce)'));
  assert.match(rt.slice(0, rt.indexOf('\n}\n') + 3), /\.nv-fx \.nv-fx-plate, \.nv-fx \.nv-fx-panel, \.nv-fx \.nv-fx-peek, \.nv-fx \.nv-fx-btn, \.nv-fx \.nv-fx-ask \{ background: var\(--fx-g1\); \}/);
});

test('the classic Voice screen is untouched: the full screen lives on the summary thread only', () => {
  const voice = read('src/screens/Voice.jsx');
  assert.doesNotMatch(voice, /NovaFocus|nv-fx/);
  assert.match(read('src/screens/NovaThread.jsx'), /import \{ NovaFocus \} from '\.\.\/NovaFocus\.jsx';/);
  for (const f of ['src/NovaFocus.jsx', 'src/novaFocusFacts.js', 'src/subtitlePace.js', 'src/speechClock.js']) {
    const src = read(f).replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /\bfetch\(|\bapi\.|from '\.\.?\/api\.js'/, `${f} reaches no network`);
  }
});
