# 42 — Todoist Sync

Audited 2026-08-31. Read-only. Files opened: `server/lib/todoistSync.js`
(full, 271 lines); todoLine.js (the shared page contract + lock, read at
27), the loops-card status rendering with verbatim errors (02). Deferrals:
Todos screen (49).

## 1. What it is (verified)

Two-way sync between the vault To-Do page and Todoist's Inbox —
deterministic reconcile, no model, and **non-destructive by design**:
"Nova only ever CREATES tasks, CLOSES tasks, and checks/adds vault lines —
it never deletes on either side" (8-14). Identity is the to-do's TEXT,
with the honest consequence stated: "editing the words on either side
makes a new item rather than guessing at a rename."

- **The reconcile** (159-240): linked pairs verified both-alive; vault
  line gone → close the task; task gone → check the vault line;
  vault-only opens push (category → label), **linking instead of
  duplicating** when an identical task exists; Todoist-only actives pull
  (label → category). The `resolvedTexts`/`closedTaskIds` guards carry
  their race documentation: "without these a line we just checked off
  would be pushed straight back" (176-180).
- **Hygiene throughout**: the shared todoLine contract and write lock
  ("the one contract for this page"), backup-first vault writes, atomic
  state, single-flight sync, cursor pagination on the v1 API (the v2
  410-Gone migration noted), 15s request timeouts, honest error into
  `lastResult` which the loops card shows verbatim, a fire-and-forget
  post-filing sync so Todoist stays fresh without blocking the filing,
  10-minute scheduler with heartbeat, Guardian-watched.

## 2. Current workflow, traced

He files "book the dentist" via capture → the 500ms hook pushes it to
Todoist's Inbox with its label. On the train he completes it in Todoist →
next pass checks the vault line (backup-first, locked). He sweeps
completed to-dos via Compost → the vanished lines close their tasks. The
loops card: "14 open items in step · last pass 09:40 — pushed 1,
checked off 1."

Failure modes:
- API down/token bad → the whole pass errors into lastResult, shown
  verbatim on the card; next tick retries. **Honest.**
- Same text both sides, unlinked → linked, not duplicated. **Honest.**
- Line edited since linking → text identity means the old pair resolves
  and the new wording is a new item — documented behavior, not a bug.
- Just-resolved races → the pass-local guards. **Honest, designed.**
- **A task DELETED in Todoist reads as completed**: disappearance from
  the active list is the only signal, so a task he deletes as
  wrong/duplicate gets its vault line CHECKED as done — and Compost will
  later sweep it as an accomplishment. Deleted ≠ done; the one place the
  non-destructive philosophy produces a small lie.
- Unconfigured → the scheduler exits before ever beating — invisible to
  Guardian today, and worth a configured-aware entry when [22]'s
  never-beaten registry lands (interplay noted there).

## 3. Pros — what genuinely works

- **Non-destructive with text identity, both stated as contracts** — the
  two decisions that make a two-way sync safe to trust, written where
  they're implemented.
- **The race guards with their reasons** — the check-then-push-back loop
  designed out and documented.
- **Link-don't-duplicate** on identical text — idempotent onboarding of
  an existing Todoist inbox.
- **Verbatim error surfacing** on the card — sync failures are never
  mysterious.
- **The API migration note** — deployment reality recorded at the
  constant.

## 4. Cons and gaps (ranked by real-life cost)

1. **Deleted-in-Todoist marks the vault line done** — small, real
   semantic lie feeding the sweep.
2. **[22] interplay** — unconfigured invisibility, owned there.
3. Duplicate identical texts in the vault collapse in the text map —
   consistent with text identity; edge accepted.

## 5. Mission test

**Daily: earns its keep** — his tasks live wherever he is (phone Todoist
widget, vault page, Nova's briefs) with one truth and no manual copying;
the non-destructive contract means trusting it costs nothing. A utility,
correctly scoped.

## 6. Improvement plan (ranked; uncapped — one substantive item)

1. **[Refine, gated] Distinguish deleted from completed.**
   - **Proposal:** GATED on the v1 API's completed-tasks endpoint: when a
     linked task leaves the active list, query completed-by-id (or the
     completed list for the project); found → check the vault line as
     today; not found → it was deleted → leave the vault line OPEN and
     note it in lastResult ("1 task deleted in Todoist — its line stays
     open"). If the API can't answer cheaply, keep today's behavior and
     document the trade in the module header instead.
   - **Doctrine:** rule 4. **Impact/effort:** M-L / M-L.
   - **Verification:** scratch account: complete one, delete one; assert
     the divergent outcomes.

## 7. UI recommendations

- **None** — the loops card already tells the whole story, verbatim
  errors included.

## 8. Verdict

**Keep as-is** — seventh clean keep; a two-way sync whose safety comes
from two well-chosen contracts, with one small semantic lie at the
deletion edge. Highest-value next action: the gated deleted-vs-completed
check.
