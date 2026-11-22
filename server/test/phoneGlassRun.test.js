// THE PHONE'S GLASS TELLS THE TRUTH (23 Nov 2026, src/PhoneStage.jsx). Runs the real source text of the phone's glass api (state and run)
// and of usePhonePanels' away derivation against stubbed state, since PhoneStage needs a DOM. A command that claims success must have moved something; one that cannot says false, and his words go to Nova.
// It extracts the text between known markers, so it exercises the lines in the file, not a copy.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { stagePanels } from '../../src/stagePanels.js';
import { glassCommand, glassReceipt } from '../../src/glassVoice.js';

const src = readFileSync(new URL('../../src/PhoneStage.jsx', import.meta.url), 'utf8');

// ---- the glass api block
const a0 = src.indexOf('glassApi.current = {');
const a1 = src.indexOf('\n  };\n', a0) + 5;
assert.ok(a0 > 0 && a1 > a0, 'found the glass api block');
const apiText = src.slice(a0, a1);
const makeApi = new Function('ordered', 'away', 'hero', 'openKey', 'closing', 'closeOpen', 'setGone', 'setOpenKey', 'openIt', 'setForced', 'T',
  `const glassApi = { current: null }; ${apiText} return glassApi.current;`);

// ---- the `away` derivation inside usePhonePanels
const b0 = src.indexOf('const away = (() => {');
const b1 = src.indexOf('})();', b0) + 5;
assert.ok(b0 > 0 && b1 > b0, 'found the away derivation');
const awayText = src.slice(b0, b1);
const makeAway = new Function('gone', 'stagePanels', 'stageIn', `${awayText} return away;`);

const card = (kind, extra) => ({ kind, ...extra });
const CHART = { key: 'v1', card: card('bars', { title: 'Headset share', label: 'HEADSET SHARE', bars: [{ label: 'a', value: 1 }] }) };
const VIDEO = { key: 'lk:v1', card: card('video', { title: 'Busy Bar review', label: 'REVIEWER', channel: 'Reviewer' }) };
const PAGE = { key: 'lk:p1', card: card('page', { title: 'Busy Bar page', host: 'theverge.com' }) };

// a stage with its own state, so commands can be chained the way a person would say them
function stage({ panels = [CHART, VIDEO, PAGE], gone = new Set(), openKey = null, closing = false, recall = undefined } = {}) {
  const s = { panels, gone: new Set(gone), openKey, closing, closed: 0, opened: [], forced: null };
  const stageIn = { lookup: [], model: panels.map((p) => ({ key: p.key, card: p.card })), proposal: null };
  const view = () => {
    const ordered = stagePanels({ ...stageIn, gone: s.gone });
    const away = makeAway(s.gone, stagePanels, stageIn);
    const hero = ordered.length ? ordered[ordered.length - 1] : null;
    return makeApi(ordered, away, hero, s.openKey, s.closing,
      () => { s.closed += 1; s.openKey = null; },
      (f) => { s.gone = f(s.gone); },
      (k) => { s.openKey = typeof k === 'function' ? k(s.openKey) : k; },
      (k) => { s.opened.push(k); s.openKey = k; },
      (f) => { s.forced = f; },
      { recallGlass: recall });
  };
  // say it: the grammar picks the command from the state, the api acts, the receipt is what he hears
  const say = (words) => {
    const api = view();
    const cmd = glassCommand(words, api.state());
    if (!cmd) return { cmd: null, ran: null, receipt: '' };
    const ran = api.run(cmd);
    return { cmd, ran, receipt: ran ? glassReceipt(cmd) : '' };
  };
  return { s, view, say };
}


const ok = (name, fn) => test(name, fn);

ok('restore with a panel open closes it, once, and says so', () => {
  const t = stage({ openKey: 'v1' });
  const r = t.say('put it back');
  assert.equal(r.ran, true); assert.equal(t.s.closed, 1); assert.equal(t.s.openKey, null); assert.equal(r.receipt, 'Back as it was.');
});
ok('restore with nothing open returns false, touches nothing, and so says nothing', () => {
  const t = stage();
  const r = t.say('put it back');
  assert.equal(r.cmd.cmd, 'restore'); assert.equal(r.ran, false); assert.equal(r.receipt, ''); assert.equal(t.s.closed, 0);
});
ok('restore while the panel is already closing does not start a second close, and is true', () => {
  const t = stage({ openKey: 'v1', closing: true });
  const r = t.say('go back');
  assert.equal(r.ran, true); assert.equal(t.s.closed, 0);
});
for (const w of ['show the history', 'show me the transcript', 'words on', 'hide the words', 'subtitles off', 'what did you say']) {
  ok(`"${w}" claims nothing on the phone`, () => {
    const t = stage();
    const before = JSON.stringify([...t.s.gone, t.s.openKey, t.s.forced]);
    const r = t.say(w);
    assert.ok(r.cmd && ['history', 'words', 'nowords'].includes(r.cmd.cmd), `${w} -> ${JSON.stringify(r.cmd)}`);
    assert.equal(r.ran, false); assert.equal(r.receipt, '');
    assert.equal(JSON.stringify([...t.s.gone, t.s.openKey, t.s.forced]), before, 'nothing moved');
  });
}
ok('put the video away, then bring it back: it is offered, it returns, the receipt is true', () => {
  const t = stage();
  assert.equal(t.say('put the video away').ran, true);
  assert.ok(t.s.gone.has('lk:v1'));
  assert.deepEqual(t.view().state().history.map((h) => h.key), ['lk:v1']);
  const r = t.say('bring back the review video');
  assert.deepEqual(r.cmd, { cmd: 'bring', key: 'lk:v1', title: 'Busy Bar review' }); assert.equal(r.ran, true); assert.equal(r.receipt, 'Busy Bar review is back.');
  assert.equal(t.s.gone.size, 0);
});
ok('clear the screen, then "bring back that" returns the one put away last, newest first', () => {
  const t = stage();
  t.say('put the chart away');
  t.say('put the page away');
  const hist = t.view().state().history.map((h) => h.key);
  assert.deepEqual(hist, ['lk:p1', 'v1'], 'most recently put away first');
  const r = t.say('bring back that');
  assert.equal(r.cmd.key, 'lk:p1'); assert.equal(r.ran, true);
});
ok('"clear the screen" no longer brings back what he put away earlier', () => {
  const t = stage();
  t.say('put the chart away');
  t.say('clear the screen');
  assert.deepEqual([...t.s.gone].sort(), ['lk:p1', 'lk:v1', 'v1']);
  assert.equal(t.view().state().panels.length, 0);
  assert.equal(t.view().state().history.length, 3);
});
ok('clear everything except the price keeps what was put away before away', () => {
  const t = stage();
  t.say('put the chart away');
  const r = t.say('keep just the video');
  assert.equal(r.cmd.cmd, 'clear-except');
  assert.deepEqual([...t.s.gone].sort(), ['lk:p1', 'v1']);
});
ok('a panel that is still up has nothing to bring back: false, so the words go to Nova', () => {
  const t = stage();
  const r = t.say('bring up the chart');
  assert.equal(r.cmd.cmd, 'bring'); assert.equal(r.ran, false); assert.equal(r.receipt, '');
});
ok('bring back a name that is not there at all: the grammar says null, never reaches run', () => {
  const t = stage();
  assert.equal(t.say('bring back the protein chart').cmd, null);
});
ok('putting away the open panel closes it too, so no scrim is left over nothing', () => {
  const t = stage({ openKey: 'v1' });
  t.say('put the chart away');
  assert.equal(t.s.openKey, null);
});
ok('maximise opens a panel; a key that is not up is false', () => {
  const t = stage();
  const r = t.say('Can you, uh, can you maximise the headset share chart, please?');
  assert.deepEqual(r.cmd, { cmd: 'maximise', key: 'v1', title: 'Headset share' }); assert.equal(r.ran, true); assert.deepEqual(t.s.opened, ['v1']);
  assert.equal(t.view().run({ cmd: 'maximise', key: 'nope', title: 'x' }), false);
});
ok('"make it bigger" with nothing lit opens the newest panel (the hero on the phone)', () => {
  const t = stage();
  const r = t.say('make it bigger');
  assert.equal(r.cmd.key, 'lk:p1'); assert.equal(r.ran, true);
});
ok('"make it bigger" with nothing up is not a command at all', () => {
  const t = stage({ panels: [] });
  assert.equal(t.say('make it bigger').cmd, null);
});
ok('the camera is not this layer: run returns null so the stage around it answers', () => {
  const t = stage();
  assert.equal(t.view().run({ cmd: 'camera-beam' }), null);
  assert.equal(t.view().run({ cmd: 'highlight', what: 'pumpkin' }), null);
});
ok('recall is handed to the thread when it can, false when it cannot', () => {
  assert.equal(stage({ recall: undefined }).view().run({ cmd: 'recall', raw: 'x' }), false);
  const got = [];
  assert.equal(stage({ recall: (c) => { got.push(c.raw); return Promise.resolve('line'); } }).view().run({ cmd: 'recall', raw: 'x' }) instanceof Promise, true);
  assert.deepEqual(got, ['x']);
});
ok('tidy deals everything out, as before', () => {
  const t = stage();
  const r = t.say('tidy up');
  assert.equal(r.ran, true); assert.equal(t.s.forced, 'all');
});
ok('the away list never offers a panel whose data is gone', () => {
  const t = stage();
  t.say('put the chart away');
  t.s.gone.add('ghost-key-with-no-card');
  assert.deepEqual(t.view().state().history.map((h) => h.key), ['v1']);
});
ok('with nothing put away the list is empty and costs no second pass', () => {
  assert.deepEqual(stage().view().state().history, []);
});
