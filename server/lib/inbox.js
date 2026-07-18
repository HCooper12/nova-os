import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import matter from 'gray-matter';
import { backupFile } from './backup.js';
import { createRecord, updateRecord, getRecord } from './inboxStore.js';
import { addItemsDirect, removeItems, SHOPPING_CATEGORIES } from './shoppingList.js';
import * as journal from './journal.js';
import * as foodLog from './foodLog.js';

// The Nova Inbox: capture any loose thought, let a READ-ONLY classifier make
// exactly one typed routing decision, then let deterministic code do the
// actual write. The model never touches files — it only emits JSON; filing,
// undo, and history are plain code. (Architecture borrowed from the
// classic second-brain pipeline: capture → classify & route → file.)

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';
const INBOX_DIR_REL = 'Wiki/Inbox';
const TODO_REL = 'Wiki/Inbox/To-Do.md';

export const ROUTES = ['shopping', 'journal', 'todo', 'note', 'food'];
export const MODES = ['review-all', 'auto-high', 'auto-all'];

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/* ------------------------------ classifier ------------------------------ */

function buildPrompt(text) {
  return `You are the inbox classifier for Nova, Hayden's personal OS backed by an Obsidian vault. A loose thought was just captured (typed or dictated). Make exactly ONE routing decision for it.

Routes and their payloads:
- "shopping" — things to buy. payload: {"items": [{"name": "...", "category": "..."}]} with category exactly one of: ${SHOPPING_CATEGORIES.join(', ')}. Clean each name to a short shopping-list form.
- "food" — food ALREADY EATEN to log (e.g. "just ate a protein bar"). payload: {"name": "...", "macros": {"p": 0, "c": 0, "f": 0, "kcal": 0}} — estimate macros for the described portion (whole numbers).
- "todo" — an action to do later. payload: {"items": ["short action atom", ...]} — imperative, concrete.
- "journal" — a reflection, feeling, or diary-style thought about the day or life. payload: {"text": "..."} — lightly cleaned (fix dictation stumbles, keep the voice; never invent content).
- "note" — an idea, insight, or piece of knowledge worth keeping. payload: {"title": "Short Title Case Name", "body": "..."} — cleaned prose, keep the substance intact.

Also output:
- "title": a short label for the history list (≤ 8 words)
- "confidence": "high" ONLY when both the route and the payload extraction are unambiguous; otherwise "low"
- "reason": one short sentence explaining the routing (and, if confidence is low, what was ambiguous)

Rules: dictated text may have transcription errors — clean them. If the thought mixes several intents, pick the dominant one and set confidence "low". If it fits nothing well, use "note" with confidence "low". Today's date is ${todayISO()}.

The captured thought:
"""
${text}
"""

Output ONLY a JSON object with exactly these keys: route, confidence, title, reason, payload. No markdown, no code fences, no commentary.`;
}

// Pure + exported for tests: coerces whatever the model produced into a safe,
// fully-typed decision (or throws if it's unusable).
export function normalizeDecision(parsed) {
  const route = ROUTES.includes(parsed.route) ? parsed.route : 'note';
  const confidence = parsed.confidence === 'high' ? 'high' : 'low';
  const title = String(parsed.title || '').trim().slice(0, 80) || 'Captured thought';
  const reason = String(parsed.reason || '').trim().slice(0, 300);
  const p = parsed.payload || {};
  let payload;
  if (route === 'shopping') {
    const items = (Array.isArray(p.items) ? p.items : [])
      .map((it) => ({
        name: String(it?.name || '').trim().slice(0, 80),
        category: SHOPPING_CATEGORIES.includes(it?.category) ? it.category : 'Household & Other',
      }))
      .filter((it) => it.name);
    if (!items.length) throw new Error('classifier returned no shopping items');
    payload = { items };
  } else if (route === 'food') {
    const m = p.macros || {};
    const name = String(p.name || '').trim().slice(0, 80);
    if (!name) throw new Error('classifier returned no food name');
    payload = {
      name,
      macros: { p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0, kcal: Number(m.kcal) || 0 },
    };
  } else if (route === 'todo') {
    const items = (Array.isArray(p.items) ? p.items : []).map((s) => String(s || '').trim().slice(0, 200)).filter(Boolean);
    if (!items.length) throw new Error('classifier returned no to-do items');
    payload = { items };
  } else if (route === 'journal') {
    const text = String(p.text || '').trim();
    if (!text) throw new Error('classifier returned no journal text');
    payload = { text };
  } else {
    const noteTitle = String(p.title || title).trim().slice(0, 120) || 'Captured Note';
    const body = String(p.body || '').trim();
    if (!body) throw new Error('classifier returned no note body');
    payload = { title: noteTitle, body };
  }
  return { route, confidence, title, reason, payload };
}

function classify(text, onDone) {
  const child = spawn(CLAUDE_BIN, [
    '-p', buildPrompt(text),
    '--model', 'haiku',
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', '',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--no-session-persistence',
  ]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) return onDone(new Error(stderr.trim() || `claude exited with code ${code}`));
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'classification failed');
      const body = (outer.result || '').trim();
      const jsonMatch = body.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(body.slice(0, 200) || 'no JSON in classifier response');
      onDone(null, normalizeDecision(JSON.parse(jsonMatch[0])));
    } catch (e) {
      onDone(e);
    }
  });
  child.on('error', (err) => onDone(err));
}

/* ------------------------- deterministic filing ------------------------- */

function sanitizeFilename(title) {
  const cleaned = title.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Captured Note').slice(0, 80);
}

async function ensureInboxNote(vaultPath, relPath, headline) {
  const full = path.join(vaultPath, relPath);
  if (existsSync(full)) return full;
  await mkdir(path.dirname(full), { recursive: true });
  const date = todayISO();
  const content = matter.stringify(`# ${headline}\n`, { type: 'raw', tags: ['inbox'], created: date, updated: date });
  await writeFile(full, content, 'utf8');
  return full;
}

// Files a normalized decision into the vault / data stores. Plain code only —
// returns { destination, undo } where undo carries exactly what is needed to
// revert this one filing later.
export async function fileDecision(vaultPath, decision, { source = 'inbox' } = {}) {
  const { route, payload } = decision;
  const date = todayISO();

  if (route === 'shopping') {
    const added = await addItemsDirect(vaultPath, payload.items.map((it) => ({ ...it, source })));
    return {
      destination: `Shopping List — ${added.map((i) => i.name).join(', ')}`,
      undo: { route, ids: added.map((i) => i.id) },
    };
  }

  if (route === 'food') {
    const day = await foodLog.addEntry({ name: payload.name, macros: payload.macros });
    const entry = day.entries[day.entries.length - 1];
    const m = entry.macros;
    return {
      destination: `Food log — ${entry.name} (${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal)`,
      undo: { route, date: day.date, entryId: entry.id },
    };
  }

  if (route === 'journal') {
    const saved = await journal.addEntry(vaultPath, { text: payload.text });
    return {
      destination: `Journal — ${saved.date} ${saved.time}`,
      undo: { route, date: saved.date, time: saved.time, text: saved.text },
    };
  }

  if (route === 'todo') {
    const full = await ensureInboxNote(vaultPath, TODO_REL, 'To-Do');
    await backupFile(full);
    const raw = await readFile(full, 'utf8');
    const lines = payload.items.map((it) => `- [ ] ${it} _(added ${date})_`);
    const updated = raw.replace(/\s*$/, '\n') + lines.join('\n') + '\n';
    await writeFile(full, updated, 'utf8');
    return {
      destination: `To-Do — ${payload.items.join('; ')}`,
      undo: { route, relPath: TODO_REL, lines },
    };
  }

  // note
  const base = sanitizeFilename(payload.title);
  let relPath = `${INBOX_DIR_REL}/${base}.md`;
  if (existsSync(path.join(vaultPath, relPath))) {
    relPath = `${INBOX_DIR_REL}/${base} ${Date.now() % 10000}.md`;
  }
  const full = path.join(vaultPath, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  const content = matter.stringify(`# ${payload.title}\n\n${payload.body}\n`, {
    type: 'raw',
    tags: ['inbox'],
    created: date,
    updated: date,
  });
  await writeFile(full, content, 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  return {
    destination: `Vault note — ${payload.title}`,
    undo: { route: 'note', relPath, hash },
  };
}

// Best-effort, honest revert of one filing. Returns a human summary; throws
// with a clear message when the target changed since filing.
export async function undoFiling(vaultPath, undo) {
  if (undo.route === 'shopping') {
    const removed = await removeItems(vaultPath, undo.ids);
    if (!removed) throw new Error('those items are no longer on the shopping list');
    return `removed ${removed} item${removed === 1 ? '' : 's'} from the shopping list`;
  }
  if (undo.route === 'food') {
    const removed = await foodLog.removeEntryOn(undo.date, undo.entryId);
    if (!removed) throw new Error('that food-log entry is no longer there');
    return 'removed the food-log entry';
  }
  if (undo.route === 'journal') {
    const ok = await journal.removeEntry(vaultPath, undo);
    if (!ok) throw new Error('that journal entry has been edited or removed since');
    return 'removed the journal entry';
  }
  if (undo.route === 'todo') {
    const full = path.join(vaultPath, undo.relPath);
    if (!existsSync(full)) throw new Error('the To-Do file no longer exists');
    await backupFile(full);
    let raw = await readFile(full, 'utf8');
    let removed = 0;
    for (const line of undo.lines) {
      const idx = raw.indexOf(line);
      if (idx === -1) continue;
      raw = raw.slice(0, idx) + raw.slice(idx + line.length).replace(/^\n/, '');
      removed++;
    }
    if (!removed) throw new Error('those to-do lines have been edited or checked off since');
    await writeFile(full, raw, 'utf8');
    return `removed ${removed} to-do line${removed === 1 ? '' : 's'}`;
  }
  if (undo.route === 'note') {
    const full = path.join(vaultPath, undo.relPath);
    if (!existsSync(full)) throw new Error('that note no longer exists');
    const raw = await readFile(full, 'utf8');
    const hash = createHash('sha256').update(raw).digest('hex');
    if (hash !== undo.hash) throw new Error('that note has been edited since filing — delete it in Obsidian if you still want it gone');
    await backupFile(full);
    await unlink(full);
    return 'deleted the captured note';
  }
  throw new Error('nothing to undo for this record');
}

/* ------------------------------ orchestration ------------------------------ */

function shouldAutoFile(mode, confidence) {
  if (mode === 'auto-all') return true;
  if (mode === 'auto-high') return confidence === 'high';
  return false;
}

// Creates the record and kicks off async classification; the record moves
// classifying → filed | pending | error on its own, and the client polls it.
export async function startCapture(vaultPath, { text, source = 'text', mode = 'auto-high' }) {
  const record = {
    id: randomUUID().slice(0, 8),
    text,
    source: source === 'voice' ? 'voice' : 'text',
    mode: MODES.includes(mode) ? mode : 'auto-high',
    status: 'classifying',
    createdAt: new Date().toISOString(),
    decision: null,
  };
  await createRecord(record);

  classify(text, async (err, decision) => {
    try {
      if (err) {
        await updateRecord(record.id, { status: 'error', error: err.message });
        return;
      }
      if (shouldAutoFile(record.mode, decision.confidence)) {
        try {
          const { destination, undo } = await fileDecision(vaultPath, decision);
          await updateRecord(record.id, { status: 'filed', decision, destination, undoData: undo, filedAt: new Date().toISOString(), auto: true });
        } catch (fileErr) {
          // classification worked but filing failed — park it for review
          await updateRecord(record.id, { status: 'pending', decision, error: 'auto-filing failed: ' + fileErr.message });
        }
      } else {
        await updateRecord(record.id, { status: 'pending', decision });
      }
    } catch (storeErr) {
      console.error('inbox: failed to persist classification outcome', storeErr);
    }
  });

  return record;
}

export async function approveRecord(vaultPath, id) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  if (record.status !== 'pending') throw new Error('only pending captures can be approved');
  const { destination, undo } = await fileDecision(vaultPath, record.decision);
  return updateRecord(id, { status: 'filed', destination, undoData: undo, filedAt: new Date().toISOString(), auto: false, error: null });
}

export async function discardRecord(id) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  if (record.status !== 'pending') throw new Error('only pending captures can be discarded');
  return updateRecord(id, { status: 'discarded', discardedAt: new Date().toISOString(), error: null });
}

export async function undoRecord(vaultPath, id) {
  const record = await getRecord(id);
  if (!record) throw new Error('inbox record not found');
  if (record.status !== 'filed' || !record.undoData) throw new Error('only filed captures can be undone');
  const summary = await undoFiling(vaultPath, record.undoData);
  return updateRecord(id, { status: 'undone', undoneAt: new Date().toISOString(), undoSummary: summary });
}
