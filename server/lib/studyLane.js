// The STUDY lane — "analyse this creator" as a real job, not a wish.
//
// This automates the protocol run by hand for the WiseTwinz study
// (design/WISETWINZ-STUDY-PLAN.md): ENUMERATE the body of work first
// (videos + shorts tabs — never sample silently), TRANSCRIBE the most
// recent slice within budget, then SYNTHESIZE one brief that compares
// against Nova's own capability inventory and ends in recommendations.
//
// Rails: the job is an inbox record (kind 'study') — classifying while it
// runs, pending when the brief lands (push + Telegram fire automatically
// via notifyIfPending), error with the reason if it dies. Approving files
// the brief as a vault note through the existing note route. Coverage is
// ALWAYS stated: "transcribed 10 of 37" is a finding, not a footnote.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';
const COOKIES = path.join(os.homedir(), '.config/watch/yt-cookies.txt');
const MAX_BUDGET_USD = '1.5';
const MAX_TRANSCRIPTS = 10;       // depth cap — stated in the brief, never silent
const TRANSCRIPT_CHARS = 6_000;   // per-video excerpt budget for the synthesis prompt
const INVENTORY_REL = 'design/NOVA-CAPABILITY-INVENTORY.md';

function run(bin, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let out = '', err = '';
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(err.trim().slice(0, 300) || `exit ${code}`)); });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

const cookieArgs = () => (existsSync(COOKIES) ? ['--cookies', COOKIES] : []);

const CHANNEL_RE = /youtube\.com\/(@|c\/|channel\/|user\/)/i;

// Pure + exported for tests: expand study sources into a flat catalogue
// entry list. Channel URLs expand via the provided enumerate function.
export async function enumerateSources(urls, enumerate) {
  const items = [];
  const failures = [];
  for (const url of urls) {
    if (CHANNEL_RE.test(url)) {
      const base = url.replace(/\/(videos|shorts|streams)\/?$/, '').replace(/\/$/, '');
      for (const tab of ['videos', 'shorts']) {
        try {
          for (const e of await enumerate(`${base}/${tab}`)) items.push({ ...e, tab });
        } catch (e) { failures.push(`${tab} tab: ${e.message.slice(0, 80)}`); }
      }
    } else {
      items.push({ id: url, url, title: '(direct link)', duration: null, tab: 'direct' });
    }
  }
  // dedupe by id, newest-first ordering is the platform default
  const seen = new Set();
  const deduped = items.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  return { items: deduped, failures };
}

async function ytEnumerate(url) {
  const out = await run(YTDLP, ['--flat-playlist', '-J', ...cookieArgs(), url], { timeoutMs: 90_000 });
  const entries = JSON.parse(out)?.entries || [];
  return entries.map((e) => ({ id: e.id, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, title: e.title || '?', duration: e.duration || null }));
}

// Captions only — fast, no video download. Rolling-caption dedupe by
// longest-overlap join (the same trick the manual study used).
export function dedupeRollingCaptions(vtt) {
  const lines = vtt.split('\n')
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !l.includes('-->') && !/^WEBVTT|^Kind:|^Language:/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, '').trim());
  let text = '';
  for (const l of lines) {
    if (!text) { text = l; continue; }
    let k = Math.min(text.length, l.length);
    let ov = 0;
    while (k > 0) { if (text.endsWith(l.slice(0, k))) { ov = k; break; } k--; }
    const add = l.slice(ov);
    if (add.trim()) text += ' ' + add.trim();
  }
  return text.replace(/\s+/g, ' ').trim();
}

async function fetchTranscript(url) {
  const dir = path.join(os.tmpdir(), `nova-study-${randomUUID().slice(0, 8)}`);
  await run(YTDLP, ['--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'en.*,en', '--sub-format', 'vtt', '-o', path.join(dir, 'v'), ...cookieArgs(), url], { timeoutMs: 90_000 });
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.vtt'));
  if (!files.length) throw new Error('no captions available');
  const vtt = await readFile(path.join(dir, files[0]), 'utf8');
  const { rm } = await import('node:fs/promises');
  rm(dir, { recursive: true, force: true }).catch(() => {});
  return dedupeRollingCaptions(vtt);
}

function buildSynthesisPrompt({ prose, entries, transcripts, inventory, coverage }) {
  return `You are Nova's Study agent. Hayden asked: "${prose || 'analyse this creator and note the differences vs Nova'}".

You are given the enumerated catalogue, transcripts of the ${transcripts.length} most recent items, and Nova's own capability inventory. Produce ONE markdown brief with exactly these sections:
## What they've built
## Notable per-video findings
(cite the video title for every claim; only claim what a transcript supports)
## Capability diff vs Nova
(three lists: Nova ahead / parity / theirs ahead — ground the Nova side ONLY in the inventory below)
## Recommendations for Nova
(prioritised, each with a one-line why)
## Coverage
(state exactly: ${coverage} — and name anything you could not assess from transcripts alone, e.g. visual design)

Never invent numbers, features, or video content. If a transcript is thin, say so rather than embellishing.

CATALOGUE (${entries.length} items):
${entries.slice(0, 60).map((e) => `- [${e.tab}] ${e.title}${e.duration ? ` (${Math.round(e.duration / 60)}m)` : ''}`).join('\n')}

TRANSCRIPTS (most recent ${transcripts.length}, each truncated to ~${TRANSCRIPT_CHARS} chars):
${transcripts.map((t) => `### ${t.title}\n${t.text.slice(0, TRANSCRIPT_CHARS)}`).join('\n\n')}

NOVA'S CAPABILITY INVENTORY (the ONLY source for Nova-side claims):
${inventory}`;
}

function runModel(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', '',
      '--output-format', 'json',
      '--max-budget-usd', MAX_BUDGET_USD,
      '--no-session-persistence',
    ]);
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim().slice(0, 300) || `claude exited ${code}`));
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'synthesis failed');
        resolve((outer.result || '').trim());
      } catch (e) { reject(e); }
    });
    child.on('error', reject);
  });
}

async function runStudyJob(vaultPath, record, { urls, prose }) {
  const { updateRecord } = await import('./inboxStore.js');
  try {
    const { items, failures } = await enumerateSources(urls, ytEnumerate);
    if (!items.length) throw new Error(`nothing enumerable at ${urls.join(', ')}${failures.length ? ` (${failures.join('; ')})` : ''}`);

    const toTranscribe = items.filter((e) => e.tab !== 'shorts').slice(0, MAX_TRANSCRIPTS);
    const transcripts = [];
    const noCaptions = [];
    for (const e of toTranscribe) {
      try { transcripts.push({ title: e.title, text: await fetchTranscript(e.url) }); }
      catch { noCaptions.push(e.title); }
    }
    if (!transcripts.length) throw new Error('no transcripts could be fetched — nothing honest to synthesize from');

    let inventory = '(inventory unavailable — make NO Nova-side claims; list their capabilities only)';
    try { inventory = (await readFile(path.join(process.cwd(), INVENTORY_REL), 'utf8')).slice(0, 9_000); } catch { /* stated in prompt */ }

    const coverage = `enumerated ${items.length} items; transcribed ${transcripts.length} of ${toTranscribe.length} attempted (most recent long-form first; shorts listed but not transcribed)${noCaptions.length ? `; no captions: ${noCaptions.slice(0, 5).join(', ')}` : ''}${failures.length ? `; enumeration gaps: ${failures.join('; ')}` : ''}`;

    const body = await runModel(buildSynthesisPrompt({ prose, entries: items, transcripts, inventory, coverage }));
    const title = `Study — ${(prose || urls[0]).slice(0, 60)}`;
    await updateRecord(record.id, {
      status: 'pending',
      decision: { route: 'note', confidence: 'high', title, reason: 'study brief — approve to file it into the vault', payload: { title, body } },
      error: null,
    });
  } catch (e) {
    await updateRecord(record.id, { status: 'error', error: e.message.slice(0, 300) }).catch(() => {});
  }
}

export async function startStudy(vaultPath, { urls, prose }) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) throw new Error('a study needs at least one link');
  const { createRecord } = await import('./inboxStore.js');
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'study',
    text: `Study: ${(prose || '').slice(0, 80) || list[0]}`,
    studyUrls: list, studyProse: prose || '',
    source: 'nova', mode: 'draft', status: 'classifying',
    createdAt: new Date().toISOString(),
  });
  runStudyJob(vaultPath, record, { urls: list, prose });
  return record;
}

// retry support — the record carries its full input
export async function retryStudy(vaultPath, record) {
  const { updateRecord } = await import('./inboxStore.js');
  const updated = await updateRecord(record.id, { status: 'classifying', error: null });
  runStudyJob(vaultPath, updated, { urls: record.studyUrls || [], prose: record.studyProse || '' });
  return updated;
}
