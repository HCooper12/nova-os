# Nova against Apple's own rules — audit, 16 Sep 2026

Run against two skills installed from <https://emilkowal.ski/skill> at his
request: `apple-design` (distilled from *Designing Fluid Interfaces*, WWDC
2018, and *The Details of UI Typography*, WWDC 2020) and `mobile-native`.

Every finding below was located in the source and, where the claim was about
behaviour, **reproduced** — either by replaying the control flow in node or by
reading computed values out of the running app in Safari 26.5. Nothing here is
"the skill says you should".

**Nine findings were fixed** (`a81d602`, `c7e8a15`, and the concentric
primitive). The ten below are left open on purpose: each is a design decision that is his, not a
defect.

---

## FIXED — summarised, detail in the commits

1. **Flick-to-dismiss had never once run.** `useSheetDrag.end()` nulled
   `drag.current` and then called `settle()`, which read `drag.current.v`. Dead
   since the gesture was written. All three sheets.
2. **Velocity from the last two pointer events.** A flick that decelerates in
   its final frame — most of them — read 0.13 px/ms where an 80ms history reads
   1.88. A 14× error.
3. **The throw was not interruptible.** Measured in Safari: killing the
   transition to grab a closing sheet **jumps it 345px to its target** (255 →
   600). Now pinned to the presentation value first.
4. **Dismiss decided on position, not projection.** A sheet dragged past the
   threshold and flicked back *up* was dismissed. Velocity's sign decides now.
5. **`prefers-reduced-transparency` reached 3 surfaces of 48.**
6. **The status bar was pinned dark** while `daylight` is a light palette.
7. **Scroll bled through 17 of 18 overlays.**
8. **Controls were selectable text**, fighting Nova's own 480ms long-press.

---

## OPEN — his call

### 1. One easing curve is doing the work of a spring system
`--nv-ease: cubic-bezier(.32,.72,0,1)` is the whole motion system. It is a good
curve, and the 11 Sep commit that unified four curves and seven durations into
it was right. But a fixed curve cannot take a velocity and cannot be redirected
mid-flight, which is the skill's single most emphasised point: *"every
animation must be interruptible and redirectable at any moment."*

The sheet now fakes velocity handoff by deriving a *duration* from the release
speed (`sheetPhysics.throwDuration`). That is honest and it is not a spring.

**The decision:** whether to take a ~4KB spring library (Motion) for
gesture-driven surfaces only — sheets, swipe rows, the context menu — and leave
every entrance animation on the CSS curve. Apple's shipped values, for
reference: move `damping 1.0 / response 0.4`; sheet `0.8 / 0.3`.
**Against:** a second motion system to keep honest, and the memory on UI
performance already flags whole-app re-render cost.

### 2. ~~Nothing in Nova leaves the way it arrived~~ — PATTERN BUILT, 4 of 18 adopted
`src/useExit.js` + `nvFall`/`nvFadeOut`. `nvFall` is `fadeUp` read backwards
exactly, so a panel leaves down the path it rose along, and the scrim releases
its dim underneath it. **`--nv-ease-exit` finally has a call site** — the first
in the app since the token was written.

It is a hook, not a wrapper component, and that is the load-bearing choice: the
parent renders `{v.showX && <Modal/>}` so it owns the unmount, **but it also
hands the modal its `onClose`** — so the modal can play its own exit and call
`onClose` when it lands, with no `App.jsx` edit at all. That matters today
because another session is live in `App.jsx`. `GlassSheet` already worked this
way; this generalises it for overlays with no origin rect to return to.

Verified in the running app: 60ms after the close click the overlay is still
mounted, panel running `nvFall` at opacity 0.82, scrim running `nvFadeOut`;
gone by 300ms.

**Adopted by 4** — Outbox, Calendar, Ingest, Add Recipe. The remaining ~14 are
a mechanical three-line edit each (hook, two refs, route the close paths).
Two of them — StepsHistory and RepertoireBook — carry the other session's
`vtName` morph and want a look at how the two interact before being converted.

### 2b. ~~(original finding)~~
Six entrance keyframes (`fadeUp`, `sheetUp`, `popIn`, `nvRise`, `deckRise`,
`shelfIn`), **zero exit keyframes**. `--nv-ease-exit` is defined, carries a
comment explaining that "anything LEAVING accelerates away", and **has exactly
zero call sites** — it has never been used. Modals rise in and vanish on a hard
cut.

The skill: *"If something disappears one way, we expect it to emerge from where
it came."* GlassSheet is the one thing that does this properly — it reverses
its FLIP back into the card it grew from.

**The decision:** whether every overlay gets a real exit (roughly: an
`isClosing` state and one `@keyframes` per entrance), or `--nv-ease-exit` gets
deleted as an idea that was never taken up. **Either is defensible; having the
token and not using it is not.**

### 3. ~~The largest type in the app has no tracking~~ — FIXED, and it was worse than "none"
Measured in the running app: every screen header was **`+.02em` at 28–30px** —
not untracked, tracked the *wrong way*. Large type reads too loose as it grows;
that loosened it further. Sixteen headers now read `--nv-display-track`, which
is `+.02em` under Command (wide tracking **is** the HUD look, and the gym hero
is uppercase there, which genuinely wants it) and `-.02em` under the Apple
styles. Verified live at 30px: cupertino −0.6px, Command +0.6px.

A second thing fell out of it: **`letter-spacing` in `em` computes to an
absolute length and inherits as one**, so the 27px serif span inside a 30px
header inherited `0.6px` — `.0222em` at its own size, looser than the `.02em`
intended. The note is in `index.css` beside the token.

The 96px Ambient clock keeps `+.04em` deliberately: monospace tabular numerals
are a clock face, not prose, and the test exempts on the **face**, not on the
filename.

### 3b. Serif body sizes (14–16px) are still untracked, and should stay that way
The serif display line — the Home headline, the news line, 24–34px — carries no
`letter-spacing` at all. Small mono labels get `+0.14em`
(`--nv-micro-track`), which is correct for them. The other half of the curve is
missing: *"large display text wants negative tracking; letters read too far
apart as they grow."*

Concretely: a `--nv-display-track: -0.02em` token on the serif sizes. It is a
visible change to the most prominent text in the app, which is why it is here
and not in a commit.

### 4. Nova does not respond to his system text size at all
**Zero `rem` font sizes in the entire app** — every size is a hardcoded px, and
`font-size: 16px !important` is forced on inputs. Combined with
`user-scalable=no` in `index.html`, there is no path at all by which making
text larger in iOS Settings changes anything in Nova.

Both decisions were deliberate and both have real causes in their comments (the
pinch that shrank the app into a corner; iOS focus-zoom). Worth knowing: the
16px inputs already solve the focus-zoom, so the viewport lock is now doing
only the pinch job — the comment's "belt-and-braces" half is redundant.

**The decision:** whether Nova should scale with Dynamic Type. It is a real
piece of work (spacing in `rem`, layouts that reflow) and it only matters if he
ever wants larger text. **Right now the honest answer is that Nova would break
rather than adapt.**

### 5. ~~Hard hairlines under floating chrome~~ — FIXED for the top bar
The bar now wears iOS 26's **scroll edge effect**: its glass extends 20px past
its content and a mask ramps it to nothing, so content softens as it passes
underneath and is sharp the moment it clears. No line anywhere. Verified in
Safari at both states — at rest and mid-scroll.

The obvious implementation is wrong and was tried first: a separate blurred
strip *below* the bar softens content that is sitting under nothing, and the
screen's own subtitle went out of focus for no reason. What wants to fade is
the bar's own glass, moved to `::before` so the mask can reach it without
fading the bar's text with it. **It costs no extra backdrop pass.**

`RecipeOverlay`'s sticky header still has its hairline — a sticky header inside
a scroller is a different shape to a fixed bar and wants its own look at.

### 5b. ~~(original finding)~~
The skill is specific: *"Scroll edge effects, not hard dividers. Instead of a
1px border under a sticky header, fade a small blur/gradient mask where content
meets floating chrome."*

Nova puts a `1px solid var(--nv-edge)` under the top bar and under
`RecipeOverlay`'s sticky header. **I added one of those this morning** in
`.nv-liquid-flush`, reproducing the pattern rather than questioning it.

**The decision:** a `mask-image` fade at the chrome edge instead of the line.
It is a contained change to two places and it is the single most "iOS 26" thing
left on the list.

### 6. ~~Ten modals run two backdrop passes to achieve roughly one~~ — WITHDRAWN, I was wrong
A/B'd in the real app over the real Home screen: with the scrim blurred the
background is illegible mush; with it removed **you can read "LANDED · 9 today
· 7 filed" straight through the 72% scrim**. The second pass is not waste — it
is what makes a modal a modal. Raising the scrim's opacity instead would obscure
just as well for one pass, and would lose the "dimmed but still present" quality
the blur gives, which is the whole of Apple's material story.

The skill's rule ("never stack a light translucent surface on another") is about
the legibility of the TOP surface, which was never in question here. Applying it
by analogy would have cost a real thing to save a cost I had not measured.

**Kept as-is. Nothing to decide.**

### 6b. ~~(original finding, for the record)~~
`AddRecipeModal`, `IngestModal`, `IngestReview`, `CalendarView`,
`CoachApplySheet`, `PortionSheet`, `OutboxView`, `RepertoireBook`,
`RecipeOverlay`, `StepsHistory` each blur the scrim (6px) **and** the panel
inside it (22px). The panel's backdrop is a scrim that is already 72–82%
opaque and already blurred, so the second pass is doing very little for a full
GPU pass on every modal open.

The skill's rule is about legibility (*"never stack a light translucent surface
on another"*); here it holds for cost instead. **Dropping the scrim's blur, not
the panel's, is the version that changes nothing visible.**

### 7. Sheets are silent, and the vocabulary already names the sound
`haptics.js` documents `threshold: 8` as *"a gesture passed its commit
threshold (swipe actions, **sheet throws**)"*. No sheet imports haptics. The
word exists for a use that was never wired.

Now that flick-to-dismiss actually works, the moment it fires is exactly the
causal event the skill's §13 wants feedback on. **The catch:** per the iOS
haptics memory, the only path that works on iOS 26.5 is the transparent switch
under his finger, which needs the tap to land on the switch — a *drag release*
may not qualify. **Worth one real test on his phone before building it.**

### 8. ~~Swipe rows judge a flick on average speed~~ — FIXED
Now projected from RELEASE velocity over an 80ms history, the same sampler the
sheets use. Two behaviours changed: a careful drag that *ends* in a flick now
commits (the old average refused it), and a row pulled back toward home is
cancelled however far it reached.

**The safety direction was checked, not assumed.** The rightmost action on an
Inbox row is DISCARD, so a row projects with Apple's snappier `0.99`
(≈99× on px/ms) rather than the sheet's `0.998` (≈499×) — a flick that would
throw a sheet clean off the screen must not, on its own, throw away a captured
thought. A twitchy 30px flick that the **old** rule committed outright (0.75
px/ms average, over the 0.6 bar) no longer does. The 200-simulated-scrolls
property and the vertical-lock veto were both re-proved across the new
velocity range.

### 8b. ~~(original finding)~~
`swipeCore.shouldCommit` computes `Math.abs(dx) / elapsedMs` — average velocity
over the entire gesture, not the release velocity. A slow, careful drag that
ends in a decisive flick reads as slow and does not commit; a fast drag that
stops dead still commits. Same class of fault as the sheet's, one layer up.

`sheetPhysics.velocityFrom` and `project` already exist and are tested.
**This is mostly a wiring job**, but it changes how every swipe action in the
Inbox commits, and the direction-lock property that protects DISCARD must be
re-proved. Not a change to make casually.

### 9. Sixty-one nested corners still are not concentric
Apple's `ConcentricRectangle` rule (iOS 26 HIG, and his third reel): a shape
inside a rounded shape takes **outer radius − the gap**, so both corners share
a centre point. `.nv-inner` and `src/concentric.js` now exist for this, and the
one case where the rule is absolute is fixed — a flush child must share its
parent's radius exactly, and `SwipeRow`'s hardcoded 12px track was bulged 10px
by the `var(--nv-radius)` card inside it under cupertino.

Measured by walking the live DOM in Safari across Mission, Train, Fuel, Inbox,
Settings and Voice — **62 off-concentric instances, now 61**. The worst
remaining, with what the rule wants:

| where | outer | gap | has | should be |
|---|---|---|---|---|
| Voice, the core's rings | 50 | 28 | 50 | **22** |
| Inbox, orphan-note chip | 22 | 19 | 8 | 3 |
| Settings, model selects (×33) | 22 | 14 | 5 | 8 |
| Mission/Train/Fuel rows (×9) | 16 | 12 | 8 | 4 |

**The decision:** whether to sweep them. Each needs looking at — a deliberate
capsule inside a card is not a violation, and forcing the formula on one
flattens it for no reason, which is why this is not a script. The measurement
above makes it a bounded job rather than an open one.

**A note on the instrument, since it was wrong first.** The naive formula
reported 109 instances; it was demanding square corners on children inset
*past* the parent's radius, where the parent's curve has already finished and
the child is visually independent. Scoping to `gap < outer` is what took it to
the real 62. The tempting CSS implementation is wrong too: hoisting the
arithmetic into a `:root` custom property resolves it **once** and inherits the
answer — measured at 20px for three different parents in Safari. The calc has
to live in the rule that uses it.

### 10. `user-scalable=no` is an accessibility failure that Nova can defend
The skill lists it under **Never Ship**. Nova's comment gives a real cause and
notes system accessibility zoom is unaffected, which is true — the iOS Zoom
magnifier is separate.

Left as-is deliberately, recorded here so it is a *decision* and not an
oversight. **It costs the in-app pinch escape hatch, and combined with §4 there
is no way to make Nova's text bigger by any means.**

---

## What still needs his phone

Everything above about *layout and declarations* was verified from source or in
Safari 26.5 on this Mac. These cannot be:

- **the flick actually feeling right** — the constants (110px threshold, the
  0.998 deceleration, the 130–420ms clamp) are Apple's and are unit-tested, but
  only a thumb can say whether the sheet throws the way an iOS sheet does;
- **the long-press vs text-selection fix** on real touch;
- **whether the status bar now matches** in `daylight` on a real install;
- **scroll bleed** being genuinely gone in the 17 overlays.

The honest position on all four: the declarations are provably present and the
maths is provably right. Neither is the same as it feeling correct.
