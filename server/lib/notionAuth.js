import { mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NOTION, HIS KEY. He creates an internal integration in Notion ("Nova"),
// pastes its secret into Settings on his phone, and the server is the only
// thing that ever holds it: it never rides in chat, a log line or the repo.
// `server/data` is gitignored (CLAUDE.md: that directory is derived/
// operational, never the vault), and this file alone within it is mode
// 0600 — the one thing in there that is a real credential rather than a
// cache. Later work (not this change) will use the stored token to back his
// Journal up to Notion; this file only proves the key and keeps it.
//
// The Journal database this is for: id a47882fdc1f541b2a351397e0e73e92e,
// data source collection://e52adf4d-736d-4465-9028-1fc6a21beed7 — he must
// still tick it under the connection's Content access in Notion before a
// sync can read or write it, which is what journalShared below answers.

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const tokenFile = () => path.join(dataRoot(), 'integrations', 'notion.json');

const NOTION_VERSION = '2022-06-28';
const JOURNAL_DATABASE_ID = 'a47882fdc1f541b2a351397e0e73e92e';

async function readTokenFile() {
  try {
    const raw = await readFile(tokenFile(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data.token === 'string' ? data : null;
  } catch {
    return null;
  }
}

// The bare token, for the (future, not-this-change) sync code to call
// Notion with. Never logged, never handed to a route response.
export async function getNotionToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  const stored = await readTokenFile();
  return stored?.token || null;
}

async function callNotion(fetchImpl, url, token) {
  return fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
}

// Validates the pasted key against Notion itself (never trusts shape alone),
// then stores it plus the bot/workspace name Notion returned — never the
// token — mode 0600. Returns that same safe summary; never the token.
export async function saveNotionToken(token, { fetchImpl = globalThis.fetch } = {}) {
  const trimmed = String(token || '').trim();
  if (!trimmed) throw new Error('Notion key is empty');
  const res = await callNotion(fetchImpl, 'https://api.notion.com/v1/users/me', trimmed);
  if (res.status === 401) throw new Error('Notion did not accept that key');
  if (!res.ok) throw new Error(`Notion could not be reached (${res.status})`);
  const me = await res.json();
  const botName = me?.name || me?.bot?.owner?.user?.name || null;
  const workspaceName = me?.bot?.workspace_name || null;
  const savedAt = new Date().toISOString();
  const dir = path.join(dataRoot(), 'integrations');
  await mkdir(dir, { recursive: true });
  const file = tokenFile();
  await writeFile(file, JSON.stringify({ token: trimmed, botName, workspaceName, savedAt }, null, 2), { mode: 0o600 });
  await chmod(file, 0o600); // writeFile's mode is only honoured on create — belt and suspenders on an overwrite
  return { botName, workspaceName, savedAt };
}

export async function clearNotionToken() {
  await rm(tokenFile(), { force: true });
}

// { connected, botName, workspaceName, journalShared }. journalShared is
// read from the Journal database itself: 200 means the connection can see
// it, 404/403 mean it cannot — which almost always means he hasn't ticked
// Journal yet under the connection's Content access in Notion.
export async function notionStatus({ fetchImpl = globalThis.fetch } = {}) {
  const envToken = process.env.NOTION_TOKEN;
  const stored = envToken ? null : await readTokenFile();
  const token = envToken || stored?.token || null;
  if (!token) return { connected: false, botName: null, workspaceName: null, journalShared: false };
  const res = await callNotion(fetchImpl, `https://api.notion.com/v1/databases/${JOURNAL_DATABASE_ID}`, token);
  // a key Notion has since revoked (or he deleted the connection) is not
  // "connected": say so, rather than keep showing the last good state
  if (res.status === 401) return { connected: false, rejected: true, botName: null, workspaceName: null, journalShared: false };
  const journalShared = res.status === 200;
  return {
    connected: true,
    botName: stored?.botName || null,
    workspaceName: stored?.workspaceName || null,
    journalShared,
  };
}
