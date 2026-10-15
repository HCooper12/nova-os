import { useFlipList } from '../useFlipList.js';
import { searchKey } from './searchMotion.js';

// THE ONE HOOK EVERY SEARCH WEARS (15 Oct 2026, scene 10 of the motion set).
// `rootRef` is the element around the rows; each row carries
// `data-flip="<stable id>"` (the record's id, never its index). `ids` is the
// list as drawn, in order. `also` is anything else that re-lays the list (a
// filter chip): a change there plays the house FLIP, a change of query plays
// search → results. The choreography lives in useFlipList, so a list never
// has two FLIPs fighting over its rows.
export function useSearchMotion(rootRef, query, ids, { also = '', ...opts } = {}) {
  const q = searchKey(query);
  const key = Array.isArray(ids) ? ids.join('\u0001') : String(ids ?? '');
  useFlipList(rootRef, `${q}\u0002${key}\u0002${also}`, { ...opts, search: q });
}
