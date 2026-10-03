// QUIET HOURS — 3 Oct 2026. His words: "Yes notifications respect quiet hours."
//
// What this pins:
//   1. the window is his Melbourne clock (stamps stay UTC), default 22:00 to
//      07:00, crossing midnight, and daylight saving does not move its end;
//   2. a push at 23:00 Melbourne is HELD, not sent, and says so;
//   3. it is delivered at 07:00; two held pushes become ONE;
//   4. `urgent` goes through; quiet hours off sends at once;
//   5. the late hands-free answer's push (handsFree.followThrough) honours it;
//   6. GET/PUT /api/prefs/quiet-hours read and write the window, refuse a
//      time that is not a time, and turning it off delivers what is held.
//
// NOVA_DATA_DIR is a temp dir set BEFORE import; no real device is ever
// reached (push._setPushTransportForTests), and the clock is injected.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-quiet-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { getQuietHours, setQuietHours, inQuietHours, quietEndsAt, melbourneMinutes, DEFAULT_QUIET_HOURS } = await import('../lib/quietHours.js');
const { sendPush, flushHeldPushes, heldPushes, combinePushes, _setPushTransportForTests } = await import('../lib/push.js');
const { followThrough } = await import('../lib/handsFree.js');
const { modelPrefsRouter } = await import('../routes/modelPrefs.js');

// Melbourne on 1 Oct 2026 is AEST, UTC+10 (daylight saving starts 4 Oct).
const AT = (hhmm, day = '2026-10-01') => Date.parse(`${day}T${hhmm}:00+10:00`);
let now = AT('12:00');
const sent = [];
_setPushTransportForTests(async (note) => { sent.push(note); return { sent: 1 }; }, { now: () => now });
test.after(() => _setPushTransportForTests(null));

const reset = async () => {
  now = AT('12:00');
  await flushHeldPushes();
  sent.length = 0;
  await setQuietHours({ ...DEFAULT_QUIET_HOURS });
};

test('the window is his Melbourne clock: 22:00 to 07:00 by default, across midnight', async () => {
  assert.deepEqual(getQuietHours(), { enabled: true, start: '22:00', end: '07:00' });
  const p = getQuietHours();
  assert.equal(melbourneMinutes(AT('23:00')), 23 * 60);
  assert.equal(inQuietHours(p, AT('21:59')), false);
  assert.equal(inQuietHours(p, AT('22:00')), true);
  assert.equal(inQuietHours(p, AT('23:00')), true);
  assert.equal(inQuietHours(p, AT('03:00', '2026-10-02')), true);
  assert.equal(inQuietHours(p, AT('07:00', '2026-10-02')), false, 'the end minute is outside');
  assert.equal(new Date(quietEndsAt(p, AT('23:00'))).toISOString(), '2026-10-01T21:00:00.000Z', '07:00 AEST is 21:00 UTC');
  // a window that does not cross midnight
  assert.equal(inQuietHours({ enabled: true, start: '13:00', end: '15:00' }, AT('14:00')), true);
  assert.equal(inQuietHours({ enabled: true, start: '13:00', end: '15:00' }, AT('16:00')), false);
  assert.equal(inQuietHours({ ...p, enabled: false }, AT('23:00')), false);
  // the night daylight saving starts (4 Oct 2026, 02:00 AEST → 03:00 AEDT):
  // the window still ends at 07:00 on his clock, which is now UTC+11
  const dst = Date.parse('2026-10-03T23:00:00+10:00');
  assert.equal(new Date(quietEndsAt(p, dst)).toISOString(), '2026-10-03T20:00:00.000Z');
});

test('a push at 23:00 Melbourne is held, not sent, and says when it will arrive', async () => {
  await reset();
  now = AT('23:00');
  const out = await sendPush({ title: 'Research brief — Nova', body: 'Creatine and sleep', tag: 'record-a1' });
  assert.equal(out.sent, 0);
  assert.equal(out.held, true);
  assert.equal(out.deliverAt, '2026-10-01T21:00:00.000Z');
  assert.equal(sent.length, 0, 'nothing reached a device');
  assert.equal((await heldPushes()).length, 1);
  assert.match((await heldPushes())[0].heldAt, /Z$/, 'stamps stay UTC');
  // a flush still inside the window delivers nothing
  now = AT('06:59', '2026-10-02');
  await flushHeldPushes();
  assert.equal(sent.length, 0);
  // at 07:00 it goes, exactly as it was
  now = AT('07:00', '2026-10-02');
  const flushed = await flushHeldPushes();
  assert.equal(flushed.delivered, 1);
  assert.deepEqual(sent, [{ title: 'Research brief — Nova', body: 'Creatine and sleep', tag: 'record-a1', url: './#/inbox' }]);
  assert.equal((await heldPushes()).length, 0);
});

test('two held pushes become ONE at the end of the window', async () => {
  await reset();
  now = AT('22:30');
  await sendPush({ title: 'Research brief — Nova', body: 'a', tag: 'record-a' });
  now = AT('02:10', '2026-10-02');
  const second = await sendPush({ title: 'Guardian — Nova', body: 'b', tag: 'record-b', url: './#/inbox' });
  assert.equal(second.waiting, 2);
  assert.equal(sent.length, 0);
  // the first push after the window delivers the held ones first, as one
  now = AT('07:05', '2026-10-02');
  await sendPush({ title: 'Plan Today — Nova', body: 'c', tag: 'plan' });
  assert.equal(sent.length, 2, 'the combined push, then the new one');
  assert.deepEqual(sent[0], { title: 'Nova — 2 held during quiet hours', body: 'Research brief · Guardian', tag: 'quiet-hours', url: './#/inbox' });
  assert.equal(sent[1].title, 'Plan Today — Nova');
  // a newer push with the same tag replaces the older one in the queue
  assert.equal(combinePushes([{ title: 'x', body: '', tag: 't', url: './#/voice', heldAt: 'z' }]).url, './#/voice');
  await reset();
  now = AT('23:00');
  await sendPush({ title: 'One', tag: 'same' });
  await sendPush({ title: 'Two', tag: 'same' });
  assert.deepEqual((await heldPushes()).map((h) => h.title), ['Two']);
});

test('urgent goes through the window; quiet hours off sends at once', async () => {
  await reset();
  now = AT('23:00');
  const u = await sendPush({ title: 'Urgent', tag: 'u', urgent: true });
  assert.equal(u.sent, 1);
  assert.equal(sent.length, 1);
  await setQuietHours({ enabled: false });
  const off = await sendPush({ title: 'Off', tag: 'o' });
  assert.equal(off.sent, 1);
  assert.equal(sent.length, 2);
});

test('the late hands-free answer honours quiet hours: held at 23:00, delivered at 07:00', async () => {
  await reset();
  now = AT('23:00');
  const job = { id: 'late1', status: 'ready', result: { text: 'Asking the Researcher.\n\nTake 3 to 5 g a day.', consult: [{ agent: 'researcher', ok: true, state: 'done' }] } };
  let landed = false;
  // no `push` injected: the real path, push.sendPush
  await followThrough('late1', { getJob: () => job, pollMs: 5, onReady: () => { landed = true; } });
  assert.equal(landed, true, 'the answer still lands in his thread at once');
  assert.equal(sent.length, 0, 'but his phone is not woken');
  assert.equal((await heldPushes())[0].title, 'Nova answered, with the Researcher');
  now = AT('07:00', '2026-10-02');
  await flushHeldPushes();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, 'Take 3 to 5 g a day.');
  assert.equal(sent[0].url, './#/voice');
});

test('GET/PUT /api/prefs/quiet-hours: read, write, refuse a non-time, and turning it off delivers what is held', async () => {
  await reset();
  const app = express();
  app.use(express.json());
  app.use('/api', modelPrefsRouter());
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/prefs/quiet-hours`;
  const put = (body) => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const got = await (await fetch(url)).json();
    assert.deepEqual(got, { enabled: true, start: '22:00', end: '07:00', timeZone: 'Australia/Melbourne', waiting: 0 });
    const moved = await (await put({ start: '21:30' })).json();
    assert.equal(moved.start, '21:30');
    assert.equal(moved.end, '07:00');
    assert.equal((await put({ start: '9pm' })).status, 400);
    assert.equal((await put({ enabled: 'yes' })).status, 400);
    assert.equal((await put({ start: '07:00' })).status, 400, 'start and end cannot be the same');
    assert.equal((await put({})).status, 400);
    // one held, then he turns it off: it goes now
    now = AT('23:00');
    await sendPush({ title: 'Held', tag: 'h' });
    assert.equal((await (await fetch(url)).json()).waiting, 1);
    const off = await (await put({ enabled: false })).json();
    assert.equal(off.enabled, false);
    assert.equal(off.waiting, 0);
    assert.deepEqual(sent.map((n) => n.title), ['Held']);
  } finally {
    server.close();
  }
});

test('a reminder he set himself is urgent: quiet hours never hold it', () => {
  const src = readFileSync(new URL('../lib/reminders.js', import.meta.url), 'utf8');
  assert.match(src, /sendPush\(\{ title: say\.title, body: say\.body, tag: `reminder-\$\{r\.id\}`, urgent: true \}\)/);
});

