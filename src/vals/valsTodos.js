// To-Do domain: the vault To-Do page (Wiki/Inbox/To-Do.md) as a first-class
// screen. One list, three writers — captures routed 'todo', this screen,
// Obsidian by hand — and Todoist mirrored two ways. Adds to ctx:
// todosOpenCount (sidebar count).

function timeAgoLabel(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function valsTodos(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline } = ctx;

  const live = st.liveTodos;
  const items = live?.items || [];
  const open = items.filter((t) => !t.checked);
  const done = items.filter((t) => t.checked);

  Object.assign(ctx, { todosOpenCount: live ? open.length : null });

  const mkTodo = (t) => ({
    key: t.raw,
    text: t.text,
    checked: t.checked,
    addedLabel: timeAgoLabel(t.added),
    stale: !t.checked && t.added && (Date.now() - new Date(t.added).getTime()) / 86400000 >= 14,
    toggle: () => app.toggleTodoItem(t.raw),
  });

  const todoist = st.liveTodoist;

  return {
    isTodos: st.screen === 'todos',
    todosHeaderLabel: demoMode
      ? 'CONNECT A BACKEND TO SEE YOUR LIST'
      : isOffline
        ? 'OFFLINE — SHOWING LAST-KNOWN LIST'
        : live
          ? `${open.length} OPEN · ${done.length} DONE`
          : 'LOADING…',
    todosConnected: !demoMode && !isOffline,
    todosLoaded: !!live,
    todoInput: st.todoInput,
    setTodoInput: (e) => app.setState({ todoInput: e.target.value }),
    todoInputKey: (e) => { if (e.key === 'Enter') app.addTodoItem(); },
    submitTodo: () => app.addTodoItem(),
    todoBusy: st.todoActionBusy,
    todosOpen: open.map(mkTodo),
    todosDone: done.map(mkTodo),
    todosSyncNote: !todoist
      ? null
      : todoist.configured
        ? `Two-way with Todoist (${todoist.linkCount} linked) and the vault page in Obsidian — captures routed TO-DO land here too.`
        : 'Synced with the vault page in Obsidian; connect Todoist in server/.env to mirror it there too.',
  };
}
