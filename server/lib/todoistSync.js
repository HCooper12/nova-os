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
// Unified API v1 — REST v2 was retired in 2025 and now returns 410 Gone.
const API_BASE = () => process.env.NOVA_TODOIST_API || 'https://api.todoist.com/api/v1';
const TOKEN = () => (process.env.TODOIST_TOKEN || '').trim();

// Line format, categories, and the shared write lock come from todoLine.js —
// the one contract for this page. Identity for sync purposes stays TEXT only.
import { TODO_REL, TODO_CATEGORIES, parseTodoLine, formatTodoLine, flipTodoLine, withTodoLock } from './todoLine.js';
const KNOWN_CATEGORIES = new Set(TODO_CATEGORIES);

export function todoistConfigured() {
  return !!TOKEN();
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ------------------------------- state ---------------------------------- */

async function loadState() {
  const empty = { links: [], heldBack: [], lastSyncAt: null, lastResult: null };
  if (!existsSync(STATE_PATH())) return empty;
  try {
    const raw = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    return {
      links: Array.isArray(raw.links) ? raw.links : [],
      // vault lines whose Todoist task HE DELETED — kept open, not re-pushed
      heldBack: Array.isArray(raw.heldBack) ? raw.heldBack : [],
      lastSyncAt: raw.lastSyncAt || null,
      lastResult: raw.lastResult || null,
    };
  } catch {
    return empty;
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

// v1 list endpoints return { results, next_cursor } pages; follow the cursor.
async function tdList(pathname) {
  const items = [];
  let cursor = null;
  do {
    const sep = pathname.includes('?') ? '&' : '?';
    const page = await td(cursor ? `${pathname}${sep}cursor=${encodeURIComponent(cursor)}` : pathname);
    if (Array.isArray(page)) return page; // tolerate plain arrays (stubs)
    items.push(...(page?.results || []));
    cursor = page?.next_cursor || null;
  } while (cursor);
  return items;
}

// What became of a linked task that left the active list: 'completed' |
// 'deleted' | 'moved' | 'unknown'. One GET by id. Verified on his real
// account, 2 Sep 2026: a completed task reads back checked:true, a deleted
// one is_deleted:true (still 200, not 404), and a task moved to another
// project is neither. Any failure is 'unknown' and falls back to the old
// behaviour (check the line) — the API not answering is not evidence.
async function taskFate(taskId) {
  try {
    const t = await td(`/tasks/${encodeURIComponent(taskId)}`);
    if (!t) return 'unknown';
    if (t.checked || t.is_completed) return 'completed';
    if (t.is_deleted) return 'deleted';
    return 'moved';
  } catch {
    return 'unknown';
  }
}

async function inboxProjectId() {
  const override = (process.env.TODOIST_PROJECT_ID || '').trim();
  if (override) return override;
  const projects = await tdList('/projects');
  const inbox = projects.find((p) => p.inbox_project || p.is_inbox_project);
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
    const parsed = parseTodoLine(line);
    if (parsed) todos.push({ raw: line, checked: parsed.checked, text: parsed.text, category: KNOWN_CATEGORIES.has(parsed.category) ? parsed.category : null });
  }
  return { full, raw, todos };
}

// entries: [{ text, category|null }] — pulled Todoist labels become tags
async function appendVaultTodos(vaultPath, entries) {
  return withTodoLock(async () => {
    const full = path.join(vaultPath, TODO_REL);
    const date = todayISO();
    if (!existsSync(full)) {
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, matter.stringify('# To-Do\n', { type: 'raw', tags: ['inbox'], created: date, updated: date }), 'utf8');
    }
    await backupFile(full);
    const raw = await readFile(full, 'utf8');
    const lines = entries.map((e) => formatTodoLine({ text: e.text, added: date, category: e.category }));
    await writeFile(full, raw.replace(/\s*$/, '\n') + lines.join('\n') + '\n', 'utf8');
  });
}

async function checkVaultTodos(vaultPath, rawLines) {
  return withTodoLock(async () => {
    const full = path.join(vaultPath, TODO_REL);
    if (!existsSync(full)) return 0;
    await backupFile(full);
    let raw = await readFile(full, 'utf8');
    let changed = 0;
    for (const line of rawLines) {
      if (!raw.includes(line)) continue;
      raw = raw.replace(line, flipTodoLine(line, true));
      changed++;
    }
    if (changed) await writeFile(full, raw, 'utf8');
    return changed;
  });
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
  const summary = { configured: true, at: new Date().toISOString(), pushed: 0, pulled: 0, closedInTodoist: 0, checkedInVault: 0, deletedInTodoist: 0, movedInTodoist: 0, note: null, error: null };

  try {
    const projectId = await inboxProjectId();
    const active = (await tdList(`/tasks?project_id=${encodeURIComponent(projectId)}&limit=200`)).filter((t) => !t.checked);
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
    // Lines whose task he deleted stay held back while the line is still open
    // and unchanged; editing the words makes a new item, as everywhere here.
    const heldBack = state.heldBack.filter((h) => openByText.has(h.text));
    const heldBackTexts = new Set(heldBack.map((h) => h.text));

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
        // Left the active list — but completed and DELETED looked identical
        // from here, and a line he deleted the task for was being checked as
        // done (audit [42]). One GET by id tells them apart.
        const fate = await taskFate(link.taskId);
        if (fate === 'deleted') {
          // his deletion is not a completion: the vault line stays OPEN and
          // is not pushed back — that would undo what he just did
          summary.deletedInTodoist++;
          resolvedTexts.add(link.text);
          if (!heldBackTexts.has(link.text)) { heldBack.push({ text: link.text, taskId: String(link.taskId), at: summary.at }); heldBackTexts.add(link.text); }
        } else if (fate === 'moved') {
          // still live, just outside this project — keep the pair so the line
          // is neither checked nor duplicated into the Inbox
          nextLinks.push(link);
          linkedTaskIds.add(String(link.taskId));
          linkedTexts.add(link.text);
          summary.movedInTodoist++;
        } else {
          summary.checkedInVault += await checkVaultTodos(vaultPath, [openLine.raw]);
          resolvedTexts.add(link.text);
        }
      }
      // neither side open → the pair is resolved; the link just drops
    }

    // vault-only open items → push to Todoist with the category as a label
    // (link instead of duplicating when an identical active task exists)
    for (const [text, line] of openByText) {
      if (linkedTexts.has(text) || resolvedTexts.has(text) || heldBackTexts.has(text)) continue;
      const existing = activeByText.get(text);
      if (existing) {
        nextLinks.push({ taskId: String(existing.id), text });
        linkedTaskIds.add(String(existing.id));
      } else {
        const body = { content: text, project_id: projectId };
        if (line.category) body.labels = [line.category];
        const created = await td('/tasks', { method: 'POST', body });
        nextLinks.push({ taskId: String(created.id), text });
        linkedTaskIds.add(String(created.id));
        summary.pushed++;
      }
      linkedTexts.add(text);
    }

    // todoist-only active tasks → pull into the vault, labels → category tag
    const toPull = active.filter((t) => !linkedTaskIds.has(String(t.id)) && !closedTaskIds.has(String(t.id)) && !linkedTexts.has(t.content.trim()) && !checkedTexts.has(t.content.trim()) && !resolvedTexts.has(t.content.trim()));
    if (toPull.length) {
      await appendVaultTodos(vaultPath, toPull.map((t) => ({
        text: t.content.trim(),
        category: (t.labels || []).map((l) => String(l).toLowerCase()).find((l) => KNOWN_CATEGORIES.has(l)) || null,
      })));
      for (const t of toPull) nextLinks.push({ taskId: String(t.id), text: t.content.trim() });
      summary.pulled = toPull.length;
    }

    if (summary.deletedInTodoist || heldBack.length) {
      const n = heldBack.length;
      summary.note = `${n} task${n === 1 ? '' : 's'} deleted in Todoist — ${n === 1 ? 'its line stays' : 'their lines stay'} open in the vault`;
    }
    await saveState({ links: nextLinks, heldBack, lastSyncAt: summary.at, lastResult: summary });
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
    heldBackCount: state.heldBack.length,
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
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('todoist');
    return syncTodoist(vaultPath).catch(() => {});
  };
  tick();
  setInterval(tick, 10 * 60 * 1000);
}
