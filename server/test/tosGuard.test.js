// The guard that stops Node's fetch from killing the server over a
// type-of-service byte (lib/tosGuard.js). Driven against a stand-in Socket
// class so the test never touches the real network or net.Socket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installTosGuard } from '../lib/tosGuard.js';

const errno = (code, syscall) => Object.assign(new Error(`${syscall} ${code}`), { code, syscall });

function makeSocket(throwWith) {
  class FakeSocket {}
  FakeSocket.prototype.setTypeOfService = function () { if (throwWith) throw throwWith; return this; };
  return FakeSocket;
}

test('EINVAL from setTypeOfService is swallowed, once logged, and the socket is returned', () => {
  const S = makeSocket(errno('EINVAL', 'setTypeOfService'));
  const logs = [];
  assert.equal(installTosGuard(S, { log: (m) => logs.push(m) }), true);
  const s = new S();
  assert.equal(s.setTypeOfService(0), s);
  assert.equal(s.setTypeOfService(0), s);
  assert.equal(logs.length, 1, 'warn once, not per request');
});

test('any other error still throws exactly as before', () => {
  const S = makeSocket(errno('EPERM', 'setTypeOfService'));
  installTosGuard(S, { log: () => {} });
  assert.throws(() => new S().setTypeOfService(0), /EPERM/);
  const S2 = makeSocket(errno('EINVAL', 'somethingElse'));
  installTosGuard(S2, { log: () => {} });
  assert.throws(() => new S2().setTypeOfService(0), /EINVAL/, 'only that one syscall is forgiven');
});

test('a working call passes through, and installing twice is a no-op', () => {
  const S = makeSocket(null);
  assert.equal(installTosGuard(S, { log: () => {} }), true);
  assert.equal(installTosGuard(S, { log: () => {} }), false);
  const s = new S();
  assert.equal(s.setTypeOfService(8), s);
});

test('importing the module installs it on the real net.Socket', async () => {
  const net = await import('node:net');
  const { tosGuardInstalled } = await import('../lib/tosGuard.js');
  assert.equal(tosGuardInstalled(), true);
  assert.equal(net.default.Socket.prototype.__novaTosGuard, true);
});
