// The summary Fuel page's marks (mockup 59): one stroke family, drawn from
// the mockup's own symbols, shared by FuelSummary.jsx and RecipeSheet.jsx.
const PATHS = {
  fork: <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M16 3c-2 0-3 2-3 5v3h3v10M16 3v18" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  right: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  left: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  photo: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></>,
  code: <path d="M4 6v12M7.5 6v12M11 6v12M14 6v12M17 6v12M20 6v12" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  again: <><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L20 9.5M20 4.5v5h-5" /><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4 14.5M4 19.5v-5h5" /></>,
  book: <><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10.5" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  up: <path d="M12 19V6M5 12l7-7 7 7" />,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  cart: <><path d="M3 4h2.5l2.2 11h10.6l2-8H6.3" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  // a recipe that came from a reel (the recipe page, 29 Sep 2026)
  reel: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M10 8.8v6.4l5.2-3.2z" /></>,
};
export function FIcon({ n, className = '' }) {
  return <svg className={`nv-fs-ico ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{PATHS[n] || PATHS.right}</svg>;
}
