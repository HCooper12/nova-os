import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { backupFile } from './backup.js';
import { Vault } from './vault.js';
import { createRecord, updateRecord } from './inboxStore.js';

// Studio — the idea pipeline. Deterministic status moves on idea pages
// (seed → outlining → scripting → shipped) and an ON-DEMAND outline
// drafter: never scheduled, always requested, and the draft only touches
// the vault after approval on the inbox rails.

export const IDEA_STATUSES = ['seed', 'outlining', 'scripting', 'shipped'];

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';
const OUTLINE_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

async function readIdea(vaultPath, id) {
  const vault = new Vault(vaultPath);
  const page = await vault.getPage(id).catch(() => null);
  if (!page || page.type !== 'idea') throw new Error('that page is not a Studio idea');
  return page;
}

// One-tap pipeline move — a frontmatter edit, nothing more.
export async function setIdeaStatus(vaultPath, id, status) {
  if (!IDEA_STATUSES.includes(status)) throw new Error(`status must be one of: ${IDEA_STATUSES.join(', ')}`);
  const page = await readIdea(vaultPath, id);
  const full = path.join(vaultPath, page.relPath);
  if (!existsSync(full)) throw new Error('idea page not found');
  await backupFile(full);
  const { data, content } = matter(await readFile(full, 'utf8'));
  data.status = status;
  data.updated = new Date().toISOString().slice(0, 10);
  await writeFile(full, matter.stringify(content, data), 'utf8');
  import('./events.js').then(({ broadcast }) => broadcast('notes')).catch(() => {});
  return { id, status };
}

export function buildOutlinePrompt(page, format) {
  return `You are Nova's Studio, drafting a content outline for Hayden's idea below. Format guess: ${format || 'short'} (short = a tight vertical/short video; long = a full video; thread = a written thread).

Work from the vault: your working directory is Hayden's Obsidian vault. Read the idea page and any obviously related notes (search by the idea's key terms) — the outline should be built from HIS notes and voice, not generic content advice. Cite which vault notes you drew from at the end (or say plainly that nothing related exists yet).

Outline shape: a hook line (sharpen the existing one if you can), 3-6 beats with one concrete detail each, and a closing beat. Keep it tight and shootable — bullet points, not prose paragraphs.

The idea page (${page.relPath}):
---
${page.raw.slice(0, 4000)}
---

Output ONLY a JSON object: {"text": "the outline in markdown — hook, beats, closing, then 'Drawn from: …' listing vault notes used or 'nothing related in the vault yet'"}. No code fences, no commentary.`;
}

// The outline rides the rails exactly like research: an in-flight record
// that flips to pending with the draft — approval appends it to the page.
export async function startOutline(vaultPath, id) {
  const page = await readIdea(vaultPath, id);
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'studio',
    text: `Outline: ${page.title}`,
    source: 'studio',
    mode: 'draft',
    status: 'classifying',
    createdAt: new Date().toISOString(),
  });

  const child = spawn(CLAUDE_BIN, [
    '-p', buildOutlinePrompt(page, page.raw.match(/format:\s*(\w+)/)?.[1]),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', OUTLINE_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', async (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in outline response');
      const body = String(JSON.parse(jsonMatch[0]).text || '').trim();
      if (!body) throw new Error('empty outline');
      await updateRecord(record.id, {
        status: 'pending',
        decision: {
          route: 'idea-outline',
          confidence: 'high',
          title: `Outline — ${page.title}`,
          reason: 'Studio draft — approve to append it to the idea page.',
          payload: { relPath: page.relPath, text: body },
        },
      });
    } catch (e) {
      await updateRecord(record.id, { status: 'error', error: e.message }).catch(() => {});
    }
  });
  child.on('error', async (err) => {
    await updateRecord(record.id, { status: 'error', error: err.message }).catch(() => {});
  });

  return record;
}
