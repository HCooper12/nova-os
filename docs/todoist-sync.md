# Nova OS ↔ Todoist — two-way to-do sync

Nova mirrors the vault's **To-Do page** (`Wiki/Inbox/To-Do.md`) with your
**Todoist Inbox project**, both directions, on a deterministic reconcile
pass — no model involved, and nothing is ever deleted on either side.

## What syncs

| You do this | Nova does this |
|---|---|
| Capture a to-do thought (voice, share sheet, Inbox) → it files to To-Do | The task appears in Todoist's Inbox within moments |
| Add a task in Todoist | It appears on the vault To-Do page within ~10 minutes |
| Complete a task in Todoist | The vault line gets checked `- [x]` |
| Check a line in the vault / Obsidian | The Todoist task is completed |
| Undo a to-do filing in Nova | The Todoist task is completed (never deleted) |

A to-do's identity is its **text**. Editing the wording on either side makes
a new item rather than guessing at a rename — honest and predictable, if
occasionally literal.

## Connect it (one-time, ~2 minutes)

1. In Todoist: **Settings → Integrations → Developer → API token** — copy it.
2. On the Mac, add one line to `server/.env` (this file is gitignored —
   the token never leaves the machine):

   ```
   TODOIST_TOKEN=<paste the token>
   ```

3. Reload the server:

   ```
   launchctl kickstart -k gui/501/com.novaos.server
   ```

The Inbox screen's **TODOIST SYNC** card flips from NOT CONNECTED to
connected, runs a first pass, and shows what moved (`pushed / pulled /
closed / checked off`). After that it reconciles every 10 minutes, plus
immediately after any to-do gets filed. **SYNC NOW** forces a pass.

## Scope and options

- Syncs the account's **Inbox project** by default. To target a different
  project, add `TODOIST_PROJECT_ID=<id>` to `server/.env` (the id is in the
  project's URL in the Todoist web app).
- The first pass links identical items instead of duplicating them, so it's
  safe to connect with both lists already populated.
- State lives in `server/data/todoist-sync.json` (task-id ↔ text links plus
  the last pass's receipt). Deleting it forces a fresh link-up on the next
  pass — harmless, for the same reason.

## Honest failure modes

- No token → the card says NOT CONNECTED and every sync is a clean no-op.
- Todoist unreachable → the pass records the error on the card and tries
  again next cycle; nothing half-applies (each item's action is atomic).
- Completing happens, deleting never does: the worst a confused state can
  do is complete a task or check a line — both trivially reversible in the
  respective app.
