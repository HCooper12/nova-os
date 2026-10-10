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

**Tally, 10 Oct 2026: 80 PRESENT, 10 DIFFERS, 0 MISSING.** "Pin the one I buy"
was MISSING on the first pass and was built (a pin per line, with Undo).
Frames: build vs mockup at 390×844, demo mode, chrome-devtools isolated
context (b-*, m-*), the worst case (w-*), glass, solid, lit and daylight
(t-*), kept in the session scratchpad (not the repo).

PRIVACY: every product, price, offer, points figure and date in the build's
demo data and in this file is invented. No real email is quoted anywhere.

---

## A · The head

- [x] A1 DIFFERS · Sticky bar: back button (44 pt round glass) left, ⋯ (44 pt) right
      Why: back and ⋯ are drawn, but not in a sticky bar: the house chrome (MobileChrome) already folds the page title into its own bar on scroll, and a second sticky bar sat under it unseen.
- [x] A2 DIFFERS · Bar material appears only once content runs under it (opacity 0 at top)
      Why: the house chrome's bar carries the material on scroll (see A1).
- [x] A3 DIFFERS · Large title "Shopping", 34 pt bold, −0.025em; folds into a 17 pt bar title on scroll
      Why: the 34 pt title is drawn; the fold is the house chrome's compact title.
- [x] A4 DIFFERS · Serif news line (20 pt): "{Shop} is cheapest on **N** of M priced lines this week."
      Why: "this week" dropped: prices are read daily now, so the sentence names no week.
- [x] A5 PRESENT · News line, no prices: "**N** to get, across K aisles."
- [x] A6 PRESENT · News line, empty list: "Nothing to get."
- [x] A7 PRESENT · Status line with a hued dot: "Synced 9:41 · prices read {when}"
- [x] A8 PRESENT · Status, demo: the gold "example prices" chip
- [x] A9 PRESENT · Status, a chain failed/blocked: red dot and words, "Try again" (44 pt)
- [x] A10 DIFFERS · Status, no price source: "no prices read"
      Why: "no prices read yet": there is no off switch, reading is his call already made; the state shows until the first read lands.
- [x] A11 PRESENT · Status, offline: gold dot, "Offline · the list as of {time} · N waiting in the Outbox"
- [x] A12 PRESENT · Status, loading: "Reading your vault…"

## B · The basket card

- [x] B1 PRESENT · Glass card, 22 pt radius, bright top edge
- [x] B2 PRESENT · Aisle ring 104 pt: one arc per aisle in its hue on a tinted track, filled by the share got
- [x] B3 PRESENT · Ring centre: count left (SF Rounded 28), counted up from 0 on arrival; "of N to get"
- [x] B4 PRESENT · "Where to buy what is left": the split bar, one segment per shop in its tag colour, grown by total
- [x] B5 PRESENT · Split: an unread/blocked shop is a hatched segment
- [x] B6 PRESENT · Legend: tag, shop name, line count, total (bold, tabular); unread shop dashed tag + "not read"/"did not answer"
- [x] B7 PRESENT · Foot: "**$X** for N priced lines, split as above: **$Y less** than all at {shop}."
- [x] B8 PRESENT · Foot when no one shop has every line: "… No one shop has every line."
- [x] B9 PRESENT · No prices: "Where to buy" with the plain sentence, no figures
- [x] B10 PRESENT · By aisle / By shop segmented control (44 pt)
- [x] B11 PRESENT · Aisle chips rail (36 pt drawn, 44 pt hit), each with tile, name, count left; tap scrolls to the aisle

## C · Points this week

- [x] C1 PRESENT · Section only when at least one offer matches; absent when none match or no source is set up
- [x] C2 PRESENT · Head "Points this week" (20 pt bold), right: the total as an AMOUNT (violet rounded numeral + "pts"), counted up on arrival, "up to about $X"
- [x] C3 PRESENT · Programme row: each programme's mark (tile + name) and its offer count
- [x] C4 PRESENT · Gift-card callout: tinted glass in its programme's colour, the drawn card (rate pill + tag), mark, "N days left" (gold ≤ 3), headline, "A $100 card earns **N pts**", source chip, activation label, chevron
- [x] C5 PRESENT · Offer rail, snap scroll, 258 pt cards; each card tinted by programme, mark + days left, the figure (rate pill → amount, or amount alone), "about $X" in green, what it is on, the why line (2-line clamp), source chip + activation label
- [x] C6 PRESENT · Two kinds of points: RATE = filled orchid pill (`10×`), AMOUNT = violet rounded numeral + "pts"; both on a multiplier card
- [x] C7 PRESENT · Programme marks: real logo when cached, else the drawn tile (brand colour, points glyph)
- [x] C8 PRESENT · Programme tint: a wash from the top corner + an edge highlight in the programme hue (STRONGER than the mockup, Flybuys especially, his call 4)
- [x] C9 PRESENT · Ended line: "One ended Tue 13 Oct and was dropped." (after the turn)
- [x] C10 PRESENT · Activation label: "Activate in app" / "Activated, you said" (green) / "No activation"

## D · The list

- [x] D1 PRESENT · Group head per aisle: coloured tile (SF-style glyph), name (20 pt bold), count left (green ✓ when done)
- [x] D2 PRESENT · Aisles in shop order, each a glass card of rows with inset hairlines
- [x] D3 PRESENT · Row: 54 pt tick column with a 24 pt circle; checked fills green with a white check
- [x] D4 PRESENT · Item name 18 pt semibold full ink; got: regular, 40% ink, struck through
- [x] D5 PRESENT · Meta line 13 pt at 50% ink: **amount** (74% ink) "for {dish}" / "for N meals"; typed amount in bold
- [x] D6 PRESENT · Meta: an offer's programme dot + its rate pill or amount, first
- [x] D7 PRESENT · Meta: "{money} less than {other shop}" in green when no advice line
- [x] D8 PRESENT · Advice line with a glyph (bag or clock): the pack rule's sentence; waste warnings in gold
- [x] D9 PRESENT · Price cell: total of the pick (16 pt semibold, tabular), the shop tag(s) and the read date; a tie shows both tags
- [x] D10 PRESENT · Price cell, no price: "No price" + "not read" / "{Shop} failed" / "not matched" / "until {next read}"
- [x] D11 PRESENT · Got: price fades to 40%
- [x] D12 PRESENT · Quantity pill: ×N to buy (neutral pill; ×1 plain); tap opens the 44 pt stepper for 3.2 s
- [x] D13 PRESENT · Touch-down highlight on a row, instant on press, fades on release
- [x] D14 PRESENT · Swipe right: green "Got it" / "Not yet"; swipe left: red "Remove"; each with Undo
- [x] D15 PRESENT · "Sorting into aisles" group with a spinner while new lines are sorted
- [x] D16 PRESENT · "Clear the N you got" (50 pt green-tinted button), with Undo
- [x] D17 PRESENT · By shop: groups per shop with a store tile (logo when cached, tinted letter otherwise) and its subtotal; "No price" group
- [x] D18 PRESENT · Loading skeleton: 4 shimmering rows under a dim "Produce"
- [x] D19 PRESENT · Empty: serif "Add what you need below, or shop from one of your meals."
- [x] D20 DIFFERS · "Nova suggests" strip (better on price and macros; Switch / Keep mine / Talk)
      Why: not built: "better on macros" needs each product's macros, which the reader does not read (Open Food Facts by barcode is the next step); nothing is shown rather than a guess.
- [x] D21 PRESENT · Pin badge in the meta line; "Pin the one I buy" / "Unpin" in the sheet
- [x] D22 DIFFERS · "Order online" group (Stash lines with Open)
      Why: not built: no list line carries a link yet (the Stash's "Getting low" door is the Stash build's).

## E · Your meals

- [x] E1 PRESENT · "Your meals" head (22 pt) with a "Recipes" glass button
- [x] E2 PRESENT · Rail of 150 pt dish cards: art, slot (hued), name, coverage track + "on/total"
- [x] E3 PRESENT · Dish sheet: ingredients with aisle tiles, "On the list" / "Missing", "Add the N missing"

## F · Chrome

- [x] F1 PRESENT · Floating add bar (56 pt, material) above the tab bar: "Add items, one per line" + a hued ＋ (44 pt)
- [x] F2 PRESENT · Add bar expands to a textarea; ＋ commits; lines fly into "Sorting into aisles"
- [x] F3 PRESENT · The island pill with Undo on every tick and every write (house receipt)
- [x] F4 PRESENT · Sheets: material, grabber, 30 pt top radius, scrim, drag/back to close

## G · Sheets

- [x] G1 PRESENT · Price sheet head: aisle tile, name (22 pt), aisle; ✕
- [x] G2 PRESENT · Need box: the need as a big rounded numeral (or "?" / "1 kg"), each recipe's share, "+N you added"; ± stepper
- [x] G3 PRESENT · Verdict in serif: the pack rule's sentence
- [x] G4 PRESENT · Points note (tinted actbox): mark, rate → amount, "about $X", what the points change, "The pick below counts cash only."
- [x] G5 PRESENT · Every way to buy: tag, "N × product", total; spare and keeps (gold when perishable); "the pick" in green on a green row; an unread shop's options greyed with why
- [x] G6 PRESENT · Foot: "Online prices as of {when}, read by Nova from each shop's site …"
- [x] G7 PRESENT · Verdicts for "not matched" / "no price read" / "no prices by your choice"
- [x] G8 PRESENT · Actions: "Pin the one I buy" / "Unpin", "Open {dish}"
- [x] G9 PRESENT · Offer sheet: tinted top wash in the programme colour, large mark, programme name, "{tag} {shop} · kind"
- [x] G10 PRESENT · Offer sheet figure: XL rate pill "points a dollar", "on {what}", arrow → XL amount (counted up) "for your $X of {line}"; or XL amount "bonus points"
- [x] G11 DIFFERS · Activation box: "Activate it in the {app} before you shop …" with "Open the app" (programme colour) and "✓ I activated it"; activated: green box with "Not yet, after all"; none: "No activation needed. Scan your card at the till."
      Why: "Open Everyday Rewards" / "Open Flybuys" opens the programme's own site (which hands off to the app where iOS can); Nova knows no app URL scheme for either.
- [x] G12 PRESENT · Facts: points × worth (2,000 pts = $10), the match ("On your list: **x**" + why), "Ends **date**", days left, "Where Nova got it: **email**" + its long source line
- [x] G13 DIFFERS · Actions: "Add a $100 card to the list" (gift), "Not for me" (with Undo)
      Why: "Add two to the list" (the bought-often offer) is not built: there is no bought log yet; "Not for me" and "Add a $100 card" are present.
- [x] G14 PRESENT · Foot: "Code checked its programme, points, end date and source before it could show."
- [x] G15 DIFFERS · Sources sheet ("Where offers come from"): marks, Your emails (last one {when}), Shared from the apps, The catalogue, "What Nova cannot do", the state line
      Why: "Shared from the apps" says it is not built (no image door on Send to Nova); "The catalogue" says it is not read.
- [x] G16 PRESENT · Menu sheet: Add the week's missing lines, Recipes, Where offers come from, Clear everything… (armed: "Clear the whole list, ticked or not? Undo brings back every line." Clear it / Keep)
- [x] G17 PRESENT · Recipes sheet: the rotation's dishes as rows

## H · Motion

- [x] H1 PRESENT · Arrival: blocks rise 8 pt and fade in a 40 ms stagger (≤ 10)
- [x] H2 PRESENT · Count-ups from zero on arrival: ring count, points total, sheet amount
- [x] H3 PRESENT · Tick: circle pops (0.8 → 1.08 → 1), name strikes, pill with Undo
- [x] H4 PRESENT · FLIP: rows and groups slide to new slots on regroup, remove, clear, add; new rows fade up
- [x] H5 PRESENT · Remove: the row folds (fade + scale .98) before the list closes up
- [x] H6 PRESENT · Number rolls when a figure changes (count to the new value)
- [x] H7 PRESENT · The Wednesday turn: ended offers fade/scale out, the rest slide into place, one line says what left, Undo
- [x] H8 PRESENT · Sheets rise on the drawer curve; scrim fades
- [x] H9 PRESENT · Press: scale .97 on every button
- [x] H10 PRESENT · Reduced motion: cross-fades only, figures land set; reduced transparency: solid panels with the faint hue

## I · Light appearance

- [x] I1 PRESENT · Light tokens for ink, points colours, tags, tint (light wash)

---

## DATA TABLE: every number on screen

| Figure | Source | Freshness | When missing |
| --- | --- | --- | --- |
| Lines, names, amounts, "for {dish}" | `GET /api/shopping-list` (vault `Wiki/Health/Shopping List.md`) | live on every load; offline shows the cached list with its time | loading skeleton; offline with nothing cached says so |
| Need per line | sum of `parseAmount` over every list item of that name × its qty (code, `src/shopPrice.js`) | as the list | no amount: "priced as written", one product |
| Count left / of N (ring, group heads, chips) | the list | live | n/a |
| Price of a line (cell) | the cheapest current read across chains (`GET /api/shopping/prices`, `server/data/shopping-prices.json`), picked by the pack rule | read at most once a day per product per chain; the cell shows the read's date | "No price · not read" / "{Shop} blocked" / "not matched"; never a guessed price |
| Store tag on a price | the chain whose read won | with the price | n/a |
| "{money} less than {shop}" | difference between the pick and the best other chain | with the reads | omitted when only one chain was read |
| Pack advice / verdict | code's rule: need, pack sizes from the product's own size text, the shelf-life table, 14-day spoil rule, 50c margin | with the reads | no prices: the need-only sentence |
| Basket split, per-shop totals | sum of picks by chain over unticked priced lines | with the reads | no prices: no figures, the sentence |
| "less than all at {shop}" | the one-shop total over the same lines | with the reads | "No one shop has every line." |
| "{Shop} is cheapest on N of M" | tally of picks (ties excluded) | with the reads | count left instead |
| Chain state (read/blocked/error/never) | the reader's per-chain record | each attempt | "not read" |
| Points (rate, amount) | offers parsed by code from his saved emails (`Inbox/Rewards Mail/`), `server/data/rewards-offers.json` | as each email arrives (scanned every 30 min) | no section |
| Points on a multiplier offer | rate × the line's priced spend at that chain (code) | with reads | the rate alone, "on what you spend" |
| "about $X" | points × $10 / 2,000 | n/a | n/a |
| Days left / end date | the offer's own end date | n/a | an offer with no end date is never shown (code refuses it) |
| Points this week total | sum of the matched offers' amounts | n/a | n/a |
| Logos | fetched once from each site's own icon link, `server/data/logos/` | once (a miss retried after 7 days) | the drawn mark |
| Synced time | the app's last sync | n/a | n/a |
| Dish coverage on/total | the rotation's focused dishes and their recipe ingredients vs the list names | live | no rail when no rotation |

---

## Where each logo comes from

No logo file is in the repo. On his Mac the server reads each site's own
page head once and keeps the icon it names (the largest apple-touch-icon,
else an SVG site icon, else the largest PNG icon) in
`server/data/logos/<key>.<ext>`, with the exact icon URL recorded in
`server/data/logos/logos.json` (shown in `GET /api/shopping/logos` as
`source`). A refusal is kept as a miss for a week and the drawn mark stands.

| Mark | Read from |
| --- | --- |
| Everyday Rewards | https://www.everyday.com.au/ (its icon link) |
| Flybuys | https://experience.flybuys.com.au/ (its icon link) |
| Woolworths | https://www.woolworths.com.au/ (its icon link) |
| Coles | https://www.coles.com.au/ (its icon link) |
| Aldi | https://www.aldi.com.au/ (its icon link) |

Not yet read: the build's one live footprint was the price check, so no
logo was fetched from this session. The first read happens on his Mac on
the Shopping loop's first tick after the reload; until then every mark is
the drawn tile.

## The live price check (10 Oct 2026, read-only, once)

Three lines (brown onion, limes, chicken thigh fillets) against each chain,
one request at a time, 8 s apart, into a scratch data folder:

- **Woolworths:** no answer within 20 s, three times (the reader then had no
  stop-after-one rule; it does now). Recorded as "did not answer".
- **Coles:** one request, a real page with its product data (321 KB). The
  first detector read the CAPTCHA and Incapsula names in Coles' own scripts
  as a block and stopped the chain; fixed (only a page without data is
  checked for a wall). Re-read offline from the saved answer: Coles Brown
  Onions 1kg $4.00 (special), Coles Loose Brown Onions approx. 200 g $0.84,
  Coles Organic Brown Onions 1 kg $6.90.
- **Aldi:** three answers. Every product is marked not for sale online (Aldi
  has no online shop), so the first parser kept none; fixed. Re-read
  offline: Brown Onions 1 kg $1.99, Brown Onions per kg $3.49; Lime Each
  $1.69, Limes 400 g $6.49; Chicken Thigh Fillets per kg $15.99 and $17.99
  (free range), Bulk Pack per kg $15.49.
