// Silhouette line icons for the Apple style — SF-Symbols-flavoured strokes,
// one per screen, drawn in currentColor so they inherit each tab's
// active/inactive colour. Command Core keeps its Roman numerals; these render
// only when the Apple style is on (valsChrome → appleStyle).
const PATHS = {
  mission: <><path d="M4 11.2 12 5l8 6.2" /><path d="M6.2 9.8V19h11.6V9.8" /></>,
  voice: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v2.5" /></>,
  galaxy: <><circle cx="12" cy="12" r="3.4" /><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-24 12 12)" /><circle cx="19.2" cy="7.4" r="1" fill="currentColor" stroke="none" /></>,
  code: <><path d="m8.5 8-4 4 4 4" /><path d="m15.5 8 4 4-4 4" /></>,
  inbox: <><path d="M4 5.5h16V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M4 12.5h4.6c.5 0 .8.3 1 .8.4 1 1.3 1.7 2.4 1.7s2-.7 2.4-1.7c.2-.5.5-.8 1-.8H20" /></>,
  recipes: <><path d="M7 3.5v6.5M4.8 3.5v4a2.2 2.2 0 0 0 4.4 0v-4" /><path d="M7 10v10.5" /><path d="M16.6 3.5c-2 1.2-2.8 4-2.8 7h2.8Zm0 7v10" /></>,
  shopping: <><path d="M6 8h12l-1 12H7Z" /><path d="M9 8V6.8a3 3 0 0 1 6 0V8" /></>,
  todos: <><rect x="4" y="4.5" width="15.5" height="15.5" rx="4" /><path d="m8.4 12.4 2.5 2.5 4.8-5" /></>,
  workouts: <><path d="M7.2 9v6M16.8 9v6" /><path d="M4 10.5v3M20 10.5v3" /><path d="M7.2 12h9.6" /></>,
  notes: <><path d="M6.5 3.8h8L18 7.3v12.9h-11.5Z" /><path d="M14 3.8v3.9h4" /><path d="M9 12h6M9 15.4h6" /></>,
  journal: <><path d="M5 5.2A1.7 1.7 0 0 1 6.7 3.5H18.5v15.3H6.7A1.7 1.7 0 0 0 5 20.5Z" /><path d="M5 18.8V5.2" /><path d="M9 8h6" /></>,
  money: <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.2v9.6M14.6 9a3 3 0 0 0-2.6-1.2c-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2.1c1.7.4 2.7 1 2.7 2.2s-1.2 2.1-2.7 2.1A3.1 3.1 0 0 1 9.3 15" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" /></>,
};

export function TabIcon({ name, size = 22, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block', flex: 'none', ...style }}>
      {PATHS[name] || PATHS.mission}
    </svg>
  );
}
