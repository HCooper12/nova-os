import { api, getConnection } from './api.js';
import { notify } from './island.js';
import { RECEIPT_MS } from './receipt.js';
import { depthOf } from './edgeBack.js';
import { reviewFiles, startOfToday, plural, WORKSPACE_PROJECT, projectInfo } from './codeModel.js';

// THE CODE SCREEN'S WRITES (round 3, mockup 89). Every one goes to a route
// that does what it says, proven against a temporary repository in
// server/test/codeActionsReal.test.js: Commit takes only the ticked paths,
// Undo resets an unpushed commit Nova made, Shelve and Restore round-trip
// the working tree by the shelf's own sha. Each write is acted out on the
// page (the receipt, Nova's line in Runs) and confirmed by the island's pill
// with Undo (his call, 9 Oct 2026: a pill with Undo on every write).
//
// `io` is the live API. In a dev build only, an invented in-memory stand-in
// (src/dev/codeFixtures.js) can take its place so the screen can be looked
// at and recorded without a Mac; a production build never carries it.

export const SWITCH_UNDO_MS = 8000;
const titleOf = (ws) => projectInfo(WORKSPACE_PROJECT[ws] || 'nova').title;

function io(app) {
  const conn = getConnection();
  if (conn) {
    return {
      workspaces: () => api.codeWorkspaces(conn),
      changes: (ws, sid) => api.codeChanges(conn, ws, sid),
      fileDiff: (ws, p) => api.codeFileDiff(conn, ws, p),
      commits: (ws, since) => api.codeCommits(conn, ws, since),
      commit: (ws, msg, paths) => api.codeCommit(conn, ws, msg, paths),
      undo: (ws, sha) => api.codeUndoCommit(conn, ws, sha),
      shelve: (ws, paths) => api.codeShelve(conn, ws, paths),
      unshelve: (ws, sha) => api.codeUnshelve(conn, ws, sha),
    };
  }
  if (import.meta.env.DEV && app.codeSim) return app.codeSim;
  return null;
}
export const codeLive = (app) => !!io(app);

// THE PILL WITH UNDO (his call, 9 Oct 2026), one per write. The shared tick
// receipt (src/receipt.js) folds rapid ticks into "3 ticked"; a commit, a
// shelf and a restore are different acts with different ways back, so each
// gets its own pill on the same island, at the tick receipt's length.
function pill({ key, title, undo }) {
  notify({
    id: `code-${key}`, replace: true, oneLine: true, tone: 'done', title, duration: RECEIPT_MS,
    ...(undo ? { action: { label: 'Undo', run: undo } } : {}),
  });
}
const ticksFor = (st, ws) => (st.codeTicks && st.codeTicks[ws]) || {};
// each workspace keeps its own commit message: words typed for Wren never
// land on a Nova OS commit
export const msgFor = (st, ws) => (st.codeCommitMsgs && st.codeCommitMsgs[ws]) || '';
const withMsg = (s, ws, msg) => ({ codeCommitMsgs: { ...(s.codeCommitMsgs || {}), [ws]: msg } });

/** Is this workspace one the server can read? Nova OS and the Vault always; the rest when it names them. */
export function knownWorkspace(st, ws) {
  if (ws === 'repo' || ws === 'vault') return true;
  return (st.codeWorkspaces || []).some((w) => w.key === ws);
}
/** The workspaces a commit can land in, as the server names them. */
export function writableWorkspaces(st) {
  return ['repo', ...(st.codeWorkspaces || []).filter((w) => !w.readOnly && w.key !== 'repo' && w.key !== 'vault').map((w) => w.key)];
}

// ------------------------------------------------------------- reading

export function refreshChanges(app, ws = app.state.codeWorkspace) {
  const x = io(app);
  if (!x) return Promise.resolve();
  const sid = ws === app.state.codeWorkspace ? app.state.codeSessionId : null;
  return x.changes(ws, sid).then((c) => {
    app.setState((s) => ({
      codeChangesBy: { ...(s.codeChangesBy || {}), [ws]: c },
      codeSeenAt: Date.now(),
      codeAway: false,
      ...(ws === s.codeWorkspace ? { codeChanges: c } : {}),
    }));
  }).catch((e) => {
    // a status is an answer from the Mac (a refusal); no status means the
    // request never got one, so the Mac is out of reach
    const away = !e?.status;
    app.setState((s) => ({ codeAway: away || s.codeAway, codeChangesError: e?.message || 'could not read the changes' }));
  });
}

export function refreshCommits(app) {
  const x = io(app);
  if (!x) return Promise.resolve();
  // every workspace at once; an older server reads 'all' as Nova OS, so a
  // commit with no workspace on it is Nova OS's
  return x.commits('all', startOfToday()).then(({ commits }) => app.setState((s) => {
    const r = s.codeReceipt;
    // the receipt stays while Undo can still reach its commit
    const still = r ? (commits || []).find((c) => c.sha === r.fullSha) : null;
    return { codeCommits: (commits || []).map((c) => ({ ...c, workspace: c.workspace || 'repo' })), ...(r && (!still || !still.canUndo) ? { codeReceipt: null } : {}) };
  })).catch(() => {});
}

/** Everything the screen reads, on arrival and after every write. */
export function loadCode(app) {
  if (!codeLive(app)) return;
  refreshChanges(app, 'repo');
  refreshChanges(app, 'vault');
  refreshCommits(app);
  // Science Atlas and Wren, when the server names them; an older server has
  // no list, and their pages then say plainly they are not connected
  const x = io(app);
  if (x?.workspaces) {
    x.workspaces().then(({ workspaces }) => {
      const list = Array.isArray(workspaces) ? workspaces : [];
      app.setState({ codeWorkspaces: list });
      for (const w of list) if (w.key !== 'repo' && w.key !== 'vault') refreshChanges(app, w.key);
    }).catch(() => app.setState((s) => (s.codeWorkspaces ? null : { codeWorkspaces: [] })));
  }
  if (getConnection()) {
    app.startMacSessionsPoll();
    app.refreshForge();
    // the model labels are the CLI's own (modelWatch via the model board),
    // never typed here; read them if the boot snapshot has not yet
    if (app.state.liveModelPrefs == null) app.loadModelPrefs();
  }
}

export function showFileLines(app, ws, path) {
  const key = `${ws}:${path}`;
  const open = { ...(app.state.codeOpenFiles || {}) };
  if (open[key]) { delete open[key]; app.setState({ codeOpenFiles: open }); return; }
  open[key] = { loading: true, lines: [] };
  app.setState({ codeOpenFiles: open });
  const x = io(app);
  if (!x) return;
  x.fileDiff(ws, path).then((d) => app.setState((s) => ({ codeOpenFiles: { ...(s.codeOpenFiles || {}), [key]: { lines: d.lines || [], more: d.more || 0, binary: !!d.binary } } })))
    .catch((e) => app.setState((s) => ({ codeOpenFiles: { ...(s.codeOpenFiles || {}), [key]: { lines: [], error: e.message } } })));
}

export function toggleFile(app, ws, path) {
  app.setState((s) => {
    const rows = reviewFiles((s.codeChangesBy?.[ws] || {}).files, ticksFor(s, ws));
    const f = rows.find((r) => r.path === path);
    if (!f) return null;
    return { codeTicks: { ...(s.codeTicks || {}), [ws]: { ...ticksFor(s, ws), [path]: !f.ticked } } };
  });
}

// ------------------------------------------------------------- writes

const tickedPaths = (st, ws) => reviewFiles((st.codeChangesBy?.[ws] || {}).files, ticksFor(st, ws)).filter((f) => f.ticked).map((f) => f.path);

// with no workspace named (an older caller, a voice verb), the commit goes
// where the Builder works, when that is somewhere a commit can land
const defaultWs = (st) => (writableWorkspaces(st).includes(st.codeWorkspace) ? st.codeWorkspace : 'repo');

export function commit(app, { ws: wsGiven, paths: given, message: msgGiven, receipt = true } = {}) {
  const st = app.state;
  const ws = wsGiven || defaultWs(st);
  const x = io(app);
  if (!x || st.codeChangeBusy) return Promise.resolve(false);
  const message = (msgGiven ?? msgFor(st, ws)).trim();
  const paths = given || tickedPaths(st, ws);
  if (!paths.length) return Promise.resolve(false);
  const rows = reviewFiles((st.codeChangesBy?.[ws] || {}).files, ticksFor(st, ws));
  app.setState({ codeChangeBusy: true });
  return x.commit(ws, message, paths).then((r) => {
    const leftOut = r.leftOut || [];
    app.setState((s) => ({
      codeChangeBusy: false,
      ...withMsg(s, ws, ''),
      codeReceipt: { ws, sha: r.sha, fullSha: r.fullSha, files: r.files, message: r.message, leftOut, rows, at: Date.now() },
      codeTicks: { ...(s.codeTicks || {}), [ws]: {} },
      codeChat: ws === s.codeWorkspace ? [...s.codeChat, { at: Date.now(), who: 'system', kind: 'commit', sha: r.fullSha, ws, text: `Committed ${r.sha} · ${plural(r.files, 'file')}. Not pushed, so Undo can still take it back.` }] : s.codeChat,
    }));
    if (receipt) pill({ key: `commit:${r.fullSha}`, title: ws === 'repo' ? `Committed ${r.sha} · ${plural(r.files, 'file')}` : `Committed ${r.sha} in ${titleOf(ws)}`, undo: () => undoCommit(app, r.fullSha, ws) });
    refreshChanges(app, ws);
    refreshCommits(app);
    return true;
  }).catch((e) => {
    app.setState({ codeChangeBusy: false });
    notify({ title: 'Nothing was committed', message: e.message, tone: 'warn' });
    return false;
  });
}

export function undoCommit(app, fullSha, wsGiven) {
  const x = io(app);
  if (!x || !fullSha) return;
  const st = app.state;
  const known = (st.codeCommits || []).find((c) => c.sha === fullSha) || (st.codeReceipt?.fullSha === fullSha ? st.codeReceipt : null);
  const ws = wsGiven || known?.workspace || known?.ws || 'repo';
  app.setState({ codeChangeBusy: true });
  x.undo(ws, fullSha).then((r) => {
    app.setState((s) => ({
      codeChangeBusy: false,
      codeReceipt: s.codeReceipt?.fullSha === fullSha ? null : s.codeReceipt,
      // the review comes back as it was, his words included
      ...withMsg(s, ws, msgFor(s, ws) || known?.message || ''),
      codeChat: ws === s.codeWorkspace ? [...s.codeChat, { at: Date.now(), who: 'system', kind: 'undo', text: `Undid ${r.sha}. The ${plural(r.files, 'file')} ${r.files === 1 ? 'is' : 'are'} back as ${r.files === 1 ? 'it was' : 'they were'}, uncommitted.` }] : s.codeChat,
    }));
    // the pill's own Undo commits the same files again with the same words
    const message = known?.message;
    pill({ key: `undo:${fullSha}`, title: `Took back ${r.sha} in ${titleOf(ws)}`, undo: message ? () => commit(app, { ws, paths: r.paths, message, receipt: true }) : undefined });
    refreshChanges(app, ws);
    refreshCommits(app);
  }).catch((e) => {
    app.setState({ codeChangeBusy: false });
    notify({ title: 'The commit stays', message: e.message, tone: 'warn' });
    refreshCommits(app);
  });
}

export function shelve(app, { ws: wsGiven, paths: given } = {}) {
  const st = app.state;
  const ws = wsGiven || defaultWs(st);
  const x = io(app);
  if (!x || st.codeChangeBusy) return;
  const paths = given || tickedPaths(st, ws);
  if (!paths.length) return;
  app.setState({ codeChangeBusy: true });
  x.shelve(ws, paths).then((r) => {
    const line = { at: Date.now(), who: 'system', kind: 'shelf', ws, sha: r.sha, files: r.files, paths: r.paths, text: `Shelved ${plural(r.files, 'file')}. Nothing lost.` };
    app.setState((s) => ({
      codeChangeBusy: false,
      codeShelf: { ...r, ws },
      codeShelves: [line, ...(s.codeShelves || [])].slice(0, 20),
      codeTicks: { ...(s.codeTicks || {}), [ws]: {} },
      codeChat: ws === s.codeWorkspace ? [...s.codeChat, line] : s.codeChat,
    }));
    pill({ key: `shelf:${r.sha}`, title: `Shelved ${plural(r.files, 'file')} in ${titleOf(ws)}`, undo: () => restore(app, r.sha, ws) });
    refreshChanges(app, ws);
  }).catch((e) => {
    app.setState({ codeChangeBusy: false });
    notify({ title: 'Nothing was shelved', message: e.message, tone: 'warn' });
  });
}

export function restore(app, sha, wsGiven) {
  const x = io(app);
  if (!x || !sha) return;
  const st = app.state;
  const line = [...(st.codeChat || []), ...(st.codeShelves || [])].find((m) => m.kind === 'shelf' && m.sha === sha);
  const ws = wsGiven || line?.ws || (st.codeShelf?.sha === sha ? st.codeShelf.ws : null) || 'repo';
  app.setState({ codeChangeBusy: true });
  x.unshelve(ws, sha).then(() => {
    const n = line?.files || 0;
    app.setState((s) => ({
      codeChangeBusy: false,
      codeShelf: s.codeShelf?.sha === sha ? null : s.codeShelf,
      codeShelves: (s.codeShelves || []).filter((m) => m.sha !== sha),
      codeChat: [...s.codeChat.map((m) => (m.kind === 'shelf' && m.sha === sha ? { ...m, restored: true } : m)),
        ...(ws === s.codeWorkspace ? [{ at: Date.now(), who: 'system', kind: 'restore', text: n ? `Restored ${plural(n, 'file')} from the shelf.` : 'Restored the shelf.' }] : [])],
    }));
    pill({ key: `restore:${sha}`, title: n ? `Restored ${plural(n, 'file')}` : 'Restored the shelf', undo: line?.paths ? () => shelve(app, { ws, paths: line.paths }) : undefined });
    refreshChanges(app, ws);
  }).catch((e) => {
    app.setState({ codeChangeBusy: false });
    notify({ title: 'Nothing was restored', message: e.message, tone: 'warn' });
  });
}

// ------------------------------------------------------------- runs

// A switch or a new session keeps the conversation: it moves into Runs as a
// closed run, and Undo brings it back for 8 seconds (his call 6 on mockup 89).
function closeRun(app, patch, title) {
  const st = app.state;
  app.stopPoll('code');
  const had = (st.codeChat || []).length > 0;
  const run = had ? { id: `run-${Date.now()}`, workspace: st.codeWorkspace, sessionId: st.codeSessionId, chat: st.codeChat, endedAt: Date.now() } : null;
  const before = { codeWorkspace: st.codeWorkspace, codeSessionId: st.codeSessionId, codeChat: st.codeChat };
  app.setState((s) => ({ ...patch, codeSessionId: null, codeChat: [], codeBusy: false, codeReceipt: null, codeRuns: run ? [run, ...(s.codeRuns || [])].slice(0, 12) : (s.codeRuns || []) }));
  if (patch.codeWorkspace && patch.codeWorkspace !== st.codeWorkspace) refreshChanges(app, patch.codeWorkspace);
  if (!had && !patch.codeWorkspace) return;
  notify({
    id: 'code-run-closed', replace: true, oneLine: true, tone: 'done', title, duration: SWITCH_UNDO_MS,
    action: {
      label: 'Undo',
      run: () => app.setState((s) => ({ ...before, codeRuns: run ? (s.codeRuns || []).filter((r) => r.id !== run.id) : s.codeRuns })),
    },
  });
}

export function switchWorkspace(app, ws) {
  const st = app.state;
  if (ws === st.codeWorkspace) return true;
  if (st.codeBusy || st.sparBusy) {
    notify({ title: 'The Builder is still working', message: `It moves to ${projectInfo(WORKSPACE_PROJECT[ws]).title} when this run finishes.`, tone: 'warn' });
    return false;
  }
  closeRun(app, { codeWorkspace: ws }, `The Builder works in ${projectInfo(WORKSPACE_PROJECT[ws]).title} now`);
  return true;
}

export function newSession(app) {
  closeRun(app, {}, 'A new session. The last one is in Runs');
}

// ------------------------------------------------------------- pages

// Each project page is a history entry of its own (as Settings' pages are),
// so the back swipe and the browser's Back return to the root.
export function openProject(app, key, section = null) {
  const ws = PROJECT_WS[key];
  if (ws && knownWorkspace(app.state, ws)) switchWorkspace(app, ws);
  if (typeof window !== 'undefined' && app.state.codeProject !== key) {
    const h = window.history.state;
    if (h?.novaView === 'code' && h.codeProject) window.history.replaceState({ ...h, codeProject: key }, '');
    else window.history.pushState({ novaDepth: depthOf(h) + 1, novaView: 'code', codeProject: key }, '');
  }
  app.setState({ codeProject: key, codeSection: section, codeSheet: false });
}
const PROJECT_WS = { nova: 'repo', vault: 'vault', atlas: 'atlas', wren: 'wren' };

export function closeProject(app) {
  const h = typeof window === 'undefined' ? null : window.history.state;
  if (h?.novaView === 'code' && h.codeProject) { window.history.back(); return; }
  app.setState({ codeProject: null, codeSection: null, codeSheet: false });
}

/** popstate's half: the page follows the history entry. */
export function codeFromHistory(app, screen) {
  const h = typeof window === 'undefined' ? null : window.history.state;
  const want = screen === 'code' && h?.novaView === 'code' ? (h.codeProject || null) : null;
  if ((app.state.codeProject || null) === want) return {};
  return { codeProject: want, codeSection: null, codeSheet: false };
}
