import test from 'node:test';
import assert from 'node:assert/strict';
import { syncWidgets, _resetWidgetBridge } from '../../src/widgetBridge.js';

const conn = { baseUrl: 'https://mac.example', token: 't1' };

function stub() {
  const calls = [];
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { NovaWidgets: {
    configure: async (o) => { calls.push(['configure', o]); },
    reload: async () => { calls.push(['reload']); },
  } } } };
  return calls;
}

test('outside the native app it does nothing', async () => {
  delete globalThis.window;
  _resetWidgetBridge();
  assert.deepEqual(await syncWidgets(conn), { skipped: 'no-widgets' });
});

test('hands over the Mac once, then reloads at most once a minute unless forced', async () => {
  const calls = stub();
  _resetWidgetBridge();
  await syncWidgets(conn, { now: 1_000_000 });
  assert.deepEqual(calls, [['configure', { baseUrl: conn.baseUrl, token: 't1' }], ['reload']]);
  assert.deepEqual(await syncWidgets(conn, { now: 1_010_000 }), { skipped: 'recent' });
  await syncWidgets(conn, { now: 1_020_000, force: true });
  assert.equal(calls.filter((c) => c[0] === 'reload').length, 2);
  assert.equal(calls.filter((c) => c[0] === 'configure').length, 1);
  // a new token is handed over again
  await syncWidgets({ ...conn, token: 't2' }, { now: 1_030_000 });
  assert.equal(calls.filter((c) => c[0] === 'configure').length, 2);
  delete globalThis.window;
});
