# 08 · Ops and the Org Map: audit, 5 Oct 2026

His brief, 26 Sep: "A lot of Nova has become cluttered and complicated."
"Simplicity with all functionality and a beautiful aesthetic, along with ease
of use MUST be the goal." Ops is where he sees Nova's machinery (the agents,
the loops, the jobs, the heartbeats), and the Org Map is the 3D view of his
agents as beings. Judged against his two references for "simple" in this
redesign (the Coach deck: one sentence, the change drawn, a tick, a cross,
talk back; and the summary Home he chose: one read, then what he uses most,
everything else one tap down), and against his standing calls on the agents:
every agent consults every other and Nova directs them all as CEO, with
authorship on every reply; each agent owns a hue and an artefact; faces, in
3D.

Evidence: source read in full (`src/screens/Ops.jsx` 364 lines,
`src/OpsInboxHead.jsx` 234, `src/vals/valsOps.js` 338, `src/vals/valsOrgMap.js`
141, `src/orgmap/OrgMap.jsx` 174, the Ops slice of `src/vals/valsInboxSummary.js`,
`server/lib/ops.js`, `server/lib/orgMap.js`, and the parts of `scene.js`,
`habitat.js` and `beings.js` that set size, hue and layout). Photographs in
demo mode only, under his look (summary, Nova glass, command, the hologram
core), at 390×844 and 1280×800: the true demo render, and a harness render of
the connected layout, the real components fed a demo-shaped view model (§5
says how, and what that can and cannot show). Computed-style sweeps of `main`
at both widths. Read under `apple-hig-review`, each citation `file.md ›
Heading` from the page itself; "judgment" where no page applies. No data of
his was read or photographed; every name and count below is demo-shaped.
Locators are against `main` at f4e9f4f.

---

## 1 · Verdict

**Critical issues.** Ops is four things stacked on one route, and the page
named for his agents shows none of them on its first screen. Under his style
it opens with what the Inbox handed over on 27 Sep (the 18 waiting, Nova's two
proposals, the seven loops, the filing ladder), then the 3D Org Map, then a
console of channels, connections, nine conversation lanes and a seven-card
skill grid, then the Forge, the overnight queue and the Mac sessions, then a
40-row log. Each part is honest and most are useful. Together they make an
8.5-screen page with 53 controls, 13 type sizes and three different rosters of
agents, one of which is a fixed list that has said "7 of 7 live" since it was
written. The Org Map, the thing on this page he would remember, is a distant
ring on his phone: beings about 20 to 25 points tall and counts too small to
read. The number that says it: **1,130**. On a page called Agents &
Operations, the first agent appears 1,130 points down, on screen two of eight
and a half.

### Clutter numbers, as it stands (checklist §3)

| Test | Ops today (connected layout, demo-shaped, 390×844) | Target |
| --- | --- | --- |
| Focal point | None that is this page's. The title says agents; the first thing with weight is the Inbox's 18 (a 52pt gold numeral); the map starts at 1,130pt | One, above the fold |
| Object count, 390×844 | 17 above the fold (13 tappable): the 18 card, two proposals, four loop rows. None is an agent. Demo mode: one line and nothing to tap | Lower than today, or a reason |
| Verbs per card | Proposal card 3 (Accept · Talk about it · Skip), the house shape. Being card 2 (Close, Open Inbox), both 32pt; its asks cannot be answered | One primary, one quiet alternative, talk back |
| Type sizes | 13 besides numerals: 10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 18, 19, 20, 34 (numerals at 11, 12.5, 52) | ≤ 3 |
| Tap floor | 53 controls; 28 under 44pt; one under 28pt (the overnight ✕, 8×12) | ≥ 28pt; ≥ 44pt primary |
| Gestures | The map turns on a sideways drag and selects on a tap; every waiting being also has a pill. No swipe rows, no long-press | Every capability has a pixel he can tap |
| Motion | Entrances yes (the head's staggered rise, the map's rise); no exits (the being card and the agent detail vanish on the next frame); the 3D camera eases and can be interrupted; reduced motion cuts every CSS animation to an instant, the scene holds still | All four |
| States | Loading: the map's chunk holds a flat box, the page otherwise says "No operations data yet"; empty (demo): one mono line under the top bar, no way forward; offline: last-known with no as-of; error: one Mac-sessions sentence, a loop's own note buried in a being card | All four designed |
| Width | `scrollWidth` 390 at 390, 1280 at 1280 | 390 |
| Screens deep | 8.5 at 390 (7,145pt); 6.9 at 1280 (5,522pt) | ≤ 4 before an index |
| Facts restated | "18 waiting" four times: the card, the serif headline, the 3D markers, the pill row | Each fact once |
| Rosters | Three: 10 beings on the map, 9 lanes "In conversation", 7 names in the sidebar and the Index from a constant | One |
| Idioms | Summary (his, since 3 Oct) photographed; cupertino and command read from source only | Both checked |

Where the 7,145 points go at 390: the Inbox hand-over 0 to 1,130; the map
1,130 to 1,730 (canvas 372pt tall); channels, core and connections 1,734 to
2,365; nine lanes and the legend 2,365 to 2,790; the skill grid 2,790 to 4,348
(1,558pt, the largest single block); the Forge 4,348; the overnight queue
4,695; the Mac sessions 4,943; the stream 5,641 to 7,145 (1,504pt).

---

## 2 · Findings, ranked by visible gain on his phone per hour of work

### 1 · The first screen belongs to the Inbox; the agents start on screen two
`Ops.jsx:180, 201` (the summary head renders first), `OpsInboxHead.jsx:156-217`; harness frames at 390 and 1280

Under summary, `sumHead` (Inbox round 2's hand-over) renders before
everything Ops owns. At 390 it fills 0 to 1,130pt; the Org Map's section
starts at 1,130 and its canvas at 1,211. The first screen carries 17 objects
and no agent; on the Mac the map starts at 1,095. The order of the head is his
("Nova proposes options could appear at the top of the agents and operations
... but under the decisions waiting on my call", 27 Sep), so keeping it is his
call (§4 B); what it costs is that the page's own subject is below the fold
on both devices.

| Before | Why | Severity |
| --- | --- | --- |
| Inbox hand-over 0 to 1,130pt; the first agent at 1,130 | `layout.md › Visual hierarchy`: "place the most important items near the top and leading side". `writing.md › Best practices`: "Consider each screen's purpose. Pay attention to the order of elements on a screen, and put the most important information first." | High |

### 2 · Eight and a half screens: four systems and a log on one route
`Ops.jsx:227-263` (topology), `:266-283` (skill grid), `:285-345` (Forge, overnight), `:347` (Mac sessions), `:349-361` (stream)

Below the map sit a channel column, a decorative core, a connection column,
nine lanes with a legend, a seven-card registry of 31 skills, two composers
with their job lists, the Mac sessions and a 40-row receipts log. Each is
rarely needed and none is summarised: the skill grid alone is 1,558pt and the
log 1,504pt. The inventory's first-look note ("three screen-sized systems
stacked on one route") is confirmed and understated: it is four, and a log.

| Before | Why | Severity |
| --- | --- | --- |
| 8.5 screens at 390, 6.9 at 1280; the log starts 5,641pt down | `designing-for-ios.md › Best practices`: "Help people concentrate on primary tasks and content by limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." `layout.md › Best practices`: "You can make secondary information available in other parts of the window, or include it in an additional view." | High |

### 3 · On a phone the map is a distant ring
`OrgMap.jsx:139` (the canvas box, `clamp(360px, 96vw, 560px)`), `habitat.js:33` (`BEING_SCALE: 0.72`), `scene.js:42` (`MARKER_SCALE = 2.1`); stills at 390 and 1280

At 390 the whole ring fits the 372pt canvas, which is what pass 1 asked for
("FIT on load"), and it leaves each being about 20 to 25 points tall and the
count inside each gold marker about 4 points high (estimated from the still:
the counts are canvas pixels, so no computed size exists). The faces his
passes 3 to 5 refined, and the artefacts he asked for, cannot be read at that
size; the 25 Sep look found the same ("at map scale the artefacts nearly
vanish"). His rule from pass 1 is the other half: "a phone gets one subject at
a time, not a distant ring." On the Mac the frame is 1,004×558 and the ring
uses about 40% of its width.

| Before | Why | Severity |
| --- | --- | --- |
| Ten beings at 20 to 25pt, counts at about 4pt, the whole ring at once | `accessibility.md › Vision`: iOS minimum type size "11 pt". `charting-data.md › Designing effective charts`: "Match the size of a chart to its functionality ... make it easy for people to read a chart's details and descriptive text." His pass 1 rule (memory nova-agent-world) | High |

### 4 · The being card cannot act, and nothing on Ops can talk to an agent
`OrgMap.jsx:32-82` (the card), `:42-53` (asks drawn as plain rows), `:35` (`max-height:62%; overflow:auto`), `:77-79` (Open Inbox); AGENT-WORLD-PLAN §3c and its "Still to build ... Talk from the card" (line 326)

A tap on the Coach (pill or being) flies the camera to him and raises a card
listing "Four things waiting on you, 3 new", three asks, the last receipt and
all ten loops. None of the asks can be answered there: no tick, no cross, no
Talk (the plan's §3c drew all three). The card's content is 894pt inside a
231pt window, a scroller inside the page's scroller, and its one action, Open
Inbox, sits 850pt down that inner scroll; Close and Open Inbox are both 32pt.
Since his 29 Sep rule (every agent consults every other, Nova directs all of
them, he can talk to any one or all together), the page that draws the org has
no door to talk to anyone in it.

| Before | Why | Severity |
| --- | --- | --- |
| Asks shown, not answerable; Talk unbuilt; the only action behind an inner scroll | `scroll-views.md › Best practices`: "Avoid putting a scroll view inside another scroll view with the same orientation." `modality.md › Best practices`: "Aim to keep modal tasks simple, short, and streamlined." NOVA-METHOD §2b rule 8 (a light tick or cross, one do-all, talking back) | High |

### 5 · "Agents · 7 of 7 live" is a constant
`src/vals/shared.js:10-22`, `valsMission.js:167, 1132`, `valsChrome.js:336`, `valsIndex.js:121-125`; confirmed in the running app

The Mac sidebar's group header ("AGENTS · 7 OF 7 LIVE"), the Index row for
this page on his phone ("7 agents live · 18 pending") and the classic and
cupertino Homes' "7 AGENTS LIVE" (`MissionControl.jsx`, `MissionStructured.jsx`)
all count
`AGENTS.filter((a) => a.on)` over a fixed list in which every entry is
`on: true`. The list's own comment says `on` "marks the three whose domains are
genuinely wired". It names a Studio that has no being (its records are in
`UNFILED_KINDS`, `server/lib/orgMap.js:92`) and leaves out the Librarian, Meal
Prep, the Leader and Practice. In demo mode, with nothing connected, the app
still says 7 of 7 live (read from `renderVals()` during this audit). Nothing
here reads a heartbeat.

| Before | Why | Severity |
| --- | --- | --- |
| A live-status count that is a literal, shown on three surfaces including his phone's Index | NOVA-METHOD non-negotiable: "Honest degradation, never fiction." `feedback.md › Best practices`: "Consider integrating status feedback into your interface" (status must be the status). The Inbox audit rated the same class (an unconditional claim the data contradicts) Critical | Critical |

### 6 · Colour means the district, and two colours do six jobs
`OrgMap.jsx:18-21` (`HUE` by district), `:157, 165` (pill dots), `valsOps.js:40-45` (autonomy tags), `:72-78` (freshness dots), `Ops.jsx:253-258` (legend)

The beings own their hues in 3D (`beings.js:120-156`: the Researcher quads
blue, the Watcher calves ice, the Librarian back teal, Practice orange), but
the pill row colours each pill by its district: all three Knowledge beings
wear one blue, and Practice's pill would wear the Leader's magenta. "Your own
notes" wears cyan, which is also the Commander's hue. Elsewhere on the page
gold means waiting on him (the 18, the markers, PENDING), a skill that can
propose (`PROPOSE`), and an overnight question that is queued; cyan means the
talk action, the Commander, "ran today", "connected", "act on approval" and a
running Forge job. Two more collisions come from the tokens themselves and
need shapes, not new colours: the CFO's green is the "done" green, and Meal
Prep's amber sits next to the waiting gold.

| Before | Why | Severity |
| --- | --- | --- |
| District hue on the pills; gold with 3 meanings, cyan with 6 | `color.md › Best practices`: "Avoid using the same color to mean different things. Use color consistently throughout your interface, especially when you use it to help communicate information like status or interactivity." His call: each agent owns a hue (memory nova-agent-world) | High |

### 7 · Three rosters of agents
`server/lib/orgMap.js:26` (`BEINGS`, 10), `server/lib/ops.js:110` (`CONVERSATIONAL`, 9), `src/vals/shared.js:14` (`AGENTS`, 7)

The map shows ten beings. Under it, "In conversation" lists nine lanes: Nova,
Coach, Researcher, Watcher, Forge, Study Lane, Scout, Librarian · Read Next,
Practice. The Mac sidebar lists seven: Commander, Coach, CFO, Studio,
Researcher, Watcher, Guardian. Forge, Study Lane and Scout appear only in the
list (the map places them on the Guardian and the Researcher); the Commander,
CFO, Guardian, Meal Prep and the Leader appear only on the map; Studio appears
only in the sidebar. The map's placement (every one of 39 scheduled loops and
9 lanes on a being, pinned by `orgMap.test.js`) is the one that is true and
tested.

| Before | Why | Severity |
| --- | --- | --- |
| Three answers to "who are my agents?" on one page and its chrome | `design-principles.md › Familiarity`: "Keep visuals and interactions consistent. Once you establish a behavior or appearance for an element, apply it throughout your design." `writing.md › Best practices`: "Build language patterns. Consistency builds familiarity." | High |

### 8 · The stream: a 40-row log with a broken column
`Ops.jsx:349-361`, `:356` (the kind tag, `width:78px`), `valsOps.js:309-333`

At 390 every row is time · KIND · title · STATUS. The kind column is 78pt and
"RESEARCHER" and "DAILY REVIEW" overrun it into the title ("RESEARCHERResearcher
filed …"). Titles are cut after about a dozen characters, and the agent's name
takes two of the four slots ("RESEARCHER" then "Researcher filed"). Request
rows ("Nova was asked · 2.8s", "OK") sit between record rows, and a failed
request reads "HTTP 500" with nothing about what failed or what to do.

| Before | Why | Severity |
| --- | --- | --- |
| A tag column that overflows; titles cut to a dozen characters; HTTP codes as the error | `lists-and-tables.md › Content`: "Keep item text succinct so row content is comfortable to read ... consider alternatives ... list item titles only, letting people choose an item to reveal its content in a detail view." `writing.md › Best practices`: "Write clear error messages ... be clear about what someone can do to fix it." | Medium |

### 9 · The empty state sits under the top bar and offers no way forward
`Ops.jsx:189-195` (`padding:34px 28px`, no top inset); the true demo frame

In demo mode, and before the first sync, Ops is the Command header "XIV.
OPERATIONS" in tracked mono and one mono sentence, under his summary style.
The header measures y 34 to 50 under a top bar that ends at 48; on his phone,
with the status-bar inset added to the bar, it sits fully under it. The fix
for exactly this (`calc(48px + env(safe-area-inset-top))`, review finding 9)
was made only on the live branch (`Ops.jsx:200`). The sentence names what is
missing and offers no button to connect.

| Before | Why | Severity |
| --- | --- | --- |
| Title under the bar; a mono line; no next step | `layout.md › Guides and safe areas`: "Respect key display and system features in each platform." `writing.md › Best practices`: "Provide clear next steps on any blank screens ... give them a button or link to do so if possible." | Medium |

### 10 · The tap floor: 28 of 53 controls under 44pt, one at 8 by 12
`Ops.jsx:342` (the overnight ✕), `OrgMap.jsx:156` (pills, `min-height:34px`), `Ops.jsx:162-165` (Show me, Close it), `:310` (Stop), `:323` (Run now ▸)

Measured at 390: the eight marker pills (34pt), the nine lane rows (35pt), the
Forge input (43pt), Stop, Run now, Show me and Close it (32pt), and the
overnight remove ✕ at 8×12, which is under the 28pt floor and under the Mac's
20pt floor too. The head's controls (from the Inbox round) are all 44pt.

| Before | Why | Severity |
| --- | --- | --- |
| One control at 8×12 | `accessibility.md › Mobility`: "Offer sufficiently sized controls ... iOS, iPadOS 44x44 pt default, 28x28 pt minimum; macOS 28x28 pt, 20x20 pt." | Critical |
| 27 more under 44pt | `buttons.md › Best practices`: "a button needs a hit region of at least 44x44 pt" | High |

### 11 · This Mac, his daily driver, is on screen six and squeezed
`Ops.jsx:116-173`, `valsOps.js:53-55` (his 23 Sep words: "my main daily driver")

The cross-project Claude Code view he asked for as one place to see what is
running and who is waiting on him starts 4,943pt down. Each session row puts
Show me and Close it beside the text, which squeezes "Waiting for you: it has
something to say or a question" into a column four or five lines deep. The
writing itself (plain states, the server's order, the close confirm) is right.

| Before | Why | Severity |
| --- | --- | --- |
| His most-used part of Ops at screen six; rows four lines deep | `layout.md › Visual hierarchy` (importance near the top, as in finding 1). `layout.md › Best practices`: "Make controls easier to use by providing enough space around them." | Medium |

### 12 · Thirteen type sizes, two vocabularies, two column widths
Computed sweep of `main`; `Ops.jsx` throughout (`Meta`, `Eyebrow`, `Tag` in the Command micro-label set); `OpsInboxHead.jsx:161` (`maxWidth:760px`) against `Ops.jsx:200` (`max-width:1080px`)

Below the summary head, every label is the Command vocabulary: uppercase
tracked eyebrows (one of them a file path, "WIKI/LIBRARY/NOVA SKILLS.MD"),
uppercase tags (ACT ON APPROVAL, PROPOSE, OBSERVE, RUNNING, QUEUED), mono
inputs. The 3D district labels are drawn in Rajdhani (`scene.js:80`). At 1280
the head is a 760pt column and everything after it is 1,042pt wide.

| Before | Why | Severity |
| --- | --- | --- |
| 13 sizes, two label systems, two widths | `typography.md › Conveying hierarchy`: "Minimize the number of typefaces you use ... Mixing too many different typefaces can obscure your information hierarchy." `designing-for-macos.md › Best practices`: "maintaining a comfortable information density" | Medium |

### 13 · The 18, said four times
`OpsInboxHead.jsx:164-172`, `OrgMap.jsx:136` (the headline), `scene.js` markers, `OrgMap.jsx:152-170` (pills)

The 18 card, then the serif headline ("18 things are waiting on you: the
Researcher 5, the Coach 4, and 5 others"), then the same counts as 3D markers,
then the same counts as pills. The house lesson from Home is that the headline
must not repeat the card below it (memory nova-mission-headline); here it
repeats the card above it and is repeated twice more below.

| Before | Why | Severity |
| --- | --- | --- |
| One fact, four forms, one screen apart | `layout.md › Best practices`: "don't obscure it by crowding it with nonessential details." Judgment: the headline should say what the card cannot (who is working, what failed) | Medium |

### 14 · Two composers in two styles, three filled primaries in three colours
`Ops.jsx:292-299` (Forge: SF 13, cyan Build it), `:327-332` (overnight: mono 12, violet Queue), `OpsInboxHead.jsx:31-33` (Accept)

| Before | Why | Severity |
| --- | --- | --- |
| Accept (green), Build it (cyan), Queue (violet) on one page; two input styles | `buttons.md › Style`: "Keep the number of prominent buttons to one or two per view. Presenting too many prominent buttons increases cognitive load." | Medium |

### 15 · Three names for one page
`tabOrder.js:10` ("Ops", the bar's title and the More list), `valsChrome.js:243` ("Operations", the Mac sidebar), `indexGroups.js:50` and `OpsInboxHead.jsx:162` ("Agents & Operations")

| Before | Why | Severity |
| --- | --- | --- |
| The bar says Ops while the large title says Agents & Operations | `writing.md › Best practices`: "Create a list of common terms, and reference that list to keep your language consistent." | Low |

### 16 · Motion: entrances without exits; reduced motion is a cut
`OrgMap.jsx:35` and `Ops.jsx:70` (`nvRise` in, nothing out), `index.css:2595` (the global reduced-motion rule)

The map section, the being card and the agent detail rise in; the card and
the detail unmount on the next frame when closed. Under reduced motion one
global rule sets every animation to 0.01s and every transition to none, so
nothing cross-fades: things appear and vanish. The 3D scene handles reduced
motion properly (still poses, no idle life).

| Before | Why | Severity |
| --- | --- | --- |
| No exit on the card or the detail; reduced motion as a hard cut | `motion.md › Best practices`: "Make motion optional." `accessibility.md › Cognitive`: "Replacing transitions in x-, y-, and z-axes with fades to avoid motion" (a fade, kept) | Low |

### 17 · Smaller things seen
- **A third Nova orb, carrying nothing.** The 86pt core between the topology
  columns (`Ops.jsx:58-64`) is the third Nova on one screen (the dock's orb,
  the map's plinth). It has no data.
- **"Ran today" is judged by the clock, not the loop.** The lane dots and the
  map's freshness use fixed day thresholds (`server/lib/ops.js:231-237`), while
  the Guardian judges each loop by its own cadence (`loopCadenceHours`,
  `:88`). An hourly loop that has not beaten for 30 hours reads "last 2 days"
  on the page and stale to the Guardian.
- **Forge work stands on the Guardian.** `KIND_BEING` places `forge-job` on the
  Guardian (`server/lib/orgMap.js:79`); the plan's Projects district and its
  Builder (AGENT-WORLD-PLAN §3a) were never built.
- **The skill grid vanishes without a word** when the registry is empty
  (`Ops.jsx:266`), unlike every other section's honest empty line.
- **No as-of anywhere.** The payload carries `at` (`server/lib/ops.js:330`) and
  `liveOps` is a cached offline slice; the page never says when its picture is
  from. Ambient does (its sync-age corner).
- **Ambient's door, corrected.** The checklist's P10 says Ops holds "the only
  door to the wall display". Under summary the door is the Index's Nova group
  (`indexGroups.js:14`); Voice's ◐ Ambient chip (`Voice.jsx:587`) exists only
  in the classic station, only while live, and summary never renders it
  (`Voice.jsx:91`). Nothing on Ops opens Ambient.
- **The proposal copy says "its own".** The filing-ladder proposal reads "Let
  Nova file everything on its own"; Nova is he (his call, 3 Oct).

---

## 3 · Keep

- **The Org Map's honesty machinery.** Every one of 39 scheduled loops and 9
  conversational lanes is placed on a being, the core, or a named unfiled
  list, pinned by `orgMap.test.js`; working means a record classifying within
  30 minutes, never a guess; no model and no network to look at it
  (`agentWorldNoModel.test.js`); the loop sleeps between blinks and off
  screen; reduced motion gives still poses.
- **The beings themselves**: one species, his calls on faces, artefacts and
  hues, and the habitat's zero-token life. Nothing in this round redraws them.
- **The Inbox round's objects**: the big gold numeral with one door, the
  Coach-deck proposal (Accept · Talk about it · Skip), loop rows with the house
  skeleton while loading (Todoist), loop settings in GlassSheets, the ladder
  with the dashed proposed step. All 44pt.
- **The code-written serif sentence** (`orgHeadline`): keep that it is code's;
  change what it says.
- **The Mac sessions' writing**: plain states ("Waiting for you: it has
  something to say or a question"), the server's order (hands raised first),
  the close confirm that says the conversation is kept.
- **The honest absences** in the agent detail ("leaves heartbeats, not inbox
  records", "no skills mapped yet", "registry unavailable") and the overnight
  queue's empty line.
- **The Forge's receipts**: cost shown only when real, Stop while running.
- **Sideways drag turns, vertical scrolls** (`touch-action: pan-y`): the map
  never takes the page's scroll.
- **The request labels in human words** ("Siri asked Nova", "Coach was
  asked"), and the camera tween to a tapped being.

---

## 4 · Directions for the mockup round

Drawn as `design/mockups/73-redesign-ops.html` (A, B and C switched at the
top, four 390×844 frames each). The numbers below are the page measuring its
own first frame with the same rules this audit used (objects are the cards,
rows, chips and buttons above the dock line; type sizes exclude numerals and
the system chrome). Today: 17 objects above the fold, 8.5 screens, 13 type
sizes, smallest control 8×12, 28 of 53 controls under 44pt.

**A · The org is the page.** Nova and the ten beings are the first screen: a
waiting line (18, one door to the Inbox), the map, and a bench of ten faces
(each a 44pt door with its gold count, a red mark for a failure, a turning
ring for work) that flies the camera to a being and raises its card as a
sheet. Every ask (tick, cross, one do-all, Talk), loop (a day of heartbeats,
Run now on a quiet one), skill (a trust ladder: watch, propose, act on your
yes), receipt and consult ("Nova asked it twice; it asked the Researcher
once") lives on the being that does it; Nova's card holds his proposals, the
filing ladder, the ways in and hands, and Talk to everyone. Removes from the
scroll: the topology, the spare core, the nine-lane list, the skill grid, the
pill row, the log. Moves: the seven loops onto their beings (Daily review to
the Leader; Briefs, Open promises and Todoist to the Commander; Compost and
Guardian to the Guardian; Meal prep to Meal Prep). **Measured: 12 objects
above the fold (ten of them the faces), 2.7 screens, 4 type sizes (34 · 20 ·
15 · 13), smallest control 44.**

**B · Your order, made light.** Keeps his 27 Sep order on top (the 18 card,
now with the faces of who is asking, then Nova's proposals), then Now (the
failure with Retry, the Researcher's progress ring, the Forge's step rail,
this Mac's pulse), then the heartbeats as one picture (48 dots in eleven hue
columns, failures red, quiet ones dashed), the org as a living card that opens
full screen one being at a time, and the machinery as eight rows one tap down
(Filing, the Forge, Overnight, This Mac, Skills, Connections, Receipts,
Ambient). **Measured: 6 objects above the fold, 2.8 screens, 4 type sizes,
smallest control 44.**

**C · Vital signs.** One instrument: eleven lanes (Nova and the ten), each a
day of heartbeats in its hue: a blip is a beat, a tall spike is work done, the
right edge is now, a live line is work happening, a red notch is a failure,
the gold at the end is what it asks. A lane opens in place into its loops and
asks; a Pulse and Org switch puts the map one tap away. **Measured: 14 objects
above the fold (the lanes), 2.1 screens, 4 type sizes, smallest control 44.**

**What the pixels argue for.** The structural move every direction shares is
the same: the topology, the skill grid and the log leave the scroll, the 18 is
said once, one roster (the map's) is the only roster, and the being card can
answer. Between them, the choice is what leads: the beings (A), his own order
(B), or the org's health (C). A answers his standing calls most directly
(faces, hues, artefacts, talking to any agent) and finding 3 by design; B is
the smallest step from what he approved on 27 Sep; C is the most glanceable
and the least like any other page in Nova. Finding 5 (the constant) and the 8×12
✕ are fixes in any direction.

---

## 5 · Method

**Two kinds of frame, both in demo mode.** A detached worktree of `main`
(922ffc6 at the time) ran Vite on 5203; the chrome-devtools MCP opened it in
an isolated context at 390×844×3 (mobile, touch) and later 1280×800×2, his
look set in `localStorage` (`novaos.style=summary`, `theme=command`,
`material=glass`, `core=hologram`), with a guard that rejected every non-GET
fetch, XHR and beacon. "Demo data" was on screen throughout and
`connectionStatus` stayed `demo`.
1. **The true demo render** (two frames, 390 and 1280): Ops in demo mode is
   the Command header and one line (finding 9).
2. **A harness render of the connected layout.** Because demo mode hides
   everything on Ops, the dev hook `window.__novaApp` was used to wrap
   `renderVals()`: the real `valsOps()` (imported from `/src/vals/valsOps.js`)
   was given a fake `app` whose state held a demo-shaped `liveOps`, skills
   registry (the seed's 31 skills), Forge jobs, overnight queue, stream and Mac
   sessions, and the real `composeOrgMap()` (imported from
   `/server/lib/orgMap.js`, which is pure) built the map from demo-shaped
   records. `inboxSummary.ops` was a hand-built object in the shape
   `valsInboxSummary` returns. Every action was a no-op. The real `Ops.jsx`,
   `OpsInboxHead.jsx`, `OrgMap.jsx` and `scene.js` drew the result. The names,
   counts and times are invented (18 waiting: Researcher 5, Coach 4, Guardian 2,
   Watcher 2, CFO 1, Librarian 1, Leader 1, his own notes 2; 39 loops with two
   gone quiet and one never run; nine lanes; 40 stream events).

**What the harness can and cannot say.** Structure, sizes, controls, type,
order and page height are the components' own, so the clutter numbers hold
for the connected page. The content lengths are demo-shaped: his real stream
has 40 rows when he has used Nova for a day (the server's limit is 40), his
registry may differ from the seed, and his session list will differ.

**Network.** Across every navigation the page made two GETs (an icon from
Vite) and nothing else; no request reached his server, and the guard recorded
no blocked write. One honest gap: switching the viewport to 1280 reloaded the
page, and the re-navigation to the same hash was a same-document change, so
for the minutes until it was noticed and re-installed the guard was absent. The
network log for that window shows only the same icon GETs; the app had no
connection configured, so it had nowhere to write.

**Sweeps.** Type sizes: every element with its own text node inside `main`,
deduplicated by computed `font-size`, numerals (text of digits only) apart.
Controls: buttons, inputs, links, ARIA buttons, radios, list items, and any
element whose computed cursor is a pointer, outermost only; the smaller of
width and height. Objects above the fold: those controls plus the cards and
pills intersecting the band between the top bar (48pt) and the dock (776pt at
390). Page height: `main.scrollHeight`. Width: `documentElement.scrollWidth`
and `main.scrollWidth`.

**HIG pages opened and quoted:** accessibility, layout, typography, color,
designing-for-ios, designing-for-macos, lists-and-tables, feedback, loading,
motion, writing, scroll-views, modality, charting-data, buttons,
design-principles.

**Not seen.**
- His real data: live heartbeats, real asks, the real stream, his Mac sessions,
  his registry page. Every count above is demo-shaped.
- The cupertino and command idioms (summary only, his style since 3 Oct).
- The 3D map at speed: headless Chrome draws WebGL through SwiftShader at a few
  frames a second, so the map's look is judged from stills and its motion from
  source (`scene.js`, `life.js`). Walks, acts and blinks were not watched.
- A real tap on a being in 3D (the pill takes the same `select` path); the
  drag-to-turn gesture; the loop settings sheets; Calm; offline; a running
  Forge build or overnight run.
- The marker digits' size is an estimate from a still (they are canvas
  pixels).

**Inventory notes, confirmed or corrected.**
- "Three screen-sized systems stacked on one route": **confirmed and
  extended** (four, plus a 1,504pt log).
- The skill grid as "same-shape bordered cards": **confirmed**, 1,558pt at 390.
- Ops.jsx is 364 lines, not 349: the summary head (`OpsInboxHead`, 27 Sep)
  arrived after the inventory, and the human gate and numeral header now
  render only when it is absent.
- P10, "the only door to the wall display": **corrected** (finding 17).
- P2, the human gate: under summary it is replaced by the head's 18 card.

---

## 6 · His answers, round 1

(Waiting. Mockup: `design/mockups/73-redesign-ops.html`.)
