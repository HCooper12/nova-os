# 17 · Money and Code, round 2: research, 7 Oct 2026

Research behind mockup 85 (`design/mockups/85-redesign-money-code-r2.html`),
written after his notes on round 1 (mockup 80, audit `17-money-and-code.md`).
His words, 7 Oct: link "the billroo service I pay for, and/or at least
replicate some of the look and feel of it"; Money has "too much plain text";
keep A's rising-subscription callout and B's minimal transaction list; refine
A. Code "needs further refinements so it looks more aesthetically beautiful and
functional in terms of its purpose and organisation of projects/tasks".

Method: Billroo's public site, help centre and App Store listing, fetched on
7 Oct 2026; its public marketing images, looked at directly; the help centres
of Copilot Money and Monarch; Nova's own source. Nothing was signed in to,
and no Billroo account was used. Where a claim could not be checked it says
so.

---

## 1 · Billroo

### What it is
An Australian budgeting app (web, iOS, Android) built by Queenie Tan and Pablo
Bizzini, the founders of Invest With Queenie; launched 2024; available in
Australia and the US. Its own summary: "It includes Overview, Budget,
Transactions, Balances, Subscriptions, an AI assistant and a Tax report."
Plans: Billroo Pro $9.99 a month or $98.99 a year (one user, 30 AI credits a
month); Billroo Plus $14.99 or $149.99 (two users, partner sharing, 50
credits). 14-day trial. Source: billroo.com FAQ; App Store listing.

Nova already knows he pays for it: `billroo` is in the Subscriptions keyword
list (`server/lib/money.js:26`), and the import lane's header comment says
"the SAME file Billroo imports works here unchanged"
(`server/lib/moneyImport.js:11`).

### What it does, as far as the public pages say
- Connects bank accounts "through Open Banking under the Consumer Data Right
  (CDR), through Fiskil" in Australia; Plaid in the US. Read-only; it does
  not store bank logins. (billroo.com FAQ)
- Categorises transactions automatically, editable, with bulk edit on desktop.
- Custom budget categories with limits; month-to-month comparison.
- A Subscriptions tracker (named on the site; I found no public description
  or screenshot of how it looks).
- Billroo AI (credit-metered chat with suggested questions) and a Tax
  Deductible Report that flags possibly claimable expenses with a confidence
  level.
- **CSV import**: "If you want to keep your old data, you can import it as a
  CSV file." (FAQ)
- **Export**: "The export function is available exclusively on the desktop
  version of Billroo." Transactions page, filter, Select all, Export; current
  page (50) or everything in the filter. "The file will be in Excel format,
  featuring the following column headings: Date, Description, Category, Tags,
  Amount." (help.billroo.com, "How to Export Transactions", edited 22 Jun 2026)

### Can it be linked? What I found and what I did not
| Route | Finding |
| --- | --- |
| A public API | **None found.** The site's integration answer is only that it syncs your bank through Open Banking. No developer docs. |
| Webhooks, email digests, scheduled reports | **None found** on the site, the FAQ or the help centre index. |
| Its export | **Exists, verified in its help centre**: desktop web only, manual, "Excel format", columns Date, Description, Category, Tags, Amount. **Unverified**: whether the file is .xlsx or a CSV that Excel opens. "Excel format" suggests .xlsx. |
| Its CSV import | Exists (FAQ). Column mapping not documented publicly. |
| Going straight to the bank under CDR, as Billroo does | Not realistic for a personal app. Receiving CDR data needs an accredited data recipient or an arrangement with one; Fiskil (Billroo's provider) is "Unrestricted CDR Accredited", sandbox free, production pricing sales-gated. This is a business relationship, not a setting. |
| Opening Billroo from Nova | Its web app is at app.billroo.com (linked from its help centre). An iOS app URL scheme is **unverified**; a plain web link is the honest version. |

### How Nova can honestly link to it
1. **Billroo → Nova, today, with one manual step.** Export from Billroo's
   website, save as CSV into `Money/Imports`. Nova's watcher already reads
   any headered CSV with date, description and amount columns
   (`parseBankCsv`, `moneyImport.js:61`), drops lines it already has, and puts
   one record on the inbox rails that files nothing until he approves, with
   Undo. Billroo's headers (Date, Description, Amount) match. The mockup's
   Import frame draws this path and the card it produces.
2. **Two gaps, both his call.** (a) If Billroo's file is .xlsx, Nova skips it
   (`scanImports` filters `.csv`, `moneyImport.js:138`); he either re-saves it
   as CSV or Nova learns to read .xlsx. (b) Nova ignores Billroo's Category
   column and re-guesses from the merchant name; reading it and mapping it
   onto Nova's ten categories would keep his Billroo filing.
3. **One risk to say out loud.** If he also drops his bank's own CSV for the
   same account, the same purchase can arrive twice: Nova's dedupe key uses
   the normalised description, and Billroo's description may differ from the
   bank's raw text. One source per account avoids it; the import card should
   say which account a file covers.
4. **Nova → Billroo.** Nova's FY export is a CSV (`Date,Amount,Merchant,
   Category,Note,Source`, `money.js:345`) and Billroo imports CSV, so lines he
   typed into Nova could go the other way. Billroo's import mapping is
   undocumented, so this is untested.
5. **Mirror the look.** Independent of any link: the moves in §1's visual
   language below, without its name or logo in Nova's UI.

### Its visual language (from its public marketing images)
Seen directly: `billroo.com/wp-content/uploads/2024/02/Billroo-desktop-page.jpg`
(the Overview), `.../2025/07/Untitled-design-4.jpg` (Tax Expenses),
`.../2025/03/billroo-AI.png` (the AI assistant on a phone),
`.../2024/02/View-your-dashboard.jpg` and `Create-your-budget.jpg`. These are
marketing renders with sample data, possibly older than the current app; I
did not see its current phone screens for Budget or Subscriptions.

- **Ground**: a very light lavender page; white cards with soft grey borders
  and generous radius; a left sidebar with a near-black pill for the active
  item.
- **Brand colours** (from the site's CSS and the images): violet `#8366FF`
  for primary buttons and accents, mint `#00DAA4`, deep navy `#00111F`, a pale
  lavender `#EAE5FF`. Violet is close to Nova's own `--nv-vi` (#8f7bff), which
  is already Money's hue on the Index.
- **The hero tile**: of four stat tiles across the top (Total savings,
  income, expenses, investment), the first is dark navy with a violet glow,
  the rest white. One tile wins by material, not size.
- **Category colour**: every category is a solid pastel pill (blue, pink,
  violet, amber, mint, deep blue, light pink) with dark text, and the same
  colours make the segments of a donut chart. Income and expenses each get a
  donut plus its legend.
- **Budget against actual**: a table per donut (Category, Budget, Actual)
  where the Actual cell is tinted green with a tick when within budget and
  pink when over.
- **Type**: a geometric sans (it reads as Poppins; **unverified**).
- **AI**: suggested questions as lavender capsules ("What's my average
  monthly spend?"), a violet Send pill.
- Its own reviews on its homepage praise "the colours" and "the color
  indicators" for telling at a glance whether you're within budget. (Those
  are Billroo's published testimonials; I quote them only as evidence of what
  its users notice.)

### What the mockup takes, and what it leaves
| Billroo move | In mockup 85 |
| --- | --- |
| A category owns a colour, as a solid pill and a donut segment | Every Nova category owns a house hue: donut arc, legend pill, budget capsule, calendar coin, monogram |
| One dark hero tile among plain ones | The hero card in a violet bloom; two smaller tiles of different shapes |
| Month-to-month comparison | The Against September tile, two bars |
| Suggested questions | "Ask why" in the budget sheet, Talk on every decision card |
| Green tick within, pink over | **Left.** Nova's red means Nova pushing back (4 Oct rule). Over is a hatched tab past the line, the words "$38 over", and over rows first |
| Light lavender ground, white cards | **Left.** Nova glass is his chosen material |
| Name and logo | **Left**, as asked. The UI says "budget app"; your call 3 |
| Tax deductible report | **Not drawn.** A model-flagged list would be a new lane; not asked for |

---

## 2 · Other budget apps worth borrowing from

**Copilot Money** (iOS, US). Its help centre: a monthly spending graph where
"The dotted line on this graph represents the ideal spending rate to stay
within the current monthly budget" and "The solid line... your spending rate";
category bars that are green on pace, yellow to orange when on pace to go
over, red once over; and "Outlined bars represent expected spend from
Recurrings." Taken: the dotted even-pace line against the solid spend line
(the "October so far" card). Left: the traffic-light bars (red again).
Considered for round 3: an outlined segment for bills still to come this
month.

**Monarch** (US). Its blog: recurring bills on "a new monthly calendar view",
"confirm when a recurring bill or subscription has been paid on the calendar
with a green checkmark", merchant logos on transactions, a notification three
days before a charge; and, per a search summary of a second post I did not
open, a Sankey view of cash flow. Taken: the bills
calendar (Coming up), with a coin per charge in its category's hue. Left: the
logos (Nova has no logo source and fetching one is a network call it does not
make; monograms instead) and the Sankey (too much for a phone page).

**Up** (Australian bank app; from search summaries of a finder.com.au
review and a Medium design write-up, neither page opened): merchant logos, spending grouped into a few named
categories with trackers, "how often you buy" at a merchant. Taken: nothing
new beyond what the above give; the merchant-frequency idea is noted for the
full transactions page.

---

## 3 · What Code is for today

Read: `src/screens/ClaudeCode.jsx` (143 lines), the Code slice of
`src/vals/valsMisc.js:462-504`, `server/routes/claudeCode.js`,
`server/lib/claudeCode.js` (Builder and Breaker), `server/lib/codeChanges.js`,
`server/routes/ops.js:27-62` with `server/lib/claudeSessions.js` and
`claudeSessionsLive.js`, and `server/lib/builder.js` with `projects.js`.

**The screen does three jobs.**
1. **Talk to the Builder**: a Claude Code session in one of two workspaces,
   the Nova OS repo or the vault, that can Read, Edit, Write, Grep and Glob and
   nothing else (Bash, agents, web and MCP are blocked by `--disallowedTools`,
   `claudeCode.js:38-43`). The session is resumed across turns; a model can be
   picked per message; New session starts clean.
2. **Send the Breaker**: a fresh, read-only session that tries to break what is
   in the workspace and reports (`startBreaker`, `claudeCode.js:1407`).
3. **Decide what changed**: `git status` and the diff of the workspace, then
   Commit (message of 8 characters or more; today `git add -A`, everything),
   Shelve (a stash, with Restore that only restores Nova's own stash). The
   vault is read-only for commits.
Plus a door to Library's "Add to vault" ingest, and a Can or can't card.

**Next door, not on this screen.**
- **Sessions on his Mac** (the Ops screen): every Claude Code session the CLI
  knows about, judged by when someone last spoke in it: working, waiting for
  you, stuck, left open, gone; grouped by project (`projectOf` knows Nova,
  Science Atlas, Wren); Show brings the window forward, Close only for one
  left open or gone (`/api/ops/sessions`, `/show`, `/close`).
- **Builds** (`builder.js`): Nova's other code lane, which makes a whole
  project from a brief inside `~/Nova Projects`, with a sandboxed shell where
  the kernel wall exists, and always leaves a `build` receipt on the rails;
  Undo moves a build to `.undone`, never deletes it.

**So the organising units are real already.** Projects: the two Builder
workspaces, the projects his Mac sessions run in, and Nova Projects. Tasks:
a Builder run, a Breaker pass, a set of uncommitted changes, a Mac session that
is working or waiting, a build. Their states are real too: working, waiting
for him, ready to commit, done (committed, shelved, built), left open.

**Two directions in the mockup.**
- **D · Projects.** Code is a set of places. Nova OS leads (it is where the
  Builder works): its Mac sessions as pips, files to commit as one +/− bar,
  its last run, Review and Ask. Wren, Science Atlas, the Vault and Builds are
  tiles in their own hues. Today is a rail. A project page holds its sessions,
  its Ready to commit (files ticked, another session's file unticked) and its
  runs, with the composer scoped to it.
- **E · Today.** Code is a board by state: Needs you, Working, Ready to
  commit, Done today, and windows left open in one line. A finished run slides
  down the board into Ready to commit with a message written from the run;
  Commit slides it into Done with Undo.

**Honest limits the mockup states.** The Builder works only in Nova OS and
the Vault; the other projects show Mac sessions only. Committing only ticked
files and Undo on an unpushed commit are new (round 1's call 5, carried).
Showing Mac sessions on Code reuses the Ops endpoints and needs no new server
work; whether they belong here is his call 7.

---

## Sources
- Billroo home and FAQ: https://billroo.com/
- Billroo App Store listing (AU): https://apps.apple.com/au/app/billroo-budget-finance/id6748367459
- Billroo help, How to Export Transactions: https://help.billroo.com/en/articles/12761345
- Billroo help, Transaction Issues/Questions: https://help.billroo.com/en/articles/10171777
- Billroo help, AI credits: https://help.billroo.com/en/articles/11666881
- Billroo help, Share with a Partner: https://help.billroo.com/en/articles/6607617
- Billroo marketing images: https://billroo.com/wp-content/uploads/2024/02/Billroo-desktop-page.jpg, https://billroo.com/wp-content/uploads/2025/07/Untitled-design-4.jpg, https://billroo.com/wp-content/uploads/2025/03/billroo-AI.png
- Fiskil (Billroo's CDR provider): https://www.fiskil.com/ and https://www.openbankingtracker.com/api-aggregators/fiskil
- Copilot Money, Dashboard: https://help.copilot.money/en/articles/6045480-dashboard-tab-overview
- Copilot Money, Categories: https://help.copilot.money/en/articles/9504513-categories-tab-overview
- Monarch, recurring bills: https://www.monarch.com/blog/track-recurring-bills-and-subscriptions
- Monarch, cash flow Sankey: https://www.monarch.com/blog/visualize-your-cash-flow-like-never-before
- Up (secondary): https://www.finder.com.au/bank-accounts/up-everyday-account-review, https://medium.com/design-bootcamp/transforming-banking-with-ux-what-we-can-learn-from-up-34e92068ebff
