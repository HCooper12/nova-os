// THE AUDIT GATE FOR A NEW LIFT (15 Oct 2026, his standing rule: "every
// exercise added in future goes through the same meticulous audit before it
// counts").
//
// A lift that is not in the audited table (src/muscleAudit.js) and carries no
// mapping of his own is UNAUDITED: the library loader marks it
// `audit: 'pending'` and its sets credit no muscle (src/muscleCredit.js);
// every surface that counts says how many sets that left out. This files the
// question on the rails: one Inbox card per such lift, route 'exercise-audit',
// carrying a PROPOSED mapping drafted by the name-pattern suggestion engine
// and the nearest audited lift. The card says plainly that it is a
// suggestion to check, never an audit. His yes writes `primary` /
// `secondary` onto that lift in the library (his override, through the
// library's own writer) and it counts from then on; Undo puts the entry back
// exactly as it was. No model is involved anywhere here.

import { randomUUID } from 'node:crypto';
import { loadExerciseLibrary } from './exercises.js';
import { suggestMapping, isUnaudited, alsoWorksLine, NON_VOLUME } from './muscleSecondary.js';

export const AUDIT_ROUTE = 'exercise-audit';

/** The card's payload for one unaudited lift: the drafted mapping and where it came from. */
export function proposalFor(exercise) {
  const s = suggestMapping(exercise.name, exercise.filedAs ?? exercise.muscleGroup);
  const primary = s.primary || exercise.muscleGroup || null;
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    primary,
    secondary: s.primary ? s.secondary : [],
    like: s.like,
    basis: s.primary ? s.basis : 'filed',
    filedAs: exercise.filedAs ?? exercise.muscleGroup ?? null,
  };
}

/** The sentence on the card. Says it is a suggestion, says what is at stake. */
export function proposalText(p) {
  const counts = !p.primary ? 'no muscle'
    : NON_VOLUME.has(p.primary) ? `${p.primary}, which never counts as volume`
      : `${p.primary}${p.secondary.length ? `, also ${alsoWorksLine(p.secondary)}` : ''}`;
  const from = p.basis === 'name'
    ? `drafted from its name${p.like ? `, like ${p.like} in the audited table` : ''}`
    : p.basis === 'filed'
      ? `drafted from the group it was filed under${p.like ? `, like ${p.like} in the audited table` : ''}`
      : 'nothing to draft it from';
  return `${p.exerciseName} is not audited yet, so its sets count for no muscle. A suggestion to check, ${from}: ${counts}. Say yes and it counts that way from now on.`;
}

/**
 * File an audit card for each unaudited lift that has none yet. `ids` limits
 * it to those lifts (a creation site passes what it just made); without it,
 * the whole library is swept. A lift with any card already (pending, filed,
 * declined or undone) is never asked about twice: his answer stands, and a
 * declined or undone card can be reopened from the Inbox.
 */
export async function ensureAuditCards(vaultPath, { ids = null, source = 'train' } = {}) {
  const { listRecords, createRecord } = await import('./inboxStore.js');
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const want = ids ? new Set(ids) : null;
  const pending = exercises.filter((e) => isUnaudited(e) && (!want || want.has(e.id)));
  if (!pending.length) return [];
  const asked = new Set((await listRecords())
    .filter((r) => r.decision?.route === AUDIT_ROUTE)
    .map((r) => r.decision?.payload?.exerciseId));
  const filed = [];
  for (const e of pending) {
    if (asked.has(e.id)) continue;
    const payload = proposalFor(e);
    const text = proposalText(payload);
    const record = await createRecord({
      id: randomUUID().slice(0, 8),
      text,
      source,
      mode: 'review-all',
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: AUDIT_ROUTE,
        confidence: 'low', // a suggestion, by construction: never auto-filed
        title: `Audit ${e.name}: ${payload.primary || 'no muscle'}${payload.secondary.length ? ` + ${alsoWorksLine(payload.secondary)}` : ''} (suggested)`,
        reason: text,
        payload,
      },
    });
    filed.push(record);
  }
  return filed;
}

/** fileDecision's half: his yes writes the mapping onto the lift. */
export async function applyAudit(vaultPath, payload) {
  const { setExerciseAudit } = await import('./exercises.js');
  if (!payload?.exerciseId || !payload?.primary) throw new Error('this audit card has no mapping to apply');
  const { exercise, prior } = await setExerciseAudit(vaultPath, payload.exerciseId, { primary: payload.primary, secondary: payload.secondary || [] });
  return {
    destination: `Exercise library — ${exercise.name} audited: ${exercise.muscleGroup}${exercise.secondary.length ? `, also ${alsoWorksLine(exercise.secondary)}` : ''}; its sets count from now on`,
    undo: { route: AUDIT_ROUTE, exerciseId: payload.exerciseId, exerciseName: exercise.name, prior },
  };
}

/** undoFiling's half: the entry back exactly as it was, unaudited again. */
export async function undoAudit(vaultPath, undo) {
  const { restoreExerciseRecords } = await import('./exercises.js');
  await restoreExerciseRecords(vaultPath, { priors: { [undo.exerciseId]: undo.prior } });
  return `${undo.exerciseName || undo.exerciseId} is unaudited again; its sets count for no muscle until you approve a mapping`;
}
