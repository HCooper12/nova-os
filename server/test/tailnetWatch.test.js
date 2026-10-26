// The road to his phone (lib/tailnetWatch.js, 27 Oct 2026): Tailscale on the
// Mac switched itself off overnight and nothing noticed. These drive the
// watcher with a scripted `tailscale` and never touch the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTailscaleStatus, suggestedUpFlags, createTailnetWatch } from '../lib/tailnetWatch.js';

const status = (state, ip = '100.65.137.114') => ({ ok: true, stdout: JSON.stringify({ BackendState: state, Self: { TailscaleIPs: [ip, 'fd7a:115c::1'] } }), stderr: '' });

test('parseTailscaleStatus reads the real state and the 100.x address', () => {
  assert.deepEqual(parseTailscaleStatus(status('Running').stdout), { state: 'Running', ip: '100.65.137.114' });
  assert.deepEqual(parseTailscaleStatus(status('Stopped').stdout).state, 'Stopped');
  assert.deepEqual(parseTailscaleStatus('not json'), { state: null, ip: null });
});

test('suggestedUpFlags takes only the flags Tailscale names, never anything else', () => {
  const refusal = `Error: changing settings via 'tailscale up' requires mentioning all\nnon-default flags. To proceed, either re-run your command with --reset or\nuse the command below to explicitly mention the current value of\nall non-default flags:\n\n\ttailscale up --timeout=30s --accept-routes\n`;
  assert.deepEqual(suggestedUpFlags(refusal), ['--accept-routes'], 'the timeout is ours, not one of his settings');
  assert.equal(suggestedUpFlags('tailscale up; rm -rf ~'), null);
  assert.equal(suggestedUpFlags('nothing to see'), null);
});

function harness(script, opts = {}) {
  const calls = [];
  const told = [];
  const events = [];
  let t = Date.parse('2026-10-26T14:00:00Z');
  const exec = async (args) => {
    calls.push(args.join(' '));
    const next = script(args, calls.length);
    return next;
  };
  const w = createTailnetWatch({
    exec, tell: async (m) => told.push(m), onUp: (ip) => events.push(`up ${ip}`), onDown: () => events.push('down'),
    now: () => t, log: () => {}, ...opts,
  });
  return { w, calls, told, events, advance: (ms) => { t += ms; } };
}

test('Running at boot binds the listener and says nothing', async () => {
  const h = harness(() => status('Running'));
  await h.w.tick();
  assert.deepEqual(h.events, ['up 100.65.137.114']);
  assert.equal(h.told.length, 0);
});

test('Stopped: the listener drops, Tailscale is turned back on with his own flags, and he is told when it is back', async () => {
  let state = 'Running';
  const h = harness((args) => {
    if (args[0] === 'status') return status(state);
    if (args[0] === 'up' && !args.includes('--accept-routes')) return { ok: false, stdout: '', stderr: '\ttailscale up --timeout=20s --accept-routes\n' };
    state = 'Running';
    return { ok: true, stdout: '', stderr: '' };
  });
  await h.w.tick();
  state = 'Stopped';
  h.advance(60_000);
  const r = await h.w.tick();
  assert.equal(r.action, 'up');
  assert.ok(h.calls.includes('up --timeout=20s --accept-routes'), 'the retry restates the flag Tailscale named');
  assert.deepEqual(h.events, ['up 100.65.137.114', 'down']);
  h.advance(60_000);
  await h.w.tick();
  assert.deepEqual(h.events, ['up 100.65.137.114', 'down', 'up 100.65.137.114'], 'bound again once it runs');
  assert.equal(h.told.length, 1);
  assert.match(h.told[0], /reachable from your phone again/);
});

test('a reconnect that fails is said plainly, once', async () => {
  const h = harness((args) => (args[0] === 'status' ? status('Stopped') : { ok: false, stdout: '', stderr: 'permission denied' }));
  await h.w.tick();
  h.advance(60_000);
  await h.w.tick();
  assert.equal(h.told.length, 1);
  assert.match(h.told[0], /Tailscale on the Mac is off and turning it back on failed \(permission denied\)/);
});

test('NeedsLogin is never "fixed" by code: he is told what only he can do', async () => {
  const h = harness((args) => (args[0] === 'status' ? status('NeedsLogin') : assert.fail('must not run tailscale up')));
  await h.w.tick();
  assert.match(h.told[0], /needs you to sign in again/);
});

test('NOVA_TAILNET_AUTOUP=0 keeps the telling and never runs up', async () => {
  const h = harness((args) => (args[0] === 'status' ? status('Stopped') : assert.fail('must not run tailscale up')), { autoUp: false });
  await h.w.tick();
  assert.match(h.told[0], /switched off/);
});
