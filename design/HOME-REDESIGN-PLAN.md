# Home redesign — the build plan

Written 26 Sep 2026 at the close of five mockup rounds on Home
(`design/audits/redesign-2026-09/01-home.md` §1–§9 carry the audit, every
round and his words; the ledger is `design/REDESIGN-CHECKLIST.md` §7).
This is the contract for the build. The mockups are the look; this is the
list.

## 1 · What he decided (26 Sep, 20:5x)

His words: "Loving this! I love all of the round 5 options. Feels much
calmer and more organised yet beautiful aesthetically. I'd like all of the
round 5 options to be variations I can change between. The glass effect
is excellent too. I also quite liked round 4's glass day and night
(possibly even with a natural cycle to change with the time of day), and
the summary version from earlier. Practice and trends boxes I really like.
Especially trends as something different but easily glanceable. The index
is awesome too. Nova glass will likely be the main version I'll use. I
still want the current appearance, layout etc to be an option for me to
change it to if I want in future so ensure that's stable."

So:

1. **The shape** is round 4's blend (mockup 55/56): date, large title, the
   serif standfirst, one highlight sentence with its bar and one quiet act,
   **Pinned** cards he edits (Body ring hero, Today as an hourly strip, The
   plan, Waiting, Training, Practice, Trends), a quiet foot. Moments (a
   record, a landed capture, a plan in flight, Wrap the day) appear above
   Pinned only while they are news.
2. **The materials** he can switch between: Nova glass (main), Nova night,
   Observatory, Apple glass with a day-to-night cycle, Summary (light).
3. **The Index** (the More tab in the iOS Settings shape) replaces the More
   grid under the new style.
4. **The tab bar** is the iOS 26 shape: a glass pill of five tabs with Nova
   as the detached round button beside it (drawn in every round he liked).
5. **The current appearance stays available and stable**: `cupertino` ×
   `command` (his phone today) is untouched and remains the default until
   he switches in Settings.

## 2 · How it fits the appearance system

Today: `novaos.theme` (command · observatory · ember · daylight) ×
`novaos.style` (command · apple · cupertino) × Calm, all CSS custom
properties on `:root` blocks (`src/theme.js`, `src/index.css`). The new
work adds one value to each dimension and one new small dimension:

| His option | style | theme | material |
| --- | --- | --- | --- |
| **Nova glass** (main) | `summary` | `command` | `glass` (with Nova's aurora sky) |
| Nova night | `summary` | `command` | `solid` |
| Observatory | `summary` | `observatory` | `glass` |
| Apple glass, day → night | `summary` | `sky` (new) | `glass` |
| Summary (light) | `summary` | `daylight` | `solid` |
| **Current appearance** | `cupertino` (unchanged) | `command` | n/a |

- **`summary`** is a new STYLE: the new Home shape (`MissionSummary`), the
  Index page as the More tab, the iOS 26 tab bar, SF/New York/SF Rounded
  faces via the system stack. Everything else about a screen (Train, Fuel,
  Inbox…) renders as it does under `cupertino` until its own redesign
  round; the chrome is what changes app-wide.
- **`sky`** is a new THEME: system colours on a sky whose gradient follows
  the hour (dawn · day · dusk · night), Apple-only like `daylight`.
- **`material`** (`novaos.material`: `glass` | `solid`) is a new modifier
  meaningful only under `summary`: glass = translucent cards over the
  theme's sky (aurora for command, midnight radial for observatory, the
  hour's sky for `sky`); solid = the theme's pane fill, no sky.
- **The hour band** (`data-nv-hour`: dawn · day · dusk · night) is stamped
  on `:root` by the app and refreshed every 15 minutes; `sky` and the
  aurora read it. Reduced motion and Calm keep the sky still.
- Mockup 56 already has the four materials as pure variable sets; the
  token blocks come from it (`--card`, `--card-ring`, `--card-hi`, `--blur`,
  `--c1..--c5`, `--up`, `--dn`, `--btn`, `--track`, `--tab*`, `--badge*`,
  `--stand-a/b`, `--hl-font`).

## 3 · Where the new Home reads from (one view model, three idioms)

`MissionControl.jsx` already returns `<MissionStructured/>` when
`v.structured`; it gains a third branch, `<MissionSummary/>` when
`v.summary`. All three read `valsMission`. New vals, all deterministic:

| Card | Reads | Notes |
| --- | --- | --- |
| Highlight | the Suggested Focus ladder's top rung + the protein gap (`valsMission` focus + ring vitals) | ONE sentence, one bar, one quiet act. Code writes the sentence from the same facts the rings show, so it can never disagree with them (audit finding 2) |
| Body (ring hero) | `ringVitals` (protein · steps · readiness) | Nested rings, numbers beside in SF Rounded; a dashed ring for absent data, never a zero |
| Today (strip) | `todayEvents` | Six slots: past · now · next four; the next event line beneath; "Calendar ›" → CalendarView |
| The plan | `oneThing` / `stuck` | The one open item with its days-ring; an act whose hour has passed changes state instead of staying live |
| Waiting | `commandDeck` count + first title | → Inbox |
| Training | train-today + `prMoment` | Push done · the record with a medal; → Train |
| Practice | `practiceCard` | The lamps and the next scene; → Practice |
| Trends | new `trends` val from `liveHealthDays` (7-day direction per metric: steps · protein · sleep · HRV) | Arrows with `--up`/`--dn`; the honest form of "Nova noticed"; → the Body page / Noticed |
| Moments | `prMoment` · `landedMoment` · `runningPlan` · `wrapCard` | Above Pinned, only while news; stand down when seen (existing rules) |
| Pinned order | `novaos.pinned` (localStorage, like `novaos.tabOrder`) | Default: Body · Today · The plan · Waiting · Training · Practice · Trends. Edit = a Health-style sheet: toggles + drag handles, Done. No jiggle mode (his Home Screen reference is honoured by the result, not the gesture) |

Off Home under `summary` (their pages exist; the Index reaches them; a
moment brings them back only with news): Nova noticed, Daily review, Lead,
Technique, Agents, Shortcuts, Who is asking, Nova is working (the Island
already carries it), the fold.

## 4 · Phases, each shipping alone behind the `summary` style

Every phase: `npm run lint` · `npm run build` · `cd server && npm test` ·
the JSX-import grep · both idioms still render (`cupertino` untouched is an
acceptance criterion of EVERY phase) · commit with a why · push · reload
via `scripts/reload-server.mjs` · then his phone.

**P0 · Guard the current look.** SHIPPED 26 Sep (8475533) as
`scripts/guard-cupertino.mjs`: the client has no JSX test renderer, so the
guard is a headless DEMO-mode DOM snapshot of the cupertino × command Home
(rendered text, pane count, scroll geometry) against a committed baseline,
clock frozen at 14:00 local and Math.random seeded. It refuses to run when
`public/_devconn*.js` exists (a connected load of Home writes). Run
`node scripts/guard-cupertino.mjs` before every commit of every phase; the
design-style rows in Settings gain "Summary" only when P2 lands.
DONE: the guard exists and passes; nothing visible changed.

**P1 · Tokens and the switch.** SHIPPED 26 Sep (27e8bd1, e64e3d4):
`summary` style, `sky` theme, `material` modifier (`novaos.material`,
`data-nv-material`), hour band (`data-nv-hour`, 15-min refresh); the
`--nv-sum-*` token blocks per theme × material from mockup 56; the
`.nv-sky` element; Settings rows for Sky and Material. The Summary
design-style row is filtered out of `novaStyleOptions` until P2 lands
(valsChrome.js), so he cannot switch into the old layout on glass and read
it as finished. Under `summary` every screen renders through the
`cupertino` branches (`structured` is true for both). The guard passed
on the tree; two CSS-contract tests were extended (see the ledger).

**P2 · MissionSummary.** The Home shape with the seven default cards, the
highlight, moments, the serif standfirst, the foot; `pinned` order from
localStorage; the Edit sheet. Split in two: P2-A (the view model + tests,
SHIPPED 26 Sep, c199b31: `src/summaryFacts.js`, `src/pinned.js`,
`src/vals/valsSummary.js`) and P2-B (SHIPPED 26 Sep, 08c73ca: the screen
`MissionSummary.jsx`, the `PinnedEditSheet.jsx`, the MissionControl branch,
App wiring, the `.nv-sum-*` CSS; brief: `design/audits/redesign-2026-09/p2b-brief.md`;
the Summary row is offered in Settings from this commit). The
Trends val and the aurora hour shift, planned for P4, landed early (P2-A and
P1). DONE means: at 402×874 in Nova glass the
first screen holds title, standfirst, highlight and the Body hero; one
filled button on the page; the highlight sentence, the rings and the plan
card never disagree (a unit test feeds the same facts and asserts the
sentence); reduced motion cross-fades.

**P3 · The tab bar and the Index.** Under `summary`: the iOS 26 pill with
five tabs and the detached Nova button (tap → live talk as today; label
"Talk" appears while listening); the Index page (four groups, icon tiles,
live values, the floating search) as the More tab, hash `#/index`; the
Mac sidebar unchanged. DONE means: every screen reachable from the Index;
`#/index` survives reload; the More sheet still exists under the other
styles.

**P4 · Trends and Sky.** The `trends` val and its tests (direction over 7
days, "no data" when absent); the `sky` theme's four hour gradients and the
aurora's hour shift; the 15-minute band refresh. DONE means: Trends shows
the same arrows the Body page's charts imply; the sky changes at the band
boundaries without a reload.

**P5 · His phone.** Nova glass as his main; each of the five options
switched and photographed; his tweaks. Then Home's checklist rows go to
`[b]` and, on his word, `[x]`.

**Then** the standard changes: NOVA-METHOD §2b rule 1 becomes "ship in
every live idiom from one view model" (three now), rule 2's house objects
gain the summary card, ring hero, strip, trend row and tile, and the
design memory records the decision. Not before P2 lands.

## 5 · What must not happen

- The `cupertino` and `command` styles must not change pixel or behaviour
  in any phase; his phone runs `cupertino` until he switches. P0's test and
  a probe shot compare guard it.
- No fourth render tree per screen beyond Home: other screens keep their
  `cupertino` branches under `summary` until their own round.
- No model writes; the highlight sentence is code's (rule: models decide,
  code acts; here code writes the sentence from the facts it can show).
- Demo content only in mockups; the build reads his real vault as today.
- The Index does not hide any screen: every key in `SCREENS` has a row.
- The seconds clock, the corner brackets and the mono micro-labels do not
  come along under `summary`; they remain under `command`.

## 6 · Open with him

- The Edit mechanism: a Health-style sheet (recommended) or hold-to-jiggle.
- Whether the sky cycle also tints Nova glass's aurora (recommended: yes,
  subtly), or only the `sky` theme.
- The build order: P1 → P2 (Nova glass + Nova night first, as they share
  the command palette) → P3 → P4 (Observatory, Sky, Summary light and
  Trends) → P5; or Trends earlier since he named it.
- The two test to-dos in his vault (a vault write, still his call); the
  push (ten commits local after this one).
