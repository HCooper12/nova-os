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
