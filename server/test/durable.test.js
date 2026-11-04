// Nova's saved state kept twice in the iPhone app (src/durable.js + NovaDurable
// in ios/App/App/NovaBridgeViewController.swift), 4 Nov 2026: his phone turned
// off, WebKit lost the page's storage, and Nova came back in demo mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startDurable, ALIVE_KEY, FLUSH_MS } from '../../src/durable.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

function world({ native = true, connected = true } = {}) {
  // a fresh prototype per test: the mirror patches it
  const Proto = class extends FakeStorage {};
  const proto = { setItem: FakeStorage.prototype.setItem, removeItem: FakeStorage.prototype.removeItem };
  Object.assign(Proto.prototype, proto);
  const storage = new Proto();
  if (connected) storage.m.set('novaos.connection', '{"baseUrl":"https://mac","token":"t"}');
  const disk = new Map();
  const calls = [];
  const listeners = {};
  const win = {
    localStorage: storage,
    navigator: { storage: { persist: async () => { calls.push(['persist']); return true; } } },
    addEventListener: (t, f) => { listeners[t] = f; },
    document: { visibilityState: 'visible', addEventListener: (t, f) => { listeners[t] = f; } },
    Capacitor: native ? { isNativePlatform: () => true, Plugins: { NovaDurable: {
      set: async ({ key, value }) => { calls.push(['set', key]); disk.set(key, value); },
      remove: async ({ key }) => { calls.push(['remove', key]); disk.delete(key); },
    } } } : undefined,
  };
  return { win, storage, Proto, disk, calls, listeners };
}

test('every boot stamps the storage, and asks the browser to keep it', () => {
  const w = world({ native: false });
  assert.equal(startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage }), null, 'outside the app there is no copy to keep');
  assert.ok(w.storage.getItem(ALIVE_KEY));
  assert.deepEqual(w.calls, [['persist']]);
});

test('in the app, Nova keys are copied to the app files, coalesced; other keys and the stamp are not', async () => {
  const w = world();
  const h = startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  w.storage.setItem('novaos.lastLive', '{"a":1}');
  w.storage.setItem('novaos.lastLive', '{"a":2}');
  w.storage.setItem('something.else', 'x');
  await h.flush();
  assert.equal(w.disk.get('novaos.lastLive'), '{"a":2}');
  assert.ok(!w.disk.has('something.else'));
  assert.ok(!w.disk.has(ALIVE_KEY));
  assert.equal(w.calls.filter((c) => c[0] === 'set' && c[1] === 'novaos.lastLive').length, 1, 'two quick writes go out as one');
});

test('a first run seeds the copy with everything already saved', async () => {
  const w = world();
  w.storage.setItem('novaos.style', 'summary');
  const h = startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  await h.flush();
  assert.equal(w.disk.get('novaos.style'), 'summary');
  assert.ok(w.disk.get('novaos.connection').includes('https://mac'));
});

test('a deliberate removal (Disconnect) is removed from the copy too', async () => {
  const w = world();
  const h = startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  w.storage.setItem('novaos.connection', 'c');
  await h.flush();
  w.storage.removeItem('novaos.connection');
  await h.flush();
  assert.ok(!w.disk.has('novaos.connection'));
});

test('closing the app straight after a write still saves it', async () => {
  const w = world();
  startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  w.storage.setItem('novaos.activeSession', '{"sets":3}');
  w.listeners.pagehide();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(w.disk.get('novaos.activeSession'), '{"sets":3}');
  assert.ok(FLUSH_MS > 5, 'it went out on pagehide, not on the timer');
});

test('a failed save is tried again with the next flush', async () => {
  const w = world();
  let fail = true;
  w.win.Capacitor.Plugins.NovaDurable.set = async ({ key, value }) => { if (fail) throw new Error('disk'); w.disk.set(key, value); };
  const h = startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  w.storage.setItem('novaos.outbox', '[1]');
  await h.flush();
  assert.ok(!w.disk.has('novaos.outbox'));
  fail = false;
  await h.flush();
  assert.equal(w.disk.get('novaos.outbox'), '[1]');
});

test('the native side restores only after a wipe, and the page boots main.jsx with the mirror first', () => {
  const swift = fs.readFileSync(new URL('../../ios/App/App/NovaBridgeViewController.swift', import.meta.url), 'utf8');
  assert.match(swift, /registerPluginInstance\(NovaDurablePlugin\(\)\)/);
  assert.match(swift, /injectionTime: \.atDocumentStart/);
  assert.match(swift, /if\(ls\.getItem\('\\\(alive\)'\)!==null&&\(ls\.getItem\('novaos\.connection'\)!==null\|\|!d\['novaos\.connection'\]\)\)return;/, 'a live, connected storage is never touched');
  assert.match(swift, /key == "novaos\.connection"[\s\S]*removeObject\(forKey: "nova\.token"\)/, 'Disconnect clears the widgets\' token too');
  assert.match(swift, /if\(ls\.getItem\(k\)===null\)/, 'only missing keys are put back');
  assert.match(swift, /sort\(function\(a,b\)\{return d\[a\]\.length-d\[b\]\.length;\}\)/, 'smallest first');
  assert.match(swift, /static let alive = "novaos\.__alive"/);
  assert.equal(ALIVE_KEY, 'novaos.__alive', 'the page and the app agree on the stamp');
  assert.match(swift, /nova\.baseUrl[\s\S]*nova\.token/, 'the connection falls back to the widgets\' App Group copy');
  const main = fs.readFileSync(new URL('../../src/main.jsx', import.meta.url), 'utf8');
  assert.ok(main.indexOf('startDurable()') > 0 && main.indexOf('startDurable()') < main.indexOf('createRoot('), 'the mirror starts before the app renders');
});

test('the data snapshot (IndexedDB) is kept too, serialised once per round, never wiped by its own save', async () => {
  const w = world();
  const h = startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  const { keepCopy } = await import('../../src/durable.js');
  let made = 0;
  for (let i = 0; i < 5; i++) keepCopy('novaos.lastLive', () => { made++; return JSON.stringify({ slices: { i } }); });
  await h.flush();
  assert.equal(made, 1);
  assert.equal(w.disk.get('novaos.lastLive'), '{"slices":{"i":4}}');
  const live = fs.readFileSync(new URL('../../src/liveStore.js', import.meta.url), 'utf8');
  assert.match(live, /if \(localStorage\.getItem\(LEGACY_KEY\) !== null\) localStorage\.removeItem\(LEGACY_KEY\)/, 'a save must not queue a removal of the copy');
  assert.match(live, /keepCopy\(LEGACY_KEY, \(\) => JSON\.stringify\(copy\)\)/);
});

test('a boot in demo never overwrites the good copy; saving a connection starts the copy again', async () => {
  const w = world({ connected: false });
  w.disk.set('novaos.chats', 'his real chats');
  const h = startDurable({ win: w.win, StorageProto: w.Proto.prototype, storage: w.storage });
  w.storage.setItem('novaos.chats', 'demo chats');
  await h.flush();
  assert.equal(w.disk.get('novaos.chats'), 'his real chats');
  w.storage.setItem('novaos.connection', '{"baseUrl":"https://mac","token":"t"}');
  await h.flush();
  assert.ok(w.disk.get('novaos.connection'));
  assert.equal(w.disk.get('novaos.chats'), 'demo chats', 'once connected, what he has now is the copy');
});
