import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// HAS HE BEEN BRIEFED TODAY — asked once, answered for every device.
//
// The client remembered this in localStorage, which means each device kept
// its own private answer. Hearing the whole brief on his phone left the Mac
// certain he had not been briefed, so it briefed him again — over the top of
// a book analysis he was in the middle of running. A once-a-day event needs
// one memory, and the server is the only place that is one.
//
// The same lesson, finally applied to the siblings that kept living in
// localStorage: GREETED today (the doorman said hello on another device) and
// the RITUALS done today (the morning brief / evening reflection he tapped
// into). Every mark here is written ON DELIVERY by its caller — when the
// words were actually heard — never on dispatch.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const PATH_ = () => path.join(dataRoot(), 'brief-state.json');

function pad(n) { return String(n).padStart(2, '0'); }
export function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

async function readRaw() {
  if (!existsSync(PATH_())) return {};
  try { return JSON.parse(await readFile(PATH_(), 'utf8')) || {}; } catch { return {}; }
}

async function writeRaw(cur) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = PATH_() + '.tmp';
  await writeFile(tmp, JSON.stringify(cur, null, 2), 'utf8');
  await rename(tmp, PATH_());
}

function shape(raw) {
  const today = todayISO();
  // rituals older than today are noise to the reader — only today's survive
  const rituals = Object.fromEntries(Object.entries(raw.rituals || {}).filter(([, d]) => d === today));
  return {
    today,
    morning: raw.morning || null,
    evening: raw.evening || null,
    briefedToday: raw.morning === today,
    greet: raw.greet && raw.greet.date === today ? raw.greet : null,
    rituals,
  };
}

export async function getBriefState() {
  return shape(await readRaw());
}

export async function markBriefDelivered(variant = 'morning') {
  const cur = await readRaw();
  cur[variant === 'evening' ? 'evening' : 'morning'] = todayISO();
  await writeRaw(cur);
  return shape(cur);
}

// The doorman greeted him — on whichever device — and the words landed.
export async function markGreeted() {
  const cur = await readRaw();
  cur.greet = { date: todayISO(), at: new Date().toISOString() };
  await writeRaw(cur);
  return shape(cur);
}

// A ritual's reply reached the screen. `kind` is the ritual id the client
// uses ('morning', 'evening', 'about-you', …).
export async function markRitualDone(kind) {
  const k = String(kind || '').trim().slice(0, 40);
  if (!k) throw new Error('kind required');
  const cur = await readRaw();
  const today = todayISO();
  cur.rituals = Object.fromEntries(Object.entries(cur.rituals || {}).filter(([, d]) => d === today));
  cur.rituals[k] = today;
  await writeRaw(cur);
  return shape(cur);
}
