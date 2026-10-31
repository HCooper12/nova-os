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
import { statSync } from 'node:fs';
import path from 'node:path';
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
6. how much of Nova's OWN usage (model cost) it may run through before checking in (talk it through; a rough feel is fine, never make him invent a number). This is not the money he spends in the world: a trip's bookings, a purchase or a domain always come to him and never belong in "limit". Unless he gave a limit on Nova's own work, leave "limit" as null and null;
7. which vault pages it should read. Only name a page you were shown or he named; you cannot see his vault, so when unsure leave "reads" empty. Pages only, never a folder, never a whole library such as Wiki/Sources.
Then the kind's own questions (a build: the stack and where it runs; a room: measurements and photos later; research: what a good answer lets him do). Ask at least one round, always. Never ask what he already told you.

When you have enough, say so in one short sentence, then on its own line write exactly:
BRIEF {"name":"…","kind":"build|research|life","goal":"…","done":"…","deadline":null,"phases":[{"name":"…","what":"…","first":"…"}],"reads":["Wiki/…"],"allowances":{"research":true,"draft":true,"code":false,"test":false,"commit":false,"deploy":false},"limit":{"discussAbove":null,"agreed":null},"firstMoves":["…"]}
The JSON is on ONE line. Nothing after it. The name is at most 60 characters. Two to six phases. Reads are relative paths to pages that exist, never absolute, never "..". The card has only Approve and Discard, so never promise he can edit it: if he wants a change he tells you, you write the BRIEF line again, and the earlier card is withdrawn. Do not write the BRIEF line until he has answered at least one question.`;

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

/**
 * The model cannot see his vault, so a path it proposes is a guess. Keep only
 * the pages that exist inside the vault; say what was dropped.
 */
export function cleanReads(vaultPath, reads) {
  const kept = [];
  const dropped = [];
  const root = vaultPath ? path.resolve(vaultPath) : null;
  for (const raw of Array.isArray(reads) ? reads : []) {
    const rel = String(raw || '').trim();
    if (!rel) continue;
    const withExt = /\.[a-z0-9]{1,5}$/i.test(rel) ? rel : `${rel}.md`;
    let ok = false;
    if (root) {
      const full = path.resolve(root, withExt);
      try { ok = full.startsWith(root + path.sep) && statSync(full).isFile(); } catch { ok = false; }
    }
    (ok ? kept : dropped).push(ok ? withExt : rel);
  }
  return { kept, dropped };
}

/** A new brief from the same conversation replaces the earlier pending card. */
export async function withdrawSuperseded(sessionId) {
  if (!sessionId) return [];
  const { listRecords, updateRecord } = await import('./inboxStore.js');
  const old = (await listRecords()).filter((r) => r.kind === 'project-brief' && r.status === 'pending' && r.intakeSessionId === sessionId);
  for (const r of old) await updateRecord(r.id, { status: 'withdrawn', withdrawnAt: new Date().toISOString(), withdrawnFor: 'a newer brief from the same conversation' });
  return old.map((r) => r.id);
}

// per-session fix rounds; in memory like the warm pool itself
const rounds = new Map();
export const _resetIntake = () => rounds.clear();

/**
 * What code does with one finished reply. Exported for the test, which hands
 * it a stub `again` instead of a model.
 */
export async function settleIntakeReply(reply, job, again, sessionId, { file, vaultPath = null, withdraw } = {}) {
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
    const { kept, dropped } = cleanReads(vaultPath, v.brief.reads);
    const brief = { ...v.brief, reads: kept };
    await (withdraw || withdrawSuperseded)(sessionId);
    const record = await fileIt({ brief, sessionId, status: 'pending' });
    const note = dropped.length ? ` Correction: I left out ${dropped.join(', ')} from what it reads, because ${dropped.length === 1 ? 'that is not a page' : 'those are not pages'} in your vault, so ${dropped.length === 1 ? 'it is' : 'they are'} not on the card.` : '';
    job.result = { text: `${cleanText || 'I have enough.'}${note}`, sessionId, stage: 'filed', recordId: record.id, brief };
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
    finish: (reply, job, again, s) => settleIntakeReply(reply, job, again, s, { vaultPath }),
  });
}
