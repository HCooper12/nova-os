// The Money page's glyphs (mockups 85 and 90), stroke icons on a 24 grid.
// A category's glyph always rides with its hue and its name, so colour is
// never the only signal.
const P = {
  plus: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
  down: <path d="m6 9.5 6 6 6-6" />,
  right: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  left: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  talk: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  dn: <path d="M12 5v14M6 13l6 6 6-6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  in: <><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M4 14v5h16v-5" /></>,
  cam: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  folder: <path d="M3 7h6l2 2h10v10H3z" />,
  file: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></>,
  share: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v8h14v-8" /></>,
  open: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  web: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 9h18" /></>,
  inbox: <><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  cloudx: <><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18z" /><path d="M4 4l16 16" /></>,
  note: <><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5M8 9h8M8 13h4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  back: <path d="M13 5.5 7 12l6 6.5M7 12h12" />,
  gro: <><path d="M3 5h2.5l2 10h10l2-7H7" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></>,
  eat: <><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M11 3v3" /></>,
  tra: <><rect x="5" y="4" width="14" height="13" rx="3" /><path d="M5 11h14M8 20l1-3M16 20l-1-3" /><circle cx="8.5" cy="14" r=".8" /><circle cx="15.5" cy="14" r=".8" /></>,
  sho: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  sub: <><path d="M17 3l3 3-3 3" /><path d="M4 12V9a3 3 0 0 1 3-3h13" /><path d="M7 21l-3-3 3-3" /><path d="M20 12v3a3 3 0 0 1-3 3H4" /></>,
  hea: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  uti: <path d="M13 3 6 13h5l-1 8 7-10h-5z" />,
  ent: <><path d="M4 10a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V6H4z" /><path d="M14 8v12" strokeDasharray="2 2" /></>,
  oth: <circle cx="12" cy="12" r="7" />,
  inc: <><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M4 14v5h16v-5" /></>,
};

export function MIcon({ n, className = 'nv-mo-ic', style }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {P[n] || P.oth}
    </svg>
  );
}
