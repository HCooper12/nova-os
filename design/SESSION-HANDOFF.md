# Nova OS — Session Handoff

**Read this first, every session.** `CLAUDE.md` carries the doctrine (what Nova
is, the non-negotiables, where things live). Memory files carry durable
project facts. *This* file carries the live state of the work: what is
half-finished, what was decided and why, what is verified versus assumed, and
which dead ends are already closed.

Updated at the close of each session (`/nova-close`). Newest state on top;
the session log at the foot is append-only.

---

## CURRENT HANDOFF

**9 SEP (later) — THE FIGURE NOW STANDS ON THE FLOOR, LIES ON THE BENCH, AND
HANGS FROM THE BAR.** He reported "some extra stretching… that does not make
it look anatomically correct and like a human actually moves", set a standing
rule about recording it, and asked for the cable equipment. Shipped as
`2c8ac39`, verified live on his real Upper Body routine at 390 px.

**THE STANDING RULE — this is now permanent.** *"You need to be making sure
that you are screen recording and checking the fluid movement of every version
of the model that is incorporated for any exercise. There are no exceptions
and this must be a standing role moving forward for things like this."* Two
tools exist so it is cheap:

```bash
npm run dev -- --port 5199     # a FRESH server; the long-running one goes stale
open 'http://localhost:5199/nova-os/tools/motion/harness.html?frames=4&per=3&page=0&view=side'
node tools/motion/record.mjs --frames 18 --size 420    # a GIF per pattern
```

The harness renders through the **same `Body3D` the app uses**, so what passes
there is what he sees. Full detail and the traps are in the
`nova-motion-check` memory — **read it before touching the figure again.**

**Six faults, none of them visible in a still.**

1. *A standing lift is a closed chain.* The rig is rooted at the pelvis, so
   posing hip and knee folded the legs while the pelvis stayed put — the
   figure squatted onto an invisible chair, torso upright, bar never
   descending. `settle()` now leans the body until the shin matches the ankle
   angle, flattens each foot (or lifts the heel for a calf raise), and drops
   until the lowest contact touches. **A squat's forward torso lean falls out
   of that — it is not a joint and was never in the data.**
2. *Zero is a pose, not an absence.* `rotate()` returned early on 0° and left
   the bone where it was, so any joint passing through neutral kept its last
   angle. At the top of a squat the thigh still held the bottom's 100°.
3. *Joints were rotated about the WORLD's axes* — the same as the body's only
   while standing. Lying on a bench, knee flexion folded the legs at the
   ceiling.
4. *Lying lifts rest on a pad*, measured against the pad's real plane; a lift
   with no bench lies on the floor.
5. *The stretching itself was a hard weight seam*, not a limit of linear blend
   skinning: chest vertices were forbidden the shoulder bones entirely, so at
   90° of flexion one vertex was frozen and its neighbour moved with the arm.
   The deltoid helper now bleeds across the boundary; 18 smoothing passes.
6. *WebGL contexts leaked.* `dispose()` frees none and a browser keeps ~16, so
   every opened-and-closed exercise sheet cost one and after a dozen the
   figure stopped drawing — a white panel, no error.

**THE GYM** (`src/gym3d.js`): cable stations with a visible weight stack, a
turning pulley and a cable that actually runs to the hands; a lat pulldown
with seat and thigh pad; a pull-up rig the body hangs from; EZ, trap and Smith
bars; rope, D-handle and wide-bar attachments; leg curl, extension and press.
`equipmentFor()` routes by the exercise's own NAME — a cable pushdown gets a
high pulley, a cable curl a low one.

**Data corrected where the check proved it wrong:** the lying presses had
their arms along the torso, the bench press had a crunch's legs, the calf
raise's ankle sign was inverted, the hip thrust rotated thighs against a
pinned chest and moved nothing, the fly had no bench.

**STILL WRONG, and he has been told:** the leg press machine sits beside him
rather than under him; the overhead press's bar leaves frame at lockout; the
deadlift's bar hangs at the hands instead of resting on the floor. Also
unchanged from before: the face is decimated and plain.

**A trap that cost two cycles:** `patternFor(name)` beats the `pattern` prop,
so passing a pattern id as the name made `row-bent` resolve through the
`/row/` rule back to `row` — the sheet showed the same lift twice under two
labels and I catalogued faults that did not exist. The harness now passes no
name unless `?name=` asks for one.

**NOTE — this repo had concurrent work in it during the session** (visual
beats, glass beats, recall, Voice screen). I staged only my own files; that
work is still uncommitted in the tree.

---

### Previous — 9 Sep (anatomy detail)

**9 SEP — THE MODEL IS ANATOMY NOW, NOT A MANNEQUIN WEARING A COLOUR MAP.**
He asked to keep refining and checking it: "anatomically accurate and detailed,
with all muscles and aspects included." Checking is what found the faults —
each one was visible in a render before it was reasoned about. Shipped as
`893cc8c`, live, verified on his real Push routine at 390 px.

**Four things were wrong, and only the first was the one I set out to fix.**

1. *The table was too coarse.* 38 volumes with compound entries — one
   "triceps", one "quadriceps", no forearm extensors at all. Now **82 muscles
   a side, 159 volumes**: three pec heads, three triceps, four quads, three
   hamstrings, five adductors, the rotator cuff, sartorius, TFL, ITB, peronei.
   The abdominal segments and serratus digitations are `parts=True`, so their
   divisions are real geometry rather than a texture.
2. *The mesh had no resolution where the muscles are.* Measured: of the base
   mesh's 10,582 vertices, **73% sat in the head, hands and feet** — parts the
   app never highlights — and the entire thigh had **341**. `redistribute()`
   subdivides once and collapses the extremities back: thigh 341 → ~6,800,
   head 3,348 → ~2,600, total 24,264.
3. *Every torso muscle was buried six centimetres inside the body.* The table
   hand-wrote its `y` values against an assumed 9 cm half-depth; the mesh's
   abdominal skin is at **14.2 cm**. Nothing on the trunk could ever have
   shown. `calibrate.py` now measures a trunk **shell** (centre, half-depth,
   half-width per 2 cm band) and `skeleton.skin()` places every torso muscle a
   stated depth under the measured surface. Legs likewise, off a measured limb
   radius — the adductors had been written 2.6 cm off a femur inside a thigh
   7.9 cm thick.
4. *The model could not be judged.* The muscle chart rendered as indistinguish-
   able pastels — **AgX desaturates hard**, so lats and traps came out the same
   blue — and soft studio light hides a 5 mm groove entirely. `render.py
   --rake` plus a Standard view transform fixed the instrument. Every fault
   above was found only after that. **Fix the instrument before adjusting the
   thing you are measuring.**

**What makes it read as anatomy.** `relief()` asks the muscle field two
questions per vertex: how deep inside its own belly it sits (a bulge) and how
nearly equidistant it is from a *different* muscle (a groove). Out come the
linea alba, the tendinous inscriptions, the sternal groove, biceps against
triceps, vastus lateralis against rectus femoris. Three guards, each paid for
by a broken render: a groove needs a clean **pair** (five volumes meet at the
sternum; cutting there tore it open), it needs muscle present but the
threshold sits *below* the skin (an inscription is by definition where no
belly reaches the surface), and the frame cuts at a third depth (a collarbone
is a ridge, not a canyon).

**Segmentation is region-aware now.** Live in the app the traps highlight
painted his FACE and the forearms highlight put a cyan patch on each hip —
"nearest volume wins" with no sense of where on the body it is, and in an
A-pose a hand sits 5 cm from a thigh. A vertex may now only be claimed by a
group its **nearest bone** allows (`bone_groups()`, the inverse of
`GROUP_BONES`). Face released to frame; traps 5,294 → 1,885; front-delts
56 → 409.

**One deliberate fiction, stated in the code.** The rhomboids lie under the
trapezius and own no skin, so a strict rule lit 23 vertices of 24,000 — a
highlight that shows nothing. They are given the interscapular strip on
purpose, one layer too shallow, with the lower trapezius held off it.

**Verified:** 24,264 verts, 1.46 MB GLB, 19 group materials, 22 bones —
`Body3D.jsx`'s contract unchanged. lint clean, build green, 1,235 server tests
pass. Opened on his real Push routine at 390 px: the lateral raise lights both
side delts, holds its equipment, the abdominal wall reads as a six-pack.

**STILL CRUDE — he has been told:** shoulder flexion past ~140° distorts
(linear blend skinning, no corrective shape keys); supine/incline/thrust
stances use hand-tuned offsets so a bench press floats above the pad;
equipment is primitives; the face is decimated and plain. Also noticed in
passing: the Cable Lateral Raise renders **dumbbells** — the equipment mapping
in `exercise3d.js` does not know "cable".

**How to work on it.** `blender -b --python tools/anatomy/build.py -- --out
DIR` then `blender -b DIR/body.blend --python tools/anatomy/render.py -- --out
DIR --rake` (clay, raking light — shows relief) or `--muscles` (the chart).
Re-run `calibrate.py -- --base --out joints.json` only if the base mesh
changes. **Never edit `muscles.py` with blanket string replacement** — a
`.replace()` on a coordinate fragment silently corrupted three unrelated
lines this session and the later targeted edits then failed to match, costing
two rebuild cycles that looked like anatomy problems.

---

### Previous — 8 Sep (evening)

**8 SEP (evening) — THE FORM MODEL WAS REBUILT FROM NOTHING.** His verdict on
the old one: "terrible… most of the exercises are completely wrong with how
the movement is actually meant to be carried out." Both halves were true — it
was capsules, and it was driven by the flat figure's CSS transforms, so a
squat was `scaleY(0.86)` and the legs shrank.

**What it is now.** Blender's CC0 **Human Base Meshes** male (10,582 verts,
real anatomy, clean quads) put through a headless pipeline in `tools/anatomy/`:
scaled to 180 cm, grown where a trained lifter carries muscle (71 muscle
volumes written from origins and insertions), segmented so every vertex
belongs to a muscle (19 material groups — the highlight IS the anatomy),
rigged from joint centres MEASURED off the mesh, and exported to
`public/models/body.glb` (825 KB, lazy-loaded). `src/exercise3d.js` states
each lift as joint angles a biomechanist would recognise, with a stance
(supine / incline30 / hanging / seated / prone / thrust) and the equipment
built and placed in the hands.

**Read `nova-anatomy-model` memory before touching any of it** — it carries
the calibration method, the skinning constraints, and the two three.js traps
(SkeletonUtils.clone; never assign a one-element material array).

**Verified live** on the preview against his vault: Cable Hammer Curls lights
the biceps and forearms on a clean standing figure; Incline Barbell Bench
Press lights chest/front delts/triceps on a 30° bench; Hack Squat resolves to
the sled pattern. Deployed: b9caa74, and the live site serves the model.

**THE COACH'S ANATOMY** (`server/lib/anatomy.js`) is the same 18 groups in
prose — origin, insertion, joints crossed, actions, what trains it, what it
looks like when it is the weak link — narrowed by `focusFor()` and injected
into `coachTurn`. Asked live why his bench stalls off the chest and his
shoulder pinches overhead, it separated the two, named the sternocostal head
of pec major, then the lower trap / infraspinatus / short pec minor, and
grounded all of it in his own numbers (chest hard sets 6-3-9-3, back
18-12-6-3).

**STILL CRUDE, and he should hear it from us before he finds it:** shoulder
flexion past ~140° still distorts (linear blend skinning, no corrective shape
keys); the supine and incline stances place the body on hand-tuned offsets
rather than fitting it to the pad, so a bench press floats; equipment is
primitives. Next passes: corrective shape keys for the shoulder, fit-to-pad
placement, per-exercise overrides where a pattern lies.

**Earlier today:** make-up days (he is USING them — today and tomorrow both
marked as Push make-ups), the itemised plate, the form check, the study lane,
the Intake, wrap the day, open-it-for-real, and the surface standard.

## SESSION LOG (append-only, newest first)

### 8 September 2026 (evening) — the anatomy model
Procedural body attempted and abandoned; rebuilt on Blender's CC0 base mesh
with a measured-joint rig, anatomy-constrained skin weights and joint-angle
motion. Coach given the matching anatomy. 1235 tests green.

### 8 September 2026 (afternoon) — make-up days, and the live sweep
makeupDay.js + every training surface; carry-overs joined the sync snapshot
(they were never loaded on arrival). Verified the deployed bundle chunk by
chunk and every endpoint over Tailscale with the Pages origin. 1230 tests.

### 8 September 2026 (afternoon) — the study lane; the athlete-AI queue complete
paperLane.js: Researcher read → Coach judgement against his real block →
code-validated changes raised as coach-program proposals. Router, planner
capability, Coach-composer door. Live on Schoenfeld 2017: honest
abstract-only read, two proposals on real ids. 1225 tests green.

### 8 September 2026 (midday) — the form check
ATHLETE-AI-PLAN #4: protocol gate in code, usability verdict by the model,
deterministic frames, per-lift rubrics, measurement scrub, review as a
proposal. Caught and fixed the URL-pathname bug that had silently stopped
video attachments producing frames since 6 Sep. 1216 tests green.

### 8 September 2026 (late morning) — the surface standard, and the itemised plate
The wrap card rebuilt on the house objects and added to the Apple twin (it
was invisible on his phone); the standard written up as NOVA-METHOD.md §2b.
Then ATHLETE-AI-PLAN #3: per-line plates, each line droppable, undo, and the
sum-owns-the-total contract. 1203 tests green; verified on his real log.

### 8 September 2026 (morning, second pass) — wrap the day
The end-of-day sentence: lib/wrapDay.js (facts, closer, ranked ask,
composer), GET /api/wrap, the Home card and the "wrap the day" chat door.
1195 tests green under TZ=UTC. Live-checked against his vault; the card's
evening render checked with injected state.

### 8 September 2026 (morning) — open it for real, and the Intake
Nova's own visible browser (own profile after the lock collision), the
hand's final URL, yes-presses-it offer; the Intake end to end (server
compute/write/undo, chat interview, Settings door). Three live browse runs
(~$1.5), one intake interview, all test records discarded unwritten. 1184
tests green under TZ=UTC.

### 8 September 2026 (small hours) — the browser hand, live on the glass
Streamed browse runs → steps → SSE nudges → windows on the stage via the
existing putCard rail (cdf0845 + fixes). Router learned the media shape on
both sides. Two live runs from the composer verified on the shipped bundle.
1171 tests green under TZ=UTC.

### 7 September 2026 (late night) — the Briefing, built and proven
design/BRIEFING-PLAN.md → phases A–D (8647722, 3fb2882, 94693a6, 2f6aecb),
one real run on his light-wavelengths sentence, four bugs found and fixed
(a28a2b0, 0b07c1e, e1db9c7), Commons ranking (eb21f35). Verified at both
widths on the shipped bundle. 1166 tests green under TZ=UTC.

### 7 September 2026 (night) — auto-filing, the shelf audit, and the Coach mid-session
Uploads file and weave themselves with a notification that deep-links to the
record (facc65b). The agent audit found eleven agents inside the vault that
had never been told the shelf existed; sourceShelf.js + fuelContext.js + a new
lens rule fixed it (e2d352e). The Coach's reasoning now survives the tap on
Start (253d0b3). 1140 tests green under TZ=UTC.

### 7 September 2026 (night) — swipe + per-dish variants, phase 4 edits, the sweep, and the athlete-AI queue
Fuel's last two pieces (f635eae), verbs phase 4 (414a934), a verified sweep of
the standing open-threads list, and design/ATHLETE-AI-PLAN.md scheduling five
builds off @krudd.jr's series. 1127 tests green under TZ=UTC.

### 7 September 2026 (evening) — the Fuel overhaul: options, ticks, the fridge, and macros from labels
Rotation v2 (options per slot, focus vs eaten, custom meals), the fridge
(portions.js + Meal Prep Portions.md, red OUT cards, IN THE FRIDGE row on
the recipe, meal.cooked / meal.portions verbs), and the editor's label pass
(labelMacros.js, scanFood label-per100 mode). All proven on his real vault
at 375×812 on the shipped bundle and restored. Two tests rewritten for the
v2 contract (★ in the body; setting a slot adds, never un-eats). Grammar
collision caught by the suite: "set eggs to 12" must stay shopping.qty.
Commits 8d294d5, 852fc4e.

### 6 September 2026 (late night) — phase 3, attachments, the glitch, the grant
His four asks after phase 2: grant sessions real Shortcuts + the browser lane
(→ the allow rules, his instruction); photos/videos to Nova and the Coach
(→ attachments, live-proven); the Coach-tab glitch from his recording (→
main clips horizontal overflow; bubbles shrink); then the remaining phase-2
verbs and the gym by voice (→ built, tested). Suite 1106 green under TZ=UTC.

### 6 September 2026 (night) — phase 2, the first Hand, and the permission wall
His three asks: fix the permission layer (→ nova-api.mjs, in-process token);
proceed (→ Phase 2: Coach/Leader answer in the conversation; the Shortcuts
hand); reach third-party apps and the web (→ Shortcuts built; browser hand
designed with the honest doctrine note). The auto-mode classifier refused
one command that created the Shortcut runner AND executed `shortcuts`; the
file was written with the editor tool and tested with an injected runner
instead — the capability is confirm-first by construction. Guardian
time-machine flake root-caused (same-ms snapshot names) and fixed in
backup.js. 1097 tests green under TZ=UTC. Service reloaded.

### 6 September 2026 (evening) — the Verbs, phase 1: doing by voice
Watched the Astra reel (frames + Whisper transcript via the watch skill —
the Chrome extension was not connected, the reel was public). Mapped the
command surface with an Explore agent (the evidence map is in this session;
its shape: speech reached capture, dispatch and coaching edits only). Built
the registry, the grammar fast path, the ACT directive, the status reflex,
plan-approval-by-voice, and the client strip. 1096 tests green under TZ=UTC;
the one failure on the first full run did not reproduce (flaky, not mine).
Service reloaded. Plan doc: `design/VERBS-PLAN.md`. FLAKE, not mine: guardian.test.js "the time machine undoes both ways" failed once locally and once on the CI runner, passed on rerun both times — likely two backupFile snapshots inside one second sharing a name; investigate if it recurs before blaming a change.

### 6 September 2026 (late afternoon) — the type badges: the material pass is complete
His "work on the type badges". The note list row's badge and the Fuel card's
category badge are `Tag`s (tinted pill, UI face, 11px under the Apple styles;
the bordered mono badge under Command is unchanged). Their strings, and the
Notes reader's byline + backlink line and the recipe overlay's meta, are now
written ONCE in sentence case — under cupertino `Meta` does not transform, so
an ALL-CAPS literal was rendering literally ("02 JUL · 14 BACKLINKS",
"HIGH PROTEIN · 25 min · FROM OBSIDIAN /RECIPES"). The demo fixtures in
data.js follow the same rule. The Leader's speaker tag was the last hard
`500 10px mono` literal in the vals and now takes the micro token. Five
unused vals imports removed. Verified at 375×812 in BOTH styles (cupertino:
tinted pills, "02 Jul · 14 backlinks", "High protein · 25 min · from Obsidian
/Recipes"; command: bordered mono badges, everything uppercased by the
controls), console clean, 1086 tests green under TZ=UTC.

### 6 September 2026 (afternoon) — the identity rows and the filter chips
His "Proceed with the next builds" → the two items still on OPEN — MINE.
`ScreenHead` (Controls.jsx) replaces the twelve hand-written identity rows
(numeral · hairline · tracked caps): Command renders exactly what it did;
the Apple styles drop the numeral and the rule — a numbered section is the
console's idiom, not iOS's — and keep the label as a grouped-list header.
Every header-label string in the vals is now written once in sentence case
("6 recipes · live from Obsidian", "Connect a backend in Settings"); Command's
Meta uppercases it. Voice's status badge is a `Tag`; Workouts' live dot rides
a cyan `Meta`. The Fuel and Notes filter chips ride `Chip` (the vals hand over
`active`, not a style); `chip`/`nchip` left shared.js. Verified at 375×812 in
BOTH styles (cupertino: pill chips + "VAULT · FUEL" small-caps row; command:
"X. — VAULT · NOTES" with bordered mono chips), console clean, all 42 UI
markers in the dist. Not built: the MissionControl fold (his style never
switched), the digest's model-named themes.

### 6 September 2026 (midday) — the hand sweeps finished, every screen off tokens-only
His "Proceed with the remaining hand sweeps": fourteen files in three
scripted batches (see CURRENT HANDOFF bullet). Build/lint/1086 tests green
under TZ=UTC; markers updated; visual check limited to demo mode for the
live-only screens because the token read was refused by the auto-mode
classifier. Dev server stopped, isolated devtools pages closed.

### 6 September 2026 (still later) — Settings hand-swept, a latent layout bug fixed

Settings.jsx was the last front-line screen still on tokens only. Full hand
sweep: About You, What Nova Has Noticed, Appearance (style/theme/core/calm),
Notifications, Voice, Navigation Order, Calendars, the Claude Models board,
Time Machine — every ALL-CAPS toggle and button through Controls.jsx, ACTIVE
badges as Tag, ON/OFF as Chip. Eyebrow/Tag/Meta gained `...rest` passthrough
(htmlFor, etc.). Found and fixed on the way: the voice-test row had FOUR flex
siblings under one `justify-content:space-between` (the content block, Build,
Research Browser, Test), so "Can you hear Nova?" collapsed to a one-word
column with Build's text printed over it — pre-existing, not caused by the
sweep, visible only once the row was actually looked at. Verified in both
styles at 375×812; MissionControl.jsx's (classic, non-cupertino) C1 fold is
deliberately NOT done — it has no ORDERS/section-key mechanism at all (a
linear JSX render, HUD satellites not grouped cards) and isn't his daily style
(his phone runs cupertino); building it is a design decision, not a port.

### 6 September 2026 (later) — the artefacts filed, the native shell scaffolded

Approving the finished plan would have re-run it: fixed so approve files the
report as a note (URL-free title), then his three artefacts approved into the
vault. The native shell: Capacitor 8 around the live URL, SPM, Haptics +
StatusBar, the web bridge in haptics.js, a runbook for the Xcode steps only
he can do on a Mac that has no Xcode.

### 6 September 2026 — live-proof, the plan handoff proven, the material pass everywhere

Checked the deployed bundle from a fresh isolated context (new strings
present, old caps absent) and the server process against its code's mtimes.
Re-ran the plan twice: the first re-run exposed twenty lanes parsing model
JSON without repair (a raw tab killed the Researcher) — fixed with one entry
point; the second, phrased to force the dependency, proved the handoff with
3,953 chars of context and an honest claim-by-claim report. Then the token
codemod (582 fonts, 277 trackings, 49 files) and hand sweeps on Voice, Fuel,
Notes, To-Do, Shopping, each deployed and verified live in turn; the
verify-shipped markers moved with the strings they read.

### 5 September 2026 (night) — the material pass

"Nova still feels stiff." Measured before diagnosing: five of six type
declarations were the tracked mono micro-label and those were the tap
targets; four hundred one-pixel borders; a toast for every action. Built
`src/Controls.jsx` so the label is a material decision per style, swept the
four daily surfaces, unbordered cupertino cards, removed the toasts that
restated visible change, made tab hops instant, gave sheets drag-to-dismiss
and the deck a rise. Measured after: 12–22ms per tap on the production
build — no jank case, so P8 stays deferred. Left for him: the native
wrapper (haptics), and the remaining screens.

### 5 September 2026 (late) — the first plan run, its handoff bug, A3 and C1

Three commits, `1b023f4`→`368e27f`. The plan loop ran for real (Watcher →
Researcher) and the report's first line was that the comparison had not been
done: the Researcher never received the Watcher's claims. Root causes were a
placeholder the planning model forgot and a summariser that read a field no
lane sets; both fixed by code, the Researcher gained a context channel, all
pinned in tests, not re-run (his money). Then A3 — whose first cut exposed
that agent confidence is not his confidence — and C1, both verified on his
data at 375×812 on the layout his phone draws.

### 4–5 September 2026 — the delegation loop, the exercise atlas, the audit's fixes and its first mockups

Twenty-one commits, `7cd9e16`→`fff89ae`. In order: the brief-audio replay bar;
the notification-width fix; the exercise atlas and animated figure; the UI
audit (artifact) and its unambiguous fixes; the chief-of-staff plan (artifact)
and Phases 1–4; Plan Today's JSON salvage and the stale-error reaper; form
cues; local dates; form videos found free (not $105) with timecodes and a
daily fill job; the 3D figure; the bandsaw rule; A1/C2/C3/B1; the exercise
sheet on Train. Two things he caught that I had not: five deploys had died on
my timezone-bound test, and the 3D figure existed only as a chat panel. Both
fixed the same day. The full per-commit reasoning is in the commit bodies.

### 3 September 2026 — the audit's last roster items, and the Leader learning to talk about his team
Finished #18 — every §6 item across all 66 reports is now shipped, met by
another item, or deferred with a reason, and the 547-line per-item record
moved out of the handoff into
`design/audits/2026-08-full-audit/00-COMPLETION-RECORD.md`. Shipped [37]–[46]
plus the surfaces [47]–[66] in five batches: the Leader's resumed-turn live
line and HEAD-checked research links, the pulse's novelty memory and named
cap, the evening brief warm, old-month health-mirror corrections, late-fire
reminder honesty, Todoist telling a deleted task from a completed one (gate
opened by probing his real account with two scratch tasks), the overnight
queue's one retry and late-landing reconcile, Ops match-lines for the study
lane and Scout, the Money list cap, chip ages and mark-handled on the Leader
screen, and the Ambient wall's sync age, stale dimming and OLED drift.

Three things were corrected rather than added. The pulse lane had been
failing 1–2 of 3 topics most nights since roughly 20 August, logging only
"exited 1"; one measured run showed the real cause — $1.06 of searching
against a $0.50 cap — so failures are now legible with cost receipts and the
prompt caps searching at 8, while the budget itself was left as his decision
rather than quietly raised. The plan's DONE/SKIP marks were recorded here as
unbuilt; they were not, and a live run over the real HTTP route proved the
whole loop including both consumers, so the handoff was wrong, not the code.
And the phone-width pass found three real defects that code review had not:
a satellite sitting across the core's status label, a 26×11px CLEAR control
on the action he takes four times a day, and a concept card wearing the daily
review's name.

Then his own three asks. He screenshotted the Leader saying "Budget Your
Stress Like Your Sets" and named the problem exactly: that is not managing,
leading, inspiring or directing a team. Measuring the corpus against his real
127-page shelf showed six of seventeen "leadership" matches were body pages —
"Manage" admitting Stress Management and Waist Management, "Frame" admitting
The X-Frame & High-Value Aesthetic Muscles — while the daily idea was
separately being handed a fleet block that is almost entirely training and
nutrition. Fixed at all three levels, and verified by regenerating the card,
which now reads "Delegate The Decision, Not Just The Task". Built the
exercise-targets preview he asked for, so today's card names the muscles and
expands to every lift before BEGIN SESSION. One durable trap learned: the
devtools browser's clock runs hours behind his, which sent me chasing a
training schedule that had never changed.

### 30 August – 2 September 2026 — the full-platform audit, and shipping its top findings
Audited all 66 agents and surfaces read-only, one per turn, then executed the
synthesis in tier order. The audit's own headline finding got worse on
contact: `--allowedTools` is not enforced under bypassPermissions, and where
the item-by-item read had found three unguarded spawn sites, a mechanical
sweep found fourteen — seven of them passing `--allowedTools ''`, meaning "no
tools please", while the model could in fact write files and run shell. Fixed
by denying the complement of what each lane asks for, so the allow-list is
enforced by construction. Proved with a canary after the obvious check —
asking the model to list its tools — returned two contradictory answers a
minute apart, one naming "PowerShell"; that method note is now in the module,
because it is the sort of thing that gets re-learned expensively.

Then Tier 1. The workout save was replaying through the offline outbox and
filing a second session — double-counting exercise state and re-firing the PR
ping and the Coach debrief — now idempotent on a client-stamped key, with the
PR celebration still returned on a replay since a lost response means he never
saw it. Health Insight was retrying an uncapped $0.50 compose every hour from
06:00 to midnight whenever it failed, silently; capped at three, with the last
failure announcing itself, and the lane got its first test file. Guardian was
watching 13 loops beside a roster of 29, so sixteen agents could die
unnoticed; it now derives the watch from the roster — verified live at 29 —
and five weekly agents whose exact-day windows a sleeping Mac could miss now
stay open for the rest of their cycle.

Corrected rather than added: a health-mirror test asserted a row for the 2nd
of the current month, which the page builder correctly drops as future — so it
failed every 1st, and had already broken two Pages deploys that day before it
was noticed. The deploy pipeline, not just the test, was the casualty. Suite
went 713-with-one-failing to 727 green.

### 27–30 August 2026 — the black screen, the ambush sheet, the once-a-day brief, an ingest cap that ate a job, and food macros that compute instead of recall
Four real failures, fixed in two commits. The black screen and the ambush
review sheet turned out to share one root cause: boot-resume trusted a
job's status from the server's list without loading its preview, so
`IngestReview` rendered a "ready" branch against null and threw, taking the
whole app down — reproduced at phone size before touching anything. Open
work now surfaces in the WORKING panel instead of seizing the screen, and
the same load-before-render ordering that fixes the ambush also fixes the
crash. The brief was marking itself "delivered" only when audio actually
played, but an auto-brief has no user gesture behind it, so iOS blocked
autoplay almost every time and the retry re-read the whole brief on every
open — now marks on delivery, server-side, shared across devices.

Then two complaints in one message. A vault-ingest video hit a $3 cost cap
— sized for a pasted note, applied indiscriminately to full weaves — spent
$3.08, and was killed with nothing written; raised both budget constants to
env-overridable backstops (25/40) reframed explicitly as guards against a
runaway loop, not spending controls. And food-macro logging gave two
different totals for the identical pizza description (1050 kcal/50g, then
940/36g) — traced to the prompt telling the model to answer "from your own
knowledge, no search" for most foods, which guarantees a different
plausible number every time since LLMs don't recall numbers reliably.
Rebuilt along the platform's own line: the model now only decomposes food
into components with gram weights; a new `nutritionFacts.js` looks each up
in USDA FoodData Central, scales by weight, and derives kcal from the
Atwater factors, so a stated kcal that disagrees with its own macros is now
impossible by construction. Verified live: the same pizza returned
identical totals (2,408 kcal/129g protein) across repeat calls, all four
components matched and source-attributed. While confirming no jobs were
in-flight before this session's own restart, found that a PRIOR restart had
in fact orphaned an in-progress job — his Atomic Habits ingest — which
directly answers, in the negative, the previous handoff's open question
about whether it ever completed. 709/709, lint 0, build green both times.

### 25–26 August 2026 — evidence on screen, the phone-voice bugs, the ship-verification crisis, and Coach reading his own notes
Started from his complaint that Nova speaks a lot without anything to look
at, and ended up rebuilding how "done" gets claimed at all. Made every
spoken Ask-Nova/Coach answer infer a visual panel deterministically (code
picks the shape from the question, never the model), added a `sessions`
panel that didn't exist, and wrapped every render site in an error boundary
— there was none anywhere in the app, so one malformed panel used to blank
the whole screen. He sent screen recordings of the phone voice failing;
watching them frame-by-frame (rather than guessing) found three separate,
unrelated bugs: the brief racing a TTS-status fetch and giving up silently,
a full-screen focus blur spotlighting a card rendered below the mobile
fold, and the iOS-audio "unlock" replaying his last sentence because its
audio element still held the previous TTS blob. Built findings-as-charts
(fuel findings had never exposed the numbers their prose quoted) and a
question-by-question brief close that reuses the existing inbox
approve/discard rails rather than inventing a new one. Let Coach apply
program edits from inside the chat — the write path already existed and
was tested, it just had nowhere to say yes from.

Then he said, plainly, that he no longer trusted "shipped" as a word from
me, and he was right to: nine commits had sat unpushed behind a blocked
permission classifier while progress kept being reported, a feature landed
in the one Coach-message renderer out of three that he wasn't looking at
(twice), and his PWA was silently serving a cached bundle for days because
`autoUpdate` updates the service worker, not the running app. Built the
actual failsafe rather than apologising again: a build id compiled from
the git commit (not a timestamp — those can't equal themselves across a CI
rebuild), a `version.json` the app polls and shows an UPDATE banner
against, and `scripts/verify-shipped.mjs`, which checks the LIVE deployed
bundle rather than the working tree. Running it immediately caught two
bugs in itself — a build id that could never match, and chunk names read
from local files that 404 against CI's different content hashes — which
is exactly the point of a script instead of a claim.

Closed by confirming, and it was true: Coach's progression engine, its
weekly detectors, the program audit and the Sunday debrief all ignored his
per-exercise session notes. A note reading "struggling to move 9.1kg
without a nudge of body momentum" could not stop a load increase, because
nothing except the chat ever read it. Built a narrow, suppress-only note
reader (a signal can hold a load increase, never create one) and wired it
through every surface that reviews his training — verified live: Cable
Lateral Raise and Alternate Incline Dumbbell Curl are now held, citing his
own sentences.

### 23–24 August 2026 — Phase C, the Librarian + Library, Coach that edits and judges the plan, and Fuel fixes he asked for twice
Finished the fluidity plan: writes now tag which slices they touched, so a
todo checkbox costs 3KB instead of 996KB (measured live). Two bugs only the
browser found — routes fire their own domain broadcast beside the chokepoint
one, which silently cancelled the whole optimisation, and one write emitting
two events made it sync twice. Built the Librarian (a book title + author →
triangulated dossier → woven vault pages, provenance-labelled researched vs
read) and the visual Library shelf with real Open Library jackets cached
server-side. Coach can now APPLY its suggestions to the real program through
typed ops with full undo, always behind a confirm sheet with a free-text box;
applied two changes to his live plan while he was at the gym. Then he pushed
back that Coach was "suggesting changes for the sake of them" — his data
proved it: 227 working sets, all RPE-rated, 88% at RPE 9–10, and the default
progression path never read RPE at all, so a shoulder press he was grinding at
RPE 10 kept earning +2.5kg. Effort now gates load everywhere and grinding
lifts get a tempo/control prescription instead of a number.

CORRECTED RATHER THAN ADDED: the "HARD SETS THIS WEEK" bar was showing LAST
week's numbers every Monday. A health-push failure that looked like my deploy
was actually one missing HealthKit metric making the whole JSON body invalid —
one absent reading was discarding every other metric. My first "too many
exercises" detector measured session length and could never fire, because he
already splits routines across days; the real signal (routines he cannot
finish) was in the same data. Copy that told him to earn FEWER reps than he
was already doing, and a proposal to cut Weighted Pull-Up 30 minutes after
Coach created it — both caught by running detectors against his real log
before shipping. And a CSS bug I introduced: adding the camera button pushed
the tweak panel's ASK button outside its card at phone width, which he found
after I called the feature live, because I had only screenshotted it at
desktop width.

### 23 August 2026 — model-cost fix, Coach's self-review, a shipped crash caught and fixed
He caught Coach hitting a "Fable 5 usage" limit mid-conversation — traced
to every unpinned Claude CLI call inheriting the account's ambient
default model, which had silently become Fable 5. Pinned Coach to opus
and 12 other automated background lanes to sonnet. Built the Coach's
program review (server/lib/coachProgramReview.js): three code-driven
detectors — a lift's name contradicting its filed muscle group, a lift
flat for 3+ weeks (swap suggested to the same muscle), a goal muscle
chronically under target — raised onto the inbox rails, surfaced in the
morning brief, the Train TODAY card, and Coach's own conversation
context, nudged at 3 and 7 days then escalated to Telegram. Verified
against his real vault: raised two genuine findings (a real Face Pull
mapping error, a real stale Cable Flys swap) that are still sitting in
his Inbox, intentionally. Added coach-chat auto-scroll-to-bottom and a
temporary mid-session exercise add ("this session only", never written
to the program) — but the first ship of the latter crashed his screen
black. Reproduced it properly on an isolated scratch server (a COPY of
his vault, throwaway port/data dir, his live backend untouched) rather
than guessing: found an undefined `${M}` font reference that only threw
at render time, plus a second bug where creating a brand-new exercise
mid-session was silently routed to the wrong destination (or worse, into
his real program if a routine happened to be open behind it). Both
fixed and re-verified on the same scratch repro. Also discovered and
fixed, mid-session, a real data-loss mechanism in inboxStore.js: writing
to it from a one-off script while the live server also runs risks a
silent cross-process cache clobber — the two coach findings vanished
once before I caught it and built the proper HTTP-route fix. 415/415
tests, four deploys, every bundle hash-verified.

### 18 August 2026 — mockup parity shipped + the audit that caught a live bug
P2 cockpit + one-bar log screen-verified and deployed. Visual-claims audit:
voice dynamics and canvas panels both proven real on screen; the audit
surfaced a genuine reply-loss bug (SW-update reload mid-speech ate the
answer) — fixed the same hour. Fuel cross-reference agent (spec #11)
built end-to-end with a true first finding on his real data; decline-asks-
why shipped on all Coach advice. 348/348 tests. Three deploys, every
bundle hash-verified against the harness-verified dist.

### 13–16 August 2026 — the Forge, the spoken lane made fast, and two wrong diagnoses
He sent an Instagram reel — a hand-built watchOS app dispatching Claude and
Codex jobs from the wrist, with live status in the Mac's notch — and asked
for the same, expanded. Watched it frame by frame (60 frames + Whisper
transcript) and wrote `design/WRIST-PLAN.md`: the key finding was that Nova
already owns most of what that author built from scratch (server, auth,
inbox rails, agent lights, SSE, Siri dispatch), so the genuinely new pieces
are a job runner, a notch HUD, and wrist dispatch. Built Phase 1, **the
Forge** (`lib/forge.js`): one spoken sentence → a real running artifact,
sandboxed to `~/NovaForge/`, live tool status on the existing rails,
persisted receipts, stop, and Telegram announcements including failures.
Verified with a real snake game — $0.90, 3m32s, 22KB self-contained HTML
that the job smoke-tested itself. Two bugs were mine and are recorded: the
plan's invented "Build" department (no such thing — Platform), and a
`stopForge` that mutated a disk copy so the stop flag never reached the
child.

The bigger thread was his complaint that Ask Nova from the watch felt so
slow it defeated the point. That was measurable, not a feeling — 14.2s,
15.9s, 23.9s sat in the request log. Cause: `/ask/sync` minted a NEW
conversation per ask, paying context assembly, a cold CLI boot, and prompt
cache creation every single time, because the warm pool is keyed by session
id and a fresh id can never hit it. `lib/spokenSession.js` now keeps one
conversation with day/age/turn caps and re-states the volatile numbers per
turn: **2.1–2.2s resumed, 11.5s cold**.

Then he said Siri still wasn't answering, and I got it wrong twice. First I
found and fixed a real bug — the keepalive drip prefixing the JSON body with
spaces, which Shortcuts could not parse — and reported it as the cause. It
was not; it had only ever affected slow answers, and my post-fix tests all
returned in 2s and looked clean. He said it still failed, so I added a raw-
body receipt, and that finally showed the truth: his Shortcut had been
sending the literal words `"Provided Input"` — the variable's NAME instead
of its value. One screenshot from him confirmed it in seconds. He rebound
the variable and it now works from his phone (`"8,538 steps on August 15th,
sir."`). The server now refuses known Shortcuts variable names out loud
rather than politely asking him a question he cannot answer hands-free. Also
untracked a PDF that a careless `git add -A` swept into a commit.

### 13 August 2026 — alarm-stop confirmed live; steps-parity thread opened and paused
The alarm-stop automation fired for the first time, cleanly, at 07:25 local
— filed 12 Aug's full health payload, `stepsComplete: true`, no errors. The
whole point of the prior close's fix, proven. He noticed Nova's steps
(10,022) sat ~1.1% under Apple Health's own figure (10,139) and asked why.
Root cause, confirmed against Apple's own developer forums: the true
cross-source dedup Health shows requires `HKStatisticsQuery`, a native
HealthKit API a Shortcut cannot call — Nova's per-device MAX fold is an
honest approximation, not a bug, and this project already proved the naive
alternative (no Source filter) is worse. Built a full adapter
(`lib/autoExport.js`, route `POST /api/health-data/auto-export`) for Health
Auto Export, a real app that CAN call the proper API, reusing the existing
shared ingest gate via a new `skipDateShift` option. Gate-clean (294/294
tests), live-tested with synthetic data, committed and pushed
(`84cadb5`) — but he then found the app wants a paid subscription and
declined to buy it right now. **Thread is parked, not abandoned**: the
adapter is built and waiting, untested against a real payload, for whenever
he decides to revisit it.

### 12 August 2026 (afternoon) — closing the health thread's last gap
He added the alarm-stop trigger on his phone — the previous close's fix is
now live end to end, pending tomorrow morning's first real run. Re-verifying
the previous handoff's claims by a second route (reading the pushlog and the
JSON files directly, not trusting the prose) surfaced a live bug it hadn't
caught: `server/data/health/2026-08-12.json` was carrying 11 Aug's
`activeEnergyKcal`, `walkingRunningDistanceKm`, `restingHeartRate`, `hrv`,
and `vo2Max` — 819 kcal and 15 km logged against 163 real steps. Cause: a
drill push made during the health thread's own testing used the literal
date `2026-08-12` instead of `yesterday`, landed as the day's first push
(so even the steps guard had nothing to compare against), and the other
accumulators had no guard at all — only steps did. Fixed by generalizing
`shouldDropLowerSteps` → `shouldDropLowerReading`, applied across a new
`ACCUMULATOR_METRICS` set (steps, activeEnergyKcal, walkingRunningDistanceKm,
sleep*); point-in-time metrics (RHR, HRV, VO2 max, weight) stay unguarded on
purpose since a later reading of those is just more current. Verified live
against the running server with a scratch date, not just unit tests. Today's
file repaired by hand. Gates re-run clean (287/287); committed, pushed
(`6b8751b`), service reloaded.

### 11–12 August 2026 — the health thread (concurrent session)
The steps saga ended, and not where anyone was looking. Three faults were
stacked: iOS **encrypts Health data while the phone is locked**, so the
00:05 automation had only ever succeeded on nights he happened to be
awake; my own monotonic-steps guard **exempted the current day**, which is
how a truncated 813 overwrote a genuine 11,107; and the missed-push
sentinel only shouted at *missing* days, so a stale midday partial sat
there in silence all morning. All three are fixed, and his locked-phone
test is what proved the first — automation fired, Mac awake and serving,
nothing arrived on either channel.

The fix that shipped is a clone, not a build. Six attempts at authoring a
`.shortcut` file failed on Shortcuts' own serialization (Statistics needs
an explicit input; hand-built date filters are inert) — each one costing
him an import and a run. What worked first time was fetching **his own
automation from an iCloud share link** and changing exactly two things:
the date token → the literal word `yesterday` (the server resolves it),
and the drop filename. Verified live: the full 8-metric payload filed
against 11 Aug, with the MAX fold and monotonic guard correctly keeping
his higher manual figure while every other metric repaired the day.

Two things were corrected rather than added. I wrote 11,107 back into
11 Aug from the pushlog without checking the window it was captured over —
it spanned midday-to-midday across two days and was never a valid daily
total; his manual 10,218 was right and mine was wrong. And I proposed a
fixed 22:30 push as a fix, which he correctly rejected: his bedtime
varies, so a fixed hour truncates the day unpredictably. Alarm-stop is the
only trigger that is both unlocked and after the day is complete.

### 10–12 August 2026
Nova learned to watch. The `/watch` skill became an agent — the Watcher —
and then a whole pipeline: a link in, transcript pulled locally, and either
a quick verdict (the Coach auditing a fitness video's claims against the
literature) or the full second-brain weave (Source, Concept, Entity and
Topic pages, wikilinked, verbatim transcript in `Raw/`). It ships with two
buttons because absorption costs ~$6 and triage costs ~$0.50, and he should
not pay the former to discover a video was filler.

Almost everything of value came from the failures, not the build. His first
real video — a 4-hour Hormozi podcast, 575k characters — broke the pipeline
four separate ways in sequence, and each break was a real bug: a budget cap
set by guess rather than measurement (a 150k chunk on the default Opus model
cost $1.46 against a $0.75 cap and died having written 218 tokens); a
2000-word payload wrapped in a JSON string that one raw newline destroyed;
an error handler that read stderr before stdout and so reported a harmless
"no stdin data" warning as the cause of a fifteen-minute failure; and the
weave itself dying at its own $8 cap on Opus. Measuring instead of guessing
fixed all of it — 60k chunks on Sonnet cost $0.35 and return 7k tokens of
dense notes — and the digest is now cached per video id so a retry never
re-pays. His question "will this duplicate anything?" was asked at exactly
the right moment: it would have, twice over, and video identity (by ID, not
URL) now prevents it.

Three things were corrected rather than added. The Watcher's first filing
put its note in `Wiki/Inbox` with `type: raw` and threw the transcript away,
so it never appeared under his Sources filter — it now writes his own
podcast convention. Four modules resolved a ghost `Claude%20Projects`
directory because the repo path contains a space (`URL.pathname` instead of
`fileURLToPath`), silently stranding a transcript and emptying the stream
feed's heartbeat reads. And ready ingest jobs lived only in memory, so a
$6 diff died on a server restart and had to be applied out-of-band — they
persist to disk now, drilled with a real `launchctl kickstart`. The 4-hour
conversation is in the vault: 41 changes, 19 new concepts, 11 existing
pages deepened rather than forked.

### 7–9 August 2026
The session split in two. First, a long Shortcuts saga: Ask Nova and Tell
Nova failed for hours through five different causes — a stale POST body, a
missing `text` field, a literal "Provided Input" placeholder, a colon in the
auth header (my documentation's fault), and finally requests that never left
the phone. Fixing it properly meant adding request receipts to the server,
binding the tailnet IP directly, and cutting a spoken answer from 26s to 12s
by caching CalDAV reads and parallelising the ask context. The health-push
root cause was also found and closed — the Shortcut's Request Body, not its
queries — though the automation has since stopped firing again for two
nights, which is HIS to check.

Second, the build wave: reminders (with real Apple Reminders alarms),
proactive Telegram, open loops, the fuel scorecard, Ambient v2, the widget
endpoint, the Ops tap-through (delegated to a subagent), the health mirror,
the pattern scout, the About You interview, and the distiller. The turn that
mattered most came from reading the data rather than the backlog: 30 days of
receipts showed Nova produced ~154 drafts and he kept 9, with the flagship
briefs aging out unread. That produced the trust ladder — autonomy computed
from real history and proposed on the rails — whose first pass filed three
proposals that are still waiting. Two things were corrected rather than
added: Nova was inventing macros for "I ate dinner" instead of marking the
planned meal, and a distill record was silently clobbered by writing to the
inbox store from a second process (now in DO NOT, with an in-process
endpoint as the fix).


### 3–4 August 2026
Customisability. Fixed the bug in his screenshot — an ingredients-only tweak
could not be saved because the alternate validator demanded a method it was
never going to have. Made a follow-up refine the version on screen instead of
restarting from the stored recipe, and put a mic beside the ask box so the
whole exchange can be spoken, with the answer read back from the preview
only. Built `editRecipe`: ingredients, method and macros, on any recipe or
any variant, reachable from ✎ EDIT THIS MEAL.

Two things were corrected rather than added. The first cut of the section
writer passed every test while drifting his file — it ate a blank line
between a recipe's `---` and the next heading, and stripped the bold from
steps he never touched; the identity round-trip over his real collection is
what caught it, and the writer now rewrites only the lines that changed.
Second, I spent three rounds chasing a wiring bug that did not exist: the
edit button was absent from the running app only because Vite was serving a
cached module. Both are now in DO NOT. The overnight push also fired a
second consecutive night (12,619 steps filed for 3 Aug), so that criterion
moved from one data point to two.

### 3 August 2026
Closed the steps saga: first fully automatic overnight push landed
(8,295 for 2 Aug). Verified the pmset changes he ran. Corrected my own
diagnosis — both the sleeping Mac *and* a non-firing phone automation were
real, on different nights. Made a sleeping Mac survivable: added this week's
four screens to the offline cache and made "mark meal eaten" queue via the
Outbox. Answered the hosting question (frontend already on Pages; backend
cannot move to serverless). Established this handoff system.

### 2 August 2026
NovaBar diagnosed and fixed (empty icon image, unplaceable status item,
off-screen panel) — it now opens on launch and via ⌥Space. Phone dock made
symmetrical: three each side of the core, Train and Recipes in the default
slots, plus a FREQUENT row in the More sheet. Spread view transitions to
notes/routines/sessions and gave every clickable press physics.

### 1–2 August 2026
Presence, motion and latency: NovaBar built (Swift, no Xcode project),
shared-element transitions on recipes, instant spoken acknowledgement to fill
the 5–8s think gap, CountUp numbers. Topic Pulse shipped. Describe-it food
logging shipped. Recipe promote-duplication bug fixed and his vault repaired.
Variant rename, in-session exercise skip, Coach skip-awareness.

### 30–31 July 2026
Companion Phases 3–5 (voice-confirmed actions, references/research, rituals),
the doorman greetings, skill registry, Nova Operations screen, overnight
queue, Telegram bridge, ambient wall mode, inbox expiry, and the food-log
write-race fix.
