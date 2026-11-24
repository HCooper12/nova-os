import { useArt, thumbSrc } from './art.js';

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
  // News (slice 2): the mockup's own symbols
  'i-undo': <><path d="M9 7.5 4.5 12 9 16.5" /><path d="M4.5 12H14a5.5 5.5 0 0 1 0 11h-2" transform="translate(0 -5.5)" /></>,
  'i-search': <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5" /></>,
  'i-chev': <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  'i-text': <path d="M5 6.5h14M5 10.5h14M5 14.5h9M5 18.5h11" />,
  'i-listen': <><path d="M4.5 15v-2.5a7.5 7.5 0 0 1 15 0V15" /><rect x="4" y="14" width="4" height="6" rx="1.6" /><rect x="16" y="14" width="4" height="6" rx="1.6" /></>,
  'i-pen': <><path d="M15.5 5.5l3 3L9 18l-4 1 1-4Z" /><path d="M13.5 7.5l3 3" /></>,
  'i-mic': <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v2.5" /></>,
  'i-brief': <><path d="M9 6.5h10M9 12h10M9 17.5h10" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.6" /></>,
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


export function Thumb({ vid, hi, className, style }) {
  const url = useArt(thumbSrc(vid, hi));
  if (!url) return <span className={className} style={{ display: 'block', background: 'var(--nv-m-a)', ...style }} />;
  return <img className={className} src={url} alt="" style={style} />;
}
