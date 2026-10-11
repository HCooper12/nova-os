import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { getNotionToken } from './notionAuth.js';
import {
  listEntries, addEntry, updateEntry, deleteEntry, restoreDay, getEntry, novaIdFor, isHisOwnEntry,
} from './journal.js';

// HIS JOURNAL, BACKED UP TO NOTION (11 Oct 2026, mockup 95, his calls).
//
//   Push   his own entries (author Hayden) go to the Notion "Journal"
//          database, one page each, idempotent by Nova id. Nova's log
//          (Nova's and the agents' entries) is NEVER sent.
//   Pull   a page he wrote in Notion (no Nova id yet) becomes a vault entry
//          by him, marked "notion", and the page gets its Nova id.
//   Edits  a page edited in Notion since the last sync rewrites that entry's
//          words and tag in the vault, unless the vault copy changed too:
//          the vault is the source of truth, so then the vault wins and is
//          pushed back over Notion.
//   Delete a page deleted in Notion deletes the vault entry too, filed on the
//          Inbox rails (kind 'journal-notion', status 'filed', undoData) so
//          Undo in Nova puts the day page back byte for byte.
//          Undo restores the VAULT only. He deleted it in Notion, so Notion
//          keeps it deleted: the entry is marked "in your vault only" and is
//          never re-created there by Nova. If he restores the page from
//          Notion's trash, the next sync finds it by its Nova id and the two
//          are joined again.
//
// The vault is written only through journal.js (diffed, never regenerated).
// Notion is polled politely: one request at a time, at least MIN_GAP_MS
// apart (under 3 a second), and a 429 waits as long as Notion asks.
// State (which page is which entry, what was last agreed) lives in
// server/data/notion-journal.json. The token is never logged.

export const DATABASE_ID = 'a47882fdc1f541b2a351397e0e73e92e';
const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
export const MIN_GAP_MS = 350;
export const SYNC_EVERY_MS = 5 * 60_000;

const TAG_NAME = { own: 'Own', life: 'Life', deep: 'Deep' };
const TAG_KEY = { Own: 'own', Life: 'life', Deep: 'deep' };
const FROM_NAME = { deep: 'Deep question', review: 'Daily review', life: 'My life' };
const FROM_KEY = { 'Deep question': 'deep', 'Daily review': 'review', 'My life': 'life' };

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const stateFile = () => path.join(dataRoot(), 'notion-journal.json');

const blank = () => ({ version: 1, entries: {}, deletedInNotion: {}, lastRunAt: null, lastOkAt: null, error: null });

export async function readSyncState() {
  try {
    const s = JSON.parse(await readFile(stateFile(), 'utf8'));
    return { ...blank(), ...s, entries: s.entries || {}, deletedInNotion: s.deletedInNotion || {} };
  } catch { return blank(); }
}
async function writeSyncState(s) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = stateFile() + '.tmp';
  await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await rename(tmp, stateFile());
}

// what the two copies agreed on last time: his words, the tag, the prompt
export function entryHash({ words, tag, prompt }) {
  return createHash('sha1').update(`${String(words || '').trim()}\u0000${tag || 'own'}\u0000${prompt || ''}`).digest('hex').slice(0, 16);
}

// THE TITLE IS HIS FIRST LINE (his call): the database reads as his words.
export function firstLine(words) {
  const line = String(words || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return line.length > 120 ? line.slice(0, 117) + '...' : line;
}

const rt = (text) => [{ type: 'text', text: { content: String(text).slice(0, 2000) } }];
const plain = (arr) => (arr || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');

// Notion's rich text holds 2000 characters a block: long words split on
// paragraph lines, and a long paragraph in pieces
export function paragraphs(words) {
  const out = [];
  for (const para of String(words || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    for (let i = 0; i < para.length; i += 2000) {
      out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(para.slice(i, i + 2000)) } });
    }
  }
  return out;
}

// One vault entry of his into the database's eight fields (Created is
// Notion's own).
export function pageProperties(entry, { writtenIn = 'Nova' } = {}) {
  return {
    Entry: { title: rt(firstLine(entry.words) || 'Untitled') },
    Date: { date: { start: entry.date } },
    Tag: { select: { name: TAG_NAME[entry.tag] || 'Own' } },
    Prompt: { rich_text: entry.prompt ? rt(entry.prompt) : [] },
    'Prompt from': { select: { name: FROM_NAME[entry.promptFrom] || 'None' } },
    'Written in': { select: { name: writtenIn } },
    'Nova id': { rich_text: rt(entry.novaId) },
  };
}

// A page back into what the vault keeps
export function pageFields(page) {
  const p = page.properties || {};
  return {
    pageId: page.id,
    novaId: plain(p['Nova id']?.rich_text).trim() || null,
    title: plain(p.Entry?.title).trim(),
    tag: TAG_KEY[p.Tag?.select?.name] || 'own',
    prompt: plain(p.Prompt?.rich_text).trim() || null,
    promptFrom: FROM_KEY[p['Prompt from']?.select?.name] || null,
    date: p.Date?.date?.start ? String(p.Date.date.start).slice(0, 10) : null,
    created: page.created_time || null,
    edited: page.last_edited_time || null,
    gone: !!(page.archived || page.in_trash),
  };
}

// ---------------------------------------------------------------- the client
function client({ fetchImpl = globalThis.fetch, token, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), minGapMs = MIN_GAP_MS } = {}) {
  let last = 0;
  let count = 0;
  async function call(method, url, body, retry = 1) {
    const wait = last + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    count += 1;
    const res = await fetchImpl(`${NOTION}${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && retry > 0) {
      const after = Number(res.headers?.get?.('retry-after')) || 1;
      await sleep(after * 1000);
      return call(method, url, body, retry - 1);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(notionWords(res.status, json));
      err.status = res.status;
      throw err;
    }
    return json;
  }
  return { call, get count() { return count; } };
}

// what to tell him, never the token or a raw body
function notionWords(status, json) {
  if (status === 401) return 'Notion did not accept the key';
  if (status === 403 || status === 404) return 'Notion cannot see the Journal database (share it with the Nova connection)';
  if (status === 400 || status === 409) return `Notion refused an entry (${json?.message ? String(json.message).slice(0, 120) : status})`;
  return `Notion could not be reached (${status})`;
}

async function queryAll(api) {
  const pages = [];
  let cursor;
  do {
    const r = await api.call('POST', `/databases/${DATABASE_ID}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    pages.push(...(r.results || []));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return pages;
}

async function pageWords(api, pageId) {
  const r = await api.call('GET', `/blocks/${pageId}/children?page_size=100`);
  return (r.results || [])
    .map((b) => (b[b.type]?.rich_text ? plain(b[b.type].rich_text) : ''))
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function replaceBody(api, pageId, words) {
  const r = await api.call('GET', `/blocks/${pageId}/children?page_size=100`);
  for (const b of r.results || []) await api.call('DELETE', `/blocks/${b.id}`);
  const kids = paragraphs(words);
  if (kids.length) await api.call('PATCH', `/blocks/${pageId}/children`, { children: kids });
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------------------------------------------------------------- status
let running = null;
let lastResult = null;

export function isSyncing() { return !!running; }

// The page's honest word on Notion: not connected (no key), syncing, synced,
// or the error, and per entry whether Notion has it.
export async function syncStatus(vaultPath, { getToken = getNotionToken } = {}) {
  const token = await getToken();
  const st = await readSyncState();
  const entries = {};
  if (token) {
    const days = await listEntries(vaultPath).catch(() => []);
    for (const d of days) for (const s of d.sections) {
      if (!isHisOwnEntry(s)) continue;
      const known = st.entries[s.novaId];
      if (st.deletedInNotion[s.novaId]) entries[s.novaId] = 'vault-only';
      else if (known?.error) entries[s.novaId] = 'error';
      else if (!known || known.hash !== entryHash(s)) entries[s.novaId] = 'wait';
      else entries[s.novaId] = s.writtenIn === 'notion' ? 'from' : 'ok';
    }
  }
  return {
    state: !token ? 'not-connected' : running ? 'syncing' : st.error ? 'error' : st.lastOkAt ? 'synced' : 'wait',
    error: token ? st.error : null,
    lastOkAt: st.lastOkAt,
    lastRunAt: st.lastRunAt,
    entries,
  };
}

// ---------------------------------------------------------------- the sync
// One pass, pull then push. Single-flight: a second call while one runs
// waits for it rather than racing it.
export function syncOnce(vaultPath, deps = {}) {
  if (running) return running;
  running = runSync(vaultPath, deps).finally(() => { running = null; });
  return running;
}

async function runSync(vaultPath, { fetchImpl = globalThis.fetch, getToken = getNotionToken, sleep, minGapMs, now = () => new Date(), fileDelete = fileNotionDelete } = {}) {
  const token = await getToken();
  if (!token) return (lastResult = { state: 'not-connected' });
  const api = client({ fetchImpl, token, sleep, minGapMs });
  const st = await readSyncState();
  const out = { pulled: 0, edited: 0, deleted: 0, pushed: 0, updated: 0, skippedLog: 0 };
  st.lastRunAt = now().toISOString();
  try {
    const pages = (await queryAll(api)).map(pageFields);
    const seen = new Set();

    // ---- pull: pages he wrote in Notion, and edits made there
    for (const pg of pages) {
      if (pg.gone) continue;
      seen.add(pg.pageId);
      if (!pg.novaId) {
        const body = await pageWords(api, pg.pageId);
        const words = body || pg.title;
        if (!words) continue; // an empty page is not an entry yet
        const at = pg.created ? new Date(pg.created) : now();
        const day = pg.date || localDay(at);
        // the day he gave it in Notion, at the minute he created the page
        const stamp = new Date(`${day}T${pad(at.getHours())}:${pad(at.getMinutes())}:00`);
        const made = await addEntry(vaultPath, {
          text: words, author: 'hayden', category: 'personal', tag: pg.tag, prompt: pg.prompt,
          promptFrom: pg.promptFrom, writtenIn: 'notion', at: stamp,
        });
        const patched = await api.call('PATCH', `/pages/${pg.pageId}`, { properties: {
          'Nova id': { rich_text: rt(made.novaId) }, 'Written in': { select: { name: 'Notion' } },
          ...(pg.title ? {} : { Entry: { title: rt(firstLine(words)) } }),
        } });
        st.entries[made.novaId] = { pageId: pg.pageId, hash: entryHash({ words, tag: pg.tag, prompt: pg.prompt }), edited: patched.last_edited_time || pg.edited, writtenIn: 'notion' };
        out.pulled += 1;
        continue;
      }
      // a page Nova knows, or one he restored from Notion's trash
      if (st.deletedInNotion[pg.novaId]) {
        const back = await getEntry(vaultPath, pg.novaId);
        if (back) {
          st.entries[pg.novaId] = { pageId: pg.pageId, hash: null, edited: pg.edited, writtenIn: back.writtenIn === 'notion' ? 'notion' : 'nova' };
          delete st.deletedInNotion[pg.novaId];
        }
        continue;
      }
      const known = st.entries[pg.novaId];
      if (!known) {
        // the state file was lost: join them again when the vault has it
        const vaultCopy = await getEntry(vaultPath, pg.novaId);
        if (vaultCopy) st.entries[pg.novaId] = { pageId: pg.pageId, hash: null, edited: pg.edited, writtenIn: vaultCopy.writtenIn === 'notion' ? 'notion' : 'nova' };
        continue;
      }
      if (known.pageId !== pg.pageId) continue; // a duplicate page; the first stays the copy
      if (!pg.edited || pg.edited === known.edited) continue;
      const vaultCopy = await getEntry(vaultPath, pg.novaId);
      if (!vaultCopy) continue;
      if (known.hash && entryHash(vaultCopy) !== known.hash) {
        // both changed: the vault is the source of truth, push wins below
        known.edited = pg.edited;
        continue;
      }
      const words = (await pageWords(api, pg.pageId)) || pg.title;
      const next = { words, tag: pg.tag, prompt: vaultCopy.prompt };
      if (words && entryHash(next) !== entryHash(vaultCopy)) {
        await updateEntry(vaultPath, pg.novaId, { words, tag: pg.tag });
        out.edited += 1;
      }
      known.hash = entryHash(next);
      known.edited = pg.edited;
    }

    // ---- deletes made in Notion: a known page that left the database
    for (const [novaId, known] of Object.entries(st.entries)) {
      if (seen.has(known.pageId)) continue;
      let gone = false;
      try {
        const pg = await api.call('GET', `/pages/${known.pageId}`);
        gone = !!(pg.archived || pg.in_trash);
      } catch (e) {
        if (e.status === 404) gone = true; else throw e;
      }
      if (!gone) continue;
      const removed = await deleteEntry(vaultPath, novaId);
      if (removed) {
        await fileDelete({ novaId, pageId: known.pageId, removed, now: now() });
        out.deleted += 1;
      }
      delete st.entries[novaId];
      st.deletedInNotion[novaId] = { pageId: known.pageId, at: now().toISOString() };
    }

    // ---- push: his entries only, new or changed since the last agreement
    const days = await listEntries(vaultPath);
    for (const d of days) {
      for (const s of d.sections) {
        if (!isHisOwnEntry(s)) { out.skippedLog += 1; continue; } // Nova's log stays home
        if (st.deletedInNotion[s.novaId]) continue; // he deleted it there; vault only
        const entry = { ...s, date: d.date };
        const hash = entryHash(entry);
        const known = st.entries[s.novaId];
        try {
          if (!known) {
            const pg = await api.call('POST', '/pages', {
              parent: { database_id: DATABASE_ID },
              properties: pageProperties(entry, { writtenIn: s.writtenIn === 'notion' ? 'Notion' : 'Nova' }),
              children: paragraphs(entry.words),
            });
            st.entries[s.novaId] = { pageId: pg.id, hash, edited: pg.last_edited_time || null, writtenIn: s.writtenIn === 'notion' ? 'notion' : 'nova' };
            out.pushed += 1;
          } else if (known.hash !== hash) {
            const pg = await api.call('PATCH', `/pages/${known.pageId}`, { properties: pageProperties(entry, { writtenIn: known.writtenIn === 'notion' ? 'Notion' : 'Nova' }) });
            await replaceBody(api, known.pageId, entry.words);
            known.hash = hash;
            known.edited = pg.last_edited_time || known.edited;
            delete known.error;
            out.updated += 1;
          }
        } catch (e) {
          if (e.status === 400 || e.status === 409) {
            // Notion refused this one entry: it stays safe in the vault and
            // says so; the rest carry on
            if (known) known.error = e.message;
            else st.entries[s.novaId] = { pageId: null, hash: null, error: e.message };
            continue;
          }
          throw e;
        }
      }
    }
    // an entry that failed with no page yet is retried on the next pass
    for (const [k, v] of Object.entries(st.entries)) if (!v.pageId) delete st.entries[k];
    st.error = null;
    st.lastOkAt = now().toISOString();
    await writeSyncState(st);
    return (lastResult = { state: 'synced', requests: api.count, ...out });
  } catch (e) {
    st.error = e.message;
    await writeSyncState(st);
    return (lastResult = { state: 'error', error: e.message, requests: api.count, ...out });
  }
}

export function lastSyncResult() { return lastResult; }

// ---------------------------------------------------------------- the rails
// A delete that came from Notion, filed so he sees it and can take it back.
export async function fileNotionDelete({ novaId, pageId, removed, now = new Date() }) {
  const { createRecord } = await import('./inboxStore.js');
  const words = removed.section?.words || removed.section?.text || '';
  return createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'journal-notion',
    text: `Deleted in Notion: ${firstLine(words) || novaId}`,
    source: 'notion',
    status: 'filed',
    auto: true,
    destination: `Removed from your journal, ${removed.date}`,
    createdAt: now.toISOString(),
    filedAt: now.toISOString(),
    undoData: { kind: 'journal-notion-delete', novaId, pageId, date: removed.date, before: removed.before, after: removed.after },
  });
}

// Undo: the vault day back byte for byte. Notion is left as he left it (see
// the head of this file); the entry reads "in your vault only".
export async function undoNotionDelete(vaultPath, undo) {
  const how = await restoreDay(vaultPath, undo);
  return how === 'exact'
    ? 'put the entry back in your journal exactly as it was; Notion keeps it deleted'
    : how === 'appended'
      ? 'put the entry back in your journal (that day had changed, so it was added at the end); Notion keeps it deleted'
      : 'the entry was already back in your journal';
}

// The Undo on a save in Nova: out of the vault, and the Notion copy archived
// (Notion keeps archived pages in its trash for 30 days).
export async function unsaveEntry(vaultPath, novaId, { fetchImpl = globalThis.fetch, getToken = getNotionToken, sleep, minGapMs } = {}) {
  const removed = await deleteEntry(vaultPath, novaId);
  if (!removed) throw new Error('that entry is no longer in your journal');
  const st = await readSyncState();
  const known = st.entries[novaId];
  let notion = 'none';
  if (known?.pageId) {
    const token = await getToken();
    if (token) {
      try {
        await client({ fetchImpl, token, sleep, minGapMs }).call('PATCH', `/pages/${known.pageId}`, { archived: true });
        notion = 'archived';
      } catch { notion = 'left'; }
    } else notion = 'left';
    delete st.entries[novaId];
    await writeSyncState(st);
  }
  return { removed: true, notion };
}

// The pass every few minutes, and one soon after he writes in Nova
let kickTimer = null;
export function kickSync(vaultPath, delayMs = 1500) {
  if (!vaultPath) return;
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => { syncOnce(vaultPath).catch(() => {}); }, delayMs);
  kickTimer.unref?.();
}
export function startNotionJournalScheduler(vaultPath) {
  if (!vaultPath) return;
  const t = setInterval(() => { syncOnce(vaultPath).catch(() => {}); }, SYNC_EVERY_MS);
  t.unref?.();
  kickSync(vaultPath, 20_000);
}

export { novaIdFor };
