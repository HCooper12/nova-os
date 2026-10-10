# 18 · Stash build checklist, 10 Oct 2026

The build of the Stash against its approved frames: the Stash tab of mockup
84 (round 2, "Instruments", his words 7 Oct: "Instruments also looks good for
the stash"), the Stash tab of mockup 88 (round 3, "Stash is looking pretty
good"), and the Stash frames of mockup 90 (Reader, Sort, Share), plus the five
additions he approved on 10 Oct 2026 (price watch, gift lists, a bought
history, Ask Nova about the stash, the duplicate warning), which have no
mockup and are drawn once each in the same language.

Where 84 and 88 disagree, 88 wins (it is the later round and says what it
replaced): days left as a number on the vial, shelf hues and tiles, the due
check answered in place, press and hold in place of the ⋯ sheet. Where 88
says "kept" for an 84 element, the 84 element is built.

Every line is marked once the build is photographed against the mockup in
demo mode: PRESENT, DIFFERS (with why) or MISSING. A MISSING line is fixed
before the branch is reported.

PRIVACY: every product, site, shelf, person, price and date in the build's
demo data and in this file is invented. The repo is public.

---

## A · The head

- [~] A1 DIFFERS · Back chevron (44 pt glass circle) top left, to More (the summary chrome's own back)
      Why: the summary chrome carries the way back: the app's own header and the tab bar's More, and the iOS edge swipe (the Money build's precedent); a second back circle would duplicate it.
- [x] A2 PRESENT · "Edit" glass pill top right (44 pt); Done while editing; edit mode shows a red − on each card (44 pt target)
- [x] A3 PRESENT · Large title "Stash", 34 pt bold, tight tracking
- [x] A4 PRESENT · Serif news line, 20 pt, written by code: with a due check "The cleanser is due a look. **10** links on 4 shelves." (88); with none "**10** links on 4 shelves, nothing running low." (90); the count counts up from zero on arrival
- [x] A5 PRESENT · Status line, 13 pt, a teal dot: "Lives in your vault · synced 9:41" (the time of the last real read)

## B · The due check, answered in place (88)

- [x] B1 PRESENT · Gold-tinted card under the head, only while a level check is due
- [x] B2 PRESENT · Its thumb (48 pt, the link's own picture or the drawn monogram), "Check the level" in gold, the name 17 pt, "About 6 days left by the calendar"
- [x] B3 PRESENT · Three 44 pt answers: Plenty left · Getting low (gold fill) · Reordered
- [x] B4 PRESENT · An answer folds the card away (opacity + scale .97, 200 ms), the vial and the badge move, a pill with Undo: "Asked again in two weeks" / "On your list, with its link" / "Clock restarted from today"
- [x] B5 PRESENT · More than one due: the soonest is the card; the rest wait their turn (each answered one at a time)

## C · Running down (84 instrument, 88 vials)

- [x] C1 PRESENT · A card holding one vial per item with a restock rhythm, soonest first (88: four columns; more wrap to a second row)
- [x] C2 PRESENT · Each vial: a tube in its shelf's hue, filled to the share of days left, transform-origin bottom; a dashed line a week before empty
- [x] C3 PRESENT · Past the dashed line the fill turns gold (the check is due)
- [x] C4 PRESENT · Days left as a number under the vial, SF Rounded 15 bold + "d" (88)
- [~] C5 DIFFERS · A short name under it (12 pt, one line, ellipsis)
      Why: the vial name is the item's own name without its size, two lines (84's form), not 88's hand-written one word: code cannot shorten a name honestly.
- [x] C6 PRESENT · Foot: "Days left, counted from when you bought each one. The dashed line is a week before empty."
- [x] C7 PRESENT · A vial is a 44 pt button with an aria label ("Cleanser: about 6 days left by the calendar") and opens its item's menu
- [x] C8 PRESENT · Arrival: the fills rise from empty (420 ms, ease), numbers count up; reduced motion: at once

## D · The shelf bar (84 kept, 88 tiles, 90 sort)

- [x] D1 PRESENT · Sticky under the top as the page scrolls, glass bar, rounded 24
- [x] D2 PRESENT · "All N" chip, then a chip per shelf: its 20 pt tile (hue + glyph), name, count; the pressed chip filled with ink 12 %
- [x] D3 PRESENT · Chips scroll inside the bar, never the page sideways; a fade mask at the right edge (90)
- [x] D4 PRESENT · Tapping a chip filters the shelves below, the cards moving by FLIP
- [x] D5 PRESENT · Search button (44 pt, magnifier) opens a field under the bar: "Search names, sites and notes" + Cancel (84)
- [x] D6 PRESENT · No match: "Nothing in the Stash matches "…"." in the serif (84)
- [x] D7 PRESENT · The sort button (90): ↕ glyph + "Last opened" / "Added" / "Name" / "Days left", 44 pt
- [x] D8 PRESENT · The sort menu anchored to its button (transform-origin at the button, pop 220 ms): four radio rows with a check and a subtitle (The ones you use first · As Stash.md lists them · A to Z · Restocks first)
- [x] D9 PRESENT · A new sort moves the cards to their new places by FLIP (no jump); the choice is remembered on this device

## E · Shelves and cards (84 grid, 88 hues)

- [x] E1 PRESENT · Shelf header: 28 pt tile (hue gradient + white glyph), name 20 pt bold, count right
- [x] E2 PRESENT · Product shelves are a two-column grid of cards (rounded 20, glass card)
- [x] E3 PRESENT · A card: the page's own picture on top (96 pt tall), name 14 pt semibold two lines, host 12 pt one line (or "opened 2 days ago" when sorted by Last opened, 90)
- [x] E4 PRESENT · No picture on the page: the drawn monogram in the shelf's hue, never a broken image
- [x] E5 PRESENT · Badge on the picture (top left, dark glass): "N days left" with the shelf's dot; gold dot when due; "On your list" with a green dot
- [x] E6 PRESENT · Tap a card opens the link (and notes the open for Last opened); press and hold opens the menu
- [x] E7 PRESENT · Reading shelves (every link a page to read) are rows: 44 pt thumb, title 15 semibold, "site · 9 min", a book glyph when a place is kept (90)
- [x] E8 PRESENT · Shelves in Stash.md order; Bought last, gift shelves after his own shelves
- [x] E9 PRESENT · Remove (from the menu or edit mode): the card fades and scales to .94, the rest close the gap by FLIP, a pill with Undo

## F · Press and hold (88)

- [x] F1 PRESENT · Holding a card ~450 ms lifts it (scale 1.04, a deep shadow), the rest of the page dims to .28
- [~] F2 DIFFERS · The menu (240 pt, glass, rounded 16) under the card, origin at the card: Add to shopping list · Restock every N weeks · Move to a shelf · Share link · Remove (red)
      Why: two rows join 88's five, from his additions: Mark bought and Watch the price; a reading row also offers Open the original (its tap opens the Reader); Open the page is not repeated on a card, whose tap already opens it.
- [x] F3 PRESENT · Each row 44 pt, its glyph on the right
- [x] F4 PRESENT · A tap outside closes it; Escape closes it; reduced motion: no lift, a fade
- [x] F5 PRESENT · Restock and Move open a short sheet (88: "Opens its own short sheet"): rhythm chips Off · 4 · 6 · 8 · 12 weeks, "I just bought it" (84); shelf chips (84)
- [x] F6 PRESENT · Share link uses the system share sheet where there is one, else copies the link and says so

## G · Adding (84 form, 88 clipboard)

- [x] G1 PRESENT · The floating add bar at the foot: "Paste a link to keep" + teal ＋ (44 pt)
- [~] G2 DIFFERS · A link on the clipboard (read only after his tap; iOS asks first): the bar offers "Paste skin.example.com/serum…" (88)
      Why: live, iOS lets a web page read the clipboard only after his tap (and asks first), so the bar shows a Paste button that reads on tap; the named offer is drawn exactly in demo, where the link is known.
- [x] G3 PRESENT · Pasting starts a preview: skeleton picture and name while Nova reads the page (84)
- [x] G4 PRESENT · The preview: the picture, the name read from the page, "site · name and picture read from the page"; a page Nova could not read says so and keeps the link with its host as the name
- [x] G5 PRESENT · Shelf chips, the site's own shelf preselected with a hint ("same site as 3 on Skincare") (84)
- [x] G6 PRESENT · "Lasts about (optional)": Off · 4 wk · 6 wk · 8 wk · 12 wk (84)
- [~] G7 DIFFERS · Cancel and "Stash it" (teal); the new card rises into its shelf; a pill "Stashed on Skincare" with Undo
      Why: the new card fades in at its place (FLIP arrival) with the pill; 84's flight from the bar to the shelf is not drawn.
- [x] G8 PRESENT · DUPLICATE (addition 5): a link already saved (after normalising) never saves twice: the bar says "Already on Skincare" and the page scrolls to that card, which pulses its ring once

## H · Reader (90 s1)

- [x] H1 PRESENT · A reading link opens in Nova as a page: its picture across the top (170 pt)
- [x] H2 PRESENT · Floating back "‹ Stash" (44), Aa (text size, 44), ⋯ (open the original, share, move, remove)
- [x] H3 PRESENT · A thin progress line at the top in the Reading hue, following the scroll
- [x] H4 PRESENT · The shelf label with its tile, the title in the serif 28, "site · 9 min, counted from 2,140 words", "Saved 3 weeks ago · opened twice, last Tuesday"
- [x] H5 PRESENT · The text in the serif 19/1.6, as fetched once from the page and kept in server/data
- [x] H6 PRESENT · "You stopped here on Tuesday" marker between paragraphs, in the Reading hue; the page opens at that place
- [~] H7 DIFFERS · The bottom bar: "Original" (opens the site) and "Finished" (Reading hue fill): Finished files it as read, with Undo
      Why: as 90's pill says (Finished, moved to Read): the line takes [read:: date] and moves to a Read shelf, made when first needed.
- [x] H8 PRESENT · A page Nova cannot read (blocked, paywalled, built by script) says "Nova couldn't read this one" and offers Original
- [x] H9 PRESENT · Entering slides in from the right (pushIn, 450 ms); reduced motion: a fade

## I · Share sheet (90 s3)

- [~] I1 DIFFERS · A Shortcut "Stash in Nova" in Safari's share sheet posts the link to the same address the add bar uses
      Why: built and tested on the server (POST /api/stash/share, test stashBuild); the Shortcut itself is his to make on the phone (docs/stash-share-shortcut.md), so the share sheet has not been seen working on his iPhone.
- [x] I2 PRESENT · Nova picks the shelf from the site (other links from that site) or "Unsorted", said in the reply
- [x] I3 PRESENT · The Shortcut shows "Stashed on Skincare" (or "Already on Skincare") as its banner
- [x] I4 PRESENT · In Nova the new card sits first on its shelf with a teal ring and a "From Safari" badge, with Undo through the Inbox
- [x] I5 PRESENT · docs/stash-share-shortcut.md: the steps, headers as separate Key and Value rows, the tailnet IP

## J · Addition 1 · Price drop and back in stock

- [x] J1 PRESENT · Per item opt-in: "Watch the price" in the menu; a watched card wears a small price tag in its badge row
- [x] J2 PRESENT · Reads: public pages only, at most once a day per item, cached, one polite queue (one request at a time, a pause between them), an honest User-Agent
- [x] J3 PRESENT · NEVER past a bot check or CAPTCHA: a 401/403/429/503 or a challenge page records "blocked" and the card says "Blocked by the site", no retry that day
- [x] J4 PRESENT · A price under the last seen, or out of stock to in stock: ONE record (kind stash, pending) and one push (held through quiet hours), and a pill in the app
- [x] J5 PRESENT · The card's badge says "Down $4" (good green) or "Back in stock"; the menu shows the last price read and when

## K · Addition 2 · Gift lists per person

- [x] K1 PRESENT · A shelf per person: "For Mum", with a date if he gives one (`## For Mum [date:: 2026-12-25]`)
- [x] K2 PRESENT · "New gift list" in the add flow: a name and an optional date
- [x] K3 PRESENT · The shelf header says "Sat 25 Dec · in 76 days"; a past date says "was 3 Oct"
- [x] K4 PRESENT · Fourteen days before the date: one gentle reminder (a record and a push held through quiet hours): "Mum's day is in two weeks: 3 ideas on her list."
- [x] K5 PRESENT · Gift shelves wear the gift tile and hue

## L · Addition 3 · Bought

- [x] L1 PRESENT · "Mark bought" in the menu, with the price paid if he gives one
- [x] L2 PRESENT · A one-off moves to the Bought shelf with the date and price (`[bought:: 2026-10-10] [paid:: 34.00] [from:: Skincare]`)
- [x] L3 PRESENT · A restock item stays on its shelf, its clock restarts, and a dated line joins Bought (the history)
- [x] L4 PRESENT · The rhythm learns from real dates: two or more bought dates for a link give "You rebuy it about every 9 weeks"; when that differs from the rhythm he set, the sheet offers "Use 9 weeks" (proposed, never applied by itself)
- [x] L5 PRESENT · Bought shelf drawn as rows, newest first: name, "Bought 10 Oct · $34.00", with Undo on the move

## M · Addition 4 · Ask Nova about the stash

- [x] M1 PRESENT · A code-read `stash` source on the consult rail (like the CFO): every agent can ask it; no model runs
- [x] M2 PRESENT · The same block in Ask Nova's context: shelves, every restock item with days left, due checks, watched prices and their state, gift dates, recent buys
- [x] M3 PRESENT · "What skincare am I running low on" answered from those lines

## N · Addition 5 · Duplicates

- [x] N1 PRESENT · URL normalised: scheme and www ignored, host lower case, tracking parameters dropped (utm_*, fbclid, gclid, igshid, si, ref, mc_cid, mc_eid, srsltid, msclkid, yclid, _ga, spm), parameters sorted, the fragment dropped, a trailing slash dropped
- [x] N2 PRESENT · The server refuses a second save with 409 and the item it already has; the screen jumps to it (G8); the Shortcut says "Already on …"

## O · States and chrome

- [x] O1 PRESENT · Loading: the head and a skeleton shaped like the vials and two cards (no blank)
- [x] O2 PRESENT · Empty: "Nothing stashed yet. Paste a link below to keep it." with the add bar live
- [x] O3 PRESENT · Offline: "Offline · showing the Stash as of 9:41"; writes refused in words
- [x] O4 PRESENT · Demo: invented links, said by the status line ("Demo links, invented")
- [x] O5 PRESENT · Every write a pill with Undo through the inbox rails (record kind `stash-write`, `undoData.route` `stash-ops`)
- [x] O6 PRESENT · Every control 44 pt; no sideways scroll at 375 and 390
- [~] O7 DIFFERS · prefers-reduced-motion: fills, lifts, flights and pushes land at once; 200 ms fades only
      Why: verified by code (every move has a reduced-motion rule in src/stash.css, and the house nv-sum-rise and useFlipList fall back to fades); the browser instrument cannot emulate the setting, so it was not watched.
- [x] O8 PRESENT · cupertino and command keep the classic page (the Money precedent), on the same writes, with one target per row

---

**Tally: 92 lines. 84 PRESENT, 8 DIFFERS (each with its reason above), 0 MISSING.**
Marked from frame pairs taken in demo mode at 390x844 (and checked at 375x812),
saved in the session scratchpad's stash-build folder: pairNN-mockNN-*.png
beside pairNN-build-*.png, and the break-ui frames.

Said plainly: the research (14 §3) also proposed a due level check as a moment
on Home; the brief did not ask for it and it is not built. The frame budget:
at 1x CPU on the demo Stash, a filter or an answer peaks at 17 to 25 ms and a
sort at about 42 ms, the whole-app re-render floor the ledger already names
(P8); a 300-card sort peaks near 50 ms after its cards were memoised (158 ms
before).

## DATA TABLE · every value and where it comes from

| Value | Source | Written by |
| --- | --- | --- |
| Shelves, their order, names | `## Heading` lines of `Wiki/Library/Stash.md` | him (Obsidian) or Nova's writes (stash.js) |
| Gift shelf, its person | a heading that reads "For <person>" | him / "New gift list" |
| Gift date | `[date:: YYYY-MM-DD]` on the heading | him / the gift sheet |
| Item name, link, note | `- [Name](url) — note` | him / add / Shortcut |
| Rhythm (weeks) | `[lasts:: 8]` on the line | the rhythm chips |
| Last bought | `[bought:: YYYY-MM-DD]` on the line | Mark bought / Reordered |
| Next check moved | `[check:: YYYY-MM-DD]` on the line | Plenty left (+14 days) |
| Price paid | `[paid:: 34.00]` on a Bought line | Mark bought |
| Bought from shelf | `[from:: Skincare]` on a Bought line | Mark bought |
| Watching the price | `[watch:: on]` on the line | the menu |
| Finished reading | `[read:: YYYY-MM-DD]` on the line | Reader's Finished |
| Days left | code: bought + lasts × 7 − today | stashModel.js |
| Check date | code: bought + lasts × 7 − 7, or `check` when later | stashModel.js / stashSignals.js |
| Learned rhythm | code: median gap between Bought dates for the same link (2+) | stashModel.js |
| Picture | the page's og:image / twitter:image / JSON-LD image / image_src / apple-touch-icon, cached in `server/data/stash/media/` | stashMeta.js, once per link |
| Page name (preview) | og:title, else `<title>` | stashMeta.js |
| Reading time | words of the fetched text ÷ 230 a minute | stashMeta.js |
| Reader text | paragraphs of the page's article, kept in `server/data/stash/reader/` | stashMeta.js, once |
| Place kept | the paragraph he reached, `server/data/stash/meta.json` | the Reader |
| Last opened, opens | taps on a card or the Reader, `server/data/stash/meta.json` | the screen |
| Watched price, stock | JSON-LD offers / product meta, read at most daily, `server/data/stash/meta.json` | stashSignals.js (runPriceWatch) |
| Blocked | the site's answer (401/403/429/503 or a challenge page) | stashMeta.js (blockedReason) |
| Records and pills | the inbox store, kinds `stash-write` (filed, Undo) and `stash` (pending news) | stashRails.js / stashSignals.js |
| "synced 9:41" | when the screen last read the Stash from the Mac | the client |
| Demo links | `src/stashDemo.js`, demo mode only | invented |

---

## BREAK-UI · the worst case (dev only: `?stashDemo=worst`, also `huge`, `empty`, `loading`, `offline`)

The fixture (src/stashDemo.js, demo mode only): 300 links on one shelf, a
2,000-character link, a 120-character name and a one-letter one, a page with
no picture, a watched item with no price on its page, a gift shelf whose day
has passed, a Bought line with no price, a 70-character shelf name, and the
same link pasted twice (typed with tracking tags and a trailing slash).

| # | Severity | Worst case | What happened | Fix |
| --- | --- | --- | --- | --- |
| 1 | Broken | 34 items with a rhythm | the vial card grew to nine rows and buried the shelves | two rows at most, then "27 more, soonest first in Days left" (sets that sort) |
| 2 | Ugly | an item past empty | "About 0 days left by the calendar" | "Empty by the calendar: bought 36 days ago" |
| 3 | Fragile | 300 cards sorted | one 158 ms frame (every card re-rendered) | cards and rows memoised behind a ref to the doors: about 50 ms |
| 4 | Fragile | 300 cards with pictures | every picture would be asked of the Mac at once | a picture is fetched only when its card nears the screen |
| 5 | Ugly | press and hold | shelf headings stayed bright over the dimmed page | headings and empty-shelf lines dim too |

What held up: no sideways scroll at 375 or 390 (the chips scroll inside the
bar); every control 44 pt at 375; long names clamp to two lines and long
shelf names to two; the 2,000-character link never reaches the page (host
only on cards; the add bar's input scrolls); a page with no picture draws the
shelf's monogram; "No price on its page" in the menu for the priceless watch;
"was 7 Oct" for the past gift day, and no reminder filed for it (server
test); the duplicate jumps to the existing card and never saves twice.
