import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

// Two-way sync between the vault To-Do page and Todoist's Inbox project.
// Deterministic reconcile, no model call, and non-destructive by design:
// Nova only ever CREATES tasks, CLOSES tasks, and checks/adds vault lines —
// it never deletes on either side. A vault line that vanishes (undo, sweep)
// closes its task; completing a task in Todoist checks the vault line.
// Identity is the to-do's text; editing the words on either side makes a
// new item rather than guessing at a rename.
//
// Connection: TODOIST_TOKEN in server/.env (Todoist → Settings →
// Integrations → Developer → API token). Scope defaults to the account's
// Inbox project; set TODOIST_PROJECT_ID to sync a different one.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'todoist-sync.json');
const API_BASE = () => process.env.NOVA_TODOIST_API || 'https://api.todoist.com/rest/v2';
const TOKEN = () => (process.env.TODOIST_TOKEN || '').trim();

const TODO_REL = 'Wiki/Inbox/To-Do.md'; // same page the inbox 'todo' route files into
const LINE_RE = /^- \[( |x)\] (.*?)(?:\s*_\(added [^)]*\)_)?\s*$/;

export function todoistConfigured() {
  return !!TOKEN();
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ------------------------------- state ---------------------------------- */

async function loadState() {
  if (!existsSync(STATE_PATH())) return { links: [], lastSyncAt: null, lastResult: null };
  try {
    const raw = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    return { links: Array.isArray(raw.links) ? raw.links : [], lastSyncAt: raw.lastSyncAt || null, lastResult: raw.lastResult || null };
  } catch {
    return { links: [], lastSyncAt: null, lastResult: null };
  }
}

async function saveState(state) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STATE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, STATE_PATH());
}

/* ------------------------------ todoist api ------------------------------ */

async function td(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE()}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Todoist ${method} ${pathname} → ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function inboxProjectId() {
  const override = (process.env.TODOIST_PROJECT_ID || '').trim();
  if (override) return override;
  const projects = await td('/projects');
  const inbox = (projects || []).find((p) => p.is_inbox_project);
  if (!inbox) throw new Error('no Inbox project found in this Todoist account');
  return String(inbox.id);
}

/* ------------------------------ vault side ------------------------------- */

async function readVaultTodos(vaultPath) {
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) return { full, raw: null, todos: [] };
  const raw = await readFile(full, 'utf8');
  const todos = [];
  for (const line of raw.split('\n')) {
    const m = line.match(LINE_RE);
    if (m) todos.push({ raw: line, checked: m[1] === 'x', text: m[2].trim() });
  }
  return { full, raw, todos };
}

async function appendVaultTodos(vaultPath, texts) {
  const full = path.join(vaultPath, TODO_REL);
  const date = todayISO();
  if (!existsSync(full)) {
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, matter.stringify('# To-Do\n', { type: 'raw', tags: ['inbox'], created: date, updated: date }), 'utf8');
  }
  await backupFile(full);
  const raw = await readFile(full, 'utf8');
  const lines = texts.map((t) => `- [ ] ${t} _(added ${date})_`);
  await writeFile(full, raw.replace(/\s*$/, '\n') + lines.join('\n') + '\n', 'utf8');
}

async function checkVaultTodos(vaultPath, rawLines) {
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) return 0;
  await backupFile(full);
  let raw = await readFile(full, 'utf8');
  let changed = 0;
  for (const line of rawLines) {
    if (!raw.includes(line)) continue;
    raw = raw.replace(line, line.replace('- [ ]', '- [x]'));
    changed++;
  }
  if (changed) await writeFile(full, raw, 'utf8');
  return changed;
}

/* ------------------------------- reconcile ------------------------------- */

let syncInFlight = null;

// One full reconcile pass. Returns a summary the UI can show verbatim.
export async function syncTodoist(vaultPath) {
  if (!todoistConfigured()) return { configured: false };
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSync(vaultPath).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function doSync(vaultPath) {
  const state = await loadState();
  const summary = { configured: true, at: new Date().toISOString(), pushed: 0, pulled: 0, closedInTodoist: 0, checkedInVault: 0, error: null };

  try {
    const projectId = await inboxProjectId();
    const active = await td(`/tasks?project_id=${encodeURIComponent(projectId)}`) || [];
    const activeById = new Map(active.map((t) => [String(t.id), t]));
    const activeByText = new Map(active.map((t) => [t.content.trim(), t]));

    const vault = await readVaultTodos(vaultPath);
    const openByText = new Map(vault.todos.filter((t) => !t.checked).map((t) => [t.text, t]));
    const checkedTexts = new Set(vault.todos.filter((t) => t.checked).map((t) => t.text));

    const nextLinks = [];
    const linkedTaskIds = new Set();
    const linkedTexts = new Set();
    // Pairs resolved THIS pass: both snapshots (openByText, active) were
    // taken before the link pass, so without these a line we just checked
    // off would be pushed straight back, and a task we just closed would be
    // re-pulled into the vault.
    const resolvedTexts = new Set();
    const closedTaskIds = new Set();

    for (const link of state.links) {
      const task = activeById.get(String(link.taskId));
      const openLine = openByText.get(link.text);
      if (task && openLine) {
        nextLinks.push(link); // still live on both sides
        linkedTaskIds.add(String(link.taskId));
        linkedTexts.add(link.text);
      } else if (task && !openLine) {
        // checked off or removed (undo/sweep) in the vault → close the task
        await td(`/tasks/${link.taskId}/close`, { method: 'POST' });
        summary.closedInTodoist++;
        resolvedTexts.add(link.text);
        closedTaskIds.add(String(link.taskId));
      } else if (!task && openLine) {
        // completed (or deleted) in Todoist → check the vault line
        summary.checkedInVault += await checkVaultTodos(vaultPath, [openLine.raw]);
        resolvedTexts.add(link.text);
      }
      // neither side open → the pair is resolved; the link just drops
    }

    // vault-only open items → push to Todoist (link instead of duplicating
    // when an identical active task already exists, e.g. on the first sync)
    for (const [text] of openByText) {
      if (linkedTexts.has(text) || resolvedTexts.has(text)) continue;
      const existing = activeByText.get(text);
      if (existing) {
        nextLinks.push({ taskId: String(existing.id), text });
        linkedTaskIds.add(String(existing.id));
      } else {
        const created = await td('/tasks', { method: 'POST', body: { content: text, project_id: projectId } });
        nextLinks.push({ taskId: String(created.id), text });
        linkedTaskIds.add(String(created.id));
        summary.pushed++;
      }
      linkedTexts.add(text);
    }

    // todoist-only active tasks → pull into the vault To-Do page
    const toPull = active.filter((t) => !linkedTaskIds.has(String(t.id)) && !closedTaskIds.has(String(t.id)) && !linkedTexts.has(t.content.trim()) && !checkedTexts.has(t.content.trim()) && !resolvedTexts.has(t.content.trim()));
    if (toPull.length) {
      await appendVaultTodos(vaultPath, toPull.map((t) => t.content.trim()));
      for (const t of toPull) nextLinks.push({ taskId: String(t.id), text: t.content.trim() });
      summary.pulled = toPull.length;
    }

    await saveState({ links: nextLinks, lastSyncAt: summary.at, lastResult: summary });
  } catch (e) {
    summary.error = e.message;
    await saveState({ ...state, lastSyncAt: summary.at, lastResult: summary });
  }
  return summary;
}

export async function getTodoistStatus() {
  const state = await loadState();
  return {
    configured: todoistConfigured(),
    linkCount: state.links.length,
    lastSyncAt: state.lastSyncAt,
    lastResult: state.lastResult,
  };
}

// Fire-and-forget hook for the moment a to-do gets filed — keeps Todoist
// fresh without making the filing wait on the network.
export function queueTodoistSync(vaultPath) {
  if (!todoistConfigured()) return;
  setTimeout(() => { syncTodoist(vaultPath).catch(() => {}); }, 500);
}

export function startTodoistScheduler(vaultPath) {
  if (!todoistConfigured()) {
    console.log('todoist sync: not configured (set TODOIST_TOKEN in server/.env to enable)');
    return;
  }
  syncTodoist(vaultPath).catch(() => {});
  setInterval(() => syncTodoist(vaultPath).catch(() => {}), 10 * 60 * 1000);
}
