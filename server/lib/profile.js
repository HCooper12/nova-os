import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

// Hayden's operating profile — the ROOT context every model-based agent
// reasons from (per NOVA-METHOD.md's context ledger: "who Hayden is" is the
// highest-leverage missing context). It's a vault page he owns and can edit
// in Obsidian; Nova reads it into the top of every conversation so answers
// point at what he's actually working toward, not just his data.

const PROFILE_REL = 'Wiki/Profile.md';

// THE SECTIONS (his ask, 26 Oct 2026: "Nova has full context of me in an MD
// file in the vault", filled by talking). The body holds one `## <title>`
// section per entry, in this order. A section Claude wrote that he has not
// yet confirmed ends with the DRAFTED line below; it stays in the file (he
// reads it in Obsidian) and is lifted out as provenance when parsed. Headings
// not listed here are his own and are kept untouched on every write.
export const PROFILE_SECTIONS = [
  { key: 'about', title: 'About me' },
  { key: 'toward', title: "What I'm working toward" },
  { key: 'training', title: 'Training' },
  { key: 'fuel', title: 'Fuel' },
  { key: 'work', title: 'Work and projects' },
  { key: 'mind', title: 'Mind and learning' },
  { key: 'life', title: 'Life' },
  { key: 'talk', title: 'How to talk to me' },
  { key: 'taste', title: 'Taste' },
];

const DRAFTED_RE = /^_Drafted by Claude,\s*([^.]*?)\.\s*Not yet confirmed by Hayden\._\s*$/;

function pad(n) { return String(n).padStart(2, '0'); }
// his day, not UTC (the server runs on his Mac, in AEST)
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function draftedLine(date) {
  return `_Drafted by Claude, ${date}. Not yet confirmed by Hayden._`;
}

// raw file → { fm: the frontmatter block verbatim ('' when none), body }
function splitRaw(raw) {
  const m = String(raw).match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? { fm: m[0], body: raw.slice(m[0].length) } : { fm: '', body: String(raw) };
}

// body → { head: everything before the first `## ` heading, chunks: [{ title, raw }] }
// Each chunk's raw text includes its heading line; joining head + every raw
// gives back the body exactly.
function splitBody(body) {
  const lines = String(body).split(/(?<=\n)/);
  let head = '';
  const chunks = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h && !/^###/.test(line)) chunks.push({ title: h[1].trim(), raw: line });
    else if (chunks.length) chunks[chunks.length - 1].raw += line;
    else head += line;
  }
  return { head, chunks };
}

// a chunk's body → { text, drafted, draftedOn }
function readChunk(raw) {
  const lines = raw.replace(/^[^\n]*\n?/, '').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let drafted = false;
  let draftedOn = null;
  const m = lines.length ? lines[lines.length - 1].trim().match(DRAFTED_RE) : null;
  if (m) {
    drafted = true;
    draftedOn = (m[1].match(/\d{4}-\d{2}-\d{2}/) || [null])[0];
    lines.pop();
  }
  return { text: lines.join('\n').trim(), drafted, draftedOn };
}

const sectionByTitle = (title) => PROFILE_SECTIONS.find((s) => s.title.toLowerCase() === String(title).toLowerCase());

export function parseSections(body) {
  const { chunks } = splitBody(body);
  return PROFILE_SECTIONS.map(({ key, title }) => {
    const c = chunks.find((ch) => sectionByTitle(ch.title)?.key === key);
    if (!c) return { key, title, text: '', drafted: false, draftedOn: null };
    const r = readChunk(c.raw);
    return { key, title, text: r.text, drafted: r.drafted && !!r.text, draftedOn: r.text ? r.draftedOn : null };
  });
}

function knowsOf(sections) {
  const filled = sections.filter((s) => s.text).length;
  const confirmed = sections.filter((s) => s.text && !s.drafted).length;
  return { filled, confirmed, total: PROFILE_SECTIONS.length };
}

export async function getProfile(vaultPath) {
  const full = path.join(vaultPath, PROFILE_REL);
  if (!existsSync(full)) return null;
  try {
    const raw = await readFile(full, 'utf8');
    const { data, content } = matter(raw);
    const notes = content.replace(/^#[^\n]*\n?/, '').trim();
    const sections = parseSections(content);
    return {
      focus: String(data.focus || '').trim(),
      priorities: Array.isArray(data.priorities) ? data.priorities.map((p) => String(p).trim()).filter(Boolean) : [],
      bestSelf: String(data.bestSelf || '').trim(),
      notes,
      intake: data.intake && typeof data.intake === 'object' ? data.intake : null,
      updated: data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : (data.updated || null),
      sections,
      knows: knowsOf(sections),
    };
  } catch {
    return null;
  }
}

// The free text above the first `##` heading, minus the `# Profile` title:
// what the old form editor called "notes" before the page had sections.
function introOf(body) {
  return splitBody(body).head.replace(/^#[^\n]*\n?/, '').trim();
}

export async function setProfile(vaultPath, input) {
  const focus = String(input.focus || '').trim().slice(0, 400);
  const priorities = (Array.isArray(input.priorities) ? input.priorities : String(input.priorities || '').split('\n'))
    .map((p) => String(p).trim()).filter(Boolean).slice(0, 8).map((p) => p.slice(0, 200));
  const bestSelf = String(input.bestSelf || '').trim().slice(0, 600);
  const hasNotes = input.notes !== undefined && input.notes !== null;
  const notesIn = String(input.notes ?? '').trim();
  if (!focus && !priorities.length && !bestSelf && !notesIn) {
    throw new Error('add something to save — a focus line, a priority, anything');
  }

  const full = path.join(vaultPath, PROFILE_REL);
  await mkdir(path.dirname(full), { recursive: true });
  const priorRaw = existsSync(full) ? await readFile(full, 'utf8') : null;
  if (priorRaw !== null) await backupFile(full);
  const frontmatter = { type: 'profile', focus, bestSelf, updated: localDay() };
  if (priorities.length) frontmatter.priorities = priorities;
  // the Intake's numbers live on this page too — never dropped by a prose edit
  const prior = await getProfile(vaultPath);
  if (prior?.intake) frontmatter.intake = prior.intake;
  // THE SECTIONS SURVIVE THE OLD FORM (26 Oct 2026). Before, this wrote
  // `# Profile` + notes and nothing else, so a save without notes wiped the
  // whole body. Now: no notes sent keeps the body as it is; notes WITH `##`
  // headings are the whole body round-tripped (getProfile's `notes`); notes
  // without headings replace only the intro above the first section, and
  // every section (his own headings too) is kept.
  const priorBody = priorRaw !== null ? matter(priorRaw).content : '';
  const { chunks } = splitBody(priorBody);
  let bodyText;
  if (!hasNotes) bodyText = priorBody.replace(/^#[^\n]*\n?/, '').trim();
  else if (/^##\s+\S/m.test(notesIn)) bodyText = notesIn.slice(0, 40000);
  else {
    const kept = chunks.map((c) => c.raw.replace(/\s+$/, '')).join('\n\n');
    bodyText = [notesIn.slice(0, 4000), kept].filter(Boolean).join('\n\n');
  }
  await writeFile(full, matter.stringify(`# Profile\n\n${bodyText}\n`, frontmatter), 'utf8');
  return getProfile(vaultPath);
}

// ONE SECTION, rewritten in place. Frontmatter is kept verbatim (only its
// `updated:` line moves to today) and every other part of the body is kept
// byte for byte. Returns the full prior file text so the inbox can undo the
// write exactly (restoreProfileText).
//   replace (default): the section becomes `text`; it is his now, so the
//     drafted line goes.
//   append: `- text (said <date>)` is added under the section; a drafted
//     section stays drafted (the draft itself is still unconfirmed).
//   confirm: the drafted line goes (with no text, the section's words stay).
export async function setSection(vaultPath, key, text, { confirm = false, append = false, said = null, now = new Date() } = {}) {
  const spec = PROFILE_SECTIONS.find((s) => s.key === key);
  if (!spec) throw new Error(`there is no "${key}" section on the profile page`);
  const clean = String(text ?? '').replace(/\r/g, '').trim();
  if (append && !clean) throw new Error('nothing to add to the section');

  const full = path.join(vaultPath, PROFILE_REL);
  await mkdir(path.dirname(full), { recursive: true });
  const prior = existsSync(full) ? await readFile(full, 'utf8') : null;
  if (prior !== null) await backupFile(full);
  const today = localDay(now);

  let fm;
  let body;
  if (prior === null) {
    fm = matter.stringify('', { type: 'profile', updated: today }).replace(/\n*$/, '\n');
    body = '# Profile\n';
  } else {
    ({ fm, body } = splitRaw(prior));
    if (fm) {
      fm = /^updated:.*$/m.test(fm)
        ? fm.replace(/^updated:.*$/m, `updated: '${today}'`)
        : fm.replace(/\r?\n---(\r?\n?)$/, `\nupdated: '${today}'\n---$1`);
      if (!/\n$/.test(fm)) fm += '\n';
    }
  }

  const { head, chunks } = splitBody(body);
  const idx = chunks.findIndex((c) => sectionByTitle(c.title)?.key === key);
  const cur = idx >= 0 ? readChunk(chunks[idx].raw) : { text: '', drafted: false, draftedOn: null };

  let nextText;
  let keepDraft;
  if (append) {
    const line = `- ${clean.replace(/\n+/g, ' ')}${said ? ` (said ${said})` : ''}`;
    nextText = cur.text ? `${cur.text}\n${line}` : line;
    keepDraft = cur.drafted && !confirm;
  } else if (confirm && !clean) {
    nextText = cur.text;
    keepDraft = false;
  } else {
    nextText = clean;
    keepDraft = false;
  }

  const isLast = (i) => i === chunks.length - 1;
  const render = (last) => {
    const lines = [nextText, keepDraft ? draftedLine(cur.draftedOn || today) : null].filter(Boolean).join('\n\n');
    return `## ${spec.title}\n\n${lines}\n${last ? '' : '\n'}`;
  };

  if (idx >= 0) {
    if (!nextText) chunks.splice(idx, 1);
    else {
      // keep his own heading spelling if it differs only in case
      chunks[idx] = { title: chunks[idx].title, raw: render(isLast(idx)).replace(/^## [^\n]*/, () => chunks[idx].raw.match(/^[^\n]*/)[0]) };
    }
  } else if (nextText) {
    // placed among the known sections in PROFILE_SECTIONS order
    const order = (c) => PROFILE_SECTIONS.findIndex((s) => s.key === sectionByTitle(c.title)?.key);
    const mine = PROFILE_SECTIONS.findIndex((s) => s.key === key);
    // right after the last known section that comes before it; else before
    // the first that comes after it; else at the end
    let at = -1;
    chunks.forEach((c, i) => { const o = order(c); if (o >= 0 && o < mine) at = i + 1; });
    if (at < 0) at = chunks.findIndex((c) => order(c) > mine);
    if (at < 0) at = chunks.length;
    chunks.splice(at, 0, { title: spec.title, raw: render(at === chunks.length) });
  }

  // seams: every chunk but the last ends in a blank line
  let headOut = head;
  if (chunks.length && headOut && !/\n\n$/.test(headOut)) headOut = headOut.replace(/\n?$/, '\n\n');
  for (let i = 0; i < chunks.length - 1; i++) {
    if (!/\n\n$/.test(chunks[i].raw)) chunks[i].raw = chunks[i].raw.replace(/\n?$/, '\n\n');
  }
  if (chunks.length && !/\n$/.test(chunks[chunks.length - 1].raw)) chunks[chunks.length - 1].raw += '\n';

  await writeFile(full, fm + headOut + chunks.map((c) => c.raw).join(''), 'utf8');
  return { prior, profile: await getProfile(vaultPath) };
}

// Undo for setSection: the page exactly as it was (null = there was no page).
export async function restoreProfileText(vaultPath, priorText) {
  const full = path.join(vaultPath, PROFILE_REL);
  if (existsSync(full)) await backupFile(full);
  if (priorText === null || priorText === undefined) {
    if (existsSync(full)) await unlink(full);
    return null;
  }
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, priorText, 'utf8');
  return getProfile(vaultPath);
}

// THE INTAKE's facts and derived numbers (lib/intake.js), kept beside his
// words on the same page. Everything else on the page is preserved; the
// prior block comes back so the inbox can undo the write.
export async function setIntake(vaultPath, intake) {
  const full = path.join(vaultPath, PROFILE_REL);
  const prior = await getProfile(vaultPath);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  const frontmatter = { type: 'profile', focus: prior?.focus || '', bestSelf: prior?.bestSelf || '', updated: localDay() };
  if (prior?.priorities?.length) frontmatter.priorities = prior.priorities;
  if (intake) frontmatter.intake = intake;
  await writeFile(full, matter.stringify(`# Profile\n\n${prior?.notes || ''}\n`, frontmatter), 'utf8');
  return { prior: prior?.intake || null, profile: await getProfile(vaultPath) };
}

export function intakeLine(intake) {
  if (!intake?.plan) return null;
  const p = intake.plan, f = intake.facts || {};
  return `- His numbers (Intake, ${intake.on || 'undated'}, code-computed from ${f.weightKg} kg / ${f.heightCm} cm / ${f.age}y, ${f.activity}, goal ${f.goal}): ${p.targetKcal} kcal, ${p.proteinG} g protein floor, ${p.fatG} g fat, ${p.carbsG} g carbs, TDEE ${p.tdee}. Treat these as HIS targets, not a suggestion.`;
}

// Compact block for the top of agent prompts. When empty, it tells the agent
// to reason honestly without it AND to nudge Hayden — an unset profile is a
// gap the lens should surface, not paper over.
export async function profileContext(vaultPath) {
  const p = await getProfile(vaultPath);
  const sections = p?.sections || [];
  const anySection = sections.some((s) => s.text);
  if (!p || (!p.focus && !p.priorities.length && !p.bestSelf && !p.notes && !p.intake && !anySection)) {
    return 'ABOUT HAYDEN: no profile set yet. Reason from his data as usual, and if knowing his broader goals or priorities would let you answer better, say so and point him to "About You" in Settings.';
  }
  let intro = '';
  try { intro = introOf(matter(await readFile(path.join(vaultPath, PROFILE_REL), 'utf8')).content); } catch { intro = ''; }
  const flat = (t) => t.split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean).join('; ');
  return [
    'ABOUT HAYDEN (from his profile page; sections marked drafted are Claude\'s draft, not his words):',
    p.focus ? `- Current focus: ${p.focus}` : null,
    p.priorities.length ? `- Priorities right now: ${p.priorities.join('; ')}` : null,
    p.bestSelf ? `- What performing at his best means to him: ${p.bestSelf}` : null,
    ...sections.filter((s) => s.text).map((s) => `- ${s.title}: ${s.drafted
      ? `(drafted by Claude on ${s.draftedOn || 'an unknown date'}, not yet confirmed by Hayden; treat as likely, not as his words) `
      : ''}${flat(s.text)}`),
    intro ? `- Context & constraints: ${intro}` : null,
    intakeLine(p.intake),
    `- Nova knows ${p.knows.confirmed} of ${p.knows.total} sections confirmed (${p.knows.filled} filled). When a section he is asking about is empty or drafted, ask him about it rather than guess.`,
  ].filter(Boolean).join('\n');
}
