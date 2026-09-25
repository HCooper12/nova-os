// THE MAC'S OWN HAND — "Clicky" (his note, 22 Sep 2026: "I want Nova to
// expand its capabilities to this next"; built 25 Sep).
//
// The reel: a voice agent that opens his apps, plays a song, turns the music
// down, opens a dashboard in his browser, and after writing a reminder opens
// Reminders "so I can confirm". Nova's first two hands reach his Shortcuts
// (hands.js) and a browser of its own (browse.js); neither touches the Mac he
// is sitting at. This one does, and ONLY through the operations below.
//
// DOCTRINE. Models decide, code acts: a model (or the verbs grammar) NAMES an
// operation and his words; the AppleScript is fixed source in this file, and
// his words reach it only as ARGUMENTS after `--`, never spliced into the
// script — a song called `" & (do shell script "…")` is inert text (tested,
// and measured on this Mac before a line was written). No free-form script,
// no clicking on the screen: that would make the model the actor on his real
// desktop, which is a different decision, and his.
//
// None of these write his data. Opening, playing and turning the volume down
// change what is on the screen and in the room, not what is stored — so they
// are act-tier, and each carries its natural inverse as its undo where one
// exists (pause ↔ play, volume → the level before). Opening has no undo Nova
// can do (closing it is his click); the receipt says so.
//
// macOS guards Apple events (TCC). The FIRST time Nova drives the Music app,
// his Mac asks "node wants access to control Music" and nothing works until
// he clicks OK; a refusal is remembered. Both are said plainly, with where to
// fix it, and the last outcome per app is kept in data/mac-hand.json so the
// roster (roster.js) can answer "can you control my music?" honestly. Opening
// apps and pages, and the Mac's own volume, need no permission at all.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile, mkdir, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webAddress, webTarget } from '../../src/macTargets.js';

const OPEN = '/usr/bin/open';
const OSA = '/usr/bin/osascript';
const MUSIC = 'Music';
// his storefront — the catalogue links must open in the Australian store
const STOREFRONT = 'au';

function execP(file, args, { timeout = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 1_000_000 }, (err, stdout, stderr) => {
      if (err) { err.stdout = String(stdout || ''); err.stderr = String(stderr || ''); reject(err); return; }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

// Tests swap all three so no session ever opens, plays or asks for anything
// on his real Mac (the hands.js rule).
let runner = execP;
let fetcher = (...a) => fetch(...a);
let appDirsOverride = null;
let appsCache = null;
let playlistsCache = null;
export function _setRunnerForTests(fn) { runner = fn || execP; appsCache = null; playlistsCache = null; }
export function _setFetchForTests(fn) { fetcher = fn || ((...a) => fetch(...a)); }
export function _setAppDirsForTests(dirs) { appDirsOverride = dirs || null; appsCache = null; }

export function macAvailable() {
  return process.platform === 'darwin' && existsSync(OSA);
}
function mustBeMac() {
  if (runner === execP && !macAvailable()) throw new Error('that only works on the Mac Nova runs on');
}

// ------------------------------------------------------------ the state file

const dataDir = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const STATE = () => path.join(dataDir(), 'mac-hand.json');

export function readMacState() {
  try { return existsSync(STATE()) ? JSON.parse(readFileSync(STATE(), 'utf8')) : {}; } catch { return {}; }
}
let stateQueue = Promise.resolve();
function noteAutomation(app, ok, why = null) {
  stateQueue = stateQueue.then(async () => {
    const s = readMacState();
    const prev = s.automation?.[app];
    // a success after a success is not news — don't churn the file per song
    if (ok && prev?.ok && Date.now() - Date.parse(prev.at || 0) < 6 * 3600_000) return;
    s.automation = { ...(s.automation || {}), [app]: { ok, at: new Date().toISOString(), ...(why ? { why } : {}) } };
    await mkdir(dataDir(), { recursive: true });
    const tmp = STATE() + '.tmp';
    await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
    await rename(tmp, STATE());
  }).catch(() => {});
  return stateQueue;
}
export function _flushStateForTests() { return stateQueue; }

// ------------------------------------------------------------- AppleScript

// Fixed source, his words as argv. `--` is load-bearing: without it an
// argument beginning with a dash is read as an osascript OPTION (measured:
// "illegal option -- x").
export function osaArgs(lines, args = []) {
  const argv = [];
  for (const l of ['on run argv', ...lines, 'end run']) argv.push('-e', l);
  argv.push('--', ...args.map((a) => String(a)));
  return argv;
}

// What went wrong, in his words, with the fix. `tcc` marks the two
// permission states the roster remembers.
export function macError(e, app = 'that app') {
  const text = `${e?.stderr || ''} ${e?.message || ''}`;
  if (/-1743\b/.test(text) || /not authori[sz]ed to send apple events/i.test(text)) {
    const err = new Error(`your Mac hasn't let Nova control ${app} — in System Settings → Privacy & Security → Automation, turn on ${app} under "node"`);
    err.tcc = 'denied';
    return err;
  }
  if (e?.killed || /-1712\b|timed? ?out/i.test(text)) {
    const err = new Error(`${app} didn't answer — if your Mac is showing "node wants access to control ${app}", click OK and ask again`);
    err.tcc = 'asking';
    return err;
  }
  const first = String(e?.stderr || e?.message || '').trim().split('\n')[0]
    .replace(/^\d+:\d+:\s*execution error:\s*/i, '').replace(/\s*\(-?\d+\)\s*$/, '').slice(0, 160);
  return new Error(`${app} said no: ${first || 'no reason given'}`);
}

async function osa(app, lines, args = [], { timeout = 12_000 } = {}) {
  mustBeMac();
  try {
    const { stdout } = await runner(OSA, osaArgs(lines, args), { timeout });
    const out = String(stdout).trim();
    // NOT_RUNNING means no Apple event reached the app — it proves nothing
    // about permission either way
    if (app && out !== 'NOT_RUNNING') noteAutomation(app, true);
    return out;
  } catch (e) {
    const err = macError(e, app || 'your Mac');
    if (app && err.tcc) noteAutomation(app, false, err.tcc);
    throw err;
  }
}

// ------------------------------------------------------------------- apps

const APP_DIRS = () => ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', path.join(os.homedir(), 'Applications')];

export function listApps() {
  if (appsCache && Date.now() - appsCache.at < 5 * 60_000) return appsCache.apps;
  const found = new Map();
  const add = (dir, entry) => {
    const name = entry.slice(0, -4);
    if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(), { name, path: path.join(dir, entry) });
  };
  for (const dir of appDirsOverride || APP_DIRS()) {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.endsWith('.app')) { add(dir, e.name); continue; }
      // one level into a vendor folder ("Adobe Media Encoder 2025/…app")
      if (e.isDirectory() && !e.name.startsWith('.')) {
        try { for (const f of readdirSync(path.join(dir, e.name))) if (f.endsWith('.app')) add(path.join(dir, e.name), f); } catch { /* unreadable */ }
      }
    }
  }
  appsCache = { at: Date.now(), apps: [...found.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  return appsCache.apps;
}

// Spoken names that are not the app's own. "Apple Music" must be Music, not
// the "Sidify Apple Music Converter" that happens to contain both words.
const APP_ALIASES = {
  'apple music': 'Music', itunes: 'Music', chrome: 'Google Chrome',
  'apple notes': 'Notes', 'apple calendar': 'Calendar', 'apple reminders': 'Reminders',
  'system preferences': 'System Settings',
};

async function findApp(text) {
  const { matchName } = await import('./verbs.js');
  const clean = String(text || '').trim().replace(/^(?:my|the)\s+/i, '').replace(/\s+(?:app|application)$/i, '').trim();
  if (!clean) return {};
  const apps = listApps();
  const alias = APP_ALIASES[clean.toLowerCase()];
  if (alias) { const a = apps.find((x) => x.name === alias); if (a) return { hit: a }; }
  const m = matchName(apps, clean);
  // 2+ means every word he said is in the name; a looser fit is not an app
  // he asked for
  if (m.hit && m.score >= 2) return { hit: m.hit };
  if (m.ambiguous) return { ambiguous: m.why };
  return {};
}

// What "open X" names: a web address, an app on this Mac, or a site Nova
// knows. `where: 'browser'` (he said "in my browser") skips the apps.
export async function resolveTarget(raw, { where = null } = {}) {
  const said = String(raw || '').trim();
  if (!said) throw new Error('open what?');
  const addr = webAddress(said);
  if (addr) return addr;
  if (where !== 'browser') {
    const app = await findApp(said);
    if (app.hit) return { kind: 'app', name: app.hit.name, path: app.hit.path, label: app.hit.name };
    if (app.ambiguous) throw new Error(app.ambiguous);
  }
  const web = webTarget(said);
  if (web) return web;
  throw new Error(where === 'browser'
    ? `I don't know a site called "${said}" — say its address`
    : `there's no app called "${said}" on your Mac, and no site I know by that name`);
}

export async function openTarget(t) {
  mustBeMac();
  try {
    if (t?.kind === 'url') {
      const ok = webAddress(t.url);
      if (!ok) throw new Error('refusing to open anything but a web address');
      await runner(OPEN, [ok.url], { timeout: 10_000 });
      return { label: t.label || ok.label };
    }
    if (t?.kind === 'app') {
      if (!t.path || !/\.app$/.test(t.path) || !path.isAbsolute(t.path)) throw new Error('that is not an app on this Mac');
      await runner(OPEN, ['-a', t.path], { timeout: 15_000 });
      return { label: t.label || t.name };
    }
  } catch (e) {
    if (/^refusing|^that is not/.test(e.message)) throw e;
    const first = String(e.stderr || e.message || '').trim().split('\n')[0].slice(0, 160);
    throw new Error(`I couldn't open ${t.label || 'that'}: ${first || 'no reason given'}`);
  }
  throw new Error('nothing to open');
}

// ------------------------------------------------------------------ Music

const IF_RUNNING = 'if application "Music" is not running then return "NOT_RUNNING"';

export async function musicNow() {
  const out = await osa(MUSIC, [
    IF_RUNNING,
    'tell application "Music"',
    '  set s to (player state as text)',
    '  if s is "stopped" then return "stopped"',
    '  set t to current track',
    '  return s & tab & (name of t) & tab & (artist of t) & tab & (album of t)',
    'end tell',
  ], [], { timeout: 6_000 });
  if (out === 'NOT_RUNNING') return { running: false, state: 'closed' };
  const [state, name = '', artist = '', album = ''] = out.split('\t');
  return { running: true, state, name, artist, album };
}

// The commands are fixed words from this table, never his.
const CONTROL = { play: 'play', pause: 'pause', next: 'next track', previous: 'previous track' };

export async function musicControl(action) {
  const cmd = CONTROL[action];
  if (!cmd) throw new Error(`I can't "${action}" the music`);
  // play may start Music; the rest must never launch it just to stop it
  const guard = action === 'play' ? [] : [IF_RUNNING];
  const out = await osa(MUSIC, [...guard, `tell application "Music" to ${cmd}`, 'return "OK"']);
  if (out === 'NOT_RUNNING') throw new Error("Music isn't open on your Mac");
  return musicNow().catch(() => ({ running: true, state: action === 'pause' ? 'paused' : 'playing' }));
}

async function playlists() {
  if (playlistsCache && Date.now() - playlistsCache.at < 5 * 60_000) return playlistsCache.names;
  const out = await osa(MUSIC, [
    'tell application "Music"',
    "  set AppleScript's text item delimiters to linefeed",
    '  return (name of every user playlist) as text',
    'end tell',
  ]);
  const names = out.split('\n').map((s) => s.trim()).filter(Boolean);
  playlistsCache = { at: Date.now(), names };
  return names;
}

// Apple's public catalogue search: no key, no account. A song that is not in
// his library can still be put in front of him — opened in Music, where one
// press plays it. Nova does not pretend it pressed play.
async function catalogSong(query) {
  const u = `https://itunes.apple.com/search?${new URLSearchParams({ term: query, entity: 'song', limit: '1', country: STOREFRONT })}`;
  let d = null;
  try {
    const res = await fetcher(u, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    d = await res.json();
  } catch { return null; }
  const r = d?.results?.[0];
  if (!r?.trackViewUrl) return null;
  let link;
  try {
    const x = new URL(r.trackViewUrl);
    if (x.hostname !== 'music.apple.com') return null;
    x.searchParams.delete('uo');
    link = `music://${x.host}${x.pathname}${x.search}`;
  } catch { return null; }
  return { name: r.trackName || query, artist: r.artistName || '', url: link };
}

// "play X": his playlists first (a name he made is the surest thing he can
// mean), then his library, then the catalogue. `kind` narrows it when he
// said "playlist" / "song" / "album" / "artist".
export async function musicPlay(query, { kind = null } = {}) {
  const q = String(query || '').trim();
  if (!q) return musicControl('play');
  const { matchName } = await import('./verbs.js');
  if (!kind || kind === 'playlist') {
    const names = await playlists();
    const m = matchName(names.map((n) => ({ name: n })), q);
    if (m.hit && (m.score >= 2 || kind === 'playlist')) {
      await osa(MUSIC, ['set p to item 1 of argv', 'tell application "Music" to play (user playlist p)', 'return "OK"'], [m.hit.name]);
      return { how: 'playlist', name: m.hit.name };
    }
    if (m.ambiguous && kind === 'playlist') throw new Error(m.why);
    if (kind === 'playlist') throw new Error(`there's no playlist called "${q}" in your Music library`);
  }
  // "back in black by ac/dc" — "by" is a word no field contains
  const words = q.replace(/\s+by\s+/i, ' ');
  const out = await osa(MUSIC, [
    'set q to item 1 of argv',
    'tell application "Music"',
    '  set hits to (search library playlist 1 for q)',
    '  if (count of hits) is 0 then return "NONE"',
    '  set t to item 1 of hits',
    '  play t',
    '  return (name of t) & tab & (artist of t)',
    'end tell',
  ], [words]);
  if (out && out !== 'NONE') {
    const [name, artist = ''] = out.split('\t');
    return { how: 'library', name, artist };
  }
  const song = await catalogSong(words);
  if (!song) throw new Error(`I couldn't find "${q}" in your library or on Apple Music`);
  mustBeMac();
  await runner(OPEN, [song.url], { timeout: 10_000 });
  return { how: 'catalog', name: song.name, artist: song.artist };
}

// ----------------------------------------------------------------- volume

// The Mac's own volume is Standard Additions: no Apple event to another app,
// so no permission prompt (measured). The Music app's own volume is an event
// to Music, and is guarded like the rest of Music.
export async function getVolume(target = 'mac') {
  if (target === 'music') {
    const out = await osa(MUSIC, [IF_RUNNING, 'tell application "Music" to return (sound volume as text)']);
    if (out === 'NOT_RUNNING') throw new Error("Music isn't open on your Mac");
    return { level: Number(out), muted: false };
  }
  const out = await osa(null, ['set v to get volume settings', 'return ((output volume of v) as text) & tab & ((output muted of v) as text)']);
  const [level, muted] = out.split('\t');
  return { level: Number(level), muted: muted === 'true' };
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
const STEP = 15;

export async function setVolume({ target = 'mac', level = null, change = null, by = null } = {}) {
  const before = await getVolume(target);
  let after = before.level;
  let muted = before.muted;
  if (level != null && String(level).trim() !== '' && Number.isFinite(Number(level))) after = clamp(level);
  else if (change === 'up' || change === 'down') {
    const step = Number.isFinite(Number(by)) && Number(by) > 0 ? Math.min(100, Number(by)) : STEP;
    after = clamp(before.level + (change === 'up' ? step : -step));
  }
  else if (change === 'mute' || change === 'unmute') {
    if (target !== 'mac') throw new Error('I can only mute the whole Mac');
    muted = change === 'mute';
  } else throw new Error('what level? Say a number, or up, or down');

  if (target === 'music') {
    await osa(MUSIC, ['tell application "Music" to set sound volume to ((item 1 of argv) as integer)', 'return "OK"'], [after]);
  } else if (change === 'mute' || change === 'unmute') {
    await osa(null, [muted ? 'set volume with output muted' : 'set volume without output muted', 'return "OK"']);
  } else {
    // turning it up means he wants to hear it — a muted Mac unmutes
    await osa(null, ['set volume output volume ((item 1 of argv) as integer)', 'set volume without output muted', 'return "OK"'], [after]);
    muted = false;
  }
  return { target, before: before.level, after, wasMuted: before.muted, muted };
}

// The undo: exactly the level (and mute) it was before.
export async function restoreVolume({ target = 'mac', level, muted = false } = {}) {
  if (!Number.isFinite(Number(level))) throw new Error('there is no earlier level to go back to');
  if (target === 'music') {
    await osa(MUSIC, [IF_RUNNING, 'tell application "Music" to set sound volume to ((item 1 of argv) as integer)', 'return "OK"'], [clamp(level)]);
    return;
  }
  await osa(null, ['set volume output volume ((item 1 of argv) as integer)', muted ? 'set volume with output muted' : 'set volume without output muted', 'return "OK"'], [clamp(level)]);
}
