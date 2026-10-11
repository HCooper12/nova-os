import { spawn as nodeSpawn } from 'node:child_process';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { modelFor, laneOffError, laneEnabled } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { registerJobMap } from './jobRegistry.js';
import { parseEnvelope } from './modelSpend.js';
import { NOVA_LENS } from './lens.js';

// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const jobs = registerJobMap('journalPrompt', new Map());

// THREE KINDS OF PROMPT, WRITTEN AT THE TAP (11 Oct 2026, mockup 95, his
// call). Nothing here runs on a schedule and nothing is written ahead: a
// prompt costs one model call only when he opens the sheet (or taps
// Another), so a day he does not journal spends nothing.
//   deep    an ORIGINAL philosophical or psychological question at the depth
//           of a long-form conversation about how to live. It reads nothing
//           of his schedule, so it never turns into a to-do.
//   review  from the concept today's Daily review shows (conceptReview's
//           queue), the same one Home shows.
//   life    from ONE source Nova really reads (calendar, training, the Lead
//           picture, money, the Daily review topic), named under the prompt.
//           A source with nothing readable is skipped, never guessed.
// Every prompt goes through the journal-prompt lane with NOVA_LENS first.
export const PROMPT_KINDS = ['deep', 'review', 'life'];
export const LIFE_SOURCES = ['cal', 'train', 'lead', 'money', 'review'];
const SOURCE_NAME = { cal: 'your calendar', train: 'your training', lead: 'your Lead picture', money: 'your money', review: 'the Daily review topic' };

const OUT = 'Write ONE prompt of one or two sentences, speaking to him directly ("you"). Output ONLY a JSON object with a single key "prompt". No markdown, no code fences, no commentary.';

export function buildPrompt(seed = {}) {
  const role = (() => {
    if (seed.kind === 'deep') {
      return `You write journaling questions for Hayden at the depth of a long-form podcast conversation about psychology, philosophy and how to live: questions that make a thoughtful person stop. Write an ORIGINAL question. Never quote or paraphrase a known host, guest, book or famous line. Do not mention his schedule, training, work or anything from his data: this question stands alone.${seed.avoid ? `\nDo not repeat this one: "${seed.avoid}"` : ''}\n${OUT}`;
    }
    if (seed.kind === 'review') {
      if (!seed.concept) throw new Error('no Daily review concept today');
      return `Today's Daily review (his spaced review of ideas from his own wiki) is the concept "${seed.concept}"${seed.gist ? `: ${seed.gist}` : ''}.\nWrite a journaling prompt that asks him to connect this concept to his own life this week. Name the concept.${seed.avoid ? `\nDo not repeat this one: "${seed.avoid}"` : ''}\n${OUT}`;
    }
    if (seed.kind === 'life') {
      if (!seed.source || !seed.facts) throw new Error('no source with anything readable today');
      return `Below is what Nova really knows from ${SOURCE_NAME[seed.source]}. Use only these facts; never invent a meeting, a number or a person.\n${seed.facts}\nWrite a reflective journaling prompt about who he is being in this part of his life, not a task or a reminder.${seed.avoid ? `\nDo not repeat this one: "${seed.avoid}"` : ''}\n${OUT}`;
    }
    // the older single prompt (a concept seed, or a sample of his wiki)
    if (seed.seedTitle) {
      return `Hayden is about to write a journal reflection on this idea from his personal wiki:\n\n"${seed.seedTitle}" — ${seed.seedExcerpt || ''}\n\nWrite ONE short, thoughtful journaling prompt (1-2 sentences) that helps him reflect on this idea and connect it to his own life or a recent situation. Speak directly to him ("you"). Output ONLY a JSON object with a single key "prompt". No markdown, no code fences, no commentary before or after.`;
    }
    const sampleLines = (seed.sample || []).map((s) => `- ${s.title}: ${s.excerpt}`).join('\n');
    return `Hayden keeps a personal wiki of ideas he's read and reflected on. Here is a small random sample from it:\n${sampleLines || '(the wiki has nothing in it yet)'}\n\nWrite ONE short, thoughtful journaling prompt (1-2 sentences) for today. You may loosely draw on one of the ideas above if it fits naturally, or just ask a good general self-reflection question — don't force a connection if none of them fit. Speak directly to him ("you"). Output ONLY a JSON object with a single key "prompt". No markdown, no code fences, no commentary before or after.`;
  })();
  return `${NOVA_LENS}\n\n${role}`;
}

// ---------------------------------------------------------------- life sources
const pad = (n) => String(n).padStart(2, '0');
const dayName = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' });

// Each source read for real, or reported empty. Loaders are injectable so
// the tests never touch his calendar, sessions or money.
export async function readLifeSources(vaultPath, vault, loaders = {}) {
  const L = {
    cal: loaders.cal || (async () => {
      const { fetchEventsForRange } = await import('./calendar.js');
      const ev = await fetchEventsForRange(4);
      if (!ev.length) return null;
      return { from: `From your calendar · ${dayName(ev[0].startISO || Date.now())}`, facts: ev.slice(0, 8).map((e) => `- ${e.date || ''} ${e.time || ''} ${e.label}`).join('\n') };
    }),
    train: loaders.train || (async () => {
      const { loadSessions } = await import('./workoutSessions.js');
      const s = await loadSessions(vaultPath, { limit: 6 });
      if (!s.length) return null;
      return { from: 'From your training', facts: s.map((x) => `- ${String(x.finishedAt || x.date || '').slice(0, 10)} ${x.routineName || x.name || 'session'}${x.exercises ? `, ${x.exercises.length} exercises` : ''}`).join('\n') };
    }),
    lead: loaders.lead || (async () => {
      const { readLeaderState } = await import('./leader.js');
      const st = await readLeaderState();
      const lines = [...(st.profile?.struggles || []).map((x) => `- struggling with: ${x.text || x}`), ...(st.profile?.working || []).map((x) => `- working: ${x.text || x}`)];
      return lines.length ? { from: 'From your Lead picture', facts: lines.slice(0, 8).join('\n') } : null;
    }),
    money: loaders.money || (async () => {
      const { listTransactions } = await import('./money.js');
      const d = new Date();
      const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const t = await listTransactions({ month });
      const list = Array.isArray(t) ? t : (t?.transactions || []);
      if (!list.length) return null;
      const by = {};
      for (const x of list) if (x.amount < 0) by[x.category || 'Other'] = (by[x.category || 'Other'] || 0) + Math.abs(x.amount);
      const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4);
      return top.length ? { from: 'From your money this month', facts: top.map(([c, v]) => `- ${c}: $${Math.round(v)}`).join('\n') } : null;
    }),
    review: loaders.review || (async () => {
      const c = await reviewConcept(vaultPath, vault);
      return c ? { from: 'From the Daily review topic', facts: `- today's concept: ${c.concept}${c.gist ? ` (${c.gist})` : ''}` } : null;
    }),
  };
  const out = {};
  for (const k of LIFE_SOURCES) {
    try { out[k] = await L[k](); } catch { out[k] = null; }
  }
  return out;
}

// The concept today's Daily review shows: the first unanswered page of the
// conceptReview queue, else its first page.
export async function reviewConcept(vaultPath, vault, loader) {
  const today = loader ? await loader() : await (await import('./conceptReview.js')).reviewToday(vaultPath, vault);
  const items = today?.items || [];
  const it = items.find((i) => !i.answered) || items[0];
  return it ? { concept: it.title, gist: it.gist || null, id: it.id } : null;
}

// Which source the life card draws from: the `turn`-th readable one, so each
// Another moves on to the next source Nova can really read.
export function pickLifeSource(sources, turn = 0) {
  const ok = LIFE_SOURCES.filter((k) => sources[k]);
  if (!ok.length) return null;
  return ok[((turn % ok.length) + ok.length) % ok.length];
}

// ---------------------------------------------------------------- the job
let spawnImpl = nodeSpawn;
export function _setSpawnForTests(fn) { spawnImpl = fn || nodeSpawn; }

export function startPromptJob(seed, meta = {}) {
  if (!laneEnabled('journal-prompt')) throw laneOffError('journal-prompt');
  const prompt = buildPrompt(seed); // throws before any spend when there is nothing to ask from
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null, meta };
  jobs.set(jobId, job);

  const child = spawnImpl(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    ...boundaryArgs(''),
    '--output-format', 'json',
    // named explicitly — an unpinned call silently inherits the account's
    // ambient default model. The pin comes from the model board
    // (lib/modelPrefs.js); the default is the 'sonnet' this lane always ran on.
    '--model', modelFor('journal-prompt'),
    '--no-session-persistence',
  ]);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `claude exited with code ${code}`;
      return;
    }
    try {
      const outer = parseEnvelope(stdout, { lane: 'journal-prompt' });
      const text = (outer.result || '').trim();
      const jsonMatch = firstBalancedObjectMatch(text);
      if (!jsonMatch) throw new Error('No JSON object found in the response');
      const parsed = parseModelJson(jsonMatch[0]);
      const promptText = String(parsed.prompt || '').trim();
      if (!promptText) throw new Error('Empty prompt in response');
      job.result = { prompt: promptText, ...meta };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = 'Could not generate a prompt: ' + e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getPromptJob(jobId) {
  return jobs.get(jobId) || null;
}
