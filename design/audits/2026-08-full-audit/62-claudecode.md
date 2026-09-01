# 62 — ClaudeCode (the Code tab)

Audited 2026-09-01. Read-only. Files opened: `src/screens/ClaudeCode.jsx`
(1-182, full), `src/vals/valsMisc.js:270-330` (code + ingest slice),
`server/routes/claudeCode.js:17-77`, `server/lib/codeChanges.js` (full at
93 lines), `server/lib/claudeCode.js` boundary constants re-verified
(19-31, 176-177, 594-638, 942-943, 982-1002). The lanes themselves were
audited across earlier items; this item is the surface. Phone-width
carried ([45]).

## 1. What it is (verified)

The direct line to Claude Code: a console-styled chat (Builder gold /
Breaker magenta / System warn), a Spar button that sends the Breaker, a
model picker (aliases), a workspace toggle (Nova OS repo / vault), the
C2 diff panel with commit/shelve, "Add to vault" (ingest, audited at
32), and the CAN/CAN'T card.

## 2. The security promise, verified claim by claim

The header says "READ + EDIT FILES · NO SHELL ACCESS" and CAN/CAN'T
says "✕ No shell/Bash". Against the URGENT [30] finding (allowedTools
is documentation-only), this screen's promises ARE backed by the real
boundary:
- Main lane (claudeCode.js:176-177): allowed 'Read Edit Write Grep
  Glob' AND the full DISALLOWED_TOOLS list (:31 — Bash, Agent, Web*,
  Cron*, Task*, …) — the enforced fence.
- Breaker: DISALLOWED + Edit,Write (:982) — sparring is read-only.
- Debrief/greeting (594-638): allowed '' and disallow even
  Read/Grep/Glob — the sealed-facts call, tightest of all.
Every line on the CAN/CAN'T card is TRUE as enforced. **DISALLOWED_
TOOLS at claudeCode.js:31 is the donor constant for the [30] fix** —
the three unsafe lanes (healthInsight, coachReflection, scanStatement)
just never import it.

## 3. Workflow traced + the C2 panel

Message → /claude-code/message job → poll → Builder replies with
context retained (session card says so honestly). Changes appear as
UNCOMMITTED CHANGES: file list (slice 8 + "…and N more" — honest cap),
diff on demand (truncation labelled "the rest is on disk"). Then his
call:
- **Commit** — server re-enforces everything the UI implies:
  vault → hard refusal ("Nova never commits your notes for you",
  codeChanges.js:58 — not just a hidden button); empty message →
  "a commit needs a real message (8+ chars) — future-you reads these";
  nothing staged → "nothing to commit". Local commit only, no push.
- **Shelve** — `git stash push -u` with a nova-shelf label, chosen
  over `checkout --` because "a hard discard would be the one
  destructive" op (:9-10). RESTORE pops it — and refuses if the top
  stash isn't Nova's ("recover it yourself so nothing of yours is
  clobbered", :90), protecting HIS stashes.

## 4. Pros / Cons

Pros: the promise-card-matches-enforcement discipline (rare anywhere);
shelve-not-discard undoability by construction; server-side re-
enforcement of UI rules; Enter-sends/Shift-reserved (better than
Leader's bare Enter); "Review what changed before trusting it" as
standing copy.

Cons:
1. **codeModelOptions is a hand-duplicated list** (valsMisc.js:299-304)
   of the model board's aliases, mitigated only by a comment ("change
   both together" — with its own incident: "'Opus 4.8' sat here after
   Opus 5 shipped"). The [22] hand-maintained-list family, client
   edition — the board's MODEL_CHOICES could be served once and both
   pickers derive.
2. Chat renders raw pre-wrap text, no ChatMarkdown — acceptable in a
   mono console, noted only.

## 5. Mission test

**On-demand / weekly: earns its keep** — "the thing that used to send
him to a terminal" (C2 comment, ClaudeCode.jsx:54-55) now happens on
the phone with undoable outcomes. Long-term it's the platform's own
self-improvement surface, with the Breaker as its adversarial check.

## 6. Improvement plan

1. **[Refine — [22] family]** Serve model aliases from the server's
   MODEL_CHOICES (Settings already fetches the board); codeModelOptions
   derives instead of duplicating. The comment-convention becomes
   structure. **Impact/effort:** M / L.
2. **[Owned]** The [30] sweep's donor constant lives here — fix owned
   at synthesis as the audit's #1 item.
3. **[Empty categories]** No ADD items — the surface's restraint (no
   push, no shell, vault read-only) is its design; no other REFINE
   found.

## 7. UI recommendations

None beyond plan 1's invisible plumbing. Dashboard-drift screen:
passes — nothing new renders. Phone-width ([45]): the two-column grid
and the diff `<pre>` are prime candidates for the carried 375px pass.

## 8. Verdict

**Keep as-is / Refine** — the audit's best example of a user-facing
promise backed by the real enforcement boundary, and the home of the
constant the #1 fix will export. One hand-maintained twin list to
dissolve.
