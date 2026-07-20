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

## 1b · "Ask Nova" — hands-free Q&A, spoken answer

Say *"Hey Siri, Ask Nova"*, ask your question out loud, and hear Nova's
answer back — without opening the app. Nova reads your real vault and
replies in one step.

Create a Shortcut named **Ask Nova**:

1. **Dictate Text** — language English (Australia).
2. **Get contents of URL**
   - URL: `BASE/api/ask/sync`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer TOKEN`
   - Request Body: **JSON** — one field: `question` → the *Dictated Text*.
3. **Get dictionary value** — key `text` from *Contents of URL*.
4. **Speak Text** — the *Dictionary Value*.

Now *"Hey Siri, Ask Nova"* → speak → Nova answers aloud. It takes a few
seconds (it's genuinely reading your vault). `/api/ask/sync` holds the
response open until the answer is ready, so there's no polling to build.

> This is a fresh question each time (no follow-up memory). The in-app Voice
> screen is the place for a continuing back-and-forth conversation.

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

## 4 · "Nova Health Push" — fresh health data on wake-up

The Morning Dispatch's Recovery line is only as fresh as the last push to
`/api/health-data`. This automation sends last night's numbers the moment
your alarm goes off, so the 07:00 dispatch always composes against real
sleep and HRV.

Create Shortcut **Nova Health Push**:

1. **Find Health Samples** — repeat this step per metric you care about (each
   returns a value into a named variable):
   - *Steps* — Yesterday, Group by Day, Sum
   - *Heart Rate Variability* — Last 24 hours, Average
   - *Resting Heart Rate* — Last 24 hours, Average
   - *Sleep Analysis* — Last 24 hours, filter "Asleep", Sum → **convert to
     minutes** (Sleep returns hours/samples; add a "Calculate" or "Convert"
     step so the number you send is whole minutes)
2. **Current Date** → **Format Date** — custom format `yyyy-MM-dd`, into
   variable `today`. *(Send steps under yesterday's date if you prefer the
   dispatch's "steps yesterday" line to be exact — the server merges by
   whatever date you give it.)*
3. **Get contents of URL**
   - URL: `BASE/api/health-data`
   - Method: `POST`, Header `Authorization` = `Bearer TOKEN`
   - Request body `JSON`:
     - `date` → the formatted date
     - `metrics` → a Dictionary with any of: `steps`, `hrv`,
       `restingHeartRate`, `sleepAsleepMinutes`, `sleepInBedMinutes`,
       `activeEnergyKcal`, `walkingRunningDistanceKm`, `vo2Max`, `weightKg`
       *(all numbers; unknown keys are ignored, and metrics you skip are
       simply left out of the brief — nothing is invented)*
4. Automations tab → **New Automation → Alarm → When My Wake-Up Alarm Goes
   Off** (or *Is Stopped*) → **Run Immediately** → **Run Shortcut → Nova
   Health Push**. Add a fallback **Time of Day** automation at ~06:45 for
   alarm-free mornings.

The server merges per-day (a later push updates the same date's record), so
running it twice is harmless. The dispatch scheduler composes at the set
hour; data arriving earlier is always picked up.

## Security notes

- The token is a bearer credential for your whole vault API — it lives only
  in your Shortcuts and in `server/.env`. Don't share screenshots of the
  Shortcut with the token visible.
- Everything travels over Tailscale HTTPS; the server only listens on
  localhost + the tailnet.
- If the token ever leaks, delete the `API_TOKEN` line in `server/.env`,
  restart the service (a fresh one is generated and printed), and update
  Settings + these Shortcuts.
