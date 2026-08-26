# Nova OS

A personal AI operating system dashboard — Mission Control, Voice, Memory Galaxy, Claude Code, Recipes, Workouts, and Notes screens with a mocked "vault" of data. Built with React + Vite, installable as a PWA on desktop and mobile.

Originally designed in Claude's Design Canvas, then implemented here as a real, standalone React app.

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to GitHub Pages. Enable Pages once in the repo: **Settings → Pages → Source → GitHub Actions**.

## Personalize

Edit the constants at the top of `src/App.jsx`:

```js
const THEME = 'midnight'; // 'aubergine' | 'midnight' | 'graphite'
const USER_NAME = 'Hayden';
const WAKE_WORD = true;
```

## Install as an app

- **iPhone**: open the deployed URL in Safari → Share → Add to Home Screen.
- **Mac**: open in Chrome/Edge → click the install icon in the address bar.

## Widgets (iPhone home + lock screen)

`widgets/nova-widget.js` is a [Scriptable](https://scriptable.app) script —
no Xcode, no signing. Install Scriptable, create a script named **Nova**,
paste the file, and set `TOKEN` to the API token from the app's Settings.

**The token goes in Scriptable on the phone, never in this file** — this
repo is public.

- Home screen: long-press → **+** → Scriptable → small or medium → pick the
  "Nova" script.
- Lock screen: long-press the lock screen → **Customise** → add a widget →
  Scriptable → rectangular or inline → pick "Nova".

Sizes deliberately show different things (a small widget that says
everything says nothing): small = the day's numbers; medium/large = numbers
plus the Leader's idea of the day; lock-screen = the idea alone. It reads
`GET /api/widget`, so it needs the Mac reachable over Tailscale; when it
isn't, the widget says so rather than showing stale numbers.

## Apple Watch

There is no native watchOS app (see `design/WRIST-PLAN.md` Phase 4 — parked
deliberately: it needs Xcode plus signing, for ~20% more than the free path
gives). Scriptable has no watchOS app either, so **widget complications
cannot come from the script above**. What does work today:

- **Shortcuts run on the watch**, and a Shortcuts complication can sit on a
  watch face — tap to dispatch Ask Nova hands-free. Author these by cloning
  an existing working shortcut via its iCloud share link and editing the
  URL; hand-authoring `.shortcut` files has failed repeatedly (see the
  session log).
- **Telegram notifications reach the wrist**, which is how the Leader's
  daily idea, agent completions and sentinel alerts already arrive.
- The watch is **not** on the tailnet. Near the phone, shortcut traffic
  rides the phone's network stack (Tailscale up) and reaches the Mac; on
  watch-only LTE it will not. Tailscale Funnel is the recorded alternative
  and a deliberate, separate decision — it exposes the API publicly.
