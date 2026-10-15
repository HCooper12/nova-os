// HIS V-TAPER, PUT TO HIM AS ONE CARD (16 Oct 2026). His words: "shoulders,
// arms and back for building a V-taper physique". His goals page still reads
// "Lean muscle gain with simultaneous fat loss" with a focus on the arms, so
// the goal muscles every surface derives from it are the arms and delts and
// not the back. Nova does not rewrite his vault on its own reading of a
// conversation: this files ONE Coach card on the usual rails (route
// 'goal-target', the goal-settings payload Coach's own goal cards use) that
// sets his goal muscles to exactly the V-taper list and his goal line to
// "Build a V-taper: shoulders, arms and back". His yes writes it; the card's
// undo puts both fields back as they were.
//
// Filed once, ever: a marker in server/data remembers it was raised (so a
// card he declines is never raised again, even after the Inbox prunes it),
// and nothing is filed when his page already says exactly this.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V_TAPER_MUSCLES } from '../../src/muscleTaxonomy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const MARKER = () => path.join(dataRoot(), 'vtaper-goal-card.json');

export const V_TAPER_GOAL_LINE = 'Build a V-taper: shoulders, arms and back';
export const V_TAPER_CARD_KEY = 'vtaper-goal-2026-10-16';
const HIS_WORDS = 'Shoulders, arms and back for building a V-taper physique.';

/** The card's payload and title, exactly as Coach's goal cards make them. */
export function vTaperProposal() {
  return {
    payload: { action: 'goal', settings: { goal: V_TAPER_GOAL_LINE, goalMuscles: [...V_TAPER_MUSCLES] }, reason: 'his words, 16 Oct 2026' },
    title: `Coach: set goal "${V_TAPER_GOAL_LINE}"; goal muscles ${V_TAPER_MUSCLES.join(', ')}`,
  };
}

const same = (a, b) => Array.isArray(a) && a.length === b.length && b.every((m) => a.includes(m));

/**
 * File the card unless it was raised before or his page already says it.
 * Returns { filed: record } or { skipped: reason }.
 */
export async function fileVTaperGoalCard(vaultPath, deps = {}) {
  const readMarker = deps.readMarker || (async () => JSON.parse(await readFile(MARKER(), 'utf8')));
  const writeMarker = deps.writeMarker || (async (m) => { await mkdir(dataRoot(), { recursive: true }); await writeFile(MARKER(), JSON.stringify(m, null, 2)); });
  const marker = await readMarker().catch(() => null);
  if (marker?.recordId) return { skipped: `raised before (${marker.recordId})` };
  const listRecords = deps.listRecords || (await import('./inboxStore.js')).listRecords;
  const prior = (await listRecords()).find((r) => r.key === V_TAPER_CARD_KEY);
  if (prior) { await writeMarker({ recordId: prior.id, at: prior.createdAt }); return { skipped: `raised before (${prior.id})` }; }
  const getFitnessGoals = deps.getFitnessGoals || (await import('./fitnessGoals.js')).getFitnessGoals;
  const g = await getFitnessGoals(vaultPath).catch(() => null);
  if (g && g.goal === V_TAPER_GOAL_LINE && same(g.goalMuscles, V_TAPER_MUSCLES)) return { skipped: 'his goals page already says this' };
  const create = deps.createCoachEditRecord || (await import('./coach.js')).createCoachEditRecord;
  const record = await create(vaultPath, {
    question: HIS_WORDS,
    proposal: { action: 'goal', reason: 'his V-taper goal, in his words' },
    validated: vTaperProposal(),
  });
  // the key rides the record so it can be found again; set after creation
  // through the store, the same way every record is changed
  const updateRecord = deps.updateRecord || (await import('./inboxStore.js')).updateRecord;
  await updateRecord(record.id, { key: V_TAPER_CARD_KEY }).catch(() => {});
  await writeMarker({ recordId: record.id, at: record.createdAt });
  return { filed: { ...record, key: V_TAPER_CARD_KEY } };
}
