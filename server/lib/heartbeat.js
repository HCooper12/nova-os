import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The watch-the-watcher file: every scheduler tick stamps its name here, and
// Guardian reads it back to catch the silent-stall failure class ("compost
// hasn't run in 9 days"). Writes queue through one promise chain so
// concurrent ticks can't tear the file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const HEARTBEAT_PATH = () => path.join(dataRoot(), 'heartbeat.json');

let queue = Promise.resolve();

export function beat(name) {
  queue = queue.then(() => stamp(name)).catch(() => {});
  return queue;
}

async function stamp(name) {
  const beats = await readHeartbeats();
  beats[name] = new Date().toISOString();
  await mkdir(dataRoot(), { recursive: true });
  const tmp = HEARTBEAT_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(beats, null, 2), 'utf8');
  await rename(tmp, HEARTBEAT_PATH());
}

export async function readHeartbeats() {
  if (!existsSync(HEARTBEAT_PATH())) return {};
  try {
    return JSON.parse(await readFile(HEARTBEAT_PATH(), 'utf8'));
  } catch {
    return {};
  }
}
