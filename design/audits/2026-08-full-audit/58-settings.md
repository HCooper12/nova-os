# 58 — Settings

Audited 2026-09-01. Read-only. Files opened: `server/lib/modelPrefs.js`
(1-60 + the lane registry structure — its laneOffError/laneSkipped/
modelFor machinery was verified in situ across ~20 agent items),
`src/screens/Settings.jsx` (connection + About You sections; voices/tab
order/wake word [mapped]). Phone-width carried ([45]).

## 1. What it is (verified)

Connection setup with a real test button; the **About You editor** — the
profile every model lane reads first (NOVA-METHOD §5's "highest-leverage
two minutes in the app"), with placeholders that teach what good input
looks like (equipment limits, injury flags, schedule); and **THE MODEL
BOARD**, whose header is one of the platform's best design documents
(modelPrefs.js:6-23):

- The incident: "on 21 Aug the Coach silently inherited the ACCOUNT's
  ambient default and ate Hayden's usage mid-conversation."
- The failure class: the fix "pinned ten lanes by hand, and the pins then
  lived scattered across ~30 files as bare string literals — which is
  exactly how the next lane gets missed. (Eight still were…)" — the eight
  never-pinned lanes named.
- The contract: "the registry below is the single source of truth. Every
  spawn site asks it for its model, **and a lane with no entry here
  cannot exist**." Turning a lane off is "a real, honest stop, never a
  silent no-op" — the machinery (laneOffError with reasons in words,
  laneSkipped, the 409 laneOff handler) verified working at ~20 sites
  across this audit.
- Model choices carry alias-vs-pinned honesty ("follows the newest…" vs
  "this exact version, never moves"); lanes group by life area, each
  documenting "exactly what stops happening when it is off."

## 2-4. Trace / Pros / Cons

Every "pinned, lane-gated, budget-capped" observation in items 01-44
traces to this one registry — the audit effectively verified this screen
from the consumer side ~20 times before reading it. Pros: the board IS a
named rail (*the model board*); the About You placeholders as teaching;
honest connection states. Cons: none of its own — the [21]-found config
asymmetry (deterministic agents' off-switches live in per-agent mode
configs or nowhere, while model lanes all have this board) is the
cross-cutting config-parity note, owned there.

## 5. Mission test

**Foundational** — the board is why cost, capability, and off-switches
are decisions he makes in one place with honest consequences, rather
than string literals scattered through thirty files.

## 6-8. Plan / UI / Verdict

Nothing proposed of its own; [21]'s config-parity note stands at the
synthesis. **Keep as-is** — twentieth clean keep; the registry pattern
this board embodies is exactly what [22]/[57] want for the scheduler
fleet.
