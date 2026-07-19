# Working on Nova OS

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
