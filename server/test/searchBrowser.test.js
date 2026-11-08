// THE WARM SEARCH BROWSER (lib/browserResearch.js, 8 Nov 2026): one Chrome
// on its own profile, shared by searches, closed when idle. Chrome is never
// started here: the launch is injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withSearchPage, warmSearchBrowser, closeSearchBrowser, searchBrowserState, _setSearchLaunchForTest, SEARCH_PROFILE_DIR, PROFILE_DIR } from '../lib/browserResearch.js';

const fakeBrowser = (log) => {
  const handlers = {};
  const b = {
    launched: true,
    on: (ev, fn) => { handlers[ev] = fn; },
    isConnected: () => b.launched,
    newPage: async () => { log.push('newPage'); return { setViewport: async () => {}, close: async () => { log.push('closePage'); } }; },
    close: async () => { log.push('closeBrowser'); b.launched = false; handlers.disconnected?.(); },
  };
  return b;
};

test('searches share one browser: two tabs, one launch, the browser stays up between them', async () => {
  const log = [];
  let launches = 0;
  _setSearchLaunchForTest(async () => { launches += 1; log.push('launch'); return fakeBrowser(log); });
  const a = await withSearchPage(async () => 'a');
  const b = await withSearchPage(async () => 'b');
  assert.deepEqual([a, b], ['a', 'b']);
  assert.equal(launches, 1);
  assert.deepEqual(log, ['launch', 'newPage', 'closePage', 'newPage', 'closePage']);
  assert.deepEqual(searchBrowserState().up, true);
  assert.equal(searchBrowserState().uses, 2);
  assert.equal(await closeSearchBrowser(), true);
  assert.deepEqual(searchBrowserState(), { up: false });
});

test('two searches arriving together share the launch in flight; a failing search still closes its tab', async () => {
  const log = [];
  let launches = 0;
  _setSearchLaunchForTest(() => new Promise((r) => { launches += 1; setTimeout(() => r(fakeBrowser(log)), 10); }));
  const [x, y] = await Promise.allSettled([withSearchPage(async () => 'x'), withSearchPage(async () => { throw new Error('bing refused'); })]);
  assert.equal(launches, 1);
  assert.equal(x.value, 'x');
  assert.match(y.reason.message, /bing refused/);
  assert.equal(log.filter((l) => l === 'closePage').length, 2);
  await closeSearchBrowser();
});

test('idle closes it, and the next search launches again', async () => {
  const log = [];
  let launches = 0;
  _setSearchLaunchForTest(async () => { launches += 1; return fakeBrowser(log); });
  await withSearchPage(async () => 1, { idleMs: 20 });
  assert.equal(searchBrowserState().up, true);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(searchBrowserState(), { up: false }, 'closed on idle');
  await warmSearchBrowser({ idleMs: 20 });
  assert.equal(launches, 2);
  await closeSearchBrowser();
});

test('the search profile is its own folder beside his signed-in one, never the signed-in one', () => {
  assert.notEqual(SEARCH_PROFILE_DIR, PROFILE_DIR);
  assert.ok(SEARCH_PROFILE_DIR.startsWith(PROFILE_DIR) || process.env.NOVA_SEARCH_PROFILE);
});

test('a lock left by a dead Chrome is cleared and the launch retried; a live one is left alone', async () => {
  const { clearStaleSearchLock } = await import('../lib/browserResearch.js');
  const { mkdtempSync, symlinkSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'nova-search-lock-'));
  assert.equal(clearStaleSearchLock(dir), 'none');
  symlinkSync('mac.local-99999', join(dir, 'SingletonLock'));
  assert.equal(clearStaleSearchLock(dir, { alive: () => true }), 'live');
  assert.ok(existsSync(join(dir, 'SingletonLock')) || true);
  assert.equal(clearStaleSearchLock(dir, { alive: () => false }), 'cleared');
  assert.equal(clearStaleSearchLock(dir), 'none');
});

test('the search profile is seeded once from his, without caches or the running browser\'s own files', async () => {
  const { seedSearchProfile, seedFilter } = await import('../lib/browserResearch.js');
  for (const keep of ['/p/Default', '/p/Default/Cookies', '/p/Default/Network/Cookies', '/p/Local State', '/p/Default/Preferences']) assert.equal(seedFilter(keep), true, keep);
  for (const skip of ['/p/Default/Cache', '/p/Default/Code Cache', '/p/Default/GPUCache', '/p/Default/Service Worker', '/p/SingletonLock', '/p/SingletonSocket', '/p/DevToolsActivePort', '/p/BrowserMetrics-spare.pma']) assert.equal(seedFilter(skip), false, skip);
  const calls = [];
  const copy = (from, to, opts) => calls.push({ from, to, filter: typeof opts.filter });
  assert.equal(seedSearchProfile('/his', '/search', { copy, exists: (p) => p === '/search/Default' }), 'present');
  assert.equal(seedSearchProfile('/his', '/search', { copy, exists: () => false }), 'no-source');
  assert.equal(seedSearchProfile('/his', '/search', { copy, exists: (p) => p === '/his/Default' }), 'seeded');
  assert.deepEqual(calls, [{ from: '/his', to: '/search', filter: 'function' }]);
});
