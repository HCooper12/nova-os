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

function bodyFor(date, sections) {
  const lines = [`# ${date}`, ''];
  for (const s of sections) {
    lines.push(`## ${s.time}${s.heading ? ' — ' + s.heading : ''}`, '', s.text.trim(), '');
  }
  return lines.join('\n');
}

// Parses a day-file's body back into its per-entry sections (inverse of
// bodyFor) — used both to append a new section and to list past entries.
function parseSections(body) {
  const chunks = body.split(/\n(?=##\s)/).filter((c) => /^##\s/.test(c.trim()));
  return chunks.map((chunk) => {
    const headingLine = chunk.match(/^##\s*(.+)$/m)[1].trim();
    const [time, ...rest] = headingLine.split(/\s+—\s+/);
    const text = chunk.replace(/^##[^\n]*\n/, '').trim();
    return { time: time.trim(), heading: rest.join(' — ').trim() || null, text };
  });
}

let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.catch(() => {}).then(fn);
  writeLock = run.catch(() => {});
  return run;
}

// entry: { text, linkedTitle? } — linkedTitle is a concept/topic page name to
// cross-link (e.g. from a Daily Review reflection); omitted for a standalone
// journal entry.
export async function addEntry(vaultPath, entry) {
  const text = (entry.text || '').trim();
  if (!text) throw new Error('entry text is required');

  return withWriteLock(async () => {
    const { date, time } = todayParts();
    const dir = path.join(vaultPath, JOURNAL_DIR_REL);
    await mkdir(dir, { recursive: true });
    const full = path.join(dir, `${date}.md`);

    let sections = [];
    let createdDate = date;
    if (existsSync(full)) {
      const raw = await readFile(full, 'utf8');
      const parsed = matter(raw);
      sections = parseSections(parsed.content);
      createdDate = parsed.data.created || date;
      await backupFile(full);
    }
    const newSection = { time, heading: entry.linkedTitle ? `Reflection on [[${entry.linkedTitle}]]` : null, text };
    sections.push(newSection);

    const frontmatter = { type: 'journal', tags: [], created: createdDate, updated: date };
    const content = matter.stringify(bodyFor(date, sections), frontmatter);
    await writeFile(full, content, 'utf8');

    // Bookkeeping — keep index.md and log.md in sync per the vault's own schema.
    const indexFull = path.join(vaultPath, INDEX_REL_PATH);
    if (existsSync(indexFull)) {
      const indexRaw = await readFile(indexFull, 'utf8');
      const latest = entryPreview(text);
      const summaryLine = `- [[${date}]] — ${sections.length} ${sections.length === 1 ? 'entry' : 'entries'}, latest: ${latest} (updated ${date})`;
      const updatedIndex = upsertIndexBullet(indexRaw, 'Journal', date, summaryLine);
      await writeFile(indexFull, updatedIndex, 'utf8');
    }
    const logFull = path.join(vaultPath, LOG_REL_PATH);
    if (existsSync(logFull)) {
      const logRaw = await readFile(logFull, 'utf8');
      const updatedLog = appendLogEntry(logRaw, {
        date,
        summary: `Nova journal entry — [[${date}]]`,
        notes: entry.linkedTitle ? `Reflection linked to [[${entry.linkedTitle}]], written via Nova.` : 'Standalone entry written via Nova.',
      });
      await writeFile(logFull, updatedLog, 'utf8');
    }

    return { date, time, text, linkedTitle: entry.linkedTitle || null };
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
    const parsed = matter(raw);
    const sections = parseSections(parsed.content);
    const idx = sections.findIndex((s) => s.time === time && s.text.trim() === text.trim());
    if (idx === -1) return false;
    await backupFile(full);
    sections.splice(idx, 1);

    if (sections.length === 0) {
      const { unlink } = await import('node:fs/promises');
      await unlink(full);
    } else {
      const frontmatter = { type: 'journal', tags: [], created: parsed.data.created || date, updated: parsed.data.updated || date };
      await writeFile(full, matter.stringify(bodyFor(date, sections), frontmatter), 'utf8');
    }

    // keep the index bullet honest about the new count/preview
    const indexFull = path.join(vaultPath, INDEX_REL_PATH);
    if (existsSync(indexFull) && sections.length > 0) {
      const indexRaw = await readFile(indexFull, 'utf8');
      const latest = entryPreview(sections[sections.length - 1].text);
      const summaryLine = `- [[${date}]] — ${sections.length} ${sections.length === 1 ? 'entry' : 'entries'}, latest: ${latest} (updated ${date})`;
      try {
        await writeFile(indexFull, upsertIndexBullet(indexRaw, 'Journal', date, summaryLine), 'utf8');
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
    days.push({ date, sections: parseSections(content), updated: data.updated || date });
  }
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return limit ? days.slice(0, limit) : days;
}
