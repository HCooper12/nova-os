import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { TabIcon } from '../TabIcon.jsx';
import { RepertoireBook } from '../RepertoireBook.jsx';
import { Eyebrow, Chevron } from '../Controls.jsx';

// THE INDEX (P3, 26 Sep 2026 — design/HOME-REDESIGN-PLAN.md §1.3, §5; mockup
// 56's Index, which he called "awesome"). Under the `summary` style the More
// tab opens this: the iOS Settings shape in the summary Home's own material —
// the date and Nova, a large title, the "you" card, then every place in Nova
// in four groups, each row a tile in its domain's hue, its name, and a live
// value where an honest one exists (src/vals/valsIndex.js reads them; nothing
// here computes one). Search at the foot opens the conversation, which is
// Nova's front door — there is no second search engine behind it.
//
// Every screen has a row (server/test/indexRows.test.js holds that), so
// nothing Home leaves out is ever more than two taps away. Wears the same
// frame MissionSummary draws: the nav row, the 34px title, .nv-sum-card,
// .nv-sum-rise on stable keys so the entrance runs once and never restarts.

const UI = 'var(--nv-font-ui)';

// Marks for the rows that have no tab of their own, drawn in TabIcon's own
// stroke so the column reads as one family. Practice is the Home card's four
// lamps; Review a page coming round again; Technique the drill's target;
// Briefing a page that plays; Console an instrument; Ambient Nova on a wall.
const ROW_MARKS = {
  practice: <><circle cx="8" cy="8" r="2.2" /><circle cx="16" cy="8" r="2.2" /><circle cx="8" cy="16" r="2.2" /><circle cx="16" cy="16" r="2.2" /></>,
  leader: <><path d="M9.2 18h5.6M10.2 21h3.6" /><path d="M12 3.2a6 6 0 0 0-3.9 10.6c.7.6 1 1.3 1 2.4h5.8c0-1.1.3-1.8 1-2.4A6 6 0 0 0 12 3.2Z" /></>,
  review: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.8 4.2v3.6h-3.6" /><path d="M9.3 10.6h5.4M9.3 13.6h3.6" /></>,
  technique: <><circle cx="12" cy="12" r="8" /><path d="M12 4v3.6M12 16.4V20M4 12h3.6M16.4 12H20" /></>,
  library: <><path d="M4.5 4.5h4.4v15H4.5Z" /><path d="M10.6 4.5H15v15h-4.4Z" /><path d="m16.4 5.8 3.5.9-3.1 13.2-3.5-.9Z" /></>,
  briefing: <><path d="M6.5 3.8h8L18 7.3v12.9h-11.5Z" /><path d="M14 3.8v3.9h4" /><path d="m10.5 11.4 3.9 2.4-3.9 2.4Z" /></>,
  console: <><path d="M4.6 17a8 8 0 1 1 14.8 0" /><path d="m12 14 3.2-3.6" /><path d="M4.5 20h15" /></>,
  ambient: <><rect x="3.5" y="4.5" width="17" height="12" rx="2.2" /><circle cx="12" cy="10.5" r="2.4" /><path d="M9.5 20h5" /></>,
};

function RowMark({ k }) {
  const own = ROW_MARKS[k];
  if (!own) return <TabIcon name={k} size={20} />;
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      {own}
    </svg>
  );
}

// A list row presses the way an iOS one does: a tint under the finger. Given an
// activeStyle, Interactive drops its 2% shrink, which inside a card would pull
// the row away from the card's edges.
const ROW_PRESSED = { background: 'color-mix(in srgb, var(--nv-ink) 8%, transparent)' };
// Focus is drawn by :focus-visible in index.css (the keyboard's, not a tap's):
// Interactive's inline ring stays on whatever was tapped last, and the Technique
// row opens its book in place, so a tapped row would wear it behind the book.
const NO_TAP_RING = {};

// A row: the tile in its hue, the name, the value (gold when it is waiting on
// him), the chevron. When the name and the value will not share a line the
// value drops beneath the name, as iOS lists do at large type — it is never
// cut off mid-word to make it fit.
function IndexRow({ r }) {
  return (
    <li>
      <Interactive as="div" className="nv-sum-irow" onClick={r.go} onPointerDown={r.warm} haptic="tick"
        aria-label={r.value ? `${r.label}, ${r.value}` : r.label} base={{ cursor: 'pointer' }} activeStyle={ROW_PRESSED} focusStyle={NO_TAP_RING}>
        <span className="nv-sum-itile" style={{ '--nv-sum-hue': `var(${r.hue})` }} aria-hidden="true"><RowMark k={r.key} /></span>
        <span className="nv-sum-itext" aria-hidden="true">
          <span className="nv-sum-ilbl">{r.label}</span>
          {r.value ? <span className={r.hot ? 'nv-sum-ival hot' : 'nv-sum-ival'}>{r.value}</span> : null}
        </span>
        <Chevron tone="var(--nv-ink40)" size={13} />
      </Interactive>
    </li>
  );
}

function IndexGroup({ g, i }) {
  const id = `nv-index-${g.key}`;
  return (
    <section className="nv-sum-rise nv-sum-igroup" style={{ '--i': i }} aria-labelledby={id}>
      <Eyebrow as="h2" id={id} tone="quiet" style={{ margin: '0 0 6px 14px' }}>{g.label}</Eyebrow>
      <ul className="nv-sum-card nv-sum-glist">
        {g.rows.map((r) => <IndexRow key={r.key} r={r} />)}
      </ul>
    </section>
  );
}

export function Index({ v }) {
  const P = v.indexPage;
  if (!P) return null;
  const last = P.groups.length + 3;
  // The search floats just above the tab bar — which is exactly where the app's
  // status banner sits (offline, a slow sync, demo data: App.jsx, 76px above the
  // inset). While one is up the search stands on top of it rather than under
  // it, anchored to the banner's own offset. No tab bar on the Mac: 16px.
  const searchBottom = !v.isMobile ? '16px'
    : v.statusBanner ? 'calc(118px + env(safe-area-inset-bottom))' : undefined;
  return (
    <div style={v.wrapMission} data-screen-label="Index">
      {/* Technique opens the Repertoire book in place, so the book has to be
          drawn wherever the row is, as each Home idiom draws it for its card */}
      {v.repertoireBook && <RepertoireBook v={v.repertoireBook} />}
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {/* who and when: the date, and Nova, one tap from talking — as on Home */}
        <div className="nv-sum-rise" style={{ '--i': 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', padding: '4px 4px 0' }}>
          <span style={{ minWidth: 0, font: `600 13px ${UI}`, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{P.date}</span>
          <Interactive onClick={v.openVoice} aria-label="Talk to Nova" haptic="tick"
            base={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>
            <NovaCore size={36} engine={v.coreStyle} />
          </Interactive>
        </div>
        <h1 className="nv-sum-rise" style={{ '--i': 1, margin: '2px 4px 4px', font: `700 34px/1.1 ${UI}`, letterSpacing: '-.025em', textWrap: 'balance' }}>Nova</h1>

        {/* YOU: whose Nova this is, and the state of it in one line; Settings */}
        <Interactive as="section" className="nv-sum-card nv-sum-rise nv-sum-you" style={{ '--i': 2 }} onClick={P.you.open} haptic="tick"
          aria-label={`${P.you.name}. ${P.you.line}. Open Settings`} base={{ cursor: 'pointer' }} focusStyle={NO_TAP_RING}>
          <NovaCore size={48} variant="mini" engine={v.coreStyle} style={{ pointerEvents: 'none' }} />
          <span style={{ minWidth: 0 }}>
            <b className="nv-sum-you-name">{P.you.name}</b>
            <span className="nv-sum-you-line">{P.you.line}</span>
          </span>
          <Chevron tone="var(--nv-ink40)" size={13} />
        </Interactive>

        {P.groups.map((g, gi) => <IndexGroup key={g.key} g={g} i={gi + 3} />)}

        {/* SEARCH, floating above the tab bar while the list scrolls under it.
            It opens the conversation — the one front door (✦ Ask does the same) */}
        <Interactive as="div" className="nv-sum-search nv-sum-rise" onClick={v.openPalette} haptic="tick"
          style={{ '--i': last, ...(searchBottom ? { bottom: searchBottom } : null) }}
          aria-label="Search Nova. Opens the conversation" base={{ cursor: 'pointer' }} focusStyle={NO_TAP_RING}>
          <svg className="nv-sum-search-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="nv-sum-search-lbl">Search Nova</span>
          <svg className="nv-sum-search-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </Interactive>
      </div>
    </div>
  );
}
