// DEV ONLY. Invented state for looking at the Code screen without a Mac:
// the mockup's demo data, the worst realistic case (break-ui), an empty
// Mac, one of everything, the Mac out of reach, and loading. It is reached
// only through App.setCodeFixture, which returns early unless
// import.meta.env.DEV, so a production build never loads this file.
//
// The stand-in for the server (app.codeSim) keeps the same contract as the
// real routes, including the refusals (the 8-character rule, a path that is
// not changed), so the screen's acting out can be recorded end to end. It is
// NOT the proof that the actions work: that is server/test/
// codeActionsReal.test.js, against a temporary git repository.

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const hex = (n = 40) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const at = (hh, mm) => { const d = new Date(); d.setHours(hh, mm, 0, 0); return d.getTime(); };

function session(name, state, { quietMs = 0, startedAgo = 'about 40 minutes ago', canClose, folder, kind = 'interactive', quote } = {}) {
  const quietAgo = quietMs < 90_000 ? 'just now' : quietMs < 90 * MIN ? `about ${Math.round(quietMs / MIN)} minutes ago` : quietMs < 36 * HOUR ? `about ${Math.round(quietMs / HOUR)} hours ago` : `about ${Math.round(quietMs / DAY)} days ago`;
  const plain = { working: 'Working now.', waiting: 'Waiting for you: it has something to say or a question.', blocked: 'Stuck and needs you.', 'left-open': `Left open. Nothing has happened in it for ${quietAgo.replace(/^about /, '').replace(/ ago$/, '')}.`, gone: 'Finished a while ago and cannot be reopened. Safe to clear.' }[state];
  return {
    sessionId: hex(8) + '-' + hex(4) + '-4' + hex(3) + '-8' + hex(3) + '-' + hex(12), kind, name, state, plain, quietAgo, startedAgo, quietMs,
    lastAt: Date.now() - quietMs, project: { key: folder, label: folder }, canShow: state !== 'gone', canClose: canClose ?? (state === 'left-open' || state === 'gone'),
    // the server's own shape (lib/sessionQuote.js): one scrubbed line and when
    quote: quote === undefined ? null : { text: quote, at: Date.now() - quietMs, model: 'claude-opus-5-5' },
  };
}
const group = (folder, label, sessions) => ({ project: { key: folder, label }, summary: '', sessions: sessions.map((s) => ({ ...s, project: { key: folder, label } })) });

function file(path, added, removed, extra = {}) {
  const slash = path.lastIndexOf('/');
  return { path, name: path.slice(slash + 1), dir: slash >= 0 ? path.slice(0, slash + 1) : '', status: extra.untracked ? '??' : 'M', untracked: false, deleted: false, binary: false, added, removed, other: null, mine: true, from: null, ...extra };
}

const DEMO_FILES = () => [
  file('src/sheets/TideSheet.jsx', 71, 0, { untracked: true, status: '??' }),
  file('src/screens/Harbour.jsx', 46, 22),
  file('server/test/tideSheet.test.js', 17, 1),
  file('src/lanterns.js', 3, 1, { other: { sessionId: 'another-session' }, mine: false }),
];
const ATLAS_FILES = () => [
  file('chapters/04-tides.md', 38, 6),
  file('REDESIGN-BRIEF.md', 54, 0, { untracked: true, status: '??', other: { sessionId: 'another-session' }, mine: false }),
];
const WREN_FILES = () => [file('lib/sources.mjs', 12, 3)];
const WORKSPACES = [
  { key: 'repo', title: 'Nova OS', parent: null, readOnly: false },
  { key: 'vault', title: 'Vault', parent: null, readOnly: true },
  { key: 'atlas', title: 'Science Atlas', parent: null, readOnly: false },
  { key: 'wren', title: 'Wren', parent: 'atlas', readOnly: false },
];
const DEMO_PEEK = { path: 'src/sheets/TideSheet.jsx', lines: ['export function TideSheet({ value, onSave }) {', '  const [draft, setDraft] = useState(value);', '  const clearing = draft === "";'], more: 68 };

function chatDemo(live) {
  const shelfSha = hex();
  return [
    { at: at(9, 20), who: 'system', kind: 'shelf', sha: shelfSha, files: 2, paths: ['src/tides.js', 'src/moon.js'], text: 'Shelved 2 files. Nothing lost.' },
    { at: at(9, 41), who: 'you', text: 'The tide sheet should ask before it clears a value.' },
    { at: at(9, 45), who: 'claude', model: 'sonnet', startedAt: at(9, 41), endedAt: at(9, 45), files: 3, text: 'Done. Clearing now asks first, and a cleared value comes back with Undo.' },
    { at: at(9, 55), who: 'breaker', startedAt: at(9, 52), endedAt: at(9, 55), text: '1. An empty value still clears without asking.\n2. Undo is lost if the sheet closes.' },
    { at: at(9, 58), who: 'you', text: 'Fix both.' },
    live
      ? { who: 'claude', streaming: true, text: 'Reading the sheet again. An empty value will ask first' }
      : { at: at(10, 1), who: 'claude', model: 'sonnet', startedAt: at(9, 58), endedAt: at(10, 1), files: 2, text: 'Fixed. An empty value asks first, and Undo survives the sheet closing.' },
  ];
}

const DEMO_PIC = () => ({
  at: new Date().toISOString(), summary: '',
  groups: [
    group('atlas-partner', 'Wren', [session('Reading-list sweep', 'waiting', { quietMs: 6 * MIN, folder: 'atlas-partner', quote: 'Three of the twelve sources on the list are paywalled. Shall I mark them as read-later and carry on with the other nine?' }), session('Source check, chapter 4', 'working', { startedAgo: 'about 20 minutes ago', folder: 'atlas-partner' })]),
    group('nova-os', 'Nova', [session('Harbour copy pass', 'working', { folder: 'nova-os' }), session('Old tide experiment', 'left-open', { quietMs: 14 * HOUR, folder: 'nova-os' })]),
    group('Atomic_Hub', 'Science Atlas', [session('Chapter map draft', 'left-open', { quietMs: 15 * HOUR, folder: 'Atomic_Hub' })]),
  ],
});

function worstFiles() {
  const dirs = ['src/', 'src/screens/', 'server/lib/', 'server/test/', 'src/vals/', 'design/mockups/'];
  const files = [];
  for (let i = 0; i < 60; i++) {
    const d = dirs[i % dirs.length];
    files.push(file(`${d}${['harbourTideSheetController', 'lantern', 'x', 'moonPhaseCalculatorWithAVeryDescriptiveName', 'a'][i % 5]}${i}.${['jsx', 'js', 'test.js', 'css'][i % 4]}`, (i * 37) % 900, (i * 13) % 140, i % 7 === 3 ? { other: { sessionId: 'another-session' }, mine: false } : {}));
  }
  const long = 'src/' + Array.from({ length: 9 }, (_, i) => `deeply-nested-feature-folder-${i}`).join('/') + '/AnUnreasonablyLongComponentNameThatSomeoneActuallyWrote.jsx';
  files.unshift(file(long.slice(0, 300), 1200, 0, { untracked: true, status: '??' }));
  files.splice(2, 0, file('public/icons/harbour-hero@3x.png', 0, 0, { binary: true }));
  files.splice(3, 0, file('src/old/Removed.jsx', 0, 412, { deleted: true, status: 'D' }));
  return files;
}

const PRESETS = {
  demo: () => ({ files: DEMO_FILES(), peek: DEMO_PEEK, pic: DEMO_PIC(), chat: chatDemo(true), busy: true, commits: [{ sha: hex(), short: '91b0d2e', at: at(10, 12) - DAY / 2, files: 2, message: 'Harbour copy reads in his words', pushed: false, head: false, canUndo: false, undone: false }] }),
  idle: () => ({ files: DEMO_FILES(), peek: DEMO_PEEK, pic: DEMO_PIC(), chat: chatDemo(false), busy: false, commits: [] }),
  worst: () => ({
    files: worstFiles(), peek: { path: worstFiles()[0].path, lines: ['import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react"; // and a comment that runs on and on'], more: 1199 },
    pic: {
      at: new Date().toISOString(), summary: '',
      groups: [
        group('nova-os', 'Nova', [session('A session whose name somebody typed as a whole paragraph describing everything it was meant to do today', 'waiting', { quietMs: 3 * DAY, folder: 'nova-os' })]),
        group('Atomic_Hub', 'Science Atlas', Array.from({ length: 6 }, (_, i) => session(`Chapter ${i + 1}`, i % 2 ? 'left-open' : 'working', { quietMs: (i + 13) * HOUR, folder: 'Atomic_Hub' }))),
        group('a-folder-with-an-extraordinarily-long-project-name-from-a-client', 'a folder with an extraordinarily long project name from a client', [session('x', 'blocked', { quietMs: 2 * HOUR, folder: 'a-folder-with-an-extraordinarily-long-project-name-from-a-client', kind: 'background' })]),
      ],
    },
    chat: [
      { at: at(8, 2), who: 'you', text: 'Refactor_everything_in_src_screens_including_the_files_with_names_like_ThisVeryLongComponentNameThatNeverBreaksAnywhere.jsx please' },
      { at: at(8, 30), who: 'claude', model: 'claude-fable-9-9-20991231', startedAt: at(8, 2), endedAt: at(9, 40), files: 147, text: 'Done.\n\n' + 'A long paragraph. '.repeat(40) },
      { at: at(9, 50), who: 'breaker', startedAt: at(9, 40), endedAt: at(9, 50), text: 'Verdict.\n' + Array.from({ length: 14 }, (_, i) => `${i + 1}. Finding number ${i + 1} at src/screens/AVeryLongFileName${i}.jsx:${i * 100}`).join('\n') },
    ],
    busy: false,
    commits: Array.from({ length: 5 }, (_, i) => ({ sha: hex(), short: hex(7), at: at(8 + i, 5), files: i ? i * 12 : 1, message: 'm', pushed: i < 2, head: i === 4, canUndo: i === 4, undone: false })),
  }),
  empty: () => ({ files: [], peek: null, pic: { at: new Date().toISOString(), summary: 'Nothing is running.', groups: [] }, chat: [], busy: false, commits: [] }),
  one: () => ({ files: [file('README.md', 1, 0)], peek: { path: 'README.md', lines: ['One line.'], more: 0 }, pic: { at: new Date().toISOString(), summary: '', groups: [group('nova-os', 'Nova', [session('One', 'waiting', { quietMs: 1 * MIN, folder: 'nova-os' })])] }, chat: [{ at: at(9, 0), who: 'you', text: 'One.' }], busy: false, commits: [{ sha: hex(), short: hex(7), at: at(9, 1), files: 1, message: 'One file', pushed: false, head: true, canUndo: true, undone: false }] }),
  // break-ui on the quote: a 2,000-character message (the server caps at
  // 280; this checks the screen holds even if it did not), a code block's
  // trace, emoji, an empty message (no quote, the plain line instead), and
  // one unbreakable path
  quotes: () => ({
    ...PRESETS.idle(),
    pic: {
      at: new Date().toISOString(), summary: '',
      groups: [
        group('Atomic_Hub', 'Science Atlas', [
          session('Mission Control redesign', 'waiting', { quietMs: 3 * MIN, folder: 'Atomic_Hub', quote: ('The brief is drafted and the checklist has 41 lines. Before I touch the map itself I need one call from you: should the queue live under the map or beside it? '.repeat(14)).slice(0, 2000) }),
          session('Chapter map draft', 'blocked', { quietMs: 22 * MIN, folder: 'Atomic_Hub', quote: 'Here is the change: [code] Shall I apply it to all six chapters, or only to chapter 4 first?' }),
        ]),
        group('atlas-partner', 'Wren', [
          session('Reading-list sweep', 'waiting', { quietMs: 2 * HOUR, folder: 'atlas-partner', quote: 'Done 🎉🧪📚 Twelve sources checked ✅, three paywalled 🔒. Keep going? 🙂' }),
          session('Source check, chapter 4', 'waiting', { quietMs: 40 * MIN, folder: 'atlas-partner', quote: '' }),
        ]),
        group('nova-os', 'Nova', [
          session('A session with a very long path in its last words', 'waiting', { quietMs: 26 * HOUR - 15 * HOUR, folder: 'nova-os', quote: 'Wrote /Users/haydencooper/Desktop/Files/Claude_Projects/nova-os/design/audits/redesign-2026-09/20-code-build-checklist-round-four-with-every-line-marked.md and the key is [hidden]' }),
        ]),
      ],
    },
  }),
  // a server from before round 4: it names neither folder, so their pages say so
  old: () => ({ ...PRESETS.idle(), old: true }),
  away: () => ({ ...PRESETS.idle(), away: true }),
  loading: () => ({ ...PRESETS.idle(), loading: true }),
};

function makeSim(app, store) {
  const delay = (v, ms = 380) => new Promise((res, rej) => setTimeout(() => (v instanceof Error ? rej(v) : res(v)), ms));
  const summary = (ws) => {
    if (ws === 'vault') return { clean: true, files: [], totals: { added: 0, removed: 0 }, readOnly: true, branch: 'main', head: null, peek: null };
    const files = store.by[ws] || [];
    return { clean: !files.length, files, totals: { added: files.reduce((a, f) => a + f.added, 0), removed: files.reduce((a, f) => a + f.removed, 0) }, readOnly: false, branch: 'main', head: { sha: store.head, at: Date.now() }, peek: files.length ? (store.peek && files.some((f) => f.path === store.peek.path) ? store.peek : null) : null };
  };
  const offline = () => { const e = new TypeError('Load failed'); return e; };
  return {
    snapshot: summary,
    workspaces: () => (store.old ? delay(Object.assign(new Error('Not found'), { status: 404 }), 120) : delay({ workspaces: WORKSPACES }, 120)),
    changes: (ws) => (store.away ? delay(offline(), 200) : delay(summary(ws), 220)),
    fileDiff: (ws, p) => delay({ path: p, lines: Array.from({ length: 12 }, (_, i) => `line ${i + 1} of ${p.split('/').pop()}`), more: 0 }),
    commits: () => delay({ commits: store.commits.slice().reverse() }),
    commit: (ws, msg, paths) => {
      if (String(msg || '').trim().length < 8) return delay(new Error('a commit needs a real message, 8 characters or more; future-you reads these'));
      const here = store.by[ws] || [];
      const missing = paths.find((p) => !here.some((f) => f.path === p));
      if (missing) return delay(new Error(`${missing} has no uncommitted change`));
      const taken = here.filter((f) => paths.includes(f.path));
      store.by[ws] = here.filter((f) => !paths.includes(f.path));
      const sha = hex();
      store.commits.forEach((c) => { if ((c.workspace || 'repo') === ws) { c.head = false; c.canUndo = false; } });
      store.commits.push({ sha, short: sha.slice(0, 7), at: Date.now(), files: taken.length, message: msg.trim(), workspace: ws, pushed: false, head: true, canUndo: true, undone: false, taken });
      return delay({ sha: sha.slice(0, 7), fullSha: sha, message: msg.trim(), files: taken.length, paths, leftOut: store.by[ws].map((f) => f.path), pushed: false }, 520);
    },
    undo: (ws, sha) => {
      const c = store.commits.find((x) => x.sha === sha);
      if (!c || !c.canUndo) return delay(new Error('a newer commit sits on top of it now, so Undo would take that too; it stays'));
      c.undone = true; c.canUndo = false; c.head = false;
      store.by[ws] = [...(c.taken || []), ...(store.by[ws] || [])];
      return delay({ undone: true, sha: c.short, files: c.files, paths: (c.taken || []).map((f) => f.path) });
    },
    shelve: (ws, paths) => {
      const here = store.by[ws] || [];
      const taken = here.filter((f) => paths.includes(f.path));
      store.by[ws] = here.filter((f) => !paths.includes(f.path));
      const sha = hex();
      store.shelves[sha] = { ws, taken };
      return delay({ shelved: true, sha, files: taken.length, paths });
    },
    unshelve: (ws, sha) => {
      const shelf = store.shelves[sha];
      if (!shelf) return delay(new Error('that shelf is not there any more; it may have been restored already'));
      delete store.shelves[sha];
      const here = store.by[shelf.ws] || [];
      store.by[shelf.ws] = [...shelf.taken, ...here.filter((f) => !shelf.taken.some((t) => t.path === f.path))];
      return delay({ restored: true, sha });
    },
  };
}

export function applyCodeFixture(app, name) {
  if (!name || !PRESETS[name]) {
    app.codeSim = null;
    app.setState({ codeFixture: null, codeChangesBy: {}, codeWorkspaces: null, liveMacSessions: null, codeChat: [], codeBusy: false, codeCommits: [], codeReceipt: null, codeAway: false });
    return;
  }
  const p = PRESETS[name]();
  const old = !!p.old;
  const store = { by: { repo: p.files, ...(old || !p.files.length ? {} : { atlas: ATLAS_FILES(), wren: WREN_FILES() }) }, peek: p.peek, commits: p.commits, shelves: {}, head: hex(), away: !!p.away, old };
  // the demo shelf line in Runs can really be restored in the stand-in
  for (const m of p.chat) if (m.kind === 'shelf') store.shelves[m.sha] = { ws: 'repo', taken: [file('src/tides.js', 12, 3), file('src/moon.js', 4, 0)] };
  app.codeSim = makeSim(app, store);
  const sim = app.codeSim;
  app.setState({
    codeFixture: name,
    codeChat: p.chat,
    codeBusy: !!p.busy,
    codeBusyAt: p.busy ? Date.now() - 38_000 : null,
    codeWorkspace: 'repo',
    codeTicks: {},
    codeReceipt: null,
    codeCommitMsg: '',
    codeCommits: p.commits,
    codeAway: !!p.away,
    codeSeenAt: p.away ? at(9, 12) : null,
    liveMacSessions: p.loading ? null : p.pic,
    liveForge: [{ id: 'lantern', prompt: 'Lantern site', state: 'built', finishedAt: new Date(Date.now() - 14 * HOUR).toISOString() }],
    codeWorkspaces: old ? [] : WORKSPACES,
    codeCommitMsgs: {},
    codeChangesBy: p.loading ? {} : { repo: sim.snapshot('repo'), vault: sim.snapshot('vault'), ...(old ? {} : { atlas: sim.snapshot('atlas'), wren: sim.snapshot('wren') }) },
  });
}
