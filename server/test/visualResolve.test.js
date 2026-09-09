// TURNING A NAMED PANEL INTO A REAL ONE.
//
// The rule his instruction sets: "visuals should always land in context, I'd
// rather them not dropped at all." So a panel that cannot be filled is never
// discarded and never shown late against the wrong sentence — it degrades to
// the words the model wrote, which are about what is being said either way.
//
// And the timecode rule: real, or go and find it, but NEVER an estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisual, resolveAll, findMoment, needsFetch, deps } from '../../server/lib/visualResolve.js';
import { normaliseSpec, keyOfSpec } from '../../src/visualBeats.js';

const spec = (o) => normaliseSpec({ label: 'Panel', ...o });
const CLIP = { videoId: 'abc123xyz', title: 'Alex Hormozi — Leverage', channel: 'The Game', posterKey: 'deadbeef' };

function stub({ image = null, clip = null, vault = [], captions = null } = {}) {
  const saved = { ...deps };
  deps.resolveImage = async () => image;
  deps.resolveClip = async () => clip;
  deps.searchVault = async () => vault;
  deps.captionsFor = async () => captions;
  return () => Object.assign(deps, saved);
}

test('a typographic panel needs nothing and is ready at once', () => {
  for (const k of ['key', 'steps', 'list', 'metric', 'bars']) assert.equal(needsFetch({ kind: k }), false);
  assert.equal(needsFetch({ kind: 'image' }), true);
  assert.equal(needsFetch({ kind: 'media' }), true);
});

test('an image comes back on Nova\'s own origin, with its credit', async () => {
  const undo = stub({ image: { key: 'abc', ext: '.jpg', credit: 'Wikimedia', sourceUrl: 'https://x/y' } });
  const v = await resolveVisual(spec({ kind: 'image', query: 'circadian curve' }));
  undo();
  assert.equal(v.src, '/api/briefing/media/abc.jpg');
  assert.equal(v.credit, 'Wikimedia');
});

test('THE RULE: an image that cannot be found degrades to the words, never to a broken frame', async () => {
  const undo = stub({ image: null });
  const v = await resolveVisual(spec({ kind: 'image', query: 'nothing at all', caption: 'what he is being told' }));
  undo();
  assert.equal(v.kind, 'key');
  assert.equal(v.state, 'no-media');
  assert.equal(v.caption, 'what he is being told');   // still says the right thing
  assert.equal(v.src, undefined);
});

test('a resolver that throws costs the picture, not the reply', async () => {
  const saved = { ...deps };
  deps.resolveImage = async () => { throw new Error('network gone'); };
  const v = await resolveVisual(spec({ kind: 'image', query: 'x', caption: 'c' }));
  Object.assign(deps, saved);
  assert.equal(v.kind, 'key');
});

test('his own vault supplies the stamp, and the link opens at it', async () => {
  const undo = stub({
    clip: CLIP,
    vault: [{ title: 'Hormozi — notes', text: '- 14:32 — Leverage: doing less work for more output.' }],
  });
  const v = await resolveVisual(spec({ kind: 'media', title: 'Alex Hormozi Leverage', moment: 'leverage less work more output' }), { vaultPath: '/v' });
  undo();
  assert.equal(v.stamp, '14:32');
  assert.equal(v.stampSource, 'vault');
  assert.equal(v.watchUrl, 'https://www.youtube.com/watch?v=abc123xyz&t=872s');
  assert.equal(v.src, '/api/briefing/media/deadbeef.jpg');
});

test('not in the vault — it goes and finds it in the captions', async () => {
  const undo = stub({
    clip: CLIP,
    vault: [],
    captions: [{ at: 10, text: 'welcome back' }, { at: 870, text: 'leverage means less work' }, { at: 873, text: 'for more output entirely' }],
  });
  const v = await resolveVisual(spec({ kind: 'media', title: 'Hormozi', moment: 'leverage less work more output' }), { vaultPath: '/v' });
  undo();
  assert.equal(v.stamp, '14:30');
  assert.equal(v.stampSource, 'captions');
});

test('NEVER AN ESTIMATE: no honest moment means no stamp, and the link opens at the start', async () => {
  const undo = stub({ clip: CLIP, vault: [], captions: [{ at: 10, text: 'entirely unrelated chatter' }] });
  const v = await resolveVisual(spec({ kind: 'media', title: 'Hormozi', moment: 'protein synthesis in older adults' }), { vaultPath: '/v' });
  undo();
  assert.equal(v.stamp, null);
  assert.equal(v.watchUrl, 'https://www.youtube.com/watch?v=abc123xyz');
});

test('a video that cannot be found at all degrades to the words', async () => {
  const undo = stub({ clip: null });
  const v = await resolveVisual(spec({ kind: 'media', title: 'nothing', caption: 'the idea itself' }));
  undo();
  assert.equal(v.kind, 'key');
  assert.equal(v.caption, 'the idea itself');
});

test('findMoment asks for nothing when there is nothing to look for', async () => {
  assert.equal(await findMoment({ kind: 'media' }, {}), null);
});

test('the pool resolves only what needs fetching, and reports each as it lands', async () => {
  const undo = stub({ image: { key: 'k', ext: '.png' } });
  const specs = [
    spec({ kind: 'key', caption: 'instant' }),
    spec({ kind: 'image', query: 'one' }),
    spec({ kind: 'image', query: 'two' }),
  ];
  const beats = specs.map((s, i) => ({ key: keyOfSpec(s, i), spec: s }));
  const landed = [];
  const out = await resolveAll(beats, {}, { onOne: (k) => landed.push(k) });
  undo();
  assert.equal(out.size, 2, 'the typographic panel was not fetched');
  assert.equal(landed.length, 2);
});

test('MEASURED LIVE (17.4s cold): the cover is published before the timecode is looked for', async () => {
  // Waiting for both meant the cover landed long after the sentence that
  // named it. The card now goes up with its picture, and the chip fills into
  // it — a detail arriving on a panel already in context, never a picture
  // arriving against the wrong words.
  const undo = stub({
    clip: CLIP,
    vault: [{ title: 'notes', text: '- 14:32 — Leverage: doing less work for more output.' }],
  });
  const phases = [];
  const final = await resolveVisual(
    spec({ kind: 'media', title: 'Hormozi', moment: 'leverage less work more output' }),
    { vaultPath: '/v' },
    (p) => phases.push(p),
  );
  undo();
  assert.equal(phases.length, 1, 'exactly one early publish — the cover');
  assert.equal(phases[0].src, '/api/briefing/media/deadbeef.jpg', 'which already carries the picture');
  assert.equal(phases[0].stamp, null, 'and honestly has no stamp yet');
  assert.ok(!phases[0].watchUrl.includes('&t='), 'nor a moment in its link');
  assert.equal(final.stamp, '14:32', 'the stamp follows into the same card');
  assert.ok(final.watchUrl.endsWith('&t=872s'));
});

test('a card whose moment is never found keeps the cover it already published', async () => {
  const undo = stub({ clip: CLIP, vault: [], captions: [{ at: 1, text: 'unrelated' }] });
  const phases = [];
  const final = await resolveVisual(spec({ kind: 'media', title: 'Hormozi', moment: 'nothing like this at all' }), { vaultPath: '/v' }, (p) => phases.push(p));
  undo();
  assert.equal(final.src, phases[0].src);
  assert.equal(final.stamp, null);
});
