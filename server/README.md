# Nova OS server

A small local backend that gives Nova OS real data instead of the built-in demo data:

- **Obsidian** — reads your vault's `Wiki/` folder directly off disk (no Obsidian plugin needed).
- **Apple Calendar** — reads today's events from iCloud via CalDAV.

It's read-only for now: Nova OS displays your real notes and events, but buttons like
"Accept" or "Ask Coach" still just simulate. Write-back (the app actually editing your
vault or calendar) is a deliberate phase 2, not built yet.

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
   tailscale serve https / http://localhost:4173
   ```
   This prints the public tailnet URL, something like `https://your-mac.tailXXXXX.ts.net`.
   That's what goes in Nova OS → Settings → Backend URL — no port needed.
4. On your iPhone, install the Tailscale app and sign in. As long as Tailscale is running
   (it stays connected in the background), Nova OS can reach your Mac from anywhere with
   internet, not just home Wi-Fi.

`tailscale serve` configuration persists across reboots on its own; you don't need to re-run
step 3 every time, just make sure the Mac is on and the server (launchd service) is running.
