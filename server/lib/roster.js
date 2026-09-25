// WHAT NOVA IS CONNECTED TO — answered from evidence, never from a list.
//
// The Clicky reel's third move (his note, 22 Sep 2026): "Do you have my
// Google Ads integration connected?" and a straight answer. Until now Nova's
// only answer was a sentence hard-written into the model's context
// (ops.js fleetRosterContext: "Hands: … ElevenLabs voice") — and on 25 Sep
// that sentence was false: there is no ElevenLabs key; Nova speaks with the
// local engine on this Mac. A claim about a connection has to be CHECKED
// each time it is made.
//
// Three states, never collapsed into one:
//   working — seen working recently (a sync time, a push, a fetch, a use)
//   set-up  — the keys are there, but nothing recent proves it works (his
//             "configured is not ready" lesson — nova-voice-turn)
//   off     — not connected, and what is missing
// Anything he names that is not on this list is NOT connected, said plainly;
// if his Mac has an app by that name, Nova says it can open it, and no more.
// No secret is ever read out — only whether one is present.

import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const readJson = (p) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };

export const defaultRosterDeps = {
  env: () => process.env,
  now: () => Date.now(),
  exists: (p) => existsSync(p),
  calendarWarm: async () => {
    const { peekCachedEventsForDay } = await import('./calendar.js');
    return (await peekCachedEventsForDay(new Date())) !== null;
  },
  healthPushes: () => readJson(path.join(dataDir(), 'health', 'pushlog.json'))?.attempts || [],
  todoistSync: () => readJson(path.join(dataDir(), 'todoist-sync.json')),
  reminders: () => readJson(path.join(dataDir(), 'reminders.json'))?.items || [],
  shortcuts: async () => (await import('./hands.js')).knownShortcuts(),
  apps: async () => (await import('./macHand.js')).listApps(),
  macState: async () => (await import('./macHand.js')).readMacState(),
  macAvailable: async () => (await import('./macHand.js')).macAvailable(),
  // names only — the values never leave the file
  whisperKeys: () => {
    const p = process.env.NOVA_WHISPER_ENV || path.join(os.homedir(), '.config', 'watch', '.env');
    try { return readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && /=\S/.test(l)).map((l) => l.split('=')[0].trim()); } catch { return []; }
  },
  latestTransaction: async () => {
    const { listTransactions } = await import('./money.js');
    return (await listTransactions({ sinceMonths: 3 }))[0]?.date || null;
  },
  claudeBin: () => process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude'),
  browserProfile: () => path.join(os.homedir(), '.nova-browser'),
};

const HOUR = 3600_000;
function when(iso, now) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const yday = new Date(now - 24 * HOUR).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
  if (sameDay) return `today at ${time}`;
  if (yday) return `yesterday at ${time}`;
  return `on ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`;
}

// Each entry: what he might call it, and how to tell its state from the
// evidence it leaves. Order is the order a full answer reads.
export const ROSTER = [
  {
    id: 'vault', label: 'your Obsidian vault', names: ['obsidian', 'vault', 'obsidian vault', 'my vault', 'notes'],
    configured: (env) => !!env.VAULT_PATH,
    async check(d) {
      const p = d.env().VAULT_PATH;
      if (!p) return { state: 'off', detail: 'no vault path is set' };
      return d.exists(p) ? { state: 'working', detail: 'Nova reads and writes it directly' } : { state: 'off', detail: 'the vault folder is missing' };
    },
  },
  {
    id: 'calendar', label: 'Apple Calendar', names: ['calendar', 'apple calendar', 'icloud calendar', 'ical', 'calendars'],
    configured: (env) => !!(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD),
    async check(d) {
      const env = d.env();
      if (!(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD)) return { state: 'off', detail: 'no iCloud app password is set' };
      const warm = await d.calendarWarm().catch(() => false);
      return warm ? { state: 'working', detail: "through iCloud — today's calendar was read in the last few minutes" }
        : { state: 'set-up', detail: "the iCloud keys are there, but I haven't read the calendar in the last few minutes" };
    },
  },
  {
    id: 'reminders', label: 'Apple Reminders', names: ['reminders', 'apple reminders', 'reminders app'],
    configured: (env) => !!(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD),
    async check(d) {
      const env = d.env();
      if (!(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD)) return { state: 'off', detail: 'no iCloud app password is set, so reminders stay inside Nova' };
      const items = d.reminders();
      const last = [...items].reverse().find((r) => r.apple || r.appleError);
      if (!last) return { state: 'set-up', detail: "the iCloud keys are there, but Nova hasn't written a reminder yet" };
      if (last.appleError) return { state: 'partial', detail: `the last reminder didn't reach iCloud (${String(last.appleError).slice(0, 80)}), so it only fired inside Nova` };
      return { state: 'set-up', detail: `through iCloud — the last reminder reached it ${when(last.createdAt, d.now()) || 'fine'}` };
    },
  },
  {
    id: 'health', label: 'Apple Health', names: ['health', 'apple health', 'health app', 'apple watch', 'my watch', 'watch'],
    configured: () => true,
    async check(d) {
      const ok = [...d.healthPushes()].reverse().find((a) => a.ok);
      if (!ok) return { state: 'off', detail: 'no push from your iPhone has ever landed' };
      const age = d.now() - Date.parse(ok.at);
      const said = when(ok.at, d.now());
      return age < 36 * HOUR ? { state: 'working', detail: `your iPhone's Shortcut pushed ${said}` }
        : { state: 'set-up', detail: `the last push from your iPhone was ${said}, so the numbers are stale` };
    },
  },
  {
    id: 'todoist', label: 'Todoist', names: ['todoist'],
    configured: (env) => !!env.TODOIST_TOKEN,
    async check(d) {
      if (!d.env().TODOIST_TOKEN) return { state: 'off', detail: 'no Todoist token is set' };
      const s = d.todoistSync();
      const at = s?.lastSyncAt;
      if (!at) return { state: 'set-up', detail: "the token is there, but it hasn't synced yet" };
      const failed = s?.lastResult && (s.lastResult.ok === false || s.lastResult.error);
      if (failed) return { state: 'partial', detail: `the last sync ${when(at, d.now())} failed` };
      return d.now() - Date.parse(at) < 24 * HOUR ? { state: 'working', detail: `last synced ${when(at, d.now())}` }
        : { state: 'set-up', detail: `the last sync was ${when(at, d.now())}` };
    },
  },
  {
    id: 'telegram', label: 'Telegram', names: ['telegram', 'telegram bot'],
    configured: (env) => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    async check(d) {
      const env = d.env();
      if (!env.TELEGRAM_BOT_TOKEN) return { state: 'off', detail: 'no bot token is set' };
      if (!env.TELEGRAM_CHAT_ID) return { state: 'partial', detail: 'the bot token is set but not your chat, so it can hear but not reply' };
      return { state: 'set-up', detail: 'the bot and your chat are set; I keep no record of the last message, so I can’t prove delivery' };
    },
  },
  {
    id: 'shortcuts', label: 'your Shortcuts', names: ['shortcuts', 'siri shortcuts', 'shortcuts app'],
    configured: () => true,
    async check(d) {
      const names = await d.shortcuts().catch(() => []);
      return names.length ? { state: 'working', detail: `${names.length} of them, and Nova can run any by name — asking you first` }
        : { state: 'set-up', detail: "I haven't read the list of them since the server started" };
    },
  },
  {
    id: 'mac', label: 'your Mac', names: ['mac', 'macbook', 'computer', 'laptop', 'apps', 'mac apps', 'my apps'],
    configured: () => true,
    async check(d) {
      if (!(await d.macAvailable().catch(() => false))) return { state: 'off', detail: 'Nova is not running on a Mac' };
      const apps = await d.apps().catch(() => []);
      return { state: 'working', detail: `Nova can open any of its ${apps.length} apps or a web page, and set its volume` };
    },
  },
  {
    id: 'music', label: 'the Music app', names: ['music', 'apple music', 'itunes', 'music app', 'my music'],
    configured: () => true,
    async check(d) {
      const a = (await d.macState().catch(() => ({})))?.automation?.Music;
      if (!a) return { state: 'set-up', detail: 'Nova can play, pause and skip in it — the first time, your Mac will ask whether "node" may control Music, and you click OK' };
      if (a.ok) return { state: 'working', detail: `your Mac lets Nova control it (last used ${when(a.at, d.now())})` };
      return a.why === 'asking'
        ? { state: 'partial', detail: 'last time, your Mac was still asking whether Nova may control Music — click OK on that box' }
        : { state: 'off', detail: 'your Mac refused Nova control of Music — turn it on in System Settings → Privacy & Security → Automation, under "node"' };
    },
  },
  {
    id: 'spotify', label: 'Spotify', names: ['spotify'],
    configured: () => false,
    async check(d) {
      const apps = await d.apps().catch(() => []);
      return apps.some((a) => /^spotify$/i.test(a.name))
        ? { state: 'partial', detail: 'it is installed and Nova can open it, but only the Music app is wired for play and pause' }
        : { state: 'off', detail: "it isn't installed on your Mac — Nova plays through the Music app" };
    },
  },
  {
    // no account link — but "no" alone would hide the Watcher and the play lane
    id: 'youtube', label: 'YouTube', names: ['youtube', 'youtube account'],
    configured: () => false,
    async check() {
      return { state: 'partial', detail: "there's no account link, but Nova can find, open and read any public video — the Watcher pulls the transcript" };
    },
  },
  {
    id: 'voice', label: "Nova's voice", names: ['voice', 'text to speech', 'tts', 'speech'],
    configured: (env) => env.NOVA_TTS_LOCAL === '1' || !!env.ELEVENLABS_API_KEY,
    async check(d) {
      const env = d.env();
      if (env.ELEVENLABS_API_KEY) return { state: 'set-up', detail: 'ElevenLabs, with the key set' };
      if (env.NOVA_TTS_LOCAL === '1') return { state: 'set-up', detail: "the local voice engine on your Mac — nothing leaves the house" };
      return { state: 'off', detail: 'no voice engine is set, so Nova falls back to the browser’s own voice' };
    },
  },
  {
    id: 'elevenlabs', label: 'ElevenLabs', names: ['elevenlabs', 'eleven labs'],
    configured: (env) => !!env.ELEVENLABS_API_KEY,
    async check(d) {
      return d.env().ELEVENLABS_API_KEY ? { state: 'set-up', detail: 'the key is set' }
        : { state: 'off', detail: 'there is no ElevenLabs key — Nova speaks with the local engine on your Mac' };
    },
  },
  {
    id: 'ears', label: 'speech-to-text', names: ['groq', 'whisper', 'transcription', 'speech to text', 'dictation', 'openai'],
    configured: () => true,
    async check(d) {
      const keys = d.whisperKeys();
      if (keys.includes('GROQ_API_KEY')) return { state: 'set-up', detail: 'Groq’s Whisper, with the key set — your iPhone records, the Mac sends it off to be heard' };
      if (keys.includes('OPENAI_API_KEY')) return { state: 'set-up', detail: 'OpenAI’s Whisper, with the key set' };
      return { state: 'off', detail: 'no Groq or OpenAI key is set, so spoken turns can’t be transcribed on the Mac' };
    },
  },
  {
    id: 'browser', label: "Nova's own browser", names: ['browser', 'nova browser', 'web browser', 'chrome profile'],
    configured: () => true,
    async check(d) {
      return d.exists(d.browserProfile()) ? { state: 'set-up', detail: 'its own Chrome profile, separate from yours; it reads and fills pages and stops before anything that commits' }
        : { state: 'off', detail: 'its Chrome profile has never been created' };
    },
  },
  {
    id: 'bank', label: 'your bank', names: ['bank', 'banking', 'bank account', 'transactions', 'up bank', 'commbank', 'money'],
    configured: () => false,
    async check(d) {
      const last = await d.latestTransaction().catch(() => null);
      return last ? { state: 'partial', detail: `not live — Nova reads the statements you import; the newest transaction is from ${when(`${last}T12:00:00`, d.now())}` }
        : { state: 'off', detail: 'not live, and no statement has been imported in the last three months' };
    },
  },
  {
    id: 'claude', label: 'Claude', names: ['claude', 'anthropic', 'claude code'],
    configured: () => true,
    async check(d) {
      return d.exists(d.claudeBin()) ? { state: 'working', detail: 'the reasoning core every agent runs on' }
        : { state: 'off', detail: 'the Claude CLI is missing from this Mac' };
    },
  },
];

// The hands, by name, for the model's self-description — only what is at
// least configured, so the context can never again name a voice with no key.
export function configuredLabels(env = process.env) {
  return ROSTER.filter((r) => r.configured(env) && r.id !== 'claude').map((r) => r.label);
}

const fold = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/\b(?:my|the|your|a|an)\b/g, ' ').replace(/\b(?:integration|integrations|connection|account|api|app|apps)\b$/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function findEntry(asked) {
  const want = fold(asked);
  if (!want) return null;
  return ROSTER.find((r) => r.names.some((n) => fold(n) === want) || fold(r.label) === want) || null;
}

// A named thing that is not ours but shares a word with something that is —
// "google calendar" → Apple Calendar — so the no can say what Nova does have.
function relatedEntry(asked) {
  const words = new Set(fold(asked).split(' '));
  return ROSTER.find((r) => r.names.some((n) => fold(n).split(' ').length === 1 && words.has(fold(n)))) || null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function checkAll(deps = defaultRosterDeps) {
  const out = [];
  for (const r of ROSTER) {
    let res;
    try { res = await r.check(deps); } catch (e) { res = { state: 'set-up', detail: `I couldn't check it just now (${e.message})` }; }
    out.push({ id: r.id, label: r.label, ...res });
  }
  return out;
}

// The spoken answer. `asked` is the thing he named, or null for "what are
// you connected to?".
export async function rosterAnswer(asked, deps = defaultRosterDeps, { onlyKnown = false } = {}) {
  deps = deps || defaultRosterDeps;
  if (asked) {
    const entry = findEntry(asked);
    if (!entry && onlyKnown) return null;
    if (entry) {
      let r;
      try { r = await entry.check(deps); } catch (e) { r = { state: 'set-up', detail: `I couldn't check it just now (${e.message})` }; }
      if (r.state === 'working') return `Yes, sir — ${entry.label} is connected: ${r.detail}.`;
      if (r.state === 'set-up') return `${cap(entry.label)} is set up, sir — ${r.detail}.`;
      if (r.state === 'partial') return `Partly, sir — ${r.detail}.`;
      return `No, sir — ${entry.label} isn't connected: ${r.detail}.`;
    }
    // not one of Nova's — the honest no, what the Mac can do with it, and
    // the nearest thing Nova does have
    const name = String(asked).trim().replace(/[?.!]+$/, '');
    const apps = await deps.apps().catch(() => []);
    const { matchName } = await import('./verbs.js');
    const app = matchName(apps, name);
    const parts = [`No, sir — Nova has no ${name} connection.`];
    if (app.hit && app.score >= 2.5) parts.push(`${app.hit.name} is on your Mac, so I can open it, but I can't see inside it.`);
    const rel = relatedEntry(asked);
    if (rel) {
      const r = await rel.check(deps).catch(() => null);
      if (r && r.state !== 'off') parts.push(`What I do have is ${rel.label}: ${r.detail}.`);
    }
    if (!rel) {
      const working = (await checkAll(deps)).filter((x) => x.state === 'working').map((x) => x.label);
      if (working.length) parts.push(`What's connected and working right now: ${listing(working)}.`);
    }
    return parts.join(' ');
  }
  const all = await checkAll(deps);
  const by = (s) => all.filter((x) => x.state === s).map((x) => x.label);
  const parts = [];
  if (by('working').length) parts.push(`Working right now: ${listing(by('working'))}.`);
  if (by('set-up').length) parts.push(`Set up, but nothing today proves it: ${listing(by('set-up'))}.`);
  if (by('partial').length) parts.push(`Partly: ${listing(by('partial'))}.`);
  if (by('off').length) parts.push(`Not connected: ${listing(by('off'))}.`);
  return parts.join(' ') || 'I could not check any of it just now, sir.';
}

function listing(labels) {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
