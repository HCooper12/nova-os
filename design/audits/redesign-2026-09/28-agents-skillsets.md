# 28 · The agents and their skill sets (mockup 97)

Mockup: `design/mockups/97-agents-skillsets.html`. Design only. No app code changed.

## His ask
"I want this kind of dynamic UI incorporated. For now possibly for a view of all the agents and a list of their capabilities etc, like a skill set list." Reference: the 55 s glass-slab reel. From it we take the curved floor, the arc of slabs, the dissolve into particles, the reticle lock and the turning head. We leave its purple neon and chrome type behind.

## What exists today
- Org map (`src/orgmap/OrgMap.jsx`, `src/vals/valsOrgMap.js`): the ten beings and what is waiting on him. No screen lists what each agent *can do*.
- Skill registry (`server/lib/skills.js`): seeds `Wiki/Library/Nova Skills.md` with built skills by department and an autonomy tier for each. Agents read it. No screen shows it.
- Working-now rule (`src/vals/agentsWorking.js`): the only honest source for the "working" dot.
- Consult rail (`server/lib/consult.js`): askable agents are Nova, Coach, Leader, Researcher, Librarian and CFO. Commander, Guardian, Watcher, Meal Prep and Practice are not on it yet. The mockup marks this as "not yet".

## Data sources per element
| Element | Source |
|---|---|
| Roster, order | `orgMap.js` BEINGS |
| Hue | `agentWorld/beings.js` BEING_HUES (`--nv-*` tokens) |
| Skills + tier | `skills.js` SEED, cross-checked against each lib file (cited per row in the HTML) |
| Working now | `agentsWorking.js` workingBeingIds |
| Last ran / never run | `orgMap.js` fresh (heartbeats) |
| Runs, last two weeks | inbox records by `KIND_BEING`, via /api/ops |
| Who he can ask | `consult.js` AGENTS |

Live values in the mockup are tagged DEMO.

## Skill counts drawn (built / not yet)
Commander 6/1 · Coach 7/0 · CFO 4/0 · Guardian 6/1 · Researcher 4/0 · Watcher 3/1 · Librarian 5/0 · Meal Prep 5/1 · Leader 4/0 · Practice 2/1. Total: 46 built and 5 marked not yet.

## The proposal
- An arc carousel of glass slabs. Drag is 1:1. Release uses Apple's momentum projection and a critically damped spring to snap, and the ends rubber-band. The centred slab, the floor glow and the page dots take that agent's hue.
- Tap a slab: it dissolves into particles, the reticle locks, the particles gather into a face holding its artefact and turn once, then the sheet rises. On a phone the sheet comes from the bottom. On the Mac it docks at the right. Back runs the same path in reverse.
- The sheet shows a tier bar (observe / propose / act), grouped skills tagged with what each touches (vault, calendar, web, Inbox, health, bank), who he can ask, and a two-week runs strip.
- States: loading (skeleton slabs), Mac unreachable (the skills still show, live values are withheld and the slab says why), never run, working now.
- Reduce motion: no canvas loop and no slide. The slab cross-fades to a still face and the sheet cross-fades in.
- Entry point: recommend a new "Agents" row in More → the Index, using `agentsWorkingLabels().index`. A tap on a being in the Org map opens the same sheet. This is a place, so neither Home idiom gets a new card. Both idioms already reach the Index.

## Performance
- Slabs move by transform and opacity only: 10 layers, about 6 visible. The backdrop blur is not re-rasterised under a pure transform.
- Particles run on one 2D canvas, capped at 700 on a phone and 1,100 on a Mac, one 2 px fillRect each. The budget is under 2 ms a frame. The loop runs only for the 1.3 s open and the reverse, never at rest.
- Not yet measured on his iPhone. The build must record it there (motion-check rule).
- Built for real, the face should be the actual 3D being from `src/agentWorld/beings.js`, rendered once to an offscreen canvas and sampled for particle targets. The mockup samples a 2D stand-in.

## Verified
- Opened in chrome-devtools at 390x844x3 (mobile, touch).
- No sideways scroll (scrollWidth 390) and no console errors.
- Tested working: drag-flick, rubber-band at the start, tap to open (7 skills rendered), back, and reduced-motion open and back.

## His decisions
1. When an agent is tapped, should the light form his 3D face or only his artefact? Recommended: the face.
2. Should this be a new "Agents" row in More, or live inside the Org map? Recommended: the More row.
3. Should skills that are not built yet show in an agent's list, greyed out? Recommended: yes, in the open list only.
4. Should the carousel turn by itself when he is not touching it? Recommended: no.

---

# Round 2 (11 Oct): the characters play at the glass

His ask: "I'd also like the 3D characters to 'play' around the card... jump up and down in front of it, hide behind the card and peek out, go under and around the panel, etc." His answers to round 1: the open moment is the character's own; no new row; planned skills stay greyed; add SUGGESTED skills with evidence; the carousel is still until he swipes.

## What changed in the mockup
- **The real beings.** The mockup imports `src/agentWorld/beings.js` (createBeingKit, BUILD[id], face3, b.tell) on three r160, the same way mockup 49 does. He sees the same characters as on the Org map. Opened as a plain file, the browser blocks the module import; the page falls back to the artefact marks and says why. Serve the repo over http to see the characters.
- **One live being per screen.** He stands at the centre slab. The other nine show still portraits on their slabs, each rendered once at load from the same kit.
- **The plays** are key tracks: position along the slab, height up it, in front of or behind the glass, yaw, roll and squash.
  - Jump in front
  - Hide and peek from an edge
  - Round the back
  - Lean on it
  - Sit on top
  - Peek over the top
  - Tap reactions: hop, duck, nod
- **Behind the glass.** "Behind" moves his canvas layer under the slab layer, so you see him through the panel's frost.
- **Personality decides the mix and the tempo.** Coach jumps and leaps to the top (×1.3). The Librarian peeks and ducks when tapped (×0.7). The Guardian patrols round the back (×0.8). The Leader leans and nods. The full table is drawn on the page.
- **"Under" became "round the back".** The glass stands on the floor, so going under means lifting every slab. This is one of his calls.
- **When plays fire:** only on the centre agent, every 7 to 12 s, after the arc settles. Never during a drag, while a sheet is open, or under reduced motion.
- **Open:** he hops onto the rising sheet's edge and rides it up. He stays at its top while you read. Back runs the same path in reverse and he steps down to his slab. On the Mac he rides the sheet in from the right.
- **Honest working:** a working agent does his own working tell from the Org map (b.tell with working = true). He never plays. A tap only turns him toward you, and a line under the slab names the job. The Mac unreachable means no plays, because play would claim he is idle.
- **Reduced motion:** the characters stand still. The sheet cross-fades and he appears at its top without travelling. A tap changes only his expression.

## For the build
- Express the plays as new `ACT_FRAMES` entries in `src/agentWorld/acts.js`, using ctx.body gait and ctx.arm for the lean. The Org map and this view then share one rig language.
- The mockup moves the whole rig; it does not pose arms.

## Where it lives (his answer: upgrade, no new row)
- **Mac:** the AGENTS roster already in the sidebar (`src/Sidebar.jsx` line 67, fed by `valsChrome.js` `agents`). Each row opens this view on that agent.
- **Phone:** More → Index → the existing Ops row (`src/screens/Index.jsx`, `valsIndex.js` case 'ops') → `src/screens/Ops.jsx`. The Org map there (`src/orgmap/OrgMap.jsx`) gains an "Org map | Skill sets" switch. Tapping a being opens Skill sets on him.
- No Index row is added. Neither Home idiom gets a card.

## Suggested skills: the evidence and where it is read
Each suggestion shows its kind, the count, the evidence in words and the source. He answers with a tick or a cross.
- **A tick** files it as "not yet" on the build list. It never grants the skill.
- **A cross** retires it for 60 days.
- **The rails:** it would be a pending Inbox record (`kind: 'skill-suggest'`, undoable), following the autonomyLedger.js precedent: proposed, never assumed. The 60-day cooldown is the rule respectTheNo.js already applies there.

| Evidence | Source | Exists today? |
|---|---|---|
| You asked; nobody could | `server/lib/conversationLog.js` (every spoken exchange) | Record **yes**. No detector of "no agent can do this" replies. The build needs a deterministic one, keyed on intent-route misses (`intentRouter.js` returning no lane in `capabilities.js`). |
| You did it by hand | session date edits, food and rotation edits, filings with `auto: false` (`inboxStore.js`) | Raw edits **partly**. Nothing counts repeats yet. |
| You handled it in the Inbox | records filed or rewritten by him (`auto: false`) and declines, by kind (`orgMap.js` KIND_BEING) | **Yes**. Read today by the autonomy ledger. |
| Another agent can lend it | `skills.js` registry crossed with `consult.js` turns | Registry and consult turns **yes**. No matcher. |

**A shared-format note:** marking a ticked suggestion "not yet" in `Wiki/Library/Nova Skills.md` needs a fourth tier in its `ITEM_RE` contract. Every reader of that page must change with it, or the backlog lives in `design/AGENT-SKILL-MAP.md` instead.

**Every count in the mockup is DEMO.**

## Performance
- One WebGL canvas per screen, one live being in it. No shadow map. Pixel ratio is capped at 2, and lower on the scaled Mac frame.
- Render cap: 30 fps (the Org map's cap), only while he plays, reacts, rides or works. At rest the loop stops.
- An IntersectionObserver sleeps a screen that is scrolled away.
- Portraits cost one render each, once.
- **Budget:** under 8 ms a frame for the being on an iPhone, under 4 ms on the Mac. **Not measured on his phone**; the build records it with the motion-check harness.

## Verified (chrome-devtools, isolated context "mock97b", 390×844×3 mobile touch, repo served on a local port)
- The real beings load, and all 10 portraits render.
- No sideways scroll (scrollWidth 390). No console errors; one three.js deprecation warning, the same one mockup 49 shows.
- Tested working:
  - the hit test on the character (solid meshes only, so a drag that starts near him still swipes)
  - drag
  - the Researcher in his working tell, with the job line
  - sit on top
  - open, with Coach riding the sheet
  - tick on a suggestion: the row arrives in "Not yet"
  - back
  - reduced-motion open and back
- The Mac live being starts when that frame scrolls into view.
- Not tested: real touch on his phone.

## His decisions (round 2)
1. While he reads a skill set, should the agent stay at the top of the sheet or go back to his slab? Recommended: stay, still and blinking.
2. Should a ticked suggestion go straight onto the build list, or open a talk with Nova first? Recommended: straight on, with talk one tap away.
3. Should the glass lift off the floor so agents can go under it? Recommended: no; round the back gives the same hide.

---

# Build (11 Oct): what the suggestion signals read today

| Evidence | Built from | Status |
|---|---|---|
| You asked; nobody could | the conversation record, read only: a Nova reply matching a narrow "could not" pattern after his question, laned by its words (`skillSets.js` MISS_RE, LANE_WORDS); 2 or more in 28 days | **live** |
| You did it by hand | his own captures (no agent kind) filed to one route, 5 or more in 28 days | **live**, captures only; session date and rotation edits are still not counted |
| You handled it in the Inbox | an agent kind he declined 3 or more times in 28 days, with his most common reason | **live** |
| Another agent can lend it | no matcher | **not yet**; nothing is raised from it |

A tick files an Inbox record (`kind: 'skill-suggest'`) on the existing `skill-backlog` route, so the line lands on the registry's Backlog as "Agent: skill", with Undo. The Backlog contract is unchanged. A cross is kept in `server/data/skill-suggestions.json` for 60 days, with Undo. The registry today gives the Watcher no skills, so his slab says so.
