# Talking to Nova through Siri — phone, watch, HomePod

Two Shortcuts make Nova reachable exactly like Siri, hands-free from any
Apple device (the watch and HomePod relay personal Shortcuts through the
phone automatically). Both use the same base URL and API token as the app.

## 1. "Tell Nova" — frictionless capture (reminders, notes, to-dos, food…)

Speak a thought; it rides the capture rails: the classifier routes it
(reminder / note / to-do / food / expense / journal…), high-confidence
filings happen automatically, doubts wait in the Inbox. A reminder lands in
Apple Reminders too, so the phone alarm fires natively.

Actions, in order:
1. **Ask for Input** — Prompt: "Tell Nova", Input Type: Text
   *(invoked by voice, Siri takes dictation for this automatically)*
2. **Get Contents of URL**
   - URL: `http://100.65.137.114:4173/api/inbox/capture` (the direct tailnet
     address — plain http on purpose; the VPN already encrypts)
   - Method: **POST**
   - Headers — two rows, and the VALUE must start with the word Bearer
     (no colon anywhere in a value; Shortcuts adds the colon itself):
     - Key `Authorization` → Value `Bearer <token>` (one space, then the token)
     - Key `Content-Type` → Value `application/json`
   - Request Body: **JSON** → `text` = Provided Input, `source` = `voice`
3. **Show Result** (optional): "Nova has it."

Name the Shortcut **Tell Nova**. Usage: *"Hey Siri, Tell Nova"* → "remind me
at 4pm to call the bank" / "add flour to the shopping list" / "note: idea
for the next video…".

## 2. "Ask Nova" — a real answer back

Actions, in order:
1. **Ask for Input** — Prompt: "Ask Nova", Input Type: Text
2. **Get Contents of URL**
   - URL: `http://100.65.137.114:4173/api/ask/sync`
   - Method: **POST**, same two headers as above
   - Request Body: **JSON** → `question` = Provided Input
3. **Get Dictionary Value** — key `text`
4. **Speak Text** — the dictionary value

Name it **Ask Nova**. Usage: *"Hey Siri, Ask Nova"* → "how did I sleep this
week?" — the reply is spoken aloud. (Answers take 5–20s; the endpoint holds
the connection.)

## Caveats, honestly

- Both need the phone on the **Tailscale** VPN (or same network) and the
  **Mac awake** — same constraint as the app. If the Mac is asleep, Siri
  reports the failure; nothing is silently lost, but nothing is captured
  either. For reminders specifically, once captured they alarm from Apple's
  side even if the Mac later sleeps.
- HomePod/watch: works via Siri "personal requests" relaying to the iPhone —
  enable *Settings → Siri → Personal Requests* for the HomePod if needed.

## 3. The 00:05 health push — make it network-proof (Health Drops file)

The URL push fails whenever the phone↔Mac link is down at midnight
(Tailscale suspended overnight is the usual culprit — two multi-night
outages traced to exactly this). The fix: ALSO save the same JSON as a
FILE to iCloud — writing a file always succeeds (no VPN, no HTTP, no
timeout, Mac asleep is fine), and the server drains it within 2 minutes of
being awake, through the same ingest gate (midnight date-shift, monotonic
steps) as the URL path.

iOS constraint that shapes this: an AUTOMATED "Save File" can only write
inside **iCloud Drive → Shortcuts** — reaching the Obsidian folder needs
the interactive picker, which an automation must never depend on. So the
server watches `iCloud Drive/Shortcuts/Health Drops/` as a second drops
folder (it creates the folder itself; it syncs down like any iCloud dir).

His midnight shortcut builds the JSON as a growing Text variable
(`JSONBody`), closed by a final Text action ending `}}` just before "Get
contents of URL". The edit, matched to that structure:

1. Find the FINAL **Text** action — the one reading
   `JSONBody ,"vo2Max": VO2Max }}`.
2. Tap **+** right after it and add **Save File** (search "Save File" —
   the Documents action):
   - **File**: the Text from step 1 (select the `Text` variable — it
     offers itself as the previous action's output).
   - **Ask Where to Save: OFF**
   - **Destination Path**: `Health Drops/midnight-push.json`
     (relative to iCloud Drive/Shortcuts — the folder already exists
     because the server created it)
   - **Overwrite If File Exists: ON** (the server archives each file into
     `Health Drops/Processed` seconds after reading it, so the slot is
     free again for tomorrow)
3. Leave **Get Contents of URL** exactly where it is, AFTER Save File —
   instant delivery when the link happens to be up; the day-file upsert
   makes double-delivery a no-op.

Receipts: every drained drop lands in the pushlog (`source: "drop"`),
shows in the Ops Stream as "Health push landed", and the 09:00 Telegram
sentinel still fires if a night genuinely produced nothing.

## 4. The morning catch-up — copy the shortcut that already works

Root cause, confirmed by experiment (12 Aug): **Apple encrypts Health data
while the phone is locked**, so the 00:05 automation dies at its first
Health query on any night he is actually asleep. Every midnight push that
ever landed was a night the phone was still in use; the first success
(29 Jul) ran at 23:45, awake. Nothing degraded — success always required
an unlocked phone. No amount of network-proofing fixes a read the OS
refuses.

So the push must happen at the first unlock of the morning, reporting
YESTERDAY.

**Do NOT hand-author the actions.** A full attempt (12 Aug) proved the
transport works — signed .shortcut import, `Authorization` header, the
server resolving the literal word `yesterday` — but Shortcuts' health
aggregation could not be reproduced blind: `WFHKSampleFilteringGroupBy:
"Day"` copied byte-for-byte from a working public shortcut still returned
individual raw samples (182 steps, 52 steps) rather than day totals. His
existing 00:05 automation already aggregates correctly. Copy it.

**The recipe (about 10 taps):**
1. Open the 12:05am automation. Long-press any action → **Select Actions**
   → **Select All** → **Copy**.
2. Shortcuts tab → **+** → paste. Name it **Nova Health Morning**.
3. ONE edit: in the first Text action, replace the **Formatted Date**
   token with the plain word **`yesterday`** — the server resolves it
   (`ingestHealthPayload`, tested). Leave every Health query untouched.
4. Automation → **+** → **When Alarm is Stopped** → Run Shortcut → Nova
   Health Morning → Run Immediately.

Why alarm-stop specifically: the queries use a rolling "in the last 1 day"
window, which only equals a calendar day when both ends fall in sleep. At
alarm-stop that holds — yesterday's pre-alarm hours and today's are both
asleep — so the rolling window is an honest stand-in for yesterday's
total. Run it hours later and it silently mixes in today's walking.

Keep the 00:05 automation: on nights he is up late it still delivers
same-night, and the monotonic-steps rule means any mix of pushes converges
on the highest (most complete) reading and never clobbers downward.
