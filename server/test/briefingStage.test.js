// THE BRIEFING, ROUND 2 (9 Oct 2026, design/mockups/83-redesign-briefing-r2.html,
// his "Looking good"). Three things pinned here:
//   1. the rules the stage stands on (src/briefingFacts.js): the parts, skip
//      and back, a plain sentence with no panel, the boards, the phase;
//   2. THE END CARD SAYS WHAT THE CODE DOES: every verb's line is held to the
//      path it names, from the button to the server, so a line can never go
//      on promising Wiki/Sources while the page lands in Wiki/Inbox again
//      (the round-1 audit's finding 7);
//   3. THE BRIEFING'S STAGE NEVER POURS: his "remove the sparks moving from
//      the nova icon to the subtitles", while the thread keeps its pour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIEFING_VERBS, VERB_GROUPS, SAVE_STATES, endCardRows, partsOf, nextPartBeat, backPartBeat, panelOf, boardPicture,
  briefingPhase, boardSpot, macBoardSpot, BOARD_TILT, countsLine, countWord, titleCount,
} from '../../src/briefingFacts.js';
import { focusPours, WORD_LOOK } from '../../src/novaFocusFacts.js';
import { valsBriefing } from '../../src/vals/valsBriefing.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
// a class method's body in App.jsx, from its signature to its closing brace
const method = (src, name) => {
  const at = src.indexOf(`\n  ${name}(`);
  assert.ok(at > 0, `App.${name} exists`);
  const end = src.indexOf('\n  }\n', at);
  return src.slice(at, end + 4);
};

// ------------------------------------------------------------- a fixture --

const sections = [
  { heading: 'What caffeine does', body: 'a' }, { heading: 'How long it stays', body: 'b' }, { heading: 'What the evidence says', body: 'c' },
];
const beats = [
  { i: 0, kind: 'summary', section: -1, say: 'In brief.', visual: { kind: 'title', title: 'T' } },
  { i: 1, kind: 'section-open', section: 0, say: 'Caffeine sits in the receptor.', visual: { kind: 'image', key: 'k1', alt: 'receptor', caption: 'The receptor', credit: 'Commons' } },
  { i: 2, kind: 'beat', section: 0, say: 'A plain sentence.', visual: { kind: 'heading', n: 1, of: 3, heading: 'What caffeine does' } },
  { i: 3, kind: 'section-open', section: 1, say: 'Its half-life is five hours.', visual: { kind: 'term', term: 'Half-life', plain: 'The time to clear half.' } },
  { i: 4, kind: 'beat', section: 1, say: 'So half is left at eight.', visual: { kind: 'heading', n: 2, of: 3, heading: 'How long it stays' } },
  { i: 5, kind: 'beat', section: 1, say: 'A quarter at one.', visual: { kind: 'heading', n: 2, of: 3, heading: 'How long it stays' } },
  { i: 6, kind: 'section-open', section: 2, say: 'Small lab trials.', visual: { kind: 'clip', videoId: 'abc', title: 'A talk', posterKey: 'p1' } },
];
const glossary = [{ term: 'Half-life', plain: 'The time to clear half.' }];

// ---------------------------------------------------------------- 1 · rules --

test('the parts: one per section, filling by the beat whose audio has started; the summary is no part', () => {
  const at = (c) => partsOf(sections, beats, c).map((p) => [p.n, Math.round(p.f * 100), p.current]);
  assert.deepEqual(at(-1), [[1, 0, false], [2, 0, false], [3, 0, false]], 'not started');
  assert.deepEqual(at(0), [[1, 0, false], [2, 0, false], [3, 0, false]], 'the summary fills nothing');
  assert.deepEqual(at(1), [[1, 50, true], [2, 0, false], [3, 0, false]]);
  assert.deepEqual(at(4), [[1, 100, false], [2, 67, true], [3, 0, false]]);
  const p = partsOf(sections, beats, 4);
  assert.deepEqual(p.map((x) => x.first), [1, 3, 6], 'where each part starts, for a rail tap and a board');
});

test('next part and back a part are the voice command\'s own rules', () => {
  assert.equal(nextPartBeat(beats, 0), 1, 'from the summary to part 1');
  assert.equal(nextPartBeat(beats, 4), 6);
  assert.equal(nextPartBeat(beats, 6), -1, 'no part after the last: the end');
  assert.equal(backPartBeat(beats, 5), 3, 'from inside a part, to its start');
  assert.equal(backPartBeat(beats, 3), 1, 'from a part\'s start, to the part before');
  assert.equal(backPartBeat(beats, 0), 0);
  // the voice path in App keeps the same rules (tryBriefingVoice)
  const app = read('src/App.jsx');
  assert.match(method(app, 'tryBriefingVoice'), /const target = cur > start \? start : sectionStart\(Math\.max\(0, start - 1\)\);/);
});

test('a plain sentence gets no panel; a picture without its bytes is its term or nothing; a clip waits for a tap', () => {
  const urls = { k1: 'blob:img', p1: 'blob:poster' };
  assert.equal(panelOf(beats[0], { glossary, urls }), null, 'the summary\'s title card is gone');
  assert.equal(panelOf(beats[2], { glossary, urls }), null, 'a heading card is gone: Nova himself is the picture');
  assert.equal(panelOf(beats[1], { glossary, urls }).kind, 'image');
  assert.equal(panelOf(beats[1], { glossary, urls: {} }), null, 'no picture, no panel');
  const named = { ...beats[1], say: 'The half-life of it.' };
  assert.equal(panelOf(named, { glossary, urls: {} }).term, 'Half-life', 'the term the sentence names stands in');
  const t = panelOf(beats[3], { glossary, urls });
  assert.deepEqual([t.kind, t.term, t.of], ['term', 'Half-life', 1]);
  const c = panelOf(beats[6], { glossary, urls });
  assert.equal(c.kind, 'clip');
  assert.match(c.embed, /youtube-nocookie\.com\/embed\/abc\?/);
  assert.doesNotMatch(c.embed, /autoplay=1/, 'never two voices at once');
});

test('each board carries what its part showed, and Nova himself when it showed nothing', () => {
  const urls = { k1: 'blob:img', p1: 'blob:poster' };
  const parts = partsOf(sections, beats, -1);
  assert.deepEqual(boardPicture(parts[0], beats, { glossary, urls }), { kind: 'image', src: 'blob:img', alt: 'receptor' });
  assert.deepEqual(boardPicture(parts[1], beats, { glossary, urls }), { kind: 'term', term: 'Half-life' });
  assert.deepEqual(boardPicture(parts[2], beats, { glossary, urls }), { kind: 'image', src: 'blob:poster', alt: 'A talk' });
  assert.deepEqual(boardPicture(parts[0], beats, { glossary, urls: {} }), { kind: 'core' });
});

test('the phase: Read is the page; the end is the boards unless he is asking; a panel is the stage; else home', () => {
  assert.equal(briefingPhase({ mode: 'read', atEnd: true }), 'read');
  assert.equal(briefingPhase({ atEnd: true }), 'end');
  assert.equal(briefingPhase({ atEnd: true, asking: true }), 'home', 'Ask about it takes the boards back into the core');
  assert.equal(briefingPhase({ panel: { kind: 'term' } }), 'stage');
  assert.equal(briefingPhase({}), 'home');
});

test('the boards: three and three at 390, each askew; one fanned row on the Mac', () => {
  const s = [0, 1, 2, 3, 4, 5].map((i) => boardSpot(i, 390));
  assert.deepEqual(s.map((x) => x.left), [31, 143, 255, 31, 143, 255], 'centred, 8 apart');
  assert.deepEqual(s.map((x) => x.top), [2, 2, 2, 114, 114, 114]);
  assert.deepEqual(s.map((x) => x.tilt), BOARD_TILT);
  assert.deepEqual(BOARD_TILT, [-2.5, 1.5, -1.5, 2, -2, 2.5], 'the mockup\'s angles');
  const m = [0, 1, 2, 3, 4].map((i) => macBoardSpot(i, 5));
  assert.deepEqual(m.map((x) => x.tilt), [-6, -3, 0, 3, 6]);
  assert.deepEqual(m.map((x) => x.top), [68, 54, 40, 54, 68], 'the outer ones lower');
  assert.deepEqual(m.map((x) => x.left), [0, 1, 2, 3, 4].map((i) => 390 + (i - 2) * 152 - 70), 'centred on the 780 stage, 152 apart');
  assert.equal(countsLine({ parts: 5, sources: 6, terms: 4 }), '5 parts · 6 sources · 4 terms');
  assert.equal(countsLine({ parts: 1, sources: 1 }), '1 part · 1 source');
  assert.equal(titleCount(5), 'Five');
  assert.equal(countWord(4), 'four');
});

// ------------------------------------- 2 · the end card says what code does --

test('the end card: four groups, every verb with one line, none of them a bare Keep, Noted or Let it go', () => {
  assert.deepEqual(VERB_GROUPS.map((g) => g.label), ['Keep the information', 'Think it over', 'Change something', 'Not for you']);
  assert.deepEqual(BRIEFING_VERBS.map((v) => [v.key, v.group]), [['save', 'keep'], ['ask', 'think'], ['later', 'think'], ['coach', 'change'], ['discard', 'none']]);
  for (const v of BRIEFING_VERBS) {
    assert.ok(v.line && v.line.length > 20, `${v.key} says what it does`);
    assert.doesNotMatch(`${v.label} ${v.line}`, /[—–]/, `${v.key}: no dashes in his copy`);
    assert.doesNotMatch(v.label, /^(Keep it|Keep in vault|Noted|Let it go|Approve|Not now)$/);
  }
  for (const s of Object.values(SAVE_STATES)) assert.doesNotMatch(`${s.label} ${s.line}`, /[—–]/);
  // his call 3, drawn as the default: the Coach's slot exists, disabled, and says so
  const coach = BRIEFING_VERBS.find((v) => v.key === 'coach');
  assert.equal(coach.built, false);
  assert.equal(coach.calls, null);
  assert.match(coach.line, /^Not built yet\./);
  // his call 5: Discard has no undo and says so
  assert.match(BRIEFING_VERBS.find((v) => v.key === 'discard').line, /no undo today/);
});

test('which rows show: undecided, every verb; saved, the receipt with Undo, and nothing left to decide', () => {
  assert.deepEqual(endCardRows('pending').map((r) => r.key), ['save', 'ask', 'later', 'coach', 'discard']);
  const saved = endCardRows('filed');
  assert.deepEqual(saved.map((r) => r.key), ['save', 'ask', 'coach'], 'Decide later and Discard step aside');
  assert.equal(saved[0].done.label, 'Saved to Wiki/Inbox');
  assert.equal(saved[0].done.undo, true, 'Undo on the same row');
  assert.deepEqual(endCardRows('undone').map((r) => r.key), ['save', 'ask', 'coach']);
  assert.equal(endCardRows('undone')[0].done.undo, undefined, 'an undone save has nothing more to undo');
  assert.equal(endCardRows('pending', { saveState: 'edited' })[0].done.line.includes('left in place'), true);
  assert.equal(endCardRows('discarded')[0].done.label, 'Discarded');
});

test('Save to your notes: the button files through the Inbox, the route is "note", and a note lands in Wiki/Inbox, off the Library shelf', () => {
  const save = BRIEFING_VERBS.find((v) => v.key === 'save');
  assert.match(save.line, /Wiki\/Inbox/);
  assert.match(save.line, /off your Library shelf/);
  const app = read('src/App.jsx');
  assert.equal(save.calls, 'fileBriefing');
  assert.match(method(app, save.calls), new RegExp(`api\\.${save.api}\\(conn, id\\)`));
  assert.doesNotMatch(method(app, save.calls), /toastMsg\('Kept/, 'no "Kept" toast one screen from its Undo');
  // the route the record carries, and where that route writes
  const brief = read('server/lib/briefing.js');
  assert.match(brief, /decision: \{\n\s*route: 'note',/);
  const inbox = read('server/lib/inbox.js');
  assert.match(inbox, /const INBOX_DIR_REL = 'Wiki\/Inbox';/);
  assert.match(inbox, /\/\/ note\n\s*const base = sanitizeFilename\(payload\.title\);\n\s*let relPath = `\$\{INBOX_DIR_REL\}\/\$\{base\}\.md`;/);
  // the Library shelf the next briefing weighs reads Wiki/Sources, which a note is not in
  assert.match(read('server/lib/sourceShelf.js'), /Wiki\/Sources/);
  // the old tooltip that promised Wiki/Sources is gone
  assert.doesNotMatch(read('src/screens/Briefing.jsx'), /Wiki\/Sources/);
});

test('Undo on the save row: the note filer\'s undo, which leaves an edited page in place, and the row says so', () => {
  const app = read('src/App.jsx');
  const undo = method(app, 'undoFileBriefing');
  assert.match(undo, /api\.inboxUndo\(conn, id\)/);
  assert.match(undo, /edited since filing/);
  assert.match(SAVE_STATES.saved.line, /if you have not edited it/);
  const inbox = read('server/lib/inbox.js');
  assert.match(inbox, /if \(undo\.route === 'note'\) \{[\s\S]{0,300}if \(hash !== undo\.hash\) throw new Error\('that note has been edited since filing/);
});

test('Decide later writes nothing, and a waiting briefing is never trimmed or expired, so it stays playable', () => {
  const later = BRIEFING_VERBS.find((v) => v.key === 'later');
  assert.match(later.line, /still playable\. Nothing is written\./);
  const app = read('src/App.jsx');
  assert.doesNotMatch(method(app, later.calls), /api\./, 'closing writes nothing');
  const store = read('server/lib/inboxStore.js');
  assert.match(store, /const UNRESOLVED = new Set\(\['classifying', 'pending', 'error'\]\);/, 'only decided records are trimmed');
  const inbox = read('server/lib/inbox.js');
  const expiry = /const TIME_VALUE_HOURS = \{([\s\S]*?)\};/.exec(inbox)[1];
  assert.doesNotMatch(expiry, /briefing/, 'a briefing is not on the expiry list');
});

test('Discard writes nothing and cannot be reopened: only a Coach card reopens', () => {
  const discard = BRIEFING_VERBS.find((v) => v.key === 'discard');
  const app = read('src/App.jsx');
  assert.match(method(app, discard.calls), /api\.inboxDiscard\(conn, id\)/);
  const inbox = read('server/lib/inbox.js');
  assert.match(inbox, /const coachCard = record\.kind === 'coach-program' \|\| COACH_ROUTES\.includes\(record\.decision\?\.route\);/);
  assert.match(inbox, /if \(!coachCard \|\| !hisAnswer\) throw new Error/);
});

test('Ask about it: the stage\'s own microphone, and his words reach Nova with this briefing as their context; nothing is filed', () => {
  const app = read('src/App.jsx');
  const ask = method(app, 'askBriefing');
  assert.doesNotMatch(ask, /api\./, 'asking marks the ask; it files nothing');
  assert.match(ask, /this\.pauseBriefing\(\);/);
  assert.match(app, /if \(this\.state\.screen === 'briefing' && this\.state\.briefingAsk && this\.askAboutBriefing\(q\)\) return;/, 'doOrb hands an ask on the stage to the briefing');
  const about = method(app, 'askAboutBriefing');
  assert.match(about, /this\.askNova\(q, context\);/);
  assert.match(about, /this\.briefingAfterAsk = \{ id: doc\.id, from: Math\.max\(0, cur\) \};/, 'mid-briefing: then "carry on"');
  // explain that again, asked on the stage, stays on the stage
  assert.match(method(app, 'tryBriefingVoice'), /if \(this\.state\.screen !== 'briefing'\) this\.navigate\('voice'\);/);
  const screen = read('src/screens/Briefing.jsx');
  assert.match(screen, /const dict = useDictation\(/, 'the stage has its own microphone');
});

test('the view model wires each verb to the method its line names, and walks none while building', () => {
  const calls = [];
  const app = new Proxy({
    state: {
      screen: 'briefing', briefingMode: 'listen', voiceChat: [], briefingMediaUrls: {},
      briefing: { id: 'b1', status: 'pending', createdAt: '2026-10-05T09:00:00Z', briefing: { title: 'T', summary: 's', sections, glossary, sources: [] }, beats },
      briefingPlay: { id: 'b1', playing: false, current: beats.length - 1 },
    },
  }, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])) });
  const { briefing: b, briefingStage } = valsBriefing(app, {});
  assert.equal(briefingStage, true);
  assert.equal(b.phase, 'end');
  assert.deepEqual(calls, [], 'building it walks nothing');
  const verbs = Object.fromEntries(b.groups.flatMap((g) => g.verbs).map((v) => [v.key, v]));
  for (const v of BRIEFING_VERBS) {
    if (!v.calls) { assert.equal(verbs[v.key].run, null, `${v.key} is not built and does nothing`); continue; }
    calls.length = 0;
    verbs[v.key].run();
    assert.equal(calls[0][0], v.calls, `${v.key} runs App.${v.calls}`);
  }
  assert.equal(b.parts.length, 3);
  assert.equal(b.allWord, 'Three');
  assert.equal(b.panel, null, 'at the end the boards carry the pictures');
});

// ---------------------------------------------------- 3 · no pour, ever --

test('the Briefing\'s stage never pours: a mode of the full-screen Nova with the pour switched off, words fading up in place', () => {
  assert.equal(focusPours('briefing'), false);
  assert.equal(focusPours('thread'), true, 'the thread keeps its pour');
  assert.deepEqual(WORD_LOOK.briefing, { rise: 4, blur: 3, arrive: 240, whole: true }, 'the mockup\'s fade in place');
  const fx = read('src/NovaFocus.jsx');
  assert.match(fx, /const pours = focusPours\(mode\);/);
  assert.match(fx, /pour=\{pours \? pour : null\}/, 'the captions get no pour on the briefing');
  assert.match(fx, /\{pours && <canvas ref=\{pourCanvasRef\} className="nv-fx-pour" aria-hidden="true" \/>\}/, 'and its canvas is never drawn');
  const screen = read('src/screens/Briefing.jsx');
  assert.match(screen, /<NovaFocus T=\{T\} S=\{Sx\} dict=\{dict\} since=\{listenSince\} leaving=\{false\} mode="briefing"/, 'a mode of the one stage, not a copy');
  assert.doesNotMatch(screen, /pour|drawPour|nv-fx-pour/i, 'the Briefing draws no pour of its own');
  assert.equal((screen.match(/<CoreFace|<NovaCore|<canvas/g) || []).length, 0, 'and no core or canvas of its own');
});

test('the Briefing\'s CSS: its own block at the end, nothing under 13px, its controls 44', () => {
  const css = read('src/index.css');
  const start = css.indexOf('THE BRIEFING, ROUND 2 (9 Oct 2026)');
  const end = css.indexOf('/* end of the Briefing */');
  assert.ok(start > css.indexOf('/* end of the full-screen Nova */') && end > start, 'after the full screen\'s block');
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const small = [];
  for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px && Number(px[1]) < 13) small.push(`${rule[1].trim()}: ${px[1]}px`);
    }
  }
  assert.deepEqual(small, [], 'no label under 13 (the audit found 7.5 to 9)');
  for (const cls of ['nv-bf-txb', 'nv-bf-tb', 'nv-bf-ln', 'nv-bf-back']) {
    const rule = new RegExp(`\\.${cls} \\{[^}]*(?:min-)?height: (\\d+)px`).exec(block);
    assert.ok(rule && Number(rule[1]) >= 44, `${cls} is a 44px target`);
  }
  assert.match(block, /\.nv-bf-segs button \{[^}]*height: 44px/, 'a rail segment is a 44px target');
  assert.match(block, /\.nv-bf-vrow, \.nv-bf-vdone \{[^}]*min-height: 58px/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.nv-fx\[data-mode="briefing"\] \.nv-fx-w::after \{ display: none; \}/, 'reduced motion: no underline, words whole');
  assert.doesNotMatch(block, /prefers-reduced-transparency/, 'the app-wide guard stays the last such block');
});

test('the honest empty state: a kept briefing that can no longer play is explained, never "No briefings yet"', () => {
  const screen = read('src/screens/Briefing.jsx');
  assert.doesNotMatch(screen, /No briefings yet/);
  assert.match(screen, /A briefing plays here while its Inbox record lasts, which is the newest 400 decisions\./);
  assert.match(read('server/lib/inboxStore.js'), /const MAX_RESOLVED = 400;/, 'the number the words say');
});

test('Close goes back to where he came from, and Read is a history level of its own', () => {
  const app = read('src/App.jsx');
  assert.match(method(app, 'openBriefing'), /this\.navigate\('briefing', \{/);
  const close = method(app, 'closeBriefing');
  assert.match(close, /window\.history\.go\(-steps\)/);
  assert.match(close, /this\.navigate\('inbox'\);/, 'opened cold, the Inbox as before');
  assert.match(method(app, 'openBriefingRead'), /pushState\(\{ novaDepth: depthOf\(st\) \+ 1, novaView: 'briefingRead' \}, ''\)/);
  assert.match(app, /\.\.\.this\.briefingReadFromHistory\(\), \.\.\.this\.fuelCardsFromHistory\(\), \.\.\.this\.moneyFromHistory\(\) \};/);
});
