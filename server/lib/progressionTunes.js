import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

// Per-exercise progression tuning — how coaching FEEDBACK becomes durable
// behaviour. "That +2.5kg jump on overhead press is too much" is only worth
// saying once; from then on the deterministic progression engine must act on
// it. A vault page (source of truth, like Fitness Goals) holds one entry per
// tuned exercise: a smaller/larger weight step, a different rep step, or a
// hold (no progressions proposed until he lifts it). The Coach PROPOSES a
// tune in chat; approval on the rails is what writes it; computeProgressions
// reads it on every run. Models decide, code acts.

const TUNES_REL = 'Wiki/Health/Progression Tuning.md';

function normalizeTune(raw) {
  const t = {
    exerciseId: String(raw?.exerciseId || '').trim(),
    name: String(raw?.name || '').trim().slice(0, 80),
    stepKg: Number.isFinite(Number(raw?.stepKg)) && Number(raw.stepKg) > 0 && Number(raw.stepKg) <= 20 ? Number(raw.stepKg) : null,
    repStep: Number.isInteger(Number(raw?.repStep)) && Number(raw.repStep) >= 1 && Number(raw.repStep) <= 5 ? Number(raw.repStep) : null,
    hold: raw?.hold === true,
    // a qualitative prescription — "3s eccentric, same load", "pause at the
    // bottom" — for lifts where the next step isn't more kilograms
    focus: String(raw?.focus || '').trim().slice(0, 120),
    note: String(raw?.note || '').trim().slice(0, 200),
    updated: typeof raw?.updated === 'string' ? raw.updated : new Date().toISOString().slice(0, 10),
  };
  if (!t.exerciseId || !t.name) return null;
  if (t.stepKg == null && t.repStep == null && !t.hold && !t.focus) return null; // tunes nothing
  return t;
}

export async function getTunes(vaultPath) {
  const full = path.join(vaultPath, TUNES_REL);
  if (!existsSync(full)) return [];
  try {
    const { data } = matter(await readFile(full, 'utf8'));
    return (Array.isArray(data.tunes) ? data.tunes : []).map(normalizeTune).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeTunes(vaultPath, tunes) {
  const full = path.join(vaultPath, TUNES_REL);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  const lines = tunes.length
    ? tunes.map((t) => {
        const bits = [];
        if (t.hold) bits.push('progressions ON HOLD');
        if (t.stepKg != null) bits.push(`weight step ${t.stepKg}kg`);
        if (t.repStep != null) bits.push(`rep step +${t.repStep}`);
        if (t.focus) bits.push(`focus: ${t.focus}`);
        return `- **${t.name}** — ${bits.join(', ')}${t.note ? ` — ${t.note}` : ''} *(${t.updated})*`;
      })
    : ['*No tuned exercises — the defaults (+2.5kg / +1 rep on double progression) apply everywhere.*'];
  const body = `# Progression Tuning\n\nHow the Coach's progression engine is tuned to Hayden's feedback.\nEdited through the Coach chat (proposed → approved), read on every progression pass.\n\n${lines.join('\n')}\n`;
  await writeFile(full, matter.stringify(body, { type: 'progression-tuning', tunes }), 'utf8');
}

// Upsert one exercise's tune. Returns { prior } — exactly what undo needs.
export async function setTune(vaultPath, raw) {
  const tune = normalizeTune(raw);
  if (!tune) throw new Error('a tune needs an exercise and at least one of stepKg, repStep, or hold');
  const tunes = await getTunes(vaultPath);
  const prior = tunes.find((t) => t.exerciseId === tune.exerciseId) || null;
  const next = [...tunes.filter((t) => t.exerciseId !== tune.exerciseId), tune]
    .sort((a, b) => a.name.localeCompare(b.name));
  await writeTunes(vaultPath, next);
  return { tune, prior };
}

// Remove a tune (or restore a prior one — undo's path).
export async function clearTune(vaultPath, exerciseId, { restore = null } = {}) {
  const tunes = await getTunes(vaultPath);
  const next = tunes.filter((t) => t.exerciseId !== exerciseId);
  if (restore) {
    const r = normalizeTune(restore);
    if (r) next.push(r);
  }
  await writeTunes(vaultPath, next.sort((a, b) => a.name.localeCompare(b.name)));
}

export function tuneFor(tunes, exerciseId) {
  return (tunes || []).find((t) => t.exerciseId === exerciseId) || null;
}

// Context block for the Coach's prompts — his standing feedback, visible so
// the Coach never re-recommends what he has already corrected.
export async function tunesContext(vaultPath) {
  const tunes = await getTunes(vaultPath);
  if (!tunes.length) return '';
  const bits = tunes.map((t) => {
    const parts = [];
    if (t.hold) parts.push('progressions on hold');
    if (t.stepKg != null) parts.push(`weight step ${t.stepKg}kg (not the default 2.5)`);
    if (t.repStep != null) parts.push(`rep step +${t.repStep}`);
    if (t.focus) parts.push(`current focus: ${t.focus}`);
    return `${t.name}: ${parts.join(', ')}${t.note ? ` — because: ${t.note}` : ''}`;
  });
  return `HIS STANDING PROGRESSION FEEDBACK (already applied to the engine — respect it, never re-suggest what it corrects):\n- ${bits.join('\n- ')}`;
}
