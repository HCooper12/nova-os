import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { backupFile } from './backup.js';
import { localDateISO } from './localDate.js';

// PRACTICE — rehearsing a skill out loud, and being told how it went.
//
// His ask, 27 Sep 2026, listening to The Next Conversation: ideas on
// communication he would love to use, "but the problem is I don't have
// practice." Knowing a move is not the same as being able to do it under
// pressure, and every idea he collects about how to speak lands in the vault
// and stops there. This file is the store: one page per skill that he can
// read and edit, and the operational bookkeeping around the scenes.
//
// TWO STORES, the Repertoire's reasoning exactly:
//   - the SKILL PAGE is knowledge and lives in the vault
//     (Wiki/Practice/<Title>.md). His to edit; Nova re-reads it before every
//     scene. Its Sessions section is the record of what landed.
//   - server/data/practice.json is operational: scene transcripts with their
//     hidden notes, and per-move tallies that are DERIVED from the page's
//     Sessions section. Delete the file and nothing real is lost.
//
// Format contract (design/PRACTICE-PLAN.md — change every reader and writer,
// or none). A parse → format round-trip of any page formatPracticePage wrote
// is byte-identical, and that is pinned by test.
//
//   ---
//   type: practice
//   status: active
//   created: 'YYYY-MM-DD'
//   updated: 'YYYY-MM-DD'
//   sources:
//     - '[[Page]]'
//   ---
//   # Title
//
//   One-sentence summary.
//
//   ## Why
//   > "his words"
//
//   ## Moves
//   ### Move name
//   One line on the move.
//   - **Line:** the sentence he says
//   - **When:** the moment
//   - **Tell:** how he knows it landed
//   - **Source:** [[Page]] | his words | web: https://…
//
//   ## Scenarios
//   ### Scene name
//   The setting, one sentence.
//   - **Other person:** who
//   - **Pressure:** what they do
//   - **Moves:** Move A · Move B
//
//   ## Gaps
//   - what would make the feedback surer
//
//   ## Sessions
//   - YYYY-MM-DD · Scene name · landed: A, B · missed: C · work on: text
//
// WRITES THAT ARE NOT RE-PREPARES NEVER REGENERATE THE PAGE. A session line is
// inserted under `## Sessions` and `updated:` is bumped in place; every other
// byte he wrote stays exactly as it was (the vault writer rules: never
// normalise whitespace around sections, and a `$` in a /m regex is a line
// end, not the end of the file).

export const PRACTICE_DIR = 'Wiki/Practice';
export const STATUSES = ['active', 'paused', 'landed'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'practice.json');

export const hashOf = (raw) => createHash('sha256').update(String(raw)).digest('hex');

// One line, trimmed, whitespace collapsed — every single-line field goes
// through this on the way OUT, so what parse reads back is what format wrote.
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function slugOf(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// A title that is safe as a file name on his Mac and in Obsidian.
export function fileTitle(title) {
  return one(String(title || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ')).slice(0, 80).trim();
}

/* -------------------------------- the page -------------------------------- */

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
function unq(v) {
  const s = String(v ?? '').trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s.replace(/\s+#.*$/, '').trim(); // `status: active   # active | paused | landed`
}

const FM_RE = /^---\n([\s\S]*?)\n---(?:\n|(?![\s\S]))/;
const MOVE_FIELD = /^- \*\*(Line|When|Tell|Source):\*\*[ \t]*(.*?)\s*$/i;
const SCENE_FIELD = /^- \*\*(Other person|Pressure|Moves):\*\*[ \t]*(.*?)\s*$/i;
const SESSION_RE = /^- (\d{4}-\d{2}-\d{2}) · (.+?) · landed: (.*?) · missed: (.*?) · work on:[ \t]?(.*?)\s*$/;

const listOf = (v) => (!v || /^[—-]$/.test(v.trim()) ? [] : v.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean));

export function parseSessionLine(line) {
  const m = String(line || '').match(SESSION_RE);
  if (!m) return null;
  return { date: m[1], scenario: m[2].trim(), landed: listOf(m[3]), missed: listOf(m[4]), work: m[5].trim() };
}

export function formatSessionLine({ date, scenario, landed = [], missed = [], work = '' }) {
  const names = (a) => (a.length ? a.map(one).join(', ') : '—');
  return `- ${date} · ${one(scenario)} · landed: ${names(landed)} · missed: ${names(missed)} · work on: ${one(work)}`;
}

export function parsePracticePage(raw) {
  const text = String(raw || '');
  const skill = {
    title: '', summary: '', status: 'active', created: null, updated: null, sources: [],
    why: '', moves: [], scenarios: [], gaps: [], sessions: [], type: null,
  };
  let body = text;
  const fm = text.match(FM_RE);
  if (fm) {
    body = text.slice(fm[0].length);
    let inSources = false;
    for (const line of fm[1].split('\n')) {
      const kv = line.match(/^([A-Za-z_]+):[ \t]*(.*)$/);
      if (kv) {
        const [, key, val] = kv;
        inSources = false;
        if (key === 'sources') {
          if (val.trim() && val.trim() !== '[]') {
            // inline list: sources: ['[[A]]', '[[B]]']
            const inner = val.trim().replace(/^\[|\]$/g, '');
            skill.sources = inner.split(/,(?=\s*['"])/).map(unq).filter(Boolean);
          } else inSources = true;
        } else if (key === 'status') skill.status = unq(val) || 'active';
        else if (key === 'created') skill.created = unq(val) || null;
        else if (key === 'updated') skill.updated = unq(val) || null;
        else if (key === 'type') skill.type = unq(val) || null;
        continue;
      }
      const item = inSources && line.match(/^\s+-\s+(.*)$/);
      if (item) skill.sources.push(unq(item[1]));
    }
  }

  let section = 'head';
  let item = null;
  const why = [];
  for (const line of body.split('\n')) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) { if (!skill.title) skill.title = h1[1]; section = 'head'; item = null; continue; }
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) { section = h2[1].toLowerCase(); item = null; continue; }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      if (section === 'moves') {
        item = { name: h3[1], summary: '', line: '', when: '', tell: '', source: '' };
        skill.moves.push(item);
      } else if (section === 'scenarios') {
        item = { name: h3[1], setting: '', other: '', pressure: '', moves: [] };
        skill.scenarios.push(item);
      } else item = null;
      continue;
    }
    const trimmed = line.trim();
    if (section === 'head') {
      if (!skill.summary && skill.title && trimmed && !trimmed.startsWith('>') && !trimmed.startsWith('-')) skill.summary = trimmed;
    } else if (section === 'why') {
      const qt = line.match(/^>[ \t]?(.*)$/);
      if (qt) why.push(qt[1]);
    } else if (section === 'moves' && item) {
      const f = line.match(MOVE_FIELD);
      if (f) item[f[1].toLowerCase()] = f[2];
      else if (!item.summary && trimmed && !trimmed.startsWith('-')) item.summary = trimmed;
    } else if (section === 'scenarios' && item) {
      const f = line.match(SCENE_FIELD);
      if (f) {
        const key = f[1].toLowerCase();
        if (key === 'other person') item.other = f[2];
        else if (key === 'pressure') item.pressure = f[2];
        else item.moves = f[2].split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
      } else if (!item.setting && trimmed && !trimmed.startsWith('-')) item.setting = trimmed;
    } else if (section === 'gaps') {
      const g = line.match(/^- (.+?)\s*$/);
      if (g) skill.gaps.push(g[1]);
    } else if (section === 'sessions') {
      const s = parseSessionLine(line);
      if (s) skill.sessions.push(s);
    }
  }
  skill.why = why.join('\n');
  return skill;
}

function formatMove(m) {
  const lines = [`### ${one(m.name)}`];
  if (one(m.summary)) lines.push(one(m.summary));
  for (const [key, label] of [['line', 'Line'], ['when', 'When'], ['tell', 'Tell'], ['source', 'Source']]) {
    if (one(m[key])) lines.push(`- **${label}:** ${one(m[key])}`);
  }
  return lines.join('\n');
}

function formatScenario(s) {
  const lines = [`### ${one(s.name)}`];
  if (one(s.setting)) lines.push(one(s.setting));
  if (one(s.other)) lines.push(`- **Other person:** ${one(s.other)}`);
  if (one(s.pressure)) lines.push(`- **Pressure:** ${one(s.pressure)}`);
  const moves = (s.moves || []).map(one).filter(Boolean);
  if (moves.length) lines.push(`- **Moves:** ${moves.join(' · ')}`);
  return lines.join('\n');
}

export function formatPracticePage(skill) {
  const sources = (skill.sources || []).map(one).filter(Boolean);
  const fm = [
    '---',
    'type: practice',
    `status: ${STATUSES.includes(skill.status) ? skill.status : 'active'}`,
    `created: ${q(skill.created || localDateISO())}`,
    `updated: ${q(skill.updated || skill.created || localDateISO())}`,
    sources.length ? `sources:\n${sources.map((s) => `  - ${q(s)}`).join('\n')}` : 'sources: []',
    '---',
  ].join('\n');
  const section = (h, bodyText) => (bodyText ? `## ${h}\n${bodyText}` : `## ${h}`);
  const whyBody = skill.why ? String(skill.why).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n') : '';
  const blocks = [`${fm}\n# ${one(skill.title)}`];
  if (one(skill.summary)) blocks.push(one(skill.summary));
  blocks.push(section('Why', whyBody));
  blocks.push(section('Moves', (skill.moves || []).map(formatMove).join('\n\n')));
  blocks.push(section('Scenarios', (skill.scenarios || []).map(formatScenario).join('\n\n')));
  blocks.push(section('Gaps', (skill.gaps || []).map((g) => `- ${one(g)}`).join('\n')));
  blocks.push(section('Sessions', (skill.sessions || []).map(formatSessionLine).join('\n')));
  return `${blocks.join('\n\n')}\n`;
}

/* ------------------------------ reading pages ----------------------------- */

export async function listSkills(vaultPath) {
  const dir = path.join(vaultPath, PRACTICE_DIR);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort(); } catch { return []; }
  const out = [];
  const seen = new Set();
  for (const f of files) {
    let raw;
    try { raw = await readFile(path.join(dir, f), 'utf8'); } catch { continue; }
    const skill = parsePracticePage(raw);
    if (skill.type && skill.type !== 'practice') continue;
    if (!skill.title) skill.title = f.replace(/\.md$/, '');
    const slug = slugOf(skill.title);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ ...skill, slug, relPath: `${PRACTICE_DIR}/${f}`, hash: hashOf(raw) });
  }
  return out;
}

export async function readSkill(vaultPath, slug) {
  if (!slug) return null;
  return (await listSkills(vaultPath)).find((s) => s.slug === slug) || null;
}

// Every page name in Wiki/, lower-cased — what a [[wikilink]] source is
// checked against. A source the vault does not have is not a source.
export async function vaultPageNames(vaultPath) {
  const names = new Set();
  const walk = async (dir, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) await walk(path.join(dir, e.name), depth + 1);
      else if (e.name.endsWith('.md')) names.add(e.name.slice(0, -3).toLowerCase());
    }
  };
  await walk(path.join(vaultPath, 'Wiki'), 0);
  return names;
}

// [[Folder/Name|alias#h]] → "name"
export function wikilinkTarget(s) {
  const m = String(s || '').trim().match(/^\[\[([^\]]+)\]\]$/);
  if (!m) return null;
  const target = m[1].split('|')[0].split('#')[0].trim();
  return target.split('/').pop().trim().toLowerCase() || null;
}

/* ------------------------------- validation ------------------------------- */

export const CAPS = { moves: 8, scenarios: 6, name: 60, line: 240 };
const BOOK_UNREAD = 'the book, unread by Nova';

// Names travel inside ` · ` and `, ` separated lists on the page, so neither
// separator may live inside a name.
const cleanName = (s) => one(String(s ?? '').replace(/[·,]/g, ' ')).slice(0, CAPS.name).trim();

// THE PREPARE MODEL PROPOSED; CODE DISPOSES. Pure: the dossier in, a skill
// page's fields and the notes on what was dropped or rewritten out.
export function validateDossier(dossier, { existingPaths = new Set(), allowWeb = true } = {}) {
  const d = dossier && typeof dossier === 'object' ? dossier : {};
  const notes = [];
  const title = cleanName(fileTitle(d.title));
  if (!title) throw new Error('the dossier came back without a title');

  const moves = [];
  const seen = new Set();
  for (const raw of Array.isArray(d.moves) ? d.moves : []) {
    const name = cleanName(raw?.name);
    if (!name) continue;
    const line = one(raw?.line);
    if (!line) { notes.push(`dropped "${name}": a move needs a line he can say`); continue; }
    if (seen.has(name.toLowerCase())) continue;
    let source = one(raw?.source);
    const link = wikilinkTarget(source);
    if (source === 'his words' || source === BOOK_UNREAD) {
      // honest as written
    } else if (link) {
      if (!existingPaths.has(link)) { notes.push(`"${name}" cited ${source}, which is not a page in the vault, so it is marked his words`); source = 'his words'; }
    } else if (/^web:\s*https:\/\/\S+$/i.test(source)) {
      if (!allowWeb) { notes.push(`"${name}" cited the web without a research run, so it is marked his words`); source = 'his words'; }
      else source = `web: ${source.replace(/^web:\s*/i, '')}`;
    } else {
      if (source) notes.push(`"${name}" had a source Nova could not check (${source.slice(0, 60)}), so it is marked his words`);
      source = 'his words';
    }
    if (moves.length >= CAPS.moves) { notes.push(`dropped "${name}": more than ${CAPS.moves} moves`); continue; }
    seen.add(name.toLowerCase());
    moves.push({
      name,
      summary: one(raw?.summary),
      line: line.length > CAPS.line ? `${line.slice(0, CAPS.line - 1).trim()}…` : line,
      when: one(raw?.when),
      tell: one(raw?.tell),
      source,
    });
  }
  if (!moves.length) throw new Error('the dossier had no move with a line he could say, so no page was written');

  const byLower = new Map(moves.map((m) => [m.name.toLowerCase(), m.name]));
  const scenarios = [];
  const seenScene = new Set();
  for (const raw of Array.isArray(d.scenarios) ? d.scenarios : []) {
    const name = cleanName(raw?.name);
    if (!name || seenScene.has(name.toLowerCase())) continue;
    const named = (Array.isArray(raw?.moves) ? raw.moves : []).map((n) => cleanName(n));
    const known = [...new Set(named.map((n) => byLower.get(n.toLowerCase())).filter(Boolean))];
    const unknown = named.filter((n) => n && !byLower.has(n.toLowerCase()));
    if (unknown.length) notes.push(`scene "${name}" named ${unknown.map((n) => `"${n}"`).join(', ')}, not a move on the page`);
    if (!known.length) { notes.push(`dropped scene "${name}": it rehearses no move on the page`); continue; }
    if (scenarios.length >= CAPS.scenarios) { notes.push(`dropped scene "${name}": more than ${CAPS.scenarios} scenes`); continue; }
    seenScene.add(name.toLowerCase());
    scenarios.push({ name, setting: one(raw?.setting), other: one(raw?.other), pressure: one(raw?.pressure), moves: known });
  }
  if (!scenarios.length) throw new Error('the dossier had no scene that rehearses a move on the page, so no page was written');

  // Sources in the frontmatter: vault pages only, and only ones that exist.
  const sources = [];
  for (const s of [...(Array.isArray(d.sourcesUsed) ? d.sourcesUsed : []), ...moves.map((m) => m.source)]) {
    const link = wikilinkTarget(s);
    if (!link || !existingPaths.has(link)) continue;
    const clean = one(s);
    if (!sources.some((x) => x.toLowerCase() === clean.toLowerCase())) sources.push(clean);
  }

  const gaps = (Array.isArray(d.gaps) ? d.gaps : []).map(one).filter(Boolean).slice(0, 6);
  return {
    skill: {
      title,
      summary: one(d.summary),
      why: String(d.why ?? '').split('\n').map((l) => l.trim()).join('\n').trim(),
      moves, scenarios, sources, gaps, sessions: [],
    },
    notes,
  };
}

/* -------------------------------- writing --------------------------------- */

// The Sessions section as he has it, from its heading to the end of the file —
// kept byte-for-byte through a re-prepare, including anything he added below.
function sessionsTail(raw) {
  const m = String(raw).match(/^## Sessions[ \t]*$/m);
  return m ? String(raw).slice(m.index) : null;
}

export async function writeSkillPage(vaultPath, skill, { slug = null, now = new Date() } = {}) {
  const today = localDateISO(now);
  let existing = await readSkill(vaultPath, slug || slugOf(skill.title));
  if (slug && !existing) throw new Error(`there is no practice page for "${slug}" to extend`);
  const newRel = `${PRACTICE_DIR}/${fileTitle(skill.title)}.md`;
  // a file already sitting at the new name but not parsed as a skill of this
  // slug (a hand-made page, say) is still his — it is extended, never replaced
  if (!existing && existsSync(path.join(vaultPath, newRel))) {
    const raw = await readFile(path.join(vaultPath, newRel), 'utf8');
    existing = { ...parsePracticePage(raw), relPath: newRel };
  }

  if (!existing) {
    const content = formatPracticePage({ ...skill, status: 'active', created: today, updated: today, sessions: [] });
    const full = path.join(vaultPath, newRel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
    return { relPath: newRel, hash: hashOf(content), created: true, content };
  }

  // A RE-PREPARE MERGES. His edits win: a move or scene he already has is kept
  // exactly as he has it; new ones are appended; gaps are the new read; the
  // why he gave first stays; the Sessions section is kept verbatim.
  const full = path.join(vaultPath, existing.relPath);
  const prior = await readFile(full, 'utf8');
  const have = new Set(existing.moves.map((m) => m.name.toLowerCase()));
  const haveScene = new Set(existing.scenarios.map((s) => s.name.toLowerCase()));
  const merged = {
    title: existing.title || skill.title,
    summary: existing.summary || skill.summary,
    status: existing.status,
    created: existing.created || today,
    updated: today,
    sources: [...existing.sources, ...skill.sources.filter((s) => !existing.sources.some((x) => x.toLowerCase() === s.toLowerCase()))],
    why: existing.why || skill.why,
    moves: [...existing.moves, ...skill.moves.filter((m) => !have.has(m.name.toLowerCase()))].slice(0, Math.max(CAPS.moves, existing.moves.length)),
    scenarios: [...existing.scenarios, ...skill.scenarios.filter((s) => !haveScene.has(s.name.toLowerCase()))].slice(0, Math.max(CAPS.scenarios, existing.scenarios.length)),
    gaps: skill.gaps.length ? skill.gaps : existing.gaps,
    sessions: [],
  };
  let content = formatPracticePage(merged);
  const tail = sessionsTail(prior);
  if (tail) {
    const at = content.search(/^## Sessions[ \t]*$/m);
    content = content.slice(0, at) + tail + (tail.endsWith('\n') ? '' : '\n');
  }
  await backupFile(full);
  await writeFile(full, content, 'utf8');
  return { relPath: existing.relPath, hash: hashOf(content), created: false, prior, content };
}

// Replace ONE frontmatter line in place; every other byte is untouched.
// Returns the line as it was and as it now is, so an undo can put it back.
function setFrontmatterLine(raw, key, value) {
  const fm = raw.match(FM_RE);
  if (!fm) return { text: raw, before: null, after: null };
  const inner = fm[1];
  const start = raw.indexOf(inner);
  const m = inner.match(new RegExp(`^${key}:[^\\n]*`, 'm'));
  if (!m) return { text: raw, before: null, after: null };
  const after = `${key}: ${value}`;
  const nextInner = inner.slice(0, m.index) + after + inner.slice(m.index + m[0].length);
  return { text: raw.slice(0, start) + nextInner + raw.slice(start + inner.length), before: m[0], after };
}

// Put frontmatter lines back — only where they still read what we wrote.
function restoreFrontmatterLines(raw, pairs = []) {
  let text = raw;
  for (const p of pairs) {
    if (!p?.before || !p?.after || p.before === p.after) continue;
    const fm = text.match(FM_RE);
    if (!fm) break;
    const inner = fm[1];
    const lines = inner.split('\n');
    const i = lines.indexOf(p.after);
    if (i === -1) continue;
    lines[i] = p.before;
    const start = text.indexOf(inner);
    text = text.slice(0, start) + lines.join('\n') + text.slice(start + inner.length);
  }
  return text;
}

function fullFor(vaultPath, relPath) {
  const full = path.resolve(vaultPath, relPath);
  if (!full.startsWith(path.resolve(vaultPath, PRACTICE_DIR) + path.sep)) throw new Error('that is not a practice page');
  return full;
}

// A SESSION LINE, INSERTED — never a regenerated page. Newest first, directly
// under the heading; `updated:` bumped in place.
export async function appendSession(vaultPath, slug, { date, scenario, landed = [], missed = [], work = '' }, { now = new Date() } = {}) {
  const skill = await readSkill(vaultPath, slug);
  if (!skill) throw new Error(`there is no practice page for "${slug}"`);
  const full = fullFor(vaultPath, skill.relPath);
  const raw = await readFile(full, 'utf8');
  const line = formatSessionLine({ date: date || localDateISO(now), scenario, landed, missed, work });
  let out;
  let addedHeading = false;
  const h = raw.match(/^## Sessions[ \t]*$/m);
  if (h) {
    const eol = raw.indexOf('\n', h.index);
    out = eol === -1 ? `${raw}\n${line}\n` : `${raw.slice(0, eol + 1)}${line}\n${raw.slice(eol + 1)}`;
  } else {
    addedHeading = true;
    out = `${raw}${raw.endsWith('\n') ? '' : '\n'}\n## Sessions\n${line}\n`;
  }
  const stamped = setFrontmatterLine(out, 'updated', q(localDateISO(now)));
  await backupFile(full);
  await writeFile(full, stamped.text, 'utf8');
  return {
    relPath: skill.relPath, before: hashOf(raw), after: hashOf(stamped.text), line, addedHeading,
    updatedLine: { before: stamped.before, after: stamped.after },
  };
}

// The exact reverse of appendSession: the one line out (the first exact
// match), the heading too if appendSession created it, and `updated:` back
// if nothing has touched it since.
async function removeSessionLineAt(full, line, { updatedLine = null, addedHeading = false } = {}) {
  if (!existsSync(full)) return false;
  const raw = await readFile(full, 'utf8');
  let out = null;
  if (addedHeading && raw.includes(`\n## Sessions\n${line}\n`)) {
    const i = raw.lastIndexOf(`\n## Sessions\n${line}\n`);
    out = raw.slice(0, i) + raw.slice(i + `\n## Sessions\n${line}\n`.length);
  } else {
    const lines = raw.split('\n');
    const i = lines.indexOf(line);
    if (i !== -1) { lines.splice(i, 1); out = lines.join('\n'); }
  }
  if (out === null) return false;
  if (updatedLine) out = restoreFrontmatterLines(out, [updatedLine]);
  await backupFile(full);
  await writeFile(full, out, 'utf8');
  return true;
}

export async function removeSessionLine(vaultPath, slug, line, opts = {}) {
  const skill = await readSkill(vaultPath, slug);
  if (!skill) return false;
  return removeSessionLineAt(fullFor(vaultPath, skill.relPath), line, opts);
}

export async function setSkillStatus(vaultPath, slug, status, { now = new Date(), restore = null } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`a practice skill is ${STATUSES.join(', ')} — not "${status}"`);
  const skill = await readSkill(vaultPath, slug);
  if (!skill) throw new Error(`there is no practice page for "${slug}"`);
  const full = fullFor(vaultPath, skill.relPath);
  const raw = await readFile(full, 'utf8');
  let text;
  let statusLine;
  let updatedLine;
  if (restore) {
    text = restoreFrontmatterLines(raw, [restore.statusLine, restore.updatedLine]);
  } else {
    const s = setFrontmatterLine(raw, 'status', status);
    if (!s.before) throw new Error('that page has no status line to change');
    const u = setFrontmatterLine(s.text, 'updated', q(localDateISO(now)));
    text = u.text;
    statusLine = { before: s.before, after: s.after };
    updatedLine = { before: u.before, after: u.after };
  }
  if (text !== raw) {
    await backupFile(full);
    await writeFile(full, text, 'utf8');
  }
  return { prior: skill.status, status, relPath: skill.relPath, title: skill.title, statusLine, updatedLine };
}

/* ------------------------------- the state -------------------------------- */

const EMPTY = () => ({ scenes: {}, tallies: {} });
const MAX_SCENES = 40;
let stateLock = Promise.resolve();

export async function readPracticeState() {
  if (!existsSync(STATE_PATH())) return EMPTY();
  try {
    const raw = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    return {
      scenes: raw?.scenes && typeof raw.scenes === 'object' ? raw.scenes : {},
      tallies: raw?.tallies && typeof raw.tallies === 'object' ? raw.tallies : {},
    };
  } catch {
    return EMPTY(); // operational only — a corrupt cache costs a transcript, never a page
  }
}

async function writePracticeState(state) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STATE_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, STATE_PATH());
}

// Read-modify-write under one lock, so two turns landing together cannot
// clobber each other's transcript.
export function updatePracticeState(fn) {
  const run = stateLock.catch(() => {}).then(async () => {
    const state = await readPracticeState();
    const out = await fn(state);
    const ids = Object.keys(state.scenes);
    if (ids.length > MAX_SCENES) {
      ids.sort((a, b) => String(state.scenes[a].startedAt).localeCompare(String(state.scenes[b].startedAt)));
      for (const id of ids.slice(0, ids.length - MAX_SCENES)) delete state.scenes[id];
    }
    await writePracticeState(state);
    return out;
  });
  stateLock = run.catch(() => {});
  return run;
}

// THE LIVE SCENE, for the Org Map (AGENT-WORLD-PLAN §9, the tenth being): a
// scene that has not been debriefed (or undone) and whose newest turn, or its
// start when nobody has spoken yet, is under fifteen minutes old. Read-only.
// A minute of clock skew either way is tolerated, so a turn stamped a moment
// after `now` was taken does not make a live scene look dead. Pure: the state
// and the clock are handed in.
export const LIVE_SCENE_MS = 15 * 60e3;
const SKEW_MS = 60e3;
export function liveSceneOf(state, now) {
  let best = null;
  for (const sc of Object.values(state?.scenes || {})) {
    if (!sc || typeof sc !== 'object' || sc.ended || sc.undone) continue;
    const started = Date.parse(sc.startedAt);
    if (!Number.isFinite(started)) continue;
    let turned = null;
    for (const t of Array.isArray(sc.turns) ? sc.turns : []) {
      const at = Date.parse(t?.at);
      if (Number.isFinite(at) && (turned == null || at > turned)) turned = at;
    }
    const last = turned != null && turned > started ? turned : started;
    const age = now - last;
    if (age < -SKEW_MS || age > LIVE_SCENE_MS) continue;
    if (!best || last > best.last) best = { last, startedAt: new Date(started).toISOString(), lastTurnAt: turned != null ? new Date(turned).toISOString() : null };
  }
  return best ? { startedAt: best.startedAt, lastTurnAt: best.lastTurnAt } : null;
}
// The same, off the state file. An absent or unreadable file is no scene:
// honest absence, never a guess.
export async function liveScene(now = Date.now()) {
  try { return liveSceneOf(await readPracticeState(), now); } catch { return null; }
}

/* ------------------------------ the tallies ------------------------------- */

// DERIVED, never stored as truth: every debriefed session line counts each
// landed move as tried + landed and each missed move as tried. Only a
// debriefed scene counts — practice, not exposure.
export function recomputeTallies(skill) {
  const t = {};
  const canon = new Map();
  for (const m of skill.moves || []) { t[m.name] = { tried: 0, landed: 0, lastAt: null }; canon.set(m.name.toLowerCase(), m.name); }
  const touch = (name, date, landed) => {
    const key = canon.get(String(name).toLowerCase());
    if (!key) return;
    t[key].tried += 1;
    if (landed) t[key].landed += 1;
    if (!t[key].lastAt || date > t[key].lastAt) t[key].lastAt = date;
  };
  for (const s of skill.sessions || []) {
    for (const n of s.landed) touch(n, s.date, true);
    for (const n of s.missed) touch(n, s.date, false);
  }
  return t;
}

export async function cacheTallies(skill) {
  const tallies = recomputeTallies(skill);
  await updatePracticeState((s) => { s.tallies[skill.slug || slugOf(skill.title)] = tallies; }).catch(() => {});
  return tallies;
}

const ratio = (x) => (x && x.tried ? x.landed / x.tried : 0);

function weakestLine(skill, scenario, tallies) {
  const canon = new Map((skill.moves || []).map((m) => [m.name.toLowerCase(), m.name]));
  const names = (scenario.moves || []).map((n) => canon.get(n.toLowerCase())).filter(Boolean);
  if (!names.length) return 'this scene names no move on the page yet';
  const weakest = [...names].sort((a, b) => ratio(tallies[a]) - ratio(tallies[b]) || (tallies[a]?.tried || 0) - (tallies[b]?.tried || 0))[0];
  const x = tallies[weakest] || { tried: 0, landed: 0 };
  if (!x.tried) return `${weakest} has not been tried yet`;
  if (!x.landed) return `${weakest} has not landed yet`;
  return `${weakest} has landed ${x.landed} of ${x.tried}`;
}

// THE PICKER. Pure: the scenario whose moves have landed least (untried counts
// as 0), ties to the least recently rehearsed, then page order.
export function nextScene(skill, _now = new Date()) {
  const scenarios = skill?.scenarios || [];
  if (!scenarios.length) return null;
  const tallies = recomputeTallies(skill);
  const canon = new Map((skill.moves || []).map((m) => [m.name.toLowerCase(), m.name]));
  const scored = scenarios.map((s, i) => {
    const known = (s.moves || []).map((n) => canon.get(n.toLowerCase())).filter(Boolean);
    const mean = known.length ? known.reduce((a, n) => a + ratio(tallies[n]), 0) / known.length : 0;
    const last = (skill.sessions || [])
      .filter((x) => x.scenario.toLowerCase() === s.name.toLowerCase())
      .reduce((m, x) => (x.date > m ? x.date : m), '');
    return { s, i, mean, last, known };
  });
  scored.sort((a, b) => a.mean - b.mean || a.last.localeCompare(b.last) || a.i - b.i);
  const pick = scored[0];
  return { scenario: pick.s.name, moves: pick.known, why: weakestLine(skill, pick.s, tallies) };
}

/* ------------------------------ the payloads ------------------------------ */

const lastRehearsed = (skill) => (skill.sessions || []).reduce((m, s) => (s.date > m ? s.date : m), '') || null;

export function skillView(skill) {
  const tallies = recomputeTallies(skill);
  return {
    slug: skill.slug || slugOf(skill.title),
    title: skill.title,
    summary: skill.summary,
    status: skill.status,
    why: skill.why,
    sources: skill.sources,
    relPath: skill.relPath || null,
    moves: skill.moves.map((m) => ({ ...m, ...(tallies[m.name] || { tried: 0, landed: 0, lastAt: null }) })),
    // The pressure is the surprise: the screen never sees it before the scene
    // (the partner's prompt does). Only the scene partner reads the page raw.
    scenarios: skill.scenarios.map(({ pressure: _p, ...rest }) => rest),
    gaps: skill.gaps,
    sessions: skill.sessions.map((s) => ({ at: s.date, scenario: s.scenario, landed: s.landed, missed: s.missed, work: s.work })),
    next: skill.status === 'active' ? nextScene(skill) : null,
    lastRehearsedAt: lastRehearsed(skill),
  };
}

// GET /api/practice — receipts only, no model call.
export async function practiceSummary(vaultPath) {
  const skills = (await listSkills(vaultPath)).map(skillView);
  // today: the active skill that has waited longest for a scene
  const ready = skills
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.status === 'active' && s.next)
    .sort((a, b) => String(a.s.lastRehearsedAt || '').localeCompare(String(b.s.lastRehearsedAt || '')) || a.i - b.i);
  const today = ready.length ? { slug: ready[0].s.slug, title: ready[0].s.title, scenario: ready[0].s.next.scenario, why: ready[0].s.next.why } : null;
  let preparing = [];
  try {
    const { listRecords } = await import('./inboxStore.js');
    preparing = (await listRecords())
      .filter((r) => r.kind === 'practice-skill' && (r.status === 'classifying' || r.status === 'error'))
      .map((r) => ({ id: r.id, text: r.text, status: r.status, error: r.error || null, createdAt: r.createdAt }));
  } catch { /* honest absence: nothing shown as preparing */ }
  return { skills, today, preparing };
}

function shortDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return iso;
  // spelled by hand: en-GB's short month is "Sept" on newer ICU, "Sep" on older
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
}

// One sentence for the other agents, or null when he is practising nothing.
export async function practiceLine(vaultPath) {
  const active = (await listSkills(vaultPath)).filter((s) => s.status === 'active');
  if (!active.length) return null;
  const bits = active.slice(0, 3).map((s) => {
    const t = recomputeTallies(s);
    const landed = Object.values(t).filter((x) => x.landed > 0).length;
    const last = s.sessions.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const tail = last ? `; last scene ${shortDate(last.date)}${last.work ? `, working on: ${last.work.replace(/[.\s]+$/, '')}` : ''}` : '; no scene rehearsed yet';
    return `${s.title} (${s.moves.length} move${s.moves.length === 1 ? '' : 's'}, ${landed} landed${tail})`;
  });
  return `He is practising ${bits.join('; and ')}.`;
}

/* ---------------------------------- undo ---------------------------------- */

export async function undoPracticeSkill(vaultPath, undo = {}) {
  const full = fullFor(vaultPath, undo.relPath);
  if (!existsSync(full)) return 'the practice page was already gone';
  const raw = await readFile(full, 'utf8');
  if (hashOf(raw) !== undo.hash) {
    throw new Error('the practice page has been edited since filing, so it was left in place — change it in Obsidian if you still want it gone');
  }
  await backupFile(full);
  if (typeof undo.prior === 'string') {
    await writeFile(full, undo.prior, 'utf8');
    return 'put the practice page back as it was before this prepare';
  }
  await unlink(full);
  return 'deleted the practice page';
}

export async function undoPracticeSession(vaultPath, undo = {}) {
  const full = fullFor(vaultPath, undo.relPath);
  const removed = await removeSessionLineAt(full, undo.line, { updatedLine: undo.updatedLine, addedHeading: undo.addedHeading });
  if (undo.sessionId) {
    await updatePracticeState((s) => { if (s.scenes[undo.sessionId]) s.scenes[undo.sessionId].undone = true; }).catch(() => {});
  }
  try {
    const skill = await readSkill(vaultPath, undo.slug);
    if (skill) await cacheTallies(skill);
  } catch { /* the cache recomputes on the next read */ }
  return removed ? 'took that session back off the practice page' : 'that session line was already gone from the practice page';
}

export async function undoPracticeStatus(vaultPath, undo = {}) {
  await setSkillStatus(vaultPath, undo.slug, undo.prior, { restore: { statusLine: undo.statusLine, updatedLine: undo.updatedLine } });
  return `set the practice skill back to ${undo.prior}`;
}
