import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { backupFile } from './backup.js';

// Standing instructions — "correct it once and it writes that down."
// Explicit rules Hayden has stated (through the rails, always approved by
// him), stored as a REAL vault page he can read and edit, and loaded into
// every model agent's context. Complements learning.js, which observes
// tendencies; this file holds what he has actually SAID.
//
// Format contract (change every reader/writer or none):
//   ## Standing instructions
//   - <rule> _(added YYYY-MM-DD via <source>)_

export const STANDING_REL = 'Wiki/Library/Standing Instructions.md';
const ITEM_RE = /^- (.+?)(?: _\(added (\d{4}-\d{2}-\d{2}) via ([a-z-]+)\)_)?\s*$/;

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function formatStandingRule(rule, source, date = todayISO()) {
  return `- ${rule} _(added ${date} via ${source})_`;
}

export function parseStanding(raw) {
  const rules = [];
  for (const line of (raw || '').split('\n')) {
    const m = line.match(ITEM_RE);
    if (m) rules.push({ rule: m[1].trim(), added: m[2] || null, source: m[3] || null, raw: line });
  }
  return rules;
}

export async function loadStanding(vaultPath) {
  const full = path.join(vaultPath, STANDING_REL);
  if (!existsSync(full)) return [];
  return parseStanding(await readFile(full, 'utf8'));
}

export async function addStandingRule(vaultPath, rule, source = 'voice') {
  const clean = String(rule || '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('a standing instruction needs words');
  if (clean.length > 300) throw new Error('keep a standing instruction under 300 characters');
  const full = path.join(vaultPath, STANDING_REL);
  const line = formatStandingRule(clean, source);
  if (existsSync(full)) {
    const raw = await readFile(full, 'utf8');
    const existing = parseStanding(raw);
    if (existing.some((r) => r.rule.toLowerCase() === clean.toLowerCase())) {
      throw new Error('that instruction is already written down');
    }
    await backupFile(full);
    await writeFile(full, raw.trimEnd() + '\n' + line + '\n', 'utf8');
  } else {
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, `# Standing Instructions\n\nRules Hayden has explicitly given Nova — every agent reads these.\nEach one was approved through the Inbox; edit or delete lines freely.\n\n${line}\n`, 'utf8');
  }
  return { raw: line, rule: clean };
}

export async function removeStandingRule(vaultPath, rawLine) {
  const full = path.join(vaultPath, STANDING_REL);
  if (!existsSync(full)) return false;
  const raw = await readFile(full, 'utf8');
  const lines = raw.split('\n');
  const idx = lines.indexOf(rawLine);
  if (idx === -1) return false;
  await backupFile(full);
  lines.splice(idx, 1);
  await writeFile(full, lines.join('\n'), 'utf8');
  return true;
}

// Compact block for the model agents' contexts. Empty is honest silence —
// no block at all rather than an empty header.
export async function standingContext(vaultPath) {
  const rules = await loadStanding(vaultPath);
  if (!rules.length) return '';
  return 'STANDING INSTRUCTIONS (Hayden said these explicitly — they OVERRIDE defaults and observed tendencies):\n'
    + rules.map((r) => `- ${r.rule}`).join('\n');
}
