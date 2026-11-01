import { Interactive } from './Interactive.jsx';

// "ALSO FILE TO MY LIBRARY" (Projects phase 2, PROJECTS-PLAN §2, his note on
// Q31). A video watched for a project lands only in the project; when Nova's
// verdict says it would also belong in his library, the card carries this one
// light tick beside Nova's reason. Gold while it waits on his call (gold means
// "not yet decided"), good-green once it is in. Nothing reaches the library
// without the tap; the copy it makes has its own Undo in the Inbox.
// One view model field (valsInbox libraryFlagOf), drawn in the Inbox, the
// summary Inbox and the project page alike.
export function LibraryFlag({ flag, compact = false }) {
  if (!flag) return null;
  const done = !!flag.done;
  const tone = done ? 'var(--nv-good)' : 'var(--nv-gold)';
  return (
    <div className="nv-libflag" data-done={done ? '' : undefined} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '6px 10px', minWidth: 0, marginTop: compact ? '4px' : '8px' }}>
      <Interactive as="button" type="button" onClick={done || flag.busy ? undefined : flag.run}
        aria-pressed={done} aria-label={done ? `In your library: ${flag.where}` : 'Also file to my library'}
        base={{
          flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: done ? 'default' : 'pointer',
          padding: '5px 10px 5px 6px', borderRadius: '999px', minHeight: '30px', boxSizing: 'border-box',
          background: done ? 'color-mix(in srgb, var(--nv-good) 14%, transparent)' : 'transparent',
          border: `1px solid color-mix(in srgb, ${tone} ${done ? 30 : 55}%, transparent)`,
          color: tone, font: '600 12.5px var(--nv-font-ui)', opacity: flag.busy ? 0.6 : 1,
        }}
        hoverStyle={done ? {} : { background: 'color-mix(in srgb, var(--nv-gold) 12%, transparent)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
          <circle cx="12" cy="12" r="9" fill={done ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
          <path className="nv-libflag-tick" d="M7.8 12.4l2.8 2.8 5.6-6" fill="none" stroke={done ? "var(--nv-bg1)" : "currentColor"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" opacity={done ? 1 : 0.55} />
        </svg>
        {flag.busy ? 'Filing…' : done ? 'In your library' : 'Also file to my library'}
      </Interactive>
      <span style={{ flex: '1 1 160px', font: '400 12.5px/1.45 var(--nv-font-ui)', color: 'var(--nv-ink60)', minWidth: 0, overflowWrap: 'anywhere', paddingTop: '6px' }}>
        {done ? flag.where : flag.reason}
      </span>
    </div>
  );
}
