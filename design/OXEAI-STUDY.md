# OxeAI study (12 Oct 2026)

Source: his screenshots (Instagram story ad, the App Store carousel and listing),
two reels (instagram.com/reel/Ddz3cviOv3f, 23 s, the workout reel;
instagram.com/reel/DeUmB2OJIZl, 53 s, "Smart Grocery List"), the @oxefit
profile and oxeai.com. Frames were watched, the grocery reel transcribed.

His brief: analyse it, plan what Nova should take from its design and
features, and do not stay inside Nova's current design scheme.

---

## 1 · What OxeAI is

OxeFit is a hardware company first: the XS1 strength machine with force
plates (profile bio: "the smarter way to a stronger life featuring strength,
cardio, and force plate technology", 41.3K followers). OxeAI is the companion
app, sold as "your AI companion for total wellness", with two paid tiers.
Core covers chat, activity and nutrition plans and journaling. Pro adds deep
search, extended reasoning and form correction. The pitch is "Just chat.
OxeAI handles the rest": no forms, a profile built from conversation.

That is Nova's thesis, sold to strangers. Nova already has most of the
skeleton (Coach, photo logging, Rotation, Shopping, readiness, form check).
Where OxeAI is ahead is the **forms its numbers take** and a few
**missing measurements**. Where Nova is ahead is honesty, depth and
privacy.

## 2 · What it does, screen by screen

| Surface | What is on it | What is good about it | What is weak |
|---|---|---|---|
| Nutrition Score card | Ring "47", then "+ Boosting your score" (balanced calories, high fibre, high nutrients) and "− Hurting your score" (low water, low cardio, exceed sugar/sodium) | The number comes with its reasons, split into two columns. You can read why without opening anything. | 47 out of what? Nothing says how it is computed. "Low cardio" counts against a *nutrition* score, so domains bleed into each other. All caps. |
| Snap a photo | Camera with corner brackets, then a result sheet: title, one-line description, an 8-cell grid (kcal, protein, fat, sugar, carbs, fibre, caffeine, alcohol), ingredient lines with grams, Adjust / Done | The ingredient lines with grams. Caffeine and alcohol count as nutrients. Time and meal tag shown as chips. | A standard sheet. The numbers are a table with nothing drawn. |
| AI Nutritionist | Chat: "build a keto meal plan to lose weight" → 4-day plan → "View nutrition plan" button → plan page; "Can you make it paleo based?" | Chat produces an *object* (a plan page) rather than more text, and the plan can be changed or reverted by talking. | **Their own ad's "keto" plan has quinoa, sweet potato, brown rice and blueberries.** The model wrote the plan and nothing checked it against the constraint. Nova's rule (models decide, code checks) is the fix. |
| Daily Agenda | Timed rail: 8:00 breakfast (struck through, ticked), 12:00 lunch, 12:00 Mat Pilates 15 m, 5:30 run, 7:00 dinner, guitar practice. Each row has a domain glyph and tint, and one row lifts out of the list. | One timeline for meals, training and habits, ticked off in place, with the struck-through row showing what's done. | Flat white cards with a shadow on each. |
| Energy Balance | A balance scale: "122 kcal Surplus", eaten 1,146 (apple pan) vs burned 1,024 (flame pan), "*including resting + active" | The best idea in the set. A comparison drawn as a physical metaphor that reads in half a second. The footnote is honest about what "burned" contains. | At 11:00 this compares a front-loaded number (food) with one that builds all day (burn), so every morning reads as a surplus. That's misleading. |
| Hydration | Donut by drink type (coffee, tea, soda, alcohol, other) in fl oz, a timed list, and an "Insights" card with Dismiss / Discuss | Drink type as composition. Discuss opens the chat about that card. | The insight is mush: "Your nutrition has improved by choosing fewer high-fat foods… helping support healthier daily habits". No number, no date, nothing he could act on. |
| Home | Up next (Pilates 10:00), an "Anything I can help you with?" field with a gradient stroke, energy balance, Strength Score 84, "Exercises scored 9/394", active cal burn | "Up next" with a time at the top of Home. | "9 / 394 exercises scored" is a vanity denominator. |
| Workout reel | Real gym footage. A white pill rides over it: "toes to bar pull ups · 190lb ×10 · Sep 10 2026 · Est. 1RM". A front/back muscle map in five steps (inactive, light, engaged, active, peak) with the hint "tap a muscle to see its strength score". "Weekly active day streak": dots on a line, "2 of 4 days", "0 weeks". | The PR pill over live footage is the *show-the-real-thing* rule done well. The muscle map gives a five-step intensity scale on a body you recognise straight away. The streak as dots against a target ("2 of 4") is more honest than a bare count. | Orange monotone body. Every muscle is the same hue. |
| Grocery reel | Chat sets goals → plan → list grouped by aisle (Produce, Spices, Baking, Snacks) with quantities and date range "Aug 30 – Sep 5", checks, Select → Delete | The list is scoped to a date range: this list is for *that* week's plan. | Nova already does most of this, and with prices. |
| Store listing | Data linked to identity: health, contact, search history, identifiers, **sensitive info**. Accessibility: none declared. | | Nova's data sits in his own vault on his own Mac. That's a real advantage, worth saying in Nova's own surfaces where it matters. |

**Visual language.** Frosted cards over real photographs of food and gyms.
The phone's own card lifts *out* of the phone frame toward you, with the
screen behind it blurred. A chain of round icons (flag → apple → drop →
smile) is linked by a line, meaning "these connect". A purple-orange
gradient X logo and rainbow gradient type. Lato-like humanist sans throughout.

## 3 · Where Nova stands (surveyed in code, 12 Oct)

| OxeAI has | Nova today |
|---|---|
| Photo/text/voice meal logging with ingredient grams | **Yes.** `server/lib/scanFood.js` returns components with grams that must sum to the total; Composer on Fuel has type/photo/barcode/talk plus a refine thread. |
| Fibre, sugar, sodium, caffeine, alcohol | **No.** Every entry is `{p,c,f,kcal}` only (`foodLog.js`). Grep finds none of the others. |
| Nutrition score with reasons | **No score.** `dailyReview.js` writes a qualitative cross-domain read; `nutritionLog.monthAdherence` is a monthly protein hit-rate. |
| Eaten vs burned | **Partial.** Active energy is ingested (`autoExport.js`, `healthWorkouts.js`) but never reaches Fuel. **Resting/basal energy is not ingested at all** (grep: nothing). Fuel compares eaten against a computed target (`intake.js`). |
| Hydration by drink type | **No.** Nothing anywhere. |
| AI multi-day plan, edited by chat, revertible | **Partial.** The Rotation (`rotation.js`) is a standing slot set; `tweakRecipe.js` edits one recipe. No generated week, no plan-wide edit, no revert. |
| Shopping list from the plan | **Yes, and ahead** (aisles, source tag per line, real prices). |
| Timed daily agenda | **No.** `planToday.js` is a Top 3, not a timeline. |
| Muscle map / strength score / e1RM / streak | **Partial.** `Body3D.jsx` performs a single lift with muscles lit; TrainSummary draws weekly hard sets as a ring with a hue per muscle (`muscleHue.js`). e1RM PRs exist (`trainingAnalytics.js`). Streak counts sessions (`streaks.js`). No whole-body weekly map, no strength score. |
| Readiness | **Yes.** `computeReadiness` (HRV vs baseline + sleep), the Ready ring. |
| Insight cards, Dismiss / Discuss | **Yes.** Inbox and Home already have Discuss into a thread. |
| Form correction (their Pro tier) | **Yes.** The form check lane. |

## 4 · The plan

Ordered by how much it would change his day per unit of work. Sizes are
rough: S under a day, M one or two sessions, L several.

### A. The balance scale: eaten vs burned, told honestly (M)
Draw what OxeAI draws, a beam that tilts, and fix the lie in it. Burn
accrues all day, so the comparison is **eaten so far vs burned so far, plus
where the beam will settle by tonight**: a ghost beam at the projected
end-of-day position, from his own typical hourly burn curve (his history,
not a formula), labelled "by tonight, if today goes like your usual
<weekday>". The pans hold real objects: the plate pan stacks today's meals as
small photos or glyphs, the burn pan stacks resting as a base block plus each
workout as its own slab, in that muscle group's hue. When he logs a meal the
beam tips: a spring on the beam's rotation, which counts as acting the
change out.
- **Needs first:** ingest resting/basal energy (`autoExport.js` metric map,
  the Health Shortcut's body). Without it, the burned pan says "active only"
  in words, never a silently partial number.
- **Where:** Fuel (top, beside The Plate) and a Home pinned card; one view
  model in `vals/`.
- **Different from OxeAI:** the projection, the stacked real objects, and
  "so far" stated in plain words.

### B. Day read: boosts and drags, computed by code (S–M)
Keep OxeAI's two-column "+ helped / − hurt". Drop its opaque 47. Each line
is a fact code computed against his own targets, with its number: "+
Protein 182 g, floor 160", "− Fibre 11 g, aim 30", "− Logged 2 of 3 meals,
so tonight's read is partial". Fuel stays Fuel; training goes to Train's own
read. If he wants a single number, it's a published formula he can open
("how this is scored") and a dashed ring on a day with gaps (house rule),
never a model's guess. The serif news line above it is code's sentence,
the same way `summaryFacts.js` works.
- **Decision for him:** number plus reasons, or reasons only (my pick).

### C. Five more things on every plate (M, contract change)
Add fibre, sugar, sodium, caffeine and alcohol to the `scanFood` components
and the entry schema. This is a shared format (`foodLog`, the plate, history,
the vault writer, the Notion/recipe paths), so it changes in every reader or
none. Old entries show these fields as "not recorded", never 0. Photo
estimates of sodium are rough, so they wear "est." and B's drags only use
them when the entry came from a barcode or a recipe with a label.
Caffeine gets its own small instrument: a decay curve through the day
(half-life about 5 h) with the line where it crosses his sleep time, read
from his sleep data. Coffee and sleep is a question he can actually act on.
Nothing in OxeAI does this.

### D. Drinks (S–M, only if he wants it)
A drink log by type (water, coffee, tea, protein shake, alcohol, other), fed
from the Composer ("a long black and 600 ml water") and Apple Health
dietary water if he logs it there. Draw it as a glass that fills in layers
by drink colour. That beats a donut, because a donut cannot show a target
and a glass can (the rim). Caffeine and alcohol flow into C automatically.
- **Decision for him:** whether he wants to log drinks at all. If he
  won't log water, a half-empty glass is fiction by omission, so the honest
  default is to not build it.

### E. The day as one rail (L, the biggest change)
OxeAI's Daily Agenda, made Nova's: one vertical timeline for today
carrying calendar events, the program session, the Rotation meals in
focus, the Repertoire technique, Practice, and the Top 3. Each row wears its
domain's hue and a glyph, and a "now" line moves down it. Done rows strike
through with a sweep (`.nv-strike`-style), and a row he's on lifts out of the
rail onto glass, the way OxeAI's lunch row does. Ticks ride the inbox rails
with undo. Times come from real sources only: the calendar's time, his usual
meal hour from his own log history, the program's planned slot. No time
means the row sits in an untimed "today" tray, never at a made-up hour.
Answers "what's next" on his phone, which is a question he asks every day.
- **Where:** a Home card ("Up next" plus three rows) that opens to the full
  rail; both idioms.

### F. Muscle map for the week (M)
A front/back figure on Train, each muscle filled in **its own hue**
(`muscleHue.js`) at five intensity steps from weekly hard sets against his
target volume (the steps OxeAI uses: none, light, engaged, active, peak).
OxeAI's map is all orange; Nova's colour already means something here.
Tap a muscle: the sheet shows its sets this week, its lifts' e1RM trend and
the gap to target. Render: a 2D SVG silhouette (cheap, crisp, 375-safe) or a
still pose from `Body3D` (shared hue map, heavier). Recommend the SVG for
the glance and Body3D on the tap.

### G. The PR moment (S)
When a logged set beats his best (compared at the resolution it's displayed
at: the rounded-comparisons trap), a pill rises in the island or over the
session stage: "Romanian deadlift · 50 kg × 8 · new est. 1RM 63 kg (+2)".
Spring in, count-up on the number, haptic tick. Copy OxeAI's typography:
name left, load large right, date and est. 1RM small beneath.

### H. Week dots in place of a streak count (S)
"2 of 4 sessions this week" as dots on a line against his program's days,
OxeAI's form, with the missed day dashed rather than empty and the
make-up-day rule respected. A long streak number punishes one bad week;
dots against the program are honest about this week only.

### I. A week of meals from a sentence, checked by code (L)
"Build me a week, high protein, Asian-leaning, no peanuts" → a draft
Rotation for a dated week, with the shopping list scoped to that range
(OxeAI's date range on the list is worth taking). **Code validates every
dish against the stated constraints and his allergies before it is shown**,
and refuses or flags (the keto ad is the cautionary tale). Plan-wide edits
by chat ("make it paleo") produce a diff: dishes leaving slide out, dishes
arriving slide in. The previous week stays one tap away (undo rails, a
`coach-program`-style record). Builds on `rotation.js`, `tweakRecipe.js`,
`shoppingList.js`.

### J. Visual language worth taking, outside the house scheme
1. **His own food as the backdrop.** OxeAI shoots its glass over real
   produce. Nova can put glass over *his* plate: keep the photo from a food
   scan (today it is not stored, so that needs a decision on storage) and use
   today's latest meal photo, heavily blurred, as the Fuel hero backdrop. The
   frost is tinted from the photo's dominant colour. The page then looks
   like what he ate.
2. **The lift-out.** The focused row physically leaves its list and floats
   above the blurred rest (scale ~1.04, a real shadow, the list behind
   dimmed and blurred). For the rail (E), a selected meal, a Discuss card.
3. **Linked bubbles for cause and effect.** OxeAI's flag → apple → drop →
   smile chain is decoration there. In Nova it can carry real meaning: the
   daily review's causal claims drawn as a chain ("short sleep → HRV 41, −18%
   → readiness 52 → bench held at 80"), each bubble a real number in its
   domain hue, the link drawing itself as Nova says it. This is the
   "connect the dots" OxeAI promises on its site and never draws.
4. **Headlines that say what it does.** "Snap a photo. Log your meal." is
   the right register for section heads and empty states.

### Do not take
- The rainbow and orange-purple gradient type and logo, and the gradient
  stroke on the ask field (global AI-default list).
- All-caps reason lists, a shadow on every card, flat white cards on a white
  page.
- Unexplained scores (47, 84) and vanity denominators (9/394).
- Insight copy without a number or a date. Every Nova insight names the figure
  and where it came from.
- A model-written plan that nothing checks.

## 5 · Suggested order
G and H first (small, ships this week, makes training feel rewarded). Then B,
which needs no new data. Then A once resting energy is ingested. Then C,
the schema change, done once and properly. F next, then E, the big one, which
also covers his "what's next" on Home. I only after E exists, because the
week's meals should land on the rail. D only if he says yes.

Every item ships in both Home idioms from one view model, survives 375 px,
honours reduced motion, and gets a mockup he approves before it is built
(build matches mockup, his 7 Oct rule).
