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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const PATH_ = () => path.join(dataRoot(), 'brief-state.json');

function pad(n) { return String(n).padStart(2, '0'); }
export function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export async function getBriefState() {
  const today = todayISO();
  if (!existsSync(PATH_())) return { today, morning: null, evening: null, briefedToday: false };
  try {
    const raw = JSON.parse(await readFile(PATH_(), 'utf8'));
    return {
      today,
      morning: raw.morning || null,
      evening: raw.evening || null,
      briefedToday: raw.morning === today,
    };
  } catch {
    return { today, morning: null, evening: null, briefedToday: false };
  }
}

export async function markBriefDelivered(variant = 'morning') {
  const today = todayISO();
  let cur = {};
  if (existsSync(PATH_())) { try { cur = JSON.parse(await readFile(PATH_(), 'utf8')); } catch { cur = {}; } }
  cur[variant === 'evening' ? 'evening' : 'morning'] = today;
  await mkdir(dataRoot(), { recursive: true });
  const tmp = PATH_() + '.tmp';
  await writeFile(tmp, JSON.stringify(cur, null, 2), 'utf8');
  await rename(tmp, PATH_());
  return { ...(await getBriefState()) };
}
