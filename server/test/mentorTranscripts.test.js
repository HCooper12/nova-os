import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// No yt-dlp, no ffmpeg, no ffprobe, no network, no transcriber: every one of
// them is a stub in `deps`. The data dir is set BEFORE any lib is imported.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-tx-'));
process.env.NOVA_DATA_DIR = path.join(dir, 'data');
const TMP = path.join(dir, 'tmp');
const VAULT = path.join(dir, 'vault');

let T;
before(async () => { T = await import('../lib/mentorTranscripts.js'); });
after(() => { T._setTranscriptDepsForTest(null); fs.rmSync(dir, { recursive: true, force: true }); });

let calls;
let yields;
// pieces: how many the split returns; each piece's segments start at 0
function stubs({ duration = 700, silences = [], pieceSegs = null, ytdlpFail = null, download = null } = {}) {
  calls = { split: [], transcribe: [], ytdlp: [], download: [] };
  yields = 0;
  T._setTranscriptDepsForTest({
    tmpRoot: () => TMP,
    sttConfigured: () => true,
    yieldToHim: async () => { yields += 1; },
    readText: (f) => fs.promises.readFile(f, 'utf8'),
    download: download || (async (url, dest) => { calls.download.push(url); fs.writeFileSync(dest, 'mp3 bytes'); }),
    ytdlpAudio: async (url, d) => {
      calls.ytdlp.push(url);
      if (ytdlpFail) throw Object.assign(new Error('yt-dlp exited with code 1: x'), { stderr: ytdlpFail });
      const f = path.join(d, 'a.webm'); fs.writeFileSync(f, 'webm'); return f;
    },
    probeSeconds: async () => duration,
    silences: async () => silences,
    split: async (file, times, d) => {
      calls.split.push(times);
      return [0, ...times].map((_, i) => { const p = path.join(d, `p${String(i).padStart(3, '0')}.mp3`); fs.writeFileSync(p, 'x'); return p; });
    },
    transcribe: async (p, opts) => {
      calls.transcribe.push({ p, opts, yieldsSoFar: yields });
      const i = calls.transcribe.length - 1;
      const segs = pieceSegs ? pieceSegs(i) : [{ start: 0, end: 10, text: `piece ${i} opening words that carry on for a while.` }, { start: 20, end: 40, text: `and the next thing said in piece ${i}, with more words to make it long enough to count as speech here.` }, { start: 45, end: 60, text: 'a third segment that follows on.' }];
      return { text: 'x', segments: segs, seconds: 2 };
    },
  });
}

const tmpEmpty = () => !fs.existsSync(TMP) || fs.readdirSync(TMP).length === 0;
beforeEach(() => { fs.mkdirSync(TMP, { recursive: true }); stubs(); });

test('the vault path: the header above the first --- is dropped, nothing downloaded', async () => {
  fs.mkdirSync(path.join(VAULT, 'Raw'), { recursive: true });
  fs.writeFileSync(path.join(VAULT, 'Raw', 'ep.md'), 'Verbatim video transcript fetched by Nova.\nSource URL: https://youtube.com/watch?v=abc\n\n---\n\n[00:00] Hello there.\n[00:31] And more.\n');
  const r = await T.getTranscript({ key: 'yt:abc', title: 'Ep', transcript: { source: 'vault', path: 'Raw/ep.md' }, audio: { url: 'https://pod.example/a.mp3' } }, { vaultPath: VAULT });
  assert.equal(r.source, 'vault');
  assert.equal(r.timed, true);
  const text = fs.readFileSync(r.path, 'utf8');
  assert.equal(text, '[00:00] Hello there.\n[00:31] And more.');
  assert.equal(r.chars, text.length);
  assert.equal(r.path, path.join(process.env.NOVA_DATA_DIR, 'mentors', 'transcripts', 'yt_abc.txt'));
  assert.deepEqual(calls.download, []);
  assert.deepEqual(calls.ytdlp, []);
  await assert.rejects(T.getTranscript({ key: 'yt:x', title: 'X', transcript: { source: 'vault', path: '../../etc/passwd' } }, { vaultPath: VAULT }), (e) => e.kind === 'failed' && /outside the vault/.test(e.message));
});

test('podcast audio is chosen over YouTube when the source has an audio url', async () => {
  const r = await T.getTranscript({ key: 'yt:vid1', title: 'Twin', url: 'https://www.youtube.com/watch?v=vid1', audio: { url: 'https://pod.example/ep.mp3?x=1' } });
  assert.equal(r.source, 'podcast-audio');
  assert.deepEqual(calls.download, ['https://pod.example/ep.mp3?x=1']);
  assert.deepEqual(calls.ytdlp, []);
  const y = await T.getTranscript({ key: 'yt:vid2', title: 'Solo', url: 'https://www.youtube.com/watch?v=vid2' });
  assert.equal(y.source, 'youtube-audio');
  assert.deepEqual(calls.ytdlp, ['https://www.youtube.com/watch?v=vid2']);
  await assert.rejects(T.getTranscript({ key: 'url:abc', title: 'An article' }), (e) => e.kind === 'failed' && e.message === 'no way to get the words of An article');
});

test('three failure kinds from what yt-dlp said, each a plain message under 200 characters', async () => {
  const cases = [
    ['ERROR: [youtube] abc: Sign in to confirm you\'re not a bot. Use --cookies-from-browser', 'refused'],
    ['ERROR: unable to download video data: HTTP Error 429: Too Many Requests', 'refused'],
    ['ERROR: unable to download video data: HTTP Error 403: Forbidden', 'refused'],
    ['ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access to this video', 'unavailable'],
    ['ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader', 'unavailable'],
    ['ERROR: [youtube] abc: Join this channel to get access to members-only content like this video', 'unavailable'],
    ['ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.', 'unavailable'],
    ['ERROR: Postprocessing: audio conversion failed: Error opening output files', 'failed'],
  ];
  for (const [stderr, kind] of cases) {
    stubs({ ytdlpFail: `[youtube] abc: Downloading webpage\n${stderr}\n` });
    await assert.rejects(T.getTranscript({ key: 'yt:abc', title: 'A video' }), (e) => {
      assert.equal(e.kind, kind, stderr);
      assert.ok(e.message.length <= 200 && e.message.includes('A video'), e.message);
      assert.ok(e.message.includes(stderr.slice(0, 40)), 'the tool\'s own line is in the message');
      return true;
    });
    assert.ok(tmpEmpty(), 'temp folder gone after a throw');
  }
  assert.equal(T.classifyYtdlp('separate generate operate'), 'failed', '"rate" inside a word is not a rate limit');
});

test('cut points move to the middle of a nearby silence, and stay on the mark without one', () => {
  assert.deepEqual(T.cutPoints(1000, []), [300, 600, 900]);
  const sil = [{ start: 310, end: 311 }, { start: 640, end: 650 }, { start: 860, end: 862 }];
  // 310.5 is 10.5 from 300; 645 is 45 from 600 (too far); 861 is 39 from 900 (too far)
  assert.deepEqual(T.cutPoints(1000, sil), [310.5, 600, 900]);
  assert.deepEqual(T.cutPoints(1000, [{ start: 290, end: 292 }, { start: 303, end: 305 }]), [304, 600, 900], 'the nearest wins');
  assert.deepEqual(T.cutPoints(200, []), [], 'under 5 minutes is one piece');
  assert.deepEqual(T.parseSilences('[silencedetect @ 0x1] silence_start: 12.5\n[silencedetect @ 0x1] silence_end: 13.4 | silence_duration: 0.9\nsilence_start: 99'), [{ start: 12.5, end: 13.4 }, { start: 99, end: Infinity }]);
});

test('transcribeLong: pieces offset by their start, yieldToHim awaited before every piece, temp files gone', async () => {
  stubs({ duration: 700, silences: [{ start: 302, end: 304 }] });
  const out = await T.transcribeLong(path.join(TMP, 'whatever.mp3'), { title: 'Ep' });
  assert.deepEqual(calls.split[0], [303, 600]);
  assert.equal(calls.transcribe.length, 3);
  calls.transcribe.forEach((c, i) => {
    assert.equal(c.yieldsSoFar, i + 1, `yield before piece ${i + 1}`);
    assert.deepEqual(c.opts, { segments: true, timeoutMs: 300_000 });
  });
  assert.deepEqual(out.segments.filter((s) => s.text.startsWith('piece')).map((s) => s.start), [0, 303, 600]);
  assert.match(out.text, /^\[00:00\] piece 0/);
  assert.match(out.text, /\n\[05:03\] piece 1/);
  assert.match(out.text, /\n\[10:00\] piece 2/);
  assert.equal(out.audioSec, 700);
  assert.equal(out.sttSec, 6);
  assert.ok(tmpEmpty());
});

test('the 30 s line format is the pilot\'s, for a canned segment list', () => {
  const segs = [
    { start: 0, end: 4, text: ' Hello and welcome.' },
    { start: 4.2, end: 12, text: 'Today we talk about no.' },
    { start: 31, end: 40, text: 'This one crosses thirty seconds.' },
    { start: 41, end: 50, text: 'A new line starts here.' },
    { start: 3700, end: 3710, text: 'Past an hour.' },
  ];
  // the pilot flushes a line when an event starts 30 s or more after the
  // line began, that event included
  assert.equal(T.linesFromSegments(segs), [
    '[00:00] Hello and welcome. Today we talk about no. This one crosses thirty seconds.',
    '[00:41] A new line starts here. Past an hour.',
  ].join('\n'));
  assert.equal(T.mmss(3725_000), '1:02:05');
  assert.equal(T.mmss(65_000), '01:05');
});

test('a long file that yields almost nothing is "no speech found", and temp files are gone', async () => {
  stubs({ duration: 900, pieceSegs: () => [{ start: 0, end: 2, text: 'um' }] });
  await assert.rejects(T.getTranscript({ key: 'yt:quiet', title: 'Quiet one' }), (e) => e.kind === 'failed' && e.message === 'no speech found in Quiet one');
  assert.ok(tmpEmpty());
});

test('the transcriber not installed is a failure in its own words, and a piece failure names the piece', async () => {
  stubs();
  T._setTranscriptDepsForTest({ ...{}, tmpRoot: () => TMP, sttConfigured: () => false, probeSeconds: async () => 100 });
  await assert.rejects(T.transcribeLong('/nowhere.mp3'), (e) => e.kind === 'failed' && /not installed \(run server\/voice-stt\/setup\.sh\)/.test(e.message));
  stubs({ duration: 400 });
  T._setTranscriptDepsForTest({
    tmpRoot: () => TMP, sttConfigured: () => true, yieldToHim: async () => {}, probeSeconds: async () => 400, silences: async () => [],
    split: async (f, times, d) => [0, ...times].map((_, i) => { const p = path.join(d, `p00${i}.mp3`); fs.writeFileSync(p, 'x'); return p; }),
    transcribe: async () => { throw new Error('the local transcriber took longer than 300 s'); },
  });
  await assert.rejects(T.transcribeLong(path.join(TMP, 'f.mp3'), { title: 'Long' }), (e) => e.kind === 'failed' && /piece 1 of 2 of Long: the local transcriber took longer/.test(e.message));
  assert.ok(tmpEmpty());
});
