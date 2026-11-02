// WHO DID THE SERVER TALK TO? (2 Nov 2026, the Wi-Fi-off drill)
//
// The local-Nova plan (design/LOCAL-NOVA-PLAN.md §1b) asks for a drill that
// proves what would still work with the internet gone: run a turn, list every
// host the server reached, and fail if any of them is not on this Mac or his
// own network. This is the watcher behind it.
//
// Opt-in only: enableOutboundWatch(), or NOVA_OUTBOUND_WATCH=1 at boot. Off,
// nothing is wrapped and nothing is recorded. On, it wraps globalThis.fetch
// and the http/https request functions and records ONE row per connection
// attempt: { at, host, port, via, local, turn?, reason? }. Hosts only: never a
// path, a query string, a header or a body (a search query or a token in a URL
// must not land in a log by way of the thing meant to audit privacy).
//
// What it cannot see, said plainly: connections made by CHILD processes (the
// claude CLI, yt-dlp, headless Chrome, the Python sidecars' own downloads).
// Those are listed by lib/internetNeeds.js from the code, not watched here.

import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';

const MAX_ROWS = 500;
let rows = [];
let active = false;
let currentTurn = null;           // { label, at } from markTurn
const reasonStore = new AsyncLocalStorage();
let originals = null;             // { fetch, httpRequest, httpGet, httpsRequest, httpsGet }

// ------------------------------- local hosts --------------------------------

const ipv4 = (h) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
};

/** Is this host on this Mac, his tailnet, or his home network? Pure.
 *  Local: localhost names, 127/8, ::1, 0.0.0.0, the tailnet (100.64/10 and
 *  *.ts.net names, Tailscale's own IPv6 range fd7a:115c:a1e0::/48), and his
 *  LAN 192.168/16. Everything else is the internet. */
export function isLocalHost(host) {
  let h = String(host || '').trim().toLowerCase();
  if (!h) return false;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.startsWith('::ffff:')) h = h.slice(7);
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0' || h === '::') return true;
  if (h.endsWith('.ts.net')) return true;
  if (h.startsWith('fd7a:115c:a1e0:')) return true;
  const p = ipv4(h);
  if (!p) return false;
  if (p[0] === 127) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;   // 100.64.0.0/10, the tailnet
  if (p[0] === 192 && p[1] === 168) return true;                // his LAN
  return false;
}

// --------------------------------- rows -------------------------------------

const defaultPort = (protocol) => (protocol === 'https:' ? 443 : 80);

/** host + port out of whatever a caller handed fetch: a string, a URL, or a
 *  Request. Never returns the path or query. Pure. */
export function targetOfFetch(input) {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const u = new URL(String(raw));
    return { host: u.hostname, port: Number(u.port) || defaultPort(u.protocol) };
  } catch {
    return null;
  }
}

/** host + port out of http.request's (url | options, [options]) forms. Pure. */
export function targetOfRequest(args, protocol) {
  let host = null;
  let port = null;
  for (const a of args) {
    if (!a || typeof a === 'function') continue;
    if (typeof a === 'string' || a instanceof URL) {
      try {
        const u = new URL(String(a));
        host = u.hostname;
        port = Number(u.port) || defaultPort(u.protocol);
      } catch { /* not a URL */ }
      continue;
    }
    if (typeof a === 'object') {
      if (a.socketPath) { host = 'localhost'; port = 0; continue; }
      const h = a.hostname || a.host;
      if (h) host = String(h).replace(/:\d+$/, '');
      if (a.port) port = Number(a.port);
    }
  }
  if (!host && !port) return { host: 'localhost', port: defaultPort(protocol) };   // Node's own default
  return { host: host || 'localhost', port: port || defaultPort(protocol) };
}

function record(target, via) {
  if (!active || !target?.host) return;
  const row = {
    at: Date.now(),
    host: String(target.host).replace(/^\[|\]$/g, ''),
    port: Number(target.port) || null,
    via,
    local: isLocalHost(target.host),
  };
  if (currentTurn) row.turn = currentTurn.label;
  const reason = reasonStore.getStore();
  if (reason) row.reason = String(reason).slice(0, 80);
  rows.push(row);
  if (rows.length > MAX_ROWS) rows = rows.slice(rows.length - MAX_ROWS);
}

// ------------------------------- the wrap -----------------------------------

/** Start watching. Idempotent. Returns true when it wrapped this time. */
export function enableOutboundWatch() {
  if (active) return false;
  originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
  };
  const o = originals;
  if (typeof o.fetch === 'function') {
    const watchedFetch = function watchedFetch(input, init) {
      record(targetOfFetch(input), 'fetch');
      return o.fetch.call(this, input, init);
    };
    watchedFetch.__novaOutbound = true;
    globalThis.fetch = watchedFetch;
  }
  const wrap = (fn, protocol) => {
    const w = function watchedRequest(...args) {
      record(targetOfRequest(args, protocol), 'http');
      return fn.apply(this, args);
    };
    w.__novaOutbound = true;
    return w;
  };
  http.request = wrap(o.httpRequest, 'http:');
  http.get = wrap(o.httpGet, 'http:');
  https.request = wrap(o.httpsRequest, 'https:');
  https.get = wrap(o.httpsGet, 'https:');
  syncBuiltinESMExports();   // `import { request } from 'node:http'` sees the wrap too
  active = true;
  return true;
}

/** Stop watching and put the originals back (only where nobody has wrapped
 *  on top of us since; a later wrapper keeps working, ours passes through). */
export function disableOutboundWatch() {
  if (!active) return false;
  active = false;
  const o = originals;
  if (globalThis.fetch?.__novaOutbound) globalThis.fetch = o.fetch;
  if (http.request.__novaOutbound) http.request = o.httpRequest;
  if (http.get.__novaOutbound) http.get = o.httpGet;
  if (https.request.__novaOutbound) https.request = o.httpsRequest;
  if (https.get.__novaOutbound) https.get = o.httpsGet;
  syncBuiltinESMExports();
  originals = null;
  currentTurn = null;
  return true;
}

export const outboundWatchOn = () => active;

/** Tag the connections that follow with a turn label (the drill's run). */
export function markTurn(label) {
  const at = Date.now();
  currentTurn = { label: String(label || 'turn').slice(0, 80), at };
  return { ...currentTurn };
}

export const currentTurnMark = () => (currentTurn ? { ...currentTurn } : null);

/** Run fn with a reason attached to every connection it makes. */
export function withOutboundReason(reason, fn) {
  return reasonStore.run(String(reason || ''), fn);
}

/** The rows at or after `ts` (ms since epoch), oldest first. */
export function connectionsSince(ts = 0) {
  const t = Number(ts) || 0;
  return rows.filter((r) => r.at >= t).map((r) => ({ ...r }));
}

/** The distinct hosts in a set of rows that are not local, sorted. Pure. */
export function nonLocalHosts(list) {
  return [...new Set((list || []).filter((r) => !r.local).map((r) => `${r.host}${r.port ? `:${r.port}` : ''}`))].sort();
}

export function _resetOutboundForTests() {
  rows = [];
  currentTurn = null;
}

if (process.env.NOVA_OUTBOUND_WATCH === '1') enableOutboundWatch();
