import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listRecords } from './inboxStore.js';
import { KIND_AGENT } from './fleetContext.js';

// The Stream — the system's own activity as one merged timeline, assembled
// ONLY from receipts that already exist: inbox records (what the fleet
// filed) and the server's request log (what was asked of Nova). Nothing is
// invented and nothing is smoothed — a quiet hour reads as a quiet hour.

const LOG_PATH = () => process.env.NOVA_REQLOG || path.join(os.homedir(), 'Library', 'Logs', 'nova-os-server.log');
const LOG_TAIL_BYTES = 128 * 1024;

// Only requests that mean "something happened" join the timeline — sync
// polls and static reads would drown the story.
const REQUEST_LABELS = [
  [/^POST \/api\/ask\/sync/, 'Siri asked Nova'],
  [/^POST \/api\/ask/, 'Nova was asked'],
  [/^POST \/api\/workouts\/coach/, 'Coach was asked'],
  [/^POST \/api\/claude-code\/message/, 'Code tab message sent'],
  [/^POST \/api\/inbox\/capture/, 'Capture arrived'],
  [/^POST \/api\/food-log\/scan/, 'Food scan started'],
  [/^POST \/api\/food-log\/describe/, 'Food described'],
  [/^POST \/api\/food-log/, 'Food logged'],
  [/^POST \/api\/health-data/, 'Health push landed'],
  [/^POST \/api\/workouts\/sessions/, 'Workout session logged'],
  [/^POST \/api\/overnight\/run/, 'Overnight queue run started'],
  [/^POST \/api\/overnight/, 'Work queued for tonight'],
  [/^POST \/api\/distill\/run/, 'Distiller triggered'],
];

// The classifier's capture routes aren't fleet agents — they're his own
// captures being filed; the Stream credits them honestly as Capture.
const CAPTURE_KINDS = new Set(['note', 'todo', 'shopping', 'journal', 'food', 'idea', 'stash', 'expense', 'capture', 'error']);

function recordEvents(records) {
  const out = [];
  for (const r of records) {
    if (!r.createdAt) continue;
    const agent = KIND_AGENT[r.kind] || (CAPTURE_KINDS.has(r.kind) ? 'Capture' : null);
    if (!agent) continue;
    const title = r.decision?.title || r.text || r.kind;
    out.push({
      at: r.createdAt,
      source: 'record',
      agent,
      label: `${agent} filed “${String(title).slice(0, 72)}”`,
      status: r.status,
    });
  }
  return out;
}

async function requestEvents() {
  const p = LOG_PATH();
  if (!existsSync(p)) return [];
  let text;
  try {
    const buf = await readFile(p);
    text = buf.slice(Math.max(0, buf.length - LOG_TAIL_BYTES)).toString('utf8');
  } catch {
    return [];
  }
  const out = [];
  const re = /^req (\d{4}-\d{2}-\d{2}T[\d:.]+Z) (\w+) (\S+) ← \S+ → (\d{3}) in (\d+)ms$/;
  for (const line of text.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const [, at, method, url, status, ms] = m;
    const key = `${method} ${url}`;
    const hit = REQUEST_LABELS.find(([rx]) => rx.test(key));
    if (!hit) continue;
    out.push({
      at,
      source: 'request',
      agent: null,
      label: hit[1],
      status: status === '200' ? 'ok' : `http ${status}`,
      ms: Number(ms),
    });
  }
  return out;
}

async function loadBeats() {
  const dataRoot = process.env.NOVA_DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
  try {
    const raw = JSON.parse(await readFile(path.join(dataRoot, 'heartbeat.json'), 'utf8'));
    return raw.beats || raw;
  } catch {
    return {};
  }
}

export async function streamFeed({ limit = 40 } = {}) {
  const records = await listRecords().catch(() => []);
  const [reqs, beats] = await Promise.all([requestEvents(), loadBeats()]);
  const events = [...recordEvents(records), ...reqs]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
  const pending = records.filter((r) => r.status === 'pending').length;
  return { events, beats, pending, generatedAt: new Date().toISOString() };
}
