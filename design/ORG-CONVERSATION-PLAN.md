# One conversation — Nova as CEO, the agents as department heads

**His instruction, 22 Sep 2026.** There are too many places a conversation
can happen (Voice, the Coach tab, the Leader, the plan cards, the Inbox) and
each text box looks and behaves a little differently. He wants **one overall
conversation location** holding all the data and context, with the ability
to **switch to a specific agent** when the focus calls for it — the Coach for
training, the Leader for his people — while everything still reads as one
continuous back-and-forth with Nova.

The scaffold, in his words: **Nova is the CEO he speaks with**; the agents
(Coach, Leader, Watcher, Researcher, Librarian, …) are its department heads
who perform and organise the tasks; each may develop its own sub-agents for
its purpose; the CEO can communicate with every agent and sub-agent; and the
agents can communicate **directly with each other** and with the CEO to get
what they need (the Coach asking the Researcher, the Watcher and the
Librarian to gather for a specific purpose).

This document is the design. Nothing here is built yet.

## What exists today (verified 21–22 Sep)

- `POST /api/ask` is already the front door: deterministic routing
  (`intentRouter.js`), sticky follow-ups to the Coach/Leader
  (`followUpLane`), plan-aware corrections (`planFollowUp.js`), the reflex
  layer and the verbs. The Coach and the Leader answer *in the same
  transcript* under their own names ("Handing that to the Coach").
- Each agent has its own long-lived CLI session (`voiceSessionId`,
  `coachSessionId`, `leaderSessionId`) and its own context assembly
  (`askContext.js`, `coachTurn.js`, `buildLeaderChatContext`).
- Agents already read each other's rooms one way: Ask Nova is handed the
  Coach's and the Leader's recent transcripts (`agentSessions.js`), the fleet
  ledger (`fleetContext.js`) and, since 21 Sep, every plan and report.
- A plan is the one place agents already **work for each other**: the
  planner decomposes, the dossier and the Researchers feed the Coach, the
  report synthesises. `PROPOSE {"kind":"plan"}` lets a conversation start
  one.

So the org exists in pieces. What is missing is the **surface** (one room,
one text box, an agent switch) and the **peer channel** (an agent asking
another agent for something mid-turn, on the rails, with a receipt).

## The design

### 1. One room
- **The Voice screen's comms log becomes the single conversation** for the
  whole platform. The Coach tab and the Leader screen keep their *data*
  panels (program, situation) but their chat input is the same component,
  bound to the same transcript, with the agent pre-selected.
- **One composer**, one look, everywhere (`Controls.jsx`): the glass bar
  with the live dot from the mockup. Speak or type. It carries the current
  agent as a chip at its left ("Nova ▾ · Coach · Leader") — tap to switch,
  or just address them ("Coach, …", "ask the Leader …") and the router
  switches for that turn. A specialist stays selected until he addresses
  Nova again or the topic changes (the sticky rule, generalised).
- **One transcript, many speakers.** Every turn is tagged with who spoke
  (Nova, Coach, Leader, Researcher's brief landing, a plan's report
  landing). The same messages rendered in the Coach tab are filtered to the
  Coach's turns plus Nova's handoffs — a *view* of the one log, never a
  second store.
- Decisions live in the transcript: tick/cross on items, one "do all", and
  talking back (Method §2b rule 8). Cards in the Inbox are receipts of what
  the conversation decided, not a second place to decide.

### 2. The CEO and the department heads
- **Nova (CEO)** holds the whole context (it already does) and delegates:
  a question for the Coach goes to the Coach in the same room; a job goes to
  the planner. Nova is the only agent that speaks unprompted (briefs,
  banners) and the only one that synthesises across departments.
- **Department heads** (Coach, Leader, Researcher, Watcher, Librarian,
  Studio, CFO) each keep their own session, memory and cadence — nothing
  here merges them. They answer directly when addressed.
- **Sub-agents**: a head may fan out (the Researcher's panel already does;
  the Briefing runs several Researchers). Sub-agents never speak in the room;
  their head does, with a receipt of who ran.

### 3. Agents talk to each other (the peer channel)
- A new directive an agent may end a turn with — `ASK {"agent":"researcher",
  "for":"<what it needs, one sentence>"}` — that code turns into **a step on
  the rails**: a research/watch/dossier record with `parentAgent: 'coach'`,
  run under the asking agent's budget, whose output is handed back into the
  asking agent's next turn as MATERIAL (exactly how plan steps hand off,
  `handoffFor`). The room shows "Coach asked the Researcher for X" as a
  system line, and the answer lands under the Coach's name.
- Bounded: one `ASK` per turn, depth 1 (a head may ask a head; a sub-agent
  may not ask), every ask is a record with a cost and an undo, and the
  budget rules of 21 Sep apply (pause and ask him past the ceiling).
- Nova can ask any agent the same way; that is how "what does the Coach
  think of this brief" becomes a real exchange rather than Nova guessing.

### 4. What the reply-in-place build (queued 21 Sep) becomes
The notification pop-up is simply the one composer, opened over the banner
with that banner's context pre-loaded and the right agent pre-selected.

## Build order (each a session, each verified by looking)
1. **The composer and the transcript as one component**, used by Voice,
   Coach tab and Leader; agent chip; address-by-name switching. No new
   server behaviour.
2. **The peer channel**: `ASK` directive → rails record → material handed
   back; receipts in the room; budgets and undo.
3. **Decisions in the transcript**: tick/cross items, "do all", talk back
   (the spoken-report mockup's beat 5–6, generalised).
4. **Reply-in-place** on banners, as a mode of the same composer.

## Not doing
- Merging agent sessions into one model context (they would lose their
  memory and their cadence). The room is one; the minds stay several.
- Letting sub-agents post to the room or ask each other.
- Any agent writing without his yes. The rails do not change.
