// The ingest review flow he recorded on 12 Oct: a "Ready for review" row
// that re-ran a fake "Preparing a scratch copy" for 6+ s, a tray that stayed
// over the sheet and ate every scroll, the same job listed twice, and a close
// that silently discarded a finished proposal. These are wiring faults in
// client source, so they are checked as source (the jobClock.test.js pattern).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFile(path.join(root, 'src', p), 'utf8');
const method = (file, name) => {
  const at = file.indexOf(`\n  ${name}(`);
  assert.ok(at >= 0, `${name} not found`);
  return file.slice(at, file.indexOf('\n  }\n', at));
};

test('a tray row tap closes the tray before doing anything else', async () => {
  const chrome = await src('MobileChrome.jsx');
  const vals = await src('vals/valsChrome.js');
  assert.match(chrome, /onClick=\{\(\) => v\.jobTray\.pick\(j\)\}/, 'tray rows must go through jobTray.pick');
  assert.doesNotMatch(chrome, /onClick=\{j\.go \|\| v\.jobTray\.goInbox\}/);
  const pick = vals.slice(vals.indexOf('pick: (j) =>'), vals.indexOf('pick: (j) =>') + 200);
  assert.match(pick, /jobTrayOpen: false/, 'pick must close the tray');
});

test('the loaded ingest job is not listed a second time from the server list', async () => {
  const vals = await src('vals/valsChrome.js');
  const loop = vals.slice(vals.indexOf('for (const j of (st.liveIngestJobs'), vals.indexOf("if (j.status === 'ready')", vals.indexOf('for (const j of (st.liveIngestJobs')));
  assert.match(loop, /j\.id === st\.ingestJobId/);
});

test('opening a job reads it now instead of pretending to stage a vault', async () => {
  const app = await src('App.jsx');
  const open = method(app, 'openIngestJob');
  assert.doesNotMatch(open, /ingestStatus: 'staging'/);
  assert.match(open, /api\.ingestJob\(conn, jobId\)/, 'must fetch immediately, not wait for the poller');
  const sheet = await src('IngestReview.jsx');
  assert.match(sheet, /v\.ingestStatus === 'opening'/, 'the sheet must draw the opening state, not an error');
});

test('closing a ready review never discards it', async () => {
  const app = await src('App.jsx');
  assert.doesNotMatch(method(app, 'closeIngestReview'), /discardIngest|api\.discardIngest/);
});
