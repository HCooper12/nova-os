// The Watcher — video URL in, review-gated note out. Temp data dir BEFORE
// imports. Model spawns and the watch toolchain are never exercised here:
// the report parser, URL extraction, directive parsing, normalization, and
// prompt contract are all pure and tested as such.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-watcher-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  parseWatchReport, extractVideoUrl, parseWatchDirective,
  normalizeWatch, composeWatchNote, buildWatchPrompt, resolveWatchScript,
} = await import('../lib/watcher.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

// Fixture mirrors watch.py's actual stdout shape (metadata bullets, then the
// transcript inside the one fenced block under "## Transcript").
const REPORT = `
# watch: video report

- **Source:** https://youtu.be/abc123
- **Title:** Does Training to Failure Matter?
- **Uploader:** Fitness Channel
- **Duration:** 12:41 (761.0s)
- **Detail:** transcript
- **Frames:** skipped (transcript detail)
- **Transcript:** 214 segments (via captions)

## Frames

_No frames extracted._

## Transcript

_Source: captions._

\`\`\`
[00:01] welcome back to the channel
[00:05] today we ask whether training to failure matters
\`\`\`

---
_Work dir: \`/tmp/watch-xyz\` — delete when done._
`;

test('watcher: parseWatchReport pulls metadata and the fenced transcript', () => {
  const r = parseWatchReport(REPORT);
  assert.equal(r.title, 'Does Training to Failure Matter?');
  assert.equal(r.uploader, 'Fitness Channel');
  assert.equal(r.duration, '12:41');
  assert.equal(r.transcriptSource, 'captions');
  assert.match(r.transcript, /training to failure matters/);
  assert.match(r.transcript, /^\[00:01\]/);
});

test('watcher: a captionless report yields a null transcript, never a guess', () => {
  const bare = REPORT
    .replace(/- \*\*Transcript:\*\* .*/, '- **Transcript:** none available')
    .replace(/_Source: captions\._[\s\S]*?```[\s\S]*?```/, '_No transcript available at transcript detail._');
  const r = parseWatchReport(bare);
  assert.equal(r.transcript, null);
  assert.equal(r.transcriptSource, null);
  assert.equal(r.title, 'Does Training to Failure Matter?', 'metadata still parsed');
});

test('watcher: extractVideoUrl splits link from question, rejects non-video links', () => {
  const hit = extractVideoUrl('is this legit? https://youtu.be/abc123 the deadlift part');
  assert.equal(hit.url, 'https://youtu.be/abc123');
  assert.equal(hit.question, 'is this legit? the deadlift part');

  const trail = extractVideoUrl('https://www.youtube.com/watch?v=x).');
  assert.equal(trail.url, 'https://www.youtube.com/watch?v=x');

  assert.equal(extractVideoUrl('https://example.com/article'), null, 'not a video host');
  assert.equal(extractVideoUrl('no link here at all'), null);
});

test('watcher: parseWatchDirective — clean strip, bad JSON and missing URL degrade honestly', () => {
  const ok = parseWatchDirective('Dispatched, sir.\nWATCH {"url":"https://youtu.be/a","question":"worth it?"}');
  assert.equal(ok.cleanText, 'Dispatched, sir.');
  assert.deepEqual(ok.watch, { url: 'https://youtu.be/a', question: 'worth it?' });

  const bad = parseWatchDirective('Hmm.\nWATCH {broken');
  assert.equal(bad.watch, null, 'unmatched braces never fire');

  const noUrl = parseWatchDirective('Hmm.\nWATCH {"question":"what?"}');
  assert.equal(noUrl.watch, null);
  assert.match(noUrl.parseError, /no usable URL/);
  assert.equal(noUrl.cleanText, 'Hmm.', 'directive line stripped even on failure');
});

test('watcher: normalizeWatch coerces the lane and refuses an incomplete note', () => {
  const ok = normalizeWatch({ lane: 'coach', title: 'T', verdict: 'v', body: 'b' });
  assert.equal(ok.lane, 'coach');
  const coerced = normalizeWatch({ lane: 'banana', title: 'T', body: 'b' });
  assert.equal(coerced.lane, 'reference', 'unknown lane falls to reference');
  assert.throws(() => normalizeWatch({ lane: 'coach', title: 'T' }), /incomplete/);
  assert.throws(() => normalizeWatch({ body: 'b' }), /incomplete/);
});

test('watcher: composeWatchNote writes the source header in code, not model prose', () => {
  const note = composeWatchNote({
    url: 'https://youtu.be/a', title: 'Vid', uploader: 'Chan', duration: '10:00',
    transcriptSource: 'captions', verdict: 'Skip it.', body: 'The claims fail.',
  });
  assert.match(note, /^\*\*Source:\*\* \[Vid — Chan — 10:00\]\(https:\/\/youtu\.be\/a\) · transcript via captions/);
  assert.match(note, /\*\*Verdict:\*\* Skip it\./);
  assert.match(note, /The claims fail\./);
  const noVerdict = composeWatchNote({ url: 'https://youtu.be/a', body: 'b' });
  assert.doesNotMatch(noVerdict, /Verdict/, 'no verdict line when the model gave none');
});

test('watcher: prompt contract — lens, both lanes, transcript file, JSON shape, honesty rules', () => {
  const p = buildWatchPrompt({
    url: 'https://youtu.be/a', title: 'Vid', uploader: 'Chan', duration: '10:00',
    question: 'worth adopting?', transcriptPath: '/tmp/x/transcript.txt', transcriptSource: 'captions',
  });
  assert.match(p, /Nova's Watcher/);
  assert.match(p, /LANE "coach"/);
  assert.match(p, /LANE "reference"/);
  assert.match(p, /\/tmp\/x\/transcript\.txt/);
  assert.match(p, /worth adopting\?/);
  assert.match(p, /scientific and empirical support/);
  assert.match(p, /wikilinks/i);
  assert.match(p, /the words, not the pictures/, 'transcript-only limitation is named');
  assert.match(p, /Output ONLY a JSON object/);
  assert.match(p, /"lane":"coach"\|"reference"/);
});

test('watcher: resolveWatchScript honors NOVA_WATCH_DIR and fails honestly when empty', async () => {
  const fake = await mkdtemp(path.join(tmpdir(), 'nova-watch-skill-'));
  try {
    process.env.NOVA_WATCH_DIR = fake;
    assert.throws(() => resolveWatchScript(), /does not exist/);
    await mkdir(path.join(fake, 'scripts'), { recursive: true });
    await writeFile(path.join(fake, 'scripts', 'watch.py'), '# stub', 'utf8');
    assert.equal(resolveWatchScript(), path.join(fake, 'scripts', 'watch.py'));
  } finally {
    delete process.env.NOVA_WATCH_DIR;
    await rm(fake, { recursive: true, force: true });
  }
});
