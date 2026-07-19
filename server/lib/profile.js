import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

// Hayden's operating profile — the ROOT context every model-based agent
// reasons from (per NOVA-METHOD.md's context ledger: "who Hayden is" is the
// highest-leverage missing context). It's a vault page he owns and can edit
// in Obsidian; Nova reads it into the top of every conversation so answers
// point at what he's actually working toward, not just his data.

const PROFILE_REL = 'Wiki/Profile.md';

export async function getProfile(vaultPath) {
  const full = path.join(vaultPath, PROFILE_REL);
  if (!existsSync(full)) return null;
  try {
    const { data, content } = matter(await readFile(full, 'utf8'));
    return {
      focus: String(data.focus || '').trim(),
      priorities: Array.isArray(data.priorities) ? data.priorities.map((p) => String(p).trim()).filter(Boolean) : [],
      bestSelf: String(data.bestSelf || '').trim(),
      notes: content.replace(/^#[^\n]*\n?/, '').trim(),
      updated: data.updated || null,
    };
  } catch {
    return null;
  }
}

export async function setProfile(vaultPath, input) {
  const focus = String(input.focus || '').trim().slice(0, 400);
  const priorities = (Array.isArray(input.priorities) ? input.priorities : String(input.priorities || '').split('\n'))
    .map((p) => String(p).trim()).filter(Boolean).slice(0, 8).map((p) => p.slice(0, 200));
  const bestSelf = String(input.bestSelf || '').trim().slice(0, 600);
  const notes = String(input.notes || '').trim().slice(0, 4000);
  if (!focus && !priorities.length && !bestSelf && !notes) {
    throw new Error('add something to save — a focus line, a priority, anything');
  }

  const full = path.join(vaultPath, PROFILE_REL);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  const frontmatter = { type: 'profile', focus, bestSelf, updated: new Date().toISOString().slice(0, 10) };
  if (priorities.length) frontmatter.priorities = priorities;
  await writeFile(full, matter.stringify(`# Profile\n\n${notes}\n`, frontmatter), 'utf8');
  return getProfile(vaultPath);
}

// Compact block for the top of agent prompts. When empty, it tells the agent
// to reason honestly without it AND to nudge Hayden — an unset profile is a
// gap the lens should surface, not paper over.
export async function profileContext(vaultPath) {
  const p = await getProfile(vaultPath);
  if (!p || (!p.focus && !p.priorities.length && !p.bestSelf && !p.notes)) {
    return 'ABOUT HAYDEN: no profile set yet. Reason from his data as usual, and if knowing his broader goals or priorities would let you answer better, say so and point him to "About You" in Settings.';
  }
  return [
    'ABOUT HAYDEN (his own words — reason toward this, not just the literal question):',
    p.focus ? `- Current focus: ${p.focus}` : null,
    p.priorities.length ? `- Priorities right now: ${p.priorities.join('; ')}` : null,
    p.bestSelf ? `- What performing at his best means to him: ${p.bestSelf}` : null,
    p.notes ? `- Context & constraints: ${p.notes}` : null,
  ].filter(Boolean).join('\n');
}
