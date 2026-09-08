// FORM CHECK — the protocol is the feature. A clip that breaks it is refused
// rather than guessed at, and a review never states a number a phone camera
// cannot support.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL, MIN_FPS, checkProtocol, frameCountFor, rubricFor, RUBRICS,
  buildFormPrompt, parseFormResult, scrubUnmeasurable, renderFormNote, formTitle,
  probeClip, extractFormFrames,
} from '../lib/formCheck.js';

const probe = { fps: 60, width: 1920, height: 1080, seconds: 18 };

test('the measurable half of the protocol is checked by code, with the fix in the reason', () => {
  assert.deepEqual(checkProtocol(probe), []);
  const slow = checkProtocol({ ...probe, fps: 30 });
  assert.equal(slow.length, 1);
  assert.match(slow[0], /30 fps/);
  assert.match(slow[0], /Turn on 60 fps/, 'it says what to do, not just what is wrong');
  assert.match(checkProtocol({ ...probe, seconds: 1 })[0], /not a working set/);
  assert.match(checkProtocol({ ...probe, seconds: 300 })[0], /one working set, not the whole block/);
  assert.match(checkProtocol({ ...probe, width: 480, height: 360 })[0], /1080p/);
  assert.match(checkProtocol(null)[0], /could not read that file/);
  assert.ok(MIN_FPS >= 48 && PROTOCOL.length >= 4);
});

test('frames are deterministic — enough per rep, never unbounded', () => {
  assert.equal(frameCountFor(18), 48, 'a normal set is capped at the ceiling');
  assert.equal(frameCountFor(4), 12, 'a short set still gets a readable floor');
  assert.equal(frameCountFor(600), 48);
  assert.equal(frameCountFor(0), 16);
  assert.equal(frameCountFor(5), 15);
});

test('each lift gets its own rubric, and an unknown lift gets the honest generic one', () => {
  assert.equal(rubricFor('Barbell Back Squat').key, 'squat');
  assert.equal(rubricFor('Romanian Deadlift').key, 'deadlift');
  assert.equal(rubricFor('Incline Barbell Bench Press').key, 'bench');
  assert.equal(rubricFor('Standing Overhead Press').key, 'press');
  assert.equal(rubricFor('Chest Supported Row').key, 'row');
  assert.equal(rubricFor('Bulgarian Split Squat').key, 'squat', 'the squat rubric covers the pattern');
  assert.equal(rubricFor('Cable Bicep Curl').key, 'generic');
  assert.equal(rubricFor('').key, 'generic');
  // every rubric names the angle it needs and asks only about things a frame shows
  for (const r of [...RUBRICS, rubricFor('')]) {
    assert.ok(r.angle && r.points.length >= 5, r.key);
    assert.ok(!/\d+\s*(°|degrees)/i.test(r.points.join(' ')), `${r.key} asks for a measurement`);
  }
});

test('the prompt makes refusal the first job, names every frame, and forbids invented numbers', () => {
  const frames = ['/d/rep-01.jpg', '/d/rep-02.jpg'];
  const p = buildFormPrompt({ exerciseName: 'Barbell Back Squat', rubric: rubricFor('Barbell Back Squat'), frames, probe, view: 'side', note: 'felt heavy' });
  assert.match(p, /STEP 1 — IS THIS CLIP READABLE\?/);
  assert.match(p, /"usable": false/);
  assert.match(p, /A guess from a bad angle is worse than no review/);
  assert.match(p, /Never state a measurement you cannot make from a phone video/);
  assert.match(p, /No degrees of anything/);
  assert.match(p, /Depth — does the hip crease/, 'the rubric rides in the prompt');
  assert.match(p, /rep-01\.jpg/);
  assert.match(p, /rep-02\.jpg/);
  assert.match(p, /18s at 60 fps/);
  assert.match(p, /felt heavy/);
});

test('a measurement no phone can make is stripped before he reads it', () => {
  const r = scrubUnmeasurable('Hip flexion reaches 95 degrees; the bar drifts 4cm forward at 0.4 m/s, about 12% off.');
  assert.equal(r.hits, 4);
  assert.ok(!/95 degrees|4cm|0\.4 m\/s|12%/.test(r.text));
  assert.match(r.text, /a measurement Nova cannot make from a video/);
  // his own numbers are not measurements Nova made — they survive
  assert.equal(scrubUnmeasurable('8 reps at 100kg, the third rep was the slowest').hits, 0);
});

test('a review parses into what it saw, with the invented numbers counted', () => {
  const raw = `Here you go.
{"usable": true, "why": "", "reps": 6,
 "readback": ["Rep 1: deepest of the set", "Rep 5: cut short"],
 "points": [
   {"name": "Depth", "saw": "Hip crease clears the knee to rep 4, then stops level with it at 88 degrees", "verdict": "watch"},
   {"name": "Bar path", "saw": "Stays over midfoot every rep", "verdict": "good"},
   {"name": "", "saw": "dropped", "verdict": "fix"}
 ],
 "summary": "Six reps, solid until fatigue.", "fixes": ["Stop the set at rep 4"], "confidence": "high"}`;
  const r = parseFormResult(raw);
  assert.equal(r.usable, true);
  assert.equal(r.reps, 6);
  assert.equal(r.readback.length, 2);
  assert.equal(r.points.length, 2, 'a point with no name is not a point');
  assert.equal(r.scrubbed, 1);
  assert.ok(!/88 degrees/.test(r.points[0].saw));
  assert.equal(r.points[1].verdict, 'good');
  assert.equal(r.fixes[0], 'Stop the set at rep 4');
});

test('the model\'s own refusal survives the parse, and an empty review is not a review', () => {
  const r = parseFormResult('{"usable": false, "why": "Filmed from the front — depth cannot be judged. Reshoot side on at knee height.", "points": []}');
  assert.equal(r.usable, false);
  assert.match(r.why, /Reshoot side on/);
  assert.equal(parseFormResult('{"usable": true, "points": [], "summary": ""}'), null);
  assert.equal(parseFormResult('no json here'), null);
  assert.equal(parseFormResult('{broken'), null);
});

test('the note he approves is the words he read, and it says what it is not', () => {
  const review = parseFormResult('{"usable":true,"reps":5,"readback":["Rep 1: clean"],"points":[{"name":"Depth","saw":"Below parallel every rep at 90 degrees","verdict":"good"}],"summary":"Good set.","fixes":["Keep the tempo"],"confidence":"high"}');
  const note = renderFormNote({ exerciseName: 'Barbell Back Squat', review, probe, view: 'side', date: '2026-09-08' });
  assert.match(note, /^# Form check — Barbell Back Squat/);
  assert.match(note, /18s at 60 fps · filmed from the side · 5 reps read/);
  assert.match(note, /## What the frames showed/);
  assert.match(note, /## Rep by rep/);
  assert.match(note, /Nothing here is measured — it is what the frames showed/);
  assert.match(note, /1 measurement claim removed/, 'the strip is disclosed, not hidden');
  assert.ok(!/90 degrees/.test(note));
  assert.match(formTitle('Barbell Back Squat', review), /^Form check — Barbell Back Squat: nothing to change$/);
  const bad = { ...review, points: [{ name: 'Knee travel', saw: 'Left knee collapses in', verdict: 'fix' }] };
  assert.equal(formTitle('Squat', bad), 'Form check — Squat: Knee travel');
});

// ---- the run, with the shell commands and the model stubbed ----
test('a clip that fails the measurable protocol never reaches the model', async () => {
  const { startFormCheck } = await import('../lib/formCheck.js');
  let asked = false;
  const job = startFormCheck({
    videoPath: '/tmp/clip.mov', exerciseName: 'Barbell Back Squat', vaultPath: '/vault',
    deps: {
      probeClip: async () => ({ fps: 30, width: 1920, height: 1080, seconds: 20 }),
      ask: async () => { asked = true; return '{}'; },
      fileRecord: async () => ({ id: 'x' }),
    },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(job.status, 'refused');
  assert.equal(job.result.refusedBy, 'protocol');
  assert.match(job.result.problems[0], /30 fps/);
  assert.equal(asked, false, 'no model call was made');
  assert.ok(job.result.protocol.length, 'it hands back what to film instead');
});

test('the model\'s "I cannot read this" also files nothing', async () => {
  const { startFormCheck } = await import('../lib/formCheck.js');
  let filed = false;
  const job = startFormCheck({
    videoPath: '/tmp/clip.mov', exerciseName: 'Barbell Back Squat', vaultPath: '/vault',
    deps: {
      probeClip: async () => probe,
      extractFormFrames: async () => ({ frames: ['/f/rep-01.jpg'], requested: 48 }),
      ask: async () => '{"usable": false, "why": "Filmed from the front."}',
      fileRecord: async () => { filed = true; return { id: 'x' }; },
    },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(job.status, 'refused');
  assert.equal(job.result.refusedBy, 'model');
  assert.equal(filed, false, 'nothing lands in the inbox from an unreadable clip');
});

test('a readable clip becomes a PROPOSAL — never a write', async () => {
  const { startFormCheck } = await import('../lib/formCheck.js');
  let record = null;
  const job = startFormCheck({
    videoPath: '/tmp/clip.mov', exerciseId: 'barbell-back-squat', exerciseName: 'Barbell Back Squat', sessionId: 's1', view: 'side', vaultPath: '/vault',
    deps: {
      probeClip: async () => probe,
      extractFormFrames: async () => ({ frames: ['/f/rep-01.jpg', '/f/rep-02.jpg'], requested: 48 }),
      ask: async () => '{"usable":true,"reps":6,"readback":["Rep 1: clean"],"points":[{"name":"Depth","saw":"Below parallel","verdict":"good"}],"summary":"Good set.","fixes":[],"confidence":"high"}',
      fileRecord: async (r) => { record = r; return { id: 'rec1' }; },
    },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(job.status, 'done');
  assert.equal(job.result.recordId, 'rec1');
  assert.equal(job.result.rubric, 'squat');
  assert.equal(record.exerciseId, 'barbell-back-squat');
  assert.equal(record.sessionId, 's1');
  assert.equal(record.review.reps, 6);
});

test('probe and frame extraction speak ffprobe/ffmpeg exactly', async () => {
  const calls = [];
  const p = await probeClip('/tmp/c.mov', {
    runner: async (bin, args) => { calls.push([bin, args]); return { stdout: JSON.stringify({ streams: [{ r_frame_rate: '120/2', width: 1080, height: 1920 }], format: { duration: '17.44' } }) }; },
  });
  assert.deepEqual(p, { fps: 60, width: 1080, height: 1920, seconds: 17.4 });
  assert.equal(calls[0][0], 'ffprobe');
  const frameCalls = [];
  await extractFormFrames('/tmp/c.mov', '/tmp/out-formcheck-test', 18, {
    runner: async (bin, args) => { frameCalls.push([bin, args]); return { stdout: '' }; },
  });
  assert.equal(frameCalls[0][0], 'ffmpeg');
  assert.match(frameCalls[0][1].join(' '), /fps=2\.667/, '48 frames across 18 seconds, evenly');
  assert.match(frameCalls[0][1].join(' '), /rep-%02d\.jpg/);
});

// A path with a space in it (his vault lives under "Claude Projects") must
// survive to ffmpeg intact. `new URL(import.meta.url).pathname` percent-
// encodes it, and image2 then reads "%20" as a format specifier and refuses
// to write a sequence — which is how video attachments had been silently
// failing to produce frames since they shipped. fileURLToPath is the fix.
test('the data directory is a real path, not a URL-encoded one', async () => {
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const spaced = '/Users/x/Claude Projects/nova-os/server/lib/attachments.js';
  assert.match(new URL(pathToFileURL(spaced)).pathname, /%20/, 'the trap: URL pathname encodes the space');
  assert.equal(fileURLToPath(pathToFileURL(spaced)), spaced);
  const att = await import('../lib/attachments.js');
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../lib/attachments.js', import.meta.url), 'utf8'));
  assert.ok(!/new URL\(import\.meta\.url\)\.pathname/.test(src), 'attachments.js must not resolve its directory through a URL pathname');
  assert.ok(att.storeAttachments, 'module still loads');
  const hands = await import('node:fs').then((fs) => fs.readFileSync(new URL('../lib/hands.js', import.meta.url), 'utf8'));
  assert.ok(!/new URL\(import\.meta\.url\)\.pathname/.test(hands), 'hands.js too');
});
