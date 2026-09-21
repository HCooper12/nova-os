// THE WEEKLY PATTERN RUN — Sunday evening, over Telegram, and quiet otherwise.
//
// His confirmation, 22 Sep, of the reasoning in the last handoff:
//
//   THE CADENCE MATCHES THE DATA'S. Correlations move at the speed of n.
//   Adding one day to 31 changes r in the third decimal, so a daily card
//   would show him an identical number 365 times a year and teach him to stop
//   looking. He already has the receipt for that: 154 records produced in a
//   month, 9 filed; dispatch made 57 and he approved zero
//   (nova-produce-vs-keep). Anything that speaks daily without changing daily
//   is how this becomes the 155th thing he ignores.
//
//   A QUIET WEEK COSTS NOTHING. The engine's honest answer most weeks is
//   "nothing held", which is a bad permanent Home card and a fine absent
//   message. Telegram is silent when there is nothing to say.
//
//   IT IS NOT A NOW THING. A finding about last month's sleep is something to
//   read and think about, not to act on in the next ten minutes. That is a
//   message, not a card.
//
// The full result is persisted so the Ops page can show what was tested and
// found nothing — the reference half of the surface, which is where someone
// goes looking rather than where they are ambushed.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPatterns } from './patterns.js';
import { sendTelegramText, telegramConfigured } from './telegram.js';

const dataDir = () => process.env.NOVA_DATA_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = () => path.join(dataDir(), 'patterns.json');

// Sunday evening: the week is done, and he is not mid-anything.
export const RUN_WEEKDAY = 0;   // Sunday
export const RUN_HOUR = 18;

export async function readLastRun() {
  try { return JSON.parse(await readFile(FILE(), 'utf8')); } catch { return null; }
}

async function writeRun(run) {
  await mkdir(dataDir(), { recursive: true }).catch(() => {});
  await writeFile(FILE(), JSON.stringify(run, null, 2), 'utf8').catch(() => {});
}

export function localDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Is this the window, and has this week's run already happened? Pure, so the
// cadence is testable without a clock or a calendar.
export function dueNow(now, lastRunAt) {
  if (now.getDay() !== RUN_WEEKDAY) return false;
  if (now.getHours() < RUN_HOUR) return false;
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  // once a week: anything inside six days is this week's run already done
  return (now - last) > 6 * 86_400_000;
}

// THE MESSAGE. Silent when nothing held — a ping that sometimes carries
// nothing is how the next one stops being read.
export function buildMessage(result) {
  if (!result) return null;
  const held = result.findings || [];
  const watch = result.watching || [];
  if (!held.length && !watch.length) return null;

  const lines = ['📈 *Patterns in your numbers* — this week\'s run'];
  lines.push('');
  if (held.length) {
    for (const f of held) lines.push(`• ${f.sentence}`);
  }
  if (watch.length) {
    if (held.length) lines.push('');
    lines.push('_Not established yet:_');
    for (const f of watch) lines.push(`• ${f.sentence}`);
  }
  lines.push('');
  // the honesty that makes the rest of it worth reading
  lines.push(`_${result.tested} pair${result.tested === 1 ? '' : 's'} tested. Correlation, not cause._`);
  return lines.join('\n');
}

export async function runWeeklyPatterns(now = new Date(), deps = {}) {
  const {
    find = findPatterns,
    send = sendTelegramText,
    configured = telegramConfigured,
    save = writeRun,
  } = deps;

  const result = await find();
  const message = buildMessage(result);
  // The run is recorded WHETHER OR NOT anything was said, so Ops can show a
  // quiet week as a quiet week rather than as a run that never happened.
  await save({
    at: now.toISOString(),
    tested: result.tested,
    findings: result.findings,
    watching: result.watching,
    coverage: result.coverage,
    skipped: result.skipped,
    messaged: !!message,
  });
  if (!message) return { sent: false, why: 'nothing held and nothing to watch', result };
  if (!configured()) return { sent: false, why: 'telegram not configured', result };
  await send(message);
  return { sent: true, message, result };
}

export function startPatternsWeeklyScheduler() {
  const tick = async () => {
    try {
      const { beat } = await import('./heartbeat.js');
      beat('patterns-weekly');
    } catch { /* a receipt, never a gate */ }
    try {
      const last = await readLastRun();
      if (!dueNow(new Date(), last?.at)) return;
      await runWeeklyPatterns();
    } catch (e) {
      console.error('weekly patterns failed:', e.message);
    }
  };
  tick();
  // hourly: the window is a whole evening, and this is the least urgent thing
  // in the fleet
  setInterval(tick, 60 * 60 * 1000);
}
