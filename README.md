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
