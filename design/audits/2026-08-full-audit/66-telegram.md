# 66 — Telegram bridge

Audited 2026-09-01. Read-only. Files opened: `server/lib/telegram.js`
(1-211, full), `server/test/telegram.test.js` (1-32, full). Final
roster item.

## 1. What it is (verified)

"Nova reachable from his pocket without opening the app. Same rails,
different mouth" (7-12): incoming text rides the ask pipeline (context,
PROPOSE, RESEARCH — everything), and a proposal arrives WITH its human
gate — inline "✓ Yes, do it / ✕ Leave it" buttons calling the SAME
approve/discard endpoints the Inbox uses. "The model never writes; the
buttons do."

## 2. The walls, verified

- **Security is structural** (14-17): dormant without
  TELEGRAM_BOT_TOKEN; answers ONLY TELEGRAM_CHAT_ID. Setup is
  self-explaining (it logs the sender's id and how to authorize,
  "never answers substance"); once a chat id is set, "strangers get
  silence" (164). Callback taps are chat-checked too (137).
- **WhatsApp declined with reasons on file** (19-21): Meta business
  app + second number, or ban-risking puppetry — a decision receipt.
- **The pure decision layer is the tested layer**: routeIncoming,
  proposalKeyboard, dormancy — "the network loop is deliberately not
  tested; everything it decides with lives here" (test:1-3). The
  right test boundary, stated.
- Approve replies with a receipt AND the undo pointer: "✓ Done —
  ⟨destination⟩. Undo lives in the Inbox." (143); the outcome is
  edited INTO the original message so the thread keeps its receipt
  (149). Failures say so: "Couldn't do that: ⟨why⟩".
- Announcements use "the same taste filter as web push — things
  waiting on him, never everything that happens" (59-61); forge-job
  is excluded WITH its reason (failed builds never reach pending;
  forge's own announcement carries more) — cross-owned, not dropped.
- `beat('telegram')` inside the poll loop — Guardian-visible; offset
  persisted per update (no replay after a crash); 150s patience
  window with typing indicators and an honest timeout ("Still
  thinking past my patience window — the reply may land in the app");
  /new resets the session cleanly; /brief is the same honest composer
  (04).

## 3. Pros / Cons

Pros: all of §2 — this file is the rails doctrine ported to a third-
party surface with nothing lost.

Cons:
1. **Non-text messages get silence** (154: `if (!msg?.text) return`).
   A voice note — the most natural thing to send a pocket assistant —
   or a photo (he HAS photo-scan lanes; a food photo from a
   restaurant is a real workflow) is ignored without even an "I can't
   read that here." The bridge's one honest-degradation miss.
2. Offset saves BEFORE handling, so a crash mid-handle drops that
   update (at-most-once). For a chat surface that's the right
   trade — a dropped ask beats a duplicated write — but the choice
   isn't recorded in a comment the way this file records everything
   else. Noted.

## 5. Mission test

**Daily, pocket cadence: earns its keep strongly** — the brief, quick
asks, and above all approvals-with-undo from anywhere, which makes the
inbox's human gate ambient rather than app-bound. Long-term this is
the surface that keeps proposed-autonomy usable at real-life speed.

## 6. Improvement plan

1. **[Refine — honesty]** Reply to non-text messages: "Text only here
   for now." One line ends the silent class. **Impact/effort:** M / L.
2. **[Add — capability gap]** Photos → the existing scan lanes (food
   photo → scanFood proposal with Yes/Leave buttons — the highest-
   value candidate). **Impact/effort:** H / M. Gated on 1 shipping
   first.
3. **[Add — capability gap]** Voice notes → transcription (the voice
   env already exists server-side) → the same ask pipeline. **Impact/
   effort:** M / M. Synthesis ranks 2 vs 3.
4. **[Refine — nit]** One comment recording the at-most-once offset
   choice. **Impact/effort:** L / L.

## 7. UI recommendations

n/a (Telegram owns the chrome). The keyboard's two-button shape is
already right — approve/leave, never more.

## 8. Verdict

**Keep as-is / Refine** — the doctrine survives its furthest
translation: a third-party chat where the human gate arrives as
buttons and every tap lands on the same rails. One silent-ignore gap
to close, and two pocket-native capabilities (photo, voice note)
waiting behind it.
