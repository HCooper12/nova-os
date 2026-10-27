#!/usr/bin/env node
// The bench for the Coach on the model on this Mac (lib/localCoach.js), 27 Oct
// 2026: his REAL past Coach questions, each with the answer Claude's Coach
// gave him then, put through the REAL local Coach path today
// (lib/coachTurn.js startCoachTurn, the coach lane on this Mac), and a
// code-computed grounding check on every number the local answer says.
//
//   node server/scripts/benchLocalCoach.mjs [--vault "$VAULT_PATH"] [--out design/audits/2026-10-27-local-coach-bench.md] [--model qwen3.5:4b]
//
// WHERE THE QUESTIONS COME FROM. The Coach's Claude Code session journals
// (~/.claude/projects/<vault slug>/*.jsonl, the ones whose first prompt is the
// Coach's), read-only. Each turn of his is labelled BY HAND in LABELS below:
// a question (benched), an order to change something (counted, not benched:
// that count is the escalation rate on real traffic, because every one of
// them goes to Claude), or not his words (a plan step, an automation, the
// 18 Oct speed-audit prompts from scripts/bench-ask.mjs). The labels were
// written before the first run and not edited after it.
//
// WHAT IT NEVER DOES:
//   - spend Claude. CLAUDE_BIN is a stub that answers "(Claude stub)" and
//     logs the turn, so an escalation is counted, never paid for.
//   - write his data. NOVA_DATA_DIR is a scratch copy of server/data (no
//     conversation record, no jobs) set BEFORE any lib module loads; the run
//     ends by checking that the real conversation record and every coach-*.json
//     kept their mtimes.
//   - write his vault. The local Coach's tools are read-only by construction;
//     an escalation runs today's Claude assembly (read-only builders) into
//     the stub.
import { cp, mkdtemp, readdir, readFile, stat, writeFile, chmod, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(SERVER_DIR, '..');
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
function envVault() {
  try {
    const m = /^VAULT_PATH=(.*)$/m.exec(readFileSync(path.join(SERVER_DIR, '.env'), 'utf8'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
const VAULT = arg('vault', process.env.VAULT_PATH || envVault());
const OUT = path.resolve(arg('out', path.join(REPO, 'design', 'audits', '2026-10-27-local-coach-bench.md')));
const MODEL = arg('model', 'qwen3.5:4b');
const REAL_DATA = path.join(SERVER_DIR, 'data');
if (!VAULT || !existsSync(VAULT)) { console.error('--vault (or VAULT_PATH in server/.env) must name his vault'); process.exit(2); }

/* --------------------------- the hand labels ------------------------------ */
// Keyed by how his turn begins. 'ask' = a question the Coach answers;
// 'change' = an order to change his program or records (or a turn inside a
// change he was making); 'skip' = not his own words.
const LABELS = [
  ['ask', 'What would be a better alternative exercise than face pulls'],
  ['ask', 'Are face pulls or an alternative actually work'],
  ['ask', 'Why is my Cable Flys Low Position'],
  ['ask', 'I want to be performing the best cable exercise for my triceps'],
  ['ask', 'Should I have all 3 of the chest exercises'],
  ['ask', 'Mid-session — talk me through'],
  ['ask', 'What is the optimal pre workout snack'],
  ['ask', 'Would my protein smoothie'],
  ['ask', 'My upper workout just took'],
  ['ask', 'My weekly sets for Triceps are under target'],
  ['ask', 'Why is my HRV down'],
  ['ask', 'What change could be made to my upper body workout'],
  ['ask', 'My weekly sets for Biceps, Triceps, Shoulders'],
  ['ask', 'What would a version of my refined workout plan'],
  ['ask', 'Would an adductor/abductor machine'],
  ['ask', 'How many sets does Andrew huberman'],
  ['ask', 'Walk me through what the plan found'],
  ['change', 'Can you please swap out face pulls'],
  ['change', 'My Pull-Up has outgrown'],
  ['change', 'Alter my plan'],
  ['change', 'Swap out the Single-Arm Cable Extensions'],
  ['change', 'You should be able to apply'],
  ['change', 'Perfect. Apply the change now'],
  ['change', 'Apply the changes now'],
  ['change', 'Try now to Swap out'],
  ['change', 'You haven’t added it in for my upper'],
  ['change', 'Edit the EZ bar reverse curl'],
  ['change', 'Try again'],
  ['change', 'Make the change'],
  ['change', 'I don’t think I’m performing it correctly'],
  ['change', 'Thank you. Yes, swap'],
  ['change', 'Conduct research and analysis'],
  ['change', 'Change tricep push down'],
  ['change', 'Cable lateral raise has been great'],
  ['change', 'Cable bicep curl is great'],
  ['change', 'The bicep curls are a pull exercise'],
  ['change', 'You haven’t added it to push day'],
  ['change', 'You still failed'],
  ['change', 'You didn’t place it'],
  ['change', 'Yes — make this a change'],
  ['change', 'Let’s create a new workout split'],
  ['change', 'Proceed with building'],
  ['change', 'I want you to just add'],
  ['change', 'Go ahead and build it'],
  ['change', 'Change the rear delt fly'],
  ['change', 'Ensure it’s changed'],
  ['change', 'The t bar row machine'],
  ['change', 'PAIN report'],
  ['change', 'Re evaluate my workout program'],
  ['change', 'My shoulder pain is okay'],
  ['change', 'Okay, nova that looks great'],
  ['change', 'You’ve set up cable lateral raises'],
  ['change', 'Let’s make the push day'],
  ['change', 'https://'],
  ['skip', 'Continue from where you left off'],
  ['skip', 'Hayden wants to set aside'],
  ['skip', 'Using his dossier'],
  ['skip', '**Coverage.**'],
  ['skip', 'LINES YOU (NOVA) SPOKE'],
  ['skip', 'Hayden has confirmed this request'],
  ['skip', '**One gap first.**'],
  ['skip', "what's my HRV"],
  ['skip', 'should I deload next week given my last three sessions'],
  ['skip', 'is my bench progressing or stalling'],
];
const labelOf = (q) => {
  const t = String(q || '').trim();
  if (!t) return 'skip';
  const hit = LABELS.find(([, prefix]) => t.startsWith(prefix));
  return hit ? hit[0] : 'unlabelled';
};

/* ----------------------------- 0. the guards ------------------------------ */

async function stamps() {
  const out = {};
  const add = async (p) => { try { out[p] = (await stat(p)).mtimeMs; } catch { /* absent */ } };
  try { for (const f of await readdir(path.join(REAL_DATA, 'conversation'))) await add(path.join(REAL_DATA, 'conversation', f)); } catch { /* none */ }
  try { for (const f of await readdir(REAL_DATA)) if (/^coach-.*\.json$/.test(f)) await add(path.join(REAL_DATA, f)); } catch { /* none */ }
  return out;
}
const before = await stamps();

/* --------------------- 1. scratch data, then the libs ---------------------- */

const scratch = await mkdtemp(path.join(os.tmpdir(), 'nova-local-coach-bench-'));
const BIG = new Set(['conversation', 'jobs', 'voice', 'ingest', 'posters', 'recall-vectors.json', 'browse', 'distill', 'watch', 'eat-out', 'recipe-frames', 'attachments', 'local-eval']);
await cp(REAL_DATA, path.join(scratch, 'data'), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(REAL_DATA, src);
    const top = rel.split(path.sep)[0];
    return !(BIG.has(top) || / \d+\.json$/.test(top));
  },
}).catch((e) => console.log(`(copying server/data partly failed: ${e.message})`));
process.env.NOVA_DATA_DIR = path.join(scratch, 'data');
process.env.NOVA_LOCAL_LLM_MODEL = MODEL;
process.env.NOVA_LOCAL_COACH_TIMEOUT_MS = process.env.NOVA_LOCAL_COACH_TIMEOUT_MS || '150000';

const claudeLog = path.join(scratch, 'claude-stub.log');
const stubBin = path.join(scratch, 'claude');
await writeFile(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  fs.appendFileSync(${JSON.stringify(claudeLog)}, 'turn\\n');
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: '(Claude stub: an escalation, not spent)', total_cost_usd: 0 }) + '\\n');
});
`);
await chmod(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const { cleanTurnText, projectSlug } = await import('../lib/agentSessions.js');
const { startCoachTurn } = await import('../lib/coachTurn.js');
const { getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { traceOf, wantsChange } = await import('../lib/localCoach.js');
const { setLocalPrefs, setLanePref, providerFor } = await import('../lib/modelPrefs.js');
await setLocalPrefs({ first: true });
// the Coach is Claude by default since the first bench (lane localFirst:
// false), so the bench picks This Mac on its scratch board, as he would
await setLanePref('coach', { provider: 'local' });
if (providerFor('coach') !== 'local') { console.error('the coach lane did not resolve to this Mac'); process.exit(1); }

/* ------------------------- 2. his turns, read-only ------------------------- */

const textOf = (x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.filter((y) => y?.type === 'text').map((y) => y.text).join(' ') : '');
const journalDir = path.join(os.homedir(), '.claude', 'projects', projectSlug(VAULT));
const turns = [];
for (const f of (await readdir(journalDir)).filter((n) => n.endsWith('.jsonl'))) {
  const body = await readFile(path.join(journalDir, f), 'utf8');
  if (!body.includes("You are Nova's Coach")) continue;
  let pending = null;
  for (const line of body.trim().split('\n')) {
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type === 'user') {
      const raw = textOf(d.message?.content);
      if (!raw) continue; // a tool result, not a turn
      if (/\nThe question: /.test(raw)) { pending = null; continue; } // a consult: another agent asking
      const m = /\nHayden (?:says|asks): ([\s\S]*)$/.exec(raw);
      // a whole Coach prompt with no question of his in it: a code-written
      // job (the weekly debrief's JSON read), not a turn
      if (!m && raw.includes("You are Nova's Coach")) { pending = null; continue; }
      const q = cleanTurnText(m ? m[1] : raw).trim();
      pending = { at: d.timestamp, q, a: '' };
      turns.push(pending);
    } else if (d.type === 'assistant' && pending) {
      const t = textOf(d.message?.content);
      if (t) pending.a += (pending.a ? '\n' : '') + t;
    }
  }
}
turns.sort((a, b) => String(a.at).localeCompare(String(b.at)));
// one row per distinct turn (a retry of the same words counts once); the
// answer kept is the longest Claude gave to those words
const distinct = new Map();
for (const t of turns) {
  const key = t.q.slice(0, 60);
  const label = labelOf(t.q);
  const had = distinct.get(key);
  if (!had || t.a.length > had.a.length) distinct.set(key, { ...t, label });
}
const rows = [...distinct.values()];
const asks = rows.filter((r) => r.label === 'ask');
const changes = rows.filter((r) => r.label === 'change');
const unlabelled = rows.filter((r) => r.label === 'unlabelled');
console.log(`his turns: ${turns.length}; distinct: ${rows.length}; questions ${asks.length}, changes ${changes.length}, unlabelled ${unlabelled.length}`);

/* ------------------------------ 3. the bench ------------------------------- */

const NUM_RE = /\d+(?:[.,]\d+)*/g;
const nums = (s) => (String(s || '').match(NUM_RE) || []).map((n) => n.replace(/,(?=\d{3}\b)/g, '').replace(/\.0+$/, ''));

async function settle(jobId, ms = 200_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const j = getMessageJob(jobId);
    if (j && j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { status: 'timeout', error: `no result in ${ms / 1000} s` };
}

const results = [];
for (const [i, r] of asks.entries()) {
  const t0 = Date.now();
  let job;
  let jobId = null;
  try {
    jobId = await startCoachTurn(VAULT, { question: r.q });
    job = await settle(jobId);
  } catch (e) {
    job = { status: 'error', error: e.message };
  }
  const secs = (Date.now() - t0) / 1000;
  const trace = jobId ? traceOf(jobId) : null;
  const escalated = job.result?.escalated === true || job.escalated === true;
  const local = !escalated && job.status === 'ready' && job.result?.provider === 'local' ? job.result.text : null;
  let ungrounded = null;
  if (local && trace) {
    const source = new Set(nums([trace.system, ...trace.results.map((x) => x.text)].join('\n')));
    const asked = new Set(nums(r.q));
    ungrounded = [...new Set(nums(local))].filter((n) => !asked.has(n) && !source.has(n));
  }
  const row = {
    n: i + 1, at: r.at, question: r.q, claude: cleanTurnText(r.a) || r.a, local, secs,
    status: job.status, escalated, reason: job.result?.reason || job.reason || null, error: job.error || null,
    tools: (trace?.results || []).map((x) => `${x.name}(${Object.entries(x.args || {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})`),
    rounds: trace?.rounds ?? null, ungrounded, localReply: trace?.reply || null,
  };
  results.push(row);
  console.log(`${row.n}/${asks.length} ${secs.toFixed(1)} s ${escalated ? `ESCALATED (${row.reason})` : row.status} tools=${row.tools.length}${ungrounded?.length ? ` ungrounded=${ungrounded.join(',')}` : ''}`);
}
_dropAllWarm();

/* ------------------------------ 4. the sheet ------------------------------- */

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const secs = results.map((r) => r.secs);
const answered = results.filter((r) => r.local);
const localEscalated = results.filter((r) => r.escalated);
const grounded = answered.filter((r) => r.ungrounded && !r.ungrounded.length);
const roundsList = results.map((r) => r.rounds).filter((n) => Number.isFinite(n));
const gateCaught = changes.filter((r) => wantsChange(r.q));
const gateFalse = asks.filter((r) => wantsChange(r.q));
const clipTo = (s, n) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n)}… (${t.length} characters in all)` : t; };
const quote = (s) => String(s || '').split('\n').map((l) => `> ${l}`).join('\n');

const md = [];
md.push('# The local Coach, benched on his real questions', '');
md.push(`27 Oct 2026. Written by \`server/scripts/benchLocalCoach.mjs\` (model \`${MODEL}\` on Ollama, this Mac; Claude stubbed, nothing spent; a scratch copy of server/data). Every number in the summary is computed by the script from the rows below.`, '');
md.push('## Summary', '');
md.push(`- **His Coach traffic:** ${turns.length} turns of his in ${new Set(turns.map((t) => t.at?.slice(0, 10))).size} days of Coach journals; ${rows.length} distinct after retries. ${changes.length} were orders to change his program or records (or turns inside a change he was making), ${asks.length} were questions, ${rows.length - changes.length - asks.length} were not his own words (plan steps, automations, the 18 Oct speed-audit prompts).`);
md.push(`- **Escalation rate on real traffic:** ${changes.length} of ${changes.length + asks.length} (${pct(changes.length, changes.length + asks.length)}) of his turns ask for a change, and every one goes to Claude. Code's gate (wantsChange) catches ${gateCaught.length} of those ${changes.length} before the local model runs; the other ${changes.length - gateCaught.length} rely on the model's ESCALATE line. It flags ${gateFalse.length} of his ${asks.length} questions as changes (false positives).`);
md.push(`- **Of the ${asks.length} questions:** ${answered.length} answered on this Mac, ${localEscalated.length} handed to Claude (${pct(localEscalated.length, asks.length)}), ${results.filter((r) => !r.local && !r.escalated).length} failed outright.`);
md.push(`- **Time (whole turn, question to settled job):** median ${q(secs, 0.5)?.toFixed(1)} s, p90 ${q(secs, 0.9)?.toFixed(1)} s, slowest ${Math.max(...secs).toFixed(1)} s.`);
md.push(`- **Lookup rounds:** median ${q(roundsList, 0.5) ?? 'n/a'}, most ${roundsList.length ? Math.max(...roundsList) : 'n/a'} (cap 4).`);
md.push(`- **Grounded answers:** ${grounded.length} of ${answered.length} local answers (${pct(grounded.length, answered.length)}) say no number that is absent from the question, the prompt's facts or a tool result this turn.`);
md.push('');
md.push('How to read it. Claude answered each question THEN, inside a running conversation with his data of that day; the local Coach answers it NOW, fresh, on today\'s data. So the two answers are compared for kind (does it answer, is it his numbers, is it plain), not word for word. The grounding check is code: every digit-string in the local answer that is not in the question must appear in what the model was shown (the system prompt\'s FACTS block or a tool result). It cannot tell a right number from a wrong one that happens to appear in the context; it only catches invented ones.', '');
md.push('## His orders, and the gate', '');
md.push('| his words (first 90 characters) | wantsChange |', '|---|---|');
for (const r of changes) md.push(`| ${r.q.replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 90)} | ${wantsChange(r.q) ? 'change (Claude, before the model)' : 'not caught (the model must hand up)'} |`);
md.push('');
md.push('## The questions', '');
for (const r of results) {
  md.push(`### ${r.n}. ${r.question.replace(/\s+/g, ' ').slice(0, 120)}${r.question.length > 120 ? '…' : ''}`, '');
  md.push(`Asked ${String(r.at).slice(0, 10)}. Full question:`, '', quote(r.question), '');
  md.push('**Claude then:**', '', quote(clipTo(r.claude, 1400)), '');
  if (r.local) md.push(`**Local now** (${r.secs.toFixed(1)} s, ${r.rounds ?? 0} round${r.rounds === 1 ? '' : 's'}):`, '', quote(r.local), '');
  else if (r.escalated) md.push(`**Local now:** handed to Claude after ${r.secs.toFixed(1)} s (${r.reason}).${r.localReply ? ' What the model wrote:' : ''}`, '', ...(r.localReply ? [quote(clipTo(r.localReply, 600)), ''] : []));
  else md.push(`**Local now:** failed after ${r.secs.toFixed(1)} s: ${r.error || r.status}.`, '');
  md.push(`- Tools called: ${r.tools.length ? r.tools.join('; ') : 'none'}`);
  md.push(`- Escalated: ${r.escalated ? `yes, ${r.reason}` : 'no'}`);
  if (r.local) md.push(`- Grounding: ${r.ungrounded?.length ? `UNGROUNDED ${r.ungrounded.join(', ')}` : 'every number traced to the question, the facts or a tool result'}`);
  md.push('');
}
if (unlabelled.length) {
  md.push('## Turns the labels did not cover', '');
  for (const r of unlabelled) md.push(`- ${r.q.replace(/\s+/g, ' ').slice(0, 140)}`);
  md.push('');
}
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${md.join('\n')}\n`, 'utf8');
await writeFile(path.join(scratch, 'local-coach-bench.json'), JSON.stringify({ results, counts: { turns: turns.length, distinct: rows.length, asks: asks.length, changes: changes.length } }, null, 1));

/* ------------------------------- 5. receipts ------------------------------- */

const after = await stamps();
const touched = Object.keys({ ...before, ...after }).filter((p) => before[p] !== after[p]);
const claudeTurns = existsSync(claudeLog) ? (await readFile(claudeLog, 'utf8')).trim().split('\n').filter(Boolean).length : 0;
console.log(`wrote ${OUT}`);
console.log(`scratch ${scratch}; Claude stub turns: ${claudeTurns}`);
if (touched.length) { console.error(`LIVE DATA TOUCHED: ${touched.join(', ')}`); process.exit(1); }
console.log('the real conversation record and coach-*.json kept their mtimes');
process.exit(0);
