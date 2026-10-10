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

- [ ] A1 · Back chevron (44 pt glass circle) top left, to More (the summary chrome's own back)
- [ ] A2 · "Edit" glass pill top right (44 pt); Done while editing; edit mode shows a red − on each card (44 pt target)
- [ ] A3 · Large title "Stash", 34 pt bold, tight tracking
- [ ] A4 · Serif news line, 20 pt, written by code: with a due check "The cleanser is due a look. **10** links on 4 shelves." (88); with none "**10** links on 4 shelves, nothing running low." (90); the count counts up from zero on arrival
- [ ] A5 · Status line, 13 pt, a teal dot: "Lives in your vault · synced 9:41" (the time of the last real read)

## B · The due check, answered in place (88)

- [ ] B1 · Gold-tinted card under the head, only while a level check is due
- [ ] B2 · Its thumb (48 pt, the link's own picture or the drawn monogram), "Check the level" in gold, the name 17 pt, "About 6 days left by the calendar"
- [ ] B3 · Three 44 pt answers: Plenty left · Getting low (gold fill) · Reordered
- [ ] B4 · An answer folds the card away (opacity + scale .97, 200 ms), the vial and the badge move, a pill with Undo: "Asked again in two weeks" / "On your list, with its link" / "Clock restarted from today"
- [ ] B5 · More than one due: the soonest is the card; the rest wait their turn (each answered one at a time)

## C · Running down (84 instrument, 88 vials)

- [ ] C1 · A card holding one vial per item with a restock rhythm, soonest first (88: four columns; more wrap to a second row)
- [ ] C2 · Each vial: a tube in its shelf's hue, filled to the share of days left, transform-origin bottom; a dashed line a week before empty
- [ ] C3 · Past the dashed line the fill turns gold (the check is due)
- [ ] C4 · Days left as a number under the vial, SF Rounded 15 bold + "d" (88)
- [ ] C5 · A short name under it (12 pt, one line, ellipsis)
- [ ] C6 · Foot: "Days left, counted from when you bought each one. The dashed line is a week before empty."
- [ ] C7 · A vial is a 44 pt button with an aria label ("Cleanser: about 6 days left by the calendar") and opens its item's menu
- [ ] C8 · Arrival: the fills rise from empty (420 ms, ease), numbers count up; reduced motion: at once

## D · The shelf bar (84 kept, 88 tiles, 90 sort)

- [ ] D1 · Sticky under the top as the page scrolls, glass bar, rounded 24
- [ ] D2 · "All N" chip, then a chip per shelf: its 20 pt tile (hue + glyph), name, count; the pressed chip filled with ink 12 %
- [ ] D3 · Chips scroll inside the bar, never the page sideways; a fade mask at the right edge (90)
- [ ] D4 · Tapping a chip filters the shelves below, the cards moving by FLIP
- [ ] D5 · Search button (44 pt, magnifier) opens a field under the bar: "Search names, sites and notes" + Cancel (84)
- [ ] D6 · No match: "Nothing in the Stash matches "…"." in the serif (84)
- [ ] D7 · The sort button (90): ↕ glyph + "Last opened" / "Added" / "Name" / "Days left", 44 pt
- [ ] D8 · The sort menu anchored to its button (transform-origin at the button, pop 220 ms): four radio rows with a check and a subtitle (The ones you use first · As Stash.md lists them · A to Z · Restocks first)
- [ ] D9 · A new sort moves the cards to their new places by FLIP (no jump); the choice is remembered on this device

## E · Shelves and cards (84 grid, 88 hues)

- [ ] E1 · Shelf header: 28 pt tile (hue gradient + white glyph), name 20 pt bold, count right
- [ ] E2 · Product shelves are a two-column grid of cards (rounded 20, glass card)
- [ ] E3 · A card: the page's own picture on top (96 pt tall), name 14 pt semibold two lines, host 12 pt one line (or "opened 2 days ago" when sorted by Last opened, 90)
- [ ] E4 · No picture on the page: the drawn monogram in the shelf's hue, never a broken image
- [ ] E5 · Badge on the picture (top left, dark glass): "N days left" with the shelf's dot; gold dot when due; "On your list" with a green dot
- [ ] E6 · Tap a card opens the link (and notes the open for Last opened); press and hold opens the menu
- [ ] E7 · Reading shelves (every link a page to read) are rows: 44 pt thumb, title 15 semibold, "site · 9 min", a book glyph when a place is kept (90)
- [ ] E8 · Shelves in Stash.md order; Bought last, gift shelves after his own shelves
- [ ] E9 · Remove (from the menu or edit mode): the card fades and scales to .94, the rest close the gap by FLIP, a pill with Undo

## F · Press and hold (88)

- [ ] F1 · Holding a card ~450 ms lifts it (scale 1.04, a deep shadow), the rest of the page dims to .28
- [ ] F2 · The menu (240 pt, glass, rounded 16) under the card, origin at the card: Add to shopping list · Restock every N weeks · Move to a shelf · Share link · Remove (red)
- [ ] F3 · Each row 44 pt, its glyph on the right
- [ ] F4 · A tap outside closes it; Escape closes it; reduced motion: no lift, a fade
- [ ] F5 · Restock and Move open a short sheet (88: "Opens its own short sheet"): rhythm chips Off · 4 · 6 · 8 · 12 weeks, "I just bought it" (84); shelf chips (84)
- [ ] F6 · Share link uses the system share sheet where there is one, else copies the link and says so

## G · Adding (84 form, 88 clipboard)

- [ ] G1 · The floating add bar at the foot: "Paste a link to keep" + teal ＋ (44 pt)
- [ ] G2 · A link on the clipboard (read only after his tap; iOS asks first): the bar offers "Paste skin.example.com/serum…" (88)
- [ ] G3 · Pasting starts a preview: skeleton picture and name while Nova reads the page (84)
- [ ] G4 · The preview: the picture, the name read from the page, "site · name and picture read from the page"; a page Nova could not read says so and keeps the link with its host as the name
- [ ] G5 · Shelf chips, the site's own shelf preselected with a hint ("same site as 3 on Skincare") (84)
- [ ] G6 · "Lasts about (optional)": Off · 4 wk · 6 wk · 8 wk · 12 wk (84)
- [ ] G7 · Cancel and "Stash it" (teal); the new card rises into its shelf; a pill "Stashed on Skincare" with Undo
- [ ] G8 · DUPLICATE (addition 5): a link already saved (after normalising) never saves twice: the bar says "Already on Skincare" and the page scrolls to that card, which pulses its ring once

## H · Reader (90 s1)

- [ ] H1 · A reading link opens in Nova as a page: its picture across the top (170 pt)
- [ ] H2 · Floating back "‹ Stash" (44), Aa (text size, 44), ⋯ (open the original, share, move, remove)
- [ ] H3 · A thin progress line at the top in the Reading hue, following the scroll
- [ ] H4 · The shelf label with its tile, the title in the serif 28, "site · 9 min, counted from 2,140 words", "Saved 3 weeks ago · opened twice, last Tuesday"
- [ ] H5 · The text in the serif 19/1.6, as fetched once from the page and kept in server/data
- [ ] H6 · "You stopped here on Tuesday" marker between paragraphs, in the Reading hue; the page opens at that place
- [ ] H7 · The bottom bar: "Original" (opens the site) and "Finished" (Reading hue fill): Finished files it as read, with Undo
- [ ] H8 · A page Nova cannot read (blocked, paywalled, built by script) says "Nova couldn't read this one" and offers Original
- [ ] H9 · Entering slides in from the right (pushIn, 450 ms); reduced motion: a fade

## I · Share sheet (90 s3)

- [ ] I1 · A Shortcut "Stash in Nova" in Safari's share sheet posts the link to the same address the add bar uses
- [ ] I2 · Nova picks the shelf from the site (other links from that site) or "Unsorted", said in the reply
- [ ] I3 · The Shortcut shows "Stashed on Skincare" (or "Already on Skincare") as its banner
- [ ] I4 · In Nova the new card sits first on its shelf with a teal ring and a "From Safari" badge, with Undo through the Inbox
- [ ] I5 · docs/stash-share-shortcut.md: the steps, headers as separate Key and Value rows, the tailnet IP

## J · Addition 1 · Price drop and back in stock

- [ ] J1 · Per item opt-in: "Watch the price" in the menu; a watched card wears a small price tag in its badge row
- [ ] J2 · Reads: public pages only, at most once a day per item, cached, one polite queue (one request at a time, a pause between them), an honest User-Agent
- [ ] J3 · NEVER past a bot check or CAPTCHA: a 401/403/429/503 or a challenge page records "blocked" and the card says "Blocked by the site", no retry that day
- [ ] J4 · A price under the last seen, or out of stock to in stock: ONE record (kind stash, pending) and one push (held through quiet hours), and a pill in the app
- [ ] J5 · The card's badge says "Down $4" (good green) or "Back in stock"; the menu shows the last price read and when

## K · Addition 2 · Gift lists per person

- [ ] K1 · A shelf per person: "For Mum", with a date if he gives one (`## For Mum [date:: 2026-12-25]`)
- [ ] K2 · "New gift list" in the add flow: a name and an optional date
- [ ] K3 · The shelf header says "Sat 25 Dec · in 76 days"; a past date says "was 3 Oct"
- [ ] K4 · Fourteen days before the date: one gentle reminder (a record and a push held through quiet hours): "Mum's day is in two weeks: 3 ideas on her list."
- [ ] K5 · Gift shelves wear the gift tile and hue

## L · Addition 3 · Bought

- [ ] L1 · "Mark bought" in the menu, with the price paid if he gives one
- [ ] L2 · A one-off moves to the Bought shelf with the date and price (`[bought:: 2026-10-10] [paid:: 34.00] [from:: Skincare]`)
- [ ] L3 · A restock item stays on its shelf, its clock restarts, and a dated line joins Bought (the history)
- [ ] L4 · The rhythm learns from real dates: two or more bought dates for a link give "You rebuy it about every 9 weeks"; when that differs from the rhythm he set, the sheet offers "Use 9 weeks" (proposed, never applied by itself)
- [ ] L5 · Bought shelf drawn as rows, newest first: name, "Bought 10 Oct · $34.00", with Undo on the move

## M · Addition 4 · Ask Nova about the stash

- [ ] M1 · A code-read `stash` source on the consult rail (like the CFO): every agent can ask it; no model runs
- [ ] M2 · The same block in Ask Nova's context: shelves, every restock item with days left, due checks, watched prices and their state, gift dates, recent buys
- [ ] M3 · "What skincare am I running low on" answered from those lines

## N · Addition 5 · Duplicates

- [ ] N1 · URL normalised: scheme and www ignored, host lower case, tracking parameters dropped (utm_*, fbclid, gclid, igshid, si, ref, mc_cid, mc_eid, srsltid, msclkid, yclid, _ga, spm), parameters sorted, the fragment dropped, a trailing slash dropped
- [ ] N2 · The server refuses a second save with 409 and the item it already has; the screen jumps to it (G8); the Shortcut says "Already on …"

## O · States and chrome

- [ ] O1 · Loading: the head and a skeleton shaped like the vials and two cards (no blank)
- [ ] O2 · Empty: "Nothing stashed yet. Paste a link below to keep it." with the add bar live
- [ ] O3 · Offline: "Offline · showing the Stash as of 9:41"; writes refused in words
- [ ] O4 · Demo: invented links, said by the status line ("Demo links, invented")
- [ ] O5 · Every write a pill with Undo through the inbox rails (record kind `stash-write`, `undoData.route` `stash-ops`)
- [ ] O6 · Every control 44 pt; no sideways scroll at 375 and 390
- [ ] O7 · prefers-reduced-motion: fills, lifts, flights and pushes land at once; 200 ms fades only
- [ ] O8 · cupertino and command keep the classic page (the Money precedent), on the same writes, with one target per row

---

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
| Watched price, stock | JSON-LD offers / product meta, read at most daily, `server/data/stash/meta.json` | stashWatch.js |
| Blocked | the site's answer (401/403/429/503 or a challenge page) | stashWatch.js |
| Records and pills | the inbox store, kinds `stash-write` (filed, Undo) and `stash` (pending news) | stashRails.js / stashSignals.js |
| "synced 9:41" | when the screen last read the Stash from the Mac | the client |
| Demo links | `src/stashDemo.js`, demo mode only | invented |
