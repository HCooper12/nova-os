// THE MAC'S OWN HAND (lib/macHand.js): fixed AppleScript with his words as
// inert arguments, targets resolved strictly, permission failures said with
// their fix — and not one real app opened, played or asked for here. Every
// call goes through an injected runner (the hands.js rule).
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-machand-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const mac = await import('../lib/macHand.js');

// a fake Applications folder, including the two traps found on his Mac:
// "Sidify Apple Music Converter" (contains both words of "apple music") and
// a vendor folder holding its app one level down
const apps = await mkdtemp(path.join(tmpdir(), 'nova-machand-apps-'));
for (const a of ['Reminders.app', 'Music.app', 'Sidify Apple Music Converter.app', 'Music Converter.app', 'Google Chrome.app', 'Notes.app', 'Notion.app', 'Claude.app', 'Claude Science.app', 'WhatsApp.app']) {
  await mkdir(path.join(apps, a), { recursive: true });
}
await mkdir(path.join(apps, 'Adobe Media Encoder 2025', 'Adobe Media Encoder 2025.app'), { recursive: true });
mac._setAppDirsForTests([apps]);

// The runner answers like osascript would, from the script it was handed.
const calls = [];
let volume = { level: 56, muted: false };
let library = 'NONE';
let playlists = 'Gym\nChill';
let running = true;
function fake(file, args) {
  calls.push({ file, args });
  if (file === '/usr/bin/open') return { stdout: '' };
  const script = args.filter((a, i) => args[i - 1] === '-e').join('\n');
  if (/is not running then return "NOT_RUNNING"/.test(script) && !running) return { stdout: 'NOT_RUNNING' };
  if (/get volume settings/.test(script)) return { stdout: `${volume.level}\t${volume.muted}` };
  if (/set volume output volume/.test(script)) { volume = { level: Number(args[args.length - 1]), muted: /with output muted/.test(script) }; return { stdout: 'OK' }; }
  if (/set volume with output muted/.test(script)) { volume.muted = true; return { stdout: 'OK' }; }
  if (/set volume without output muted/.test(script)) { volume.muted = false; return { stdout: 'OK' }; }
  if (/name of every user playlist/.test(script)) return { stdout: playlists };
  if (/search library playlist 1/.test(script)) return { stdout: library };
  if (/player state/.test(script)) return { stdout: 'playing\tBack In Black\tAC/DC\tBack In Black' };
  if (/sound volume as text/.test(script)) return { stdout: '40' };
  return { stdout: 'OK' };
}
mac._setRunnerForTests(async (file, args) => fake(file, args));

test.after(async () => {
  mac._setRunnerForTests(null);
  mac._setFetchForTests(null);
  mac._setAppDirsForTests(null);
  await rm(apps, { recursive: true, force: true });
  await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true });
});

test('his words never become script: they ride after -- as arguments', () => {
  const evil = '" & (do shell script "echo pwned") & "';
  const argv = mac.osaArgs(['set q to item 1 of argv', 'return q'], [evil, '-x']);
  const dash = argv.indexOf('--');
  assert.ok(dash > 0, 'the -- separator is there');
  assert.deepEqual(argv.slice(dash + 1), [evil, '-x']);
  // every -e line is our fixed source; none of them carries his text
  const lines = argv.filter((a, i) => argv[i - 1] === '-e');
  assert.deepEqual(lines, ['on run argv', 'set q to item 1 of argv', 'return q', 'end run']);
  assert.ok(!lines.some((l) => l.includes('pwned')));
});

test('a permission refusal and an unanswered prompt are said with their fix', () => {
  const denied = mac.macError({ stderr: '0:42: execution error: Not authorized to send Apple events to Music. (-1743)' }, 'Music');
  assert.equal(denied.tcc, 'denied');
  assert.match(denied.message, /hasn't let Nova control Music/);
  assert.match(denied.message, /Privacy & Security → Automation/);
  const asking = mac.macError({ killed: true, message: 'Command failed' }, 'Music');
  assert.equal(asking.tcc, 'asking');
  assert.match(asking.message, /click OK/);
  const other = mac.macError({ stderr: '12:40: execution error: Music got an error: Can’t get user playlist "X". (-1728)' }, 'Music');
  assert.equal(other.tcc, undefined);
  assert.match(other.message, /^Music said no: Music got an error/);
});

test('targets: apps strictly, sites exactly, addresses only over http(s)', async () => {
  assert.equal((await mac.resolveTarget('reminders')).name, 'Reminders');
  assert.equal((await mac.resolveTarget('my reminders')).name, 'Reminders');
  assert.equal((await mac.resolveTarget('the music app')).name, 'Music');
  // "apple music" is Music — never the converter that contains both words
  assert.equal((await mac.resolveTarget('apple music')).name, 'Music');
  assert.equal((await mac.resolveTarget('chrome')).name, 'Google Chrome');
  assert.equal((await mac.resolveTarget('claude')).name, 'Claude', 'the exact name beats a longer one');
  assert.equal((await mac.resolveTarget('adobe media encoder 2025')).name, 'Adobe Media Encoder 2025', 'one level into a vendor folder');
  assert.equal((await mac.resolveTarget('notes')).name, 'Notes', 'not Notion');

  const stripe = await mac.resolveTarget('my stripe dashboard', { where: 'browser' });
  assert.deepEqual([stripe.kind, stripe.url], ['url', 'https://dashboard.stripe.com']);
  assert.equal((await mac.resolveTarget('github.com')).url, 'https://github.com/');
  assert.equal((await mac.resolveTarget('stripe dot com')).url, 'https://stripe.com/');

  await assert.rejects(mac.resolveTarget('javascript:alert(1)'), /no app called/);
  await assert.rejects(mac.resolveTarget('file:///etc/passwd'), /no app called/);
  await assert.rejects(mac.resolveTarget('the diary of a ceo channel'), /no app called "the diary of a ceo channel" on your Mac/);
  await assert.rejects(mac.resolveTarget('youtube studio', { where: 'browser' }), /don't know a site called "youtube studio" — say its address/);
});

test('opening hands `open` an argv array — an app by its path, a page by its address', async () => {
  calls.length = 0;
  await mac.openTarget(await mac.resolveTarget('reminders'));
  await mac.openTarget(await mac.resolveTarget('github.com'));
  assert.deepEqual(calls.map((c) => [c.file, ...c.args]), [
    ['/usr/bin/open', '-a', path.join(apps, 'Reminders.app')],
    ['/usr/bin/open', 'https://github.com/'],
  ]);
  await assert.rejects(mac.openTarget({ kind: 'url', url: 'javascript:alert(1)', label: 'x' }), /refusing/);
  await assert.rejects(mac.openTarget({ kind: 'app', path: 'Reminders.app', label: 'x' }), /not an app/);
});

test('play: his playlist first, then his library, then the catalogue — opened, never claimed as playing', async () => {
  calls.length = 0;
  const pl = await mac.musicPlay('gym');
  assert.deepEqual(pl, { how: 'playlist', name: 'Gym' });
  const playCall = calls.find((c) => c.args.some((a) => /play \(user playlist p\)/.test(a)));
  assert.equal(playCall.args[playCall.args.length - 1], 'Gym', 'the playlist name rides as an argument');

  library = 'Back In Black\tAC/DC';
  assert.deepEqual(await mac.musicPlay('back in black by ac/dc'), { how: 'library', name: 'Back In Black', artist: 'AC/DC' });
  const search = calls.filter((c) => c.args.some((a) => /search library playlist 1/.test(a))).pop();
  assert.equal(search.args[search.args.length - 1], 'back in black ac/dc', '"by" is dropped — no field contains it');

  library = 'NONE';
  let asked = null;
  mac._setFetchForTests(async (url) => {
    asked = url;
    return { ok: true, json: async () => ({ results: [{ trackName: 'Thunderstruck', artistName: 'AC/DC', trackViewUrl: 'https://music.apple.com/au/album/the-razors-edge/574043989?i=574044008&uo=4' }] }) };
  });
  calls.length = 0;
  const cat = await mac.musicPlay('thunderstruck');
  assert.deepEqual(cat, { how: 'catalog', name: 'Thunderstruck', artist: 'AC/DC' });
  assert.match(asked, /itunes\.apple\.com\/search\?term=thunderstruck&entity=song&limit=1&country=au/);
  const opened = calls.find((c) => c.file === '/usr/bin/open');
  assert.deepEqual(opened.args, ['music://music.apple.com/au/album/the-razors-edge/574043989?i=574044008'], 'opens in the Music app, tracking tag stripped');

  mac._setFetchForTests(async () => ({ ok: true, json: async () => ({ results: [] }) }));
  await assert.rejects(mac.musicPlay('zzqx nothing'), /couldn't find "zzqx nothing" in your library or on Apple Music/);
  await assert.rejects(mac.musicPlay('workout', { kind: 'playlist' }), /no playlist called "workout"/);
});

test('pause, skip and back never launch Music just to stop it', async () => {
  running = false;
  await assert.rejects(mac.musicControl('pause'), /Music isn't open on your Mac/);
  await assert.rejects(mac.musicControl('next'), /Music isn't open/);
  assert.deepEqual(await mac.musicNow(), { running: false, state: 'closed' });
  running = true;
  const now = await mac.musicControl('pause');
  assert.equal(now.name, 'Back In Black');
  await assert.rejects(mac.musicControl('rm -rf'), /can't "rm -rf" the music/);
});

test('volume: a level, a step, a spoken amount, mute — and the exact level back on undo', async () => {
  volume = { level: 56, muted: false };
  assert.deepEqual(await mac.setVolume({ level: 30 }), { target: 'mac', before: 56, after: 30, wasMuted: false, muted: false });
  assert.equal((await mac.setVolume({ change: 'up' })).after, 45, 'a plain "up" is 15 points');
  assert.equal((await mac.setVolume({ change: 'down', by: 8 })).after, 37);
  assert.equal((await mac.setVolume({ level: 250 })).after, 100, 'clamped');
  assert.equal((await mac.setVolume({ change: 'mute' })).muted, true);
  assert.equal(volume.muted, true);
  await mac.restoreVolume({ level: 56, muted: false });
  assert.deepEqual(volume, { level: 56, muted: false });
  await assert.rejects(mac.setVolume({}), /what level/);
  await assert.rejects(mac.setVolume({ target: 'music', change: 'mute' }), /only mute the whole Mac/);
  const m = await mac.setVolume({ target: 'music', level: 20 });
  assert.deepEqual([m.before, m.after], [40, 20]);
});

test('the Mac remembers whether it let Nova drive Music — for the roster', async () => {
  await mac._flushStateForTests();
  const ok = JSON.parse(await readFile(path.join(process.env.NOVA_DATA_DIR, 'mac-hand.json'), 'utf8'));
  assert.equal(ok.automation.Music.ok, true);

  mac._setRunnerForTests(async () => { const e = new Error('Command failed'); e.stderr = 'execution error: Not authorized to send Apple events to Music. (-1743)'; throw e; });
  await assert.rejects(mac.musicNow(), /hasn't let Nova control Music/);
  await mac._flushStateForTests();
  const denied = mac.readMacState();
  assert.deepEqual([denied.automation.Music.ok, denied.automation.Music.why], [false, 'denied']);
  mac._setRunnerForTests(async (file, args) => fake(file, args));
});
