# 14 · Shopping, round 4: points offers research, 10 Oct 2026

The research behind `design/mockups/91-redesign-shopping-r4.html`. Round 3 is
`88-redesign-shopping-r3.html`; the price research it rests on is
`14-shopping-stash-r2-research.md` (no approved price feed; Woolworths' and
Coles' terms forbid automated reading).

His words, 10 Oct 2026: "I'd also love it to be capable of informing me even
everyday rewards and flybys have specific deals on so I can maximise my bonus
points being earned without me needing to check it myself. Such as if there's
extra points or rewards buying certain products, if there's one of be 20x
points for buying gift cards, etc."

Nothing here was read from his accounts. No supermarket or loyalty endpoint
was called; I read public help, terms and deals pages through search, and one
public RSS feed each from FreePoints and Gift Card Database (third-party
sites). Every offer in the mockup is invented.

---

## 1 · The offers that exist

There are two kinds, and they reach anyone by different doors. That split
decides everything Nova can do.

### Open to every member: gift-card weeks and catalogue bonus points

- **Gift-card multipliers.** Both chains run them nearly every week: 10x or
  20x points per dollar on selected gift cards, in store, usually five cards a
  day per member, sometimes with a points cap per account. Recent examples
  reported by FreePoints and Point Hacks: Coles 20x on Google Play, Uber and
  IKEA cards (7 to 13 Oct 2026); Woolworths 20x on Ultimate cards (14 to 20 Oct
  2026); Woolworths 10x on Visa cards with a $5.95 fee (7 to 13 Oct). These are
  third-party reports, not read from the chains; I quote them as evidence of
  the pattern, and none of them appears in the mockup.
- **No activation.** FreePoints' write-ups say the gift-card offers are "open
  to all" members with no activation, and for Coles that "this promotion won't
  be advertised in the Flybuys app, only in the Coles catalogue and on in-store
  posters". So the gift-card weeks are exactly the offers he would miss by
  checking only the apps.
- **Timing.** They follow the catalogue week, Wednesday to Tuesday, and are
  known before they start: FreePoints posted the 14 Oct Woolworths offer on
  Fri 9 Oct.
- **Value.** At the base rate of 1 point a dollar, 20x on a $100 card is 2,000
  points. Both programmes redeem 2,000 points for $10 off, so 20x is about 10%
  back, worth having only on a card he would spend anyway. (Converting to
  Qantas points values them differently; the mockup values at the $10 rate.)
- **Catalogue bonus-point items** (extra points on a named product) are
  reported in community threads for both chains. I did not confirm one against
  a catalogue this session.
- **Where they are printed.** `coles.com.au/catalogues` loads its catalogue by
  script and asks for a location; `woolworths.com.au/shop/catalogue` answered
  403 to my fetch. Both catalogues are also hosted by Salefinder, which lists
  products with prices; its Coles listing showed no points markings. So there
  is no clean, structured public source for these from the chains themselves.

### Personalised to him: boosts and Flybuys offers

- **Everyday Rewards boosts** are "targeted offers based on your purchase
  history" that "change frequently" (Point Hacks). They are activated in the
  app ("For You", then Boost, or Boost all), and the advice is to boost at
  least two hours before shopping. Statuses run Boost, Boosted, Completed,
  Pending, Ended.
- **The terms** (Woolworths NZ's Basket Boost terms, the only boost terms I
  could read in full; the Australian ones answered 403): boosts are
  "personalised offers" that "are communicated ... via email and/or via the
  Everyday Rewards website or mobile app" (cl. 4); the member "needs to 'hit
  the Boost button' to activate" (cl. 6); they are "personalised for each
  individual" member (cl. 14) and "cannot be shared with another person
  whether by forwarding the email or otherwise" (cl. 15). The Australian
  programme works the same way in every guide I read, but that clause wording
  is NZ's.
- **Flybuys offers** are personalised too, found "in the Flybuys app, on the
  website or in emails", and you must "hit 'Activate now' on every offer
  before you shop". The Coles app also shows them once Flybuys is linked
  ("Your offers"). Typical: 5x on a shop, 10,000 points for four weeks of a
  spend target, multipliers on a brand.
- **So:** a personalised offer lives in his account, arrives in his email, and
  only pays once he presses a button in an app. Two members get different
  offers.

---

## 2 · What is public and what is account-only

| Offer | Who gets it | Activation | Where it is published |
| --- | --- | --- | --- |
| Gift-card 10x / 20x | Every member | Usually none | Catalogue, in-store posters; Coles' not in the Flybuys app |
| Catalogue bonus-point item | Every member | Usually none | Catalogue |
| Everyday Rewards boost | Him only | Boost in app or site, ahead of shopping | App, site, his email |
| Flybuys offer | Him only | Activate in app, site or Coles app | App, site, his email |
| Points balance, what is activated | Him only | n/a | Inside his account |

---

## 3 · Every honest channel, checked

**What Nova has today** (read from the code, 10 Oct):
- `POST /api/inbox/capture` (text up to 4,000 characters) and its spoken
  sibling `/inbox/capture/sync` (`server/routes/inbox.js`), fed by the **Send to
  Nova** share-sheet Shortcut, which accepts text, URLs and Safari pages
  (`docs/iphone-shortcuts.md`). No image.
- Telegram (`server/lib/telegram.js`): text is answered, voice notes are
  transcribed, and a **photo is read as food** (`foodRecordFromScan`). A
  screenshot of an offer sent there today would be scanned as a meal.
- Chat attachments (`server/lib/attachments.js`) let him show Nova a
  screenshot in a conversation, read by a model, nothing stored as an offer.
- **No mail path.** A grep of `server/lib` and `server/routes` for mail finds
  only the `mailto:` in `push.js` and an "email" keyword in `todos.js`. Nova
  cannot read any email today.
- The chain-PDF lane from Pick it up (`server/lib/eatOutSources.js`, memory
  `nova-pick-it-up`) shows Nova can read a PDF into rows and validate them by
  code. It reads nutrition PDFs the chains publish for download; I found no
  downloadable catalogue PDF from either chain.

**The channels:**

1. **His emails (clean).** Everyday Rewards and Flybuys both send offers by
   email. A Mail rule on his Mac (Mail would need his Outlook account) could
   save messages from those senders to a folder Nova watches. Nova never holds
   a password and never signs in. A model reads the email into an offer
   record; code checks every field. Two cautions: Nova must never follow the
   email's Boost or Activate links (that would act on his account), and the NZ
   clause against sharing "by forwarding the email" is about another person;
   Nova is his own tool on his own Mac, but the Australian wording is unread.
   If he subscribes to a points-deals newsletter (FreePoints, Point Hacks), the
   same rule catches the gift-card weeks too, still without Nova reading any
   site.
2. **Screenshots he shares (clean, manual).** iOS gives a Shortcut no access
   to another app's notifications, so "Nova reads the notification" is not
   possible. He can screenshot For You or Your offers and share it. That needs
   Send to Nova to accept an image, and a route that reads it as an offer.
3. **A public points-deals feed (grey).** FreePoints publishes an RSS feed
   (`freepoints.com.au/feed/`) whose items carry categories (Woolworths,
   Coles, Gift Cards, Expired) and the offer dates in the description ("14 Oct
   to 20 Oct 2026"); Gift Card Database has one too. Its robots.txt disallows
   only `/wp-admin/`. But FreePoints' terms forbid using "any automated
   systems or software to access, extract, or download data or content from
   this website for any purpose". Publishing a feed and forbidding automated
   reading sit side by side; it is a third party's summary, not the chain's
   word; and it carries only the public offers, never his personalised ones.
4. **The chains' catalogues (against their terms).** The same terms that close
   the price question close this: Woolworths' site terms forbid "any robot,
   spider, site search and retrieval application"; Coles' forbid copying any
   part "by any means" (both quoted in the round 2 research).
5. **Official APIs: none.** Neither programme offers a public API. Woolworths
   NZ runs its loyalty APIs on Apigee for partners, not the public; community
   projects on GitHub reverse-engineer the apps, which means signing in with a
   member's credentials. The Consumer Data Right does not cover supermarkets or
   loyalty programmes; designating them is a proposal (PocketSmith, 2026), not
   law.

**Never:** signing in to Everyday Rewards, Flybuys or either app with his
credentials, reading anything behind a login, or pressing Boost or Activate.
That is his rule for this work and it matches both programmes' design: an
offer is his to accept.

---

## 4 · The recommendation

**What Nova can do today:** nothing automatic. He can show a screenshot of
an offer in a chat and ask about it, and nothing is kept.

**What needs him to pass something on (recommended, call 1 (a)):**
- a Mail rule on his Mac for Everyday Rewards and Flybuys emails (and, if he
  wants the gift-card weeks reliably, a points-deals newsletter);
- an image door on Send to Nova for app screenshots;
- an offers record in `server/data` (operational, rebuilt from what arrives,
  each offer expiring within weeks): programme, shop, what it is on, points or
  multiplier, end date, activation needed, source, when read. A model may read
  an email or screenshot into it; code validates every field, values points at
  2,000 for $10, matches against the list, and drops the offer the morning
  after it ends. An offer missing a field is not shown.

**What his calls add:** a weekly read of FreePoints' feed for the gift-card
weeks (b), against its terms; or the catalogues (c), against the chains'.

**What is impossible:** reading his personalised boosts or offers from his
account, activating them, knowing whether he activated one, knowing his
balance, and reading the apps' notifications. The design says "activate in
the app", opens it, and takes his word when he ticks "I activated it",
labelled as his word.

**Two small extras the matching needs:** a bought log (a dated record of each
tick) so "something you buy often" is real, and merchant names from Money's
bank lines so a gift-card week shows only for a brand he spends at. Both are
his calls (5 and 6).

---

## 5 · What round 4 draws, and what was checked

- **Points this week**, under the basket, present only when an offer matches
  (a list line, a bought-often item, or a gift-card brand he spends at). The
  gift-card week is its own callout drawn as a card; the rest are cards in a
  rail. Each shows points or multiplier, its dollar worth, days left, source
  and date, and "Activate in app" or "No activation". A matched line carries a
  violet points capsule; its price sheet says what the points change ("with
  the points, Woolworths comes in $1.99 under Aldi") while the cell stays cash.
- **Sheets:** an offer sheet (activation box, worth, match, end date, source),
  a gift-card sheet, and "Where offers come from" from the ⋯ menu.
- **States:** matched, none match (no section), not set up (no section), and
  the Wednesday turn (three offers fold away; one line says so; Undo).
- **Type:** item name 18 pt semibold, full ink, −0.014em; the line under 13 pt
  regular at 50% ink, its amount 500 at 74%; price 16 pt so the name leads.
  Ticked names drop to regular.
- **Further refinements, each drawn once:** the large title folds into a
  material bar on scroll; rows highlight on touch down; the ring and the
  points total count up on arrival; violet means points and nothing else.

Checked once at 390×844 (chrome-devtools, mobile, touch, 3×, isolated
context, through a file:// wrapper; page closed after): page `scrollWidth`
390; no control under 44 pt in the list or either offer sheet (the aisle chips
are 36 pt drawn with a 44 pt hit area, as in round 3); no console messages
after playing every new moment, the three offer states, the Stash, light
appearance and reduced motion. First line at 998 pt with Points this week
above it (your call 3). Not seen: WebKit, his phone, any real offer.

---

## 6 · Your calls (the mockup's list, in short)

1. Where offers come from: (a) only what he passes on (recommended), (b) plus
   FreePoints' feed, (c) plus the catalogues.
2. Where prices come from (still open from round 3).
3. Points this week above the list (drawn) or under the last aisle.
4. Whether points change the cheapest pick (drawn: no, said in words).
5. A bought log, for "you buy it often".
6. Gift-card weeks matched to his bank spending.
7. Round 3's other calls stand.

---

## Sources

- Point Hacks, Everyday Rewards app guide: https://www.pointhacks.com.au/everyday-rewards/app/
- Point Hacks, this week's gift card offers: https://www.pointhacks.com.au/weekly-gift-card-offers/
- Point Hacks terms: https://www.pointhacks.com.au/terms-conditions/
- FreePoints, 20x Flybuys points on gift cards at Coles (14 to 20 Oct 2026): https://freepoints.com.au/coles-14-oct-2026/
- FreePoints, 20x Everyday Rewards points on Ultimate gift cards (14 to 20 Oct 2026): https://freepoints.com.au/woolworths-14-oct-2026/
- FreePoints, 20x Flybuys points on Uber, IKEA and Google Play gift cards: https://freepoints.com.au/coles-7-oct-2026/
- FreePoints RSS feed: https://freepoints.com.au/feed/
- FreePoints terms: https://freepoints.com.au/terms/
- Gift Card Database: https://gcdb.com.au/
- Woolworths NZ, Basket Boost offer terms (PDF): https://assets.ctfassets.net/28bohp801cze/42nGSjXcDUIaZr47yZ9RqB/2a1a87b3b934dd417adb81aa6700878a/edr-boost-offer-rewards-multiplier-terms-conditions.pdf
- Everyday Rewards terms (403 to my fetch): https://www.everyday.com.au/terms.html
- Everyday Rewards app terms (403 to my fetch): https://cdn0.woolworths.media/content/content/everyday-rewards-app-terms-and-conditions.pdf
- Flybuys, how to activate offers (403 to my fetch): https://help.flybuys.com.au/hc/en-gb/articles/9103595175695-How-do-I-activate-my-offers
- Flybuys and Coles: https://experience.flybuys.com.au/partners/coles/
- Point Hacks, Flybuys guide: https://www.pointhacks.com.au/flybuys/
- OzBargain, Flybuys offer activation threads: https://www.ozbargain.com.au/node/954993
- Coles catalogues: https://www.coles.com.au/catalogues
- Woolworths catalogue (403 to my fetch): https://www.woolworths.com.au/shop/catalogue
- Salefinder, Coles catalogue: https://salefinder.com.au/coles-catalogue
- Google Cloud community, Woolworths NZ loyalty APIs on Apigee: https://www.googlecloudcommunity.com/gc/Cloud-Product-Articles/Woolworths-New-Zealand-Enhances-Loyalty-Program-and-API/ta-p/841071
- PocketSmith, Consumer Data Right at the checkout: https://www.pocketsmith.com/blog/happy-sixth-birthday-to-the-consumer-data-right-now-point-it-at-the-checkout/
- Round 2 price research (chain terms quoted): design/audits/redesign-2026-09/14-shopping-stash-r2-research.md
