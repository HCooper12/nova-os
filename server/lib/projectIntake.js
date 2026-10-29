// THE CONVERSATION THAT STARTS A PROJECT (Projects phase 1; PROJECTS-PLAN §1).
//
// He types (or says) what he wants as he would to Claude. Nova asks short
// questions in turns until the fixed core is known, says when it has enough,
// and ends with exactly one `BRIEF {json}` line. CODE parses that line, runs
// the kernel's validator, and files a PENDING `project-brief` card. Nothing
// exists on disk until he approves it. A brief that fails the validator is
// not filed: the errors go back into the same session as the next turn, up to
// two rounds, then the card is filed as an error carrying them.
//
// The turn runs on the warm pool (claudeCode.js startProjectIntakeTurn), the
// same path as Ask Nova, with the lens + who he is + this block, his talk
// preferences, and TURN_TAKING last before his words.

import { randomUUID } from 'node:crypto';
import { validateBrief, KINDS, ALLOWANCES } from './projectKernel.js';

export const MAX_FIX_ROUNDS = 2;
export const LONG_PASTE = 400;

export const PROJECT_INTAKE = `YOU ARE STARTING A PROJECT WITH HIM. A project is work Nova holds and returns to for days or months: a folder in ~/Projects, a page in his vault, and a record. You do not create anything; code does, after he approves the brief you write.

Ask short questions, ONE OR TWO PER TURN, until you know the fixed core:
1. the goal, in a sentence;
2. what done looks like;
3. a deadline, if there is one;
4. the kind: ${KINDS.join(', ')} (build = ends in something that runs; life = a room, a trip, a job search);
5. what Nova may do alone, from: ${ALLOWANCES.join(', ')} (everything else asks first);
6. how much it may spend before asking (talk it through; a rough feel is fine, never make him invent a number);
7. which parts of his vault it should read (propose a short list of relative vault paths from the goal; he edits it).
Then the kind's own questions (a build: the stack and where it runs; a room: measurements and photos later; research: what a good answer lets him do). Ask at least one round, always. Never ask what he already told you.

When you have enough, say so in one short sentence, then on its own line write exactly:
BRIEF {"name":"…","kind":"build|research|life","goal":"…","done":"…","deadline":null,"phases":[{"name":"…","what":"…","first":"…"}],"reads":["Wiki/…"],"allowances":{"research":true,"draft":true,"code":false,"test":false,"commit":false,"deploy":false},"limit":{"discussAbove":null,"agreed":null},"firstMoves":["…"]}
The JSON is on ONE line. Nothing after it. The name is at most 60 characters. Two to six phases. Reads are relative vault paths, never absolute, never "..". Do not write the BRIEF line until he has answered at least one question.`;

export const PASTED_NOTE = `HE PASTED A LONG PROMPT. Treat it as the brief's source. First echo back your understanding of it in two or three sentences, then ask ONLY what the core above still lacks.`;

/** The one BRIEF line, strictly. Mirrors watcher.js parseWatchDirective. */
export function parseBriefLine(text) {
  const m = (text || '').match(/^\s*BRIEF\s+(\{.*\})\s*$/m);
  if (!m) return { cleanText: String(text || '').trim(), brief: null };
  const cleanText = text.slice(0, m.index).replace(/\n{3,}/g, '\n\n').trim();
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { cleanText, brief: null, parseError: 'the BRIEF line was not a JSON object' };
    return { cleanText, brief: parsed };
  } catch {
    return { cleanText, brief: null, parseError: 'the BRIEF line was not valid JSON' };
  }
}

export async function buildIntakePrompt(vaultPath, text) {
  const { NOVA_LENS } = await import('./lens.js');
  const { profileContext } = await import('./profile.js');
  const { TURN_TAKING, talkPrefsBlock } = await import('./talk.js');
  let who = '';
  try { who = vaultPath ? await profileContext(vaultPath) : ''; } catch { who = ''; }
  let talk = '';
  try { talk = talkPrefsBlock(vaultPath); } catch { talk = ''; }
  const long = String(text || '').length > LONG_PASTE;
  return [NOVA_LENS, who, PROJECT_INTAKE, long ? PASTED_NOTE : '', talk, TURN_TAKING, `HIS WORDS:\n${text}`].filter(Boolean).join('\n\n');
}

// per-session fix rounds; in memory like the warm pool itself
const rounds = new Map();
export const _resetIntake = () => rounds.clear();

/**
 * What code does with one finished reply. Exported for the test, which hands
 * it a stub `again` instead of a model.
 */
export async function settleIntakeReply(reply, job, again, sessionId, { file } = {}) {
  const { cleanText, brief, parseError } = parseBriefLine(reply);
  if (!brief && !parseError) {
    job.result = { text: cleanText, sessionId, stage: 'asking' };
    job.status = 'ready';
    return job.result;
  }
  const v = brief ? validateBrief(brief) : { ok: false, errors: [parseError] };
  const fileIt = file || fileBriefCard;
  if (v.ok) {
    rounds.delete(sessionId);
    const record = await fileIt({ brief: v.brief, sessionId, status: 'pending' });
    job.result = { text: cleanText || 'I have enough.', sessionId, stage: 'filed', recordId: record.id, brief: v.brief };
    job.status = 'ready';
    return job.result;
  }
  const n = (rounds.get(sessionId) || 0) + 1;
  rounds.set(sessionId, n);
  if (n <= MAX_FIX_ROUNDS) {
    job.stage = 'fixing the brief';
    again(`(Nova's code, not Hayden) The brief was missing: ${v.errors.join('; ')}. Write the BRIEF line again with those fixed, on one line, nothing after it.`);
    return null;
  }
  rounds.delete(sessionId);
  const record = await fileIt({ brief: brief || null, sessionId, status: 'error', errors: v.errors });
  job.result = { text: `${cleanText ? `${cleanText}\n\n` : ''}I could not get the brief into shape: ${v.errors.join('; ')}. It is in your Inbox as an error.`, sessionId, stage: 'error', recordId: record.id };
  job.status = 'ready';
  return job.result;
}

/** The pending card (or the error card). Nothing on disk until he approves. */
export async function fileBriefCard({ brief, sessionId, status, errors = null }) {
  const { createRecord } = await import('./inboxStore.js');
  const { novaKernel } = await import('./novaProjects.js');
  let dryRun = true;
  try { dryRun = novaKernel().defaultDryRun(); } catch { dryRun = true; }
  const name = brief?.name ? String(brief.name).slice(0, 60) : 'a new project';
  return createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'project-brief',
    text: `New project: ${name}`,
    source: 'nova',
    mode: 'draft',
    status,
    createdAt: new Date().toISOString(),
    intakeSessionId: sessionId,
    dryRun,
    ...(errors ? { error: `The brief was missing: ${errors.join('; ')}`, briefErrors: errors } : {}),
    decision: { route: 'project-create', confidence: 'high', title: name, reason: brief?.goal || '', payload: { brief } },
  });
}

/**
 * Start or continue the intake. Returns {jobId, sessionId}; the client polls
 * the job like a code job. `runTurn` is injectable so tests never spawn.
 */
export async function startIntake(vaultPath, { text, sessionId = null } = {}, { runTurn } = {}) {
  const words = String(text || '').trim();
  if (!words) { const e = new Error('say what the project is'); e.code = 'intake'; throw e; }
  if (words.length > 20000) { const e = new Error('that is too long to read in one turn'); e.code = 'intake'; throw e; }
  const sid = typeof sessionId === 'string' && /^[0-9a-f-]{36}$/.test(sessionId) ? sessionId : null;
  const run = runTurn || (await import('./claudeCode.js')).startProjectIntakeTurn;
  const prompt = sid ? words : await buildIntakePrompt(vaultPath, words);
  return run(vaultPath, {
    text: prompt,
    sessionId: sid,
    finish: (reply, job, again, s) => settleIntakeReply(reply, job, again, s),
  });
}
