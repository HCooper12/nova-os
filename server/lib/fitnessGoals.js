import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

// Hayden's fitness goals — a vault page (source of truth, editable in
// Obsidian or the Train screen) that the Coach reads for every judgement:
// chat answers, progression phrasing, dispatch lines, meal-prep context.
// Structured fields for the machine, free notes for the human.

const GOALS_REL = 'Wiki/Health/Fitness Goals.md';

export async function getFitnessGoals(vaultPath) {
  const full = path.join(vaultPath, GOALS_REL);
  if (!existsSync(full)) return null;
  try {
    const { data, content } = matter(await readFile(full, 'utf8'));
    return {
      goal: String(data.goal || '').trim(),
      focus: String(data.focus || '').trim(),
      daysPerWeek: Number.isInteger(data.daysPerWeek) ? data.daysPerWeek : null,
      // the coach-context fields the sweep's ledger called for
      equipment: String(data.equipment || '').trim(),
      limitations: String(data.limitations || '').trim(),
      notes: content.replace(/^#[^\n]*\n?/, '').trim(),
      updated: data.updated || null,
    };
  } catch {
    return null;
  }
}

export async function setFitnessGoals(vaultPath, input) {
  const goal = String(input.goal || '').trim().slice(0, 200);
  const focus = String(input.focus || '').trim().slice(0, 300);
  const daysPerWeek = Number.isInteger(Number(input.daysPerWeek)) && Number(input.daysPerWeek) >= 1 && Number(input.daysPerWeek) <= 7
    ? Number(input.daysPerWeek) : null;
  const notes = String(input.notes || '').trim().slice(0, 4000);
  const equipment = String(input.equipment || '').trim().slice(0, 300);
  const limitations = String(input.limitations || '').trim().slice(0, 300);
  if (!goal) throw new Error('a goal is required — one sentence is enough');

  const full = path.join(vaultPath, GOALS_REL);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  const updated = new Date().toISOString().slice(0, 10);
  const frontmatter = { type: 'fitness-goals', goal, focus, updated };
  if (daysPerWeek) frontmatter.daysPerWeek = daysPerWeek;
  if (equipment) frontmatter.equipment = equipment;
  if (limitations) frontmatter.limitations = limitations;
  await writeFile(full, matter.stringify(`# Fitness Goals\n\n${notes}\n`, frontmatter), 'utf8');
  return getFitnessGoals(vaultPath);
}

// Compact context block for the Coach's prompts.
export async function goalsContext(vaultPath) {
  const g = await getFitnessGoals(vaultPath);
  if (!g) return 'No fitness goals recorded yet (the Train screen has a GOALS card to set them).';
  return [
    `Goal: ${g.goal}`,
    g.focus ? `Focus: ${g.focus}` : null,
    g.daysPerWeek ? `Training days/week: ${g.daysPerWeek}` : null,
    g.equipment ? `Equipment available: ${g.equipment}` : null,
    g.limitations ? `Injuries / limitations (work around these): ${g.limitations}` : null,
    g.notes ? `Notes: ${g.notes}` : null,
  ].filter(Boolean).join('\n');
}
