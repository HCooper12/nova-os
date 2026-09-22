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

  const CATEGORY_LABEL = { personal: 'PERSONAL', work: 'WORK', fitness: 'FITNESS', errands: 'ERRANDS', later: 'LATER / IDEAS' };
  const CATEGORY_ORDER = ['work', 'personal', 'fitness', 'errands', 'later'];

  const mkTodo = (t) => ({
    key: t.raw,
    text: t.text,
    checked: t.checked,
    category: t.category,
    categoryLabel: t.category ? CATEGORY_LABEL[t.category] : 'UNSORTED',
    editingCategory: st.todoEditCategoryKey === t.raw,
    startEditCategory: () => app.setState({ todoEditCategoryKey: t.raw }),
    pickCategory: (e) => app.setTodoItemCategory(t.raw, e.target.value),
    addedLabel: timeAgoLabel(t.added),
    // AGE IS A GRADIENT, NOT A BADGE (22 Sep 2026). Every open item older
    // than a fortnight used to carry a gold `Stale` tag, so three of them in
    // a column read as wallpaper rather than a warning — a default fill
    // persisting across a surface, which §2b rule 8 forbids by name. The
    // screen now draws age as a hairline that deepens, so `staleness` is
    // what it needs: 0 until a fortnight, then rising to 1 over the next
    // month. One old item is a hairline; a column of them is a gradient he
    // can read at a glance without a single badge.
    stale: !t.checked && t.added && (Date.now() - new Date(t.added).getTime()) / 86400000 >= 14,
    staleness: (() => {
      if (t.checked || !t.added) return 0;
      const days = (Date.now() - new Date(t.added).getTime()) / 86400000;
      if (!(days >= 14)) return 0;
      return Math.min(1, (days - 14) / 30);
    })(),
    toggle: () => app.toggleTodoItem(t.raw),
  });

  const groupsOf = (list) => {
    const groups = [];
    for (const cat of [...CATEGORY_ORDER, null]) {
      const items = list.filter((t) => (cat === null ? !t.category : t.category === cat));
      if (items.length) groups.push({ key: cat || 'unsorted', label: cat ? CATEGORY_LABEL[cat] : 'UNSORTED', items: items.map(mkTodo) });
    }
    return groups;
  };

  const todoist = st.liveTodoist;

  return {
    isTodos: st.screen === 'todos',
    todosHeaderLabel: demoMode
      ? 'Connect a backend to see your list'
      : isOffline
        ? 'Offline — showing last-known list'
        : live
          ? `${open.length} open · ${done.length} done`
          : 'Loading…',
    // composer stays usable offline — adds queue to the outbox
    todosConnected: !demoMode,
    todosLoaded: !!live,
    todoInput: st.todoInput,
    setTodoInput: (e) => app.setState({ todoInput: e.target.value }),
    todoInputKey: (e) => { if (e.key === 'Enter') app.addTodoItem(); },
    submitTodo: () => app.addTodoItem(),
    todosOpenGroups: groupsOf(open),
    todosOpenCountNum: open.length,
    todosDone: done.map(mkTodo),
    todoCategories: (live?.categories || []).map((c) => ({ value: c, label: CATEGORY_LABEL[c] || c.toUpperCase() })),
    todosSyncNote: !todoist
      ? null
      : todoist.configured
        ? `Two-way with Todoist (${todoist.linkCount} linked) and the vault page in Obsidian — captures routed TO-DO land here too.`
        : 'Synced with the vault page in Obsidian; connect Todoist in server/.env to mirror it there too.',
  };
}
