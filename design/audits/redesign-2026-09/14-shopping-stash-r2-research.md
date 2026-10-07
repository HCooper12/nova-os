# 14 · Shopping and Stash, round 2: research, 7 Oct 2026

The research behind `design/mockups/84-redesign-shopping-stash-r2.html`. Round 1
is `78-redesign-lists.html` with its audit `13-lists.md`. On 7 Oct he chose
direction B, Instruments, for both screens and asked for more (his words are
quoted in full at the top of the mockup). To-Do waits for his screen
recordings and is not covered here.

Four questions, each answered from the web or from Nova's own code, then what
the design does with the answer. Every figure in the mockup is an invented
example; nothing below quotes a real price.

---

## 1 · Supermarket prices: Coles, Woolworths, Aldi

### What exists, as of October 2026

**No supermarket in Australia offers a sanctioned price feed.** The ACCC's
supermarkets inquiry (final report, February 2025) recommended that Aldi,
Coles and Woolworths be required to publish their prices, and that Coles and
Woolworths "make available application programming interfaces that provide
dynamic price information to third parties such as online price comparison
tools", because comparison apps "have relied on problematic screen scraping".
The government agreed to the inquiry's recommendations in principle. I found
no sign that such a feed exists yet. That last point is a search result, not
a certainty; it is worth checking again before any build.

**Woolworths.** Its website answers product searches from its own JSON
service, and that answer carries the whole nutrition panel, so prices and
macros come together. Prices are the national online price unless a store or
postcode is chosen. Its terms (the shop's terms and the Woolworths Group site
terms carry the same clause) forbid using "any robot, spider, site search and
retrieval application or other mechanism to retrieve or index any portion of
the Site". The shop's terms page returned 403 to my fetch (a bot wall, and an
address outside Australia), so that wording comes from the group terms page,
read directly, and from the search index for the shop page.

**Coles.** Sits behind a bot check. One commercial scraper's notes say Coles
"refused Apify's datacenter addresses outright" on 16 Sep 2026 and needs
residential addresses; label data is a separate page per product. Coles'
website terms (updated 13 Dec 2024, clause 2) say you must not "by any means
copy, reproduce, republish, adapt, upload, link, post, frame, translate,
transmit or distribute any part of the Website or any Content". CW Scanner, a
comparison app, looks Woolworths up live but links out for Coles, saying
"Coles doesn't permit automated price lookups".

**Aldi.** No online shop. `aldi.com.au/products` lists every product with a
price and a unit price (read directly: e.g. a 1 L oil at $4.99, "$0.50 per
100 ml"), but shows no nutrition to an anonymous visitor. Its legal notice
permits "automated access to the site by or on behalf of internet search
engines" and forbids access "through any automated means (including, without
limitation, through the use of scripts or webcrawlers)", and forbids
reproducing or exploiting "any portion of, use of or access to, data on the
Site". So his instinct was right in part: Aldi's prices are visible, its
nutrition is not, and its terms close the door to automation.

**Existing Australian apps.** WiseList (Coles, Woolworths, Aldi; claims over
400,000 users), Pinch (Coles, Woolworths, Aldi, Harris Farm; 74,000+
products, 52 weeks of history), Grocerize (Coles against Woolworths), Frugl
(compiles "publicly available sales info"), Half Price (the weekly specials),
CW Scanner (barcode, Woolworths live, Coles by link-out). None publishes how
it gets prices beyond that, and none offers a public API. Commercial scrapers
on Apify sell the same data and say plainly that terms compliance is the
buyer's problem. A May 2026 piece on the ACCC recommendation sums up the
state: using a site's own API "does not settle questions about permission,
terms of use, supermarket approval".

**Freshness.** Both chains change specials each Wednesday (Coles' reset at
midnight AEDT, running to Tuesday). Online prices can differ from a given
store's shelf and between states; a comparison app lets you pick a state for
that reason. A weekly read just after the Wednesday change is the natural
rhythm; anything older than the next Wednesday is last week's price and must
say so.

**What breaks.** Bot walls and address blocks (Coles already); Australian
addresses only (his Mac in Melbourne is fine, a cloud job is not); the shape
of an undocumented answer changing without notice; product ids changing;
multi-buy specials ("2 for $7") that need a rule before they can be a unit
price; matching a list line ("beef mince") to products, which is exactly why
the pin exists; out-of-stock items with no price; and store-specific pricing.

### What Nova already has

- **Open Food Facts by barcode** (`server/lib/barcodeLookup.js`): per serve or
  per 100 g macros, with a descriptive User-Agent as their policy asks.
- **Open Food Facts search by brand** (`server/lib/eatOutSources.js`): Coles
  and Woolworths house brands filtered to `en:meals`, paced 6.5 s between
  searches for their 10-per-minute limit, every row through `validateRow`
  (Atwater within 20 %, kJ against kcal within 6 %, and so on; memory
  `nova-pick-it-up`).
- **Nothing per shopping line.** A list item is `{id, name, category,
  checked, qty, amount, source}` (`server/lib/shoppingList.js`): no product,
  no barcode, no macros, no price. Recipes carry whole-dish macros only
  (`server/lib/recipes.js`), never per ingredient. `money.js` knows a
  Woolworths or Coles bank line is groceries, as a total, never by item.

### Recommendation, with its limits

Split the job in two, because the two halves have different honesty.

**Macros: Open Food Facts by barcode, now.** Openly licensed, already used,
already gated by `validateRow`. A product's barcode comes from his pin, from a
scan, or from the chain's own product answer. Where Open Food Facts lacks a
product, its macros are "not known" and it is never part of a "better on
both" suggestion. This works whichever way the price question goes.

**Prices: his call, because every option costs something** (Your calls 1).

- (a) A narrow weekly read of Woolworths' and Coles' public product pages,
  Wednesday morning after the change, only for lines on his list or pinned
  (tens of products, not a catalogue), from his Mac, identified, paced, cached
  for the week, never shared. This is against the letter of both chains'
  terms, whatever the volume, and either can block it at any time; when one
  does, its prices disappear and the screen says so in red with Try again
  (drawn in the mockup's "Coles failed" state). The comparison apps above do
  the same at far larger scale; the terms forbid it all the same.
- (b) No supermarket reads. Kinds, pins and macros still work from Open Food
  Facts; price cells and totals do not appear; each kind links out so he
  reads the price himself (CW Scanner's approach for Coles). Drawn as the "No
  price source" state.
- (c) Build (b) now and switch to a chain's own feed the day one exists. The
  price slot in the design is the same in all three.

My recommendation is (c) with the option of (a): it ships the half that is
clean, keeps the design honest about the half that is not, and leaves the
terms question where it belongs, with him. If he chooses (a), Aldi can join
on the same terms (Your calls 2), for price only.

**The rules code applies, whichever source:**

- A price is shown only if it was read this week, labelled with when and from
  where; older than the next Wednesday, it says "last week's".
- "Which is cheaper" compares like with like: the same product at both, or
  per kilo across kinds. The basket totals count only lines priced at both
  shops, and say how many that was.
- With nothing pinned, a line shows "from" its cheapest kind and opens every
  kind, placed by price per kilo and protein per 100 g.
- Pinned (his example, lean beef mince 1 kg at Woolworths), a line shows only
  that product. A suggestion appears only when another kind is cheaper per
  kilo AND has at least as much protein AND no more kJ per 100 g (Your calls 3
  sets the rule). It is gold, labelled "Nova suggests", and answered with a
  light tick (Switch), a cross (Keep mine, which stops that product being
  suggested for that line again) or Talk. Code computes it; no model picks a
  product.
- Aldi without nutrition can never be "better on both"; the design says so.

**New server work this implies:** a product record per pinned line
(`{barcode, chain, name, size}`), a weekly price cache in `server/data/`
(operational, rebuilt each week; the vault keeps only the pin), the Open Food
Facts lookup reused per barcode, and the pin as an optional field on a list
item, which is a change to the shopping list's frontmatter contract
(`shoppingList.js`, `mealPrep.js`, the inbox's shopping route, and every
reader change together).

---

## 2 · Stash link pictures

**How.** Nova already does this for the briefing: `server/lib/briefingMedia.js`
reads a page's head in a bounded slice (200 KB, stop at `</head>`), takes
`og:image` or `og:image:secure_url` (`parseOgImage`), and `cacheImage` saves it
by a hash key with a size gate (over 3 KB, under 12 MB), a content-type check,
and a `.miss` marker so a page without one is not fetched again.
`recipeFromPage.js` does the same with a Safari User-Agent and also reads the
JSON-LD block. For the Stash, the fallbacks in order: `og:image`,
`twitter:image`, the JSON-LD Product `image`, `link rel="image_src"`, the
site's `apple-touch-icon`, then the monogram round 1 drew. The same read
gives `og:title`, so a pasted link arrives already named, and `og:type`
(`product` or not) decides whether its shelf draws as cards or rows.

**When.** Once, when a link is stashed, on his Mac; existing links are filled
in lazily, one at a time, the first time the Stash opens after the change.
"Refresh picture" in a card's sheet re-reads it on demand.

**Where it is cached.** `server/data/stash-media/<hash>.<ext>`: operational,
derived, re-fetchable, so it belongs in `server/data`, never in the vault.
Served by a new `GET /api/stash/image/:key` with a long cache header, keyed
by the hash so a new picture gets a new address. The Stash line in
`Wiki/Library/Stash.md` is unchanged by this.

**What breaks.** Shops behind bot walls answer 403 (Woolworths did to my
fetch); pages built by script carry no tags; some shops sign image URLs that
expire (the server keeps its own copy, so that is fine after the first read).
Each failure falls back to the monogram and says "no picture on that page".
A Stash link to a Coles or Woolworths product is the gentlest case of the
terms question above (one page, once, at his request, like a link preview in
Messages), but the same terms apply; it can simply be skipped for those two
hosts if he prefers.

---

## 3 · Restock reminders

**What exists.**
- `server/lib/reminders.js`: `createReminder({text, whenISO})` files a
  scheduled entry in `server/data/reminders.json`, fires a push and a Telegram
  line when due (a 60 s scheduler), optionally writes a VTODO with an alarm
  to his iCloud Reminders, says honestly when it fired late because the Mac
  slept, and passes `urgent: true` because he set the time himself.
- `server/lib/push.js` `sendPush({title, body, tag, url, urgent})`: Web Push to
  the installed PWA; inside quiet hours a push is held and delivered as one
  when the window ends.
- `server/lib/quietHours.js`: his window, default 22:00 to 07:00 Melbourne,
  his call on 3 Oct ("Yes notifications respect quiet hours").
- `public/push-sw.js`: a tap opens the push's `url`. The notification carries
  no action buttons, so the answer happens in Nova after the tap.

**The fit.** A restock rhythm is two facts per Stash item: how long one lasts
(he picks 4, 6, 8 or 12 weeks) and when he last bought it. Code sets the check
for a week before the estimated run-out (lead time for an online order) and
files it on the reminders rails with three differences: `kind: 'restock'`,
the Stash item as its reference, and `urgent: false`, because an estimate has
not earned a 3 am buzz, so quiet hours hold it. The push says "Check the
level: Hydrating cleanser. About a week left by the calendar" and opens
`#/stash?check=<id>`, where three answers wait:

- Plenty left: asked again in two weeks (the next check moves).
- Getting low: the item goes onto the shopping list with its link and picture
  (the Order online group); ticking it off there later counts as bought, so
  the clock restarts without a second tap.
- Just reordered: the clock restarts now.

Every answer is undoable (the prior rhythm, bought date and scheduled check
come back; a line it added comes off). The level drawn in "Running down" counts
days and measures nothing, and the card says so ("counted in days").

**Learning, proposed, never assumed.** After two real cycles, code compares
the rhythm he set with what he did and, if they differ, files a proposal in
the Inbox ("You restocked the cleanser every 10 weeks, not 8. Change it?").
He approves; Nova never changes a rhythm itself.

**Open choices** (Your calls 5 and 6): whether the rhythm lives in the vault
line (Dataview-style inline fields, readable in Obsidian, a Stash format
change that `stash.js` parse and format, and every reader, take together) or
in `server/data`; and whether checks also go to Apple Reminders.

**Both Home idioms (§2b rule 1).** A due check is news, so it is a moment on
the summary Home and a row in the structured Home while it is due, from one
view model; it leaves when answered.

---

## 4 · Meals from Shopping

**What exists.** The rotation (`server/lib/rotation.js`): slots breakfast,
lunch, dinner, snack, extra and custom ones, each with options and one in
focus. Recipes (`Wiki/Health/Meal Prep Recipe Collection.md`, parsed by
`recipes.js`) with whole-dish macros or an honest "not set". A recipe already
adds to the list: `valsRecipes.js` offers "Add just this to the shopping list"
per line and the whole buyable set, both through `App.addToShoppingList(lines,
source)`, which sets each line's `source` to the dish name; that is the "for
Weeknight chilli" provenance on a row. The Thursday meal-prep proposal
(`mealPrep.js`) already composes the week's list from the rotation with
`toShoppingItems`, amounts summed only when every line carried one.

**What the design does with it.** "Your meals" is the rotation as a rail of
dishes under the basket card, each card saying how much of the dish is
already on the list (matched by the `source` tag Nova itself writes, so the
count reads Nova's own tags). A dish opens its ingredients: add one, or
"Add the N missing". The last card adds the week's missing lines, the same
compose meal prep uses, on demand. "Recipes" opens the library with a search.
Lines fly into "Sorting into aisles" and then their aisle, as round 1 drew.

**New:** an Undo for lines added from a recipe. Today there is none; the add
job returns the whole list, so the client can diff the new ids and remove
exactly those (needs the per-line remove route round 1 already proposed).

---

## 5 · What B keeps, adds and measures

**Everything A had** is listed item by item on the mockup ("Everything A had,
and where it lives in B"): the head, the row and its circle, both swipes, the
count pill and stepper, the aisles with amounts and provenance, the floating
add and the sorting flight, clearing with its Undos and the armed Clear
everything, the four states, and B's aisle ring.

**Measured in the mockup at 390×844 (chrome-devtools, mobile, touch, 3×),**
on 7 Oct, my own isolated context, page closed after:

| Check | Shopping | Stash |
| --- | --- | --- |
| Page `scrollWidth` at 390 | 390 | 390 |
| Controls under 44 pt in the phone, open sheets included | 0 | 0 |
| First line's top (round 1 B) | 692 pt (441) | 635 pt to the first card (352) |
| Console errors across all seven moments | 0 | 0 |

The first line moved down by the meals rail and the price card; that cost is
Your calls 7. The three price states (read, Coles failed, no price source)
were each rendered and read back; with no source, no dollar figure appears
anywhere, including the sheets. Reduced motion was previewed (the phone takes
the `rm` class; drains, fills and flights become cross-fades).

**Not seen:** his real list, Stash, rotation or recipes (all invented); any
real supermarket answer (none was fetched beyond reading the three sites'
public terms and Aldi's product listing page once); real Open Food Facts
coverage of his products; a real push on his phone; WebKit.

---

## 6 · Your calls

1. **Where prices come from.** (a) a narrow weekly read of Woolworths and
   Coles, against both chains' terms and blockable; (b) no supermarket reads,
   kinds and macros only, with link-outs; (c) (b) now and a chain's own feed
   when one exists. Either way, no price shows that Nova did not read that
   week.
2. **Aldi.** Yes: under (a), its listed prices join the comparison (no
   nutrition, so never "better on both"). No: dashed, named, with a link to
   look yourself.
3. **"Better on macros".** Yes: cheaper per kilo, at least as much protein,
   no more kJ per 100 g, all at once. No: he names the rule.
4. **An Order online group on the list.** Yes: Stash items keep link and
   picture in their own group (a list-format change). No: they join
   Household and other as plain lines.
5. **Where a restock rhythm lives.** Yes, the vault line (readable in
   Obsidian, a Stash-format change). No, `server/data` (the file stays as it
   is; lost with that data).
6. **Checks to Apple Reminders too.** Yes: they fire even while the Mac
   sleeps. No: push and Telegram only.
7. **Where Your meals sits.** Yes, above the list: one glance from the top,
   first line at 692 pt. No, below the last aisle: first line at about 540 pt
   (estimated), Recipes kept in the head.

---

## Sources

- ACCC, Supermarkets inquiry final report, February 2025: https://www.accc.gov.au/system/files/supermarkets-inquiry_1.pdf
- ACCC media release on the recommendations: https://www.accc.gov.au/media-release/accc-recommends-supermarket-reforms-to-provide-better-outcomes-for-consumers-and-suppliers
- Information Age, "Supermarkets should publish live prices: ACCC": https://ia.acs.org.au/article/2025/supermarkets-should-publish-live-prices--accc.html
- Peakhour, "Price Transparency Is Now a Data Access Problem" (18 May 2026): https://www.peakhour.io/blog/price-transparency-apis-grey-zone-automation/
- Coles website terms and conditions: https://www.coles.com.au/important-information/terms/website-terms-conditions
- Woolworths Group site terms: https://www.woolworthsgroup.com.au/au/en/privacy/policy-documents/terms-and-conditions.html
- Woolworths online terms (403 to my fetch): https://www.woolworths.com.au/shop/services/terms-and-conditions
- Aldi legal notice: https://www.aldi.com.au/legal-notice
- Aldi products: https://www.aldi.com.au/products
- Apify, Coles, Woolworths and Aldi scraper (method notes): https://apify.com/lergassy/au-grocery-scraper
- CW Scanner: https://www.cwscanner.site/
- WiseList: https://apps.apple.com/au/app/wiselist/id1454099261
- Pinch: https://pinch-app.com/
- Grocero, how Coles weekly specials work: https://grocero.com.au/blog/coles-weekly-specials/
