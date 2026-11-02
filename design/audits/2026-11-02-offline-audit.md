# Offline audit, 2 Nov 2026

His instruction (2 Nov): use Fuel, Train, the Inbox queue and his statistics
on Mac and phone with no internet and no Claude, "just like I would use my
Apple Notes app".

## The instrument

`scripts/offline-walk.mjs`. It never talks to his live server:

- a fresh copy of `server/data` and of the vault in a scratch folder;
- a second Nova server on 4174 over those copies, with Telegram, Todoist,
  iCloud, Reminders, Notion, web push and Claude all switched off, and a stub
  for Tailscale;
- the page reaches that server only through a proxy the script switches off.
  Off means every connection is reset, which is what airplane mode does to a
  fetch.

Any request aimed at :4173 is failed and counted. The count was 0 on every run
after the incident below.

Order of the walk:

1. Build the production PWA, serve it on 5173 and load it online once (Summary
   style), so the service worker and the phone-side copies fill with his real
   data.
2. Kill the web server, switch the proxy off, and reload. This is a cold start
   with no network.
3. Visit every screen and the statistics sub-views.
4. Make every write he can make.
5. Reload offline again (the app killed and reopened).
6. Switch the proxy back on and read the copy back, to count what each write
   left behind.

Per-run data and screenshots are in the session scratchpad, not here.

## Before → after

| Area | Before | After |
|---|---|---|
| Cold start, no network | Works. The shell comes from the SW precache in ~8 s and fonts from cache. | Same (7.7 s). |
| Home, offline | Offline card shown. "Your day, drawn" said **"Your day could not be read: Offline"**. | Offline card shown. Your day draws from the copy (`liveInstruments` is cached now). |
| Offline signal off Home | **Red floating pill** "Backend unreachable…" on 13 of 14 screens. | No pill when offline. A quiet line, "● Offline · as of 11:24 · 7 waiting to file ›", sits just under the top bar on every screen that doesn't already say it in its own words. Measured on all 7: it ends above the page's first line and nothing covers it. With writes waiting, tapping it opens the Outbox. |
| Screens with their own offline line (Shopping, Inbox, Journal, Money, Settings, Voice) | Kept their line, plus the pill on top. | Keep their line; no pill. |
| Train prefill + record banner | From cache (incline 65×7 ×2); bests known for 41 lifts. | Same. A session finished offline also moves the next prefill for those lifts at once (`noteOfflineSets`). |
| Train history | **"No sessions logged yet."** False: a failed read was shown as empty history. | "Offline. This is the history kept on this phone, as of 2 Nov, 11:24", with all 84 sessions from the copy. With no copy it says so; it never says "none". A session finished offline appears marked "Waiting for your Mac". |
| An exercise's card | **Skeleton spun forever**: the failure landed before the sheet opened. | Every card he has opened is kept on the phone and opens offline with "Offline · the card as you last opened it, 2 Nov, 11:24". A card never opened says "Couldn't pull that up — Offline. Requires Mac connection." No spinner. |
| Fuel week (statistics) | From cache. | Same, and it now includes the training cross-check (`liveFuelCross` cached). |
| Finish workout offline | Queued (session clientKey); 5 missed lifts offered as a push. | Same. The first try and every replay now carry the same Idempotency-Key. |
| Log food offline | Queued, but the entry **vanished from the day**. | Stays on the plate and counts in the totals, marked "Waiting for your Mac". Deleting it takes it out of the Outbox. Still there after a reopen. |
| Shopping box offline | Queued; **not on the list**. | On the list with "waiting for your Mac". |
| Generic add to shopping (`addToShoppingList`) | **Not queued at all**: "Could not add". | Queued and on the list, marked. |
| Inbox capture offline | Queued; **nothing on the Inbox**. | At the top of the quick-capture list, tagged "Waiting for your Mac". |
| Journal line offline | Queued; **not on the page**. | On today's page; its sync glyph says "Waiting for your Mac". Still there after a reopen. |
| To-do offline | Queued; its row was lost after a reopen. | Row kept after a reopen (queued row). |
| Ask the Coach offline | "Error: Offline. Requires Mac connection. Your question is back in the box." | Unchanged. The Coach region belongs to another session; it is honest, and the "Error:" prefix is raw. |
| Replay when the Mac is back | Each item landed once (FIFO), but only `session` was idempotent: a timed-out write that had landed would file twice on replay. | All 8 writes landed exactly once (session 1, food 1, shopping 1+1, capture 1, journal 1, to-do 1), Outbox empty. Every queued kind carries an Idempotency-Key, from the first try onwards, and the server answers a repeated key with the first answer (`server/lib/idempotency.js`). |
| Phone storage | `novaos.lastLive` was **2.32 MB in localStorage** (2.38 MB of the origin's ~5 MB iOS cap), and a failed save was swallowed. | The copy is in IndexedDB; localStorage holds 52 KB. A save that fails everywhere is recorded (`liveCacheTrouble`), not swallowed. The old copy migrates on first boot. A save made after an offline write keeps the real sync time, so "as of" never claims fresher data than it has. |
| Not cached | `liveTrainToday`, `liveFuelCross`, `liveWrap`, `liveInstruments`, `liveCommitments`, workout history, `exerciseNext`. | All cached. An added lift's prefill offline comes from its last sets in the kept history, and the toast says so. |

Gates: `npm run lint` 0, `npm run build` 0, server suite 4961/4963 (the
two known exerciseAtlas failures). guard-cupertino: Home, recipes, workouts and
inbox are all unchanged. Summary Home drifts (−269 px), and the same drift
shows on a clean checkout of HEAD, so it predates this work.

## INCIDENT: the first run wrote to his real server

The first version of the walker connected to his live server behind a CDP
write guard. Its re-attach closed the old session before the new one re-armed
the guard. That also dropped the offline emulation, so the page saw `online`
and drained its Outbox into his vault (127.0.0.1, 2026-11-01 23:17 to 23:22
UTC). Left behind:

- session `c8a7ff3d` (a fake Push, 2 sets);
- Coach receipt `7e744f0c`, auto-filed to his Journal;
- two `coach-debrief` lines in spoken-log, and the `debrief-memory` entries;
- possibly a Telegram debrief;
- food entry `3d6aca5e` ("Offline walk apple");
- four `brief` lines and eleven conversation rows `t36sqk8r-17935750…`.

The clean-up is his to run. This session's permission layer refused it.

## What this cannot test, and his airplane-mode check

This Mac cannot run the native shell offline, and it cannot run iOS Safari's
storage eviction. Nothing here was seen on his phone.

On the iPhone, after the deploy is confirmed (Settings › Build matches
`version.json`):

1. Open Nova once on Wi-Fi and let it say LIVE. That fills the copy and the
   history.
2. Swipe Nova closed. Turn on airplane mode, with Wi-Fi off too.
3. Open Nova from a cold launch. It should open on Home with "Can't reach your
   Mac".
4. Train: start a workout, tick two sets, Finish. It should say "Saved on this
   phone". Open History: "kept on this phone" with his sessions, and today's
   marked "Waiting for your Mac".
5. Fuel: log a food. It should stay on the plate, marked "Waiting for your
   Mac", and count in the ring.
6. Inbox: capture "toothpaste". It should show at the top of the quick
   captures, tagged "Waiting for your Mac".
7. Swipe Nova closed and reopen it, still in airplane mode. Everything above
   should still be there, and the line under the top bar should read
   "Offline · as of … · N waiting to file".
8. Turn Wi-Fi back on. Within a few seconds: "Outbox synced — N items filed".
   Check the Inbox (toothpaste sorted, once), Fuel (the food once, no longer
   marked), Train history (the session once), and in Obsidian today's journal
   and food log.
