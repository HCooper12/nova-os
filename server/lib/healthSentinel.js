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
// local, once per day, when yesterday's steps did not close properly.
//
// "Did not close" is BOTH cases (widened 12 Aug 2026): the file is absent,
// OR it exists carrying only a partial captured during the day itself
// (stepsComplete false — saveDay stamps that from the capture time). The
// narrow missing-file test let 11 Aug pass in silence: a stale midday
// figure sat in the file, so the sentinel saw a file and said nothing while
// the overnight push had in fact never landed. A stale number is exactly
// the failure this exists to shout about.
export function shouldNudge(now, { hasYesterdayFile, yesterdayStepsComplete, lastNudgeDay }) {
  if (now.getHours() < 9) return false;
  if (lastNudgeDay === localDay(now)) return false;
  if (!hasYesterdayFile) return true;
  return yesterdayStepsComplete !== true;
}

// Was the Mac even awake when the push was due? The request log carries
// timestamps now, so this is EVIDENCE rather than a guess: any request
// served in the 00:00–00:30 local window means the server was alive and the
// push never left the phone. No evidence either way → say nothing about the
// cause (the sentinel must never invent one it cannot see).
const LOG_PATH = () => process.env.NOVA_REQLOG || path.join(process.env.HOME || '', 'Library', 'Logs', 'nova-os-server.log');
export async function serverWasAwakeAtMidnight(now = new Date()) {
  const p = LOG_PATH();
  if (!existsSync(p)) return null;
  let text;
  try {
    const buf = await readFile(p);
    text = buf.slice(Math.max(0, buf.length - 512 * 1024)).toString('utf8');
  } catch {
    return null;
  }
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 30 * 60_000);
  let sawAny = false;
  for (const m of text.matchAll(/^req (\d{4}-\d{2}-\d{2}T[\d:.]+Z) /gm)) {
    const t = new Date(m[1]).getTime();
    sawAny = true;
    if (t >= from.getTime() && t < to.getTime()) return true;
  }
  return sawAny ? false : null; // lines exist but none in the window → it was down
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
  const dayPath = path.join(dataRoot(), 'health', `${yday}.json`);
  const hasYesterdayFile = existsSync(dayPath);
  let day = null;
  if (hasYesterdayFile) {
    try { day = JSON.parse(await readFile(dayPath, 'utf8')); } catch { day = null; }
  }
  const state = await loadState();
  if (!shouldNudge(now, { hasYesterdayFile, yesterdayStepsComplete: day?.stepsComplete, lastNudgeDay: state.lastNudgeDay })) {
    return { nudged: false };
  }

  const sender = send || (async (text) => {
    const { telegramConfigured, sendTelegramText } = await import('./telegram.js');
    if (!telegramConfigured()) return false;
    await sendTelegramText(text);
    return true;
  });
  // Name which failure it is: a hole reads differently from a stale partial,
  // and "your steps say 813" is the sentence that actually gets him looking.
  const headline = !hasYesterdayFile
    ? `⚠️ Last night's health push didn't land — no data at all for ${yday}.`
    : `⚠️ Last night's health push didn't land — ${yday} still shows only its midday partial${day?.steps != null ? ` (${Math.round(day.steps).toLocaleString()} steps)` : ''}, never the day's total.`;
  const awake = await serverWasAwakeAtMidnight(now);
  const cause = awake === true
    ? 'The Mac was up and serving at the time, so the push never left the phone.'
    : awake === false
      ? 'The server was down in that window too — the Mac was asleep, not the phone at fault.'
      : "I can't tell from here whether the Mac was awake — check both.";
  const sent = await sender(
    `${headline}\n${cause}\n` +
    `Fix: run the Health Push shortcut once now to close the day, and check the 00:05 automation in Shortcuts (it should say Run Immediately).`
  );
  if (sent !== false) {
    state.lastNudgeDay = localDay(now);
    await saveState(state);
  }
  return { nudged: sent !== false, date: yday };
}
