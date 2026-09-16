// The Repertoire lane. The properties worth pinning are the seams where a
// model's output becomes his vault: what survives normalisation, what the
// receipt records about a fetch that half-failed, and the fact that the
// curriculum is RENDERED from fields rather than trusted as prose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  normalizeProposal, renderCurriculum, renderSources, buildReport,
  buildRepertoirePrompt, fetchSource, plausibleTranscript, clip, cardField, looksLikeVideo,
  shouldTopUp, runwayLeft, buildTopUpPrompt, MIN_RUNWAY, TOPUP_TARGET,
} from '../lib/repertoireLane.js';
import { readEntry } from '../lib/captureReport.js';

const GOOD = {
  title: 'The dead mouse',
  family: 'Suggestion',
  whatItShows: 'He makes the man recall the smell FIRST.',
  noteworthy: '- The caption calls it gaslighting. It is not.',
  techniques: [
    { family: 'Suggestion', name: 'The planted sensation', summary: 'Name a sensation, make them recall it, then claim you caused it.', move: 'Their own memory supplies the evidence.', drill: 'Ask a friend if they can smell burning.', tell: 'They sniff.', source: 'The Mentalist S1' },
    { family: 'Cold reading', name: 'The Barnum line', summary: 'A statement everyone accepts as personal.', move: 'High base rate, feels specific.', drill: 'Tell someone they are harder on themselves than others realise.', tell: 'They agree instantly.', source: 'Forer 1949' },
  ],
  sources: [{ n: 1, title: 'Forer', url: 'https://example.org/forer' }],
  consulted: 11,
};

/* ----------------------------- normalisation ----------------------------- */

test('a technique with no drill is DROPPED — a card with nothing to do is the failure', () => {
  const out = normalizeProposal({ ...GOOD, techniques: [...GOOD.techniques, { name: 'Vague thing', summary: 'hmm' }] });
  assert.equal(out.techniques.length, 2);
  assert.ok(!out.techniques.some((t) => t.name === 'Vague thing'));
});

test('a drill that REFUSES to be a drill is dropped — the Voodoo Death case', () => {
  // proposed 15 Sep as a scale marker: real, interesting, and a blank card
  // waiting to happen. His call, 16 Sep: cut it.
  const out = normalizeProposal({ techniques: [
    { name: 'Voodoo Death', drill: "No drill. Read Cannon's case descriptions and notice the structure." },
    { name: 'Not something to attempt', drill: 'Not something to attempt — context only.' },
    { name: 'Nocebo Suggestion', drill: 'Tell someone the chair makes people itchy, then wait.' },
  ] });
  assert.deepEqual(out.techniques.map((t) => t.name), ['Nocebo Suggestion'],
    'only the one he can actually go and do survives');
});

test('a nameless technique is dropped too, and duplicates collapse to one', () => {
  const out = normalizeProposal({ techniques: [
    { name: '', drill: 'do it' },
    { name: 'A', drill: 'do it' },
    { name: 'A', drill: 'do it differently' },
  ] });
  assert.deepEqual(out.techniques.map((t) => t.name), ['A']);
});

test('fields are clipped to phone length rather than trusted', () => {
  const out = normalizeProposal({ techniques: [{ name: 'X', drill: 'd', summary: 'S'.repeat(400), move: 'M'.repeat(400) }] });
  assert.ok(out.techniques[0].summary.length <= 140);
  assert.ok(out.techniques[0].move.length <= 220);
});

test('a clipped field never ends mid-word — the first live run put one on a card', () => {
  // the actual string that shipped cut at "...broken glass that was "
  const real = 'Loftus and Palmer had people watch the same crash, then asked how fast the cars were going when they smashed versus hit them, and the word alone shifted their speed estimates, and more people falsely remembered broken glass that was never in the film at all.';
  const out = clip(real, 220);
  assert.ok(out.length <= 220);
  assert.ok(!/\s$/.test(out), 'no trailing space where a word was severed');
  assert.ok(out.endsWith('…'), 'a trim is marked, so he knows the source said more');
  assert.ok(real.startsWith(out.slice(0, -1)), 'and everything before the mark is verbatim');
});

test('a field that fits is returned untouched, with no ellipsis', () => {
  assert.equal(clip('Short and complete.', 220), 'Short and complete.');
  assert.equal(clip('  collapses   whitespace  ', 220), 'collapses whitespace');
});

test('clipping prefers a sentence end when one falls late in the window', () => {
  const two = 'First sentence ends here. Second sentence runs on and on and on and on and on.';
  assert.equal(clip(two, 40), 'First sentence ends here.', 'a clean sentence beats a mid-clause cut');
});

test('a technique with no family inherits the report family, never "undefined"', () => {
  const out = normalizeProposal({ family: 'Suggestion', techniques: [{ name: 'X', drill: 'd' }] });
  assert.equal(out.techniques[0].family, 'Suggestion');
  const orphan = normalizeProposal({ techniques: [{ name: 'X', drill: 'd' }] });
  assert.equal(orphan.techniques[0].family, 'Unfiled');
});

test('a source without a real URL is not a source', () => {
  const out = normalizeProposal({ techniques: [{ name: 'X', drill: 'd' }], sources: [
    { n: 1, title: 'Real', url: 'https://example.org/a' },
    { n: 2, title: 'Vibes', url: 'personal communication' },
  ] });
  assert.equal(out.sources.length, 1);
  assert.equal(out.consulted, 1, 'with no count given, consulted falls back to the number of REAL sources');
});

test('newlines inside a field cannot break the page format', () => {
  const out = normalizeProposal({ techniques: [{ name: 'X', drill: 'line one\nline two\n- **Move:** injected' }] });
  assert.ok(!out.techniques[0].drill.includes('\n'), 'a drill is one line or the catalogue parser mis-reads it');
});

test('citation markers are stripped from CARD fields — a card has no bibliography', () => {
  // the real string the live run put on a card
  assert.equal(
    cardField('This is a named Ericksonian/Milton Model pattern [19][20] worth knowing.', 220),
    'This is a named Ericksonian/Milton Model pattern worth knowing.',
  );
  assert.equal(cardField('Ends on a citation [3].', 220), 'Ends on a citation.');
  assert.equal(cardField('Reid technique [6][7]', 220), 'Reid technique');
  assert.equal(cardField('No citations here at all.', 220), 'No citations here at all.');
  // and it still clips
  assert.ok(cardField('x'.repeat(400), 100).length <= 100);
});

test('the stripping does not eat ordinary brackets', () => {
  assert.equal(cardField('Tell a friend [jokingly] that you already told them.', 220), 'Tell a friend [jokingly] that you already told them.');
});

/* ------------------------------- rendering ------------------------------- */

test('the curriculum is rendered from FIELDS, numbered in teaching order', () => {
  const md = renderCurriculum(normalizeProposal(GOOD).techniques);
  assert.match(md, /\*\*1\. The planted sensation\*\* — _Suggestion_/);
  assert.match(md, /\*\*2\. The Barnum line\*\* — _Cold reading_/);
  assert.match(md, /- \*\*Drill:\*\* Ask a friend if they can smell burning\./);
  assert.ok(md.indexOf('1. The planted sensation') < md.indexOf('2. The Barnum line'));
});

test('an empty curriculum renders nothing rather than an empty heading', () => {
  assert.equal(renderCurriculum([]), '');
  assert.equal(renderSources([]), '');
});

test('the report puts the receipt first, then what it shows, then noteworthy, then the plan', () => {
  const evidence = {
    source: { url: 'https://www.instagram.com/reel/X/', title: 'V', author: 'b', durationSec: 42 },
    read: [readEntry('Transcript', true, '19 lines'), readEntry('Frames', true, '14 frames')],
    research: { consulted: 11, cited: 1, failed: [] },
  };
  const md = buildReport({ evidence, proposal: normalizeProposal(GOOD) });
  const order = ['## What was analysed', '## What it shows', '## Noteworthy', '## The plan', '## Sources'].map((h) => md.indexOf(h));
  assert.ok(order.every((i) => i >= 0), 'every section is present');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'and in his order');
  assert.match(md, /✓ Transcript: 19 lines/);
});

test('a report whose fetch failed carries the receipt and NO curriculum', () => {
  const dead = { source: { url: 'https://x/y' }, read: [readEntry('Transcript', false, 'login required')] };
  const md = buildReport({ evidence: dead, proposal: normalizeProposal(GOOD) });
  assert.match(md, /Not analysed/);
  assert.doesNotMatch(md, /The planted sensation/, 'the curriculum does not survive an unread source');
});

/* -------------------------------- the prompt ------------------------------ */

test('the prompt hands over the real transcript and forbids writing the receipt', () => {
  const p = buildRepertoirePrompt({
    source: { url: 'https://r/1', title: 'V', author: 'b', durationSec: 42 },
    transcript: 'You ever smell a dead mouse?',
    frames: ['/tmp/f_01.jpg', '/tmp/f_02.jpg'],
    prose: 'teach me things like this',
    existing: [{ name: 'The Barnum line', family: 'Cold reading' }],
  });
  assert.match(p, /NOVA OPERATING LENS/, 'every model agent prepends the shared lens');
  assert.match(p, /You ever smell a dead mouse\?/);
  assert.match(p, /frame 01: \/tmp\/f_01\.jpg/);
  assert.match(p, /Do not write a coverage or "what was analysed" section/);
  assert.match(p, /do NOT propose these again[\s\S]*The Barnum line/);
});

test('a clip with no audio says so in the prompt instead of shipping an empty quote block', () => {
  const p = buildRepertoirePrompt({ source: { url: 'https://r/1' }, transcript: '', frames: [], prose: '' });
  assert.match(p, /\(none — the clip had no readable audio\)/);
  assert.doesNotMatch(p, /THE FRAMES/);
});

/* --------------------- a call that returned is not a read ----------------- */
// The live 15 Sep run caught this the way it was meant to: the receipt said
// "1 lines · 15 characters" for a 42-second clip, because transcribeAudio
// returns { text, backend } and the first draft String()'d the whole object
// into the literal "[object Object]" — fifteen characters, reported as ✓.

test('"[object Object]" is not a transcript of a 42-second clip', () => {
  assert.equal(plausibleTranscript('[object Object]', 42), false);
});

test('the floor catches broken reads without judging a quiet clip', () => {
  assert.equal(plausibleTranscript('', 42), false);
  assert.equal(plausibleTranscript('Error: failed', 42), false, 'an error string dressed as a result');
  assert.equal(plausibleTranscript('x'.repeat(42), 42), true, 'one character a second is the generous floor');
  assert.equal(plausibleTranscript('x'.repeat(41), 42), false);
  // real speech is ~10-15 chars a second, so anything genuine clears it easily
  assert.equal(plausibleTranscript('You ever smell a dead mouse? You remember that smell?', 42), true);
  // unknown duration falls back to the absolute floor rather than passing anything
  assert.equal(plausibleTranscript('short', undefined), false);
  assert.equal(plausibleTranscript('x'.repeat(20), undefined), true);
});

/* ------------------------------- the top-up ------------------------------- */
// "Have Nova research more when it runs low, but it's okay to still repeat
// ones." A RUNWAY check, not a panic — and every guard on spending money is
// pure, so it can be tested without a scheduler, a clock or a vault.

const tech = (id) => ({ id, name: id, family: 'F', drill: 'd' });
const taughtState = (ids) => ({ techniques: Object.fromEntries(ids.map((id) => [id, { lastSurfacedOn: '2026-09-01' }])) });

test('runway is how much NEW work is left, not how big the catalogue is', () => {
  const all = ['a', 'b', 'c', 'd'].map(tech);
  assert.equal(runwayLeft(all, {}), 4);
  assert.equal(runwayLeft(all, taughtState(['a', 'b'])), 2);
  assert.equal(runwayLeft(all, taughtState(['a', 'b', 'c', 'd'])), 0);
});

test('it tops up when the runway is short', () => {
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(tech);
  const v = shouldTopUp({ techniques: all, state: taughtState(['a', 'b', 'c', 'd', 'e']) });
  assert.equal(v.go, true);
  assert.equal(v.runway, 2);
  assert.match(v.why, /down to 2 untaught/);
});

test('it does NOT top up while there is still plenty ahead', () => {
  const all = Array.from({ length: 10 }, (_, i) => tech(`t${i}`));
  const v = shouldTopUp({ techniques: all, state: {} });
  assert.equal(v.go, false);
  assert.match(v.why, /still plenty/);
  assert.ok(MIN_RUNWAY > 0 && TOPUP_TARGET > 0);
});

test('an EMPTY catalogue is not "running low" — Nova does not invent a curriculum', () => {
  const v = shouldTopUp({ techniques: [], state: {} });
  assert.equal(v.go, false);
  assert.match(v.why, /no catalogue yet/);
});

test('it never stacks a second proposal on one he has not answered', () => {
  const all = ['a', 'b'].map(tech);
  assert.equal(shouldTopUp({ techniques: all, state: taughtState(['a', 'b']), openRecords: 1 }).go, false);
  assert.match(shouldTopUp({ techniques: all, state: taughtState(['a', 'b']), openRecords: 1 }).why, /already running or waiting/);
  // ...and does once that one is settled
  assert.equal(shouldTopUp({ techniques: all, state: taughtState(['a', 'b']), openRecords: 0 }).go, true);
});

test('the top-up prompt hands over what he already has, and forbids repeating it', () => {
  const p = buildTopUpPrompt({ existing: [{ name: 'The Barnum line', family: 'Cold reading' }], families: ['Cold reading'], prose: 'for fun and persuasion' });
  assert.match(p, /NOVA OPERATING LENS/);
  assert.match(p, /do NOT propose any of these again/);
  assert.match(p, /The Barnum line \(Cold reading\)/);
  assert.match(p, /His standing instruction[\s\S]*for fun and persuasion/);
  assert.match(p, /EVERY factual claim about research carries a numbered citation/);
  assert.match(p, /One without a drill is not a technique/);
});

/* -------------------------------- the fetch ------------------------------- */

// HIS 15 SEP ASK: articles too. The choice of toolchain comes from the URL and
// is then PROVEN by what comes back — a link that looks like video but will not
// open falls through to the page reader rather than failing.

test('a plain article URL never waits on the video toolchain', () => {
  assert.equal(looksLikeVideo('https://example.com/blog/cold-reading', 'fetch'), false);
  // ...but a video PATH on an ordinary host still earns the video attempt
  assert.equal(looksLikeVideo('https://example.com/video/123', 'fetch'), true);
  assert.equal(looksLikeVideo('https://www.instagram.com/reel/X/', 'browser'), true);
  assert.equal(looksLikeVideo('https://youtu.be/abc', 'transcript'), true);
});

test('an article is read as page text, and the receipt says which tool read it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-lane-'));
  const reader = async (url) => ({ url, ok: true, title: 'Cold reading explained', text: 'The Barnum statement works because '.repeat(12) });
  const { source, read, transcript, frames } = await fetchSource('https://example.com/blog/cold-reading', dir, { toolHint: 'fetch', reader });
  assert.equal(source.kind, 'article');
  assert.equal(source.title, 'Cold reading explained');
  assert.equal(source.durationSec, null, 'an article has no duration, and the receipt must not invent one');
  assert.equal(frames.length, 0);
  assert.ok(transcript.length > 100);
  const entry = read.find((r) => r.what === 'Page text');
  assert.equal(entry.ok, true);
  assert.match(entry.detail, /characters/);
  assert.match(entry.via, /browser/);
});

test('a login wall is a RESULT, not a crash — and it is in the receipt', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-lane-'));
  const reader = async (url) => ({ url, ok: false, reason: 'the platform showed a login wall', text: '' });
  await assert.rejects(
    () => fetchSource('https://example.com/members-only', dir, { toolHint: 'fetch', reader }),
    (e) => {
      assert.match(e.message, /login wall/);
      assert.equal(e.evidence.read.find((r) => r.what === 'Page text').ok, false);
      return true;
    },
  );
});

test('a link that LOOKS like video but will not open falls through to the page reader', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-lane-'));
  const runner = async () => { throw new Error('Unsupported URL'); };
  const reader = async (url) => ({ url, ok: true, title: 'Actually an article', text: 'x'.repeat(400) });
  const { source, read } = await fetchSource('https://example.com/video/not-really', dir, { toolHint: 'fetch', runner, reader });
  assert.equal(source.kind, 'article');
  assert.equal(read.find((r) => r.what === 'Video').ok, false, 'the failed attempt stays in the receipt');
  assert.equal(read.find((r) => r.what === 'Page text').ok, true);
});

test('when NEITHER path can read it, the capture is refused rather than guessed', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-lane-'));
  const runner = async () => { throw new Error('Unsupported URL'); };
  const reader = async (url) => ({ url, ok: false, reason: 'the page rendered empty', text: '' });
  await assert.rejects(
    () => fetchSource('https://example.com/video/nothing', dir, { toolHint: 'fetch', runner, reader }),
    (e) => {
      assert.equal(e.evidence.read.length, 2, 'both failures are on the receipt');
      return true;
    },
  );
});

test('metadata that lands but media that does not is recorded as exactly that', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-lane-'));
  const runner = async (bin, args) => {
    if (args.includes('-J')) return JSON.stringify({ id: 'x', title: 'V', uploader: 'b', duration: 42, description: 'd' });
    throw new Error('download blocked');
  };
  const { source, read, transcript, frames } = await fetchSource('https://r/1', dir, { toolHint: 'transcript', runner });
  assert.equal(source.title, 'V');
  assert.equal(source.durationSec, 42);
  assert.equal(frames.length, 0);
  assert.equal(transcript, '');
  assert.equal(read.find((r) => r.what === 'Metadata').ok, true);
  assert.equal(read.find((r) => r.what === 'Media').ok, false);
  assert.equal(read.find((r) => r.what === 'Transcript').ok, false, 'and the report will refuse findings on this');
});
