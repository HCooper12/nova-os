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
// The id is kept by holding the Claude job's status: the job's `status` is
// an accessor (the sideJob idiom in claudeCode.js), so the moment the warm
// pool writes 'error', a stand-in that can run keeps it 'running', and the
// local turn then writes its own progress, result and status into that same
// object. A poll can never see the error first.
import { startAskNova, getMessageJob } from './claudeCode.js';
import { startAskLocal, isLocalOnlySession, localTurnsSinceClaude, transcriptOf, sessionTurns, recordAskTurn } from './localAsk.js';
import { providerFor, laneCanRunLocal, fallbackEnabled, localBoard } from './modelPrefs.js';
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
    return startAskLocal(cwd, {
      question: opts.question, sessionId: opts.sessionId || null, liveLine: opts.liveLine || '',
      spoken: !!opts.spoken, direct: !!opts.direct, where: opts.where || null,
    });
  }
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
  const jobId = startAskNova(cwd, claudeOpts);
  const job = getMessageJob(jobId);
  // a turn that opened a Claude session: if the stand-in answers it, the
  // session is the local model's (Claude may never have written it down)
  const newSession = claudeOpts.resume === undefined ? !sid : !claudeOpts.resume;
  if (job && !opts.consulted) holdForStandIn(job, cwd, opts, { newSession });
  return jobId;
}
