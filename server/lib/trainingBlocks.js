// Training blocks — periodization made real instead of vibes.
//
// The audit: "No periodization of any kind... a 'program' is a static list."
// A block is deliberately simple state — phase, start date, length, deload
// cadence — from which the current week and the deload-week verdict are
// DERIVED, never stored (a stored week number goes stale; a derived one
// cannot). The Coach reads this every turn; the cadence engine folds the
// deload week into the morning message; the Coach can PROPOSE a new block
// when one ends (confirm-first, like everything).

import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

const REL_PATH = 'Wiki/Health/Training Block.md';
export const PHASES = ['accumulation', 'intensification', 'peak', 'deload', 'maintenance'];

const stateFile = createVaultStateFile({
  relPath: REL_PATH,
  parse(raw) {
    const d = matter(raw).data || {};
    return d.startedAt ? {
      phase: PHASES.includes(d.phase) ? d.phase : 'accumulation',
      startedAt: d.startedAt,
      lengthWeeks: Number(d.lengthWeeks) >= 1 && Number(d.lengthWeeks) <= 16 ? Number(d.lengthWeeks) : 4,
      deloadLastWeek: d.deloadLastWeek !== false, // default: the block ends in a deload week
      note: String(d.note || ''),
    } : null;
  },
  empty: () => null,
});

const withLock = createWriteLock();

export async function getBlock(vaultPath) {
  const b = await stateFile.load(vaultPath);
  if (!b) return null;
  const start = new Date(`${b.startedAt}T12:00:00`);
  const week = Math.floor((Date.now() - start.getTime()) / (7 * 86400000)) + 1;
  const ended = week > b.lengthWeeks;
  const isDeloadWeek = !ended && (b.phase === 'deload' || (b.deloadLastWeek && week === b.lengthWeeks));
  return { ...b, week: Math.max(1, week), ended, isDeloadWeek };
}

export async function setBlock(vaultPath, { phase, startedAt, lengthWeeks, deloadLastWeek, note }) {
  if (!PHASES.includes(phase)) throw new Error(`phase must be one of ${PHASES.join(', ')}`);
  const started = /^\d{4}-\d{2}-\d{2}$/.test(String(startedAt || '')) ? startedAt : new Date().toISOString().slice(0, 10);
  const len = Number(lengthWeeks) >= 1 && Number(lengthWeeks) <= 16 ? Number(lengthWeeks) : 4;
  const state = { phase, startedAt: started, lengthWeeks: len, deloadLastWeek: deloadLastWeek !== false, note: String(note || '').slice(0, 300) };
  return withLock(async () => {
    const body = ['# Training Block', '',
      `**${phase}** — ${len} weeks from ${started}${state.deloadLastWeek ? ', final week deload' : ''}.`,
      state.note ? `\n> ${state.note}` : '', ''].join('\n');
    await stateFile.write(vaultPath, matter.stringify(body, { type: 'training-block', ...state }), state);
    return getBlock(vaultPath);
  });
}

export async function blockContext(vaultPath) {
  const b = await getBlock(vaultPath).catch(() => null);
  if (!b) return 'NO TRAINING BLOCK SET — his program has no periodization structure. When programming comes up, explain the value and PROPOSE {"action":"block",...} to start one.';
  if (b.ended) return `TRAINING BLOCK ENDED: ${b.phase} block (${b.lengthWeeks}w from ${b.startedAt}) is complete — week ${b.week} is past its end. Propose the next block (a fresh phase, or maintenance) rather than drifting.`;
  return `TRAINING BLOCK: ${b.phase}, week ${b.week} of ${b.lengthWeeks}${b.isDeloadWeek ? ' — THIS IS THE DELOAD WEEK: prescribe reduced loads (−10-20%) and stop sets 3-4 reps short; hold him to actually deloading, hard sessions this week defeat the block' : ''}${b.note ? ` (${b.note})` : ''}.`;
}

export const _resetBlocks = () => stateFile._reset();
