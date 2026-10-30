// THE WISHLIST'S DEMO (demoMode only, never shown with a connection). Its
// shape is GET /api/wishlist's, so the page draws demo and live through one
// model (src/wishlistModel.js). The things on it are invented examples, not
// his rows: a demo shows how the page behaves, it does not claim his list.
//
// DEV ONLY: ?wishlistDemo=notshared | connect | empty | loading | stale swaps
// the demo for the state that is hard to reach, so each can be looked at.

export function wishlistDemoVariant() {
  try {
    if (!import.meta.env?.DEV || typeof location === 'undefined') return 'demo';
    return new URLSearchParams(location.search).get('wishlistDemo') || 'demo';
  } catch { return 'demo'; }
}

const ago = (min, now) => new Date(now - min * 60000).toISOString();
let n = 0;
const row = (name, store, o = {}) => ({
  id: `demo-${++n}`, name, rawName: name, stars: 0, link: store ? `https://${store}/products/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : null,
  store: store || null, price: null, priority: 'Medium', status: 'Considering Purchase', categories: [], notes: null, addedOn: null, image: null, ...o,
});

export function demoWishlistState(variant = 'demo', now = Date.now()) {
  if (variant === 'loading') return null;
  n = 0;
  const base = {
    categories: ['Clothing', 'Shoes', 'Cologne', 'Technology', 'Books', 'Furniture', 'Posters'],
    sizes: { Shoes: ['US 10'], Pants: ['32 waist'] },
    lastSync: ago(2, now), syncing: false, shared: true, reason: null, error: null,
  };
  if (variant === 'notshared') return { ...base, items: [], lastSync: null, shared: false, reason: 'Share My Shopping Wishlist with the Nova connection in Notion' };
  if (variant === 'connect') return { ...base, items: [], lastSync: null, shared: false, reason: 'Connect Notion in Settings first' };
  if (variant === 'empty') return { ...base, items: [] };
  const items = [
    row('Waxed field jacket (navy)', 'example-outfitters.com', { stars: 1, priority: 'High', categories: ['Clothing'], demoArt: 'cy' }),
    row('Streaming box 4K', 'example-tech.com', { stars: 3, priority: 'High', categories: ['Technology'], demoArt: 'vi' }),
    row('Cedar and vetiver eau de parfum', 'example-chemist.com', { stars: 2, priority: 'High', categories: ['Cologne'], demoArt: 'gold' }),
    row('A field guide to long-term investing (book)', 'example-books.com', { stars: 1, priority: 'High', categories: ['Books'], demoArt: 'good' }),
    row('Wall cabinet (black)', 'example-living.com', { priority: 'Medium', categories: ['Furniture'], demoArt: 'ink' }),
    row('Citrus cologne', 'example-chemist.com', { priority: 'Low', categories: ['Cologne'], demoArt: 'gold' }),
    row('Leather low-top trainers', null, { stars: 2, priority: 'High', categories: ['Shoes'], demoArt: 'mg' }),
    row('Linen overshirt (olive)', 'example-outfitters.com', { priority: 'Medium', categories: ['Clothing'], notes: 'Medium if slim fit', demoArt: 'cy' }),
    row('Noise-cancelling earbuds', 'example-tech.com', { status: 'Purchased', price: 399, priority: null, categories: ['Technology'], demoArt: 'vi' }),
    row('Gallery print, 50 × 70', 'example-prints.com', { status: 'Purchased', priority: null, categories: ['Posters'], demoArt: 'mg' }),
    row('Amber cologne, 100 ml', 'example-chemist.com', { status: 'Purchased', priority: null, categories: ['Cologne'], demoArt: 'gold' }),
  ];
  if (variant === 'stale') return { ...base, items, lastSync: ago(60 * 26, now), error: 'Notion took too long to answer' };
  return { ...base, items };
}
