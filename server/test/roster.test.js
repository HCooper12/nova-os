// WHAT NOVA IS CONNECTED TO (lib/roster.js): every claim checked from
// evidence, three honest states, a plain no for anything not on the list —
// and never a secret read out.
import test from 'node:test';
import assert from 'node:assert/strict';

const { rosterAnswer, checkAll, configuredLabels, findEntry } = await import('../lib/roster.js');

const NOW = Date.parse('2026-09-25T10:00:00Z');
const SECRET = 'sk-THIS-MUST-NEVER-BE-SPOKEN';

function deps(over = {}) {
  const env = {
    VAULT_PATH: '/vault', ICLOUD_USERNAME: 'him', ICLOUD_APP_PASSWORD: SECRET,
    TODOIST_TOKEN: SECRET, TELEGRAM_BOT_TOKEN: SECRET, TELEGRAM_CHAT_ID: '1', NOVA_TTS_LOCAL: '1',
    ...(over.env || {}),
  };
  return {
    env: () => env,
    now: () => NOW,
    exists: (p) => p === '/vault' || p === '/claude' || p === '/browser',
    calendarWarm: async () => true,
    healthPushes: () => [{ at: '2026-09-24T20:05:00Z', ok: true }],
    todoistSync: () => ({ lastSyncAt: '2026-09-25T09:42:00Z', lastResult: { ok: true } }),
    reminders: () => [{ createdAt: '2026-09-03T22:38:58Z', apple: { url: 'x' } }],
    shortcuts: async () => ['Goodnight', 'Health push'],
    apps: async () => [{ name: 'Music' }, { name: 'WhatsApp' }, { name: 'Reminders' }],
    macState: async () => ({}),
    macAvailable: async () => true,
    whisperKeys: () => ['GROQ_API_KEY'],
    latestTransaction: async () => '2026-09-20',
    claudeBin: () => '/claude',
    browserProfile: () => '/browser',
    ...over,
  };
}

test('a connection with recent proof is a yes, with the proof', async () => {
  assert.match(await rosterAnswer('todoist', deps()), /^Yes, sir — Todoist is connected: last synced today at/);
  assert.match(await rosterAnswer('my calendar', deps()), /^Yes, sir — Apple Calendar is connected: through iCloud/);
  assert.match(await rosterAnswer('apple health', deps()), /^Yes, sir — Apple Health is connected: your iPhone's Shortcut pushed/);
});

test('keys without proof are "set up", never "working" — his configured-is-not-ready lesson', async () => {
  const cold = deps({ calendarWarm: async () => false });
  assert.match(await rosterAnswer('calendar', cold), /^Apple Calendar is set up, sir — the iCloud keys are there, but I haven't read/);
  assert.match(await rosterAnswer('telegram', deps()), /can’t prove delivery/);
  const stale = deps({ healthPushes: () => [{ at: '2026-09-20T20:05:00Z', ok: true }] });
  assert.match(await rosterAnswer('health', stale), /set up, sir — the last push from your iPhone was on 2[01] September, so the numbers are stale/);
});

test('the voice is the local engine — ElevenLabs is a no (the sentence that was wrong on 25 Sep)', async () => {
  assert.match(await rosterAnswer('elevenlabs', deps()), /^No, sir — ElevenLabs isn't connected: there is no ElevenLabs key — Nova speaks with the local engine/);
  assert.ok(!configuredLabels(deps().env()).includes('ElevenLabs'));
  assert.ok(configuredLabels(deps().env()).includes("Nova's voice"));
  assert.ok(configuredLabels({ ...deps().env(), ELEVENLABS_API_KEY: 'k' }).includes('ElevenLabs'));
});

test('anything not on the roster is a plain no, with what the Mac can do and what IS working', async () => {
  const ads = await rosterAnswer('google ads integration', deps());
  assert.match(ads, /^No, sir — Nova has no google ads integration connection\./);
  assert.match(ads, /What's connected and working right now: your Obsidian vault, Apple Calendar, Apple Health, Todoist/);
  // an app on the Mac is something Nova can open, and no more
  assert.match(await rosterAnswer('whatsapp', deps()), /WhatsApp is on your Mac, so I can open it, but I can't see inside it\./);
  // a near name points at the real one
  assert.match(await rosterAnswer('google calendar', deps()), /No, sir — Nova has no google calendar connection\. What I do have is Apple Calendar: through iCloud/);
  assert.match(await rosterAnswer('spotify', deps()), /No, sir — Spotify isn't connected: it isn't installed on your Mac — Nova plays through the Music app/);
});

test('the Music app says whether his Mac let Nova drive it', async () => {
  assert.match(await rosterAnswer('music', deps()), /the first time, your Mac will ask whether "node" may control Music/);
  const ok = deps({ macState: async () => ({ automation: { Music: { ok: true, at: '2026-09-25T09:00:00Z' } } }) });
  assert.match(await rosterAnswer('apple music', ok), /^Yes, sir — the Music app is connected: your Mac lets Nova control it/);
  const no = deps({ macState: async () => ({ automation: { Music: { ok: false, why: 'denied', at: '2026-09-25T09:00:00Z' } } }) });
  assert.match(await rosterAnswer('music', no), /^No, sir — the Music app isn't connected: your Mac refused Nova control of Music — turn it on in System Settings/);
});

test('the full answer groups by state, and no key value ever appears', async () => {
  const all = await rosterAnswer(null, deps());
  assert.match(all, /^Working right now: /);
  assert.match(all, /Set up, but nothing today proves it: /);
  assert.match(all, /Not connected: [^.]*ElevenLabs/);
  assert.ok(!all.includes(SECRET));
  for (const r of await checkAll(deps())) assert.ok(!JSON.stringify(r).includes(SECRET), r.id);
});

test('"can you control X" only answers for names on the roster', async () => {
  assert.equal(await rosterAnswer('bench press trend', deps(), { onlyKnown: true }), null);
  assert.match(await rosterAnswer('music', deps(), { onlyKnown: true }), /Music app/);
  assert.equal(findEntry('my todoist integration')?.id, 'todoist');
});
