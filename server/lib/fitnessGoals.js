import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { localDateISO } from './localDate.js';
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
      // measurable targets — [{id, metric, value, unit, by, note, setAt, done?}]
      targets: Array.isArray(data.targets) ? data.targets : [],
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
  if (!Array.isArray(input.targets)) {
    // a settings-form save must never wipe targets it didn't touch
    const existing = await getFitnessGoals(vaultPath).catch(() => null);
    if (existing?.targets?.length) input = { ...input, targets: existing.targets };
  }
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  const updated = localDateISO();
  const frontmatter = { type: 'fitness-goals', goal, focus, updated };
  if (daysPerWeek) frontmatter.daysPerWeek = daysPerWeek;
  if (equipment) frontmatter.equipment = equipment;
  if (limitations) frontmatter.limitations = limitations;
  if (Array.isArray(input.targets) && input.targets.length) frontmatter.targets = input.targets;
  await writeFile(full, matter.stringify(`# Fitness Goals\n\n${notes}\n`, frontmatter), 'utf8');
  return getFitnessGoals(vaultPath);
}

// Add one measurable target (the Coach's 'goal' proposal lands here on
// approval). Undo removes by id.
export async function addGoalTarget(vaultPath, { metric, value, unit, by, note }) {
  const g = (await getFitnessGoals(vaultPath)) || { goal: 'Training goals', focus: '', daysPerWeek: null, equipment: '', limitations: '', notes: '', targets: [] };
  const target = {
    id: Math.random().toString(36).slice(2, 10),
    metric: String(metric || '').trim().slice(0, 60),
    value: Number(value),
    unit: String(unit || '').trim().slice(0, 12),
    by: by || null,
    note: String(note || '').trim().slice(0, 200),
    setAt: localDateISO(),
  };
  await setFitnessGoals(vaultPath, { ...g, targets: [...(g.targets || []), target] });
  return target;
}

export async function removeGoalTarget(vaultPath, id) {
  const g = await getFitnessGoals(vaultPath);
  if (!g) throw new Error('no goals page');
  await setFitnessGoals(vaultPath, { ...g, targets: (g.targets || []).filter((t) => t.id !== id) });
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
    g.targets?.length ? `MEASURABLE TARGETS (coach toward these; say when one is reached or drifting): ${g.targets.map((t) => `${t.metric} → ${t.value}${t.unit || ''}${t.by ? ` by ${t.by}` : ''} (set ${t.setAt})`).join('; ')}` : 'No measurable targets set — propose one when a goal conversation happens (PROPOSE {"action":"goal",...}).',
    g.notes ? `Notes: ${g.notes}` : null,
  ].filter(Boolean).join('\n');
}
