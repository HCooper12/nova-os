Fixtures for the price reader and rewards mail tests
(server/test/shopPrices.test.js, server/test/rewardsMail.test.js).

Each price file is shaped like the answer that chain's public search page
loads (Woolworths' search JSON, Coles' page with its `__NEXT_DATA__` block,
Aldi's product-search JSON), with INVENTED products and prices. Nothing here
was copied from a real page. The blocked pages imitate the generic shape of a
bot-check answer so the detector can be tested; no challenge was solved or
recorded.

The emails are written for these tests: invented offers, invented
addresses, no real message.
