// PROJECT RESEARCH (Projects phase 2, PROJECTS-PLAN §2, Q17–Q20, Q34).
//
// A question asked FOR a project goes to the Researcher's own panel (web,
// citation-required: lib/researcher.js runResearchPanel), with the project's
// PROJECT section handed in as the material. The merge is told to answer in a
// shape code can check:
//   { synthesis:[{claim, sources:[url | [[note ref]]]}],
//     sources:[{url, title, fetched, said}],
//     candidates:[{url, why}] }            (videos worth watching, at most 5)
// and CODE decides what is kept: a claim with no source it can resolve is
// DROPPED and counted, a source with no url is dropped, a candidate that is
// not a video link is dropped. Code then writes, through the kernel's
// contained writers: one file per source under research/, and SYNTHESIS.md
// rewritten (the previous one moved to research/.history/ first). One filed
// card carries the line, the count left out, the model and the cost, with an
// undo. Found videos become ONE pending card; nothing starts on its own.

import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { BRIEF_RULES, DECISION_RULES } from './researchPanel.js';
import { laneEnabled, laneOffError, modelFor } from './modelPrefs.js';
import { isGateModel } from './modelChoice.js';
import { assertNotProtected } from './protectedRoots.js';
import { projectSlug } from './projects.js';
import { assertWritable } from './projectKernel.js';

export const MAX_CANDIDATES = 5;
const newId = () => randomUUID().replace(/-/g, '').slice(0, 8);
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function refuse(message, code) { const e = new Error(message); e.code = code; return e; }

// what the job calls out to; a test stands in for the panel (no CLI, no web)
const deps = {
  runPanel: async (...a) => (await import('./researcher.js')).runResearchPanel(...a),
  startWatch: async (...a) => (await import('./watcher.js')).startVideoWatchJob(...a),
};
export function _setResearchDepsForTest(over = {}) {
  const prev = { ...deps };
  Object.assign(deps, over);
  return () => Object.assign(deps, prev);
}

/** The merge prompt: the Researcher's rules, the project, and the shape. */
export function buildProjectSynthesisPrompt(project, him = '') {
  return (question, reports) => {
    const body = reports.map((r) => {
      if (r.error) return `### ${r.name}\nTHIS RESEARCHER FAILED — ${r.error}. Its angle is NOT covered below.`;
      if (!r.findings?.length) return `### ${r.name}\nReturned no usable findings.`;
      return `### ${r.name}\n${r.findings.map((f) => `- ${f.claim}\n  URL: ${f.url}${f.note ? `\n  Note: ${f.note}` : ''}`).join('\n')}`;
    }).join('\n\n');
    return `${NOVA_LENS}

You are Nova's Researcher, merging a panel's findings for ONE of Hayden's projects: "${project.name}". What you write is filed by code into that project's research folder, claim by claim, each with the source it rests on.

The question: ${question}

${body}

Rules:
${BRIEF_RULES}
- Use ONLY the URLs above. You have no web access here; a source no researcher reported is invented, and code will drop it.
- EVERY claim names its source(s) by URL, exactly as listed above. A claim with no source is dropped by code, not written. You may also cite one of the project's own pages by its [[path]] when the claim comes from it.
- Where the angles disagree, say so as its own claim, citing both.
- Answer for this project: what bears on its goal and its phases.
${him ? `\nWHO THIS IS FOR (to choose what matters to him; never a source to cite):\n${him.slice(0, 4000)}\n` : ''}
${DECISION_RULES}

If a researcher reported a VIDEO worth watching for this project (YouTube, Instagram, TikTok, Vimeo), list it under "candidates" with one line on why. At most ${MAX_CANDIDATES}. Never invent a link.

Output ONLY a JSON object:
{"title":"Short title for this research","synthesis":[{"claim":"one sentence","sources":["https://…"]}],"sources":[{"url":"https://…","title":"page title","fetched":"YYYY-MM-DD","said":"what this source said, 1-4 sentences"}],"candidates":[{"url":"https://…","why":"one line"}]}
No code fences, no commentary.`;
  };
}

/**
 * STRICT. `reads` are the project's own pages (a claim may cite one as
 * [[path]]); `isVideo(url)` decides a candidate. Returns the kept parts and
 * what was left out, counted.
 */
export function validateProjectResearch(parsed, { reads = [], isVideo = () => false, today = isoDay() } = {}) {
  const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const dropped = { claims: 0, sources: 0, candidates: 0 };
  const sources = [];
  const byUrl = new Map();
  for (const s of Array.isArray(obj.sources) ? obj.sources.slice(0, 40) : []) {
    const url = typeof s?.url === 'string' ? s.url.trim() : '';
    if (!/^https?:\/\/\S+$/i.test(url) || url.length > 500) { dropped.sources++; continue; }
    if (byUrl.has(url)) continue;
    const fetched = /^\d{4}-\d{2}-\d{2}$/.test(String(s.fetched || '')) ? s.fetched : today;
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* the regex let it through; the title falls back */ }
    const src = { url, title: str(s.title, 160) || host || url, fetched, said: str(s.said, 1200) };
    byUrl.set(url, src);
    sources.push(src);
  }
  const readSet = new Set((reads || []).map((r) => String(r).replace(/\.md$/, '')));
  const synthesis = [];
  for (const c of Array.isArray(obj.synthesis) ? obj.synthesis.slice(0, 40) : []) {
    const claim = str(c?.claim, 600);
    if (!claim) { dropped.claims++; continue; }
    const refs = [];
    for (const r of Array.isArray(c.sources) ? c.sources : []) {
      const ref = typeof r === 'string' ? r.trim() : '';
      if (byUrl.has(ref)) { if (!refs.includes(ref)) refs.push(ref); continue; }
      const note = ref.match(/^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
      if (note && readSet.has(note[1].replace(/\.md$/, ''))) { const k = `[[${note[1].replace(/\.md$/, '')}]]`; if (!refs.includes(k)) refs.push(k); }
    }
    if (!refs.length) { dropped.claims++; continue; }
    synthesis.push({ claim, sources: refs });
  }
  // a source nothing cites is still what a researcher found: kept, as a file
  const candidates = [];
  for (const c of Array.isArray(obj.candidates) ? obj.candidates : []) {
    const url = typeof c?.url === 'string' ? c.url.trim() : '';
    if (candidates.length >= MAX_CANDIDATES || !isVideo(url) || candidates.some((x) => x.url === url)) { dropped.candidates++; continue; }
    candidates.push({ url, why: str(c.why, 200) });
  }
  return { title: str(obj.title, 120), synthesis, sources, candidates, dropped };
}

// one file per source: what code knows about it, and what the source said
export function sourceFileMarkdown(src, { question, date }) {
  return [
    `# ${src.title}`, '',
    `- url: ${src.url}`,
    `- fetched: ${src.fetched}`,
    '- means: web',
    `- researched: ${date}, for "${question}"`, '',
    '## What it said', '',
    src.said || '(the researcher gave no summary of it)', '',
  ].join('\n');
}

// SYNTHESIS.md, rewritten by code: every line cites the file its source is in
export function synthesisMarkdown({ project, question, title, synthesis, sources, names, date, dropped, model }) {
  const fileOf = new Map(sources.map((s, i) => [s.url, names[i]]));
  const cite = (ref) => (fileOf.has(ref) ? `[${fileOf.get(ref).replace(/\.md$/, '')}](<${fileOf.get(ref)}>)` : ref);
  return [
    `# ${project.name} · research synthesis`, '',
    `Rewritten by code on ${date} from the research "${question}". Every line cites the source file it rests on; the synthesis before this one is kept in research/.history/.`, '',
    `## ${title || question}`, '',
    ...synthesis.map((c) => `- ${c.claim} (${c.sources.map(cite).join('; ')})`), '',
    ...(dropped.claims ? [`${dropped.claims} claim${dropped.claims === 1 ? '' : 's'} left out: no source.`, ''] : []),
    '## Sources', '',
    ...sources.map((s, i) => `- [${s.title}](<${names[i]}>) · ${s.url} · fetched ${s.fetched}`), '',
    `Read by ${model} (the merge) · means: web`, '',
  ].join('\n');
}

const summaryLine = (v) => {
  const n = v.synthesis.length;
  const m = v.sources.length;
  const left = v.dropped.claims ? ` · ${v.dropped.claims} claim${v.dropped.claims === 1 ? '' : 's'} left out: no source` : '';
  return `${n} claim${n === 1 ? '' : 's'} from ${m} source${m === 1 ? '' : 's'}${left}`;
};

/**
 * Starts the job; returns { record, done }. Refuses (with a code) a linked or
 * missing project, an empty or long question, an off lane, and a vault whose
 * folder is protected. The record narrates its panel like the Researcher's.
 */
export async function startProjectResearchJob(vaultPath, projectId, question, { model } = {}) {
  const q = String(question || '').trim();
  if (!q) throw refuse('a research question is required', 'question');
  if (q.length > 500) throw refuse('keep the question under 500 characters', 'question');
  if (model !== undefined && !isGateModel(model)) throw refuse("model must be 'opus' or 'sonnet'", 'question');
  const { LINKED_IDS } = await import('./projectLinks.js');
  if (LINKED_IDS.includes(projectId)) throw refuse('that is a linked project: Nova only reads about it and never writes research into it', 'linked');
  const { novaKernel } = await import('./novaProjects.js');
  const k = novaKernel(vaultPath);
  const p = k.getProject(projectId);
  if (!p) throw refuse('no such project', 'missing');
  assertWritable(p);
  if (p.stage === 'archived') throw refuse(`${p.name} is archived; bring it back before researching for it`, 'stage');
  if (!laneEnabled('project-research')) throw laneOffError('project-research');
  // the panel runs in the vault folder (as the Researcher does) and writes
  // into the project's folder: neither may be a folder Nova never writes to
  if (vaultPath) assertNotProtected(vaultPath, 'research there');
  assertNotProtected(p.folder, 'write research there');
  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: newId(), kind: 'project-research', source: 'researcher', mode: 'draft', status: 'classifying',
    text: `Research: ${q}`, createdAt: new Date().toISOString(),
    projectId: p.id, model: model || null,
  });
  const done = runProjectResearch(vaultPath, record.id, p, q, model);
  return { record, done };
}

export async function startProjectResearch(vaultPath, projectId, question, opts = {}) {
  return (await startProjectResearchJob(vaultPath, projectId, question, opts)).record;
}

async function runProjectResearch(vaultPath, recordId, project, q, model) {
  const { updateRecord, createRecord } = await import('./inboxStore.js');
  try {
    const { projectContextSection } = await import('./projectContext.js');
    const context = await projectContextSection(vaultPath, project.id).catch(() => '');
    // who it is for, as the Researcher's merge reads it (27 Oct 2026); a failed read is named
    let him = '';
    try { const { profileContext } = await import('./profile.js'); him = await profileContext(vaultPath); } catch (e) { him = `ABOUT HAYDEN: (his profile page could not be read: ${e.message})`; }
    const { extractVideoUrl } = await import('./watcher.js');
    const tally = { usd: 0 };
    const out = await deps.runPanel(vaultPath, recordId, q, {
      model, context,
      shape: {
        lane: 'project-research', tally,
        synthesisPrompt: buildProjectSynthesisPrompt(project, him),
        normalize: (parsed) => validateProjectResearch(parsed, { reads: project.reads || [], isVideo: (u) => !!extractVideoUrl(u) && extractVideoUrl(u).url === u }),
      },
    });
    const v = out;
    const mergeModel = out.mergeModel || model || modelFor('project-research');
    if (!v.synthesis.length) {
      throw new Error(`no claim came back with a source it could be checked against${v.dropped.claims ? ` (${v.dropped.claims} left out)` : ''}. Nothing was written.`);
    }
    const { novaKernel } = await import('./novaProjects.js');
    const k = novaKernel(vaultPath);
    const fresh = assertWritable(k.getProject(project.id));
    const date = isoDay();
    const base = (s) => `${date} ${projectSlug(s.title) || 'source'}.md`;
    const written = k.writeResearch(fresh, {
      sources: v.sources.map((s) => ({ name: base(s), content: sourceFileMarkdown(s, { question: q, date }) })),
      synthesisFor: (names) => synthesisMarkdown({ project: fresh, question: q, title: v.title, synthesis: v.synthesis, sources: v.sources, names, date, dropped: v.dropped, model: mergeModel }),
      line: `research “${q.slice(0, 120)}”: ${summaryLine(v)}; ${v.sources.length} source file${v.sources.length === 1 ? '' : 's'}, SYNTHESIS.md rewritten (${mergeModel})`,
    });
    const costUsd = tally.usd ? Math.round(tally.usd * 100) / 100 : null;
    const line = summaryLine(v);
    await updateRecord(recordId, {
      status: 'filed', filedAt: new Date().toISOString(), auto: true,
      decision: {
        route: 'project-research', confidence: 'high',
        title: v.title || q,
        reason: `${line}. Filed into ${fresh.name}'s research folder (SYNTHESIS.md and one file per source). Undo puts the previous synthesis back.`,
        payload: {
          projectId: fresh.id, question: q, claims: v.synthesis.length, sources: v.sources.length,
          droppedClaims: v.dropped.claims, droppedSources: v.dropped.sources,
          synthesis: v.synthesis, sourceList: v.sources.map((s) => ({ url: s.url, title: s.title })),
          model: mergeModel, workerModel: out.workerModel || null, costUsd,
          files: written.files.map((f) => f.rel), synthesisRel: written.synthesis.rel,
        },
      },
      destination: `${fresh.name} — research/SYNTHESIS.md + ${written.files.length} source file${written.files.length === 1 ? '' : 's'}`,
      undoData: { route: 'project-research', projectId: fresh.id, files: written.files, synthesis: written.synthesis, history: written.history },
      summary: line, droppedClaims: v.dropped.claims, costUsd, model: mergeModel,
    });
    if (v.candidates.length) {
      const { capability } = await import('./capabilities.js');
      const each = capability('watch')?.costUsd ?? null;
      await createRecord({
        id: newId(), kind: 'project-watch-candidates', source: 'researcher', mode: 'draft', status: 'pending',
        text: `${v.candidates.length} video${v.candidates.length === 1 ? '' : 's'} to watch for ${fresh.name}`,
        createdAt: new Date().toISOString(), projectId: fresh.id, parentId: recordId,
        decision: {
          route: 'project-watch-candidates', confidence: 'medium',
          title: `${v.candidates.length} video${v.candidates.length === 1 ? '' : 's'} the research found for ${fresh.name}`,
          reason: `Nothing starts until you say. "Watch them" runs the Watcher on each, one after another, into ${fresh.name} only${each != null ? ` (up to ~$${each.toFixed(2)} each, the Watcher's ceiling)` : ''}.`,
          payload: { projectId: fresh.id, items: v.candidates, estimateEachUsd: each, lens: null },
        },
      });
    }
  } catch (e) {
    await updateRecord(recordId, { status: 'error', error: e.message }).catch(() => {});
  }
}

/**
 * HIS "Watch them" on a candidates card: the Watcher on each kept link, one
 * after another, into this project. `urls` null = all of them (the Inbox's
 * Approve); otherwise the ones he did not cross out. The card is filed at once
 * with the list it is working through; each watch is its own record.
 */
export async function watchCandidates(vaultPath, recordId, urls = null) {
  const { getRecord, updateRecord } = await import('./inboxStore.js');
  const r = await getRecord(recordId);
  if (!r || r.kind !== 'project-watch-candidates') throw refuse('that is not a candidates card', 'missing');
  if (r.status !== 'pending') throw refuse('this card has already been answered', 'stage');
  const items = r.decision?.payload?.items || [];
  const pick = urls == null ? items.map((i) => i.url) : (Array.isArray(urls) ? urls : []).filter((u) => items.some((i) => i.url === u));
  if (!pick.length) throw refuse('no videos picked; discard the card instead', 'question');
  const { novaKernel } = await import('./novaProjects.js');
  assertWritable(novaKernel(vaultPath).getProject(r.projectId));
  const watching = pick.map((url) => ({ url, status: 'waiting', recordId: null, error: null }));
  const updated = await updateRecord(recordId, {
    status: 'filed', filedAt: new Date().toISOString(), auto: false, watching,
    destination: `Watching ${pick.length} video${pick.length === 1 ? '' : 's'} for the project, one at a time`,
  });
  (async () => {
    for (let i = 0; i < watching.length; i++) {
      try {
        const { record, done } = await deps.startWatch(vaultPath, watching[i].url, '', { project: { id: r.projectId } });
        watching[i] = { ...watching[i], status: 'watching', recordId: record.id };
        await updateRecord(recordId, { watching: [...watching] });
        await done;
        const after = await getRecord(record.id);
        watching[i] = { ...watching[i], status: after?.status === 'filed' ? 'filed' : 'error', error: after?.status === 'filed' ? null : (after?.error || 'it did not file') };
      } catch (e) {
        watching[i] = { ...watching[i], status: 'error', error: e.message };
      }
      await updateRecord(recordId, { watching: [...watching] }).catch(() => {});
    }
  })().catch(() => {});
  return updated;
}

// A failed project research re-fires in place: same record, same question.
export async function retryProjectResearch(vaultPath, record) {
  const q = String(record.text || '').replace(/^Research:\s*/, '').trim();
  if (!q || !record.projectId) throw refuse('this research record has no question to re-run', 'question');
  if (!laneEnabled('project-research')) throw laneOffError('project-research');
  const { novaKernel } = await import('./novaProjects.js');
  const p = assertWritable(novaKernel(vaultPath).getProject(record.projectId));
  const { updateRecord } = await import('./inboxStore.js');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null, panel: null });
  runProjectResearch(vaultPath, record.id, p, q, record.model || undefined);
  return updated;
}
