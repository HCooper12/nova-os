// ONE FRONT DOOR FOR ASK NOVA (19 Oct 2026). Every door that asks Nova
// (routes/voice.js: the PWA ask, the rituals, "start it with me", Siri and
// the Action Button) calls startAsk, and this decides who answers:
//   - he chose the model on this Mac for Ask Nova (the model board) → it
//     answers (lib/localAsk.js), labelled `provider: 'local'`;
//   - otherwise Claude answers (startAskNova), and if Claude FAILS before a
//     word of the answer arrived (the account's usage limit, the CLI dead,
//     no network) the model on this Mac stands in, when the board's fallback
//     is on and the model can run, on the SAME job id the client is already
//     polling. The stand-in says why on the result (provider, fallback,
//     reason), which the client renders as a meta line.
// Consults (lib/consult.js) stay on Claude: they never come through here.
//
// LOCAL FIRST (27 Oct 2026): with the board's local-first default, the model
// on this Mac answers first and Claude is the escalation. If the local turn
// fails before any answer exists (nothing installed, no memory to load, a
// timeout, an empty reply), Claude answers on the SAME job id
// (holdForEscalation, below), and the result says so: `provider: 'claude',
// escalated: true, reason`.
//
// The id is kept by holding the Claude job's status: the job's `status` is
// an accessor (the sideJob idiom in claudeCode.js), so the moment the warm
// pool writes 'error', a stand-in that can run keeps it 'running', and the
// local turn then writes its own progress, result and status into that same
// object. A poll can never see the error first.
import { startAskNova, getMessageJob } from './claudeCode.js';
import { startAskLocal, isLocalOnlySession, localTurnsSinceClaude, transcriptOf, sessionTurns, recordAskTurn } from './localAsk.js';
import { providerFor, laneCanRunLocal, fallbackEnabled, localBoard, laneEnabled } from './modelPrefs.js';
import { localModelConfigured, memoryHeadroom } from './localModel.js';

/** Can the model on this Mac stand in right now? A cheap, synchronous
 *  reading: configured, and either already running or with memory to load. */
export function localCanStandIn() {
  if (!fallbackEnabled() || !laneCanRunLocal('ask-nova')) return { ok: false, why: 'the fallback is off' };
  if (!localModelConfigured()) return { ok: false, why: 'the local model is not installed' };
  if (localBoard().ready) return { ok: true };
  const room = memoryHeadroom();
  return room.ok ? { ok: true } : { ok: false, why: room.reason };
}

/** One plain sentence for why Claude did not answer. */
export function plainReason(job) {
  if (job?.limited) return 'Claude was at its usage limit';
  const e = String(job?.error || '').toLowerCase();
  if (/enotfound|econnrefused|etimedout|network|offline|getaddrinfo|fetch failed|connection/.test(e)) return 'Claude could not be reached';
  return 'Claude could not answer';
}

// The Claude half of a turn, given what the model on this Mac said earlier
// in the same conversation: a session it opened starts fresh on Claude with
// the transcript, and turns it answered while Claude was away ride along.
function claudeOptsFor(opts) {
  let claudeOpts = opts;
  const sid = opts.sessionId || null;
  if (sid && !opts.consulted) {
    if (isLocalOnlySession(sid)) {
      // a conversation the model on this Mac opened: Claude has never seen
      // it, so it starts fresh under the same id, with what was said so far
      const said = transcriptOf(sessionTurns(sid));
      claudeOpts = {
        ...opts,
        resume: false,
        context: [opts.context || '', said ? `Earlier in this conversation (answered on the model on this Mac):\n${said}` : ''].filter(Boolean).join('\n\n'),
      };
    } else {
      const missed = localTurnsSinceClaude(sid);
      if (missed.length) {
        const said = transcriptOf(missed, { maxChars: 1200 });
        claudeOpts = { ...opts, liveLine: [opts.liveLine || '', `While you were unavailable, the model on this Mac answered: ${said}`].filter(Boolean).join(' ') };
      }
    }
  }
  return claudeOpts;
}

// The fields the client's poll (routes/claudeCode.js) and the answer watcher
// (lib/alerts.js) read from a job. After an escalation each one reads
// through to Claude's job.
const VIEW_FIELDS = ['partial', 'stage', 'visuals', 'consult', 'noGlass', 'sessionId'];

// HOW AN ESCALATED ASK KEEPS ITS JOB ID (27 Oct 2026). The local turn's job
// is the one the client polls. startAskLocal takes a carrier job;
// startAskNova does not, and teaching it to would thread a carrier through
// the warm pool, the consult loop and settleAskReply in claudeCode.js. The
// smaller honest change is here: Claude runs on its OWN job, and the carrier
// becomes a live view of it. Every field the poll reads (status, result,
// error and VIEW_FIELDS) is an accessor onto Claude's job from that moment,
// so a partial streams through as it is written, with no polling loop and no
// copy that can fall behind. Only the result is dressed: it carries
// provider 'claude', escalated and the reason. A Claude failure keeps
// Claude's words and adds why this Mac did not answer first.
//
// ONE BRIDGE, TWO LANES (27 Oct 2026, the local Coach): the hold and the
// view are lane-agnostic, so lib/coachTurn.js escalates a local Coach turn
// through these same two functions instead of a second copy. A lane hands
// `escalate(carrier, localError, reason)`; the local turn may name its own
// reason (`job.escalateReason`, e.g. "a change to your program goes to
// Claude") when it is handing up on purpose rather than failing.
export const LOCAL_FAILURE_PREFIX = /^The model on this Mac could not answer: /;

/** Hold a local job's status so a failure before any text hands the SAME job
 *  to Claude. `escalate(job, localError, reason)` runs on the next tick. */
export function holdForEscalation(job, { lane, escalate }) {
  let status = job.status;
  let handed = false;
  Object.defineProperty(job, 'status', {
    enumerable: true,
    configurable: true,
    get: () => status,
    set: (v) => {
      if (v === 'error' && !handed && status === 'running' && !String(job.result?.text || '').trim()) {
        if (laneEnabled(lane)) {
          handed = true;
          // the local turn writes job.error just before the status: read it
          // now, and keep the poll from seeing it while Claude is asked
          const localError = String(job.error || 'it returned no answer').replace(LOCAL_FAILURE_PREFIX, '');
          const reason = job.escalateReason || `the model on this Mac could not answer: ${localError}`;
          job.error = null;
          setImmediate(() => escalate(job, localError, reason));
          return; // stays 'running'
        }
        console.log(`${lane}: the model on this Mac could not answer and the lane is off`);
      }
      status = v;
    },
  });
}

/** A carrier that could not reach Claude at all: a plain error, said once. */
export function failCarrier(carrier, message) {
  Object.defineProperty(carrier, 'error', { value: message, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(carrier, 'status', { value: 'error', writable: true, enumerable: true, configurable: true });
}

/** Make `carrier` a live view of `claudeJob`, its result dressed with
 *  provider 'claude', escalated and the reason. `onReady(claudeJob)` runs
 *  once when Claude's answer is ready (polled or not), for session memory.
 *  `firstWhy` is the sentence a Claude failure ends with. */
export function becomeViewOf(carrier, claudeJob, { reason, firstWhy, onReady = null }) {
  carrier.provider = 'claude';
  carrier.escalated = true;
  carrier.reason = reason;
  let recorded = false;
  const record = () => {
    if (recorded || claudeJob.status !== 'ready' || !claudeJob.result?.text) return;
    recorded = true;
    try { onReady?.(claudeJob); } catch { /* memory is best-effort */ }
  };
  Object.defineProperty(carrier, 'status', {
    enumerable: true,
    configurable: true,
    get: () => { record(); return claudeJob.status; },
    set: () => {}, // Claude's job owns the status now; the local turn is over
  });
  Object.defineProperty(carrier, 'result', {
    enumerable: true,
    configurable: true,
    get: () => (claudeJob.result ? { ...claudeJob.result, provider: 'claude', escalated: true, reason } : claudeJob.result),
    set: () => {},
  });
  Object.defineProperty(carrier, 'error', {
    enumerable: true,
    configurable: true,
    get: () => (claudeJob.error ? `${claudeJob.error} ${firstWhy}` : claudeJob.error),
    set: () => {},
  });
  // a mark the door set on the carrier before the hand-over (routes/voice.js
  // markNoGlass: he is driving) must survive it: Claude's job inherits it
  if (carrier.noGlass && claudeJob.noGlass === undefined) claudeJob.noGlass = carrier.noGlass;
  for (const k of VIEW_FIELDS) {
    Object.defineProperty(carrier, k, {
      enumerable: true,
      configurable: true,
      get: () => claudeJob[k],
      set: (v) => { claudeJob[k] = v; },
    });
  }
  // a turn that finishes with no poll still lands in the session memory
  const until = Date.now() + 10 * 60_000;
  const tick = setInterval(() => {
    record();
    if (recorded || claudeJob.status === 'error' || Date.now() > until) clearInterval(tick);
  }, 1000);
  tick.unref?.();
}

function escalateAsk(carrier, cwd, opts, localError, reason) {
  console.log(`ask: ${reason}; Claude answers on the same job`);
  const firstWhy = `The model on this Mac could not answer first: ${localError}.`;
  let claudeJob = null;
  try {
    const claudeOpts = claudeOptsFor(opts);
    const jobId = startAskNova(cwd, claudeOpts);
    claudeJob = getMessageJob(jobId);
  } catch (e) {
    failCarrier(carrier, `${e.message} ${firstWhy}`);
    return;
  }
  if (!claudeJob) {
    failCarrier(carrier, `Claude could not be asked. ${firstWhy}`);
    return;
  }
  // Claude's answer is kept in the session memory too, so a later local
  // turn knows the conversation it is joining (the stand-in's rule, below)
  becomeViewOf(carrier, claudeJob, {
    reason,
    firstWhy,
    onReady: (cj) => {
      if (cj.result.sessionId) recordAskTurn(cj.result.sessionId, { q: opts.question, a: cj.result.text, provider: 'claude' }).catch(() => {});
    },
  });
}

function holdForStandIn(job, cwd, opts, { newSession }) {
  let status = job.status;
  let handed = false;
  Object.defineProperty(job, 'status', {
    enumerable: true,
    configurable: true,
    get: () => status,
    set: (v) => {
      if (v === 'error' && !handed && status === 'running' && !String(job.partial || '').trim()) {
        const can = localCanStandIn();
        if (can.ok) {
          handed = true;
          // the warm pool sets job.error right after the status: read it once
          // this tick is done, then the stand-in owns the job (a plain status
          // again, so its own writes land as they are made)
          setImmediate(() => {
            const claudeError = job.error || null;
            const reason = plainReason(job);
            console.log(`ask: Claude failed before any text (${String(claudeError || '').slice(0, 120)}); the model on this Mac is standing in`);
            Object.defineProperty(job, 'status', { value: 'running', writable: true, enumerable: true, configurable: true });
            job.claudeError = claudeError;
            job.error = null;
            startAskLocal(cwd, {
              question: opts.question, sessionId: opts.sessionId || null, liveLine: opts.liveLine || '',
              spoken: !!opts.spoken, direct: !!opts.direct, where: opts.where || null, fallback: true, reason,
            }, { job, claudeError, opened: newSession });
          });
          return; // stays 'running'
        }
        console.log(`ask: Claude failed and the model on this Mac cannot stand in (${can.why})`);
      }
      status = v;
      // a Claude answer is kept in the session memory too, so a later
      // stand-in knows the conversation it is joining
      if (v === 'ready' && !handed && job.result?.text && job.result.sessionId) {
        recordAskTurn(job.result.sessionId, { q: opts.question, a: job.result.text, provider: 'claude' }).catch(() => {});
      }
    },
  });
}

/** Start one Ask Nova turn on whichever model should answer it; returns the
 *  job id (synchronously, like startAskNova). Same options as startAskNova. */
export function startAsk(cwd, opts = {}) {
  if (providerFor('ask-nova') === 'local' && !opts.consulted) {
    const jobId = startAskLocal(cwd, {
      question: opts.question, sessionId: opts.sessionId || null, liveLine: opts.liveLine || '',
      spoken: !!opts.spoken, direct: !!opts.direct, where: opts.where || null,
    });
    const job = getMessageJob(jobId);
    if (job) holdForEscalation(job, { lane: 'ask-nova', escalate: (carrier, localError, reason) => escalateAsk(carrier, cwd, opts, localError, reason) });
    return jobId;
  }
  const sid = opts.sessionId || null;
  const claudeOpts = claudeOptsFor(opts);
  const jobId = startAskNova(cwd, claudeOpts);
  const job = getMessageJob(jobId);
  // a turn that opened a Claude session: if the stand-in answers it, the
  // session is the local model's (Claude may never have written it down)
  const newSession = claudeOpts.resume === undefined ? !sid : !claudeOpts.resume;
  if (job && !opts.consulted) holdForStandIn(job, cwd, opts, { newSession });
  return jobId;
}
