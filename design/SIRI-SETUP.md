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
