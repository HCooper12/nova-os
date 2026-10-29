// THE PROJECT, HANDED TO NOVA (Projects phase 1, T7; PROJECTS-PLAN §3, §4, Q37).
//
// "One Nova, with the project's context attached." A turn on a project page
// rides the ordinary Ask Nova path with a `projectId`; this builds the PROJECT
// section code appends to that turn's context. The model never reads the
// vault for it: every word below was read by code, from the kernel record,
// the project's own folder, and the pages its brief names in `reads` (each
// one contained under the vault and capped). A page that cannot be read is
// NAMED, never silently dropped (contextSections.ABSENT_NOTE).
//
// A linked project (Nova, Science Atlas, Wren) gets the same section with its
// git log in place of the brief and the log, and no reads.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ABSENT_NOTE } from './contextSections.js';

export const CAPS = { brief: 4000, logLines: 20, page: 3000, pages: 12000 };

const cap = (s, n) => (s.length > n ? `${s.slice(0, n)}\n[…cut at ${n} characters]` : s);

// a reads entry → a contained absolute path, or null
function vaultPathFor(vaultPath, rel) {
  if (!vaultPath || typeof rel !== 'string') return null;
  const root = path.resolve(vaultPath);
  const withExt = /\.md$/i.test(rel) ? rel : `${rel}.md`;
  const full = path.resolve(root, withExt);
  return full.startsWith(root + path.sep) ? full : null;
}

/**
 * PURE over its inputs: { project, brief, log, pages:[{rel, text|null}], commits }
 * → the section text. Exported for the test.
 */
export function renderProjectSection({ project, brief = '', log = '', pages = [], commits = [] }, caps = CAPS) {
  const p = project;
  const lines = [
    `PROJECT — ${p.name} (this conversation is about this project: answer for it, from what is below; he is on its page in Nova).`,
    `Kind ${p.kind} · stage ${p.stage}${p.linked ? ' · LINKED: Nova only reads about it and never writes to it' : ''}${p.dryRun ? ' · dry run (nothing it does is real yet)' : ''}.`,
  ];
  if (p.linked) {
    lines.push('', 'RECENT COMMITS (git log, newest first):', ...(commits.length ? commits.map((c) => `- ${String(c.at || '').slice(0, 10)} ${c.subject}`) : ['- (none readable)']));
    return lines.join('\n');
  }
  if (p.goal) lines.push(`Goal: ${p.goal}`);
  const phases = p.phases || [];
  lines.push('', 'PHASES:', ...(phases.length ? phases.map((ph, i) => `${i + 1}. [${ph.done ? 'x' : ' '}] ${ph.name}${ph.what ? ` — ${ph.what}` : ''}`) : ['(none named)']));
  if (brief) lines.push('', 'THE BRIEF (BRIEF.md):', cap(brief.trim(), caps.brief));
  const logLines = String(log).split('\n').filter((l) => l.startsWith('- ')).slice(-caps.logLines);
  lines.push('', `THE LOG (last ${logLines.length} lines of LOG.md, written by code):`, ...(logLines.length ? logLines : ['(empty)']));
  const failed = [];
  let budget = caps.pages;
  for (const pg of pages) {
    if (pg.text == null) { failed.push({ label: `the project's page ${pg.rel}` }); continue; }
    if (budget <= 0) { lines.push('', `PAGE ${pg.rel}: [left out — the pages budget of ${caps.pages} characters is spent]`); continue; }
    const body = cap(pg.text.trim(), Math.min(caps.page, budget));
    budget -= body.length;
    lines.push('', `PAGE ${pg.rel} (one of the pages this project may read):`, body);
  }
  if (failed.length) lines.push('', ABSENT_NOTE(failed));
  return lines.join('\n');
}

/**
 * Reads everything for one project and renders it. '' when there is no such
 * project (a stale id is not an error worth a turn).
 */
export async function projectContextSection(vaultPath, projectId, { repoRoot, kernel, linked } = {}) {
  const { LINKED_IDS, linkedProject, gitLog } = await import('./projectLinks.js');
  if (LINKED_IDS.includes(projectId)) {
    const p = linked || await linkedProject(projectId, { repoRoot });
    if (!p) return '';
    return renderProjectSection({ project: p, commits: await gitLog(p.linked.path) });
  }
  const k = kernel || (await import('./novaProjects.js')).novaKernel(vaultPath);
  const p = k.getProject(projectId);
  if (!p || p.status === 'undone') return '';
  const brief = await readFile(path.join(p.folder, 'BRIEF.md'), 'utf8').catch(() => '');
  const log = k.readLog(p);
  const pages = await Promise.all((p.reads || []).map(async (rel) => {
    const full = vaultPathFor(vaultPath, rel);
    const text = full ? await readFile(full, 'utf8').catch(() => null) : null;
    return { rel, text };
  }));
  return renderProjectSection({ project: p, brief, log, pages });
}
