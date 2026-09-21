# Working on Nova OS

**Start every session by reading `design/SESSION-HANDOFF.md`** — it carries the
live state of the work: what is half-finished, what was decided and why, what
is verified versus merely assumed, and the dead ends already paid for. Then
re-verify its one or two most load-bearing claims cheaply before building on
them; foundations rot between sessions. Update it at session close.

**Read `design/NOVA-METHOD.md` before changing anything.** It is the thought
process this platform is built with — how to reason about Nova, not just what
it contains. What follows is the short version; the Method is the full one.

## What Nova is
Hayden's personal AI operating system: a React + Vite PWA (GitHub Pages) that
talks to a local Express server on his Mac (launchd, Tailscale-fronted)
reading and writing his real Obsidian vault. Its purpose is to help him
become and perform as the best version of himself, and to be the one app he
opens every day. That mission is the tiebreaker for every decision.

## The non-negotiables (full reasoning in NOVA-METHOD.md)
- **Deterministic first; models decide, code acts.** Models interpret; only
  tested code writes to disk. Never let a model's output write unmediated.
- **Everything writeable is undoable** and rides the inbox rails (a record
  with `kind`, `status`, `undoData`).
- **The vault is the source of truth**; `server/data/` is derived/operational.
- **Honest degradation, never fiction.** Missing data says so; stale data
  self-labels; demo content is `demoMode`-only.
- **Autonomy is earned from real history and proposed, never assumed**; an
  agent never changes its own autonomy.
- **Shared formats are contracts** — change every reader/writer or none.

## How agents reason
Every model-based agent (Ask Nova, Coach, Quick Session, Researcher, Studio)
prepends the shared `NOVA_LENS` from `server/lib/lens.js`. Change that file
and NOVA-METHOD.md's "Runtime lens" section together — they must match.

## When you need a decision from him
State it PLAINLY at the end of the response, in its own short list: what the
decision is, and what happens either way. No decision buried in prose, no
"still his" list of vague chores mixed in with it. If nothing needs deciding,
say that. (His instruction, 8 Sep 2026.)

## Not looking AI-generated — and Nova's deliberate exceptions

The global `~/.claude/CLAUDE.md` carries the list of defaults a model
reaches for when it is not thinking (Vuyyuru, Sep 2026): Inter/Geist,
pure-white grounds, purple-and-black, orbs, dot grids, liquid glass,
shadows on everything, three feature cards, a hover animation on
everything. Read it. The honesty half of it — **never invent a
testimonial, statistic or claim**, show the real screenshot, honour
`prefers-reduced-motion`, and never write "it's not X, it's Y" — binds
here absolutely.

**But Nova already made several of those calls on purpose, and they are
not up for re-litigation on these grounds.** Liquid glass (`nv-liquid`),
the violet/cyan accents, the soft `--nv-radius`, the calm shadows: all
tokenised, all documented in NOVA-METHOD.md §2b and the design memory,
all chosen against his own reports. A future session reading that list as
a licence to strip Nova's house materials has misread it. The list is
about reflexes; Nova's surface is a decision. If you think one of them is
genuinely wrong for a surface, that is a design argument to put to him —
with the reason — not a cleanup.

## Anything he can see
Every new surface ships in **both** Home idioms from one view model (his
phone runs `cupertino` → `MissionStructured`), wears the house objects
(`RingTile`, the serif news line, `AppleLayout` groups, `Controls.jsx` for
every label and action), uses only real `--nv-*` tokens, earns an entrance
animation, and survives 375px. Full standard: NOVA-METHOD.md §2b.
**Standing, 22 Sep 2026 (his instruction): nothing on a Nova surface is a
plain box with text in it, and colour means something.** Load `apple-design`,
`emil-design-eng` and `interface-design` before drawing anything; a number
gets a form, a list gets depth, a change is acted out, each muscle owns its
hue. Decisions are a conversation, not a button per idea: a light tick or
cross, one "do all", and talking back. §2b rules 7–8.

## Ground rules for a change
Find the real need under the request → read the existing pattern before
writing → smallest honest solution → design the failure modes and write the
regression test → **verify against the real vault, not just the tests**
(reload launchd, hit the endpoint, read the result) → leave receipts and
tell the truth about what you did and didn't verify.

## Where things are
- `server/lib/` — domain logic (one file per surface); `server/routes/` —
  Express routers; `server/test/` — node:test suites.
- `src/` — the PWA. `src/App.jsx` state + actions; `src/vals/*` map state to
  view models; `src/screens/*` render them; `src/api.js` client calls.
- `design/` — NOVA-METHOD.md (start here), AGENTS-PLAN.md, DESIGN-OPTIONS.md.
- Memory files (loaded each session) hold durable project + design lessons.

## Gates before ship
`npm run lint` clean · `npm run build` green · `cd server && npm test` green ·
then commit with a why, push, and reload the service
(`launchctl kickstart -k gui/501/com.novaos.server`).
