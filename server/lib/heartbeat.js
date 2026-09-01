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
// A loop's last word about itself: "couldn't run — workout data unreadable".
// A beat says the loop is alive; a note says whether it could LOOK. Kept in a
// sibling file so the beats' shape — read by Guardian and Ops as plain ISO
// strings — stays exactly as it is.
const NOTES_PATH = () => path.join(dataRoot(), 'heartbeat-notes.json');

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

// note(name, text) records the loop's last word; note(name, null) clears it
// on the next run that could look.
export function note(name, text) {
  queue = queue.then(() => stampNote(name, text)).catch(() => {});
  return queue;
}

async function stampNote(name, text) {
  const notes = await readNotes();
  if (text) notes[name] = { at: new Date().toISOString(), note: String(text).slice(0, 200) };
  else if (!notes[name]) return; // nothing to clear — don't churn the file
  else delete notes[name];
  await mkdir(dataRoot(), { recursive: true });
  const tmp = NOTES_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(notes, null, 2), 'utf8');
  await rename(tmp, NOTES_PATH());
}

export async function readNotes() {
  if (!existsSync(NOTES_PATH())) return {};
  try {
    return JSON.parse(await readFile(NOTES_PATH(), 'utf8'));
  } catch {
    return {};
  }
}

export async function readHeartbeats() {
  if (!existsSync(HEARTBEAT_PATH())) return {};
  try {
    return JSON.parse(await readFile(HEARTBEAT_PATH(), 'utf8'));
  } catch {
    return {};
  }
}
