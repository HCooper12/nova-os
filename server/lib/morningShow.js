// The Morning Show / Evening Debrief — Phase 2 of MORNING-SHOW-PLAN.md.
//
// The reel's lesson: the "snap" is prepared work played back — each spoken
// beat backed by visual evidence, ending in ONE staged approval. This
// composer is CODE assembling receipts (health files, calendar, inbox
// records, the panel builders); nothing here invents, and a source that is
// missing or failing simply loses its beat — honest silence over filler.
// The client plays the steps through the sentence-TTS FIFO, revealing each
// beat's text and pane as its audio starts.
//
// Every say-line rides the persona register (unflappable, exact, dry);
// rotation over randomness, same as the ack lines.

import { metricCard, listCard } from './spokenCards.js';

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Monday of the week `d` falls in — matches coachProgramAudit's weekOf key
// so "is this audit from this week" is one comparison, not a date range.
const mondayOfLocal = (d) => { const m = new Date(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); m.setHours(0,0,0,0); return m; };

let rot = 0;
const pick = (arr) => arr[rot++ % arr.length];

function hoursMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} minutes`;
  return m ? `${h} hours ${m} minutes` : `${h} hours`;
}

// Has this "HH:MM" already gone by, on the day `now` falls in? Unparseable
// times are treated as still ahead — announcing something as missed when it
// might not be is the more expensive mistake.
function isPast(t, now) {
  const [H, M] = String(t || '').split(':').map(Number);
  if (Number.isNaN(H)) return false;
  return (H * 60 + (M || 0)) < (now.getHours() * 60 + now.getMinutes());
}

function speakTime(t) {
  // "17:30" → "5:30 pm" — Kokoro reads 12-hour clock more naturally
  const [H, M] = String(t || '').split(':').map(Number);
  if (Number.isNaN(H)) return t;
  const h12 = ((H + 11) % 12) + 1;
  return `${h12}:${pad(M || 0)} ${H < 12 ? 'am' : 'pm'}`;
}

// Kinds an agent produced (show-worthy work) vs housekeeping the brief
// should count but not headline. Keep in step with the inbox seed kinds.
const PRODUCE_KINDS = ['research', 'watch-note', 'forge-job', 'pattern', 'studio', 'brain-week', 'distill', 'study', 'video', 'fuel-cross'];

// emoji and symbols never reach the voice engine — G2P mangles them
const despeak = (s) => String(s).replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+/g, ' ').trim();

// SPOKEN DATES. He reported Nova reading "14 Aug" literally — as two tokens,
// not as a date. Calendars and note titles write dates in shorthand; a person
// says "the fourteenth of August". Applied to every spoken line at the end of
// the build, so it catches labels, titles and composed copy alike.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_BY_PREFIX = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', sept: 'September', oct: 'October',
  nov: 'November', dec: 'December',
};
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
  'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first',
  'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth',
  'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];
// A bare number after a month name is far more often a measurement than a day
// ("Aug 12 reps"), so anything carrying a unit is left alone.
const UNIT_AHEAD = '(?!\\s*(?:kg|kgs|lb|lbs|g|mg|ml|l|reps?|sets?|min|mins|minutes?|hours?|hrs?|kcal|cal|%|km|mi|m\\b))';
function speakDates(s) {
  let out = String(s);
  // 2026-08-14 → the fourteenth of August
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, _y, mo, d) => {
    const name = MONTH_NAMES[Number(mo) - 1];
    const day = Number(d);
    return name && day >= 1 && day <= 31 ? `the ${ORDINALS[day]} of ${name}` : m;
  });
  // 14 Aug / 14th August → the fourteenth of August
  out = out.replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|sept|sep|aug|oct|nov|dec)[a-z]*\.?/gi,
    (m, d, mon) => {
      const name = MONTH_BY_PREFIX[mon.toLowerCase()];
      const day = Number(d);
      return name && day >= 1 && day <= 31 ? `the ${ORDINALS[day]} of ${name}` : m;
    });
  // Aug 14 / August 14th → the fourteenth of August
  out = out.replace(new RegExp(`\\b(jan|feb|mar|apr|may|jun|jul|sept|sep|aug|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b${UNIT_AHEAD}`, 'gi'),
    (m, mon, d) => {
      const name = MONTH_BY_PREFIX[mon.toLowerCase()];
      const day = Number(d);
      return name && day >= 1 && day <= 31 ? `the ${ORDINALS[day]} of ${name}` : m;
    });
  return out;
}

const recordLabel = (r) =>
  despeak(r.title || r.question || r.text || r.kind || 'a draft').slice(0, 90);

const defaultDeps = {
  recentDays: async () => (await import('./healthData.js')).loadRecentDays(3),
  // his 21-Aug brief: the morning show must also carry what the calendar
  // holds that is UNUSUAL, what his body is flagging, and an actual question
  historyDays: async () => (await import('./healthData.js')).loadRecentDays(21),
  // ONE CalDAV round trip for the whole fortnight. The first cut of this
  // looped fetchEventsForDay over 14 days — fourteen ~10s round trips, which
  // pushed /api/show past the client's abort and the brief silently never
  // arrived. fetchEventsForRange collects the window in a single request
  // (and shares the same 90s cache the rest of the day's reads use).
  eventsForRange: async (days = 14) => {
    const { fetchEventsForRange } = await import('./calendar.js');
    const from = new Date(Date.now() - days * 86_400_000);
    return fetchEventsForRange(days, from);
  },
  injuries: async (vaultPath) => (await import('./injuryLog.js')).listInjuries(vaultPath),
  programOpen: async () => {
    const { listRecords } = await import('./inboxStore.js');
    return (await listRecords())
      .filter((r) => r.kind === 'coach-program' && r.status === 'pending')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  },
  lastSessions: async (vaultPath) => (await import('./workoutSessions.js')).loadSessions(vaultPath, { limit: 4 }),
  foodToday: async () => (await import('./foodLog.js')).getToday(),
  records: async () => (await import('./inboxStore.js')).listRecords(),
  eventsForDay: async (date) => (await import('./calendar.js')).fetchEventsForDay(date),
  latestAudit: async () => (await import('./coachProgramAudit.js')).readAuditLog().then((a) => a[0] || null),
  libraryResurface: async (vaultPath, now) => {
    const { Vault } = await import('./vault.js');
    const { buildLibrary } = await import('./library.js');
    const { briefResurfaceLine } = await import('./librarySpacing.js');
    const items = await buildLibrary(vaultPath, new Vault(vaultPath));
    return items.length ? briefResurfaceLine(items, now) : null;
  },
  panel: async (vaultPath, directive) => (await import('./panels.js')).buildPanel(vaultPath, directive),
};

// Is this event a departure from his ordinary week? Deterministic: a label
// he has not seen in the trailing fortnight is unusual, and unusual is the
// only kind of calendar entry worth spending a spoken line on.
export function unusualEvents(todays, history) {
  const seen = new Set((history || []).map((e) => normLabel(e.label)));
  return (todays || []).filter((e) => {
    const n = normLabel(e.label);
    return n.length > 2 && !seen.has(n);
  });
}
const normLabel = (l) => despeak(l).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// The one calendar entry worth a warm, specific word rather than just a
// listing — his ask (24 Aug): notice something like a movie marathon or a
// day off and say something about it, the way a person would, not read it
// back as an entry. Deterministic keyword match, same shape as the Inbox's
// own TASK_HINTS classifier (valsInbox.js) — never a model guessing at what
// counts as worth a remark. Returns the first match, or null.
const LEISURE_HINTS = ['movie', 'film', 'cinema', 'marathon', 'concert', 'gig', 'theatre', 'theater', 'show', 'game night', 'date night', 'party', 'festival', 'holiday', 'vacation', 'day off', 'spa', 'massage', 'brunch'];
// Word-boundary, not plain substring: a couple of these hints ("spa", "gig")
// are short enough to hide inside an ordinary word ("space planning" has no
// business becoming "enjoy your spa day, sir") — a wrong guess here is a
// visibly odd line in his mouth, not just a silently skipped nudge.
const LEISURE_RE = LEISURE_HINTS.map((h) => new RegExp(`\\b${h}\\b`));
export function leisureEventToday(events) {
  return (events || []).find((e) => {
    const lower = normLabel(e.label);
    return LEISURE_RE.some((re) => re.test(lower));
  }) || null;
}

// `now` is injectable so the clock-aware beats can be tested at a fixed hour
// rather than against whatever time the suite happens to run at. Production
// never passes it.
export async function composeShow(vaultPath, { variant = 'morning', now: nowIn } = {}, deps = defaultDeps) {
  const steps = [];
  const now = nowIn ? new Date(nowIn) : new Date();
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getTime() - 86_400_000));
  const evening = variant === 'evening';

  // Kicked off FIRST and awaited last: the fortnight of calendar history is
  // a CalDAV round trip, and awaiting it inline made /api/show take 16s —
  // long enough that the client aborted the brief entirely. Started here, it
  // runs underneath every other read instead of after them.
  const historyP = (!evening && deps.eventsForRange) ? deps.eventsForRange(14).catch(() => null) : null;

  const days = await deps.recentDays().catch(() => []);
  const dToday = days.find((x) => x.date === today);
  const dYest = days.find((x) => x.date === yesterday);

  // — opening: greeting + the body's headline —
  {
    const open = evening ? pick(['Good evening, sir.', 'Evening, sir.']) : pick(['Good morning, sir.', 'Morning, sir.']);
    const bits = [];
    const sleepMin = (evening ? dToday : dToday || dYest)?.sleepAsleepMinutes;
    if (!evening && sleepMin) bits.push(`You slept ${hoursMinutes(sleepMin)}`);
    const hrv = [...days].reverse().find((x) => x.hrv != null);
    if (hrv) bits.push(`${bits.length ? 'and ' : ''}HRV is ${Math.round(hrv.hrv)}`);
    steps.push({ say: bits.length ? `${open} ${bits.join(', ')}.` : open });
    // the glass keeps up with the voice: sleep is the figure this line is about
    if (!evening && sleepMin) {
      const hrs = (sleepMin / 60);
      steps[steps.length - 1].card = metricCard({
        label: 'Slept', value: hrs.toFixed(1), unit: 'h', caption: 'LAST NIGHT',
        foot: hrv ? `HRV ${Math.round(hrv.hrv)} ms · ${hrv.date}` : 'HRV not recorded',
        tone: hrs < 6 ? 'warn' : hrs >= 7 ? 'good' : 'cy',
      });
    }
  }

  // — movement —
  {
    const d = evening ? dToday : dYest;
    if (d?.steps != null) {
      steps.push({
        say: evening ? `${d.steps.toLocaleString()} steps today.` : `${d.steps.toLocaleString()} steps yesterday.`,
        card: metricCard({ label: 'Steps', value: d.steps.toLocaleString(), caption: evening ? 'TODAY' : 'YESTERDAY', foot: d.date }),
      });
    }
  }

  // — fuel (evening leads with it; morning skips — nothing logged yet) —
  if (evening) {
    const log = await deps.foodToday().catch(() => null);
    const entries = log?.entries || [];
    if (entries.length) {
      const p = Math.round(entries.reduce((s, e) => s + (e.macros?.p || 0), 0));
      const kcal = Math.round(entries.reduce((s, e) => s + (e.macros?.kcal || 0), 0));
      const panel = await deps.panel(vaultPath, { panel: 'nutrition-week' }).catch(() => null);
      steps.push({ say: `${p} grams of protein and ${kcal.toLocaleString()} calories logged.`, ...(panel ? { panel } : {}) });
    }
  }

  // — the day's (or tomorrow's) shape —
  {
    const target = evening ? new Date(now.getTime() + 86_400_000) : now;
    const events = await deps.eventsForDay(target).catch(() => null);
    if (events) {
      const word = evening ? 'Tomorrow' : 'Today';
      if (!events.length) steps.push({ say: `${word} is clear on the calendar.` });
      else {
        // "Birthday at 12:00 am" is how a calendar talks, not a person:
        // all-day entries get named plainly, and "starting with" means the
        // first TIMED thing he actually has to be somewhere for.
        const allDay = events.filter((e) => e.time === '00:00');
        const timed = events.filter((e) => e.time !== '00:00');
        // THE CLOCK IS PART OF THE CONTEXT. This used to announce timed[0] —
        // the day's FIRST entry — as what the day starts with, no matter what
        // time it was. He opened the brief at 9am and was told his day starts
        // with a 7:30 workout, then asked what he wanted before it. Both
        // wrong, and wrong in a way that makes Nova look like it isn't there
        // with him. Only "today" has a now to be past: tomorrow's list is all
        // ahead of him by definition.
        const ahead = evening ? timed : timed.filter((e) => !isPast(e.time, now));
        const gone = evening ? [] : timed.filter((e) => isPast(e.time, now));
        const parts = [];
        if (allDay.length) parts.push(allDay.length === 1 ? `it's ${despeak(allDay[0].label)}` : `${allDay.length} all-day notes, first ${despeak(allDay[0].label)}`);
        if (ahead.length) {
          // "left" only makes sense about a day already under way — tomorrow
          // has nothing left, it has everything.
          const count = ahead.length === 1 ? 'one timed thing' : `${ahead.length} timed things`;
          parts.push(evening
            ? `${count}, first is ${despeak(ahead[0].label)} at ${speakTime(ahead[0].time)}`
            : `${count}${gone.length ? ' left' : ''}, next is ${despeak(ahead[0].label)} at ${speakTime(ahead[0].time)}`);
        } else if (gone.length) {
          // Say the true thing: the calendar is behind him. Naming what has
          // passed is also the honest opening for "did that actually happen?"
          parts.push(gone.length === 1
            ? `your only timed thing, ${despeak(gone[0].label)} at ${speakTime(gone[0].time)}, is already behind you`
            : `all ${gone.length} timed things are already behind you, the last being ${despeak(gone[gone.length - 1].label)} at ${speakTime(gone[gone.length - 1].time)}`);
        }
        if (!parts.length) parts.push('nothing timed left on the calendar');
        steps.push({
          say: `${word}: ${parts.join('; ')}.`,
          card: listCard({
            label: `${word} · ${events.length} ON THE CALENDAR`,
            items: events.slice(0, 5).map((e) => ({
              name: despeak(e.label),
              note: e.time === '00:00' ? 'all day'
                : `${speakTime(e.time)}${!evening && isPast(e.time, now) ? ' · passed' : ''}`,
            })),
          }),
        });
      }

      // — the one thing on today that ISN'T his usual week —
      // His ask: name what's unique and important, and what to remember for
      // it. Deterministic: a label absent from the trailing fortnight.
      if (events.length && !evening && historyP) {
        // bounded: a slow calendar loses this beat rather than the brief
        const history = await Promise.race([
          historyP,
          new Promise((res) => setTimeout(() => res(null), 4000)),
        ]);
        // a failed history read must not turn every ordinary event into news
        const odd = history ? unusualEvents(events, history) : [];
        if (odd.length) {
          // Prefer one he can still act on. "Worth deciding now what you need
          // for it" is nonsense about something that finished two hours ago.
          const e = odd.find((x) => x.time === '00:00' || !isPast(x.time, now)) || odd[0];
          const done = e.time !== '00:00' && isPast(e.time, now);
          steps.push({
            say: done
              ? `One thing stood out today: ${despeak(e.label)} at ${speakTime(e.time)} isn't part of your usual week. It's already passed — worth a note on how it went.`
              : `One thing stands out: ${despeak(e.label)}${e.time && e.time !== '00:00' ? ` at ${speakTime(e.time)}` : ''} isn't part of your usual week. Worth deciding now what you need for it.`,
            card: listCard({
              label: 'NOT YOUR USUAL WEEK',
              items: odd.slice(0, 3).map((x) => ({ name: despeak(x.label), note: x.time === '00:00' ? 'all day' : speakTime(x.time), tone: 'gold' })),
              foot: 'nothing like it in the last 14 days',
            }),
          });
        }
      }

      // — a leisure/rest event gets a word, not just a listing —
      if (!evening) {
        const leisure = leisureEventToday(events);
        if (leisure) {
          const label = despeak(leisure.label);
          steps.push({ say: pick([
            `Enjoy your ${label.toLowerCase()} today, sir — good excuse to rest and recharge.`,
            `${label} on the calendar today. Take it, sir — you've earned the downtime.`,
            `Worth noting: ${label.toLowerCase()} today. Make the most of it.`,
          ]) });
        }
      }
    }
  }

  // — WHAT HIS BODY IS FLAGGING, and the question that follows from it —
  // His ask: health metrics or concerns to keep in mind, and to be ASKED
  // about pain when the data suggests there might be some. The question is
  // only ever raised by evidence — a logged pain note, an open injury, or
  // an RPE-10 grind — never as a daily formality.
  if (!evening) {
    const concerns = [];
    let painPrompt = null;
    try {
      const open = (deps.injuries ? await deps.injuries(vaultPath) : []) || [];
      for (const inj of open.slice(0, 2)) {
        concerns.push({ name: despeak(inj.area), note: inj.severity || 'open', tone: 'warn' });
      }
      if (open.length) painPrompt = despeak(open[0].area);
    } catch { /* absent section */ }
    try {
      const sessions = (deps.lastSessions ? await deps.lastSessions(vaultPath) : []) || [];
      const recent = sessions.filter((x) => (now - new Date(x.date || 0)) < 4 * 86_400_000);
      for (const sess of recent) {
        for (const ex of sess.exercises || []) {
          const hurt = ex.pain || (ex.sets || []).some((st2) => st2.pain);
          if (!hurt) continue;
          concerns.push({ name: despeak(ex.name || ex.exerciseId), note: `pain · ${sess.date}`, tone: 'warn' });
          painPrompt = painPrompt || despeak(ex.name || ex.exerciseId);
        }
      }
    } catch { /* absent section */ }
    // RHR drifting well above his own baseline is worth a sentence
    const rhrDays = days.filter((x) => x.restingHr != null);
    if (rhrDays.length >= 2) {
      const latest = rhrDays[rhrDays.length - 1];
      const base = Math.round(rhrDays.slice(0, -1).reduce((a, b) => a + b.restingHr, 0) / Math.max(1, rhrDays.length - 1));
      if (latest.restingHr - base >= 7) {
        concerns.push({ name: 'Resting heart rate', note: `${Math.round(latest.restingHr)} vs ${base} bpm`, tone: 'warn' });
      }
    }
    if (concerns.length) {
      steps.push({
        say: painPrompt
          ? `Keep an eye on one thing: ${concerns[0].name.toLowerCase()} is flagged. How is it feeling this morning?`
          : `One thing to keep in mind: ${concerns[0].name.toLowerCase()} — ${concerns[0].note}.`,
        card: listCard({ label: 'WORTH KEEPING IN MIND', items: concerns, foot: 'from your own logs' }),
        ...(painPrompt ? { asks: true } : {}),
      });
    }
  }

  // — THE COACH'S OPEN ASK. His 21-Aug ask: a proposed program change
  //   should reach him in the morning brief, not only the Inbox. One at a
  //   time, the oldest unanswered first, and it says how long it has waited.
  if (!evening && deps.programOpen) {
    try {
      const open = (await deps.programOpen()) || [];
      if (open.length) {
        const top = open[0];
        const waited = Math.floor((now - new Date(top.createdAt || now)) / 86_400_000);
        steps.push({
          say: `${top.nudges ? 'Still waiting on you' : 'One from me'}, sir: ${despeak(String(top.text || '').replace(/^Coach:\s*/, ''))}`,
          card: listCard({
            label: top.nudges ? `COACH · ASKED ${top.nudges + 1}×` : 'COACH · A CHANGE WORTH MAKING',
            items: [{ name: despeak(String(top.text || '').replace(/^Coach:\s*/, '')).slice(0, 46), note: waited > 0 ? `${waited}d open` : 'new', tone: top.nudges ? 'warn' : 'gold' }],
            foot: 'yes or no in your Inbox — or argue it with Coach',
          }),
          asks: true,
        });
      }
    } catch { /* absent section */ }
  }

  // — the weekly program audit —
  // Not a finding: a RECEIPT. He asked for the program checks to be audited
  // across the week and to hear about it, and the reassuring half of that is
  // "I looked at eight things and six are clean" — which is exactly the part
  // a findings-only brief never says. Spoken once, the morning it lands.
  if (!evening && deps.latestAudit) {
    try {
      const audit = await deps.latestAudit();
      if (audit && audit.weekOf === localDate(mondayOfLocal(now))) {
        const fired = (audit.checks || []).filter((c) => c.status === 'fired').length;
        const clear = (audit.checks || []).filter((c) => c.status === 'clear').length;
        const notYet = (audit.checks || []).filter((c) => c.status === 'not-yet').length;
        steps.push({
          say: despeak(audit.summary),
          card: listCard({
            label: `PROGRAM AUDIT · WEEK OF ${audit.weekOf}`,
            items: (audit.checks || []).slice(0, 5).map((c) => ({
              name: c.label,
              note: c.status === 'fired' ? 'needs a decision' : c.status === 'clear' ? 'clean' : 'not yet answerable',
              tone: c.status === 'fired' ? 'gold' : undefined,
            })),
            foot: `${fired} to decide · ${clear} clean · ${notYet} pending more history`,
          }),
        });
      }
    } catch { /* absent section */ }
  }

  // — an idea from his library, occasionally —
  // Librarian Phase 3's brief hook. Rate-limited hard (once every few days)
  // because the way a resurfacing beat turns preachy is by arriving every
  // morning; it declines rather than reaching when nothing is genuinely due.
  if (!evening && deps.libraryResurface) {
    try {
      const res = await deps.libraryResurface(vaultPath, now);
      if (res?.line) {
        steps.push({
          say: despeak(res.line),
          card: listCard({
            label: res.reason === 'reconnected' ? 'FROM YOUR LIBRARY · NEWLY CONNECTED' : 'FROM YOUR LIBRARY',
            items: (res.item.concepts || []).slice(0, 4).map((c) => ({ name: c })),
            foot: res.item.provenance === 'researched' ? 'researched, not read' : undefined,
          }),
        });
      }
    } catch { /* absent section */ }
  }

  // — what the agents produced (last 16 hours, newest first, max two) —
  const records = await deps.records().catch(() => []);
  const pending = records.filter((r) => r.status === 'pending');
  {
    const cutoff = now.getTime() - 16 * 3600e3;
    const produced = pending
      .filter((r) => PRODUCE_KINDS.includes(r.kind) && new Date(r.createdAt || 0).getTime() > cutoff)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 2);
    for (const r of produced) {
      steps.push({ say: `${evening ? 'Today' : 'While you slept'}, the ${r.kind === 'forge-job' ? 'Forge built' : `${r.kind} agent drafted`} “${recordLabel(r)}” — it's pending your word.` });
    }
    if (produced.length) {
      steps[steps.length - 1].card = listCard({
        label: evening ? 'THE FLEET, TODAY' : 'THE FLEET, OVERNIGHT',
        items: produced.map((r) => ({ name: recordLabel(r), note: r.kind })),
        foot: `${produced.length} of ${pending.length} waiting on you`,
      });
    }
  }

  // — the one item that wants his word, wired for a spoken yes —
  let approve = null;
  if (pending.length) {
    const highlight = [...pending]
      .sort((a, b) =>
        (PRODUCE_KINDS.includes(b.kind) - PRODUCE_KINDS.includes(a.kind))
        || (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)))[0];
    approve = { recordId: highlight.id, title: recordLabel(highlight) };
    const rest = pending.length - 1;
    steps.push({
      say: `${pending.length === 1 ? 'One draft waits' : `${pending.length} drafts wait`} in your Inbox — nearest is “${approve.title}”. Say the word and I'll file it${rest > 0 ? '; the rest can hold' : ''}.`,
      card: metricCard({ label: 'Waiting on you', value: String(pending.length), caption: 'DRAFTS IN THE INBOX', foot: approve.title, tone: pending.length > 12 ? 'warn' : 'cy' }),
    });
  }

  // — close —
  // — the close. In the morning it ENDS ON A QUESTION: his ask was that the
  //   brief helps him prepare, and preparation is a conversation, not a
  //   bulletin. The mic is already open by the time he hears it.
  steps.push({ say: evening
    ? pick(['That closes the day, sir. Rest well.', 'Nothing else needs you tonight, sir.'])
    : pick([
        'What would you like to have done by tonight, sir?',
        'Anything you want me to take off your hands before you start?',
        'What is the one thing that has to happen today, sir?',
      ]),
    ...(evening ? {} : { asks: true }) });

  // ONE EXIT for spoken text: every line leaves as a person would say it.
  // Done here rather than at each push so a new beat cannot forget it.
  return { steps: steps.map((s) => (s.say ? { ...s, say: speakDates(s.say) } : s)), pending: approve };
}
