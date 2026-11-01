// STARTING A PROJECT BY TALKING TO NOVA (1 Nov 2026, his words: "I should be
// able to simply speak to Nova through the voice conversation feature and
// have the project be built and begun but then stored and accessed through
// the projects section").
//
// The Voice conversation stays the one surface. When he says he wants to
// start a project, Nova's model names the verb (project.start, lib/
// projectVerbs.js) and code opens the SAME intake the Projects page uses
// (lib/projectIntake.js: same lane, same validated BRIEF line, same pending
// card). While it runs, his voice asks are answered by the intake session
// through this adapter, which hands the Voice client the job shape it already
// polls for any Nova turn:
//   job.partial   streamed text, with the BRIEF/ACT line cut off so it is
//                 never spoken;
//   job.result    { text, more:null, intake:{ sessionId, stage },
//                   proposal?:{ recordId, title, route:'project-create', projectBrief:true } }
// No `sessionId` on the result: the Voice conversation's own session must not
// be replaced by the intake's. A filed brief arrives as a proposal, so his
// spoken yes is the existing approve rail (approveRecord → the kernel).
//
// "Never mind": the intake model writes ACT {"verb":"project.cancel"}; code
// validates it, withdraws any pending card from this session and ends the
// intake. Nothing is created.

import { parseActDirective } from './verbs.js';

const UUID = /^[0-9a-f-]{36}$/;
const CUT = /(^|\n)\s*(BRIEF|ACT)\b[\s\S]*$/i;

export const VOICE_INTAKE_NOTE = `YOU ARE TALKING, NOT TYPING. He is speaking to you in the Voice conversation; your words are read aloud. One short question per turn. Never read the BRIEF line out as words: write it on its own line as instructed. When the card is filed, say in one short sentence that it is ready for his yes; his spoken "yes" creates it.
If he says he does not want to go on with it (never mind, cancel, forget it), write one short sentence and then, on its own line, exactly:
ACT {"verb":"project.cancel","args":{}}`;

/** What the Voice client may hear of a partial reply: never a directive line. */
export const speakablePartial = (s) => (s == null ? s : String(s).replace(CUT, '').trimEnd());

/**
 * The intake result, in the Voice job's shape. Pure over the result the
 * intake wrote (settleIntakeReply). `cancelled` from code, never the model.
 */
export function adaptIntakeResult(r, sessionId) {
  if (!r) return null;
  const stage = r.stage || 'asking';
  const out = { text: r.text || '', more: null, intake: { sessionId, stage } };
  if (stage === 'filed' && r.recordId) {
    const name = r.brief?.name || 'the project';
    out.proposal = { recordId: r.recordId, title: `Start ${name}`, route: 'project-create', projectBrief: true };
  }
  if (stage === 'error') out.intake.recordId = r.recordId || null;
  return out;
}

/** End an intake: its pending cards are withdrawn; nothing is created. */
export async function cancelVoiceIntake(sessionId) {
  if (!sessionId || !UUID.test(sessionId)) return [];
  const { listRecords, updateRecord } = await import('./inboxStore.js');
  const open = (await listRecords()).filter((r) => r.kind === 'project-brief' && r.status === 'pending' && r.intakeSessionId === sessionId);
  for (const r of open) await updateRecord(r.id, { status: 'withdrawn', withdrawnAt: new Date().toISOString(), withdrawnFor: 'he called the project off in conversation' });
  const { _forgetRounds } = await import('./projectIntake.js');
  _forgetRounds?.(sessionId);
  return open.map((r) => r.id);
}

/**
 * Start (no sessionId) or continue a spoken intake. Returns { jobId,
 * sessionId }; the job is polled like any Nova turn. `deps` is for tests:
 * `runTurn` stands in for the warm intake turn, `getJob` for the job map.
 */
// a test may stand in for the warm intake turn (never in production)
let testDeps = null;
export function _setVoiceIntakeDepsForTest(d) { testDeps = d || null; }

export async function startVoiceIntake(vaultPath, { text, sessionId = null } = {}, deps = testDeps || {}) {
  const sid = typeof sessionId === 'string' && UUID.test(sessionId) ? sessionId : null;
  const { startIntake } = await import('./projectIntake.js');
  const run = deps.runTurn || (await import('./claudeCode.js')).startProjectIntakeTurn;
  const getJob = deps.getJob || (await import('./claudeCode.js')).getMessageJob;
  const out = await startIntake(vaultPath, { text, sessionId: sid, note: sid ? '' : VOICE_INTAKE_NOTE }, {
    runTurn: (vp, opts) => run(vp, {
      ...opts,
      finish: async (reply, job, again, s) => {
        // "never mind": validated by code before anything else reads the reply
        const act = parseActDirective(String(reply || ''));
        if (act.act && act.act.verb === 'project.cancel') {
          await cancelVoiceIntake(s);
          job.result = { text: act.cleanText || 'Dropped. Nothing was made.', more: null, intake: { sessionId: s, stage: 'cancelled' } };
          job.status = 'ready';
          return job.result;
        }
        const r = await opts.finish(act.act ? act.cleanText : reply, job, again, s);
        if (r) { job.result = adaptIntakeResult(r, s); job.status = 'ready'; }
        return job.result;
      },
    }),
  });
  // what is streamed is what he hears: the BRIEF and ACT lines never are
  const job = getJob?.(out.jobId);
  if (job && !Object.getOwnPropertyDescriptor(job, 'partial')?.get) {
    let raw = job.partial ?? null;
    Object.defineProperty(job, 'partial', { get: () => speakablePartial(raw), set: (v) => { raw = v; }, enumerable: true, configurable: true });
  }
  return { jobId: out.jobId, sessionId: out.sessionId };
}
