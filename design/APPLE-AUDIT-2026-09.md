# Nova against Apple's own rules — audit, 16 Sep 2026

Run against two skills installed from <https://emilkowal.ski/skill> at his
request: `apple-design` (distilled from *Designing Fluid Interfaces*, WWDC
2018, and *The Details of UI Typography*, WWDC 2020) and `mobile-native`.

Every finding below was located in the source and, where the claim was about
behaviour, **reproduced** — either by replaying the control flow in node or by
reading computed values out of the running app in Safari 26.5. Nothing here is
"the skill says you should".

**Eight findings were fixed and are in `a81d602` and `c7e8a15`.** The nine
below are left open on purpose: each is a design decision that is his, not a
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

### 2. Nothing in Nova leaves the way it arrived
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

### 3. The largest type in the app has no tracking
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

### 5. Hard hairlines under floating chrome, where a fade belongs
The skill is specific: *"Scroll edge effects, not hard dividers. Instead of a
1px border under a sticky header, fade a small blur/gradient mask where content
meets floating chrome."*

Nova puts a `1px solid var(--nv-edge)` under the top bar and under
`RecipeOverlay`'s sticky header. **I added one of those this morning** in
`.nv-liquid-flush`, reproducing the pattern rather than questioning it.

**The decision:** a `mask-image` fade at the chrome edge instead of the line.
It is a contained change to two places and it is the single most "iOS 26" thing
left on the list.

### 6. Ten modals run two backdrop passes to achieve roughly one
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

### 8. Swipe rows judge a flick on the whole gesture's average speed
`swipeCore.shouldCommit` computes `Math.abs(dx) / elapsedMs` — average velocity
over the entire gesture, not the release velocity. A slow, careful drag that
ends in a decisive flick reads as slow and does not commit; a fast drag that
stops dead still commits. Same class of fault as the sheet's, one layer up.

`sheetPhysics.velocityFrom` and `project` already exist and are tested.
**This is mostly a wiring job**, but it changes how every swipe action in the
Inbox commits, and the direction-lock property that protects DISCARD must be
re-proved. Not a change to make casually.

### 9. `user-scalable=no` is an accessibility failure that Nova can defend
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
