# Nova OS — iPhone Shortcuts

Three Shortcuts that make Nova genuinely zero-friction from the phone:
capture by voice through Siri, send anything via the share sheet, and get the
Morning Dispatch on the lock screen. All of them talk to the same API the app
uses, over your Tailscale HTTPS URL, so they work from anywhere your phone
has signal.

**You need two values (keep them private — never commit them anywhere):**
- `BASE` — your server URL, e.g. `https://<your-mac>.<tailnet>.ts.net`
- `TOKEN` — the API token from `server/.env` on the Mac

> Tip: put both in a small "Dictionary" at the top of each Shortcut (keys
> `base` and `token`) so they're set once per Shortcut.

---

## 1 · "Nova Capture" — Siri-dictated capture

Say *"Hey Siri, Nova Capture"*, speak the thought, done. Nova classifies and
files it (or queues it for review) exactly like typing into the Inbox.

Steps in the Shortcuts app (create Shortcut, name it **Nova Capture**):

1. **Dictate text** — language English (Australia). *(This is the Siri-native
   dictation step; when run from Siri it flows straight from your speech.)*
2. **Get contents of URL**
   - URL: `BASE/api/inbox/capture`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer TOKEN`
   - Request body: `JSON` with fields:
     - `text` → the *Dictated Text* variable
     - `source` → `voice`
     - `mode` → `auto-high` *(or `review-all` while you're building trust)*
3. **Get dictionary value** — key `status` from *Contents of URL*.
4. **Show notification** — "Nova: captured — 〈Dictionary Value〉".

Notes:
- Works from Siri (hands-free), the Shortcuts widget, the Action Button, or
  a Home Screen icon.
- If the phone is off-tailnet and the request fails, Shortcuts shows the
  error — nothing is silently lost, but there is no offline queue (yet); the
  in-app Inbox is the fallback.

## 2 · "Send to Nova" — share-sheet capture

Share any text, link, or article from any app straight into the Inbox.

1. Create Shortcut **Send to Nova** → Shortcut settings → enable **Show in
   Share Sheet**; accepted types: *Text, URLs, Safari web pages*.
2. **Receive input** — set "If there's no input: Ask for Text".
3. **Text** — content: `〈Shortcut Input〉` *(for Safari pages this becomes
   the page title + URL; that's ideal — the classifier files it as a note
   with the link preserved).*
4. **Get contents of URL** — same POST as above, with:
   - `text` → the *Text* variable
   - `source` → `text`
   - `mode` → `auto-high`
5. **Show notification** — "Sent to Nova".

Instagram reels, articles, tweets — share → Send to Nova → it lands in the
vault as a captured note (or queues for review if Nova isn't sure).

## 3 · "Nova Dispatch" — the brief on your lock screen

The Morning Dispatch composes on the Mac at its scheduled hour; this fetches
today's text and shows it as a notification.

1. Create Shortcut **Nova Dispatch**:
   - **Get contents of URL** — `BASE/api/dispatch`, Method `GET`,
     Header `Authorization` = `Bearer TOKEN`.
   - **Get dictionary value** — key path `today.morning.text`.
   - **If** *Dictionary Value* *has any value* →
     **Show notification** — title "Morning Dispatch", body 〈Dictionary
     Value〉. **Otherwise** → **Show notification** — "No dispatch yet —
     it composes at the scheduled hour."
2. Automations tab → **New Automation → Time of Day** — e.g. 07:05, daily,
   **Run Immediately** (no confirmation) → action **Run Shortcut → Nova
   Dispatch**.

Evening version: duplicate it, use key path `today.evening.text`, schedule
~21:35 — that's the Evening Debrief on your lock screen.

> The notification shows the brief; approving/undoing stays in the app's
> Inbox, where the draft is waiting (in draft mode).

## Companion habit — fresh health data before the dispatch

If you use a Shortcut automation to send Apple Health data to
`/api/health-data`, trigger it on the **wake-up alarm** automation (or a time
a few minutes before the dispatch hour) so the Morning Dispatch always has
last night's sleep and HRV before it composes.

## Security notes

- The token is a bearer credential for your whole vault API — it lives only
  in your Shortcuts and in `server/.env`. Don't share screenshots of the
  Shortcut with the token visible.
- Everything travels over Tailscale HTTPS; the server only listens on
  localhost + the tailnet.
- If the token ever leaks, delete the `API_TOKEN` line in `server/.env`,
  restart the service (a fresh one is generated and printed), and update
  Settings + these Shortcuts.
