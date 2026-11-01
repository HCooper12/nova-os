// APPLY ALL / DISCARD ALL FOR A GROUP (1 Nov 2026). No new write path: each
// member goes through the SAME per-record route a single tick or cross uses
// (POST /api/inbox/:id/approve or /discard), one after another, in the order
// src/inboxGroups.js decided, and the run stops at the first refusal. So
// every filing keeps its own undo on the rails, nothing is skipped, and a
// child is never sent before the card that creates its day.
//
// Not optimistic: a member counts as done only when the server hands back
// its record, and that record replaces the one in the list. The run's state
// (state.inboxGroupRun[key]) is what the group card reports from.
import { api as realApi, getConnection as realConnection } from './api.js';
import { upsertInboxRecord } from './inboxSummaryFacts.js';

export async function runInboxGroup(app, { key, ids = [], kind = 'approve', reason } = {}, deps = {}) {
  const api = deps.api || realApi;
  const conn = (deps.getConnection || realConnection)();
  if (!conn || !key || !ids.length) return null;
  const prior = (app.state.inboxGroupRun || {})[key];
  if (prior?.running) return prior; // one run per group at a time
  const run = { kind, total: ids.length, done: [], failed: null, running: true, at: Date.now() };
  const put = (patch) => app.setState((s) => ({ inboxGroupRun: { ...(s.inboxGroupRun || {}), [key]: { ...run, ...patch } } }));
  put({});
  for (const id of ids) {
    app.setState((s) => ({ inboxActionBusy: { ...(s.inboxActionBusy || {}), [id]: true } }));
    try {
      const { record } = kind === 'discard' ? await api.inboxDiscard(conn, id, reason) : await api.inboxApprove(conn, id);
      app.noteLocalWrite?.('inbox');
      run.done = [...run.done, id];
      app.setState((s) => ({
        inboxActionBusy: { ...(s.inboxActionBusy || {}), [id]: false },
        liveInbox: record ? upsertInboxRecord(s.liveInbox, record) : s.liveInbox,
      }));
      put({});
    } catch (e) {
      run.failed = { id, error: String(e?.message || e || 'it did not go through') };
      app.setState((s) => ({ inboxActionBusy: { ...(s.inboxActionBusy || {}), [id]: false } }));
      break;
    }
  }
  run.running = false;
  put({});
  // the truth wins: re-read the Inbox once the run ends, whatever happened
  app.refreshInbox?.();
  return run;
}
