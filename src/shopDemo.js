// DEMO SHOPPING: demoMode only (NOVA-METHOD: demo content never leaves demo).
//
// The mockup's invented week, shaped exactly like the server's answers
// (GET /api/shopping-list, /api/shopping/prices, /api/shopping/offers), so
// the summary Shopping screen can be seen and photographed without his list.
// Every product, price, offer, points figure and date here is invented; the
// repo is public, and no offer here is a real current offer.
//
// THE WORST CASE (break-ui, his yes 9 Oct): in a DEV build only, the URL
// parameter ?shopDemo= picks a fixture: demo (the default), worst, empty,
// loading, offline, noprices, blocked, nooffers. A production build always
// shows the demo.

import { lineKey } from './shopPrice.js';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const at610 = () => { const d = new Date(); d.setHours(6, 10, 0, 0); return d.toISOString(); };

let seq = 0;
const it = (name, category, amount, source, extra = {}) => ({ id: `d${(seq += 1)}`, name, category, checked: false, qty: 1, amount: amount || null, source: source || null, ...extra });

function demoItems() {
  seq = 0;
  return [
    it('brown onion', 'Produce', '½', 'Weeknight chilli'),
    it('limes', 'Produce', '1', 'Weeknight chilli'),
    it('limes', 'Produce', '2', 'Chicken rice bowl'),
    it('avocados', 'Produce', '2', 'Chicken rice bowl'),
    it('baby spinach', 'Produce', '120g', 'Chicken rice bowl', { checked: true }),
    it('beef mince', 'Meat & Protein', '1kg', 'Weeknight chilli'),
    it('chicken thighs', 'Meat & Protein', '1kg', 'Chicken rice bowl'),
    it('Greek yoghurt', 'Dairy & Eggs', '1kg', 'Overnight oats', { checked: true }),
    it('eggs', 'Dairy & Eggs', '12', null),
    it('kidney beans', 'Pantry & Seasonings', '2 x 400g', 'Weeknight chilli'),
    it('jasmine rice', 'Pantry & Seasonings', '1kg', 'Chicken rice bowl'),
    it('smoked paprika', 'Pantry & Seasonings', '1 tsp', 'Weeknight chilli'),
    it('frozen peas', 'Frozen', '1kg', null),
    it('sourdough loaf', 'Bakery', null, null, { checked: true }),
    it('sparkling water', 'Beverages', '6', null),
    it('dish sponges', 'Household & Other', null, null),
    it('bin liners', 'Household & Other', null, null),
  ];
}

const pr = (chain, name, size, price, extra = {}) => ({ chain, id: `${chain}-${name}`.replace(/\W+/g, '-').toLowerCase(), name, size, price, unitPrice: null, was: null, special: null, url: null, available: true, ...extra });
// [line key, products]
const PRODUCTS = [
  ['brown onion', [pr('w', 'Woolworths Brown Onions Each', 'each', 0.8), pr('w', 'Woolworths Brown Onions Bag about 5', '1kg', 2.2, { was: 2.9, special: 'Special' }), pr('c', 'Coles Loose Brown Onions', 'each', 0.85), pr('c', 'Coles Brown Onions Bag about 5', '1kg', 2.4), pr('a', 'Brown Onions Bag about 10', '2kg', 3.49)]],
  ['lime', [pr('w', 'Woolworths Limes Each', 'each', 0.75), pr('w', 'Woolworths Limes Bag about 6', '500g', 4.0), pr('c', 'Coles Limes Loose', 'each', 0.7), pr('a', 'Limes Bag about 5', '400g', 2.99)]],
  ['avocado', [pr('w', 'Woolworths Avocado Each', 'each', 1.9), pr('w', 'Woolworths Avocados Bag 4 pack', '4 pack', 3.6), pr('c', 'Coles Avocado Each', 'each', 2.1), pr('a', 'Avocados Bag 4 pack', '4 pack', 3.99)]],
  ['baby spinach', [pr('w', 'Woolworths Baby Spinach', '120g', 3.0), pr('w', 'Woolworths Baby Spinach', '280g', 4.5), pr('c', 'Coles Baby Spinach', '120g', 3.2), pr('a', 'Baby Spinach', '150g', 3.29)]],
  ['beef mince', [pr('w', 'Woolworths Lean Beef Mince 5% Fat', '1kg', 13.0), pr('c', 'Coles Lean Beef Mince 4% Fat', '1kg', 12.0)]],
  ['chicken thigh', [pr('w', 'Woolworths Chicken Thigh Fillets', '1kg', 15.0), pr('w', 'Woolworths Chicken Thigh Fillets', '500g', 8.5), pr('c', 'Coles Chicken Thigh Fillets', '1kg', 14.0), pr('a', 'Market Farm Chicken Thigh Fillets', '1kg', 11.99)]],
  ['greek yoghurt', [pr('w', 'Woolworths Greek Yoghurt Plain', '1kg', 6.5), pr('c', 'Coles Greek Yoghurt Plain', '1kg', 6.0), pr('a', 'Greek Yoghurt Plain', '1kg', 4.79)]],
  ['egg', [pr('w', 'Woolworths Free Range Eggs 12 Pack', '700g', 7.2), pr('w', 'Woolworths Free Range Eggs 6 Pack', '350g', 4.0), pr('c', 'Coles Free Range Eggs 12 Pack', '700g', 7.5), pr('a', 'Free Range Eggs 12 Pack', '700g', 5.69)]],
  ['kidney bean', [pr('w', 'Woolworths Red Kidney Beans', '400g', 1.2), pr('c', 'Coles Red Kidney Beans', '400g', 1.1), pr('c', 'Coles Kidney Beans 3 x 400g', '3 x 400g', 3.0), pr('a', 'Red Kidney Beans', '400g', 0.89)]],
  ['jasmine rice', [pr('w', 'Woolworths Jasmine Rice', '1kg', 2.6), pr('w', 'Woolworths Jasmine Rice', '5kg', 11.0), pr('c', 'Coles Jasmine Rice', '1kg', 2.8), pr('a', 'Jasmine Rice', '1kg', 2.69)]],
  ['frozen pea', [pr('w', 'Woolworths Frozen Garden Peas', '1kg', 2.8), pr('c', 'Coles Frozen Garden Peas', '1kg', 3.0), pr('a', 'Frozen Garden Peas', '1kg', 2.99)]],
  ['sparkling water', [pr('w', 'Woolworths Sparkling Water', '1.25L', 1.15), pr('w', 'Woolworths Sparkling Water 4 Pack', '4 x 1.25L', 2.8), pr('c', 'Coles Sparkling Water', '1.25L', 1.0)]],
  ['dish sponge', [pr('w', 'Woolworths Dish Sponges 5 Pack', '5 pack', 3.5), pr('c', 'Coles Dish Sponges 5 Pack', '5 pack', 3.5)]],
  ['bin liner', [pr('w', 'Woolworths Bin Liners Kitchen 30 Pack', '30 pack', 3.8), pr('c', 'Coles Bin Liners Kitchen 30 Pack', '30 pack', 4.0)]],
];

function demoPrices(items, { blocked = null } = {}) {
  const at = at610();
  const reads = {};
  const keys = new Set(items.map((i) => lineKey(i.name)));
  for (const [key, products] of PRODUCTS) {
    if (!keys.has(key)) continue;
    reads[key] = {};
    for (const ch of ['w', 'c', 'a']) {
      const ps = products.filter((p) => p.chain === ch);
      if (blocked === ch) { reads[key][ch] = { at, day: ymd(new Date()), status: 'blocked', detail: 'a bot check', products: [] }; continue; }
      reads[key][ch] = { at, day: ymd(new Date()), status: ps.length ? 'ok' : 'none', products: ps };
    }
  }
  // smoked paprika: read, nothing matched
  if (keys.has('smoked paprika')) reads['smoked paprika'] = { w: { at, day: ymd(new Date()), status: 'none', products: [] } };
  const chains = { w: { state: 'ok', lastAt: at }, c: { state: 'ok', lastAt: at }, a: { state: 'ok', lastAt: at } };
  if (blocked) chains[blocked] = { state: 'blocked', since: at, lastAt: at, detail: 'a bot check' };
  return { chains, reads, pending: 0, today: ymd(new Date()) };
}

const off = (id, programme, kind, on, fig, days, activate, extra = {}) => ({
  id, programme, shop: programme === 'er' ? 'w' : 'c', kind, on,
  mult: fig.mult || null, pts: fig.pts || null,
  ends: ymd(plusDays(days)), daysLeft: days, activate, activated: false, dismissed: false,
  source: 'mail', via: 'code', mailDate: plusDays(-3).toISOString(), readAt: plusDays(-3).toISOString(),
  cond: extra.cond || '', ...extra,
});
function demoOffers() {
  return {
    offers: [
      off('g1', 'er', 'gift', 'food delivery gift cards', { mult: 20 }, 3, false, { cond: 'In store only, up to five cards a day.' }),
      off('o1', 'er', 'line', 'chicken thigh fillets 1kg', { pts: 1000 }, 10, true, { cond: 'Buy one 1 kg pack.' }),
      off('o2', 'fb', 'line', 'frozen peas and vegetables', { mult: 10 }, 3, true, { cond: 'Any frozen vegetables, 10 points a dollar.' }),
    ],
    ended: [],
    source: { dir: 'Inbox/Rewards Mail', dirExists: true, files: 6, lastAt: plusDays(-3).toISOString(), setUp: true },
  };
}

function demoRotation() {
  return {
    order: ['breakfast', 'lunch', 'dinner', 'extra'],
    labels: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', extra: 'Dinner, Sunday' },
    slots: {
      breakfast: { id: 'demo-oats', name: 'Overnight oats' },
      lunch: { id: 'demo-bowl', name: 'Chicken rice bowl' },
      dinner: { id: 'demo-chilli', name: 'Weeknight chilli' },
      extra: { id: 'demo-stew', name: 'Beef and onion stew' },
    },
  };
}
function demoRecipes() {
  return [
    { id: 'demo-oats', name: 'Overnight oats', ingredients: ['500g rolled oats', '1kg Greek yoghurt', '500g frozen berries'] },
    { id: 'demo-bowl', name: 'Chicken rice bowl', ingredients: ['1kg chicken thighs', '1kg jasmine rice', '2 avocados', '2 limes', '120g baby spinach'] },
    { id: 'demo-chilli', name: 'Weeknight chilli', ingredients: ['1kg beef mince', '2 x 400g kidney beans', '½ brown onion', '1 tsp smoked paprika', '2 x 400g diced tomatoes'] },
    { id: 'demo-stew', name: 'Beef and onion stew', ingredients: ['2 brown onions', '800g stewing beef', '3 carrots'] },
  ];
}

// THE WORST CASE: sixty lines, a 70-character name, a $0.00 read, Coles
// blocked, an offer with no end date (never shown), fifteen offers at once.
function worstState() {
  const items = demoItems();
  items[0].name = 'Woolworths Macro Organic Australian Grown Brown Onions Prepacked Bag 1kg';
  const extra = ['carrots', 'capsicum', 'zucchini', 'broccoli', 'cucumber', 'mushrooms', 'celery', 'cauliflower', 'garlic', 'ginger', 'lemons', 'oranges', 'bananas', 'apples', 'strawberries', 'blueberries', 'tomatoes', 'potatoes', 'sweet potato', 'pumpkin', 'salmon fillets', 'pork chops', 'bacon', 'ham', 'milk', 'butter', 'cheddar cheese', 'feta', 'cream', 'rolled oats', 'pasta', 'flour', 'sugar', 'olive oil', 'soy sauce', 'honey', 'peanut butter', 'tinned tomatoes', 'chickpeas', 'tuna', 'coffee beans', 'tea bags', 'orange juice', 'frozen berries', 'ice cream', 'wraps', 'bagels', 'toilet paper', 'dishwasher tablets', 'laundry liquid', 'toothpaste', 'shampoo', 'batteries', 'foil'];
  const cats = (n) => (/carrot|capsicum|zucchini|broccoli|cucumber|mushroom|celery|cauliflower|garlic|ginger|lemon|orange$|banana|apple|berr|tomatoes$|potato|pumpkin/.test(n) ? 'Produce' : /salmon|pork|bacon|ham/.test(n) ? 'Meat & Protein' : /milk|butter|cheese|feta|cream$/.test(n) ? 'Dairy & Eggs' : /frozen|ice cream/.test(n) ? 'Frozen' : /wraps|bagels/.test(n) ? 'Bakery' : /coffee|tea|juice/.test(n) ? 'Beverages' : /paper|tablets|laundry|toothpaste|shampoo|batteries|foil/.test(n) ? 'Household & Other' : 'Pantry & Seasonings');
  for (const n of extra) { if (items.length >= 60) break; items.push(it(n, cats(n), null, null)); }
  const prices = demoPrices(items, { blocked: 'c' });
  // a $0.00 read: the reader drops it, and so does the pick
  if (prices.reads['egg']?.w) prices.reads['egg'].w.products = [pr('w', 'Woolworths Free Range Eggs 12 Pack', '700g', 0)];
  prices.reads[lineKey(items[0].name)] = { w: { at: at610(), day: ymd(new Date()), status: 'ok', products: [pr('w', 'Woolworths Macro Organic Australian Grown Brown Onions Prepacked Bag 1kg', '1kg', 1234.5)] } };
  const offers = demoOffers();
  const names = ['chicken thigh fillets 1kg', 'frozen peas', 'salmon fillets', 'rolled oats', 'pasta', 'olive oil', 'coffee beans', 'tea bags', 'butter', 'milk', 'feta', 'bacon', 'honey'];
  offers.offers = [
    off('w0', 'er', 'gift', 'Ultimate, Uber, Google Play and selected restaurant gift cards at Woolworths Metro', { mult: 20 }, 0, false),
    off('w00', 'fb', 'line', 'an offer with no end date, which code refuses', { pts: 500 }, 5, true, { ends: null }),
    ...names.map((n, i) => off(`w${i + 1}`, i % 2 ? 'fb' : 'er', 'line', n, i % 3 ? { pts: [200, 1000, 12500, 3000][i % 4] } : { mult: [2, 5, 10, 20][i % 4] }, (i % 9) + 1, i % 2 === 0)),
    off('w99', 'er', 'shop', 'a shop of $50 or more', { pts: 2000 }, 6, true),
  ];
  return { items, prices, offers };
}

export function demoShopState(variant = 'demo') {
  if (variant === 'worst') return worstState();
  if (variant === 'empty') return { items: [], prices: demoPrices([]), offers: { offers: [], ended: [], source: { setUp: true } } };
  if (variant === 'loading') return { items: null };
  if (variant === 'offline') { const items = demoItems(); return { items, prices: demoPrices(items), offers: demoOffers(), offline: true }; }
  const items = demoItems();
  if (variant === 'noprices') return { items, prices: null, offers: demoOffers() };
  if (variant === 'blocked') return { items, prices: demoPrices(items, { blocked: 'c' }), offers: demoOffers() };
  if (variant === 'nooffers') return { items, prices: demoPrices(items), offers: { offers: [], ended: [], source: { dir: 'Inbox/Rewards Mail', dirExists: false, files: 0, setUp: false } } };
  return { items, prices: demoPrices(items), offers: demoOffers() };
}
export const demoShopRotation = demoRotation;
export const demoShopRecipes = demoRecipes;

// the fixture the URL asks for, in a DEV build only
export function shopDemoVariant() {
  try {
    if (!import.meta.env?.DEV) return 'demo';
    const v = new URLSearchParams(window.location.search).get('shopDemo');
    return ['demo', 'worst', 'empty', 'loading', 'offline', 'noprices', 'blocked', 'nooffers'].includes(v) ? v : 'demo';
  } catch { return 'demo'; }
}

// the Wednesday turn, acted out in demo: offers ending within three days end
export function demoTurn(state) {
  const offers = state.offers?.offers || [];
  const ending = offers.filter((o) => o.daysLeft <= 3);
  if (!ending.length) return null;
  return {
    ...state,
    offers: {
      ...state.offers,
      offers: offers.filter((o) => o.daysLeft > 3).map((o) => ({ ...o, daysLeft: o.daysLeft - 4 })),
      ended: ending.map((o) => ({ ...o, daysLeft: -1 })),
    },
  };
}
