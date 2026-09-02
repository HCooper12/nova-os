#!/usr/bin/env node
// VERIFY WHAT IS ACTUALLY ON HIS DEVICES.
//
// Written because "I shipped it" was said, in good faith, about work that was
// sitting in a local commit — repeatedly — and because a build that IS
// deployed can still be missing a feature if the code went into a surface
// nobody renders. Neither is something to establish by memory.
//
// This checks the LIVE artefacts, never the working tree:
//   1. git      — is HEAD actually pushed to origin?
//   2. deploy   — does the deployed version.json match the local build?
//   3. bundle   — does every FEATURE marker appear in the live JS he loads?
//   4. server   — does every claimed endpoint answer on the running backend?
//
// A marker is a string unique to a shipped feature. If it is absent from the
// live bundle, that feature is NOT on his phone, whatever anyone believes.
//
//   node scripts/verify-shipped.mjs            # bundle + git + deploy
//   node scripts/verify-shipped.mjs --server   # also probe the local backend
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SITE = 'https://hcooper12.github.io/nova-os';
const DIST = path.resolve('dist/assets');
const withServer = process.argv.includes('--server');

// Each entry: what he would call the feature, and a string that only exists
// in the built code when that feature is present.
const FEATURES = [
  ['Shopping · clear all', 'Clear the whole list'],
  ['Shopping · quantity stepper', 'One fewer'],
  ['Shopping · recipe amounts', 'shopping-list/qty'],
  ['Library · add source', 'ADD SOURCE'],
  ['Library · whole item to list', 'no ingredients to shop for'],
  ['Recipes · rename current version', 'rename-current'],
  ['Voice · sessions panel', 'RECENT SESSIONS'],
  ['Voice · crash boundary', 'VISUAL UNAVAILABLE'],
  ['Voice · speech unavailable notice', 'TAP TO HEAR'],
  ['Brief · question-by-question close', 'startBriefQueue'],
  ['Coach · apply from the chat', 'APPLY IT'],
  ['Book upload (EPUB/PDF)', 'uploadBookFile'],
  // the marker above only proves the FUNCTION shipped — it shipped broken
  // (posted to the app's own origin). This one exists only in the fixed code.
  ['Book upload · reaches the right server', 'never left the browser'],
  ['Update banner', 'A newer Nova is ready'],
  ['Leader · homepage Try Today card', 'Lead · try today'],
  ['Leader · the screen and sit-down', 'LEADERSHIP · DAILY PRACTICE'],
  ['Forge · a door at last (Ops)', 'A SENTENCE BECOMES SOMETHING THAT RUNS'],
  ['Forge · client API', 'forgeStart'],
  ['Scout · research a person', 'SCOUT RESEARCHES THEM'],
  ['Scout · client API', 'researchPerson'],
  ['Inbox · agents no longer render as TYPED', 'PROGRAM REVIEW'],
  // the deep weave's receipt rides the rails with an undo — this label exists
  // only in the code that files it
  ['Inbox · vault-ingest receipt (staged pass)', 'VAULT INGEST'],
  // the couldn't-look state on its two client faces: the Fuel card and the plan card
  ["Fuel · couldn't-check card", "COULDN'T CHECK"],
  ['Home · failed plan is not an empty morning', 'HIT AN ERROR — SEE INBOX'],
  // once-a-day marks written on delivery and shared across devices
  ['Greeting · stamped on delivery, cross-device', 'markGreeted'],
  ['Rituals · done on delivery, cross-device', 'markRitualDone'],
  // the CFO and meal-prep off switches: deterministic lanes on the model board
  ['Settings · deterministic lanes have a switch, no picker', 'THE SWITCH IS THE SETTING'],
  // the day plan's completion loop: done / skipped per priority
  ['Home · plan priorities can be marked done or skipped', 'planPriorityOutcome'],
  // the gym fix: a tap no longer claims the phone's audio session; Nova asks to mix
  // a property key, not a function name — the minifier renames functions
  ['Audio · mixing session, generic taps do not claim it', 'novaAudio'],
  ['Galaxy · legend plurals (same commit as the first-visit paint fix)', 'analyses'],
  ['Galaxy · pinch-zoom + pan, legend filters, recency/compost overlays', 'PINCH TO ZOOM'],
  ['Inbox · training-check dismiss asks what happened (four chips)', 'ONE TAP KEEPS THE RECORD STRAIGHT'],
  ['Inbox · review discard asks why once; adjustments take DONE / NOT TODAY', "TOMORROW'S REVIEW READS THIS"],
  ['Train · history rows carry the Coach\'s reaction', 'COACH SAID'],
  ['Home · a health insight can be talked through in one tap', 'TALK IT THROUGH'],
];

const SERVER_ROUTES = [
  ['GET', '/api/health'],
  ['GET', '/api/library'],
  ['GET', '/api/recipes'],
  ['GET', '/api/shopping-list'],
  ['GET', '/api/train/program-audit'],
  ['GET', '/api/workouts/routines'],
];

const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m) => { console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`); failures++; };
let failures = 0;

/* ------------------------------- 1. git --------------------------------- */
console.log('\ngit');
try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  status ? bad(`working tree is dirty — ${status.split('\n').length} file(s) uncommitted`) : ok('working tree clean');
  // ls-remote rather than fetch: it needs no write to .git, so it works in
  // sandboxes where fetch is refused — and comparing the sha directly is a
  // stronger statement than a local ref that may itself be stale.
  const localSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const remoteSha = execSync('git ls-remote origin refs/heads/main', { encoding: 'utf8' }).trim().split(/\s+/)[0];
  localSha === remoteSha
    ? ok('HEAD is pushed to origin/main')
    : bad(`HEAD ${localSha.slice(0, 9)} is NOT on origin (${(remoteSha || 'unknown').slice(0, 9)}) — nothing here is on his phone`);
} catch (e) { bad(`git check failed: ${e.message}`); }

/* ------------------------------ 2. deploy -------------------------------- */
console.log('\ndeploy');
let liveJs = '';
try {
  const localVersion = existsSync('dist/version.json') ? JSON.parse(readFileSync('dist/version.json', 'utf8')).buildId : null;
  const deployed = await fetch(`${SITE}/version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!deployed?.buildId) bad('deployed version.json unreachable — cannot prove what is live');
  else if (!localVersion) bad('no local dist/version.json — run npm run build first');
  else if (localVersion !== deployed.buildId) bad(`deployed build ${deployed.buildId} != local build ${localVersion} — the deploy has not landed yet`);
  else ok(`deployed build matches local (${deployed.buildId})`);

  const html = await fetch(`${SITE}/?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
  const entries = [...html.matchAll(/\/nova-os\/assets\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]);
  // LAZY CHUNK NAMES COME FROM THE LIVE ENTRY, not from local dist. CI
  // rebuilds produce different content hashes, so local filenames 404 against
  // the deployed site — which is why three shipped features looked absent on
  // the first run of this script. The entry bundle names every chunk it can
  // import; that list is the truth about what his device can load.
  const entryText = await Promise.all(entries.map((n) => fetch(`${SITE}/assets/${n}`).then((r) => (r.ok ? r.text() : '')).catch(() => '')));
  const lazy = [...new Set(entryText.join('\n').match(/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.js/g) || [])];
  const all = [...new Set([...entries, ...lazy])];
  const bodies = await Promise.all(all.map((n) => fetch(`${SITE}/assets/${n}`).then((r) => (r.ok ? r.text() : '')).catch(() => '')));
  liveJs = bodies.join('\n');
  const fetched = bodies.filter(Boolean).length;
  fetched ? ok(`fetched ${fetched} live chunk(s) from ${SITE}`) : bad('could not fetch any live JS');
} catch (e) { bad(`deploy check failed: ${e.message}`); }

/* ------------------------------ 3. features ------------------------------ */
console.log('\nfeatures, in the bundle his device downloads');
for (const [name, marker] of FEATURES) {
  liveJs.includes(marker) ? ok(name) : bad(`${name} — marker "${marker}" absent from the LIVE bundle`);
}

/* ------------------------------- 4. server ------------------------------- */
if (withServer) {
  console.log('\nserver (the Mac backend)');
  let token = '';
  try { token = (readFileSync('server/.env', 'utf8').match(/^API_TOKEN=(.*)$/m) || [])[1]?.trim() || ''; } catch { /* none */ }
  for (const [method, route] of SERVER_ROUTES) {
    try {
      const res = await fetch(`http://localhost:4173${route}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      res.ok ? ok(`${method} ${route} → ${res.status}`) : bad(`${method} ${route} → ${res.status}`);
    } catch (e) { bad(`${method} ${route} → ${e.message}`); }
  }
}

console.log(failures
  ? `\n\x1b[31m${failures} check(s) failed — do NOT tell him it is shipped.\x1b[0m\n`
  : '\n\x1b[32mEverything above is genuinely live on his devices.\x1b[0m\n');
process.exit(failures ? 1 : 0);
