// lib/outbound.js — the Wi-Fi-off drill's watcher: wrap/unwrap, local
// flagging, the ring buffer, and that a row carries a host and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  isLocalHost, enableOutboundWatch, disableOutboundWatch, outboundWatchOn, markTurn,
  connectionsSince, nonLocalHosts, withOutboundReason, targetOfFetch, targetOfRequest,
  _resetOutboundForTests,
} from '../lib/outbound.js';

test.afterEach(() => { disableOutboundWatch(); _resetOutboundForTests(); });

test('local hosts: this Mac, the tailnet, his LAN; everything else is the internet', () => {
  for (const h of ['localhost', '127.0.0.1', '127.8.9.1', '::1', '[::1]', '::ffff:127.0.0.1', '100.65.137.114', '100.64.0.1', '100.127.255.255', '192.168.1.20', 'haydens-macbook-pro.taild050ac.ts.net', 'fd7a:115c:a1e0::e101:89cd']) {
    assert.equal(isLocalHost(h), true, h);
  }
  for (const h of ['api.groq.com', '8.8.8.8', '100.63.0.1', '100.128.0.1', '10.0.0.4', '172.16.0.1', 'api.search.brave.com', '', null]) {
    assert.equal(isLocalHost(h), false, String(h));
  }
});

test('targets: host and port only, never a path or query', () => {
  assert.deepEqual(targetOfFetch('https://api.search.brave.com/res/v1/web/search?q=secret+words'), { host: 'api.search.brave.com', port: 443 });
  assert.deepEqual(targetOfFetch(new URL('http://127.0.0.1:11434/api/tags')), { host: '127.0.0.1', port: 11434 });
  assert.deepEqual(targetOfRequest([{ hostname: 'example.com', port: 8080, path: '/x?token=1' }], 'http:'), { host: 'example.com', port: 8080 });
  assert.deepEqual(targetOfRequest(['https://example.org/a?b=c'], 'https:'), { host: 'example.org', port: 443 });
  assert.deepEqual(targetOfRequest([{ host: 'h.example:99' }], 'http:'), { host: 'h.example', port: 80 });
});

test('off by default: nothing is wrapped and nothing recorded', async () => {
  assert.equal(outboundWatchOn(), false);
  const before = globalThis.fetch;
  await globalThis.fetch('http://127.0.0.1:9/').catch(() => {});
  assert.equal(connectionsSince(0).length, 0);
  assert.equal(globalThis.fetch, before);
});

test('wrap and unwrap: fetch and http.request are recorded while on, restored after', async () => {
  const origFetch = globalThis.fetch;
  const origReq = http.request;
  assert.equal(enableOutboundWatch(), true);
  assert.equal(enableOutboundWatch(), false, 'idempotent');
  assert.notEqual(globalThis.fetch, origFetch);
  const t = markTurn('unit');
  await globalThis.fetch('http://127.0.0.1:9/private/path?q=his+words', { headers: { Authorization: 'Bearer zzz' } }).catch(() => {});
  await withOutboundReason('testing', () => new Promise((resolve) => {
    const req = http.request({ hostname: 'localhost', port: 9, path: '/secret?x=1', method: 'GET' }, () => resolve());
    req.on('error', () => resolve());
    req.end();
  }));
  const rows = connectionsSince(t.at);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.via), ['fetch', 'http']);
  assert.equal(rows[1].reason, 'testing');
  for (const r of rows) {
    const keys = ['at', 'host', 'local', 'port', 'turn', 'via', ...(r.reason ? ['reason'] : [])].sort();
    assert.deepEqual(Object.keys(r).sort(), keys);
    assert.equal(r.local, true);
    assert.equal(r.turn, 'unit');
    const s = JSON.stringify(r);
    assert.ok(!s.includes('secret') && !s.includes('words') && !s.includes('zzz') && !s.includes('private'));
  }
  assert.equal(disableOutboundWatch(), true);
  assert.equal(globalThis.fetch, origFetch);
  assert.equal(http.request, origReq);
});

test('non-local hosts are listed once each, sorted', () => {
  const rows = [
    { host: 'api.groq.com', port: 443, local: false },
    { host: '127.0.0.1', port: 11434, local: true },
    { host: 'api.groq.com', port: 443, local: false },
    { host: 'api.notion.com', port: 443, local: false },
  ];
  assert.deepEqual(nonLocalHosts(rows), ['api.groq.com:443', 'api.notion.com:443']);
});

test('ring buffer keeps the last 500', async () => {
  enableOutboundWatch();
  const calls = [];
  // the wrapper records before calling through; a closed port fails fast
  for (let i = 0; i < 520; i++) calls.push(globalThis.fetch(`http://127.0.0.1:9/${i}`).catch(() => {}));
  await Promise.all(calls);
  assert.equal(connectionsSince(0).length, 500);
});
