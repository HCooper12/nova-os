// THE STUDY LANE — a paper becomes a change to his program.
//
// design/ATHLETE-AI-PLAN.md #5. His day-72 reel: a study of fourteen elite
// Ethiopian marathoners turned into a training plan. Nova's Researcher could
// already read a paper and the Coach could already edit the program; nothing
// joined them. This joins them, and the join is where the honesty lives:
//
//   PASS 1 — READ. The Researcher's boundary (web + read, no writes) fetches
//   THIS source and returns its claims as data: who was studied, what was
//   done, what happened, what the paper itself says it cannot show.
//   PASS 2 — WHAT IT CHANGES FOR HIM. The Coach's boundary (read-only, cwd
//   vault) gets the claims beside his REAL block — routines, schedule, goals,
//   recent sessions, his intake, what he already has on the shelf — and
//   answers the only question that matters: what would this change in his
//   current plan, and is he even the population it describes. Fourteen elite
//   marathoners are not him, and the lane says so rather than converting
//   their protocol into his Tuesday.
//   CODE — validates every proposed change against the plan's own op
//   vocabulary and real ids. A change that does not survive becomes prose
//   ("a conversation, not a tap"); one that does becomes the SAME proposal
//   record the program review raises, so his yes applies it through the
//   Coach's existing, undoable apply path. Nothing here writes to the vault.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';
import { parseModelJson, firstBalancedObjectMatch } from './jsonSalvage.js';
import { validateOps } from './coachPlan.js';

const CLAUDE_BIN = process.env.NOVA_CLAUDE_BIN || 'claude';
const BUDGET_READ = process.env.NOVA_PAPER_READ_BUDGET_USD || '1.50';
const BUDGET_JUDGE = process.env.NOVA_PAPER_JUDGE_BUDGET_USD || '1.50';
export const PAPER_LANE = 'paper';
export const PAPER_KIND = 'paper';

/* ------------------------------ pass 1: read ----------------------------- */

export function buildReadPrompt({ source, prose, him }) {
  const isUrl = /^https?:\/\//i.test(source);
  return `${NOVA_LENS}

You are Nova's Researcher. Read ONE source and return what it actually claims, as data. ${isUrl ? `Fetch it: ${source}. If it is paywalled, a DOI landing page, or unreachable, look for the open-access version (PubMed Central, the journal, the preprint) and say which you read; if you cannot read the paper itself, say so and STOP — an abstract-only read must be labelled as one.` : `The source text is pasted below.`}
${prose ? `\nWhat he wants from it: "${prose}"` : ''}

WHO IS ASKING (so the applicability line is about a real person, not a reader in general):
${him}

Return ONLY a JSON object:
{
  "title": "<the paper or article title>",
  "source": "<what you actually read: journal + year, or site>",
  "kind": "rct" | "meta-analysis" | "observational" | "case-series" | "review" | "article" | "opinion",
  "population": "<n, who they were, training status, sex, age — the paper's own description>",
  "intervention": "<what was done, for how long, at what doses/volumes — the paper's numbers, not yours>",
  "outcomes": ["<each measured outcome with the paper's stated result and effect size or direction>"],
  "limits": ["<what the paper itself says it cannot show, and what you can see it cannot show>"],
  "quotes": ["<up to 3 short verbatim lines that carry the finding>"],
  "applicability": "<2-3 sentences: how far this population and protocol are from HIM specifically — training age, goal, sex, level, sport. Be blunt. 'Elite marathoners' and 'a recreational lifter on a cut' is a large gap and you say so.>",
  "confidence": "high" | "low"
}
Rules: every number in outcomes/intervention is the paper's, never rounded into a claim it did not make. No advice here — that is the next pass. No code fences.
${isUrl ? '' : `\nSOURCE TEXT:\n${source.slice(0, 20000)}`}`;
}

export function parseClaims(raw) {
  const m = firstBalancedObjectMatch(String(raw || ''));
  if (!m) return null;
  let o; try { o = parseModelJson(m[0]); } catch { return null; }
  const s = (v, n) => String(v || '').trim().slice(0, n);
  const list = (v, n, len) => (Array.isArray(v) ? v.map((x) => s(x, len)).filter(Boolean).slice(0, n) : []);
  const out = {
    title: s(o.title, 200), source: s(o.source, 200),
    kind: ['rct', 'meta-analysis', 'observational', 'case-series', 'review', 'article', 'opinion'].includes(o.kind) ? o.kind : 'article',
    population: s(o.population, 500), intervention: s(o.intervention, 800),
    outcomes: list(o.outcomes, 8, 300), limits: list(o.limits, 8, 300), quotes: list(o.quotes, 3, 240),
    applicability: s(o.applicability, 700),
    confidence: o.confidence === 'low' ? 'low' : 'high',
  };
  if (!out.title || (!out.outcomes.length && !out.intervention)) return null;
  return out;
}

/* --------------------------- pass 2: for him ----------------------------- */

export function renderPlan(routines = [], exercises = []) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return routines.map((r) => `${r.id} — ${r.name}:\n${(r.exercises || []).map((e) => `  ${e.exerciseId} (${byId.get(e.exerciseId)?.name || e.exerciseId}) ${e.targetSets}×${e.targetRepsLow}-${e.targetRepsHigh}`).join('\n')}`).join('\n');
}

export function buildJudgePrompt({ claims, plan, library, schedule, goals, recent, intake, shelf, open }) {
  return `${NOVA_LENS}

You are Nova's strength Coach. Hayden brought you a study. Your job is NOT to summarise it — the Researcher has done that below — but to answer one question: WHAT, IF ANYTHING, WOULD THIS CHANGE IN HIS CURRENT BLOCK? Grounded in his real plan and his real history, not in the paper's population.

THE STUDY, AS DATA:
${JSON.stringify(claims, null, 1)}

HIS CURRENT PLAN (routineId — name, then exerciseId (name) sets×reps):
${plan || '(no routines on file)'}

HIS WEEK: ${schedule || '(no schedule)'}

HIS GOALS: ${goals || '(none written)'}

HIS INTAKE (who he is, by his own numbers): ${intake || '(not run yet)'}

HIS LAST SESSIONS:
${recent || '(no sessions logged)'}
${shelf ? `\nWHAT HE ALREADY HAS ON THIS TOPIC (weigh the study against these, do not parrot either):\n${shelf}` : ''}
${open ? `\n${open}` : ''}

EXERCISE LIBRARY (id — name (muscle)):
${library}

Decide honestly, in this order:
1. Is he the population? If the gap is large (elite endurance athletes vs a recreational lifter; untrained beginners vs someone with his training age; a sex or age band he is not in), the verdict is "not-for-him" and you propose NOTHING — say what the study shows and why it does not transfer. A study that does not apply is a useful thing to know.
2. If it applies, what is the ONE to THREE concrete changes it would make to the plan above — expressed as operations on his real routine and exercise ids? A change you cannot express in the operations below is a conversation, not a change: put it in "discuss" instead.
3. Weigh the evidence: one small trial is "weak", a well-run RCT in his population is "moderate", a meta-analysis or replicated finding is "strong". Weak evidence does not move a plan that is working.

Allowed operations (nothing else exists):
- {"op":"prescribe","routineId":"...","exerciseId":"...","targetSets":?,"targetRepsLow":?,"targetRepsHigh":?}
- {"op":"swap","routineId":optional,"exerciseId":"...","replaceWith":"..."}
- {"op":"add","routineId":"...","exerciseId":"...","targetSets":3,"targetRepsLow":8,"targetRepsHigh":12}
- {"op":"remove","routineId":"...","exerciseId":"..."}
- {"op":"remap","exerciseId":"...","muscleGroup":"..."}
Use ids exactly as listed. Never invent an exercise; if the study needs one he does not have, put it in "discuss".

Return ONLY a JSON object:
{
  "verdict": "change" | "hold" | "not-for-him",
  "grade": "strong" | "moderate" | "weak",
  "summary": "<2-3 sentences: what the study shows, and the verdict for HIM in plain words>",
  "whyForHim": "<the population/history reasoning behind the verdict — name the gap or the fit>",
  "changes": [{"title": "<one line>", "why": "<the finding it rests on, cited to the study>", "expect": "<what he should see in his own numbers, and by when>", "watchFor": "<the sign it is not working>", "ops": [ ... ]}],
  "discuss": ["<a change worth a conversation but not a tap, with why>"]
}
No code fences. No numbers you did not get from the study or his files.`;
}

// The judge's answer, validated by code: every change either survives as a
// one-tap fix (its ops parse and name real ids) or is kept as prose.
export function parseJudgement(raw, { routines = [], exercises = [] } = {}) {
  const m = firstBalancedObjectMatch(String(raw || ''));
  if (!m) return null;
  let o; try { o = parseModelJson(m[0]); } catch { return null; }
  const s = (v, n) => String(v || '').trim().slice(0, n);
  const routineIds = new Set(routines.map((r) => r.id));
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const inRoutine = (rid, eid) => (routines.find((r) => r.id === rid)?.exercises || []).some((e) => e.exerciseId === eid);
  const changes = (Array.isArray(o.changes) ? o.changes : []).slice(0, 3).map((c) => {
    const ch = { title: s(c?.title, 160), why: s(c?.why, 500), expect: s(c?.expect, 300), watchFor: s(c?.watchFor, 300), fix: null, unappliable: null };
    if (!ch.title) return null;
    try {
      const ops = validateOps(Array.isArray(c?.ops) ? c.ops : []);
      for (const op of ops) {
        if (op.routineId && !routineIds.has(op.routineId)) throw new Error(`routine ${op.routineId} is not in his plan`);
        if (op.exerciseId && !exerciseIds.has(op.exerciseId)) throw new Error(`exercise ${op.exerciseId} is not in his library`);
        if (op.op === 'swap' && op.replaceWith && !exerciseIds.has(op.replaceWith)) throw new Error(`exercise ${op.replaceWith} is not in his library`);
        if ((op.op === 'prescribe' || op.op === 'remove') && op.routineId && !inRoutine(op.routineId, op.exerciseId)) throw new Error(`${op.exerciseId} is not in ${op.routineId}`);
        if (op.op === 'new-exercise') throw new Error('a study cannot add an exercise he has never done by one tap');
      }
      ch.fix = { action: 'ops', ops };
    } catch (e) {
      ch.unappliable = e.message; // kept as a conversation, honestly labelled
    }
    return ch;
  }).filter(Boolean);
  const verdict = ['change', 'hold', 'not-for-him'].includes(o.verdict) ? o.verdict : (changes.some((c) => c.fix) ? 'change' : 'hold');
  return {
    verdict,
    grade: ['strong', 'moderate', 'weak'].includes(o.grade) ? o.grade : 'weak',
    summary: s(o.summary, 800), whyForHim: s(o.whyForHim, 800),
    changes: verdict === 'not-for-him' ? [] : changes,
    discuss: (Array.isArray(o.discuss) ? o.discuss : []).map((d) => s(d, 300)).filter(Boolean).slice(0, 5),
  };
}

/* ------------------------------- the note -------------------------------- */

export function renderPaperNote({ claims, judgement, sourceUrl, date }) {
  const L = [];
  L.push(`# ${claims.title}`, '', `_${claims.source}${sourceUrl ? ` · ${sourceUrl}` : ''} · read ${date} · ${claims.kind}_`, '');
  L.push('## What it claims', '', `**Population:** ${claims.population}`, '', `**Intervention:** ${claims.intervention}`, '');
  if (claims.outcomes.length) { L.push('**Outcomes:**'); for (const x of claims.outcomes) L.push(`- ${x}`); L.push(''); }
  if (claims.limits.length) { L.push('**Limits:**'); for (const x of claims.limits) L.push(`- ${x}`); L.push(''); }
  if (claims.quotes.length) { for (const q of claims.quotes) L.push(`> ${q}`); L.push(''); }
  L.push(`## For Hayden — verdict: ${judgement.verdict} (${judgement.grade} evidence)`, '', judgement.summary, '', judgement.whyForHim, '');
  if (judgement.changes.length) {
    L.push('### Proposed changes', '');
    for (const c of judgement.changes) {
      L.push(`- **${c.title}** — ${c.why}${c.expect ? ` Expect: ${c.expect}` : ''}${c.watchFor ? ` Watch for: ${c.watchFor}` : ''}${c.fix ? ' _(one tap in the Inbox)_' : c.unappliable ? ` _(a conversation, not a tap: ${c.unappliable})_` : ''}`);
    }
    L.push('');
  }
  if (judgement.discuss.length) { L.push('### Worth a conversation', ''); for (const d of judgement.discuss) L.push(`- ${d}`); L.push(''); }
  L.push(`_Applicability, in the Researcher's words: ${claims.applicability}_`);
  return L.join('\n');
}

/* --------------------------------- run ----------------------------------- */

export async function startPaper(vaultPath, { urls = [], prose = '' } = {}, deps = {}) {
  if (!laneEnabled(PAPER_LANE)) throw laneOffError(PAPER_LANE);
  const { createRecord } = deps.store || await import('./inboxStore.js');
  const source = urls[0] || String(prose || '').trim();
  if (!source) throw new Error('give me the paper — a link, or the text');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: PAPER_KIND,
    text: `Study: ${urls[0] ? urls[0] : String(prose).slice(0, 80)}`,
    source: 'paper',
    mode: 'draft',
    status: 'classifying', // NOVA IS WORKING shows it
    urls, prose: String(prose || '').slice(0, 1000),
    createdAt: new Date().toISOString(),
  });
  runPaperJob(vaultPath, record.id, { source, url: urls[0] || null, prose }, deps).catch(() => {});
  return record;
}

export async function retryPaper(vaultPath, record, deps = {}) {
  const { updateRecord } = deps.store || await import('./inboxStore.js');
  const urls = record.urls || [];
  const source = urls[0] || String(record.prose || '').trim();
  if (!source) throw new Error('this study record has nothing to re-read');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runPaperJob(vaultPath, record.id, { source, url: urls[0] || null, prose: record.prose || '' }, deps).catch(() => {});
  return updated;
}

async function runPaperJob(vaultPath, recordId, { source, url, prose }, deps) {
  const store = deps.store || await import('./inboxStore.js');
  const ask = deps.ask || askModel;
  try {
    const him = await hisFacts(vaultPath, deps);
    const claims = parseClaims(await ask(buildReadPrompt({ source, prose, him: him.line }), { lane: PAPER_LANE, tools: 'WebSearch WebFetch Read', vaultPath, minutes: 15, budget: BUDGET_READ }));
    if (!claims) throw new Error('the Researcher could not read that source into claims — is it reachable?');

    const block = await hisBlock(vaultPath, claims, deps);
    const judgement = parseJudgement(
      await ask(buildJudgePrompt({ claims, ...block, intake: him.intakeLine }), { lane: 'coach', tools: 'Read Grep Glob', vaultPath, minutes: 15, budget: BUDGET_JUDGE }),
      { routines: block.routines, exercises: block.exercises },
    );
    if (!judgement) throw new Error('the Coach\'s judgement came back in a shape Nova could not read');

    const date = new Date().toISOString().slice(0, 10);
    const body = renderPaperNote({ claims, judgement, sourceUrl: url, date });
    const title = `${claims.title.slice(0, 80)} — for you: ${judgement.verdict}`;
    // the study itself: a note he can keep (route 'note' — the same undoable filing as any capture)
    await store.updateRecord(recordId, {
      status: 'pending',
      text: `Study: ${claims.title.slice(0, 100)}`,
      claims, judgement,
      decision: { route: 'note', confidence: judgement.grade === 'strong' ? 'high' : 'medium', title, reason: `${judgement.grade} evidence · verdict for you: ${judgement.verdict}`, payload: { title, body } },
    });
    // each change that survived validation: the SAME record the program review raises,
    // so the Inbox's Apply → coach-apply → applyOps path takes it, undoably
    const raised = [];
    for (const c of judgement.changes) {
      if (!c.fix) continue;
      const line = `${c.title} — ${c.why}${c.expect ? ` Expect ${c.expect}` : ''} (from "${claims.title.slice(0, 60)}")`;
      raised.push(await store.createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'coach-program',
        findingKey: `paper:${recordId}:${raised.length}`,
        findingKind: 'paper',
        finding: { kind: 'paper', paperId: recordId, title: c.title, expect: c.expect, watchFor: c.watchFor, grade: judgement.grade },
        fix: c.fix,
        text: `Coach: ${line}`,
        originalText: `Coach: ${line}`,
        source: 'coach',
        mode: 'draft',
        status: 'pending',
        nudges: 0,
        createdAt: new Date().toISOString(),
      }));
    }
    await store.updateRecord(recordId, { proposals: raised.map((r) => r.id) });
    (deps.notify || notifyPending)(recordId, title).catch?.(() => {});
  } catch (e) {
    await store.updateRecord(recordId, { status: 'error', error: e.message });
  }
}

async function notifyPending(recordId, title) {
  try {
    const { notifyIfPending } = await import('./inbox.js');
    if (notifyIfPending) await notifyIfPending(recordId, title);
  } catch { /* the record is still in the Inbox */ }
}

// Who he is, for the applicability line — from what he has actually told Nova.
async function hisFacts(vaultPath, deps) {
  const bits = [];
  let intakeLine = '';
  try {
    const { getProfile, intakeLine: il } = deps.profile || await import('./profile.js');
    const p = await getProfile(vaultPath);
    if (p?.intake?.facts) {
      const f = p.intake.facts;
      bits.push(`${f.sex || '—'}, ${f.age || '—'}y, ${f.weightKg || '—'} kg, ${f.heightCm || '—'} cm, activity: ${f.activity || '—'}, goal: ${f.goal || '—'}`);
      intakeLine = il ? il(p.intake) : '';
    }
    if (p?.focus) bits.push(`focus: ${p.focus}`);
  } catch { /* no profile */ }
  try {
    const { goalsContext } = deps.goals || await import('./fitnessGoals.js');
    const g = await goalsContext(vaultPath);
    if (g) bits.push(g.slice(0, 400));
  } catch { /* no goals */ }
  try {
    const { loadSessions } = deps.sessions || await import('./workoutSessions.js');
    const sessions = await loadSessions(vaultPath, {});
    if (sessions.length) {
      const first = sessions[sessions.length - 1]?.date || sessions[0]?.date;
      bits.push(`training log: ${sessions.length} sessions on record since ${first}`);
    }
  } catch { /* no sessions */ }
  return { line: bits.length ? bits.join('\n') : 'a recreational lifter (no intake or goals on file — say that the applicability is judged blind)', intakeLine };
}

// His real block, rendered for the judge.
async function hisBlock(vaultPath, claims, deps) {
  let routines = []; let exercises = []; let schedule = ''; let library = '';
  try {
    const { loadExerciseLibrary } = deps.exercisesLib || await import('./exercises.js');
    const { loadRoutines } = deps.workouts || await import('./workouts.js');
    ({ exercises } = await loadExerciseLibrary(vaultPath));
    const r = await loadRoutines(vaultPath, exercises);
    routines = r.routines || [];
    schedule = Object.entries(r.schedule || {}).map(([d, id]) => `${d}: ${id === 'active-rest' ? 'active rest' : routines.find((x) => x.id === id)?.name || id}`).join(', ');
    library = exercises.map((e) => `${e.id} — ${e.name} (${e.muscleGroup})`).join('\n');
  } catch { /* no plan */ }
  let goals = '';
  try { const { goalsContext } = deps.goals || await import('./fitnessGoals.js'); goals = (await goalsContext(vaultPath)) || ''; } catch { /* none */ }
  let recent = '';
  try {
    const { loadSessions } = deps.sessions || await import('./workoutSessions.js');
    const sessions = (await loadSessions(vaultPath, { limit: 8 })).slice(0, 8);
    recent = sessions.map((s) => `- ${s.date} ${s.routineName || s.routineId || ''}: ${(s.exercises || []).slice(0, 6).map((e) => `${e.name || e.exerciseId} ${(e.sets || []).filter((x) => x.done !== false).map((x) => `${x.weightKg ?? x.weight ?? ''}×${x.reps ?? ''}`).join(',')}`).join(' · ')}`).join('\n');
  } catch { /* none */ }
  let shelf = '';
  try {
    const { shelfContext } = deps.shelf || await import('./sourceShelf.js');
    shelf = (await shelfContext(vaultPath, { topics: [claims.title, claims.intervention].filter(Boolean), limit: 4 })) || '';
  } catch { /* none */ }
  let open = '';
  try { const { programReviewContext } = deps.review || await import('./coachProgramReview.js'); open = (await programReviewContext()) || ''; } catch { /* none */ }
  return { routines, exercises, plan: renderPlan(routines, exercises), library, schedule, goals, recent, shelf, open };
}

function askModel(prompt, { lane, tools, vaultPath, minutes = 15, budget = '1' }) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(tools),
      '--output-format', 'json',
      '--model', modelFor(lane),
      '--max-budget-usd', budget,
      '--session-id', randomUUID(),
    ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    settleWatchdog(child, { label: lane === PAPER_LANE ? 'reading the study' : 'the Coach\'s judgement', minutes });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      try {
        const outer = JSON.parse(out);
        if (outer.is_error || code !== 0) return reject(new Error(outer.result || err.trim().split('\n').pop() || `claude exited with code ${code}`));
        resolve(String(outer.result || ''));
      } catch (e) { reject(new Error(err.trim().split('\n').pop() || e.message)); }
    });
  });
}
