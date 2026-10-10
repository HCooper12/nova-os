# 14 · Shopping build checklist, 10 Oct 2026

The build of the Shopping screen against its approved frame: mockup 92
(`design/mockups/92-redesign-shopping-r5.html`, round 5), which keeps every
function of rounds 88 (r3) and 91 (r4). His decisions of 10 Oct 2026 change
four things the mockup drew as open questions:

1. Prices: "Option A / nova confirms from their websites". Nova reads
   Woolworths, Coles and Aldi from their public search pages, politely (his
   list only, one read per product per day, one request at a time, an
   identifying user agent, never evading a bot check). A blocked chain says
   "blocked since …".
2. Offers: from his Everyday Rewards and Flybuys emails, saved by a Mail rule
   into a watched vault folder (`docs/rewards-mail-rule.md`).
3. Real logos: fetched once at runtime from each programme's and chain's own
   site into `server/data/logos/` (gitignored); the drawn marks are the
   fallback. Never committed: the repo is public.
4. A stronger programme tint, Flybuys especially.

The mockup's Stash tab is unchanged from round 3 and is not part of this
build.

Every line below is marked once the build is photographed against the
mockup in demo mode: PRESENT, DIFFERS (with why) or MISSING. A MISSING line
is fixed before the branch is reported.

PRIVACY: every product, price, offer, points figure and date in the build's
demo data and in this file is invented. No real email is quoted anywhere.

---

## A · The head

- [ ] A1 · Sticky bar: back button (44 pt round glass) left, ⋯ (44 pt) right
- [ ] A2 · Bar material appears only once content runs under it (opacity 0 at top)
- [ ] A3 · Large title "Shopping", 34 pt bold, −0.025em; folds into a 17 pt bar title on scroll
- [ ] A4 · Serif news line (20 pt): "{Shop} is cheapest on **N** of M priced lines this week."
- [ ] A5 · News line, no prices: "**N** to get, across K aisles."
- [ ] A6 · News line, empty list: "Nothing to get."
- [ ] A7 · Status line with a hued dot: "Synced 9:41 · prices read {when}"
- [ ] A8 · Status, demo: the gold "example prices" chip
- [ ] A9 · Status, a chain failed/blocked: red dot and words, "Try again" (44 pt)
- [ ] A10 · Status, no price source: "no prices read"
- [ ] A11 · Status, offline: gold dot, "Offline · the list as of {time} · N waiting in the Outbox"
- [ ] A12 · Status, loading: "Reading your vault…"

## B · The basket card

- [ ] B1 · Glass card, 22 pt radius, bright top edge
- [ ] B2 · Aisle ring 104 pt: one arc per aisle in its hue on a tinted track, filled by the share got
- [ ] B3 · Ring centre: count left (SF Rounded 28), counted up from 0 on arrival; "of N to get"
- [ ] B4 · "Where to buy what is left": the split bar, one segment per shop in its tag colour, grown by total
- [ ] B5 · Split: an unread/blocked shop is a hatched segment
- [ ] B6 · Legend: tag, shop name, line count, total (bold, tabular); unread shop dashed tag + "not read"/"did not answer"
- [ ] B7 · Foot: "**$X** for N priced lines, split as above: **$Y less** than all at {shop}."
- [ ] B8 · Foot when no one shop has every line: "… No one shop has every line."
- [ ] B9 · No prices: "Where to buy" with the plain sentence, no figures
- [ ] B10 · By aisle / By shop segmented control (44 pt)
- [ ] B11 · Aisle chips rail (36 pt drawn, 44 pt hit), each with tile, name, count left; tap scrolls to the aisle

## C · Points this week

- [ ] C1 · Section only when at least one offer matches; absent when none match or no source is set up
- [ ] C2 · Head "Points this week" (20 pt bold), right: the total as an AMOUNT (violet rounded numeral + "pts"), counted up on arrival, "up to about $X"
- [ ] C3 · Programme row: each programme's mark (tile + name) and its offer count
- [ ] C4 · Gift-card callout: tinted glass in its programme's colour, the drawn card (rate pill + tag), mark, "N days left" (gold ≤ 3), headline, "A $100 card earns **N pts**", source chip, activation label, chevron
- [ ] C5 · Offer rail, snap scroll, 258 pt cards; each card tinted by programme, mark + days left, the figure (rate pill → amount, or amount alone), "about $X" in green, what it is on, the why line (2-line clamp), source chip + activation label
- [ ] C6 · Two kinds of points: RATE = filled orchid pill (`10×`), AMOUNT = violet rounded numeral + "pts"; both on a multiplier card
- [ ] C7 · Programme marks: real logo when cached, else the drawn tile (brand colour, points glyph)
- [ ] C8 · Programme tint: a wash from the top corner + an edge highlight in the programme hue (STRONGER than the mockup, Flybuys especially, his call 4)
- [ ] C9 · Ended line: "One ended Tue 13 Oct and was dropped." (after the turn)
- [ ] C10 · Activation label: "Activate in app" / "Activated, you said" (green) / "No activation"

## D · The list

- [ ] D1 · Group head per aisle: coloured tile (SF-style glyph), name (20 pt bold), count left (green ✓ when done)
- [ ] D2 · Aisles in shop order, each a glass card of rows with inset hairlines
- [ ] D3 · Row: 54 pt tick column with a 24 pt circle; checked fills green with a white check
- [ ] D4 · Item name 18 pt semibold full ink; got: regular, 40% ink, struck through
- [ ] D5 · Meta line 13 pt at 50% ink: **amount** (74% ink) "for {dish}" / "for N meals"; typed amount in bold
- [ ] D6 · Meta: an offer's programme dot + its rate pill or amount, first
- [ ] D7 · Meta: "{money} less than {other shop}" in green when no advice line
- [ ] D8 · Advice line with a glyph (bag or clock): the pack rule's sentence; waste warnings in gold
- [ ] D9 · Price cell: total of the pick (16 pt semibold, tabular), the shop tag(s) and the read date; a tie shows both tags
- [ ] D10 · Price cell, no price: "No price" + "not read" / "{Shop} failed" / "not matched" / "until {next read}"
- [ ] D11 · Got: price fades to 40%
- [ ] D12 · Quantity pill: ×N to buy (neutral pill; ×1 plain); tap opens the 44 pt stepper for 3.2 s
- [ ] D13 · Touch-down highlight on a row, instant on press, fades on release
- [ ] D14 · Swipe right: green "Got it" / "Not yet"; swipe left: red "Remove"; each with Undo
- [ ] D15 · "Sorting into aisles" group with a spinner while new lines are sorted
- [ ] D16 · "Clear the N you got" (50 pt green-tinted button), with Undo
- [ ] D17 · By shop: groups per shop with a store tile (logo when cached, tinted letter otherwise) and its subtotal; "No price" group
- [ ] D18 · Loading skeleton: 4 shimmering rows under a dim "Produce"
- [ ] D19 · Empty: serif "Add what you need below, or shop from one of your meals."
- [ ] D20 · "Nova suggests" strip (better on price and macros; Switch / Keep mine / Talk)
- [ ] D21 · Pin badge in the meta line; "Pin the one I buy" / "Unpin" in the sheet
- [ ] D22 · "Order online" group (Stash lines with Open)

## E · Your meals

- [ ] E1 · "Your meals" head (22 pt) with a "Recipes" glass button
- [ ] E2 · Rail of 150 pt dish cards: art, slot (hued), name, coverage track + "on/total"
- [ ] E3 · Dish sheet: ingredients with aisle tiles, "On the list" / "Missing", "Add the N missing"

## F · Chrome

- [ ] F1 · Floating add bar (56 pt, material) above the tab bar: "Add items, one per line" + a hued ＋ (44 pt)
- [ ] F2 · Add bar expands to a textarea; ＋ commits; lines fly into "Sorting into aisles"
- [ ] F3 · The island pill with Undo on every tick and every write (house receipt)
- [ ] F4 · Sheets: material, grabber, 30 pt top radius, scrim, drag/back to close

## G · Sheets

- [ ] G1 · Price sheet head: aisle tile, name (22 pt), aisle; ✕
- [ ] G2 · Need box: the need as a big rounded numeral (or "?" / "1 kg"), each recipe's share, "+N you added"; ± stepper
- [ ] G3 · Verdict in serif: the pack rule's sentence
- [ ] G4 · Points note (tinted actbox): mark, rate → amount, "about $X", what the points change, "The pick below counts cash only."
- [ ] G5 · Every way to buy: tag, "N × product", total; spare and keeps (gold when perishable); "the pick" in green on a green row; an unread shop's options greyed with why
- [ ] G6 · Foot: "Online prices as of {when}, read by Nova from each shop's site …"
- [ ] G7 · Verdicts for "not matched" / "no price read" / "no prices by your choice"
- [ ] G8 · Actions: "Pin the one I buy" / "Unpin", "Open {dish}"
- [ ] G9 · Offer sheet: tinted top wash in the programme colour, large mark, programme name, "{tag} {shop} · kind"
- [ ] G10 · Offer sheet figure: XL rate pill "points a dollar", "on {what}", arrow → XL amount (counted up) "for your $X of {line}"; or XL amount "bonus points"
- [ ] G11 · Activation box: "Activate it in the {app} before you shop …" with "Open the app" (programme colour) and "✓ I activated it"; activated: green box with "Not yet, after all"; none: "No activation needed. Scan your card at the till."
- [ ] G12 · Facts: points × worth (2,000 pts = $10), the match ("On your list: **x**" + why), "Ends **date**", days left, "Where Nova got it: **email**" + its long source line
- [ ] G13 · Actions: "Add a $100 card to the list" (gift), "Not for me" (with Undo)
- [ ] G14 · Foot: "Code checked its programme, points, end date and source before it could show."
- [ ] G15 · Sources sheet ("Where offers come from"): marks, Your emails (last one {when}), Shared from the apps, The catalogue, "What Nova cannot do", the state line
- [ ] G16 · Menu sheet: Add the week's missing lines, Recipes, Where offers come from, Clear everything… (armed: "Clear the whole list, ticked or not? Undo brings back every line." Clear it / Keep)
- [ ] G17 · Recipes sheet: the rotation's dishes as rows

## H · Motion

- [ ] H1 · Arrival: blocks rise 8 pt and fade in a 40 ms stagger (≤ 10)
- [ ] H2 · Count-ups from zero on arrival: ring count, points total, sheet amount
- [ ] H3 · Tick: circle pops (0.8 → 1.08 → 1), name strikes, pill with Undo
- [ ] H4 · FLIP: rows and groups slide to new slots on regroup, remove, clear, add; new rows fade up
- [ ] H5 · Remove: the row folds (fade + scale .98) before the list closes up
- [ ] H6 · Number rolls when a figure changes (count to the new value)
- [ ] H7 · The Wednesday turn: ended offers fade/scale out, the rest slide into place, one line says what left, Undo
- [ ] H8 · Sheets rise on the drawer curve; scrim fades
- [ ] H9 · Press: scale .97 on every button
- [ ] H10 · Reduced motion: cross-fades only, figures land set; reduced transparency: solid panels with the faint hue

## I · Light appearance

- [ ] I1 · Light tokens for ink, points colours, tags, tint (light wash)

---

## DATA TABLE: every number on screen

| Figure | Source | Freshness | When missing |
| --- | --- | --- | --- |
| Lines, names, amounts, "for {dish}" | `GET /api/shopping-list` (vault `Wiki/Health/Shopping List.md`) | live on every load; offline shows the cached list with its time | loading skeleton; offline with nothing cached says so |
| Need per line | sum of `parseAmount` over every list item of that name × its qty (code, `src/shopPrice.js`) | as the list | no amount: "priced as written", one product |
| Count left / of N (ring, group heads, chips) | the list | live | — |
| Price of a line (cell) | the cheapest current read across chains (`GET /api/shopping/prices`, `server/data/shopping-prices.json`), picked by the pack rule | read at most once a day per product per chain; the cell shows the read's date | "No price · not read" / "{Shop} blocked" / "not matched"; never a guessed price |
| Store tag on a price | the chain whose read won | with the price | — |
| "{money} less than {shop}" | difference between the pick and the best other chain | with the reads | omitted when only one chain was read |
| Pack advice / verdict | code's rule: need, pack sizes from the product's own size text, the shelf-life table, 14-day spoil rule, 50c margin | with the reads | no prices: the need-only sentence |
| Basket split, per-shop totals | sum of picks by chain over unticked priced lines | with the reads | no prices: no figures, the sentence |
| "less than all at {shop}" | the one-shop total over the same lines | with the reads | "No one shop has every line." |
| "{Shop} is cheapest on N of M" | tally of picks (ties excluded) | with the reads | count left instead |
| Chain state (read/blocked/error/never) | the reader's per-chain record | each attempt | "not read" |
| Points (rate, amount) | offers parsed by code from his saved emails (`Inbox/Rewards Mail/`), `server/data/rewards-offers.json` | as each email arrives (scanned every 30 min) | no section |
| Points on a multiplier offer | rate × the line's priced spend at that chain (code) | with reads | the rate alone, "on what you spend" |
| "about $X" | points × $10 / 2,000 | — | — |
| Days left / end date | the offer's own end date | — | an offer with no end date is never shown (code refuses it) |
| Points this week total | sum of the matched offers' amounts | — | — |
| Logos | fetched once from each site's own icon link, `server/data/logos/` | once (a miss retried after 7 days) | the drawn mark |
| Synced time | the app's last sync | — | — |
| Dish coverage on/total | the rotation's focused dishes and their recipe ingredients vs the list names | live | no rail when no rotation |
