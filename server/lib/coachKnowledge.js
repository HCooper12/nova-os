// The Coach's own library — item 1 of the expertise plan (his ask, 19 Aug):
// "genuine expertise... performs intelligently on its own."
//
// Two vault pages, different natures:
//   Coaching Principles — evidence-based doctrine, mostly stable. Seeded
//     once with the consensus fundamentals; he can edit it like any note,
//     and the Coach may PROPOSE amendments when strong evidence warrants.
//   What Works For Hayden — the page that makes it HIS coach, not a
//     textbook: observed responses, standing aversions, nutrition patterns,
//     dated. Written ONLY through the rails — the Coach proposes a 'learn',
//     he approves, the line lands. A coach's private client file, kept
//     where he can read every word of it.
//
// Both ride the Coach's context every conversation. Deterministic code
// reads/writes; the model only reasons and proposes.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PRINCIPLES_REL = 'Wiki/Health/Coaching Principles.md';
export const PLAYBOOK_REL = 'Wiki/Health/What Works For Hayden.md'; // exported: the reflection dedupes against the same page
const CONTEXT_BUDGET = 2600; // chars per page in the prompt — enough to matter, never a flood

export const LEARN_KINDS = ['works', 'avoid', 'nutrition', 'decision'];
const KIND_HEADING = {
  works: '## Responds to',
  avoid: '## Avoid / does not land',
  nutrition: '## Nutrition patterns',
  decision: '## Decisions log',
};

const PRINCIPLES_SEED = `# Coaching Principles

Evidence-based doctrine the Coach reasons from. Edit freely — this page is
yours. The Coach may propose amendments when strong evidence warrants, via
the normal approval rails.

## Hypertrophy
- Volume drives growth: ~10–20 hard sets per muscle per week for most
  intermediates; start low in that range, add only when progress stalls.
- Proximity to failure matters more than the exact number: most working
  sets at 0–3 RIR; occasional sets to failure on isolation work, sparingly
  on heavy compounds.
- Rep ranges are flexible (~5–30 can build muscle) IF effort is matched —
  pick ranges by joint comfort and load progression practicality.
- Progressive overload is the non-negotiable: more load, reps, or better
  execution over time. A lift repping far past its target range needs a
  changed prescription (load, variation), not more reps forever.
- Exercise selection: stable core movements measured over months beat
  constant novelty; rotate accessories when joints or motivation demand.

## Recovery
- Sleep is the biggest recovery lever: 7–9 h; chronic <6 h measurably
  cuts strength and muscle-retention during fat loss.
- Deload deliberately (every 4–8 weeks of hard training, or when HRV,
  sleep, and RPE trends all point the same direction) — lighter loads,
  same movements, stop 3–4 reps short.
- Pain rules: sharp or joint pain → stop the movement, substitute, log
  it. Muscle-burn discomfort is normal; pain that changes movement is not.

## Fat loss with muscle retention (recomp)
- Protein 1.6–2.2 g/kg/day, spread over 3–5 feedings; the floor exists
  because it's the retention lever while calories are down.
- Deficit sized modestly (~300–500 kcal) — bigger cuts trade muscle.
- Training days deserve the calories most: fuel the work, cut on rest
  days first when a weekly deficit is needed.
- Weight trend beats any single weigh-in; judge on 2–4 week trends.

## Practice
- Every recommendation cites its evidence from HIS data when it exists.
- Change one variable at a time where possible; note what was changed so
  the outcome is attributable.
- Mobility is programmed, not suggested: specific movements, on the card,
  tracked like everything else.
`;

const PLAYBOOK_SEED = `# What Works For Hayden

The Coach's client file — observed responses, standing aversions, and
dated decisions. Entries land here ONLY via approved Coach proposals
("remember this about him"), so every line was signed off. Prune freely;
this page is read into every Coach conversation.

## Responds to

## Avoid / does not land

## Nutrition patterns

## Decisions log
`;

async function ensurePage(vaultPath, rel, seed) {
  const full = path.join(vaultPath, rel);
  if (existsSync(full)) return;
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, seed, 'utf8');
}

export async function ensureSeeded(vaultPath) {
  await ensurePage(vaultPath, PRINCIPLES_REL, PRINCIPLES_SEED);
  await ensurePage(vaultPath, PLAYBOOK_REL, PLAYBOOK_SEED);
}

const clip = (s) => {
  const t = s.trim();
  return t.length <= CONTEXT_BUDGET ? t : t.slice(0, CONTEXT_BUDGET) + '\n…(page continues — cite only what you can see)';
};

export async function knowledgeContext(vaultPath) {
  await ensureSeeded(vaultPath).catch(() => {});
  const parts = [];
  try {
    parts.push(`YOUR COACHING PRINCIPLES (his vault page — doctrine you reason from; propose amendments only on strong evidence):\n${clip(await readFile(path.join(vaultPath, PRINCIPLES_REL), 'utf8'))}`);
  } catch { parts.push('YOUR COACHING PRINCIPLES page is unreadable right now — reason from consensus fundamentals and say so if it matters.'); }
  try {
    parts.push(`WHAT WORKS FOR HAYDEN (his client file — every line was approved by him; NEVER contradict it silently, and when you observe something durable about his response to training or food, PROPOSE a learn so it lands here):\n${clip(await readFile(path.join(vaultPath, PLAYBOOK_REL), 'utf8'))}`);
  } catch { parts.push('WHAT WORKS FOR HAYDEN page is unreadable right now.'); }
  return parts.join('\n\n');
}

// Append one approved learning under its section heading. Returns the exact
// line written so undo can remove precisely it.
export async function appendLearning(vaultPath, { insight, kind }) {
  await ensureSeeded(vaultPath);
  const k = LEARN_KINDS.includes(kind) ? kind : 'works';
  const full = path.join(vaultPath, PLAYBOOK_REL);
  const raw = await readFile(full, 'utf8');
  const line = `- ${new Date().toISOString().slice(0, 10)} — ${String(insight).trim()}`;
  const heading = KIND_HEADING[k];
  const idx = raw.indexOf(heading);
  let next;
  if (idx === -1) {
    next = raw.trimEnd() + `\n\n${heading}\n${line}\n`;
  } else {
    const insertAt = idx + heading.length;
    next = raw.slice(0, insertAt) + `\n${line}` + raw.slice(insertAt);
  }
  await writeFile(full, next, 'utf8');
  return { line, kind: k };
}

export async function removeLearning(vaultPath, line) {
  const full = path.join(vaultPath, PLAYBOOK_REL);
  const raw = await readFile(full, 'utf8');
  const next = raw.split('\n').filter((l) => l !== line).join('\n');
  if (next === raw) return { removed: false };
  await writeFile(full, next, 'utf8');
  return { removed: true };
}
