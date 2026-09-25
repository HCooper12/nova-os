// THE MAC BY VOICE ("Clicky", 25 Sep 2026): the three Mac verbs on the
// rails, a grammar that only claims them when he is AT the Mac (or says
// "on my Mac"), the neighbours it must never steal from, "…then open my
// Reminders so I can confirm", and the two reflexes — what Nova is
// connected to, and what's playing. No real app is opened, no real
// Shortcut listed, and no reminder reaches his iCloud from here.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-macverbs-'));
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-macverbs-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';
// a reminder made here must stay local — never a VTODO in his iCloud
delete process.env.ICLOUD_USERNAME;
delete process.env.ICLOUD_APP_PASSWORD;

import test from 'node:test';
import assert from 'node:assert/strict';

// the Shortcuts hand is loaded by verbs.js on import: give it a fake first,
// so no session ever runs `shortcuts list` on his Mac from a test
const hands = await import('../lib/hands.js');
hands._setRunnerForTests(async () => ({ stdout: '', stderr: '' }));

const mac = await import('../lib/macHand.js');
const apps = await mkdtemp(path.join(tmpdir(), 'nova-macverbs-apps-'));
for (const a of ['Reminders.app', 'Music.app', 'Obsidian.app', 'Calendar.app']) await mkdir(path.join(apps, a), { recursive: true });
mac._setAppDirsForTests([apps]);

const calls = [];
let volume = { level: 56, muted: false };
mac._setRunnerForTests(async (file, args) => {
  calls.push({ file, args });
  if (file === '/usr/bin/open') return { stdout: '' };
  const script = args.filter((a, i) => args[i - 1] === '-e').join('\n');
  if (/get volume settings/.test(script)) return { stdout: `${volume.level}\t${volume.muted}` };
  if (/set volume output volume/.test(script)) { volume = { level: Number(args[args.length - 1]), muted: /with output muted/.test(script) }; return { stdout: 'OK' }; }
  if (/player state/.test(script)) return { stdout: 'paused\tBack In Black\tAC/DC\tBack In Black' };
  return { stdout: 'OK' };
});

const { parseCommand, tryCommand, runVerb, describeForModel, splitThenOpen } = await import('../lib/verbs.js');
const { undoRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { listReminders } = await import('../lib/reminders.js');
const { tryReflex } = await import('../lib/reflex.js');

test.after(async () => {
  mac._setRunnerForTests(null);
  mac._setAppDirsForTests(null);
  hands._setRunnerForTests(null);
  await rm(vault, { recursive: true, force: true });
  await rm(apps, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

const AT_MAC = { fromMac: true };

test('grammar: Clicky’s sentences, claimed only at the Mac', () => {
  assert.deepEqual(parseCommand('open reminders', AT_MAC), { any: [{ verb: 'mac.open', args: { target: 'reminders' } }], fallthrough: true });
  assert.equal(parseCommand('open reminders'), null, 'from the phone, "open reminders" is not the Mac’s to claim');
  assert.deepEqual(parseCommand('open reminders on my mac'), { any: [{ verb: 'mac.open', args: { target: 'reminders' } }], fallthrough: true }, 'naming the Mac claims it from anywhere');
  assert.deepEqual(parseCommand('Open my Stripe dashboard in my browser', AT_MAC).any[0].args, { target: 'my stripe dashboard', where: 'browser' });
  assert.deepEqual(parseCommand('Open Spotify and play AC/DC, Back in Black', AT_MAC), { verb: 'mac.music', args: { action: 'play', query: 'ac/dc back in black', via: 'spotify' } });
  assert.deepEqual(parseCommand('play my gym playlist', AT_MAC), { verb: 'mac.music', args: { action: 'play', query: 'gym', kind: 'playlist' } });
  assert.deepEqual(parseCommand('pause the music', AT_MAC), { verb: 'mac.music', args: { action: 'pause' } });
  assert.deepEqual(parseCommand('next song', AT_MAC), { verb: 'mac.music', args: { action: 'next' } });
  assert.deepEqual(parseCommand('set the volume to 30', AT_MAC), { verb: 'mac.volume', args: { level: 30 } });
  assert.deepEqual(parseCommand('turn it down in music 50%', AT_MAC), { verb: 'mac.volume', args: { level: 50, target: 'music' } });
  assert.deepEqual(parseCommand('turn the music up a bit', AT_MAC), { verb: 'mac.volume', args: { change: 'up', target: 'music', by: 8 } });
  assert.deepEqual(parseCommand('mute', AT_MAC), { verb: 'mac.volume', args: { change: 'mute' } });
});

test('grammar: the neighbours it must never steal', () => {
  // the play lane's (a video), and conversation that happens to start with "play"
  assert.equal(parseCommand('play the latest diary of a ceo episode', AT_MAC), null);
  assert.equal(parseCommand("play devil's advocate", AT_MAC), null);
  // the browser hand's — a channel is something to be shown, not an app
  assert.equal(parseCommand('open the diary of a ceo channel', AT_MAC), null);
  // the shopping list's, even at the Mac
  assert.deepEqual(parseCommand('set eggs to 12', AT_MAC), { verb: 'shopping.qty', args: { item: 'eggs', qty: 12 } });
  // a bare "pause" from the phone might be his phone's music
  assert.equal(parseCommand('pause'), null);
  assert.equal(parseCommand('set the volume to 30'), null);
});

test('open: done at once, receipted, and it says where', async () => {
  const here = await tryCommand(vault, 'open reminders', AT_MAC);
  assert.equal(here.text, 'Opened Reminders.');
  assert.equal(here.acted.undoable, false, 'opening writes nothing — there is no undo Nova can do, and the receipt says so');
  const rec = await getRecord(here.acted.recordId);
  assert.deepEqual([rec.kind, rec.status, rec.destination, rec.undoData], ['act', 'filed', 'Mac — opened Reminders', null]);
  const away = await runVerb(vault, 'open reminders', { verb: 'mac.open', args: { target: 'reminders' } }, { source: 'voice' });
  assert.equal(away.acted.said, 'Opened Reminders on your Mac.');
  // a thing that is not an app or a site falls through to the model
  assert.equal(await tryCommand(vault, 'open the vibes', AT_MAC), null);
});

test('music and volume undo on the same rails as everything else', async () => {
  calls.length = 0;
  const paused = await tryCommand(vault, 'pause the music', AT_MAC);
  assert.equal(paused.text, 'Paused.');
  assert.equal(paused.acted.undoable, true);
  await undoRecord(vault, paused.acted.recordId);
  assert.ok(calls.some((c) => c.args.includes('tell application "Music" to play')), 'undoing a pause plays');

  volume = { level: 56, muted: false };
  const quiet = await tryCommand(vault, 'set the volume to 30', AT_MAC);
  assert.equal(quiet.text, 'Volume at 30%.');
  assert.equal(volume.level, 30);
  await undoRecord(vault, quiet.acted.recordId);
  assert.deepEqual(volume, { level: 56, muted: false }, 'back to exactly where it was');
});

test('"…then open my Reminders when you’re done to confirm" — the reel’s last move', async () => {
  assert.deepEqual(splitThenOpen("Set a reminder Saturday 9pm for dinner with Sharif, then open my Reminders when you're done to confirm."),
    { head: 'Set a reminder Saturday 9pm for dinner with Sharif', tail: 'Reminders' });
  calls.length = 0;
  const r = await tryCommand(vault, "Set a reminder Saturday 9pm for dinner with Sharif, then open my Reminders when you're done to confirm.", AT_MAC);
  assert.match(r.text, /^I'll remind you at Sat.* Opened Reminders\.$/);
  assert.equal(r.matched, 'reminder.set');
  const saved = (await listReminders()).pop();
  assert.equal(saved.text, 'dinner with Sharif', 'the "for" connector is not part of the reminder');
  assert.deepEqual(calls.filter((c) => c.file === '/usr/bin/open').map((c) => c.args[0]), ['-a']);
  // "then show me" with no name opens where the thing landed
  const bare = await tryCommand(vault, 'remind me to stretch at 8, then show me', AT_MAC);
  assert.match(bare.text, / Opened Reminders\.$/);
  // nothing happened, so nothing is opened
  const miss = await tryCommand(vault, 'tick off the unicorn saddle, then open reminders', AT_MAC);
  assert.ok(!miss || miss.miss || !/Opened/.test(miss.text));
});

test('the model is handed the Mac verbs from the registry, never by hand', () => {
  const cat = describeForModel();
  for (const id of ['mac.open', 'mac.music', 'mac.volume']) assert.match(cat, new RegExp(`"verb":"${id.replace('.', '\\.')}"`));
  assert.match(cat, /never guess an address/);
});

test('reflex: "do you have X connected" and "what are you connected to" go to the roster', async () => {
  const asked = [];
  const deps = { roster: async (name, opts) => { asked.push([name, opts?.onlyKnown || false]); return name === 'bench trend' ? null : `R:${name}`; }, nowPlaying: async () => ({ running: false }) };
  assert.equal((await tryReflex('Do you have my Google Ads integration connected?', deps)).text, 'R:google ads integration');
  assert.equal((await tryReflex('is my calendar connected', deps)).text, 'R:calendar');
  assert.equal((await tryReflex('what are you connected to?', deps)).text, 'R:null');
  assert.equal((await tryReflex('can you control my music', deps)).text, 'R:music');
  assert.deepEqual(asked.at(-1), ['music', true], 'only roster names answer a "can you" question');
  assert.equal(await tryReflex('can you see my bench trend', deps), null);
  assert.equal(await tryReflex('is it connected', deps), null);
});

test('reflex: what’s playing — honest when Music is closed, paused, or refused', async () => {
  const say = async (n) => (await tryReflex("what's playing", { nowPlaying: async () => { if (n instanceof Error) throw n; return n; }, roster: async () => null })).text;
  assert.equal(await say({ running: false }), "Nothing, sir — Music isn't open on your Mac.");
  assert.equal(await say({ running: true, state: 'paused', name: 'Back In Black', artist: 'AC/DC' }), 'Back In Black, by AC/DC — paused, sir.');
  assert.equal(await say({ running: true, state: 'stopped' }), 'Nothing is playing in Music, sir.');
  assert.match(await say(new Error("your Mac hasn't let Nova control Music — in System Settings")), /^Your Mac hasn't let Nova control Music/);
});
