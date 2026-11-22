// The small printed pieces every Mentors surface shares: the icons (the
// mockup's own symbols) and the state token, a ticket with the state's colour,
// icon and word inside it, identical everywhere.

const PATHS = {
  's-done': <path d="M5 12.5l4.5 4.5L19 7.5" />,
  's-work': <path d="M12 4a8 8 0 1 1-7.4 5" />,
  's-wait': <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  's-pause': <path d="M9 6.5v11M15 6.5v11" />,
  's-need': <><path d="M12 6v7.5" /><path d="M12 17.5v.5" /></>,
  's-dim': <circle cx="12" cy="12" r="6.5" />,
  'i-back': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  'i-more': <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" />,
  'i-pause': <path d="M9 6.5v11M15 6.5v11" />,
  'i-again': <><path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" /><path d="M4.5 4.5v4h4" /></>,
  'i-play': <path d="M8 5.5v13l10.5-6.5Z" />,
  'i-x': <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
};

export function Ic({ n, className = 'i' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{PATHS[n]}</svg>
  );
}

export function St({ kind, word }) {
  return (
    <span className={`st ${kind}`}><i><Ic n={`s-${kind}`} /></i><b>{word}</b></span>
  );
}

