import { TONE_LABEL } from './inboxSummaryFacts.js';

// The summary Inbox's marks (27 Sep 2026, design/mockups/60): one stroke
// family, drawn in currentColor, the paths the mockup drew. Shared by the
// screen, its two sheets and the Ops head, so a route wears the same mark on
// the card, in Filed, in Landed and in the report.

const P = {
  dumbbell: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
  book: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M12 8h5M12 12h5" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  practice: <><circle cx="8" cy="8" r="2" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" /><circle cx="16" cy="16" r="2" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></>,
  play: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  todo: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12 2.5 2.5 5-5.5" /></>,
  bag: <><path d="M5 7h14l-1.5 10h-11z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></>,
  books: <path d="M4 4h5v16H4zM10 4h5v16h-5zM16 5l4 1-3 14-4-1z" />,
  link: <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  q: <><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.5V14" /><path d="M12 17.5v.01" /></>,
  bang: <path d="M12 6v8M12 18v.01" />,
  fork: <><path d="M7 3.5v6.5M4.8 3.5v4a2.2 2.2 0 0 0 4.4 0v-4" /><path d="M7 10v10.5" /><path d="M16.6 3.5c-2 1.2-2.8 4-2.8 7h2.8Zm0 7v10" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-.9-1.5-1.3-2.5-1.3-1.5 0-2.6.8-2.6 2s1.2 1.6 2.6 1.9 2.6.8 2.6 2-1.1 2-2.6 2c-1 0-2-.4-2.5-1.3M12 6.5v1.7M12 15.8v1.7" /></>,
  steps: <path d="M3 19h6v-5h6V9h6" />,
  loop: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 21v-5h-5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkc: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5.5" /></>,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  right: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  down: <path d="m6 9.5 6 6 6-6" />,
  arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  talk: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  quote: <path d="M5 18v-4a6 6 0 0 1 4-5.6M5 14h4v4H5zM14 18v-4a6 6 0 0 1 4-5.6M14 14h4v4h-4z" />,
  into: <><path d="M4 12h11M11 7l5 5-5 5" /><path d="M20 4v16" /></>,
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
};

export function Ico({ name, className = 'nv-sum-ib-ico', style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{P[name] || P.doc}</svg>
  );
}

// A route's tile: its domain hue where the domain owns one, the vault ink
// otherwise, a dashed "?" for a route nothing names, red for an error.

export function Tile({ tile, tick = false, title }) {
  const t = tile || { tone: 'vault', glyph: 'doc' };
  const mark = (
    <span className={`nv-sum-ib-tile ${t.tone}`} title={title || TONE_LABEL[t.tone] || undefined} aria-hidden="true">
      <Ico name={t.glyph} className="nv-sum-ib-tico" />
    </span>
  );
  if (!tick) return mark;
  return (
    <span className="nv-sum-ib-tt" aria-hidden="true">
      {mark}
      <span className="nv-sum-ib-tick"><Ico name="check" className="nv-sum-ib-tico" /></span>
    </span>
  );
}
