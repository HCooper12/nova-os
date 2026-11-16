# The extraction method (fallback only)

The same rules Nova's learn lane runs (`server/lib/playbookLearn.js`,
`METHOD_RULES` and `SCREEN_RULES`). If they change there, change them here.

## What to keep

Pull out the METHOD, not the content: decisions, steps, rules with their
thresholds, exact phrasing worth reusing, worked examples, demos, common
mistakes. Drop stories, sales pitches, the intro, and anything that only
sounds wise.

## How every rule is pinned

- From the speech: the `[m:ss]` stamp of a real transcript line, plus 3 to 10
  words copied exactly from that line or the few after it.
- From the screen: the time of a frame you actually opened, marked
  `on screen`, with the visible words copied exactly (or none, for a demo).
- "evidenced" only when the speaker gives data or names a study; otherwise
  "stated". A rule that only works at the speaker's scale, budget or body says
  so in `needs`.
- Where sources disagree, keep both and say so. Never blend them.

## The page (Nova's format contract, `server/lib/playbooks.js`)

```markdown
---
type: playbook
triggers:
  - 'build a website'
agents:
  - all
sources:
  - 'S1 | Title | Speaker | https://...'
created: 'YYYY-MM-DD'
updated: 'YYYY-MM-DD'
---
# Topic

One sentence: what this playbook is for.

## When to use it
- bullet
## The method
1. step
## Rules
- rule text (stated, S1 0:06)
- rule text (stated, S1 0:09, on screen)
- rule text (evidenced, S1 1:03; needs: the speaker's scale)
## Phrases to reuse
- short exact phrase
## Mistakes to avoid
- bullet
## Where it stops applying
- bullet
```

## Drills for him (up to three)

Each one: a name he would use, the move (from the method or a kept rule), a
drill small enough to do today, and the tell that says it landed. Never "read
about it". None for health, training, food or sleep.
