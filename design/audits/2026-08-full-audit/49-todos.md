# 49 — Todos

Audited 2026-08-31. Read-only. Files opened: `src/vals/valsTodos.js`
(full, 80 lines), `server/lib/todos.js` (1-50 + structure; the shared
todoLine contract read at 27, the Todoist mirror at 42), Todos.jsx
[mapped — render over the vals]. Phone-width carried ([45]).

## 1. What it is (verified)

The vault To-Do page (Wiki/Inbox/To-Do.md) as a first-class screen — "one
list, three writers" (captures routed 'todo', this screen, Obsidian by
hand) "and Todoist mirrored two ways", all through todoLine.js, "the ONE
contract for this page's four writers." Every write snapshots first and
nudges the Todoist reconcile after.

- **Honest header states**: demo ("CONNECT A BACKEND…"), offline
  ("OFFLINE — SHOWING LAST-KNOWN LIST"), loading, live counts; the
  composer stays usable offline via the outbox.
- **Category groups** in a fixed order with UNSORTED last; one-tap
  category fix; a deterministic guess for direct adds with the honest
  framing ("the classifier does better for captures; one tap on the tab
  fixes either").
- **Stale chips** on open items ≥14 days; age labels; the sidebar open
  count; a sync note that states exactly what is mirrored where,
  configured or not.

## 2. Current workflow, traced

"Renew rego" typed here → category guessed 'errands' → the line lands on
the vault page (backed up, locked) → Todoist mirrors it within the
minute → he checks it in Todoist on the train → the vault line checks →
Compost eventually sweeps it with undo. An open item from three weeks ago
wears its stale chip quietly.

Failure modes: all owned by the rails audited at 27/42 (lock, backup,
sync races) — this surface adds none. The stale chip is the honest
ceiling for nagging here: open to-dos are deliberately NOT open-loops
material ([23]'s division), and the evening closure line ([05] plan 3)
will carry the day counts.

## 3. Pros / 4. Cons

Pros: rule 3 embodied (the screen is a view over a page he owns);
the four-writers-one-contract discipline; honest tri-state header;
offline-first composer.

Cons:
1. **No due dates in the line format** — VERIFIED this pass (text +
   added + category only). This ANSWERS [14] plan 7's gate: weekPlan's
   deadline-placement has no data to stand on. The real decision is now
   explicit: either map Todoist due dates into the contract (a joint
   42/49 ADD — one new field in todoLine, both sync directions, feeding
   weekPlan and the evening closure) or drop the idea honestly.
   Flagged to the synthesis as a scoped, decidable question.
2. **CATEGORY_HINTS is the platform's 4th keyword detector** — lowest
   stakes of the family (one tap fixes, and the comment says so), but it
   joins the [23] shared-extraction sweep as a listed member.

## 5. Mission test

**Daily: earns its keep as glue** — one list that is simultaneously a
vault page, a phone app, and Nova's context, with zero copying. The
stale chips and category order are the right amount of structure for a
personal list.

## 6. Improvement plan

1. **[Synthesis flag] The due-date decision** (map from Todoist, or
   drop [14]'s idea) — scoped above.
2. **[Sweep member] CATEGORY_HINTS** joins the keyword-detector
   extraction.

## 7. UI recommendations

- **None** — the screen is a list that behaves like one.

## 8. Verdict

**Keep as-is** — twelfth clean keep; its one real question (due dates)
is now precisely posed for the synthesis rather than vaguely gated.
