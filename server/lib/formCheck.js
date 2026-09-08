// FORM CHECK — his own lifts, read back rep by rep.
//
// design/ATHLETE-AI-PLAN.md #4. The thing a lifter actually wants from an
// AI, and the one Nova can do honestly only if it refuses the shots it
// cannot read. Three rules hold the whole feature up:
//
//   1. THE PROTOCOL IS THE FEATURE. Side camera at knee height, two metres
//      back, for depth; rear camera at hip height for symmetry; 60fps; whole
//      body in frame. Nova states it before he films and refuses a clip that
//      breaks it, rather than guessing from a bad angle. What code can
//      measure (frame rate, length, resolution) it measures here; what only
//      a human eye can judge (angle, framing) the model judges FIRST, and a
//      "no" ends the run with no review written.
//   2. FRAMES ARE DETERMINISTIC. ffmpeg, evenly spaced, one rate — the model
//      never chooses what it looks at.
//   3. IT SAYS WHAT IT SAW, NOT WHAT IT COMPUTED. No phone camera yields hip
//      flexion in degrees. Any measurement claim that survives the prompt is
//      stripped by code before he ever reads it (`scrubUnmeasurable`).
//
// The review is a PROPOSAL. It rides the inbox rails like everything else
// writeable, and his yes files it against the lift.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { parseModelJson, firstBalancedObjectMatch } from './jsonSalvage.js';

const exec = promisify(execFile);
const CLAUDE_BIN = process.env.NOVA_CLAUDE_BIN || 'claude';
const MAX_BUDGET_USD = process.env.NOVA_FORM_BUDGET_USD || '1.50';

// What he is told BEFORE he films — one paragraph, the same every time, so
// the clip that comes back is one Nova can actually read.
export const PROTOCOL = [
  'Side on, camera at KNEE height, about 2 m back — that is the angle depth and bar path can be read from.',
  'For symmetry, film from BEHIND at hip height instead (say which you shot).',
  '60 fps if your phone offers it — slow-motion is fine, 30 fps is not enough to see the bottom.',
  'Whole body and the bar in frame for every rep, phone steady (lean it on something), lights not behind you.',
  'One working set, nothing else in the clip.',
];

// The measurable half of the protocol. Refusing here costs nothing and saves
// a model call; the numbers are deliberately generous — this rejects a
// 30 fps vlog, not a slightly-off phone.
export const MIN_FPS = 48;
export const MIN_SHORT_SIDE = 540;
export const MIN_SECONDS = 2;
export const MAX_SECONDS = 120;

export async function probeClip(videoPath, { runner = exec } = {}) {
  const { stdout } = await runner('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate,width,height:format=duration',
    '-of', 'json', videoPath,
  ], { timeout: 20_000 });
  const j = JSON.parse(String(stdout));
  const s = j.streams?.[0] || {};
  const [num, den] = String(s.r_frame_rate || '0/1').split('/').map(Number);
  return {
    fps: den ? Math.round((num / den) * 100) / 100 : 0,
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    seconds: Math.round((Number(j.format?.duration) || 0) * 10) / 10,
  };
}

// Deterministic gate. Returns the reasons it cannot be read — an empty list
// means the measurable half passed, never that the clip is good.
export function checkProtocol(probe) {
  const problems = [];
  if (!probe || !probe.seconds) problems.push('I could not read that file as a video at all.');
  else {
    if (probe.fps && probe.fps < MIN_FPS) problems.push(`it is ${probe.fps} fps — the protocol is 60, and below ~${MIN_FPS} the bottom of the rep falls between frames. Turn on 60 fps (or slo-mo) and reshoot.`);
    if (probe.seconds < MIN_SECONDS) problems.push(`it is ${probe.seconds}s long — that is not a working set.`);
    if (probe.seconds > MAX_SECONDS) problems.push(`it is ${Math.round(probe.seconds)}s long — film one working set, not the whole block.`);
    const short = Math.min(probe.width, probe.height);
    if (short && short < MIN_SHORT_SIDE) problems.push(`it is ${probe.width}×${probe.height} — too small to see joint positions. Shoot at 1080p.`);
  }
  return problems;
}

// Frames: evenly spaced across the whole clip, one rate, capped. Enough per
// rep to read the bottom position and the lockout of each (a 6-rep set at
// ~3 s a rep gets ~8 frames a rep), few enough to stay affordable.
export const MAX_FRAMES = 48;
export function frameCountFor(seconds) {
  if (!seconds || seconds <= 0) return 16;
  return Math.max(12, Math.min(MAX_FRAMES, Math.round(seconds * 3)));
}

export async function extractFormFrames(videoPath, outDir, seconds, { runner = exec } = {}) {
  const n = frameCountFor(seconds);
  const fps = seconds > 0 ? Math.max(0.05, n / seconds) : 1;
  await mkdir(outDir, { recursive: true });
  await runner('ffmpeg', ['-y', '-v', 'error', '-i', videoPath,
    '-vf', `fps=${fps.toFixed(3)},scale='min(768,iw)':-2`,
    '-frames:v', String(n), path.join(outDir, 'rep-%02d.jpg')], { timeout: 120_000 });
  const frames = (await readdir(outDir)).filter((f) => /^rep-\d+\.jpg$/.test(f)).sort().map((f) => path.join(outDir, f));
  return { frames, requested: n };
}

/* ------------------------------ the rubrics ------------------------------ */

// A written rubric per lift: what to look at, in the order a coach looks at
// it, and which camera angle can actually show it. Nothing here is a number
// Nova could not see — "heels stay down" is visible; "35° of dorsiflexion"
// is not.
const GENERIC = {
  key: 'generic',
  angle: 'side',
  points: [
    'Range of motion — does each rep reach the same end position, and is the last rep as deep as the first?',
    'Bar/limb path — does it travel a straight, repeatable line, or wander?',
    'Bracing — does the ribcage stay down and the midsection stay tight through the hardest part?',
    'Tempo — is the lowering controlled, or does it drop and bounce?',
    'Rep-to-rep consistency — where does the pattern start to change as fatigue arrives?',
  ],
};

export const RUBRICS = [
  {
    key: 'squat', match: /\b(back squat|front squat|goblet squat|squat)\b/i, angle: 'side (knee height) for depth; rear (hip height) for symmetry',
    points: [
      'Depth — does the hip crease pass below the top of the knee, and does it hold across reps?',
      'Bar path — does the bar stay stacked over midfoot, or drift forward over the toes?',
      'Knee travel — do the knees track over the feet, or collapse inward as he stands up?',
      'Torso angle — does the chest fold forward out of the hole (a "good morning" squat)?',
      'Heels — do they stay flat through the whole rep?',
      'Tempo — is the descent controlled, or a drop into the bottom?',
    ],
  },
  {
    key: 'deadlift', match: /\b(deadlift|rdl|romanian|stiff[- ]leg)\b/i, angle: 'side (hip height) for the back and the bar',
    points: [
      'Start position — are the hips set before the bar breaks the floor, or do they shoot up first?',
      'Spine — does the lower back hold its position, or round as the bar leaves the floor?',
      'Bar path — does the bar stay against the legs, or swing out in front?',
      'Lockout — do the hips and knees finish together, without leaning back?',
      'Hinge (RDL) — is it a hip hinge with soft knees, or a squat with a bar?',
      'Reset — is each rep set up the same way, or do later reps get sloppier?',
    ],
  },
  {
    key: 'bench', match: /\b(bench press|bench|chest press|floor press)\b/i, angle: 'side, level with the bench, whole bar visible',
    points: [
      'Touch point — does the bar meet the same spot on the chest each rep?',
      'Bar path — a slight J back over the shoulders, or straight up and forward?',
      'Elbows — tucked toward the ribs on the way down, or flared straight out toward the ears?',
      'Contact — do the shoulder blades stay set and the feet stay planted?',
      'Lockout — full extension without the bar drifting toward the face?',
      'Bounce — does the bar rest on the chest, or bounce off it?',
    ],
  },
  {
    key: 'press', match: /\b(overhead press|shoulder press|ohp|push press|military)\b/i, angle: 'side, camera at chest height',
    points: [
      'Start — is the bar on the front delts with the elbows under it?',
      'Path — does the head move back out of the way and the bar finish over the midfoot?',
      'Ribcage — does the back arch to make room, or does the brace hold?',
      'Lockout — biceps by the ears at the top, or a press that stops short?',
      'Legs — is there a dip driving it (push press) when the set is meant to be strict?',
    ],
  },
  {
    key: 'row', match: /\b(row|pulldown|pull[- ]?up|chin[- ]?up|pull down)\b/i, angle: 'side for the torso; rear for symmetry',
    points: [
      'Torso — does it stay still, or swing to move the weight?',
      'Range — does each rep finish at the same point, and reach full stretch at the bottom?',
      'Shoulder blades — do they move, or do the arms do all the work?',
      'Symmetry (rear view) — do both sides pull the same distance at the same time?',
      'Tempo — is the negative controlled, or a drop?',
    ],
  },
  {
    key: 'hinge-machine', match: /\b(hip thrust|glute bridge|leg press|hack squat|split squat|lunge|step[- ]?up)\b/i, angle: 'side, whole body and the machine path in frame',
    points: [
      'Range — does each rep reach the same end position?',
      'Hip/knee sequence — does the intended joint do the work, or does the movement shift as it gets hard?',
      'Symmetry — do both sides travel the same distance (single-leg work especially)?',
      'Spine — does the lower back stay neutral at the top and bottom?',
      'Tempo — controlled, or thrown and caught?',
    ],
  },
];

export function rubricFor(exerciseName = '') {
  const name = String(exerciseName || '');
  return RUBRICS.find((r) => r.match.test(name)) || GENERIC;
}

/* ------------------------------- the prompt ------------------------------ */

export function buildFormPrompt({ exerciseName, rubric, frames, probe, view, note }) {
  const list = frames.map((f, i) => `- frame ${String(i + 1).padStart(2, '0')}: ${f}`).join('\n');
  return `You are reviewing ONE working set of ${exerciseName || 'a lift'} filmed by the lifter himself. The frames below were cut from his clip by ffmpeg at an even rate — they are the whole set, in order, and they are ALL you have. There is no video, no audio and no sensor data.

READ EVERY FRAME with the Read tool before you write anything.

Clip: ${probe.seconds}s at ${probe.fps} fps, ${probe.width}×${probe.height}, ${frames.length} frames${view ? `, filmed from the ${view}` : ''}.${note ? `\nHe says: "${note}"` : ''}

STEP 1 — IS THIS CLIP READABLE? The protocol he was given is: ${rubric.angle} camera, whole body and the bar in frame, 60 fps, one working set. If the frames do not actually show that — the angle is wrong for what you would have to judge, the body or the bar leaves the frame, it is too dark, the lifter is too far away, or it is not ${exerciseName || 'the named lift'} at all — then set "usable": false, say plainly what is wrong and what to change, and STOP. A guess from a bad angle is worse than no review: he would train on it. Do not soften this to be helpful.

STEP 2 — only if it is readable. Work through this rubric for ${rubric.key === 'generic' ? 'this lift' : `the ${rubric.key}`}, in order:
${rubric.points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Then read the set back REP BY REP: how many reps you can count, and what changed as it went on.

WHAT YOU MAY NOT DO — this is the difference between a coach and a liar:
- Never state a measurement you cannot make from a phone video. No degrees of anything, no centimetres of bar travel, no percentages, no velocities. Nova strips any that slip through, and the gap will show.
- Never claim to see something the frames do not show. "The frames do not show his feet" is a real, useful answer.
- Never pad with generic advice he did not ask for. If the set looks good, say it looks good and stop.

Reply with ONE JSON object and nothing else:
{
  "usable": true|false,
  "why": "<if unusable: what is wrong and exactly what to change when reshooting. Empty when usable.>",
  "reps": <number of reps you can count, or null>,
  "readback": ["<rep 1: one short line>", "<rep 2: …>"],
  "points": [{"name": "<rubric point>", "saw": "<what the frames actually show>", "verdict": "good"|"watch"|"fix"}],
  "summary": "<2-3 sentences, plain, what this set was>",
  "fixes": ["<at most two things to change next session, most valuable first>"],
  "confidence": "high"|"low"
}

Frames:
${list}`;
}

/* ------------------------- the honesty guard ----------------------------- */

// A measurement no phone video can support, stripped before he reads it.
// Degrees, centimetres/inches of travel, percentages, m/s. Weights and rep
// counts are fine — those come from him, not from the pixels.
const UNMEASURABLE = /\b\d+(?:\.\d+)?\s*(?:°|degrees?|deg\b|cm\b|centimet(?:re|er)s?\b|mm\b|inch(?:es)?\b|"|%|m\/s\b)/gi;

export function scrubUnmeasurable(text) {
  const s = String(text || '');
  let hits = 0;
  const cleaned = s.replace(UNMEASURABLE, () => { hits++; return '[a measurement Nova cannot make from a video]'; });
  return { text: cleaned, hits };
}

export function parseFormResult(raw) {
  const m = firstBalancedObjectMatch(String(raw || ''));
  if (!m) return null;
  let o;
  try { o = parseModelJson(m[0]); } catch { return null; }
  let scrubbed = 0;
  const clean = (v) => { const r = scrubUnmeasurable(v); scrubbed += r.hits; return r.text; };
  const usable = o.usable !== false;
  const out = {
    usable,
    why: clean(String(o.why || '')).slice(0, 900), // a refusal must read to its end — 600 cut one mid-sentence in the first live run
    reps: Number.isFinite(Number(o.reps)) && Number(o.reps) > 0 ? Math.round(Number(o.reps)) : null,
    readback: Array.isArray(o.readback) ? o.readback.map((l) => clean(String(l)).slice(0, 200)).filter(Boolean).slice(0, 20) : [],
    points: Array.isArray(o.points) ? o.points.map((p) => ({
      name: String(p?.name || '').slice(0, 120),
      saw: clean(String(p?.saw || '')).slice(0, 400),
      verdict: ['good', 'watch', 'fix'].includes(p?.verdict) ? p.verdict : 'watch',
    })).filter((p) => p.name && p.saw).slice(0, 10) : [],
    summary: clean(String(o.summary || '')).slice(0, 800),
    fixes: Array.isArray(o.fixes) ? o.fixes.map((f) => clean(String(f)).slice(0, 200)).filter(Boolean).slice(0, 2) : [],
    confidence: o.confidence === 'low' ? 'low' : 'high',
    scrubbed,
  };
  if (usable && !out.points.length && !out.summary) return null; // a review with nothing in it is not a review
  return out;
}

// The note his yes files. Written here so the record's body and the vault
// page are the same words — he approves exactly what gets written.
export function renderFormNote({ exerciseName, review, probe, view, date }) {
  const lines = [`# Form check — ${exerciseName}`, '', `**${date}** · ${probe.seconds}s at ${probe.fps} fps${view ? ` · filmed from the ${view}` : ''}${review.reps ? ` · ${review.reps} reps read` : ''}`, ''];
  if (review.summary) lines.push(review.summary, '');
  if (review.points.length) {
    lines.push('## What the frames showed', '');
    for (const p of review.points) lines.push(`- **${p.name}** — ${p.saw} _(${p.verdict})_`);
    lines.push('');
  }
  if (review.readback.length) {
    lines.push('## Rep by rep', '');
    for (const r of review.readback) lines.push(`- ${r}`);
    lines.push('');
  }
  if (review.fixes.length) {
    lines.push('## Next session', '');
    for (const f of review.fixes) lines.push(`- ${f}`);
    lines.push('');
  }
  lines.push('---', '', '_Read from frames of his own clip against a written rubric. Nothing here is measured — it is what the frames showed._');
  if (review.scrubbed) lines.push('', `_${review.scrubbed} measurement claim${review.scrubbed === 1 ? '' : 's'} removed: a phone video cannot support them._`);
  return lines.join('\n');
}

export function formTitle(exerciseName, review) {
  const fix = review.points.find((p) => p.verdict === 'fix');
  const head = fix ? fix.name.replace(/\s*—.*$/, '') : review.points.length ? 'nothing to change' : 'reviewed';
  return `Form check — ${exerciseName}: ${head}`;
}

/* ------------------------------- the run --------------------------------- */

const jobs = new Map();
export const FORM_LANE = 'form-check';

export function getFormJob(id) {
  return jobs.get(id) || null;
}

export function startFormCheck({ videoPath, exerciseId, exerciseName, sessionId = null, view = null, note = null, vaultPath, deps = {} }) {
  if (!laneEnabled(FORM_LANE)) throw laneOffError(FORM_LANE);
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', stage: 'checking the clip', result: null, error: null, protocol: PROTOCOL };
  jobs.set(jobId, job);
  run(job, { videoPath, exerciseId, exerciseName, sessionId, view, note, vaultPath, deps }).catch((e) => {
    job.status = 'error';
    job.error = e.message;
  });
  return job;
}

async function run(job, { videoPath, exerciseId, exerciseName, sessionId, view, note, vaultPath, deps }) {
  const probeFn = deps.probeClip || probeClip;
  const framesFn = deps.extractFormFrames || extractFormFrames;
  const askFn = deps.ask || askModel;
  const fileFn = deps.fileRecord || fileFormRecord;

  const probe = await probeFn(videoPath).catch(() => null);
  const problems = checkProtocol(probe);
  if (problems.length) {
    // Refused on the measurable half — no model call, no review, and the
    // reason is the protocol he can act on.
    job.status = 'refused';
    job.result = { usable: false, refusedBy: 'protocol', problems, protocol: PROTOCOL, probe };
    return;
  }

  job.stage = 'cutting frames';
  const outDir = path.join(path.dirname(videoPath), `form-${job.id}`);
  const { frames } = await framesFn(videoPath, outDir, probe.seconds);
  if (!frames.length) {
    job.status = 'error';
    job.error = 'the frames could not be cut from that clip';
    return;
  }

  job.stage = 'reading the set';
  const rubric = rubricFor(exerciseName);
  const text = await askFn(buildFormPrompt({ exerciseName, rubric, frames, probe, view, note }));
  const review = parseFormResult(text);
  if (!review) {
    job.status = 'error';
    job.error = 'the review came back in a shape Nova could not read';
    return;
  }

  if (!review.usable) {
    // The model's own refusal — the angle or the framing, which no ffprobe
    // can see. Still no review, still nothing filed.
    job.status = 'refused';
    job.result = { ...review, refusedBy: 'model', protocol: PROTOCOL, probe };
    return;
  }

  job.stage = 'filing the review';
  const record = await fileFn({ exerciseId, exerciseName, sessionId, review, probe, view, vaultPath });
  job.status = 'done';
  job.result = { ...review, probe, rubric: rubric.key, recordId: record?.id || null };
}

async function askModel(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs('Read'),
      '--output-format', 'json',
      '--max-budget-usd', MAX_BUDGET_USD,
      '--model', modelFor(FORM_LANE),
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    settleWatchdog(child, { label: 'the form check', minutes: 8 });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim().split('\n').pop() || `claude exited with code ${code}`));
      try {
        const outer = JSON.parse(out);
        if (outer.is_error) return reject(new Error(outer.result || 'the form check failed'));
        resolve(String(outer.result || ''));
      } catch (e) { reject(new Error(e.message)); }
    });
  });
}

// The proposal. Nothing is written to the vault until he approves it.
async function fileFormRecord({ exerciseId, exerciseName, sessionId, review, probe, view }) {
  const { createRecord } = await import('./inboxStore.js');
  const date = new Date().toISOString().slice(0, 10);
  const body = renderFormNote({ exerciseName, review, probe, view, date });
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'form',
    text: formTitle(exerciseName, review),
    source: 'form-check',
    mode: 'review-all',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'form',
      confidence: review.confidence,
      title: formTitle(exerciseName, review),
      reason: 'read from frames of your own clip against a written rubric — approve to keep it against this lift',
      payload: { exerciseId, exerciseName, sessionId, date, title: formTitle(exerciseName, review), body, review },
    },
  };
  await createRecord(record);
  return record;
}
