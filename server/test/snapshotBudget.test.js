// The snapshot's per-slice time budget: the whole sync used to wait on its
// slowest slice (a cold CalDAV calendar — live-log measured p50 ~5s), so the
// budget is the structural guarantee that one slow source can never hold
// every other slice hostage again. A slice that misses the budget arrives
// absent with errors[key]='budget'; the client keeps its cached copy and
// fetches the straggler individually.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { snapshotRouter } from '../routes/snapshot.js';

const TOKEN = 'snap-test-token';

// A stand-in origin serving the same paths the snapshot self-proxies to:
// /api/notes answers instantly; /api/calendar/today hangs far past the
// budget; everything else 404s (which must land in errors, not crash).
function startOrigin() {
  return new Promise((resolve) => {
    const app = express();
    app.get('/api/notes', (req, res) => res.json({ notes: [{ id: 'n1' }] }));
    app.get('/api/calendar/today', (req, res) => {
      const t = setTimeout(() => res.json({ events: [] }), 30_000);
      t.unref?.(); // the hang is the test fixture — it must not outlive the test
    });
    const srv = app.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      app.use('/api', snapshotRouter({ port, token: TOKEN }));
      resolve({ srv, port });
    });
  });
}

test('a slice that blows the budget is reported, not waited for — the rest still land', async (t) => {
  const { srv, port } = await startOrigin();
  // closeAllConnections too: the budget-missed slice's fetch is still in
  // flight by design (it keeps warming the server cache in production) —
  // in the test it would hold the process for its full 15s abort window.
  t.after(() => { srv.closeAllConnections?.(); srv.close(); });

  const started = Date.now();
  const r = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
  const took = Date.now() - started;
  const { slices, errors } = await r.json();

  assert.ok(slices.notes, 'the fast slice landed');
  assert.deepEqual(slices.notes, { notes: [{ id: 'n1' }] });
  assert.equal(slices.calendar, undefined, 'the slow slice is absent, never a partial/null payload');
  assert.equal(errors.calendar, 'budget', 'and its absence is named, not silent');
  assert.ok(took < 10_000, `the snapshot returned near the budget, not the slow slice's 30s (took ${took}ms)`);
  assert.ok(Object.keys(errors).length > 2, '404 slices land in errors too, not as crashes');
});
