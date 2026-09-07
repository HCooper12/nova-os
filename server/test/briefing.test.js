// THE BRIEFING — researched by several agents, written once, performed.
//
// The properties under test are the ones that make it trustworthy rather than
// merely impressive: his own words survive into the prompt that shapes the
// report; a failed angle degrades the briefing honestly instead of silently
// thinning it; every angle failing is an error, never an empty report; and
// the spoken script and the written document come from one pass so they
// cannot drift apart.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-brief-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const {
  buildAnglesPrompt, normalizeAngles, buildComposePrompt, normalizeBriefing,
  beatsOf, briefingMarkdown, startBriefing, getBriefingJob,
} = await import('../lib/briefing.js');
const { getRecord } = await import('../lib/inboxStore.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

const TOPIC = 'the different wavelengths of light and how they affect a person, which Huberman discussed on Diary of a CEO';
const STANDING = 'make it simply understood — define and re-explain scientific terminology I may not know';

const ANGLES = {
  title: 'Light Wavelengths and Human Physiology',
  angles: [
    { q: 'What does the physics of light wavelength actually describe?', why: 'the mechanism before anything else' },
    { q: 'How does morning daylight set the circadian clock via melanopsin?', why: 'the biology he asked about' },
    { q: 'What does the evidence say about light and mood, alertness and metabolism?', why: 'the effects beyond sleep' },
  ],
};

const BRIEFING = {
  title: 'Light Wavelengths and Human Physiology',
  summary: 'Light is not one thing. Its wavelength decides which cells in your eye respond and what your body does next.',
  sections: [
    {
      heading: 'What a wavelength actually is',
      body: 'Light travels as a wave, and the distance between two peaks of that wave is its wavelength, measured in nanometres. Shorter wavelengths carry more energy.',
      beats: ['Light travels as a wave. The distance between two peaks is its wavelength.', 'Shorter waves carry more energy — that is the whole basis of everything else here.'],
    },
    {
      heading: 'Why morning light matters',
      body: 'A photoreceptor called melanopsin responds most strongly to blue-ish light around 480 nanometres. A 2024 study of 88,000 people found that daytime light exposure tracked with better sleep timing.',
      beats: ['Your eye has a sensor called melanopsin that responds best to blue light.', 'A study of eighty-eight thousand people found daytime light tracked with better sleep timing.'],
    },
  ],
  glossary: [
    { term: 'Melanopsin', plain: 'A light-sensing pigment in the eye that sets your body clock rather than helping you see.' },
    { term: 'Nanometre', plain: 'A billionth of a metre — the unit light wavelengths are measured in.' },
  ],
  sources: [
    { title: 'Daylight exposure and sleep timing (PNAS 2024)', url: 'https://example.org/pnas' },
    { title: 'Melanopsin and circadian entrainment', url: 'https://example.org/melanopsin' },
  ],
};

test('his own words shape the report — the standing instruction is not parsed away', () => {
  const p = buildComposePrompt({ title: 'x', topic: TOPIC, standing: STANDING, findings: 'F', shelf: null });
  assert.ok(p.includes(STANDING), 'his instruction rides verbatim into the prompt');
  assert.match(p, /outranks your defaults/, 'and outranks the model’s own habits');
  assert.match(p, /EXPLAIN, DON'T IMPRESS/);
  assert.match(p, /NEVER INVENT/);
  assert.ok(buildAnglesPrompt(TOPIC, STANDING).includes(TOPIC));
});

test('the shelf is cross-checked when he already saved something on the topic', () => {
  const p = buildComposePrompt({ title: 'x', topic: TOPIC, standing: '', findings: 'F', shelf: 'HIS SHELF — the Huberman episode' });
  assert.match(p, /HIS SHELF/);
  assert.match(p, /WHERE HIS OWN SOURCES DISAGREE WITH THE LITERATURE, SAY SO/);
});

test('a shape that cannot be researched is refused, not guessed at', () => {
  assert.throws(() => normalizeAngles({ angles: [{ q: 'x' }] }, TOPIC), /could not break that topic/);
  assert.throws(() => normalizeAngles({}, TOPIC), /could not break that topic/);
  const ok = normalizeAngles(ANGLES, TOPIC);
  assert.equal(ok.angles.length, 3);
  assert.equal(ok.title, 'Light Wavelengths and Human Physiology');
});

test('the briefing normalises to something a player and a reader can both use', () => {
  const b = normalizeBriefing(BRIEFING);
  assert.equal(b.sections.length, 2);
  assert.equal(b.glossary.length, 2);
  assert.equal(b.sources.length, 2);
  // a source with no real URL is dropped rather than shown as a citation
  const bad = normalizeBriefing({ ...BRIEFING, sources: [{ title: 'made up', url: 'not a url' }] });
  assert.equal(bad.sources.length, 0);
  assert.throws(() => normalizeBriefing({ sections: [] }), /no sections/);
});

test('the beat list carries its section, so the transcript can follow the voice', () => {
  const beats = beatsOf(normalizeBriefing(BRIEFING));
  assert.equal(beats[0].kind, 'summary');
  assert.equal(beats[0].section, -1);
  assert.equal(beats[1].section, 0);
  assert.equal(beats[1].kind, 'section-open', 'the first beat of a section is marked, so the reader can scroll to it');
  assert.equal(beats[3].section, 1);
  assert.equal(beats.length, 5, 'summary + 2 + 2');
});

test('the vault page carries the prose, the glossary and the sources', () => {
  const md = briefingMarkdown(normalizeBriefing(BRIEFING), TOPIC);
  assert.match(md, /## What a wavelength actually is/);
  assert.match(md, /## Terms, in plain words/);
  assert.match(md, /\*\*Melanopsin\*\* — A light-sensing pigment/);
  assert.match(md, /\[Daylight exposure and sleep timing \(PNAS 2024\)\]\(https:\/\/example\.org\/pnas\)/);
  assert.match(md, /Asked for:/, 'the page says what he actually asked, not just the answer');
});

// ---- the whole pipeline, with the model and the Researcher injected --------

function fakeDeps({ failAngles = [], researchFails = false } = {}) {
  const records = new Map();
  let n = 0;
  return {
    records,
    runClaude: async ({ prompt }) => JSON.stringify(prompt.includes('Break a research topic') ? ANGLES : BRIEFING),
    startResearch: async (vaultPath, q) => {
      if (researchFails) throw new Error('the researcher lane is off');
      const id = `r${++n}`;
      const failed = failAngles.includes(q);
      records.set(id, failed
        ? { id, status: 'error', error: 'no citations resolved' }
        : { id, status: 'pending', decision: { payload: { body: `findings for ${q}` } } });
      return { id };
    },
    getRecord: async (id) => records.get(id) || null,
    shelfContext: async () => 'HIS SHELF — the Huberman episode he saved',
  };
}

const settle = async (id) => {
  for (let i = 0; i < 60; i++) {
    const r = await getRecord(id);
    if (r && r.status !== 'classifying') return r;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('briefing never settled');
};

test('end to end: angles fan out in parallel, one pass writes it, it lands pending', async () => {
  const rec = await startBriefing('/tmp/vault', { topic: TOPIC, standing: STANDING }, fakeDeps());
  assert.equal(rec.kind, 'briefing');
  assert.equal(rec.status, 'classifying', 'it shows as in flight while the agents work');

  const done = await settle(rec.id);
  assert.equal(done.status, 'pending', 'it waits for him — he opens it when ready');
  assert.equal(done.decision.title, 'Light Wavelengths and Human Physiology');
  assert.match(done.decision.reason, /3 angles/);
  assert.ok(done.decision.payload.briefing.sections.length, 'the structured briefing rides the record for the player');
  assert.ok(done.decision.payload.body.includes('## Why morning light matters'), 'and the markdown for the vault');
  assert.equal(done.decision.payload.standing, STANDING, 'what he asked for is kept with the result');
  assert.equal(getBriefingJob(rec.id).stage, 'ready');
});

test('a failed angle degrades honestly — the report says which is missing', async () => {
  const deps = fakeDeps({ failAngles: [ANGLES.angles[2].q] });
  const rec = await startBriefing('/tmp/vault', { topic: TOPIC }, deps);
  const done = await settle(rec.id);
  assert.equal(done.status, 'pending');
  assert.match(done.decision.reason, /2 angles/);
  assert.match(done.decision.reason, /1 failed/);
  assert.deepEqual(done.decision.payload.briefing.incomplete, [ANGLES.angles[2].q]);
});

test('every angle failing is an error, never an empty report', async () => {
  const rec = await startBriefing('/tmp/vault', { topic: TOPIC }, fakeDeps({ researchFails: true }));
  const done = await settle(rec.id);
  assert.equal(done.status, 'error');
  assert.match(done.error, /every research angle failed/);
});

test('a topic too thin to research is refused before anything is spent', async () => {
  await assert.rejects(() => startBriefing('/tmp/vault', { topic: 'light' }, fakeDeps()), /say a bit more/);
  await assert.rejects(() => startBriefing('/tmp/vault', { topic: 'x'.repeat(700) }, fakeDeps()), /too long/);
});
