import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The capture autonomy mode, stored SERVER-side so the trust ladder is one
// system-wide setting — per-device localStorage meant the phone and desktop
// could silently run different autonomy levels (sweep C12).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = () => path.join(dataRoot(), 'inbox-config.json');

export const INBOX_MODES = ['review-all', 'auto-high', 'auto-all'];

export async function getInboxConfig() {
  if (!existsSync(CONFIG_PATH())) return { mode: 'auto-high' }; // the long-standing default
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH(), 'utf8'));
    return { mode: INBOX_MODES.includes(raw.mode) ? raw.mode : 'auto-high' };
  } catch {
    return { mode: 'auto-high' };
  }
}

export async function setInboxConfig(mode) {
  if (!INBOX_MODES.includes(mode)) throw new Error(`mode must be one of: ${INBOX_MODES.join(', ')}`);
  await mkdir(dataRoot(), { recursive: true });
  const tmp = CONFIG_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ mode }, null, 2), 'utf8');
  await rename(tmp, CONFIG_PATH());
  return { mode };
}
