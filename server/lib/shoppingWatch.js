import { loadShoppingList } from './shoppingList.js';
import { readStale } from './shopPrices.js';
import { scanRewardsMail } from './rewardsMail.js';
import { ensureAllLogos } from './brandLogos.js';

// THE SHOPPING LOOP (10 Oct 2026). Every 30 minutes: read any rewards email
// the Mail rule saved (code first; docs/rewards-mail-rule.md), and, from 6am
// his time, queue today's price reads for the lines on his list that have no
// read today. The queue itself is the polite part (server/lib/shopPrices.js):
// one request at a time, a delay between, at most one read per product per
// chain per day, and a blocked chain left alone until tomorrow. A logo is
// read once and kept; one that failed is asked again a day later.

const READ_FROM_HOUR = 6;
const hourInMelbourne = (d = new Date()) => Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' }).format(d));

export async function shoppingTick(vaultPath, { now = new Date() } = {}) {
  const out = { mail: null, queued: 0 };
  try { out.mail = await scanRewardsMail(vaultPath, { now }); } catch (e) { console.error('rewards mail scan failed:', e.message); }
  if (hourInMelbourne(now) >= READ_FROM_HOUR) {
    try {
      const { items } = await loadShoppingList(vaultPath);
      out.queued = await readStale(items.filter((i) => !i.checked), { now });
    } catch (e) { console.error('price reads failed to queue:', e.message); }
  }
  return out;
}

export function startShoppingScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('shopping');
    await shoppingTick(vaultPath);
    // every tick asks; it is a no-op for a cached logo and for a miss less
    // than a day old, so a site that refused at boot is tried again tomorrow
    // (10 Oct 2026: Flybuys dropped the connection, Coles showed a bot check)
    ensureAllLogos().catch((e) => console.error('logos failed:', e.message));
  };
  setTimeout(tick, 90 * 1000); // after boot settles
  setInterval(tick, 30 * 60 * 1000);
}
