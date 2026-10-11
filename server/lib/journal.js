import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

const JOURNAL_DIR_REL = 'Wiki/Journal';
const INDEX_REL_PATH = 'Wiki/index.md';
const LOG_REL_PATH = 'Wiki/log.md';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayParts(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { date, time };
}

// Pure function: inserts or updates a single-line bullet under a "## <category>"
// heading in index.md's raw text. Reused verbatim on every journal write since
// a day-page's index summary changes (new entry count / latest preview) each
// time something is appended to it, not just on first creation.
export function upsertIndexBullet(raw, category, pageTitle, summaryLine) {
  const headingRe = new RegExp(`^##\\s+${escapeRe(category)}\\s*$`, 'm');
  const m = headingRe.exec(raw);
  if (!m) throw new Error(`No "## ${category}" section found in index.md`);
  const afterHeading = m.index + m[0].length;
  const rest = raw.slice(afterHeading);
  const nextHeadingMatch = rest.match(/\n##\s/);
  const sectionEnd = nextHeadingMatch ? afterHeading + nextHeadingMatch.index + 1 : raw.length;
  let section = raw.slice(afterHeading, sectionEnd);

  const bulletRe = new RegExp(`^-\\s*\\[\\[${escapeRe(pageTitle)}\\]\\].*$`, 'm');
  if (bulletRe.test(section)) {
    section = section.replace(bulletRe, summaryLine);
  } else {
    section = section.replace(/\s*$/, '\n') + summaryLine + '\n\n';
  }
  return raw.slice(0, afterHeading) + section + raw.slice(sectionEnd);
}

// Pure function: appends a new dated block to log.md's raw text, matching the
// vault's own append-only log format (see CLAUDE.md).
export function appendLogEntry(raw, { date, summary, notes }) {
  const block = `\n## [${date}] ingest | ${summary}\n- Created/updated: entry appended\n- Notes: ${notes}\n`;
  return raw.replace(/\s*$/, '\n') + block;
}

function entryPreview(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 90 ? flat.slice(0, 87) + '…' : flat;
}

// Entry categories keep personal reflections separate from training receipts
// and system briefs — "I don't want to lose my records amongst the exercise
// logs." The category rides IN the section heading so the vault file stays
// human-readable and hand-editable: "## 21:30 · personal — Daily review".
// Legacy headings without a marker parse as category null (shown unlabelled).
export const JOURNAL_CATEGORIES = ['personal', 'training', 'system'];

// WHO WROTE IT (11 Oct 2026). Since 1 Sep every entry in his Journal was filed
// by Nova or an agent and none by him, yet Commitments and the Weekly debrief
// read `personal` and `training` sections as his own voice, so an agent could
// tell him "you said X" when Nova said it. The category says WHAT an entry is
// about; it never said WHO wrote it.
//
// Now the writer names its author in the heading, beside the category, so the
// file stays readable in Obsidian and Ask Nova sees it too:
//   "## 07:00 · system · by Nova — Morning dispatch"
// Entries written before the marker are never rewritten; their author is
// derived from the provenance label the writer already put in the heading
// (LABEL_AUTHORS). A label nobody owns, or a bare legacy heading from before
// categories existed (22 Jul), is 'unknown': honestly unattributed, and never
// counted as his words.
export const JOURNAL_AUTHORS = {
  hayden: 'Hayden',
  nova: 'Nova',
  coach: 'Coach',
  leader: 'Leader',
  guardian: 'Guardian',
  cfo: 'CFO',
};

// Every label a writer in server/lib, server/routes or the app has filed under,
// and who wrote the words. "Said to Nova" is his line, spoken (verbs.js
// journal.add); "Reflection on [[…]]" is the reflect card, his own typing.
// Calendar follow-up, Focus block, Training check and Active rest are receipts
// composed by code about something he did: the words are Nova's, not his.
export const LABEL_AUTHORS = {
  'Said to Nova': 'hayden',
  'Morning dispatch': 'nova',
  'Evening debrief': 'nova',
  'Weekly review': 'nova',
  'Plan today': 'nova',
  'Daily review reflection': 'nova',
  'Second-brain week': 'nova',
  'Calendar follow-up': 'nova',
  'Focus block': 'nova',
  'Training check': 'nova',
  'Active rest': 'nova',
  'Session receipt': 'coach',
  'Weekly debrief': 'coach',
  'Coach outreach': 'coach',
  'Leader follow-up': 'leader',
  'Guardian report': 'guardian',
  'Guardian restore': 'guardian',
  'CFO report': 'cfo',
};

const authorId = (name) => {
  const k = String(name || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(JOURNAL_AUTHORS, k) ? k : null;
};

// The author of one parsed section: its marker when it has one, else what its
// label says, else (an unlabelled entry with a category: the composer or one
// of his own classified captures) his. Returns an id from JOURNAL_AUTHORS, or
// 'unknown'.
export function journalAuthorOf({ by = null, heading = null, category = null } = {}) {
  const marked = authorId(by);
  if (marked) return marked;
  if (heading) {
    if (/^Reflection on \[\[/.test(heading)) return 'hayden';
    return LABEL_AUTHORS[heading] || 'unknown';
  }
  return category ? 'hayden' : 'unknown';
}

// Only these are his words. Every reader that frames an entry as what he said,
// meant or promised goes through this, never through the category.
export const isHisOwnEntry = (section) => (section?.author || journalAuthorOf(section)) === 'hayden';

// "Nova", "the Coach", "Hayden": how a reader names the author in a prompt.
export function journalAuthorName(id) {
  if (id === 'coach' || id === 'leader') return `the ${JOURNAL_AUTHORS[id]}`;
  return JOURNAL_AUTHORS[id] || 'an unknown author';
}

// The same rule, said to a model that reads Wiki/Journal itself through its
// tools (Ask Nova, the Coach, the Daily review, Plan today, the Weekly
// debrief). Built from LABEL_AUTHORS so the prompt and the code cannot drift.
const labelsOf = (id) => Object.keys(LABEL_AUTHORS).filter((l) => LABEL_AUTHORS[l] === id).map((l) => `"${l}"`).join(', ');
export const JOURNAL_AUTHORSHIP_RULE = `WHO WROTE A JOURNAL ENTRY. Most of Wiki/Journal is filed by Nova and the agents, not by Hayden. Each "## HH:MM" section names its author, "· by Nova", "· by Coach" and so on, or on older entries by its label: ${labelsOf('nova')} are Nova's; ${labelsOf('coach')} are the Coach's; ${labelsOf('leader')}, ${labelsOf('guardian')} and ${labelsOf('cfo')} are the Leader's, the Guardian's and the CFO's. Only a section marked "by Hayden", "Said to Nova", a "Reflection on [[…]]" or an unlabelled one is his own words. Never tell him "you said", "you wrote" or "you promised" about any other entry: it is what Nova or that agent noted.`;

// HIS TAGS AND WHERE HE WROTE IT (11 Oct 2026, mockup 95). His own entries
// carry where they came from beside the author, so the file stays readable
// in Obsidian and every reader parses one shape:
//   "## 21:10 · personal · by Hayden · deep — Deep question"
//   "## 20:55 · personal · by Hayden · own · notion"
// own = off the cuff, life = answered a My life or Daily review prompt,
// deep = answered a Deep question. "notion" = he wrote it in Notion and it was
// brought home. The label after the dash names the prompt kind he answered.
export const JOURNAL_TAGS = ['own', 'life', 'deep'];
export const PROMPT_FROM = { deep: 'Deep question', review: 'Daily review', life: 'My life' };
const PROMPT_FROM_KEY = Object.fromEntries(Object.entries(PROMPT_FROM).map(([k, v]) => [v, k]));

function headingLine(s) {
  return `## ${s.time}${s.category ? ' · ' + s.category : ''}${s.by ? ' · by ' + s.by : ''}${s.tag ? ' · ' + s.tag : ''}${s.writtenIn === 'notion' ? ' · notion' : ''}${s.heading ? ' — ' + s.heading : ''}`;
}
export const journalHeadingLine = headingLine;

// The body of one of his prompted entries: the prompt he answered as a quote,
// then his words. Unprompted entries are his words alone, as before.
export function sectionBody({ prompt, words }) {
  const w = String(words || '').trim();
  const p = String(prompt || '').replace(/\s+/g, ' ').trim();
  return p ? `> ${p}\n\n${w}` : w;
}
export function splitBody(text) {
  const lines = String(text || '').split('\n');
  const q = [];
  let i = 0;
  while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
  if (!q.length) return { prompt: null, words: String(text || '').trim() };
  return { prompt: q.join(' ').trim() || null, words: lines.slice(i).join('\n').trim() };
}

function bodyFor(date, sections) {
  const lines = [`# ${date}`, ''];
  for (const s of sections) {
    lines.push(headingLine(s), '', s.text.trim(), '');
  }
  return lines.join('\n');
}

// One heading line ("## 21:30 · personal · by Nova — Plan today") into its
// parts. Exported for readers that walk a day page's raw markdown
// (commitments.js) so they read authorship exactly as listEntries does.
export function parseJournalHeading(line) {
  const m = String(line || '').match(/^##\s*(.+)$/);
  if (!m) return null;
  const [timePart, ...rest] = m[1].trim().split(/\s+—\s+/);
  // "21:30 · personal" → time + category; bare "21:30" → legacy, no category
  const [time, ...markers] = timePart.split(/\s+·\s+/);
  const category = markers.length && JOURNAL_CATEGORIES.includes(markers[0].trim()) ? markers[0].trim() : null;
  let by = null;
  for (const mk of markers) {
    const b = mk.trim().match(/^by\s+(.+)$/i);
    if (b && authorId(b[1])) { by = b[1].trim(); break; }
  }
  const heading = rest.join(' — ').trim() || null;
  const section = { time: time.trim(), category, by, heading };
  const out = { ...section, author: journalAuthorOf(section) };
  // his tag and Notion marker, beside the author
  const tag = markers.map((mk) => mk.trim()).find((mk) => JOURNAL_TAGS.includes(mk));
  if (tag) out.tag = tag;
  if (markers.some((mk) => mk.trim() === 'notion')) out.writtenIn = 'notion';
  if (heading && PROMPT_FROM_KEY[heading]) out.promptFrom = PROMPT_FROM_KEY[heading];
  return out;
}

// Parses a day-file's body back into its per-entry sections (inverse of
// bodyFor) — used both to append a new section and to list past entries.
function parseSections(body) {
  const chunks = body.split(/\n(?=##\s)/).filter((c) => /^##\s/.test(c.trim()));
  return chunks.map((chunk) => {
    const parsed = parseJournalHeading(chunk.trim().match(/^##[^\n]*/)[0]);
    const text = chunk.replace(/^##[^\n]*\n/, '').trim();
    if (parsed.author !== 'hayden') return { ...parsed, text };
    const { prompt, words } = splitBody(text);
    // an unmarked entry of his is off the cuff unless it answered a prompt
    return { ...parsed, tag: parsed.tag || (prompt ? 'life' : 'own'), prompt, words, text };
  });
}

let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.catch(() => {}).then(fn);
  writeLock = run.catch(() => {});
  return run;
}

// entry: { text, author, linkedTitle?, category?, label? } — author is who
// wrote the words (an id in JOURNAL_AUTHORS); linkedTitle is a concept/topic
// page to cross-link (a concept reflection, always his); category separates
// personal reflections from training receipts and system briefs (default
// personal); label is a provenance heading like "Daily review reflection".
// A writer that names no author, and whose label says nothing, is refused:
// an entry nobody owns would read as his.
export function resolveEntryAuthor(entry = {}) {
  const named = authorId(entry.author);
  if (named) return named;
  if (entry.linkedTitle) return 'hayden';
  if (entry.label && LABEL_AUTHORS[entry.label]) return LABEL_AUTHORS[entry.label];
  throw new Error('a journal entry needs its author (who wrote the words)');
}

// The day page's frontmatter `updated` date, changed in place. The rest of
// the file, his hand edits included, is left byte for byte as it was.
function stampUpdated(raw, date) {
  const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|(?![\s\S]))/);
  if (!fm) return raw;
  const block = fm[0].replace(/^(updated:\s*['"]?)\d{4}-\d{2}-\d{2}/m, (_, lead) => lead + date);
  return block + raw.slice(fm[0].length);
}

// A new section appended to the raw page: diffed, never regenerated, so a
// hand edit, an unknown marker or a quirk of spacing in an older section
// survives (and an unquoted `created:` date is never re-serialised as a
// timestamp). On a page Nova wrote, the result is exactly what bodyFor would
// have produced: one blank line between sections, one newline at the end.
export function appendSectionRaw(raw, date, section) {
  const stamped = stampUpdated(raw, date);
  const block = `${headingLine(section)}\n\n${section.text.trim()}\n`;
  const sep = /\n\n$/.test(stamped) ? '' : /\n$/.test(stamped) ? '\n' : stamped.length ? '\n\n' : '';
  return stamped + sep + block;
}

// The idx-th section cut out of the raw page and nothing else touched: the
// frontmatter, the other sections and their separators stay as they were.
// Splitting on the same boundary parseSections uses keeps idx aligned.
export function removeSectionRaw(raw, idx) {
  const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|(?![\s\S]))/);
  const head = fm ? fm[0] : '';
  const chunks = raw.slice(head.length).split(/\n(?=##\s)/);
  let seen = -1;
  const at = chunks.findIndex((c) => /^##\s/.test(c.trim()) && ++seen === idx);
  if (at === -1) return raw;
  chunks.splice(at, 1);
  return head + chunks.join('\n');
}

export async function addEntry(vaultPath, entry) {
  const text = (entry.text || '').trim();
  if (!text) throw new Error('entry text is required');
  const category = JOURNAL_CATEGORIES.includes(entry.category) ? entry.category : 'personal';
  const author = resolveEntryAuthor(entry);

  return withWriteLock(async () => {
    const { date, time } = todayParts(entry.at ? new Date(entry.at) : new Date());
    const dir = path.join(vaultPath, JOURNAL_DIR_REL);
    await mkdir(dir, { recursive: true });
    const full = path.join(dir, `${date}.md`);

    const his = author === 'hayden' && !entry.linkedTitle;
    const tag = his ? (JOURNAL_TAGS.includes(entry.tag) ? entry.tag : (entry.promptFrom === 'deep' ? 'deep' : entry.promptFrom ? 'life' : 'own')) : null;
    const prompt = his && entry.prompt ? String(entry.prompt) : null;
    const newSection = {
      time,
      category,
      by: JOURNAL_AUTHORS[author],
      // written only when he chose one; an unmarked entry of his reads as own
      tag: his && (entry.tag || entry.promptFrom || entry.writtenIn === "notion") ? tag : null,
      writtenIn: his && entry.writtenIn === 'notion' ? 'notion' : null,
      heading: entry.linkedTitle ? `Reflection on [[${entry.linkedTitle}]]` : (his && PROMPT_FROM[entry.promptFrom] ? PROMPT_FROM[entry.promptFrom] : (entry.label || null)),
      text: prompt ? sectionBody({ prompt, words: text }) : text,
    };
    let sections;
    if (existsSync(full)) {
      const raw = await readFile(full, 'utf8');
      sections = [...parseSections(matter(raw).content), newSection];
      await backupFile(full);
      await writeFile(full, appendSectionRaw(raw, date, newSection), 'utf8');
    } else {
      sections = [newSection];
      const frontmatter = { type: 'journal', tags: [], created: date, updated: date };
      await writeFile(full, matter.stringify(bodyFor(date, sections), frontmatter), 'utf8');
    }

    // Bookkeeping — keep index.md and log.md in sync per the vault's own
    // schema. Best-effort and BACKED UP: the journal entry itself has already
    // landed, so a mangled index heading must degrade to skipped bookkeeping,
    // never surface as a failed filing (an unguarded throw here once reported
    // an error AFTER the entry was written).
    try {
      const indexFull = path.join(vaultPath, INDEX_REL_PATH);
      if (existsSync(indexFull)) {
        const indexRaw = await readFile(indexFull, 'utf8');
        const latest = entryPreview(text);
        const summaryLine = `- [[${date}]] — ${sections.length} ${sections.length === 1 ? 'entry' : 'entries'}, latest: ${latest} (updated ${date})`;
        const updatedIndex = upsertIndexBullet(indexRaw, 'Journal', date, summaryLine);
        await backupFile(indexFull);
        await writeFile(indexFull, updatedIndex, 'utf8');
      }
    } catch { /* index section missing/renamed — skip bookkeeping */ }
    try {
      const logFull = path.join(vaultPath, LOG_REL_PATH);
      if (existsSync(logFull)) {
        const logRaw = await readFile(logFull, 'utf8');
        const updatedLog = appendLogEntry(logRaw, {
          date,
          summary: `Nova journal entry — [[${date}]]`,
          notes: entry.linkedTitle ? `Reflection linked to [[${entry.linkedTitle}]], written via Nova.` : 'Standalone entry written via Nova.',
        });
        await backupFile(logFull);
        await writeFile(logFull, updatedLog, 'utf8');
      }
    } catch { /* log bookkeeping is best-effort */ }

    const novaId = novaIdFor(date, time, sections.filter((x) => x.time === time).length - 1);
    return { date, time, text, category, author, linkedTitle: entry.linkedTitle || null, novaId, tag, prompt };
  });
}

// Inverse of addEntry for inbox undo: removes the section matching
// time + exact text from that day's file. Refuses gracefully (returns false)
// if the section is no longer there — the user may have edited it since.
export async function removeEntry(vaultPath, { date, time, text }) {
  return withWriteLock(async () => {
    const full = path.join(vaultPath, JOURNAL_DIR_REL, `${date}.md`);
    if (!existsSync(full)) return false;
    const raw = await readFile(full, 'utf8');
    const sections = parseSections(matter(raw).content);
    const idx = sections.findIndex((s) => s.time === time && s.text.trim() === text.trim());
    if (idx === -1) return false;
    await backupFile(full);
    sections.splice(idx, 1);

    if (sections.length === 0) {
      const { unlink } = await import('node:fs/promises');
      await unlink(full);
    } else {
      await writeFile(full, removeSectionRaw(raw, idx), 'utf8');
    }

    // keep the index bullet honest about the new count/preview
    const indexFull = path.join(vaultPath, INDEX_REL_PATH);
    if (existsSync(indexFull) && sections.length > 0) {
      const indexRaw = await readFile(indexFull, 'utf8');
      const latest = entryPreview(sections[sections.length - 1].text);
      const summaryLine = `- [[${date}]] — ${sections.length} ${sections.length === 1 ? 'entry' : 'entries'}, latest: ${latest} (updated ${date})`;
      try {
        const updated = upsertIndexBullet(indexRaw, 'Journal', date, summaryLine);
        await backupFile(indexFull);
        await writeFile(indexFull, updated, 'utf8');
      } catch {
        /* index section missing — skip bookkeeping */
      }
    }
    return true;
  });
}

export async function listEntries(vaultPath, { limit } = {}) {
  const dir = path.join(vaultPath, JOURNAL_DIR_REL);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  const days = [];
  for (const f of files) {
    const raw = await readFile(path.join(dir, f), 'utf8');
    const { data, content } = matter(raw);
    const date = f.replace(/\.md$/, '');
    const seen = {};
    const sections = parseSections(content).map((sec) => {
      const n = seen[sec.time] = (seen[sec.time] ?? -1) + 1;
      return { ...sec, novaId: novaIdFor(date, sec.time, n) };
    });
    days.push({ date, sections, updated: data.updated || date });
  }
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return limit ? days.slice(0, limit) : days;
}

// ONE ENTRY'S ID, for the Notion copy (Nova id) and for any write that names
// one entry. The day and the minute, with an ordinal only when two entries
// share a minute: stable under an edit of the words or the tag, readable in
// the Notion database, and derived, so nothing new is written to the vault.
export function novaIdFor(date, time, n = 0) {
  return `${date}T${time}${n > 0 ? '-' + (n + 1) : ''}`;
}
export function parseNovaId(id) {
  const m = String(id || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?:-(\d+))?$/);
  return m ? { date: m[1], time: m[2], n: m[3] ? Number(m[3]) - 1 : 0 } : null;
}

// The chunks of a raw day page, split on the same boundary parseSections and
// removeSectionRaw use, so an index means the same section everywhere.
function rawChunks(raw) {
  const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|(?![\s\S]))/);
  const head = fm ? fm[0] : '';
  return { head, chunks: raw.slice(head.length).split(/\n(?=##\s)/) };
}

// The idx-th section's heading and body replaced, and nothing else: the
// other sections, the frontmatter and this chunk's own trailing whitespace
// stay byte for byte.
export function replaceSectionRaw(raw, idx, section) {
  const { head, chunks } = rawChunks(raw);
  let seen = -1;
  const at = chunks.findIndex((c) => /^##\s/.test(c.trim()) && ++seen === idx);
  if (at === -1) return raw;
  const old = chunks[at];
  const lead = old.match(/^\s*/)[0];
  const trail = old.match(/\s*$/)[0];
  chunks[at] = `${lead}${headingLine(section)}\n\n${String(section.text).trim()}${trail}`;
  return head + chunks.join('\n');
}

async function locate(vaultPath, novaId) {
  const id = parseNovaId(novaId);
  if (!id) return null;
  const full = path.join(vaultPath, JOURNAL_DIR_REL, `${id.date}.md`);
  if (!existsSync(full)) return null;
  const raw = await readFile(full, 'utf8');
  const sections = parseSections(matter(raw).content);
  let n = -1;
  const idx = sections.findIndex((s) => s.time === id.time && ++n === id.n);
  if (idx === -1) return null;
  return { full, raw, idx, section: sections[idx], date: id.date };
}

export async function getEntry(vaultPath, novaId) {
  const at = await locate(vaultPath, novaId);
  return at ? { ...at.section, novaId, date: at.date } : null;
}

// One of HIS entries changed in place: its words (an edit made in Notion) or
// its tag (a retag). Refuses anything not his: Nova's log is never edited
// from here. Returns the page before and after, for an exact undo.
export async function updateEntry(vaultPath, novaId, { words, tag, prompt } = {}) {
  return withWriteLock(async () => {
    const at = await locate(vaultPath, novaId);
    if (!at) throw new Error('that entry is no longer in your journal');
    if (at.section.author !== 'hayden') throw new Error('only your own entries can be changed here');
    if (tag != null && !JOURNAL_TAGS.includes(tag)) throw new Error('unknown tag');
    const s = at.section;
    const nextWords = words != null ? String(words).trim() : s.words;
    if (!nextWords) throw new Error('entry text is required');
    const nextPrompt = prompt !== undefined ? prompt : s.prompt;
    const next = { ...s, tag: tag || s.tag, text: nextPrompt ? sectionBody({ prompt: nextPrompt, words: nextWords }) : nextWords };
    const after = replaceSectionRaw(at.raw, at.idx, next);
    if (after === at.raw) return { date: at.date, before: at.raw, after, changed: false };
    await backupFile(at.full);
    await writeFile(at.full, after, 'utf8');
    return { date: at.date, before: at.raw, after, changed: true };
  });
}

// One of HIS entries taken out of the vault, for a delete made in Notion or
// the Undo on a save. The whole page before is returned so the undo can put
// it back byte for byte.
export async function deleteEntry(vaultPath, novaId) {
  return withWriteLock(async () => {
    const at = await locate(vaultPath, novaId);
    if (!at) return null;
    if (at.section.author !== 'hayden') throw new Error('only your own entries can be removed here');
    await backupFile(at.full);
    const sections = parseSections(matter(at.raw).content);
    let after = null;
    if (sections.length === 1) {
      const { unlink } = await import('node:fs/promises');
      await unlink(at.full);
    } else {
      after = removeSectionRaw(at.raw, at.idx);
      await writeFile(at.full, after, 'utf8');
    }
    return { date: at.date, before: at.raw, after, section: at.section };
  });
}

// The undo of deleteEntry: the day page exactly as it was, but only while the
// page is still exactly as the delete left it. If he has written on that day
// since, the removed section alone goes back at the end, so nothing he wrote
// afterwards is lost.
export async function restoreDay(vaultPath, { date, before, after }) {
  return withWriteLock(async () => {
    const dir = path.join(vaultPath, JOURNAL_DIR_REL);
    const full = path.join(dir, `${date}.md`);
    const now = existsSync(full) ? await readFile(full, 'utf8') : null;
    if (now === after) {
      await mkdir(dir, { recursive: true });
      if (now != null) await backupFile(full);
      await writeFile(full, before, 'utf8');
      return 'exact';
    }
    // the day changed since: re-append the one section that was removed
    const was = parseSections(matter(before).content);
    const left = now == null ? [] : parseSections(matter(now).content);
    const missing = was.find((s) => !left.some((l) => l.time === s.time && l.text === s.text));
    if (!missing) return 'already-there';
    await mkdir(dir, { recursive: true });
    if (now != null) await backupFile(full);
    const base = now ?? matter.stringify(`# ${date}\n`, { type: 'journal', tags: [], created: date, updated: date });
    await writeFile(full, appendSectionRaw(base, date, missing), 'utf8');
    return 'appended';
  });
}
