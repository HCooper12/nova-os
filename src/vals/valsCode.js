import { getConnection } from '../api.js';
import {
  PROJECTS, WORKSPACE_PROJECT, projectKeyOf, projectInfo, sessionRows, chipsFor, reviewFiles, reviewTotals,
  ruleOf, leftOutLine, findingsOf, textBlocks, lineHead, unansweredBreaker, newsLine, clock, plural, startOfToday,
} from '../codeModel.js';
import * as act from '../codeActions.js';

// THE CODE SCREEN'S VIEW MODEL (round 3, mockup 89, approved 10 Oct 2026).
// One model for every style and both widths (the Code screen never had a
// cupertino branch). Every number and state is read from a record: the
// sessions picture (/api/ops/sessions, the Ops slice's own list), the review
// (/api/claude-code/changes), today's commits (/api/claude-code/commits),
// the Forge's jobs, and the transcript. Missing records say so in words.
//
// Science Atlas and Wren are not places the Builder works, so their pages are
// their sessions and an honest empty Commit group; the server reads git only
// in Nova OS and the Vault.

export function valsCode(app, ctx, { modelOptions = [] } = {}) {
  const st = app.state;
  const fixture = import.meta.env.DEV ? st.codeFixture || null : null;
  const connected = !!getConnection() || !!fixture;
  const demo = !connected;
  const now = Date.now();
  const ws = st.codeWorkspace || 'repo';
  const here = WORKSPACE_PROJECT[ws];
  const pic = st.liveMacSessions || null;
  const away = connected && (!!st.codeAway || !!pic?.detail);
  const loading = connected && !away && (pic == null || !st.codeChangesBy?.repo);
  const modelLabel = (v) => (modelOptions.find((o) => o.value === v)?.label || v);

  // ----- sessions, by tile
  const byTile = new Map();
  for (const g of pic?.groups || []) {
    const key = projectKeyOf(g.project);
    if (!byTile.has(key)) byTile.set(key, { label: g.project?.label, sessions: [] });
    byTile.get(key).sessions.push(...(g.sessions || []));
  }
  const sessionsOf = (key) => byTile.get(key)?.sessions || [];
  const allSessions = [...byTile.values()].flatMap((t) => t.sessions);

  // ----- the review, per workspace
  const ticks = (w) => (st.codeTicks && st.codeTicks[w]) || {};
  const changes = (w) => st.codeChangesBy?.[w] || null;
  const rowsOf = (w) => reviewFiles(changes(w)?.files, ticks(w));
  const novaRows = rowsOf('repo');
  const novaReady = changes('repo')?.readOnly ? 0 : reviewTotals(novaRows).files;

  // ----- runs: the live one and the closed ones, today
  const today = startOfToday(now);
  const runsTodayIn = (w) => [
    ...(ws === w ? st.codeChat : []),
    ...(st.codeRuns || []).filter((r) => r.workspace === w).flatMap((r) => r.chat),
  ].filter((m) => m.who === 'claude' && !m.streaming && (m.at || m.endedAt || 0) >= today).length;
  const commitsToday = (st.codeCommits || []).filter((c) => !c.undone);

  const busyLine = (w) => {
    if (ws !== w) return null;
    if (st.codeBusy) {
      const ask = [...st.codeChat].reverse().find((m) => m.who === 'you')?.text || '';
      return { mark: 'bld', text: ask ? `The Builder is on “${ask.length > 60 ? ask.slice(0, 58).trimEnd() + '…' : ask}”` : 'The Builder is working' };
    }
    if (st.sparBusy) return { mark: 'brk', text: `The Breaker is reading ${projectInfo(WORKSPACE_PROJECT[w]).title}` };
    return null;
  };

  // ----- Needs you: waiting or stuck sessions, oldest first, and an unanswered Breaker
  const needs = [];
  for (const [key, t] of byTile) {
    for (const s of t.sessions.filter((x) => x.state === 'waiting' || x.state === 'blocked')) {
      const p = projectInfo(key, t.label);
      needs.push({
        key: `s:${s.sessionId}`, glyph: p, quietMs: s.quietMs ?? 0,
        title: s.state === 'blocked' ? `${p.title} is stuck and needs you` : `${p.title} is waiting for you`,
        line: `${(s.plain || '').replace(/^Waiting for you: /, '').replace(/^./, (c) => c.toUpperCase())} ${s.quietAgo ? s.quietAgo.replace(/^./, (c) => c.toUpperCase()) + '.' : ''}`.trim(),
        action: { label: 'Show', icon: 'mac', aria: `Show this ${p.title} session on your Mac`, run: () => app.showMacSession(s.sessionId), busy: st.macSessionBusyId === s.sessionId, disabled: away || !s.canShow },
      });
    }
  }
  needs.sort((a, b) => b.quietMs - a.quietMs);
  const brk = unansweredBreaker(st.codeChat);
  if (brk && !st.sparBusy) {
    const n = findingsOf(brk.text);
    const p = projectInfo(here);
    needs.push({
      key: 'breaker', glyph: p,
      title: n ? `The Breaker found ${n === 1 ? 'one thing' : `${n} things`}` : 'The Breaker finished its pass',
      line: `A read-only pass on ${p.title}${brk.at ? `, ${clock(brk.at)}` : ''}`,
      action: { label: 'Open', run: () => act.openProject(app, here, 'runs') },
    });
  }

  // ----- tiles
  const tile = (key, extra = {}) => {
    const p = projectInfo(key, byTile.get(key)?.label);
    const ss = sessionsOf(key);
    return { ...p, sessions: ss.length, chips: chipsFor(ss, extra.chipExtra || {}), open: () => act.openProject(app, key), ...extra };
  };
  const novaBranch = changes('repo')?.branch;
  const tiles = {
    nova: tile('nova', {
      sub: [novaBranch, ws === 'repo' ? 'the Builder works here' : null].filter(Boolean).join(' · ') || 'Nova’s own code',
      bars: novaRows.filter((f) => f.ticked).slice(0, 6).map((f) => ({ key: f.path, width: f.width, added: f.added, removed: f.removed })),
      chipExtra: { building: ws === 'repo' && (st.codeBusy || st.sparBusy), ready: novaReady, doneToday: commitsToday.length },
      foot: busyLine('repo'),
      selected: st.codeProject === 'nova',
    }),
    atlas: tile('atlas', { sub: 'the work itself', selected: st.codeProject === 'atlas' }),
    wren: tile('wren', { sub: 'Tasks that support and guide the Atlas', open: () => act.openProject(app, 'atlas', 'wren') }),
    vault: tile('vault', {
      sub: 'Read and edited by the Builder, never committed by Nova',
      chipExtra: { building: ws === 'vault' && (st.codeBusy || st.sparBusy), runsToday: runsTodayIn('vault') },
      selected: st.codeProject === 'vault',
    }),
    builds: (() => {
      const jobs = st.liveForge || null;
      const last = jobs?.[0];
      const builtToday = (jobs || []).filter((j) => j.state === 'built' && Date.parse(j.finishedAt || j.updatedAt || j.createdAt || '') >= today).length;
      const p = PROJECTS.builds;
      return {
        ...p,
        sub: !jobs ? 'What the Forge builds in Nova Projects' : last ? `${String(last.prompt || last.id).slice(0, 70)}` : 'Nothing built yet',
        chips: [
          ...((jobs || []).some((j) => j.state === 'running') ? [{ kind: 'work', text: 'Working' }] : []),
          ...(builtToday ? [{ kind: 'done', text: `Done today ${builtToday}` }] : []),
        ],
        open: () => app.navigate('ops'),
      };
    })(),
    others: [...byTile.keys()].filter((k) => k.startsWith('p:')).map((k) => tile(k, { sub: plural(sessionsOf(k).length, 'session') + ' on your Mac' })),
  };

  // ----- Done today: Nova's commits, each with Undo while it can still reach
  const doneToday = commitsToday.map((c) => ({
    key: c.sha,
    title: `Committed ${c.short} · ${plural(c.files, 'file')}`,
    line: `Nova OS, ${clock(c.at)} · ${c.pushed ? 'pushed' : c.head ? 'not pushed' : 'a newer commit sits on top'}`,
    canUndo: !!c.canUndo && !away,
    undo: () => act.undoCommit(app, c.sha),
    busy: !!st.codeChangeBusy,
  }));

  // ----- news
  const waitingNames = needs.filter((n) => n.key.startsWith('s:')).map((n) => n.title.replace(/ is (waiting for you|stuck and needs you)$/, ''));
  const nothing = connected && !loading && !away && allSessions.length === 0 && !novaRows.length && !st.codeChat.length && !st.codeBusy;
  const news = newsLine({
    waiting: waitingNames,
    ready: novaReady ? [{ title: 'Nova OS', n: novaReady }] : [],
    working: (st.codeBusy || st.sparBusy) ? projectInfo(here).title : null,
    away,
    nothing,
  });

  // ----- the project page
  const pageFor = (key) => projectPage(app, key, { ws, here, away, modelLabel, sessionsOf, rowsOf, changes, byTile });
  const page = st.codeProject ? pageFor(st.codeProject) : null;

  // ----- the ⋯ sheet
  const sheetTitle = page ? page.title : projectInfo(here).title;
  const sheet = {
    open: !!st.codeSheet,
    show: () => app.setState({ codeSheet: true }),
    close: () => app.setState({ codeSheet: false }),
    title: `${sheetTitle} session`,
    conn: away ? 'Your Mac isn’t answering' : demo ? 'Not connected to your Mac' : `Connected to your Mac · ${st.codeSessionId ? 'session open, it remembers this conversation' : 'the next message starts a session'}`,
    connOn: connected && !away,
    models: modelOptions.map((o) => ({ value: o.value, label: o.label, on: o.value === st.codeModel })),
    setModel: (value) => app.setState({ codeModel: value }),
    workspaces: [{ value: 'repo', label: 'Nova OS', on: ws === 'repo' }, { value: 'vault', label: 'Vault', on: ws === 'vault' }],
    setWorkspace: (w) => { if (act.switchWorkspace(app, w) && st.codeProject && PROJECTS[st.codeProject]?.workspace) act.openProject(app, WORKSPACE_PROJECT[w]); },
    newSession: () => { act.newSession(app); app.setState({ codeSheet: false }); },
    addToVault: () => { app.setState({ codeSheet: false }); app.openIngestModal(); },
  };

  return {
    demo, connected, away, loading, nothing,
    seenAt: st.codeSeenAt ? clock(st.codeSeenAt) : null,
    news,
    needs,
    sessionsWord: pic?.error && !pic.groups?.length ? 'Nova could not look at your Mac' : plural(allSessions.length, 'session') + ' on your Mac',
    tiles,
    doneToday,
    page,
    pageFor,
    stopPoll: () => app.stopMacSessionsPoll(),
    sheet,
    open: (key, section) => act.openProject(app, key, section),
    back: () => act.closeProject(app),
    askNova: () => act.openProject(app, 'nova', 'compose'),
    fixture: import.meta.env.DEV ? { name: fixture, set: (name) => app.setCodeFixture(name) } : null,
  };
}

function projectPage(app, key, { ws, here, away, modelLabel, sessionsOf, rowsOf, changes, byTile }) {
  const st = app.state;
  const p = projectInfo(key, byTile.get(key)?.label);
  const pageWs = p.workspace || null;
  const builderHere = !!pageWs && pageWs === ws;
  const ss = sessionsOf(key);
  const sessionRowsOf = (list) => sessionRows(list).map((r) => ({
    ...r,
    busy: st.macSessionBusyId === r.id,
    confirming: st.macSessionConfirmId === r.id,
    show: () => app.showMacSession(r.id),
    askClose: () => app.setState({ macSessionConfirmId: r.id, macSessionNote: null }),
    cancelClose: () => app.setState({ macSessionConfirmId: null }),
    close: () => app.closeMacSession(r.id),
    paused: away,
  }));

  // the review (Nova OS and the Vault only)
  let review = null;
  if (pageWs) {
    const c = changes(pageWs);
    const rows = rowsOf(pageWs);
    const totals = reviewTotals(rows);
    const msg = st.codeCommitMsg || '';
    const rule = ruleOf(msg);
    const readOnly = !!c?.readOnly;
    const openFiles = st.codeOpenFiles || {};
    const r = st.codeReceipt && pageWs === 'repo' ? st.codeReceipt : null;
    const peekPath = c?.peek?.path;
    review = {
      loading: !c,
      clean: !!c?.clean,
      readOnly,
      branch: c?.branch || '',
      head: r ? `${c?.branch || 'main'} · ${r.leftOut.length ? `${plural(r.leftOut.length, 'file')} left${leftOutLine(r.leftOut, r.rows)?.allOther ? ', another session’s' : ''}` : 'all committed'}`
        : c?.clean ? `${c.branch} · nothing to commit` : c ? `${c.branch} · ${totals.files} of ${rows.length} file${rows.length === 1 ? '' : 's'}` : '',
      totals,
      files: rows.map((f) => {
        const open = openFiles[`${pageWs}:${f.path}`] || null;
        return {
          ...f,
          toggle: readOnly ? null : () => act.toggleFile(app, pageWs, f.path),
          peek: f.path === peekPath && !open ? c.peek : null,
          open,
          showAll: () => act.showFileLines(app, pageWs, f.path),
        };
      }),
      msg,
      setMsg: (e) => app.setState({ codeCommitMsg: e.target.value }),
      rule,
      commit: {
        label: `Commit ${plural(totals.files, 'file')}`,
        enabled: !readOnly && !away && rule.met && totals.files > 0 && !st.codeChangeBusy,
        run: () => act.commit(app),
        busy: !!st.codeChangeBusy,
      },
      shelve: { enabled: !readOnly && !away && totals.files > 0 && !st.codeChangeBusy, run: () => act.shelve(app) },
      paused: away,
      receipt: r ? {
        title: `Committed ${r.sha} · ${plural(r.files, 'file')}`,
        line: `“${r.message}” · not pushed`,
        undo: () => act.undoCommit(app, r.fullSha),
        undoEnabled: !away && !st.codeChangeBusy,
        left: leftOutLine(r.leftOut, r.rows),
        dismiss: () => app.setState({ codeReceipt: null }),
      } : null,
    };
  }

  // runs: the live transcript (this workspace only) and the closed runs
  const chat = builderHere ? st.codeChat : [];
  const lines = chat.map((m, i) => {
    const h = lineHead(m, { modelLabel });
    const shelf = m.kind === 'shelf' && m.sha && !m.restored
      ? { label: 'Restore', run: () => act.restore(app, m.sha), enabled: !away && !st.codeChangeBusy } : null;
    return { key: `${m.at || 0}:${i}`, ...h, blocks: textBlocks(m.text), streaming: !!m.streaming, startedAt: m.streaming ? (st.codeBusyAt || m.at) : (m.startedAt || m.at), at: m.at, action: shelf };
  });
  if (builderHere && st.codeBusy && !chat.some((m) => m.streaming)) {
    lines.push({ key: 'bld-live', who: 'bld', name: 'Builder', detail: 'working', blocks: [], streaming: true, startedAt: st.codeBusyAt || Date.now() });
  }
  if (builderHere && st.sparBusy) {
    lines.push({ key: 'brk-live', who: 'brk', name: 'Breaker', detail: 'reading, read-only', blocks: [], streaming: true, startedAt: st.sparBusyAt || Date.now() });
  }
  const closed = (st.codeRuns || []).filter((r) => r.workspace === pageWs).map((r) => ({
    key: r.id,
    title: `Earlier run · ${plural(r.chat.length, 'line')}`,
    line: `ended ${clock(r.endedAt)}`,
    open: !!(st.codeRunOpen && st.codeRunOpen[r.id]),
    toggle: () => app.setState((s) => ({ codeRunOpen: { ...(s.codeRunOpen || {}), [r.id]: !(s.codeRunOpen || {})[r.id] } })),
    lines: r.chat.map((m, i) => ({ key: `${r.id}:${i}`, ...lineHead(m, { modelLabel }), blocks: textBlocks(m.text), streaming: false })),
  }));

  const anchors = pageWs
    ? [
      { id: 'commit', label: 'Commit', count: review && !review.readOnly ? review.totals.files : '·', glyph: 'commit' },
      { id: 'sessions', label: 'Sessions', count: ss.length, glyph: 'sessions' },
      { id: 'runs', label: 'Runs', count: lines.length, glyph: 'runs' },
    ]
    : key === 'atlas'
      ? [
        { id: 'work', label: 'The work', count: ss.length, glyph: 'work' },
        { id: 'wren', label: 'Wren', count: sessionsOf('wren').length, glyph: 'kin' },
        { id: 'commit', label: 'Commit', count: '·', glyph: 'commit' },
      ]
      : [
        { id: 'sessions', label: 'Sessions', count: ss.length, glyph: 'sessions' },
        { id: 'commit', label: 'Commit', count: '·', glyph: 'commit' },
      ];

  return {
    key, title: p.title, glyph: p, hue: p.hue,
    sub: key === 'atlas' ? 'the work itself · with Wren, its assistant'
      : pageWs ? [changes(pageWs)?.branch, builderHere ? 'the Builder works here' : null].filter(Boolean).join(' · ')
        : plural(ss.length, 'session') + ' on your Mac',
    section: st.codeSection || null,
    clearSection: () => app.setState({ codeSection: null }),
    anchors,
    review,
    sessions: sessionRowsOf(ss),
    sessionsHead: plural(ss.length, 'session'),
    wren: key === 'atlas' ? { glyph: PROJECTS.wren, sessions: sessionRowsOf(sessionsOf('wren')), head: plural(sessionsOf('wren').length, 'session') } : null,
    workSessionsHead: plural(ss.length, 'session'),
    runs: pageWs ? { lines, closed, count: lines.length } : null,
    honestCommit: !pageWs,
    composer: pageWs ? {
      placeholder: `Ask the Builder in ${p.title}`,
      value: st.codeInput || '',
      set: (e) => app.setState({ codeInput: e.target.value }),
      key: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); app.doCode(); } },
      send: () => app.doCode(),
      canSend: builderHere && !away && !st.codeBusy && !!(st.codeInput || '').trim(),
      busy: !!st.codeBusy,
      note: !builderHere ? `The Builder is in ${projectInfo(here).title} until its run finishes.` : away ? 'Run is paused until your Mac answers.' : null,
      breaker: { run: () => app.startSpar(), busy: !!st.sparBusy, enabled: builderHere && !away && !st.sparBusy },
    } : null,
  };
}
