import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The missed-push sentinel. The overnight health push has failed silently
// for nights at a stretch — the UI self-labels stale data, but only if he
// happens to look. This closes the loop: if yesterday has NO health file by
// 09:00 local, ONE Telegram nudge names the real cause path and the fix.
// It never invents a cause it can't see — the automation not firing and the
// Mac sleeping are indistinguishable from here, so it says so.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'health', 'sentinel.json');

const pad = (n) => String(n).padStart(2, '0');
// LOCAL calendar dates, never UTC slices — the dispatch-slot lesson.
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const yesterdayLocal = (now = new Date()) => {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return localDay(y);
};

// Pure so the decision is testable to the hour: nudge only after 09:00
// local, only when yesterday's file is genuinely absent, once per day.
export function shouldNudge(now, { hasYesterdayFile, lastNudgeDay }) {
  if (hasYesterdayFile) return false;
  if (now.getHours() < 9) return false;
  if (lastNudgeDay === localDay(now)) return false;
  return true;
}

async function loadState() {
  try { return JSON.parse(await readFile(STATE_PATH(), 'utf8')); } catch { return { lastNudgeDay: null }; }
}
async function saveState(state) {
  await mkdir(path.dirname(STATE_PATH()), { recursive: true });
  await writeFile(STATE_PATH(), JSON.stringify(state, null, 2), 'utf8');
}

export async function runMissedPushSentinel({ now = new Date(), send } = {}) {
  const yday = yesterdayLocal(now);
  const hasYesterdayFile = existsSync(path.join(dataRoot(), 'health', `${yday}.json`));
  const state = await loadState();
  if (!shouldNudge(now, { hasYesterdayFile, lastNudgeDay: state.lastNudgeDay })) return { nudged: false };

  const sender = send || (async (text) => {
    const { telegramConfigured, sendTelegramText } = await import('./telegram.js');
    if (!telegramConfigured()) return false;
    await sendTelegramText(text);
    return true;
  });
  const sent = await sender(
    `⚠️ Last night's health push didn't land — no data for ${yday}.\n` +
    `Manual runs have been working, so it's the 00:05 automation not firing or the Mac asleep (I can't tell which from here).\n` +
    `Fix: run the Health Push shortcut once now to recover the day, check the automation still says Run Immediately, and plug the Mac in tonight.`
  );
  if (sent !== false) {
    state.lastNudgeDay = localDay(now);
    await saveState(state);
  }
  return { nudged: sent !== false, date: yday };
}
