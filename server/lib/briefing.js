// THE BRIEFING — a report Nova researches, then performs.
//
// His ask, 7 Sep 2026: say one sentence ("research the wavelengths of light
// Huberman talked about and synthesise it into a report — and define the
// terminology I may not know"), let agents do the work, get a notification,
// and open it when ready: a document he can read, or press play and have Nova
// explain it while visuals change and the transcript runs beside them.
//
// Design decisions worth knowing before changing anything here
// (design/BRIEFING-PLAN.md carries the full reasoning):
//
//   1. THE WHOLE SENTENCE IS THE SPEC. "Make it simply understood", "define
//      the terminology", "focus on the training side" are not flags to parse
//      — they ride as `standingInstruction` and shape every beat. Parsing
//      them into options would lose exactly what makes the request his.
//
//   2. FAN OUT, THEN SYNTHESISE. Angles are researched in parallel by the
//      existing Researcher, so each is separately cost-capped and separately
//      CITATION-GATED — an unsourced claim cannot reach the report, and one
//      bad angle cannot poison it.
//
//   3. THE SCRIPT AND THE DOCUMENT ARE WRITTEN TOGETHER. One pass produces
//      both, so what he hears and what he reads cannot drift apart. They are
//      not copies of each other: prose is right for reading, beats are right
//      for listening.
//
//   4. HIS SHELF IS CROSS-CHECKED. The podcast that prompted him is usually
//      already in Wiki/Sources, so the briefing says where it agrees with the
//      literature and where it does not. That is lens.js's source rule at its
//      most useful.

import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';
import { createRecord, updateRecord, getRecord } from './inboxStore.js';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';

const MAX_ANGLES = 5;
const MIN_ANGLES = 2;

export const BRIEFING_KIND = 'briefing';

// launchd services do not inherit the interactive shell PATH — absolute path
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

// One spawn. The decompose pass gets no tools; the compose pass gets Read on
// the vault (his shelf is the cross-check) and never the web — every outside
// fact it may use was already citation-gated by a Researcher upstream.
function runClaude({ prompt, model: m, tools = '', budget = '1.0', vaultPath, minutes = 25 }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs(tools),
      '--output-format', 'json',
      '--max-budget-usd', String(budget),
      '--no-session-persistence',
    ];
    if (m) args.push('--model', m);
    const child = spawn(CLAUDE_BIN, args, vaultPath ? { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] } : { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    settleWatchdog(child, { label: 'the briefing', minutes });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      let outer;
      try { outer = JSON.parse(stdout); } catch {
        return reject(new Error(`the briefing model returned no JSON (exit ${code}): ${(stderr || stdout).trim().slice(0, 240) || 'no output'}`));
      }
      if (outer.is_error || code !== 0) {
        const spent = Number(outer.total_cost_usd);
        return reject(new Error(outer.result || stderr.trim() || `the briefing model exited ${code}${Number.isFinite(spent) ? ` after ${spent.toFixed(2)}` : ''}`));
      }
      const text = (outer.result || '').trim();
      if (!text) return reject(new Error('the briefing model returned nothing'));
      resolve(text);
    });
  });
}

/* ------------------------------ the decompose ----------------------------- */

export function buildAnglesPrompt(topic, standing) {
  return `Break a research topic into the angles worth investigating separately.

THE TOPIC, in his words: "${topic}"
${standing ? `WHAT HE ASKED FOR IN THE REPORT: "${standing}"` : ''}

Give ${MIN_ANGLES}-${MAX_ANGLES} angles. Each becomes its own parallel research job, so they must be:
- genuinely separable — no two angles that would return the same sources
- specific enough to search ("the melanopsin pathway and circadian entrainment", not "the science")
- collectively the whole topic, ordered as they should be EXPLAINED to someone learning it: mechanism before implication, evidence before protocol

Also give the report a title: plain, specific, no colon-subtitle padding.

Output ONLY JSON: {"title": "...", "angles": [{"q": "the research question, a full sentence", "why": "what this angle contributes to his understanding"}]}
No markdown, no code fences, no commentary.`;
}

export function normalizeAngles(parsed, topic) {
  const angles = (Array.isArray(parsed?.angles) ? parsed.angles : [])
    .map((a) => ({ q: String(a?.q || '').trim(), why: String(a?.why || '').trim() }))
    .filter((a) => a.q.length > 8)
    .slice(0, MAX_ANGLES);
  if (angles.length < MIN_ANGLES) throw new Error('could not break that topic into researchable angles — try saying it with a bit more detail');
  return { title: String(parsed?.title || '').trim() || topic.slice(0, 80), angles };
}

/* ------------------------------ the synthesis ----------------------------- */

export function buildComposePrompt({ title, topic, standing, findings, shelf }) {
  return `${NOVA_LENS}

You are writing a BRIEFING for Hayden: a report he asked Nova to research, which he will both READ and LISTEN TO while visuals change on screen.

THE TOPIC, in his words: "${topic}"
${standing ? `\nHIS STANDING INSTRUCTION FOR THIS REPORT — this outranks your defaults, follow it exactly:\n"${standing}"\n` : ''}
${shelf ? `\n${shelf}\n` : ''}
WHAT THE RESEARCH FOUND (each angle was researched separately, and every citation in it was verified to resolve to a real source):

${findings}

Write the briefing. Two things at once, from the same material:

- \`body\`: the prose he READS. Full sentences, no bullet-point shorthand, no headings inside it (the heading is its own field). This is where nuance, caveats and numbers live.
- \`beats\`: what Nova SAYS. Each beat is {"say": "...", "visual": ...}. \`say\` is one or two sentences of natural speech, spoken aloud one beat at a time. Speech is not prose read out: shorter sentences, no parentheses, no citation markers, numbers said the way a person says them.
  \`visual\` is what should be on screen while that beat is spoken, and it is OPTIONAL — most beats should have none (the glass then shows the term being defined, or the section heading). Add one only where a picture or a clip would genuinely help him understand what is being said:
    {"kind":"image","query":"<a 3-6 word search for a real diagram or photo, e.g. electromagnetic spectrum wavelength diagram>","caption":"<what he is looking at, one line>"}
    {"kind":"clip","query":"<a search for a short explanatory video on this exact point>","caption":"<why this clip, one line>"}
  Use image for mechanisms and anatomy; clip sparingly, for something better seen moving. Never more than one visual per beat, and never for a beat that is just a sentence of prose.

The body and the beats of a section must cover the same ground. They are not copies of each other.

RULES THAT ARE NOT NEGOTIABLE:
- EXPLAIN, DON'T IMPRESS. Every scientific term gets defined in plain words the first time it appears — in the body AND in the spoken beat. Assume he is intelligent and does not have the background. A term he has to look up is a failure of this report.
- ATTRIBUTE, DON'T ASSERT. Say who found something and how strongly ("a 2024 study of 88,000 people", "one small trial", "this is his own coinage, not a trial"). Where the evidence is thin or contested, say so — that is the most useful sentence in any report.
- WHERE HIS OWN SOURCES DISAGREE WITH THE LITERATURE, SAY SO by name. He saved that material; tell him where it holds up.
- NEVER INVENT a study, a number or a source. Everything comes from the findings above.
- Finish on what it means for HIM specifically — he trains hard, tracks his food, sleeps badly some weeks and runs a team.

Also give:
- \`glossary\`: every term you defined, as {term, plain} — plain is one sentence, no jargon inside it.
- \`sources\`: the sources actually drawn on, as {title, url}. Only ones that appear in the findings.

You may Read the shelf pages named above (and their Raw/ transcripts) before writing — do that silently. Then your ENTIRE reply must be the JSON below: no preamble, no "I will check", no commentary of any kind before or after it.

Output ONLY JSON with exactly these keys:
{"title": "...", "summary": "2-3 sentences — what this is and what it concludes", "sections": [{"heading": "...", "body": "...", "beats": [{"say": "...", "visual": null}, {"say": "...", "visual": {"kind": "image", "query": "...", "caption": "..."}}]}], "glossary": [{"term": "...", "plain": "..."}], "sources": [{"title": "...", "url": "..."}]}
No markdown fences, no commentary before or after.`;
}

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeBriefing(parsed, { title: fallbackTitle } = {}) {
  const sections = (Array.isArray(parsed?.sections) ? parsed.sections : [])
    .map((s) => ({
      heading: clean(s?.heading, 120),
      body: String(s?.body || '').trim(),
      // a beat is {say, hint?} — a bare string is accepted for older records
      beats: (Array.isArray(s?.beats) ? s.beats : []).map((b) => {
        if (typeof b === 'string') return { say: clean(b, 600) };
        const say = clean(b?.say, 600);
        const v = b?.visual && typeof b.visual === 'object' ? b.visual : null;
        const hint = v && (v.kind === 'image' || v.kind === 'clip') && String(v.query || '').trim()
          ? { kind: v.kind, query: clean(v.query, 120), caption: clean(v.caption, 200) }
          : null;
        return hint ? { say, hint } : { say };
      }).filter((b) => b.say),
    }))
    .filter((s) => s.heading && (s.body || s.beats.length));
  if (!sections.length) throw new Error('the briefing came back with no sections');
  return {
    title: clean(parsed?.title, 140) || fallbackTitle || 'Briefing',
    summary: String(parsed?.summary || '').trim(),
    sections,
    glossary: (Array.isArray(parsed?.glossary) ? parsed.glossary : [])
      .map((g) => ({ term: clean(g?.term, 80), plain: clean(g?.plain, 400) }))
      .filter((g) => g.term && g.plain),
    sources: (Array.isArray(parsed?.sources) ? parsed.sources : [])
      .map((s) => ({ title: clean(s?.title, 160), url: clean(s?.url, 500) }))
      .filter((s) => /^https?:\/\//.test(s.url)),
  };
}

// The flat step list the player consumes — the Morning Show's shape, so the
// existing speak→onPlay→show loop drives it with no new sync machinery.
// A heading beat carries `section` so the reader can highlight and scroll.
export function beatsOf(briefing) {
  const steps = [];
  if (briefing.summary) steps.push({ say: briefing.summary, section: -1, kind: 'summary' });
  briefing.sections.forEach((s, i) => {
    s.beats.forEach((b, j) => steps.push({ say: b.say, resolved: b.visual || null, section: i, kind: j === 0 ? 'section-open' : 'beat' }));
  });
  return steps;
}

// The vault page. A briefing he asked for becomes knowledge every other agent
// can read — the whole point of it landing in Wiki/Sources rather than a chat.
export function briefingMarkdown(b, topic) {
  const parts = [`**Asked for:** ${topic}`, ''];
  if (b.summary) parts.push(b.summary, '');
  for (const s of b.sections) {
    parts.push(`## ${s.heading}`, '', s.body, '');
  }
  if (b.glossary.length) {
    parts.push('## Terms, in plain words', '');
    for (const g of b.glossary) parts.push(`- **${g.term}** — ${g.plain}`);
    parts.push('');
  }
  if (b.sources.length) {
    parts.push('## Sources', '');
    for (const s of b.sources) parts.push(`- [${s.title}](${s.url})`);
    parts.push('');
  }
  return parts.join('\n');
}

/* -------------------------------- the job -------------------------------- */

const jobs = new Map();
export function getBriefingJob(id) { return jobs.get(id) || null; }
export function _briefingJobs() { return jobs; } // test hook

// `deps` is injectable so the whole pipeline is testable without spawning a
// model or hitting the network — the pattern hands.js and scanFood use.
export const defaultDeps = {
  runClaude,
  startResearch: async (vaultPath, q, opts) => (await import('./researcher.js')).startResearch(vaultPath, q, opts),
  getRecord,
  shelfContext: async (vaultPath, topics) => (await import('./sourceShelf.js')).shelfContext(vaultPath, { topics, limit: 4 }),
  enrichVisuals: async (briefing) => (await import('./briefingMedia.js')).enrichVisuals(briefing),
};

async function model(deps, prompt, { lane, tools = '', budget = '1.0', vaultPath }) {
  const out = await deps.runClaude({ prompt, model: modelFor(lane), tools, budget, vaultPath });
  const match = firstBalancedObjectMatch(out);
  if (!match) throw new Error(`the ${lane} step did not return JSON: ${String(out).slice(0, 160)}`);
  return parseModelJson(match[0]);
}

// Waits for a research record to settle. Polls rather than subscribes because
// the Researcher owns its own lifecycle and files on its own schedule — the
// same approach planner.js takes, and for the same reason.
async function awaitResearch(deps, recordId, { pollMs = 5000, maxMs = 20 * 60_000 } = {}) {
  const started = Date.now();
  for (;;) {
    const r = await deps.getRecord(recordId).catch(() => null);
    if (r && ['pending', 'filed', 'resolved'].includes(r.status)) return r;
    if (r && r.status === 'error') return { ...r, failed: true };
    if (Date.now() - started > maxMs) return { failed: true, error: 'that angle took too long' };
    await new Promise((res) => setTimeout(res, pollMs));
  }
}

export async function startBriefing(vaultPath, { topic, standing = '' } = {}, deps = defaultDeps) {
  const t = String(topic || '').replace(/\s+/g, ' ').trim();
  if (t.length < 8) throw new Error('say a bit more about what to research');
  if (t.length > 600) throw new Error('that topic is too long — say the heart of it in a sentence or two');
  // both passes checked BEFORE any research is started: a compose lane found
  // off after five research jobs have run is real money spent for nothing
  if (!laneEnabled('briefing-plan')) throw laneOffError('briefing-plan');
  if (!laneEnabled('briefing-compose')) throw laneOffError('briefing-compose');
  if (!laneEnabled('researcher')) throw laneOffError('researcher');

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: BRIEFING_KIND,
    text: `Briefing: ${t}`,
    source: 'briefing',
    mode: 'draft',
    status: 'classifying', // in flight — NOVA IS WORKING shows it
    createdAt: new Date().toISOString(),
  });
  jobs.set(record.id, { id: record.id, stage: 'planning', angles: [], done: 0 });
  runBriefingJob(vaultPath, record.id, t, String(standing || '').trim(), deps).catch(() => {});
  return record;
}

async function runBriefingJob(vaultPath, recordId, topic, standing, deps) {
  const job = jobs.get(recordId);
  const setStage = (stage, extra = {}) => { if (job) Object.assign(job, { stage, ...extra }); };
  try {
    // 1 — decompose
    const angles = normalizeAngles(
      await model(deps, buildAnglesPrompt(topic, standing), { lane: 'briefing-plan', budget: '0.5', vaultPath }),
      topic,
    );
    setStage('researching', { angles: angles.angles.map((a) => a.q), title: angles.title });

    // 2 — fan out. All angles at once: they are independent by construction,
    // and a briefing that runs them in series takes five times as long for
    // no better answer.
    const started = await Promise.all(angles.angles.map(async (a) => {
      try {
        const r = await deps.startResearch(vaultPath, a.q, { context: `This is one angle of a briefing on: ${topic}${standing ? `\nHe asked: ${standing}` : ''}\nThis angle covers: ${a.why}` });
        return { angle: a, recordId: r.id };
      } catch (e) {
        return { angle: a, failed: true, error: e.message };
      }
    }));
    const settled = await Promise.all(started.map(async (s) => {
      if (s.failed) return s;
      const r = await awaitResearch(deps, s.recordId);
      if (job) job.done += 1;
      return { ...s, record: r, failed: !!r.failed };
    }));

    const good = settled.filter((s) => !s.failed && s.record?.decision?.payload?.body);
    if (!good.length) throw new Error('every research angle failed — nothing to synthesise');

    // A partial briefing says which angle is missing rather than quietly
    // being thinner than it should be.
    const missing = settled.filter((s) => s.failed).map((s) => s.angle.q);
    const findings = good.map((s, i) => `### Angle ${i + 1}: ${s.angle.q}\n${s.record.decision.payload.body}`).join('\n\n');

    // 3 — compose. The shelf rides along so his own saved material is
    // weighed rather than ignored.
    setStage('writing');
    const shelf = await deps.shelfContext(vaultPath, `${topic} ${angles.angles.map((a) => a.q).join(' ')}`).catch(() => null);
    const briefing = normalizeBriefing(
      // Read only, no web: the shelf cross-check means opening HIS pages, and a
      // pass that cannot open them announced it would and then stopped (the
      // first live run). The web stays shut — every outside fact was already
      // citation-gated upstream.
      await model(deps, buildComposePrompt({ title: angles.title, topic, standing, findings, shelf }), { lane: 'briefing-compose', budget: '2.5', vaultPath, tools: 'Read' }),
      { title: angles.title },
    );
    if (missing.length) briefing.incomplete = missing;

    // 4 — the visuals, fetched and cached NOW so playback never buffers. A
    // hint that resolves to nothing is dropped; the briefing is ready either way.
    setStage('illustrating');
    try { await deps.enrichVisuals(briefing); } catch { /* the typographic glass stands in */ }

    const body = briefingMarkdown(briefing, topic);
    await updateRecord(recordId, {
      status: 'pending',
      decision: {
        route: 'note',
        confidence: 'high',
        title: briefing.title,
        reason: missing.length
          ? `Researched across ${good.length} angles (${missing.length} failed — the report says which). Approving files it to your vault, where every agent can read it.`
          : `Researched across ${good.length} angles, every citation checked. Approving files it to your vault, where every agent can read it.`,
        payload: { title: briefing.title, body, briefing, topic, standing },
      },
    });
    setStage('ready');
  } catch (e) {
    setStage('error', { error: e.message });
    await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
  }
}

/* ------------------------------ the visuals ------------------------------- */

// What is on the glass while a beat is spoken. Phase A/B are deterministic
// and built from the briefing itself — a defined term when the beat uses
// one, the section's heading otherwise — so the stage is never blank and
// never decorative. Phases B/C add image and clip kinds on top of these.
export function visualFor(beat, briefing) {
  // an image or clip the enricher resolved and cached wins outright
  if (beat.resolved && (beat.resolved.kind === 'image' || beat.resolved.kind === 'clip')) return beat.resolved;
  const say = String(beat.say || '');
  const lower = say.toLowerCase();
  // the FIRST glossary term the beat mentions — its plain definition on the
  // glass at the moment Nova says the word is his "define the terminology"
  // ask made literal
  const term = (briefing.glossary || []).find((g) => g.term && lower.includes(g.term.toLowerCase()));
  if (term) return { kind: 'term', term: term.term, plain: term.plain };
  if (beat.kind === 'summary') return { kind: 'title', title: briefing.title, sub: `${briefing.sections.length} parts · ${briefing.sources.length} sources` };
  const section = briefing.sections[beat.section];
  return { kind: 'heading', n: beat.section + 1, of: briefing.sections.length, heading: section?.heading || '' };
}

// Everything the player needs, in one shape: the beats with their visuals,
// plus the document. Computed on read so a later phase can enrich visuals
// (images, clips) without touching what is stored.
export function playable(briefing) {
  const beats = beatsOf(briefing).map((b, i) => ({ ...b, i, visual: visualFor(b, briefing) }));
  return { briefing, beats };
}
