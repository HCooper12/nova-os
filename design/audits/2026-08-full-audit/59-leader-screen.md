# 59 — Leader (screen)

Audited 2026-09-01. Read-only. Files opened: `src/screens/Leader.jsx`
(1-134, full), `src/vals/valsLeader.js` (1-47, full),
`server/routes/leader.js` (status payload + reflect route),
`server/lib/leader.js` re-opened at 49-70, 170-200, 424-446 (profile
lifecycle; the agent itself audited at 37). Phone-width carried ([45]).

## 1. What it is (verified)

The Leader agent's room: the day's idea held large ("the same receipt
the homepage card and brief read", Leader.jsx:59-71) with its kind chip
(TRY TODAY / REMEMBER / CONSIDER), the why-line, and **source receipts**
("from: …" — advises from HIS material, refs rendered); the standing
picture as chips (WORKING AGAINST / WORKING FOR HIM); the sit-down chat;
and RECENT IDEAS — "repetition made visible" (117), today filtered out,
capped at 5 of the route's last 8.

## 2. Workflow traced

Morning: the idea lands before the brief → he reads it here or on the
homepage card. The sit-down: he types what he's facing → doLeaderChat →
the reflection extraction files struggles/wins/resolutions via the
honest-middle rail (37, leader.js:459-464). The route's status payload
is honestly filtered: **resolved struggles never reach the screen**
(routes/leader.js:20 `filter((s) => !s.resolvedAt)`), recent is the real
last-8. Research meta is three-state honest ("no run yet").

## 3. Pros

- The empty sit-down prompt is **consent-by-disclosure**: "What you
  share here steers tomorrow's idea and Saturday's research" (94-95) —
  the profile-reshaping loop stated where he types, not buried in docs.
- vals header: "All data is the server's receipts; absence renders as
  absence" — and it does: not-connected vs no-idea-yet are distinct
  states (73-75); busy suppressed while streaming (valsLeader:38).
- Auto-scroll leaves him alone when he's scrolled up to read back
  (18-31, the Coach-log behaviour, shared instinct).
- Server-side the profile decays honestly: resolved-not-deleted
  (leader.js:424-427), model context slices newest-6 with ages.

## 4. Cons

1. **The age-visibility gap.** leader.js:49 promises "stale struggles
   age visibly instead of steering research forever" — and the MODEL
   sees `"(Xd ago)"` on every entry (profileLines, leader.js:184-186).
   But valsLeader:25-26 maps chips to `.text` only, dropping the `at`
   the route already sends. He can't see that a WORKING AGAINST chip is
   60 days old and still steering Saturday's research.
2. **No UI path to resolve.** The designed path (tell the Leader it's
   handled → reflection extracts `resolved`) is good, but a struggle he
   simply stopped mentioning steers research until he happens to say so.
   The reflect route (routes/leader.js:59) already accepts `resolved`
   and rides the honest-middle undo rail — a tap could reach it.
3. WORKING FOR HIM entries have no resolution at all — they only scroll
   off by displacement (last-8 shown, last-4 to the model). Acceptable
   decay, noted not planned.

## 5. Mission test

**Daily (the idea) + weekly (the research steer): earns its keep** — a
leadership practice that compounds because the sit-down feeds the
steering loop. The cons are about keeping that loop honest to HIM at
the monthly horizon, where stale struggles would quietly misaim it.

## 6. Improvement plan

1. **[Refine]** Show age on profile chips ("· 12d") — the data is
   already in the payload; the vals just drops it. Closes the gap
   between what the model sees and what he sees. **Impact/effort:**
   M / L.
2. **[Add]** Tap/hold a WORKING AGAINST chip → "mark handled" → the
   existing reflect route's `resolved` path (rails + undo already
   there). **Impact/effort:** M / L.
3. **[Empty categories]** No capability-gap items; REFINE beyond 1-2:
   none found.

## 7. UI recommendations

Items 1-2 above ARE the UI plan (honest states + reachability). Beyond
them: the 46vh chat log and chip wrap need the phone-width pass ([45]);
no dashboard-drift risk — both changes surface data the server already
holds, no new panels.

## 8. Verdict

**Keep as-is / Refine** — the screen is honest and the loop is
disclosed at the point of use; the one real gap is that the staleness
honesty built for the model's eyes never made it to his.
