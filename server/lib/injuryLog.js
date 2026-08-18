// The injury & limitation log — the page a real coach checks before every
// prescription. The audit found the one field that could hold this
// (Fitness Goals → limitations) blank in the live vault, no pain capture
// anywhere, and the Coach programming with zero knowledge of what hurts.
//
// Vault page (source of truth): Wiki/Health/Injury Log.md — frontmatter
// list, human-readable body regenerated on write. Active entries ride into
// EVERY coach context; resolved ones stay as history.

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

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
    { type: 'injury-log', updated: new Date().toISOString().slice(0, 10), injuries: state.injuries },
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
    startedAt: new Date().toISOString().slice(0, 10),
  };
  if (!clean.area) throw new Error('the affected area is required');
  await mutate(vaultPath, (state) => { state.injuries.push(clean); });
  return clean;
}

export async function resolveInjury(vaultPath, id) {
  return mutate(vaultPath, (state) => {
    const inj = state.injuries.find((i) => i.id === id);
    if (!inj) throw new Error('no such injury entry');
    inj.resolvedAt = new Date().toISOString().slice(0, 10);
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

// The context block: active entries loud, recent resolutions one line.
export async function injuriesContext(vaultPath) {
  const injuries = await listInjuries(vaultPath).catch(() => []);
  const active = injuries.filter((i) => !i.resolvedAt);
  if (!active.length) return null;
  return `ACTIVE INJURIES / LIMITATIONS (program around these — never prescribe into pain, and say when a swap is because of one):\n${active
    .map((i) => `- ${i.area} (${i.severity}, since ${i.startedAt}): ${i.note}`)
    .join('\n')}`;
}

export const _injuryFileRelPath = REL_PATH;
