// The injury & limitation log — the page a real coach checks before every
// prescription. The audit found the one field that could hold this
// (Fitness Goals → limitations) blank in the live vault, no pain capture
// anywhere, and the Coach programming with zero knowledge of what hurts.
//
// Vault page (source of truth): Wiki/Health/Injury Log.md — frontmatter
// list, human-readable body regenerated on write. Active entries ride into
// EVERY coach context; resolved ones stay as history.

import path from 'node:path';
import { localDateISO } from './localDate.js';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';
import { closedAreas } from './concernClose.js';

const REL_PATH = 'Wiki/Health/Injury Log.md';

const stateFile = createVaultStateFile({
  relPath: REL_PATH,
  parse(raw) {
    const data = matter(raw).data || {};
    return { injuries: Array.isArray(data.injuries) ? data.injuries : [] };
  },
  empty: () => ({ injuries: [] }),
});

const withLock = createWriteLock();

function serialize(state) {
  const active = state.injuries.filter((i) => !i.resolvedAt);
  const resolved = state.injuries.filter((i) => i.resolvedAt);
  const line = (i) => `- **${i.area}** (${i.severity}) — ${i.note}${i.resolvedAt ? ` · resolved ${i.resolvedAt}` : ` · since ${i.startedAt}`}`;
  return matter.stringify(
    ['# Injury Log', '', 'Managed via Nova OS — the Coach reads the active list before every answer.', '',
      '## Active', '', ...(active.length ? active.map(line) : ['_none — clear_']), '',
      '## Resolved', '', ...(resolved.length ? resolved.map(line) : ['_none yet_']), ''].join('\n'),
    { type: 'injury-log', updated: localDateISO(), injuries: state.injuries },
  );
}

async function mutate(vaultPath, fn) {
  return withLock(async () => {
    const state = { injuries: [...(await stateFile.load(vaultPath)).injuries] };
    const out = fn(state);
    await stateFile.write(vaultPath, serialize(state), state);
    return out ?? state;
  });
}

export const SEVERITIES = ['niggle', 'moderate', 'serious'];

export async function listInjuries(vaultPath) {
  return (await stateFile.load(vaultPath)).injuries;
}

export async function addInjury(vaultPath, { area, note, severity }) {
  const clean = {
    id: randomUUID().slice(0, 8),
    area: String(area || '').trim().slice(0, 60),
    note: String(note || '').trim().slice(0, 300),
    severity: SEVERITIES.includes(severity) ? severity : 'niggle',
    startedAt: localDateISO(),
  };
  if (!clean.area) throw new Error('the affected area is required');
  await mutate(vaultPath, (state) => { state.injuries.push(clean); });
  return clean;
}

export async function resolveInjury(vaultPath, id) {
  return mutate(vaultPath, (state) => {
    const inj = state.injuries.find((i) => i.id === id);
    if (!inj) throw new Error('no such injury entry');
    inj.resolvedAt = localDateISO();
  });
}

// Several at once, in one write: he closes an area, and an area can hold more
// than one entry. Returns the entries it closed, so undo reopens exactly those.
export async function resolveInjuries(vaultPath, ids) {
  const wanted = new Set(ids);
  const closed = [];
  await mutate(vaultPath, (state) => {
    for (const inj of state.injuries) {
      if (!wanted.has(inj.id) || inj.resolvedAt) continue;
      inj.resolvedAt = localDateISO();
      closed.push({ id: inj.id, area: inj.area });
    }
  });
  return closed;
}

// The undo of a closure.
export async function reopenInjuries(vaultPath, ids) {
  const wanted = new Set(ids);
  return mutate(vaultPath, (state) => {
    for (const inj of state.injuries) if (wanted.has(inj.id)) delete inj.resolvedAt;
  });
}

export async function removeInjury(vaultPath, id) {
  return mutate(vaultPath, (state) => {
    const before = state.injuries.length;
    state.injuries = state.injuries.filter((i) => i.id !== id);
    if (state.injuries.length === before) throw new Error('no such injury entry');
  });
}

export const _reset = () => stateFile._reset();

// What he has closed, for the readers that carry old text (lib/concernClose.js).
export async function closedConcerns(vaultPath, opts = {}) {
  return closedAreas(await listInjuries(vaultPath).catch(() => []), opts);
}

// The one line every agent reads about a closed area. An active entry is loud
// because it changes the prescription; a closed one is loud because three
// times he told Nova it was over and it kept asking.
export function closedLine(closed = []) {
  if (!closed.length) return null;
  return `CLOSED BY HIM (recently resolved in his Injury Log; treat these as over): ${closed.map((c) => `${c.area} (closed ${c.resolvedAt})`).join(', ')}. Do not raise them, ask about them, suggest a physio for them, or hold work back for them unless he brings them up or logs new pain there.`;
}

// The context block: active entries loud, recent resolutions one line.
export async function injuriesContext(vaultPath) {
  const injuries = await listInjuries(vaultPath).catch(() => []);
  const active = injuries.filter((i) => !i.resolvedAt);
  const parts = [];
  if (active.length) {
    parts.push(`ACTIVE INJURIES / LIMITATIONS (program around these — never prescribe into pain, and say when a swap is because of one):\n${active
      .map((i) => `- ${i.area} (${i.severity}, since ${i.startedAt}): ${i.note}`)
      .join('\n')}`);
  }
  const closed = closedLine(closedAreas(injuries));
  if (closed) parts.push(closed);
  return parts.length ? parts.join('\n\n') : null;
}

export const _injuryFileRelPath = REL_PATH;
