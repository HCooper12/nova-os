// PROJECTS, THE VIEW MODEL (phase 1, 29 Oct 2026; design/PROJECTS-PLAN.md §4).
// One model for both Home idioms: src/screens/Projects.jsx draws it as
// AppleLayout groups under cupertino and as .nv-sum-card tiles under summary.
// Nothing here invents a value: a ring is phases ticked of phases named, a
// "working" chip is a real session in the project's folder, "waiting" is a
// count of pending cards that carry the project's id.

const VISIBLE = 6; // choice overload: the rest behind "Show all"

const sessionsIn = (pic, dir) => {
  if (!dir || !pic?.groups) return [];
  const prefix = dir.endsWith('/') ? dir : `${dir}/`;
  return pic.groups.flatMap((g) => g.sessions || []).filter((s) => s.cwd === dir || String(s.cwd || '').startsWith(prefix));
};

export function pendingProjectCards(inbox) {
  return (Array.isArray(inbox) ? inbox : []).filter((r) => r.status === 'pending' && (r.projectId || r.kind === 'project-brief'));
}

/** Home's card: only when something waits on him. Null otherwise. */
export function projectsWaiting(st, go) {
  const cards = pendingProjectCards(st.liveInbox);
  if (!cards.length) return null;
  const byId = new Map((st.liveProjects || []).map((p) => [p.id, p]));
  const names = cards.map((r) => (r.kind === 'project-brief' ? `New: ${r.decision?.title || 'a project'}` : byId.get(r.projectId)?.name || r.decision?.title || 'a project'));
  const first = cards[0];
  return {
    count: cards.length,
    items: cards.slice(0, 3).map((r, i) => ({ id: r.id, title: r.kind === 'project-brief' ? (r.decision?.reason || r.text) : (r.decision?.title || r.text), name: names[i], kind: r.kind, dryRun: !!r.dryRun })),
    sub: `waiting on you · ${names[0]}`,
    open: first.kind === 'project-brief' ? go('inbox') : go('projects'),
  };
}

export function listProjects(st) {
  const pic = st.liveMacSessions || null;
  const waitingBy = new Map();
  for (const r of pendingProjectCards(st.liveInbox)) if (r.projectId) waitingBy.set(r.projectId, (waitingBy.get(r.projectId) || 0) + 1);
  const all = (st.liveProjects || []).map((p) => {
    const phases = p.phases || [];
    const ss = sessionsIn(pic, p.linked ? p.linked.path : p.folder);
    return {
      id: p.id, name: p.name, kind: p.kind, stage: p.stage, linked: !!p.linked, parent: p.parent || null,
      dryRun: !!p.dryRun,
      phaseRing: { done: phases.filter((x) => x.done).length, total: phases.length },
      working: ss.some((s) => s.state === 'working'),
      sessions: ss.length,
      waiting: waitingBy.get(p.id) || 0,
    };
  });
  // waiting first, then working, then his own before the linked; archived last
  const rank = (p) => (p.stage === 'archived' ? 9 : 0) + (p.waiting ? 0 : 2) + (p.working ? 0 : 1) + (p.linked ? 3 : 0);
  all.sort((a, b) => rank(a) - rank(b));
  const live = all.filter((p) => p.stage !== 'archived');
  return { all, live, archivedCount: all.length - live.length };
}

export function valsProjects(app) {
  const st = app.state;
  const loaded = Array.isArray(st.liveProjects);
  const { all, live, archivedCount } = listProjects(st);
  const shown = st.projectsShowAll ? all : live.slice(0, VISIBLE);
  const hidden = (st.projectsShowAll ? 0 : Math.max(0, live.length - VISIBLE)) + (st.projectsShowAll ? 0 : archivedCount);
  const list = {
    loaded,
    projects: shown.map((p) => ({ ...p, open: () => app.openProject(p.id) })),
    showAll: hidden > 0 ? { label: `Show all · ${hidden} more`, run: () => app.setState({ projectsShowAll: true }) }
      : st.projectsShowAll && all.length > VISIBLE ? { label: 'Show fewer', run: () => app.setState({ projectsShowAll: false }) } : null,
    empty: loaded && !all.length,
  };

  const intake = {
    text: st.projectIntakeText || '',
    set: (e) => app.setState({ projectIntakeText: e.target.value }),
    send: () => app.sendProjectIntake(),
    busy: !!st.projectIntakeBusy,
    turns: st.projectIntakeTurns || [],
    error: st.projectIntakeError || null,
    filed: st.projectIntakeFiled || null,
    reset: () => app.setState({ projectIntakeSession: null, projectIntakeTurns: [], projectIntakeFiled: null, projectIntakeError: null }),
  };

  let page = null;
  const d = st.projectDetail;
  if (st.projectOpen) {
    const p = d && d.project?.id === st.projectOpen ? d.project : (st.liveProjects || []).find((x) => x.id === st.projectOpen) || null;
    const phases = p?.phases || [];
    const firstOpen = phases.findIndex((x) => !x.done);
    const logLines = String(d?.log || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => {
      const m = l.match(/^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (DRY RUN · )?(.*)$/);
      return m ? { at: m[1], dry: !!m[2], text: m[3] } : { at: '', dry: false, text: l.slice(2) };
    });
    page = p ? {
      project: { id: p.id, name: p.name, kind: p.kind, stage: p.stage, linked: !!p.linked, folder: p.linked ? p.linked.path : p.folder, goal: p.goal || null, dryRun: !!p.dryRun, workspace: p.workspace || null },
      loading: !d || d.project?.id !== p.id,
      error: st.projectDetailError || null,
      // THE CONVERSATION (T7): his turns and Nova's about this project, from
      // the conversation record filtered by projectId, newest last
      conversation: {
        lines: (st.projectThreads?.[p.id] || []).map((t) => ({ ...t, time: t.at ? new Date(t.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '' })),
        text: st.projectAskText || '',
        set: (e) => app.setState({ projectAskText: e.target.value }),
        send: () => app.sendProjectAsk(),
        busy: !!st.projectAskBusy,
      },
      // what happened, in the project's own log (code-written)
      thread: p.linked ? (d?.commits || []).map((c) => ({ at: String(c.at || '').slice(0, 16).replace('T', ' '), dry: false, text: c.subject })) : logLines.slice(-12).reverse(),
      phases: phases.map((x, i) => ({ name: x.name, what: x.what || '', done: !!x.done, current: i === firstOpen })),
      files: (d?.files || []).slice(0, 40),
      waiting: (d?.cards || []).map((r) => ({
        id: r.id, title: r.decision?.title || r.text, reason: r.decision?.reason || '', kind: r.kind, dryRun: !!r.dryRun,
        approve: () => app.decideProjectCard(r.id, 'approve'), discard: () => app.decideProjectCard(r.id, 'discard'),
      })),
      sessions: d?.sessions || null,
      cost: d ? { usd: d.cost?.usd ?? 0, known: !!d.cost?.costKnown } : { usd: 0, known: false },
      controls: p.linked ? null : {
        dryRun: !!p.dryRun,
        allowances: p.allowances || {},
        quiet: p.quiet || null,
        modelOverride: p.modelOverride || null,
      },
      actions: p.linked ? { openCode: () => app.openProjectCode(p) } : {
        setSetting: (patch) => app.setProjectSetting(p.id, patch),
        proposeStage: (to) => app.proposeProjectStage(p.id, to),
        archive: () => app.archiveProject(p.id),
        openCode: p.workspace ? () => app.openProjectCode(p) : null,
      },
      nextStages: p.linked ? [] : ({ idea: ['planning', 'active'], planning: ['active', 'paused'], active: ['paused', 'done'], paused: ['active'], done: ['active'], archived: [] }[p.stage] || []),
      back: () => app.closeProject(),
    } : { missing: true, back: () => app.closeProject() };
  }
  return { list, intake, page };
}
