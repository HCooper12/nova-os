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

  const child = spawn(CLAUDE_BIN, [
    '-p', buildBrowsePrompt(task, shotDir),
    '--permission-mode', 'bypassPermissions',
    '--mcp-config', cfgPath,
    '--strict-mcp-config',
    '--allowedTools', TOOLS.join(' '),
    '--disallowedTools', DISALLOWED,
    '--output-format', 'json',
    '--model', modelFor('browse'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd: shotDir, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  const watchdog = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, WATCHDOG_MIN * 60_000);
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += String(d).slice(0, 4000); });

  await new Promise((resolve) => {
    child.on('close', async () => {
      clearTimeout(watchdog);
      try {
        let text = '';
        try {
          const outer = JSON.parse(stdout);
          if (outer.is_error) throw new Error(outer.result || 'the browser session failed');
          text = String(outer.result || '');
        } catch (e) {
          if (!stdout.trim()) throw new Error(stderr.trim().split('\n').pop()?.slice(0, 200) || 'the browser session produced nothing');
          throw e;
        }
        const result = parseBrowseResult(text);
        const shots = (await readdir(shotDir).catch(() => [])).filter((f) => /^shot-\d+\.(png|jpe?g|webp)$/i.test(f)).sort();
        const title = `Browser: ${task.slice(0, 60)}${task.length > 60 ? '…' : ''}`;
        await updateRecord(recordId, {
          status: 'pending',
          shots: shots.length,
          stoppedBefore: result?.stoppedBefore || null,
          decision: {
            route: 'note',
            confidence: 'high',
            title,
            reason: result?.stoppedBefore
              ? 'the browser stopped before the button that commits — read it, then press it yourself'
              : 'what Nova saw and did in the browser — approve to keep it as a note, or discard',
            payload: { title, body: describeBrowse({ task, result, shots: shots.length }) },
          },
        });
      } catch (e) {
        await updateRecord(recordId, { status: 'error', error: e.message.slice(0, 300) }).catch(() => {});
      }
      resolve();
    });
  });
}
