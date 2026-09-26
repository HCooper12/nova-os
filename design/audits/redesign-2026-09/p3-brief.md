# P3 brief — the iOS 26 tab bar and the Index (launch AFTER P2-B is merged)

Phase P3 of `design/HOME-REDESIGN-PLAN.md` (§1.3, §1.4, §4 P3, §5). Under the
`summary` style only. Isolated worktree; do NOT commit; the parent session owns
commits. Read the plan, mockup 56 (`design/mockups/56-redesign-home-nova.html`
lines 296–372: the Index markup and the dock; its `<style>` for `.group`,
`.glist`, `.tile`, `.you`, `.fsearch`, `.dock`, `.tabbar`, `.tab`, `.novabtn`),
`src/MobileChrome.jsx` (the current dock + More sheet), `src/vals/valsChrome.js`
(`navMain/navVault/navSystem` — the rows with live counts the Index REUSES;
`tabs`, `frequentTabs`, `OFF_DOCK_TITLE`, `compactTitle`), `src/App.jsx`
(`SCREENS`, `resolveScreen`, `screenFromHash`, `navigate`, the `render()` screen
switch), `src/TabIcon.jsx`, `src/Controls.jsx`, `src/Interactive.jsx`,
`src/screens/MissionSummary.jsx` (the page frame, nav row and card material P2-B
built — the Index wears the same), and the `STYLE · SUMMARY` block in
`src/index.css` (`--nv-sum-tab*`, `--nv-sum-badge*`, `.nv-sum-card`).

## 1 · The tab bar (MobileChrome, summary branch only)
- Under `v.summary` MobileChrome renders `<SummaryDock v={v} … />` (a new
  component in `src/SummaryDock.jsx`) INSTEAD of the current dock; the current
  dock's markup is untouched and still renders under every other style (the
  guard measures `<main>` only, so the dock is NOT covered by it: keep the old
  branch byte-identical and screenshot cupertino to prove it).
- Shape (mockup `.dock .row`): `position:fixed; left:16px; right:16px;
  bottom: calc(8px + env(safe-area-inset-bottom)); display:flex; gap:10px;
  align-items:center; z-index:72`. The PILL: `flex:1; height:60px;
  border-radius:30px; background: var(--nv-sum-tab); box-shadow: 0 0 0 .5px
  var(--nv-sum-tab-ring), 0 10px 30px -14px rgba(0,0,0,.7); backdrop-filter:
  blur(22px) saturate(1.4)` (+ webkit), `display:grid;
  grid-template-columns: repeat(5,1fr); padding: 2px`. Five slots: the first
  FOUR of `v.tabs` in his saved order (`v.tabs.slice(0,4)`), then `More`. Each
  tab: `Interactive` with `haptic="tick"`, height 56, `border-radius:28px`,
  column icon (TabIcon 22) + label (`500 10px var(--nv-font-ui)`), colour
  `var(--nv-sum-tab-ink)`; the active tab `var(--nv-sum-tab-on)` on a
  `var(--nv-sum-tab-on-bg)` pill; `t.count` badge `var(--nv-sum-badge)` /
  `--nv-sum-badge-ink` (18px round, 700 11px) at the icon's top-right. More
  is active when `v.isIndex`. Tapping More → `v.goIndex()` (a new valsChrome
  action: `go('index')`); the More SHEET is not rendered under summary.
- The NOVA BUTTON, detached to the right: 60×60 round, the same `Interactive`
  the current dock uses (onClick `v.startLiveTalk`, onLongPress
  `v.holdNovaText`, aria-label "Talk to Nova"), `background: var(--nv-sum-tab)`
  with the same ring/blur as the pill, `<VoiceHalo …/>` and `<NovaCore size={46}
  variant="mini" …/>` exactly as today. While `v.novaListening` a caption
  `Talk` (500 10px, `--nv-sum-tab-on`) sits under the orb inside the button
  (the orb shrinks to 34 to make room; transition 180ms).
- Motion: none on tab switch (used dozens of times a day). Press feedback via
  Interactive. `prefers-reduced-transparency`: the pill and button go solid
  (`color-mix(in srgb, var(--nv-void) 90%, white)`, no blur).
- The top bar (wordmark, status chip, job tray, outbox, Ask, ⚙) stays as it is
  under summary: it carries functions the mockup did not draw.

## 2 · The Index (`src/screens/Index.jsx`, screen key `index`, hash `#/index`)
- Move the `SCREENS` array out of `src/App.jsx` into `src/screenKeys.js`
  (`export const SCREEN_KEYS = [...]`, add `'index'`), import it in App.jsx
  where SCREENS was used; `resolveScreen`/`screenFromHash` keep working so
  `#/index` survives a reload. Add `OFF_DOCK_TITLE.index = 'Index'`,
  `isIndex: st.screen === 'index'`, `goIndex: go('index')` in valsChrome, and
  `{v.isIndex && <Index v={v} />}` in App's screen switch (lazy like the other
  off-dock screens if the file does the same; otherwise static — follow
  `Leader`/`Practice`'s pattern).
- The rows come from ONE pure module `src/indexGroups.js`: `INDEX_GROUPS =
  [{ key:'today', label:'Today', rows:['mission','workouts','recipes','inbox',
  'todos','voice'] }, { key:'mind', label:'Mind', rows:['practice','leader',
  'review','technique','library','notes','journal'] }, { key:'life',
  label:'Life', rows:['money','shopping','stash','galaxy'] }, { key:'nova',
  label:'Nova', rows:['ops','briefing','code','console','ambient','settings'] }]`
  with a `ROW_META` map: label (Home, Train, Fuel, Inbox, To-Do, Voice,
  Practice, Lead, Daily review, Technique, Library, Notes, Journal, Money,
  Shopping, Stash, Galaxy, Agents & Operations, Briefing, Code, Console,
  Ambient, Settings), the tile hue token per row (colour means something:
  Train `--nv-cy`, Fuel `--nv-good`, Inbox `--nv-gold`, Voice `--nv-cy`,
  Practice `--nv-or`, Lead `--nv-gold`, Daily review `--nv-vi`, Technique
  `--nv-mg`, Money `--nv-vi`, Galaxy `--nv-vi`, Agents `--nv-cy`, everything
  else the neutral `--nv-ink40`), and the door: a screen key, or for the two
  overlays `review` → `app.openDailyReview()` and `technique` →
  `app.openRepertoireBook()`. A test (`server/test/indexRows.test.js`) asserts:
  every key in `SCREEN_KEYS` except `index` appears in exactly one group; every
  row key is a screen key or one of the two overlay doors; no duplicates.
- A `valsIndex(app, ctx, v)` (new `src/vals/valsIndex.js`, spread in App's
  `renderVals` after valsSummary with the merged object) turns the groups into
  rows `{ key, label, hue, value, hot, go }` with LIVE VALUES read from vals
  that already exist — never invented, `''` when nothing honest exists: Home
  `v.summaryHome?.highlight ? '' : ''` (no value); Train `v.workoutCardLabel`;
  Fuel from the protein ring (`${value} of ${target} g`, or `${value} g`);
  Inbox `${n} waiting` (hot) when `inboxPendingCount > 0`; To-Do `${n} open`
  from `ctx.todosOpenCount`; Voice `Talk to Nova`; Practice
  `v.practiceCard?.meta || (active skills count ? '${n} skills' : '')`; Lead
  `v.leaderBox?.face?.title || (openCount ? '${n} open' : '')` (hot when
  stale); Daily review `v.reviewFrom ? 'from ${reviewFrom}' : ''`; Technique
  `v.todayTechnique && !empty ? '${position} of ${total}' : ''`; Library
  `${libraryCount} volumes`; Notes `${liveNotes.length} notes`; Journal
  `${journalDays.length} days`; Money `''` unless valsMoney exposes a month
  total (look; do not invent); Shopping `${n} items`; Stash `${n} links`;
  Galaxy `the vault as stars`; Agents & Operations `${agentsLiveLabel
  lowercased}` + ` · ${ops.pending} pending` when > 0; Briefing `''`; Code
  `''`; Console `''`; Ambient `''`; Settings `''`. Take the counts from the
  SAME expressions `navVault`/`navSystem` already use (refactor those
  expressions into small helpers if needed rather than duplicating them).
- Page (mockup lines 296–335), inside `<div style={v.wrapMission}
  data-screen-label="Index">` with the 760 max-width inner: the nav row (date +
  36px orb → `v.openVoice`) and `<h1>Nova</h1>` exactly as MissionSummary draws
  its own; the YOU card (`.nv-sum-card`, 48px orb, `<b>{userName}</b>` and a
  13px line `${agentsLiveLabel lowercased} · ${systemsLabel.text lowercased} ·
  ${inboxPendingCount} waiting`, chevron) → `v.goSettings`; four groups: a
  `.k` label (600 12px uppercase `--nv-ink60`, margin 0 0 6px 14px) over one
  `.nv-sum-card` list (padding 0): rows 52px, `Interactive` with
  `haptic="tick"`, hairline `--nv-sum-sep` between rows, a 34px tile (radius 9,
  `color-mix(in srgb, var(hue) 16%, transparent)` fill, the TabIcon or a small
  inline stroke icon for the non-tab rows, in the hue), label 17px `--nv-ink`,
  value 15px `--nv-ink60` right-aligned (`hot` → `--nv-sum-badge`), chevron
  `--nv-ink40`; the floating search pill at the foot (`.nv-sum-card`, 52px,
  radius 26, magnifier glyph + `Search Nova` in `--nv-ink60` + a mic glyph) →
  `v.openPalette` (the conversation IS the front door; no new search engine).
  `.nv-sum-rise` stagger on the groups with stable keys.
- Reachability (plan §5): every screen has a row; `#/index` reloads to the
  Index; the Mac sidebar is unchanged; the More sheet still works under the
  other styles.

## 3 · Gates and proof
`npm run lint` (0 errors) · `npm run build` · `cd server && npm test` (all
green, the new test included) · `node scripts/guard-cupertino.mjs` (unchanged;
stop your own vite first) · the JSX-import grep · screenshots via the Chrome
DevTools MCP against `npx vite --port 5192` in DEMO mode (never create
`public/_devconn*.js`): Home + tab bar under Nova glass, the Index under Nova
glass and Nova night, and a CUPERTINO shot of Home to show the old dock is
untouched. Report `git diff --stat`, what each shot shows, the gates' last
lines, and every departure from this brief with its reason. Do NOT commit.
