// TODAY ONLY (15 Oct 2026). His morning, in his words: "just ignore it for
// today. I'll just keep in mind to go lighter on my reps. Can you add that
// into the plan for today at least, but then make it go back to normal for
// the next leg session?" Nova had to answer "I can't edit just today's
// session" and offered a permanent routine swap instead. Every program change
// Coach could make was a change to the ROUTINE; nothing could touch one day.
//
// This is that one day. A Coach card ("today" action) carries the changes;
// his yes stores them here against today's date; starting that routine today
// applies them to the session (src/trainToday.js), each tagged "today only".
// The routine in the vault is never written, so the next session is his
// normal prescription by construction, not by a promise to undo something.
// A stored day that is not today reads as nothing.
//
// Operational state, so server/data: it expires at midnight and the vault
// holds the program and the logged session, which are the truth.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = () => path.join(dataRoot(), 'train-today.json');
const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function readAll() {
  try { return JSON.parse(await readFile(FILE(), 'utf8')); } catch { return null; }
}

// Today's plan, or null. Yesterday's never leaks into today.
export async function loadTrainToday(now = new Date()) {
  const s = await readAll();
  return s && !s.cleared && s.date === localDay(now) ? s : null;
}

// Replace today's plan (or clear it with null). Returns the plan it replaced
// for today, so the Inbox's undo can put exactly that back.
export async function setTrainToday(plan, now = new Date()) {
  const prior = await loadTrainToday(now);
  await mkdir(dataRoot(), { recursive: true });
  const next = plan ? { ...plan, date: localDay(now), setAt: now.toISOString() } : { date: localDay(now), cleared: true };
  const tmp = `${FILE()}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2));
  await rename(tmp, FILE());
  return prior;
}

// The words on the card and in the receipt: what changes, in his units.
export function changePhrase(c) {
  const reps = c.targetRepsLow && c.targetRepsHigh && c.targetRepsLow !== c.targetRepsHigh
    ? `${c.targetRepsLow}–${c.targetRepsHigh}` : (c.targetRepsLow || c.targetRepsHigh || null);
  const dose = [c.weightKg ? `${c.weightKg} kg` : null, c.targetSets && reps ? `${c.targetSets} × ${reps}` : c.targetSets ? `${c.targetSets} sets` : reps ? `${reps} reps` : null].filter(Boolean).join(', ');
  const tail = [dose, c.note].filter(Boolean).join(', ');
  if (c.op === 'skip') return `skip ${c.name}`;
  if (c.op === 'swap') return `${c.name} → ${c.toName}${tail ? ` (${tail})` : ''}`;
  if (c.op === 'add') return `add ${c.toName}${tail ? ` (${tail})` : ''}`;
  return `${c.name}${tail ? `: ${tail}` : ''}`;
}
