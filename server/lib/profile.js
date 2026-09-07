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
      intake: data.intake && typeof data.intake === 'object' ? data.intake : null,
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
  // the Intake's numbers live on this page too — never dropped by a prose edit
  const prior = await getProfile(vaultPath);
  if (prior?.intake) frontmatter.intake = prior.intake;
  await writeFile(full, matter.stringify(`# Profile\n\n${notes}\n`, frontmatter), 'utf8');
  return getProfile(vaultPath);
}

// THE INTAKE's facts and derived numbers (lib/intake.js), kept beside his
// words on the same page. Everything else on the page is preserved; the
// prior block comes back so the inbox can undo the write.
export async function setIntake(vaultPath, intake) {
  const full = path.join(vaultPath, PROFILE_REL);
  const prior = await getProfile(vaultPath);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  const frontmatter = { type: 'profile', focus: prior?.focus || '', bestSelf: prior?.bestSelf || '', updated: new Date().toISOString().slice(0, 10) };
  if (prior?.priorities?.length) frontmatter.priorities = prior.priorities;
  if (intake) frontmatter.intake = intake;
  await writeFile(full, matter.stringify(`# Profile\n\n${prior?.notes || ''}\n`, frontmatter), 'utf8');
  return { prior: prior?.intake || null, profile: await getProfile(vaultPath) };
}

export function intakeLine(intake) {
  if (!intake?.plan) return null;
  const p = intake.plan, f = intake.facts || {};
  return `- His numbers (Intake, ${intake.on || 'undated'}, code-computed from ${f.weightKg} kg / ${f.heightCm} cm / ${f.age}y, ${f.activity}, goal ${f.goal}): ${p.targetKcal} kcal, ${p.proteinG} g protein floor, ${p.fatG} g fat, ${p.carbsG} g carbs, TDEE ${p.tdee}. Treat these as HIS targets, not a suggestion.`;
}

// Compact block for the top of agent prompts. When empty, it tells the agent
// to reason honestly without it AND to nudge Hayden — an unset profile is a
// gap the lens should surface, not paper over.
export async function profileContext(vaultPath) {
  const p = await getProfile(vaultPath);
  if (!p || (!p.focus && !p.priorities.length && !p.bestSelf && !p.notes && !p.intake)) {
    return 'ABOUT HAYDEN: no profile set yet. Reason from his data as usual, and if knowing his broader goals or priorities would let you answer better, say so and point him to "About You" in Settings.';
  }
  return [
    'ABOUT HAYDEN (his own words — reason toward this, not just the literal question):',
    p.focus ? `- Current focus: ${p.focus}` : null,
    p.priorities.length ? `- Priorities right now: ${p.priorities.join('; ')}` : null,
    p.bestSelf ? `- What performing at his best means to him: ${p.bestSelf}` : null,
    p.notes ? `- Context & constraints: ${p.notes}` : null,
    intakeLine(p.intake),
  ].filter(Boolean).join('\n');
}
