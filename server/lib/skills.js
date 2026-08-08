import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// The skill registry — the map the agents answer from when Hayden asks
// "what can you actually do?". A REAL vault page (his to edit), seeded with
// only what is verifiably built, each skill carrying its autonomy level:
//   observe — reads and reports, writes nothing
//   propose — drafts a pending record; his yes files it
//   act-on-approval — applies a change deterministically once approved
// Format contract (change every reader/writer or none):
//   ## Department
//   - <skill> `(autonomy)`

export const SKILLS_REL = 'Wiki/Library/Nova Skills.md';
const ITEM_RE = /^- (.+?) `\((observe|propose|act-on-approval)\)`\s*$/;

// Seeded from what is actually shipped — nothing aspirational lives here;
// the backlog belongs in design/AGENT-SKILL-MAP.md until it is built.
const SEED = `# Nova Skills

What Nova can actually do today, by life department — each with its
autonomy level: observe (reads, reports), propose (drafts for your yes),
act-on-approval (applies once approved). Every agent reads this page, so
keep it truthful; Nova would rather say "not yet" than pretend.

## Train
- Log workout sessions with honest set receipts \`(act-on-approval)\`
- Propose program edits — swap/add/remove/retarget exercises \`(propose)\`
- Watch for program drift and missed sessions \`(observe)\`
- Annotate the week plan with pushed/carried-over work \`(observe)\`
- Estimate e1RM trends from real sets \`(observe)\`

## Fuel
- Track the daily rotation with today-only variants \`(act-on-approval)\`
- Log food by text, barcode, or photo \`(act-on-approval)\`
- Propose meal-prep plans \`(propose)\`
- Suggest recipes from logged foods \`(propose)\`
- Watch protein floor adherence and say the hard thing \`(observe)\`

## Mind
- Draft the daily review from the real day \`(propose)\`
- Guide morning-brief and evening-reflection rituals \`(propose)\`
- File reflections as journal entries \`(act-on-approval)\`
- Surface a daily concept from the vault \`(observe)\`

## Money
- Import and categorise the ledger \`(act-on-approval)\`
- Detect subscriptions and expected charges \`(observe)\`
- Draft the monthly CFO report \`(propose)\`

## Knowledge
- Research with citations, now or overnight \`(propose)\`
- Put vault notes and live panels on screen mid-conversation \`(observe)\`
- Summarise and outline notes \`(propose)\`
- File captures to the right vault surface \`(act-on-approval)\`

## Logistics
- Draft calendar changes, always confirm-first \`(propose)\`
- Sync to-dos two-way with Todoist \`(act-on-approval)\`
- Compose morning and evening dispatches \`(observe)\`

## Platform
- Keep standing instructions — correct once, written down \`(act-on-approval)\`
- Guard integrity with checks, backups, and honest alerts \`(observe)\`
- Age stale inbox items via compost \`(observe)\`
- Answer from the pocket via Telegram with the same human gate \`(propose)\`
- Run queued work overnight \`(act-on-approval)\`
`;

export async function ensureSkillsFile(vaultPath) {
  const full = path.join(vaultPath, SKILLS_REL);
  if (existsSync(full)) return false;
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, SEED, 'utf8');
  return true;
}

export function parseSkills(raw) {
  const departments = [];
  let current = null;
  for (const line of (raw || '').split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { current = { name: h[1], skills: [] }; departments.push(current); continue; }
    const m = line.match(ITEM_RE);
    if (m && current) current.skills.push({ text: m[1].trim(), autonomy: m[2] });
  }
  return departments.filter((d) => d.skills.length);
}

export async function loadSkills(vaultPath) {
  await ensureSkillsFile(vaultPath);
  const raw = await readFile(path.join(vaultPath, SKILLS_REL), 'utf8');
  return parseSkills(raw);
}

/* ------------------------------- backlog --------------------------------- */
// Skills Nova COULD learn, kept on the same page under "## Backlog" — the
// 137-jobs column of the agents plan, maintained by the pattern scout via
// the rails. Backlog lines carry no autonomy tag on purpose: parseSkills'
// ITEM_RE ignores them, so an unbuilt skill can never masquerade as a
// capability in any agent's context.
const BACKLOG_HEADING = '## Backlog';
const BACKLOG_ITEM_RE = /^- (.+?) _\(proposed (\d{4}-\d{2}-\d{2})\)_\s*$/;

export function formatBacklogLine(text, date = new Date().toISOString().slice(0, 10)) {
  return `- ${text} _(proposed ${date})_`;
}

export function parseBacklog(raw) {
  const lines = (raw || '').split('\n');
  const start = lines.findIndex((l) => l.trim() === BACKLOG_HEADING);
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    const m = line.match(BACKLOG_ITEM_RE);
    if (m) items.push({ text: m[1].trim(), proposed: m[2], raw: line });
  }
  return items;
}

export async function addBacklogItem(vaultPath, text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!clean) throw new Error('a backlog skill needs words');
  await ensureSkillsFile(vaultPath);
  const full = path.join(vaultPath, SKILLS_REL);
  const raw = await readFile(full, 'utf8');
  if (parseBacklog(raw).some((i) => i.text.toLowerCase() === clean.toLowerCase())) {
    throw new Error('that skill is already on the backlog');
  }
  const { backupFile } = await import('./backup.js');
  await backupFile(full);
  const line = formatBacklogLine(clean);
  const next = raw.includes(BACKLOG_HEADING)
    ? raw.replace(BACKLOG_HEADING, `${BACKLOG_HEADING}\n${line}`)
    : `${raw.replace(/\s*$/, '\n')}\n${BACKLOG_HEADING}\n\nSkills Nova could learn next — noticed from real usage, not yet built.\n${line}\n`;
  await writeFile(full, next, 'utf8');
  return { line };
}

export async function removeBacklogItem(vaultPath, line) {
  const full = path.join(vaultPath, SKILLS_REL);
  if (!existsSync(full)) return false;
  const raw = await readFile(full, 'utf8');
  if (!raw.includes(line)) return false;
  const { backupFile } = await import('./backup.js');
  await backupFile(full);
  await writeFile(full, raw.split('\n').filter((l) => l !== line).join('\n'), 'utf8');
  return true;
}

// Compact block for the agents' contexts — so "what can you do?" gets a
// truthful, current answer instead of a guess.
export async function skillsContext(vaultPath) {
  const departments = await loadSkills(vaultPath);
  if (!departments.length) return '';
  const lines = departments.map((d) => `${d.name}: ${d.skills.map((s) => `${s.text} [${s.autonomy}]`).join('; ')}`);
  return `WHAT NOVA CAN DO TODAY (the skill registry — answer capability questions from THIS, and say plainly when something isn't on it yet):\n${lines.join('\n')}`;
}
