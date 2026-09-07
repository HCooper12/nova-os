// THE BROWSER HAND — Nova using a real browser, the way he would.
//
// His ask, 6 Sep 2026: "reach third party apps and use websites like
// Google/internet browser to do anything I need it to." The Shortcuts hand
// covers what he has already automated; this covers the rest of the web.
//
// HOW IT DIFFERS FROM EVERYTHING ELSE HERE, said plainly because it matters:
// everywhere else in Nova the model DECIDES and tested code ACTS. In a
// browser the model IS the actor — it reads the page and chooses the next
// click. That is a real departure from the doctrine, so the protections are
// structural rather than aspirational:
//
//   1. NOVA'S OWN PROFILE. `~/.nova-browser` — the same profile the Scout
//      reads with, which he signs into deliberately. Never his day-to-day
//      Chrome: driving that would fight his own session and put every
//      account he happens to be logged into within reach.
//   2. ONE SET OF HANDS. Only the Chrome DevTools MCP server is loaded
//      (`--strict-mcp-config`), and only its read / navigate / fill tools.
//      No Bash, no file writes, no other MCP.
//   3. IT STOPS BEFORE IT COMMITS. Buying, paying, sending, posting,
//      applying, deleting, and signing in with a password are OUT OF SCOPE
//      for this phase: the job fills the form, screenshots it, and hands
//      back what it would press. His yes is a separate, later build.
//   4. A RECEIPT WITH EVIDENCE. Every run lands a pending record: the steps
//      it took, the pages it touched, what it stopped in front of, and
//      numbered screenshots on disk.
//   5. A CEILING. Budget-capped and watchdogged like every other lane.
//
// What it cannot do is as important as what it can, and the report says so.

import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecord, updateRecord } from './inboxStore.js';
import { PROFILE_DIR, browserAvailable, profileExists } from './browserResearch.js';
import { modelFor } from './modelPrefs.js';
import { laneEnabled, laneOffError } from './modelPrefs.js';
import { parseModelJson } from './jsonSalvage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MAX_BUDGET_USD = process.env.NOVA_BROWSE_BUDGET || '2.0';
const WATCHDOG_MIN = 8;

// The MCP server that IS the hands. Resolved from the npx cache or an
// explicit path; absent means the lane says so instead of pretending.
export function mcpServerPath() {
  if (process.env.NOVA_CHROME_MCP) return process.env.NOVA_CHROME_MCP;
  const npx = path.join(process.env.HOME || '', '.npm', '_npx');
  if (!existsSync(npx)) return null;
  const rel = ['node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp.js'];
  try {
    for (const dir of readdirSync(npx)) {
      const p = path.join(npx, dir, ...rel);
      if (existsSync(p)) return p;
    }
  } catch { /* no cache — the caller says so */ }
  return null;
}

// The tools it may use: read the page, move around it, type into it. No
// upload, no dialog handling, no emulation, no performance traces.
const TOOLS = [
  'navigate_page', 'new_page', 'list_pages', 'close_page', 'wait_for',
  'take_snapshot', 'take_screenshot', 'evaluate_script',
  'click', 'hover', 'fill', 'fill_form',
].map((t) => `mcp__chrome-devtools__${t}`);

// --disallowedTools is the real boundary under bypassPermissions (the
// allowlist is documentation). Name everything that could act outside the
// browser, or commit inside it.
const DISALLOWED = [
  'Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Read', 'Glob', 'Grep',
  'mcp__chrome-devtools__upload_file', 'mcp__chrome-devtools__handle_dialog', 'mcp__chrome-devtools__drag',
  'mcp__chrome-devtools__emulate', 'mcp__chrome-devtools__press_key',
].join(' ');

export function buildBrowsePrompt(task, shotDir) {
  return `You are Nova's hands in a web browser, working for Hayden on his Mac.

THE TASK, in his words: ${task}

YOUR HANDS: the Chrome DevTools tools. The browser is Nova's OWN Chrome
profile — he has signed it into some sites and not others. If a site shows a
logged-out or login-walled view, that is the ANSWER ("Nova's browser is not
signed in to X"), not something to work around. Never type a password, never
create an account, never solve a captcha.

WHAT YOU MAY DO: open pages, read them, follow links, search, and FILL IN
forms.

WHAT YOU MUST NOT DO — stop before it, every time:
- pressing anything that BUYS, PAYS, BOOKS, SENDS, POSTS, APPLIES, SUBMITS
  an order, CANCELS, or DELETES;
- signing in, signing up, or entering card, bank or ID details;
- changing any account's settings.
When the task needs one of those, do everything up to it — get to the page,
fill the fields, and STOP with the button in view. Screenshot it. Report
exactly what you would press and what it would do. He presses it himself.

HE IS WATCHING. He sees each screenshot on his screen the moment you take it, so: take one IMMEDIATELY after every navigation and after every click that changes the page, before you read or decide anything — a step he cannot see did not happen for him. Say what you are doing in one short sentence before each action ("Opening the channel\x27s Videos tab.") — that line is shown beside the window.

EVIDENCE: take a screenshot at each meaningful step with
take_screenshot({ filePath: "${shotDir}/shot-N.png" }) numbering from 1 —
what you saw is what he will read this by.

BE ECONOMICAL: a handful of steps, not a tour. If the task turns out to be
impossible or the site refuses you, say so early rather than trying ten ways.

Finish your reply with ONE line of JSON and nothing after it:
BROWSE {"done": true|false, "summary": "<2-4 sentences, plain, what you found or did>", "steps": ["<each page or action, one short line>"], "stoppedBefore": "<the exact control you stopped in front of, or null>", "cannot": "<what you could not do and why, or null>"}`;
}

export function parseBrowseResult(text) {
  const m = String(text || '').match(/^\s*BROWSE\s+(\{[\s\S]*\})\s*$/m);
  if (!m) return null;
  try {
    const o = parseModelJson(m[1]);
    return {
      done: !!o.done,
      summary: String(o.summary || '').slice(0, 1200),
      steps: Array.isArray(o.steps) ? o.steps.map((s) => String(s).slice(0, 160)).slice(0, 20) : [],
      stoppedBefore: o.stoppedBefore ? String(o.stoppedBefore).slice(0, 200) : null,
      cannot: o.cannot ? String(o.cannot).slice(0, 300) : null,
    };
  } catch { return null; }
}

export function describeBrowse({ task, result, shots }) {
  const lines = [];
  if (result?.summary) lines.push(result.summary);
  if (result?.steps?.length) lines.push('', 'What it did:', ...result.steps.map((s) => `- ${s}`));
  if (result?.stoppedBefore) lines.push('', `Stopped before: ${result.stoppedBefore} — that one is yours to press.`);
  if (result?.cannot) lines.push('', `Could not: ${result.cannot}`);
  lines.push('', shots > 0
    ? `${shots} screenshot${shots === 1 ? '' : 's'} saved with this record.`
    : 'No screenshots were taken.');
  if (!result) lines.push('', 'The session ended without a readable report — the steps above are all there is.');
  return lines.join('\n').trim() || `Nothing came back from the browser for: ${task}`;
}

export async function startBrowse(vaultPath, task) {
  const t = String(task || '').trim();
  if (!t) throw new Error('a browsing task is required');
  if (!laneEnabled('browse')) throw laneOffError('browse');
  if (!browserAvailable()) throw new Error('Chrome is not installed where Nova expects it');
  const server = mcpServerPath();
  if (!server) throw new Error('the Chrome DevTools MCP server is not installed — run `npx chrome-devtools-mcp@latest --help` once to fetch it');

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'browse',
    text: t,
    source: 'browse',
    mode: 'draft',
    status: 'classifying',
    createdAt: new Date().toISOString(),
    task: t,
    signedIn: profileExists(),
  });
  run(record.id, t, server).catch(async (e) => {
    await updateRecord(record.id, { status: 'error', error: e.message }).catch(() => {});
  });
  return record;
}

async function run(recordId, task, server) {
  const shotDir = path.join(dataRoot(), 'browse', recordId);
  await mkdir(shotDir, { recursive: true });
  const cfgPath = path.join(shotDir, 'mcp.json');
  await writeFile(cfgPath, JSON.stringify({
    mcpServers: {
      'chrome-devtools': {
        command: process.execPath,
        args: [server, '--userDataDir', PROFILE_DIR, '--headless', 'true', '--viewport', '1280x1600',
          '--screenshotFormat', 'jpeg', '--screenshotQuality', '70', '--screenshotMaxWidth', '1100',
          '--categoryPerformance', 'false', '--categoryNetwork', 'false', '--categoryEmulation', 'false',
          '--allowUnrestrictedPaths'],
      },
    },
  }, null, 2), 'utf8');

  // kept on the record: his yes resumes THIS session to press the control
  const sessionId = randomUUID();
  const child = spawn(CLAUDE_BIN, [
    '-p', buildBrowsePrompt(task, shotDir),
    '--permission-mode', 'bypassPermissions',
    '--mcp-config', cfgPath,
    '--strict-mcp-config',
    '--allowedTools', TOOLS.join(' '),
    '--disallowedTools', DISALLOWED,
    // STREAMED, not a single result at the end (7 Sep 2026): his ask is to
    // WATCH the hand work — windows appearing on the glass as Nova opens
    // them — so every tool call is read as it happens and becomes a step in
    // the live feed (liveFeed below), and the final result is the last event.
    '--output-format', 'stream-json', '--verbose',
    '--model', modelFor('browse'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', sessionId,
  ], { cwd: shotDir, stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  let finalText = null;
  let isError = false;
  let buf = '';
  const watchdog = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, WATCHDOG_MIN * 60_000);
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'result') { finalText = String(ev.result || ''); isError = !!ev.is_error; continue; }
      const step = stepFromEvent(ev);
      if (step) noteStep(recordId, step);
    }
  });
  child.stderr.on('data', (d) => { stderr += String(d).slice(0, 4000); });

  await new Promise((resolve) => {
    child.on('close', async () => {
      clearTimeout(watchdog);
      try {
        let text = '';
        if (finalText == null) throw new Error(stderr.trim().split('\n').pop()?.slice(0, 200) || 'the browser session produced nothing');
        if (isError) throw new Error(finalText || 'the browser session failed');
        text = finalText;
        const result = parseBrowseResult(text);
        const shots = (await readdir(shotDir).catch(() => [])).filter((f) => /^shot-\d+\.(png|jpe?g|webp)$/i.test(f)).sort();
        const title = `Browser: ${task.slice(0, 60)}${task.length > 60 ? '…' : ''}`;
        const stopped = result?.stoppedBefore || null;
        const body = describeBrowse({ task, result, shots: shots.length });
        await updateRecord(recordId, {
          status: 'pending',
          shots: shots.length,
          stoppedBefore: stopped,
          sessionId,
          // A run that stopped in front of a control is not a note to file —
          // it is a DECISION. Approving presses that one control, in the same
          // browser session, and nothing else. A run with nothing pending
          // files as an ordinary note, exactly as before.
          decision: stopped ? {
            route: 'browse-commit',
            confidence: 'high',
            title,
            reason: `approving PRESSES "${stopped}" — that is the point of the run, and it cannot be undone`,
            payload: { title, body, recordId, sessionId, press: stopped, task, shotDir },
          } : {
            route: 'note',
            confidence: 'high',
            title,
            reason: 'what Nova saw and did in the browser — approve to keep it as a note, or discard',
            payload: { title, body },
          },
        });
      } catch (e) {
        await updateRecord(recordId, { status: 'error', error: e.message.slice(0, 300) }).catch(() => {});
      }
      // the last nudge: the record has landed (pending or error) — the open app
      // pulls once more and shows the finish, without ever having to poll
      import('./events.js').then(({ broadcast }) => broadcast('browseLive', { id: recordId, done: true, slices: [] })).catch(() => {});
      resolve();
    });
  });
}

/* ------------------------------ the live feed ------------------------------ */

// What the hand is doing, as it does it. One entry per tool call the model
// makes — a navigation, a click, a screenshot — plus its own narration, so
// the glass can show "Opening youtube.com…" with the window beside it. Kept
// in memory per run (a run is minutes long) and served by /api/browse/:id/live.
// Bounded: a runaway session cannot grow this without limit.
const feeds = new Map();
const MAX_STEPS = 120;

export function liveFeed(recordId) { return feeds.get(recordId) || null; }
// where a run keeps its windows — from THIS module's data root, never process.cwd()
export function shotDirFor(recordId) { return path.join(dataRoot(), 'browse', String(recordId).replace(/[^a-z0-9]/gi, '')); }

function noteStep(recordId, step) {
  const feed = feeds.get(recordId) || { steps: [], at: Date.now() };
  feed.steps.push({ at: Date.now(), ...step });
  if (feed.steps.length > MAX_STEPS) feed.steps.splice(0, feed.steps.length - MAX_STEPS);
  feed.at = Date.now();
  feeds.set(recordId, feed);
  // one SSE line per step: the open app pulls the feed within a second
  import('./events.js').then(({ broadcast }) => broadcast('browseLive', { id: recordId, slices: [] })).catch(() => {});
}

// stream-json → a human step. Only the calls that MEAN something to him
// become steps; snapshots and evaluations are the hand's own bookkeeping.
export function stepFromEvent(ev) {
  if (ev?.type !== 'assistant') return null;
  const parts = ev.message?.content || [];
  for (const p of parts) {
    if (p.type === 'tool_use') {
      const name = String(p.name || '').replace(/^mcp__chrome-devtools__/, '');
      const input = p.input || {};
      if (name === 'navigate_page' && input.url) return { kind: 'navigate', text: `Opening ${hostOf(input.url)}`, url: input.url };
      if (name === 'new_page' && input.url) return { kind: 'navigate', text: `Opening ${hostOf(input.url)}`, url: input.url };
      if (name === 'take_screenshot' && input.filePath) {
        const m = String(input.filePath).match(/(shot-\d+)\.(png|jpe?g|webp)$/i);
        return { kind: 'shot', text: 'Taking a look', shot: m ? `${m[1]}.${m[2]}` : null };
      }
      if (name === 'click') return { kind: 'click', text: 'Clicking' };
      if (name === 'fill' || name === 'fill_form') return { kind: 'type', text: 'Typing' };
      if (name === 'wait_for') return { kind: 'wait', text: 'Waiting for the page' };
    }
    if (p.type === 'text' && String(p.text || '').trim()) {
      // the model's own running narration, minus the final BROWSE block
      const t = String(p.text).replace(/BROWSE\s*\{[\s\S]*$/, '').replace(/\s+/g, ' ').trim();
      if (t.length > 3) return { kind: 'say', text: t.slice(0, 240) };
    }
  }
  return null;
}

const hostOf = (u) => { try { const x = new URL(u); const p = x.pathname === '/' ? '' : x.pathname.slice(0, 42); return x.hostname.replace(/^www\./, '') + p + (x.pathname.length > 42 ? '…' : ''); } catch { return u; } };

/* ------------------------ the second half: his yes ------------------------ */

// The first run stops in front of the control and reports it. This resumes
// THAT session (`--resume`, so the model still knows the page it was on, and
// the profile still holds the cookies), authorises exactly one control, and
// nothing else. It cannot be undone — the record's reason and this prompt
// both say so. Fire-and-forget: pressing can take a minute, and holding his
// approve request open would time it out, so the outcome is appended to the
// same record and the Inbox refreshes itself.
export function buildPressPrompt(task, control, shotDir) {
  return `You are Nova's hands in the browser, resuming the session you just ran.

The original task: ${task}
You stopped in front of: ${control}

He has now approved EXACTLY that one control. Get back to it if the page has
moved on, press it, and confirm what happened.

Do NOT do anything else: no other button, no extra item, no settings, no
sign-in, no second attempt at a different control. If the page has changed
enough that the control is gone, or would now do something different from
what you described to him, STOP and say so rather than pressing something
that merely looks similar.

Screenshot the result with take_screenshot({ filePath: "${shotDir}/press-1.png" }).

Finish with ONE line of JSON and nothing after it:
BROWSE {"done": true|false, "summary": "<what happened when you pressed it, or why you did not>", "steps": ["<each action>"], "stoppedBefore": null, "cannot": "<why not, or null>"}`;
}

export async function pressPending(payload) {
  const { recordId, sessionId, press, task, shotDir } = payload || {};
  if (!recordId || !sessionId || !press) throw new Error('that record has nothing waiting to be pressed');
  const server = mcpServerPath();
  if (!server) throw new Error('the Chrome DevTools MCP server is not installed');
  const dir = shotDir || path.join(dataRoot(), 'browse', recordId);
  const cfgPath = path.join(dir, 'mcp.json');
  if (!existsSync(cfgPath)) throw new Error('that browser session is gone — run the task again');

  const child = spawn(CLAUDE_BIN, [
    '-p', buildPressPrompt(task || '', press, dir),
    '--resume', sessionId,
    '--permission-mode', 'bypassPermissions',
    '--mcp-config', cfgPath,
    '--strict-mcp-config',
    '--allowedTools', TOOLS.join(' '),
    '--disallowedTools', DISALLOWED,
    '--output-format', 'json',
    '--model', modelFor('browse'),
    '--max-budget-usd', MAX_BUDGET_USD,
  ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  const watchdog = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 6 * 60_000);
  child.stdout.on('data', (d) => { stdout += d; });
  child.on('close', async () => {
    clearTimeout(watchdog);
    let line;
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error) throw new Error(outer.result || 'the session failed');
      const done = parseBrowseResult(String(outer.result || ''));
      line = done
        ? `\n\n— Pressed "${press}": ${done.summary}${done.cannot ? ` (could not: ${done.cannot})` : ''}`
        : `\n\n— Went back to press "${press}", but the session came back without a readable report. Check the site yourself before assuming it went through.`;
    } catch (e) {
      line = `\n\n— Tried to press "${press}" and the session failed: ${String(e.message).slice(0, 160)}. Nothing is confirmed — check the site yourself.`;
    }
    try {
      const { getRecord } = await import('./inboxStore.js');
      const rec = await getRecord(recordId);
      if (rec?.decision?.payload) {
        await updateRecord(recordId, {
          pressed: true,
          destination: `Browser — pressed "${press}"`,
          decision: { ...rec.decision, payload: { ...rec.decision.payload, body: `${rec.decision.payload.body || ''}${line}` } },
        });
      }
      (await import('./events.js')).broadcast('inbox');
    } catch { /* the record moved on — the browser still did what it did */ }
  });
  return { press };
}
