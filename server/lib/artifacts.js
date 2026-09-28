// DOCUMENTS, FILED. His ask (28 Sep 2026): a chat answer he can open, keep
// and come back to — the thing Claude's own artefacts give him — instead of
// a wall of chat text, and "organised somewhere neatly ... such as the
// Obsidian vault." src/artifactBlocks.js is the shared FORMAT (the
// <<<ARTIFACT … ARTIFACT>>> markers and the [[artifact:<id>]] token); this
// file is the STORE — it turns a finished block into a real file under
// Outputs/Nova/ and answers every question a surface asks about it.
//
// One file per document, matching workoutSessions.js's own convention
// (dated, individually browsable in Obsidian) rather than one shared ledger.
// Correctness first, per the brief: there will be at most a few hundred
// files, so every read walks the folder fresh rather than caching it.
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { parseArtifactBlocks, TOKEN_RE, OPEN, CLOSE } from '../../src/artifactBlocks.js';

const ARTIFACTS_DIR_REL = 'Outputs/Nova';
const FORBIDDEN_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '^', '[', ']'];

// His vault's own rule (CLAUDE.md): Outputs/ is generated deliverables that
// aren't wiki knowledge — exactly what a filed document is.
function safeTitle(raw) {
  let s = String(raw || '');
  for (const ch of FORBIDDEN_CHARS) s = s.split(ch).join(' ');
  s = s.replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return s || 'Untitled document';
}

function wordCount(s) {
  const t = String(s || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function pad(n) { return String(n).padStart(2, '0'); }

function datestamp(d = new Date()) {
  return { month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
}

// A html document rides on disk inside a ```html fence — Obsidian then shows
// it as code instead of a wall of raw tags, and Nova unwraps it to run it.
function fenceHtml(body) { return `\`\`\`html\n${body}\n\`\`\``; }
function unfenceHtml(body) {
  const m = String(body || '').match(/^```(?:html)?\s*\n([\s\S]*?)\n```\s*$/i);
  return m ? m[1] : body;
}

// Every .md under Outputs/Nova, depth-first. `.trash` is skipped unless
// asked for — it is where a trashed document waits, not where a live one
// lives, per NOVA-METHOD's "everything writeable is undoable".
async function listMdFiles(root, { includeTrash = false } = {}) {
  const out = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!includeTrash && e.name === '.trash') continue;
        await walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

async function readArtifactFile(full, vaultPath) {
  const raw = await readFile(full, 'utf8');
  const parsed = matter(raw);
  const data = parsed.data || {};
  if (data.type !== 'nova-artifact') return null;
  const kind = data.kind === 'html' ? 'html' : 'doc';
  const rawBody = String(parsed.content || '').replace(/^\n+/, '').replace(/\s+$/, '');
  const body = kind === 'html' ? unfenceHtml(rawBody) : rawBody;
  return {
    file: full,
    body,
    meta: {
      id: String(data.id || ''),
      title: String(data.title || 'Untitled document'),
      kind,
      agent: data.agent || 'nova',
      summary: String(data.summary || ''),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      created: data.created || null,
      pinned: !!data.pinned,
      revises: data.revises || null,
      question: data.question || null,
      words: wordCount(body),
      path: path.relative(vaultPath, full),
    },
  };
}

async function findArtifactFile(vaultPath, id, { includeTrash = false } = {}) {
  if (!id) return null;
  const root = path.join(vaultPath, ARTIFACTS_DIR_REL);
  for (const f of await listMdFiles(root, { includeTrash })) {
    let r;
    try { r = await readArtifactFile(f, vaultPath); } catch { continue; }
    if (r && r.meta.id === id) return r;
  }
  return null;
}

async function writeArtifactFile(vaultPath, { title, kind, summary, tags, agent, question, revises, body }) {
  const now = new Date();
  const { month, day } = datestamp(now);
  const dir = path.join(vaultPath, ARTIFACTS_DIR_REL, month);
  await mkdir(dir, { recursive: true });
  const cleanTitle = safeTitle(title);
  const baseName = `${day} — ${cleanTitle}`;
  let fileName = `${baseName}.md`;
  let n = 2;
  while (existsSync(path.join(dir, fileName))) {
    fileName = `${baseName} (${n}).md`;
    n += 1;
  }
  const id = randomUUID().slice(0, 8);
  const created = now.toISOString();
  const cleanSummary = String(summary || '').slice(0, 280);
  const cleanQuestion = question ? String(question).trim().slice(0, 300) : null;
  const cleanTags = (Array.isArray(tags) ? tags : []).map(String).slice(0, 6);
  const frontmatter = {
    type: 'nova-artifact',
    id,
    title: String(title || cleanTitle).slice(0, 120),
    kind,
    agent,
    created,
    summary: cleanSummary,
    tags: cleanTags,
    pinned: false,
    ...(cleanQuestion ? { question: cleanQuestion } : {}),
    ...(revises ? { revises } : {}),
  };
  const fileBody = kind === 'html' ? fenceHtml(body) : body;
  const full = path.join(dir, fileName);
  await writeFile(full, matter.stringify(fileBody, frontmatter), 'utf8');
  return {
    id,
    title: frontmatter.title,
    kind,
    agent,
    summary: cleanSummary,
    tags: cleanTags,
    created,
    pinned: false,
    revises: revises || null,
    question: cleanQuestion,
    words: wordCount(body),
    path: path.relative(vaultPath, full),
  };
}

/**
 * Cut the documents out of a reply, file each one under Outputs/Nova, and
 * swap its placeholder for the real [[artifact:<id>]] token. Runs BEFORE any
 * other directive parsing (PROPOSE, CARD, SHOW, REFLECT…) — a directive
 * living inside a document's body must never be mistaken for one belonging
 * to the reply itself.
 *
 * A single block's filing failure never loses the reply: its placeholder
 * becomes one honest line and the rest of the turn proceeds untouched.
 */
export async function fileArtifacts(vaultPath, replyText, { agent = 'nova', question = null } = {}) {
  const { text: cut, blocks } = parseArtifactBlocks(replyText, { final: true });
  let text = cut;
  const artifacts = [];

  for (const block of blocks) {
    const token = `[[artifact:new-${block.n}]]`;
    try {
      let revises = block.header.revises || null;
      if (revises && !(await getArtifact(vaultPath, revises))) revises = null;
      const meta = await writeArtifactFile(vaultPath, {
        title: block.header.title,
        kind: block.header.kind,
        summary: block.header.summary,
        tags: block.header.tags,
        agent,
        question,
        revises,
        body: block.body,
      });
      text = text.replace(token, `[[artifact:${meta.id}]]`);
      artifacts.push(meta);
    } catch (e) {
      console.error(`fileArtifacts: could not save "${block.header.title}": ${e.message}`);
      text = text.replace(token, `(a document could not be saved: ${block.header.title})`);
    }
  }

  // Tokens the model wrote itself — re-showing an older document, or naming
  // one that never existed. Known ids are left exactly as they are (the
  // surface renders them); an unknown id is dropped, not shown broken. The
  // ids just filed above are excluded here — their token was already just
  // swapped in and their meta already pushed; re-matching it would double it.
  const justFiled = new Set(artifacts.map((a) => a.id));
  const ids = new Set();
  for (const m of text.matchAll(new RegExp(TOKEN_RE.source, TOKEN_RE.flags))) {
    const id = m[1].toLowerCase();
    if (!id.startsWith('new-') && id !== 'pending' && !justFiled.has(id)) ids.add(id);
  }
  for (const id of ids) {
    const existing = await getArtifact(vaultPath, id);
    if (existing) {
      const { body: _body, ...meta } = existing;
      artifacts.push(meta);
    } else {
      text = text.replace(new RegExp(`\\n?[ \\t]*\\[\\[artifact:${id}\\]\\][ \\t]*(?=\\n|$)`, 'gi'), '');
    }
  }

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), artifacts };
}

export async function listArtifacts(vaultPath, { q, agent, kind, pinned, limit = 200 } = {}) {
  const root = path.join(vaultPath, ARTIFACTS_DIR_REL);
  const all = [];
  for (const f of await listMdFiles(root)) {
    try {
      const r = await readArtifactFile(f, vaultPath);
      if (r) all.push(r.meta);
    } catch { /* an unreadable file is skipped, not fatal to the list */ }
  }
  let items = all;
  if (agent) items = items.filter((a) => a.agent === agent);
  if (kind) items = items.filter((a) => a.kind === kind);
  if (pinned !== undefined) items = items.filter((a) => a.pinned === !!pinned);
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((a) => a.title.toLowerCase().includes(needle)
      || a.summary.toLowerCase().includes(needle)
      || a.tags.some((t) => t.toLowerCase().includes(needle)));
  }
  items.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0)); // newest first
  return { items: items.slice(0, Math.max(0, limit)), total: items.length };
}

export async function getArtifact(vaultPath, id) {
  const r = await findArtifactFile(vaultPath, id);
  return r ? { ...r.meta, body: r.body } : null;
}

export async function setPinned(vaultPath, id, pinned) {
  const r = await findArtifactFile(vaultPath, id);
  if (!r) return null;
  const raw = await readFile(r.file, 'utf8');
  const parsed = matter(raw);
  parsed.data.pinned = !!pinned;
  await writeFile(r.file, matter.stringify(parsed.content, parsed.data), 'utf8');
  return { ...r.meta, pinned: !!pinned };
}

// The undo of a document's creation: move it to .trash rather than delete
// it, exactly like every other writeable thing in Nova.
export async function trashArtifact(vaultPath, id) {
  const r = await findArtifactFile(vaultPath, id);
  if (!r) return null;
  const root = path.join(vaultPath, ARTIFACTS_DIR_REL);
  const trashDir = path.join(root, '.trash');
  await mkdir(trashDir, { recursive: true });
  let dest = path.join(trashDir, path.basename(r.file));
  let n = 2;
  while (existsSync(dest)) {
    const ext = path.extname(dest);
    dest = path.join(trashDir, `${path.basename(dest, ext)} (${n})${ext}`);
    n += 1;
  }
  await rename(r.file, dest);
  return { id, path: path.relative(vaultPath, dest) };
}

// Moves a trashed file back to the month folder its own filename names
// (its date prefix), never to "wherever it happened to be found" — a
// restore should land exactly where a fresh filing of that document would.
export async function restoreArtifact(vaultPath, id) {
  const root = path.join(vaultPath, ARTIFACTS_DIR_REL);
  const trashDir = path.join(root, '.trash');
  for (const f of await listMdFiles(trashDir, { includeTrash: true })) {
    let r;
    try { r = await readArtifactFile(f, vaultPath); } catch { continue; }
    if (!r || r.meta.id !== id) continue;
    const dateMatch = path.basename(f).match(/^(\d{4})-(\d{2})-\d{2}/);
    const month = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : 'undated';
    const destDir = path.join(root, month);
    await mkdir(destDir, { recursive: true });
    let dest = path.join(destDir, path.basename(f));
    let n = 2;
    while (existsSync(dest)) {
      const ext = path.extname(dest);
      dest = path.join(destDir, `${path.basename(dest, ext)} (${n})${ext}`);
      n += 1;
    }
    await rename(f, dest);
    return { id, path: path.relative(vaultPath, dest) };
  }
  return null;
}

// What an agent is told about its own filed work — the ledger that lets
// "show me that plan again" and "revise the one from Tuesday" work without
// the model ever inventing an id.
export async function recentArtifactsContext(vaultPath, { limit = 12 } = {}) {
  const { items } = await listArtifacts(vaultPath, { limit });
  if (!items.length) return '';
  const lines = items.map((a) => `- [${a.id}] ${a.title} (${a.agent}, ${a.created ? a.created.slice(0, 10) : 'undated'}) — ${a.path}`);
  return `DOCUMENTS ALREADY FILED (Read one for its content; put [[artifact:<id>]] on its own line to show it again; write a new one with "revises":"<id>" to update it):\n${lines.join('\n')}`;
}

// WHAT EVERY CONVERSATIONAL AGENT IS TOLD. One contract, used by Ask Nova,
// the Coach and the Leader, so a document from any of the three looks and
// behaves the same way on his screen. Pairs with src/artifactBlocks.js —
// change the syntax there and this text together.
export const ARTIFACT_CONTRACT = `THE DOCUMENTS — a deliverable goes in a document, not the chat.

His own ask: a chat he can open, keep and come back to, the way Claude's own artefacts work. When your reply IS a deliverable — a plan or program, a schedule, a report, a comparison or analysis, a guide or checklist, a table, anything with real structure, or longer than about 150 words — or whenever he asks for a document/report/plan/table/breakdown, put it in a document and keep the chat reply to one to three sentences ABOUT it. Never paste a document's content into the chat as well as filing it.

SYNTAX — an opening line with a JSON header, the body, a closing line:
${OPEN} {"title":"…","kind":"doc","summary":"one short line"}
…the document…
${CLOSE}

kind "doc" (the default) is markdown: headings, short paragraphs, bullet lists, tables, and glass panels as fenced \`\`\`nova blocks — the same JSON the running glass draws. Example:
\`\`\`nova
{"kind":"bars","label":"WEEKLY SETS","bars":[{"name":"Chest","value":12},{"name":"Back","value":18}]}
\`\`\`
\`\`\`nova
{"kind":"metric","label":"PROTEIN TODAY","value":"84","unit":"g"}
\`\`\`

kind "html" is for something INTERACTIVE he would actually use — a calculator, a tracker, a planner he can tick, a chart he can adjust: one complete self-contained HTML page, inline CSS and JS only, no external scripts/fonts/network requests, dark background (#0b0d12), system font stack, generous spacing.

Several documents in one reply are fine. To show one that already exists, put \`[[artifact:<id>]]\` on its own line — ids are in your filed documents below. To update one, write a new document with "revises":"<id>" in its header. In a SPOKEN turn the document is still made; he only HEARS the short reply.`;
