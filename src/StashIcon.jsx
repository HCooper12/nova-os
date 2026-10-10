// THE STASH'S GLYPHS (mockups 88 and 90, SF-style, drawn): one stroke
// weight, round caps, a 24 grid. Shelf tiles, the menu, the bars.
const G = {
  skin: <path d="M12 3c3 5 6 8 6 11.5A6 6 0 016 14.5C6 11 9 8 12 3z" />,
  kit: <><path d="M5 9h12v6a4 4 0 01-4 4H9a4 4 0 01-4-4z" /><path d="M17 11h1.5a2 2 0 010 4H17M8 3v3M12 3v3" /></>,
  desk: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></>,
  read: <><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" /><path d="M12 6v14" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 016 0" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6 1 6-1.5S14 5 12 9z" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  leaf: <path d="M6 18c0-7 5-12 12-12 0 7-5 12-12 12zM6 18l6-6" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  move: <path d="M4 7h16M4 12h10M4 17h7M17 14l3 3-3 3" />,
  share: <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  sort: <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M6 12h12" />,
  left: <path d="M15 5l-7 7 7 7" />,
  more: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
  aa: <path d="M3 18l4.5-12L12 18M4.7 14h5.6M14 18l3-8 3 8M15 15.5h4" />,
  open: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  paste: <><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V3.5h6V5M9 11h6M9 15h4" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  book: <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11" />,
  price: <><path d="M3 12V4h8l10 10-8 8z" /><path d="M7 8h.01" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
};

export function SIcon({ n, className = 'nv-st-ic', style }) {
  return <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">{G[n] || G.tag}</svg>;
}

// a shelf's tile: its glyph, white, on a gradient of its hue
export function Tile({ glyph, hue, sm }) {
  return <span className={`nv-st-tile${sm ? ' sm' : ''}`} style={{ '--t': hue }} aria-hidden="true"><SIcon n={glyph} className="nv-st-tile-ic" /></span>;
}
