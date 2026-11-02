#!/usr/bin/env node
// THE PHASE B BENCH (2 Nov 2026, design/audits/2026-11-02-phase-b-lanes.md).
// The five lanes that moved onto lib/textLane.js runTextLane that day
// (health-insight, session-debrief, briefing-plan, plan-today, daily-review)
// put through their REAL compose path on the model on this Mac, with the
// REAL inputs each would use today, and a code-computed reading of every
// answer:
//
//   node server/scripts/benchTextLanes.mjs [--vault "$VAULT_PATH"] [--model qwen3.5:4b]
//        [--lanes health-insight,session-debrief,...] [--out design/audits/2026-11-02-phase-b-bench.md]
//
// Per run it records: answered here or escalated (and the reason code gave),
// whether the lane's own check accepted the answer, seconds, prompt and output
// tokens (read off Ollama's own reply), the grounding check (every number in
// the answer appears in the prompt this Mac was given: lib/textLane.js
// ungroundedNumbers), and the answer itself beside what Claude wrote for the
// same lane most recently, for a human read. The grades are a person's, in the
// audit; this sheet only measures.
//
// WHAT IT NEVER DOES:
//   - spend Claude. CLAUDE_BIN is a stub that answers a fixed "(Claude stub)"
//     envelope and logs each call, so an escalation is counted, never paid
//     for (the stub's text then fails the lane's check, which is how an
//     escalation shows up here).
//   - write his data. NOVA_DATA_DIR is a scratch copy of server/data, set
//     BEFORE any lib module loads. The lanes' compose functions are called
//     directly: nothing is filed, no Inbox record is made, nothing is sent
//     (Telegram and push are unset for the run as well).
//   - write his vault. Every builder used is a reader; the run ends by listing
//     any vault file modified while it ran (there should be none).
import { cp, mkdtemp, readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const MODEL = arg('model', 'qwen3.5:4b');
const OUT = path.resolve(arg('out', path.join(REPO, 'design', 'audits', '2026-11-02-phase-b-bench.md')));
const ALL_LANES = ['briefing-plan', 'session-debrief', 'health-insight', 'plan-today', 'daily-review'];
const LANES = (arg('lanes', ALL_LANES.join(','))).split(',').map((s) => s.trim()).filter((l) => ALL_LANES.includes(l));
const REAL_DATA = path.join(SERVER_DIR, 'data');
if (!VAULT || !existsSync(VAULT)) { console.error('--vault (or VAULT_PATH in server/.env) must name his vault'); process.exit(2); }

/* --------------------- 1. scratch data, then the libs ---------------------- */

const scratch = await mkdtemp(path.join(os.tmpdir(), 'nova-phase-b-bench-'));
const marker = path.join(scratch, 'started');
await writeFile(marker, new Date().toISOString());
const BIG = new Set(['conversation', 'jobs', 'voice', 'ingest', 'posters', 'recall-vectors.json', 'browse', 'distill', 'watch', 'eat-out',
  'recipe-frames', 'attachments', 'local-eval', 'local-eval-apple', 'code-jobs', 'forge', 'builds', 'covers', 'logos', 'briefing-media']);
await cp(REAL_DATA, path.join(scratch, 'data'), {
  recursive: true,
  filter: (src) => {
    const top = path.relative(REAL_DATA, src).split(path.sep)[0];
    return !(BIG.has(top) || / \d+\.json$/.test(top));
  },
}).catch((e) => console.log(`(copying server/data partly failed: ${e.message})`));
process.env.NOVA_DATA_DIR = path.join(scratch, 'data');
process.env.NOVA_LOCAL_LLM_MODEL = MODEL;
for (const k of Object.keys(process.env)) if (/^(TELEGRAM_|VAPID_)/.test(k)) delete process.env[k];

const claudeLog = path.join(scratch, 'claude-stub.log');
const stubBin = path.join(scratch, 'claude');
await writeFile(stubBin, `#!/bin/sh
for a in "$@"; do case "$a" in --help) echo "--effort <level>"; exit 0;; esac; done
echo "call $*" | cut -c1-300 >> ${JSON.stringify(claudeLog)}
echo '{"type":"result","is_error":false,"result":"(Claude stub: an escalation, not spent)","total_cost_usd":0,"duration_ms":1}'
`);
await chmod(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

// what Ollama itself says about each call: the prompt it was sent, the
// tokens it read and wrote, the text it returned (read off its own reply)
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const res = await realFetch(url, opts);
  if (String(url).endsWith('/api/chat')) {
    try {
      const body = JSON.parse(opts?.body || '{}');
      const j = await res.clone().json();
      calls.push({
        prompt: (body.messages || []).filter((m) => m.role === 'user').map((m) => m.content).join('\n'),
        promptTokens: j.prompt_eval_count ?? null,
        outputTokens: j.eval_count ?? null,
        text: j.message?.content ?? '',
        model: j.model || body.model,
      });
    } catch { /* a reply that is not JSON is the lane's to report */ }
  }
  return res;
};

const { setLocalPrefs, setLanePref, providerFor } = await import('../lib/modelPrefs.js');
const { ungroundedNumbers } = await import('../lib/textLane.js');
await setLocalPrefs({ first: true });
for (const lane of LANES) {
  await setLanePref(lane, { provider: 'local' });
  if (providerFor(lane) !== 'local') { console.error(`${lane} did not resolve to this Mac`); process.exit(1); }
}

/* ------------------------ 2. the real inputs, per lane --------------------- */

const inbox = JSON.parse(await readFile(path.join(REAL_DATA, 'inbox.json'), 'utf8')).items || [];
const latestText = (kind) => inbox
  .filter((r) => r.kind === kind && r.decision?.payload?.text)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };

async function cases(lane) {
  if (lane === 'briefing-plan') {
    const { defaultDeps, planAngles } = await import('../lib/briefing.js');
    // his real research asks (the Inbox's research records), and the 7 Sep
    // sentence the briefing was built for (lib/briefing.js header)
    const topics = inbox.filter((r) => r.kind === 'research' && r.text).map((r) => r.text.replace(/^Research:\s*/, '').slice(0, 600));
    topics.push('research the wavelengths of light Huberman talked about and synthesise it into a report — and define the terminology I may not know');
    return topics.map((topic) => ({
      label: topic.slice(0, 90),
      claude: null,
      run: async () => {
        const { angles, via } = await planAngles(defaultDeps, topic, '', VAULT);
        return { via, show: [`**${angles.title}**`, ...angles.angles.map((a, i) => `${i + 1}. ${a.q} (${a.why})`)].join('\n'), prose: '' };
      },
    }));
  }
  if (lane === 'session-debrief') {
    const { loadSessions } = await import('../lib/workoutSessions.js');
    const { debriefFacts } = await import('../lib/coachCadence.js');
    const { startSessionDebrief, getMessageJob } = await import('../lib/claudeCode.js');
    let memory = {};
    try { memory = JSON.parse(await readFile(path.join(REAL_DATA, 'debrief-memory.json'), 'utf8')).bySession || {}; } catch { /* none */ }
    const sessions = (await loadSessions(VAULT, { limit: 8 })).slice(0, 6);
    return sessions.map((s) => ({
      label: `${s.date} ${s.routineName}`,
      claude: memory[s.id]?.text || null,
      run: async () => {
        const { facts } = await debriefFacts(VAULT, s);
        let via = null;
        const jobId = startSessionDebrief(VAULT, { facts: facts.join('\n') }, (_t, v) => { via = v; });
        const t0 = Date.now();
        for (;;) {
          const j = getMessageJob(jobId);
          if (j && j.status !== 'running') {
            if (j.status === 'error') throw new Error(j.error);
            return { via: via || { provider: j.result?.provider }, show: j.result.text, prose: j.result.text };
          }
          if (Date.now() - t0 > 200_000) throw new Error('no debrief in 200 s');
          await new Promise((r) => setTimeout(r, 200));
        }
      },
    }));
  }
  if (lane === 'health-insight') {
    const { buildContexts, composeInsight } = await import('../lib/healthInsight.js');
    let cached = {};
    try { cached = JSON.parse(await readFile(path.join(REAL_DATA, 'health', 'insight.json'), 'utf8')); } catch { /* none */ }
    return ['morning', 'evening'].map((slot) => ({
      label: `${slot} insight, today's data`,
      claude: cached[slot]?.insight ? `${cached[slot].date}: ${cached[slot].insight}` : null,
      run: async () => {
        const { full, compact } = await buildContexts(VAULT, slot);
        const r = await composeInsight(full, compact, slot);
        return { via: r.via, show: r.hasInsight ? r.insight : '(hasInsight: false)', prose: r.insight || '', sizes: { full: full.length, compact: compact.length } };
      },
    }));
  }
  if (lane === 'plan-today') {
    const { buildPlanContexts, composePlan } = await import('../lib/planToday.js');
    const { listTodos } = await import('../lib/todos.js');
    const ref = latestText('plan-today');
    // the plan runs at 7:00; 10:00 and 13:00 are the same real day read later
    // (the pace lines move), the only extra real inputs a day of data offers
    return [7, 10, 13].map((h) => ({
      label: `today at ${h}:00`,
      claude: ref ? `${ref.createdAt.slice(0, 10)}:\n${ref.decision.payload.text}` : null,
      run: async () => {
        const now = at(h);
        const ctx = await buildPlanContexts(VAULT, now);
        const todos = (await listTodos(VAULT).catch(() => ({ items: null }))).items;
        const { composed, via } = await composePlan(VAULT, ctx, now, { todos });
        return { via, show: composed.text, prose: composed.priorities.map((p) => `${p.do} ${p.why}`).join('\n'), sizes: { full: ctx.full.length, compact: ctx.compact.length } };
      },
    }));
  }
  if (lane === 'daily-review') {
    const { buildReviewContexts, composeReview } = await import('../lib/dailyReview.js');
    const ref = latestText('review');
    return [8, 20].map((h) => ({
      label: `today at ${h}:00`,
      claude: ref ? `${ref.createdAt.slice(0, 10)}:\n${ref.decision.payload.text}` : null,
      run: async () => {
        const now = at(h);
        const ctx = await buildReviewContexts(VAULT, now);
        const { composed, via } = await composeReview(VAULT, ctx, now);
        return { via, show: composed.text, prose: [composed.read, ...composed.adjustments.map((a) => `${a.do} ${a.why}`)].join('\n'), sizes: { full: ctx.full.length, compact: ctx.compact.length } };
      },
    }));
  }
  return [];
}

/* ------------------------------ 3. the bench ------------------------------- */

const rows = [];
for (const lane of LANES) {
  const list = await cases(lane);
  console.log(`\n=== ${lane}: ${list.length} real input(s)`);
  for (const [i, c] of list.entries()) {
    const before = calls.length;
    const t0 = Date.now();
    let res = null;
    let error = null;
    try { res = await c.run(); } catch (e) { error = String(e.message || e); }
    const secs = (Date.now() - t0) / 1000;
    const mine = calls.slice(before);
    const local = mine[mine.length - 1] || null;
    const answeredHere = !!res && res.via?.provider === 'local' && !res.via?.escalated;
    // the grounding check on whatever this Mac wrote, accepted or not
    // (on the raw text it returned: JSON keys carry no digits, so this reads
    // the model's own words; the briefing's angles are questions, not a read
    // of his numbers, so the column is informational there)
    const ungrounded = local ? ungroundedNumbers(local.text, local.prompt) : null;
    const escalatedWhy = error ? (/could not answer first: (.*)\.$/.exec(error)?.[1] || error) : null;
    const row = {
      lane, n: i + 1, label: c.label, secs, answeredHere, error, escalatedWhy,
      model: local?.model || null, promptTokens: local?.promptTokens ?? null, outputTokens: local?.outputTokens ?? null,
      promptChars: local?.prompt?.length ?? null, sizes: res?.sizes || null,
      ungrounded, localRaw: local?.text || null, shown: res?.show || null, claude: c.claude, localPrompt: local?.prompt || null,
    };
    rows.push(row);
    console.log(`${lane} ${row.n}/${list.length} ${secs.toFixed(1)} s ${answeredHere ? 'ANSWERED HERE' : `ESCALATED (${escalatedWhy})`} out=${row.outputTokens} in=${row.promptTokens}${ungrounded?.length ? ` ungrounded=${ungrounded.join(',')}` : ''}`);
    console.log(answeredHere ? res.show : `(this Mac wrote:)\n${local?.text || '(nothing)'}`);
  }
}

/* ------------------------------ 4. the guards ------------------------------ */

let vaultWrites = [];
try {
  vaultWrites = execFileSync('find', [VAULT, '-newer', marker, '-type', 'f', '-not', '-path', '*/.obsidian/*', '-not', '-path', '*/.trash/*'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
} catch (e) { vaultWrites = [`(the vault check could not run: ${e.message})`]; }
const claudeCalls = existsSync(claudeLog) ? (await readFile(claudeLog, 'utf8')).split('\n').filter((l) => l.startsWith('call')).length : 0;

/* ------------------------------ 5. the sheet ------------------------------- */

const q = (arr, p) => { const s = [...arr].filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const md = [];
md.push('# Phase B bench: the five lanes on the model on this Mac', '');
md.push(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Written by \`server/scripts/benchTextLanes.mjs\` (model \`${MODEL}\` on Ollama, this Mac; Claude stubbed, nothing spent; a scratch copy of server/data; his vault read-only). Every number here is computed by the script. The grades are in design/audits/2026-11-02-phase-b-lanes.md §4.`, '');
md.push(`Guards: ${claudeCalls} call(s) reached the Claude stub (each one an escalation, not spent). Vault files modified during the run: ${vaultWrites.length ? vaultWrites.join(', ') : 'none'}.`, '');
md.push('| lane | runs | answered here | lane check passed | grounded (of answered) | median s | median output tok | median prompt tok |', '|---|---|---|---|---|---|---|---|');
for (const lane of LANES) {
  const r = rows.filter((x) => x.lane === lane);
  if (!r.length) continue;
  const here = r.filter((x) => x.answeredHere);
  const grounded = here.filter((x) => x.ungrounded && !x.ungrounded.length);
  md.push(`| ${lane} | ${r.length} | ${here.length} | ${here.length} of ${r.length} | ${grounded.length} of ${here.length} | ${q(r.map((x) => x.secs), 0.5)?.toFixed(1)} | ${q(r.map((x) => x.outputTokens), 0.5) ?? 'n/a'} | ${q(r.map((x) => x.promptTokens), 0.5) ?? 'n/a'} |`);
}
md.push('');
md.push('"Answered here" means this Mac wrote it AND the lane\'s own check (shape, length, and for the four prose lanes the grounding check) accepted it; anything else escalated to Claude, which here is a stub. A row\'s grounding column is computed on what this Mac wrote even when it escalated.', '');
const quote = (s) => String(s || '').split('\n').map((l) => `> ${l}`).join('\n');
for (const lane of LANES) {
  md.push(`## ${lane}`, '');
  for (const r of rows.filter((x) => x.lane === lane)) {
    md.push(`### ${r.n}. ${r.label}`, '');
    md.push(`- ${r.answeredHere ? 'answered on this Mac' : `escalated: ${r.escalatedWhy}`}; ${r.secs.toFixed(1)} s; output ${r.outputTokens ?? '?'} tokens; prompt ${r.promptTokens ?? '?'} tokens (${r.promptChars ?? '?'} chars${r.sizes ? `; full context ${r.sizes.full} chars, compact ${r.sizes.compact}` : ''}); model ${r.model || 'none'}`);
    md.push(`- grounding: ${r.ungrounded == null ? 'n/a' : r.ungrounded.length ? `NOT in the prompt: ${r.ungrounded.join(', ')}` : 'every number is in the prompt'}`, '');
    md.push(r.answeredHere ? '**This Mac:**' : '**This Mac wrote (refused by the lane\'s check):**', '');
    md.push(quote(r.answeredHere ? r.shown : r.localRaw || '(nothing)'), '');
    if (r.claude) md.push('**Claude, most recently on this lane (a different day\'s data, for kind not words):**', '', quote(r.claude), '');
  }
}
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, md.join('\n'));
await writeFile(path.join(scratch, 'rows.json'), JSON.stringify(rows, null, 2));
console.log(`\nsheet: ${OUT}\nrows: ${path.join(scratch, 'rows.json')}\nClaude stub calls: ${claudeCalls}; vault writes: ${vaultWrites.length}`);
process.exit(0);
