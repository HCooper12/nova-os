# Nova OS server

A local backend that gives Nova OS real data instead of the built-in demo data:

- **Obsidian** — reads your vault's `Wiki/` folder directly off disk (no Obsidian plugin
  needed), and writes back: recipes, the daily rotation, workouts and sessions, the
  shopping list, journal entries, and approved transcript ingests all land as real
  markdown in the vault. Every write path snapshots the previous version to a sibling
  `.nova-backups/` folder first (the newest 20 per file are kept).
- **Apple Calendar** — reads today's events from iCloud via CalDAV (read-only).
- **Apple Health** — accepts a daily metrics POST from an iOS Shortcut (section 6) and
  generates twice-daily AI insights from it.
- **AI features** — recipe/food photo scanning, recipe tweaks, note summaries, journal
  prompts, shopping-list categorization, and a Claude Code chat, all via the local
  `claude` CLI (no API key; each call is budget-capped).

The server binds to localhost only by default (set `HOST` in `.env` to change that) —
remote devices reach it through the `tailscale serve` HTTPS proxy from section 4.

## 1. First-time setup

```sh
cd server
npm install
cp .env.example .env   # skip if .env already exists
```

Edit `.env`:

- `VAULT_PATH` — absolute path to your Obsidian vault (the folder with `Wiki/`, `Raw/`, `.obsidian/`).
- `ICLOUD_USERNAME` / `ICLOUD_APP_PASSWORD` — see step 3. Leave blank to skip Calendar for now;
  Obsidian works independently.

```sh
node index.js
```

On first run it generates an `API_TOKEN` and writes it back into `.env` — it's printed once in
the terminal. That's what you paste into Nova OS → Settings.

Test it:

```sh
curl http://localhost:4173/api/health
curl -H "Authorization: Bearer <token>" http://localhost:4173/api/notes
```

## 2. Run it permanently (launchd)

So it starts on login and restarts if it crashes:

```sh
cp launchd/com.novaos.server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.novaos.server.plist
```

Logs land at `~/Library/Logs/nova-os-server.log`. To stop/uninstall:

```sh
launchctl unload ~/Library/LaunchAgents/com.novaos.server.plist
rm ~/Library/LaunchAgents/com.novaos.server.plist
```

If you edit `server/index.js` or `.env`, reload it:

```sh
launchctl unload ~/Library/LaunchAgents/com.novaos.server.plist
launchctl load ~/Library/LaunchAgents/com.novaos.server.plist
```

## 3. Apple Calendar (app-specific password)

Apple Calendar can't be reached with your normal Apple ID password — it needs a dedicated
app-specific password:

1. Go to <https://account.apple.com/account/manage> and sign in.
2. **Sign-In and Security → App-Specific Passwords → Generate an App-Specific Password**.
3. Name it something like "Nova OS".
4. Copy the generated password (`xxxx-xxxx-xxxx-xxxx`) straight into `server/.env` as
   `ICLOUD_APP_PASSWORD` — don't paste it anywhere else. Set `ICLOUD_USERNAME` to your Apple ID
   email in the same file.
5. Restart the server (or reload the launchd service).

Nova OS's Mission Control "Today" card will start showing real events automatically once this
is set — no frontend changes needed.

## 4. Reaching it from your iPhone: Tailscale

Nova OS is deployed over HTTPS (GitHub Pages), and browsers block a public HTTPS page from
calling a plain `http://` address (“mixed content”) — so a bare `http://<mac>:4173` Tailscale
address won't work from the deployed site. `tailscale serve` fixes this by giving the backend
a real HTTPS endpoint with an auto-renewed certificate.

1. Install Tailscale on your Mac (<https://tailscale.com/download>) and on your iPhone (App
   Store), sign in to the same account on both, and confirm both show up in
   <https://login.tailscale.com/admin/machines>.
2. In the admin console, enable **HTTPS Certificates** for your tailnet (Settings → enable it once).
3. On the Mac, with the server running on port 4173:
   ```sh
   tailscale serve --bg http://localhost:4173
   ```
   (Older Tailscale versions use `tailscale serve https / http://localhost:4173` — the CLI
   will tell you which one to use if you get it wrong.) This prints the tailnet URL, something
   like `https://your-mac.tailXXXXX.ts.net`. That's what goes in Nova OS → Settings → Backend
   URL — no port needed. Check it anytime with `tailscale serve status`.
4. On your iPhone, install the Tailscale app and sign in. As long as Tailscale is running
   (it stays connected in the background), Nova OS can reach your Mac from anywhere with
   internet, not just home Wi-Fi.

`tailscale serve` configuration persists across reboots on its own; you don't need to re-run
step 3 every time, just make sure the Mac is on and the server (launchd service) is running.

## 5. Transcript ingest (Obsidian write-back)

From the Claude Code screen in Nova OS, "⇪ Ingest transcript" lets you paste or upload a
podcast/video transcript. Under the hood:

1. The backend copies your vault's `Wiki/` + `CLAUDE.md` into a scratch directory in `/tmp`
   (never the real vault).
2. It runs `claude -p` (the Claude Code CLI, non-interactively) against that scratch copy,
   with the transcript as a new raw source — it follows your vault's own `CLAUDE.md` schema
   exactly, in batch mode.
3. Nova OS shows you exactly what it drafted (new/updated pages, full content) before anything
   touches your real vault. **Approve** copies those files into the real vault; **Discard**
   deletes the scratch copy and nothing is written.

Requires the `claude` CLI installed and logged in on this Mac (it already is, if you've used
Claude Code here before) — no separate API key needed, it reuses your existing login. Each
ingest is a real Claude Code session and costs real usage (capped at $3 per ingest via
`--max-budget-usd`; override in `server/lib/ingest.js` if you need more for very long
transcripts). If `claude` isn't at `~/.local/bin/claude` on your machine, set `CLAUDE_BIN` in
`.env` to the correct path.

## 6. Apple Health (iOS Shortcuts)

`/api/health-data` is already live on the backend and Mission Control's "Nova noticed" panel
is already waiting on it — nothing here needs a code change. This section is entirely about
building a Shortcut on your iPhone that POSTs to it once a day. HealthKit has no cloud API,
so the phone itself has to be the one sending the data.

### What it needs to send

```
POST <your Tailscale URL>/api/health-data
Authorization: Bearer <your API_TOKEN>
Content-Type: application/json

{
  "date": "2026-07-16",
  "metrics": {
    "steps": 8421,
    "restingHeartRate": 54,
    "hrv": 62,
    "sleepAsleepMinutes": 452,
    "sleepInBedMinutes": 480,
    "activeEnergyKcal": 612,
    "walkingRunningDistanceKm": 6.3,
    "vo2Max": 47.2,
    "weightKg": 78.4
  }
}
```

Your Tailscale URL and API token are the same ones already in Nova OS → Settings on your
phone (and `API_TOKEN` in this `.env`). Any metric can be omitted — the backend merges
rather than overwrites a day's file — so building this in two passes is the easier path:
get one number working end to end, then add the rest.

I can't operate the Shortcuts app myself — no tool gives me control of iOS — so this has
to be built by hand on the phone. A visual walkthrough of the same steps below (nicer to
follow on the phone you're building on) was published at the time this was written; ask
in-session for a fresh one if that link has gone stale.

### Phase 1 — just steps

1. **Shortcuts app → Automation tab → + → Create Personal Automation → Time of Day.** Pick
   something late, e.g. 9:00 PM, Daily. Turn **off** "Ask Before Running" so it fires silently.
2. **Format Date** on "Current Date", Custom format `yyyy-MM-dd` → this is your `date` field.
3. **Find Health Samples**: Type is Steps, Start Date is Today.
4. **Calculate Statistics**: Sum, fed from step 3.
5. **Dictionary**: one entry, key `steps`, value = the Sum result from step 4 (insert it as
   a magic variable).
6. **Dictionary** again (the outer envelope Nova's endpoint expects): key `date` = the
   formatted date from step 2, key `metrics` = the dictionary from step 5.
7. **Get Contents of URL**: URL `<Tailscale URL>/api/health-data`, tap Show More → Method
   POST, Header `Authorization: Bearer <API_TOKEN>`, Request Body JSON → the dictionary
   from step 6.
8. Test it now, don't wait for tonight's automation: open the Shortcuts tab (not
   Automation), find it by name, tap to run once. First run prompts you to allow Health
   access — allow it — then check the "Get Contents of URL" result: it should echo back
   the day's data with your step count in it, not an error.

### Phase 2 — optional, add the rest

Once steps is confirmed working, extend the inner Dictionary from step 5 with more keys.
Each follows the exact same pattern: **Find Health Samples → Calculate Statistics → add
to the Dictionary.**

| Metric | Find Health Samples: Type | Statistic | Dictionary key |
|---|---|---|---|
| Resting Heart Rate | Resting Heart Rate | Average | `restingHeartRate` |
| HRV | Heart Rate Variability | Average | `hrv` |
| Active Energy | Active Energy | Sum | `activeEnergyKcal` |
| Distance | Walking + Running Distance | Sum | `walkingRunningDistanceKm` |
| VO2 Max | VO2 Max | Most Recent | `vo2Max` |
| Weight | Weight | Most Recent | `weightKg` |

Add a **Convert Measurement** step (→ Kilometers / Kilograms) before Distance and Weight
if your phone's Health units are miles/lb — Nova expects metric.

**Sleep** is the fiddly one — two blocks instead of one, both over the window "Yesterday
6:00 PM to Today 12:00 PM" (sleep usually starts the evening before, so "Today" alone
misses it):
- **Find Health Samples**: Sleep Analysis, Value is Asleep (select all Asleep sub-values —
  Core/Deep/REM — if your iOS version splits them out) → **Calculate Statistics: Sum**.
  For Sleep Analysis samples this sums *duration*, not a quantity → key `sleepAsleepMinutes`.
- Same again with Value is In Bed → key `sleepInBedMinutes`.
- Convert both to minutes (**Format Duration**, or divide by 60 with **Calculate** if it
  comes back as seconds). Tap **Show Result** while building and sanity-check they land
  around 400–550 before wiring up the rest — worth testing in isolation first.

Once a day of real data lands, Nova checks hourly and generates a real insight (capped at
$0.50/day) the first time it finds data — no further setup needed.
