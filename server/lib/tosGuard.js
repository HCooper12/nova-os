// THE SERVER WAS DYING ON ITS OWN FETCHES (26 Sep 2026).
//
// Node 24.16's built-in fetch (undici 7.25) calls socket.setTypeOfService()
// on EVERY HTTP/1 request it writes. Since the macOS 27 update that call
// returns EINVAL on some sockets, and Node's net.Socket turns the error into
// a throw inside a socket event listener — which nothing can catch, so the
// whole server exits. The log holds five of these since 06:51 AEST on 26 Sep;
// one took down a live catalogue refresh and every job beside it, exactly
// the loss scripts/reload-server.mjs exists to prevent.
//
// The type-of-service byte is a routing hint nobody here sets. Node already
// treats it as best-effort on Windows (net.js: "we treat this as a best
// effort operation and do not throw on Windows"). This applies the same rule
// to EINVAL on every platform, and ONLY to EINVAL from that one call: any
// other error still throws exactly as before.
import net from 'node:net';

const EINVAL = 'EINVAL';
let installed = false;

export function installTosGuard(Socket = net.Socket, { log = (m) => console.warn(m) } = {}) {
  if (Socket.prototype.__novaTosGuard) return false;
  const original = Socket.prototype.setTypeOfService;
  if (typeof original !== 'function') return false;
  let warned = false;
  Socket.prototype.setTypeOfService = function guardedSetTypeOfService(tos) {
    try {
      return original.call(this, tos);
    } catch (err) {
      if (err?.code === EINVAL && err?.syscall === 'setTypeOfService') {
        if (!warned) { warned = true; log('tos-guard: setTypeOfService EINVAL ignored (best effort, as Node does on Windows)'); }
        return this;
      }
      throw err;
    }
  };
  Socket.prototype.__novaTosGuard = true;
  if (Socket === net.Socket) installed = true;
  return true;
}

export const tosGuardInstalled = () => installed;

installTosGuard();
