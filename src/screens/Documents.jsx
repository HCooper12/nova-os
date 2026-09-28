import { useEffect } from 'react';
import { ScreenHead, Eyebrow, Meta, Chip, Rail, TextAction } from '../Controls.jsx';
import { Interactive } from '../Interactive.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { CoverTile, KindGlyph } from '../ArtifactCard.jsx';
import { SkeletonBar } from '../Skeleton.jsx';
import { AGENT } from '../artifactClient.js';

// DOCUMENTS (28 Sep 2026) — the place he finds everything the agents wrote.
//
// His words: "simple and easy, but also engaging and appealing to find,
// retrieve and access reports or artefacts ... the Apple-like aesthetic
// approach." So this is Apple Books' shelf more than Finder's list: a serif
// line that says what is new, one search, a chip per agent, the pinned ones as
// COVERS on a rail at the top, then everything else by when it was written, as
// grouped rows with depth — each row's cover tile in the hue of the agent that
// wrote it (Coach coral, Nova blue, the Leader magenta: the Agent World's
// hues), so the page can be read by colour before a word is. Nothing is a
// plain box with text in it (§2b rule 7): a document is a cover, a kind is a
// glyph, a count lives on its chip.
//
// It works the same in both idioms: the controls come from Controls.jsx, which
// set themselves in the console face under `command` and the UI face under the
// Apple styles; the material is the house pane. It loads its list when it
// opens, and every state it can be in is drawn: loading is a skeleton, offline
// and error say which, empty invites the first document.

const UI = 'var(--nv-font-ui)';
const SERIF = 'var(--nv-font-serif)';
// the arrival: a short rise, 45ms apart, capped at twelve so a long list is
// not a slow reveal (the house --nv-stagger beat)
const rise = (i) => `fadeUp var(--nv-dur-base) var(--nv-ease) ${Math.min(i, 11) * 45}ms backwards`;

function SearchField({ d }) {
  return (
    <label style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: '9px', minHeight: '44px', padding: '0 14px',
      borderRadius: '14px', background: 'var(--nv-well)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--nv-ink) 8%, transparent)',
      color: 'var(--nv-ink50)', cursor: 'text',
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
        <circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" />
      </svg>
      <LocalInput type="search" value={d.query} onChange={d.setQuery} onSubmit={d.setQuery} debounceMs={120}
        placeholder="Search documents" aria-label="Search documents" enterKeyHint="search" autoComplete="off"
        style={{ flex: 1, minWidth: 0, height: '44px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--nv-ink)', font: `400 16px ${UI}`, WebkitAppearance: 'none', appearance: 'none' }} />
      {d.query ? (
        <Interactive as="span" onClick={d.clearQuery} aria-label="Clear the search"
          base={{ flex: 'none', width: '28px', height: '28px', margin: '0 -6px 0 0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--nv-ink50)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".35" /><path d="m9 9 6 6M15 9l-6 6" stroke="var(--nv-void)" strokeWidth="2" strokeLinecap="round" /></svg>
        </Interactive>
      ) : null}
    </label>
  );
}

// A PINNED DOCUMENT IS A COVER: a slab of its agent's hue with the kind drawn
// large, the title in serif beneath. The rail scrolls; the edge fades.
function Cover({ r, i }) {
  return (
    <Interactive as="div" onClick={r.open} haptic="tick" aria-label={`Open ${r.title}`} className="nv-doc-cover"
      base={{ flex: 'none', width: '158px', cursor: 'pointer', scrollSnapAlign: 'start', '--nv-doc-hue': r.hue, animation: rise(i) }}>
      <span className="nv-doc-tile" style={{
        position: 'relative', display: 'block', height: '176px', borderRadius: '16px', overflow: 'hidden',
        background: `linear-gradient(165deg, color-mix(in srgb, ${r.hue} 38%, var(--nv-void)), color-mix(in srgb, ${r.hue} 10%, var(--nv-void)) 72%)`,
        boxShadow: `inset 0 1px 0 color-mix(in srgb, ${r.hue} 60%, transparent), inset 0 0 0 1px color-mix(in srgb, ${r.hue} 26%, transparent), 0 18px 34px -20px color-mix(in srgb, ${r.hue} 85%, transparent)`,
      }}>
        {/* the spine: a lit edge down the left, the way a book catches light */}
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '7px', background: `linear-gradient(90deg, color-mix(in srgb, ${r.hue} 50%, transparent), transparent)` }} />
        <span style={{ position: 'absolute', left: '16px', top: '14px', font: `600 11.5px ${UI}`, letterSpacing: '.04em', color: r.hue }}>{r.agentName}</span>
        <span aria-hidden="true" style={{ position: 'absolute', right: '12px', top: '12px', color: r.hue, opacity: 0.9 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 3.5 20.5 8.5 17 10l-3.2 3.2.4 4.3-1.5 1.5-4-4-4.2 4.2-1.1-1.1 4.2-4.2-4-4 1.5-1.5 4.3.4L14 5.5Z" /></svg>
        </span>
        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)', color: r.hue, opacity: 0.95 }}>
          <KindGlyph kind={r.kind} size={46} strokeWidth={1.3} />
        </span>
        <span style={{ position: 'absolute', left: '16px', right: '14px', bottom: '12px', font: `600 11px ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 62%, transparent)' }}>{r.kindLabel}</span>
      </span>
      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: '9px', font: `400 17px/1.2 ${SERIF}`, color: 'var(--nv-ink)' }}>{r.title}</span>
      <Meta tone="faint" style={{ display: 'block', marginTop: '3px' }}>{r.when}</Meta>
    </Interactive>
  );
}

// A ROW: the cover tile in the agent's hue, the serif title, one line of
// summary, and who · when · how long. The whole row is the target.
function Row({ r, i, first }) {
  return (
    <Interactive as="div" onClick={r.open} haptic="tick" aria-label={`Open ${r.title}`} className="nv-doc-row"
      base={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '64px', padding: '12px 14px', cursor: 'pointer',
        boxShadow: first ? 'none' : 'inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 7%, transparent)',
        '--nv-doc-hue': r.hue, animation: rise(i),
      }}
      hoverStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 4%, transparent)' }}>
      <CoverTile agent={r.agent} kind={r.kind} w={42} h={52} glyph={19} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: `400 18px/1.22 ${SERIF}`, color: 'var(--nv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
        {r.summary ? <span style={{ display: 'block', marginTop: '2px', font: `400 13.5px/1.35 ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span> : null}
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', minWidth: 0 }}>
          <span aria-hidden="true" style={{ flex: 'none', width: '6px', height: '6px', borderRadius: '50%', background: r.hue }} />
          <Meta tone="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[r.agentName, r.when, r.length].filter(Boolean).join(' · ')}</Meta>
        </span>
      </span>
      <svg width="8" height="14" viewBox="0 0 9 15" aria-hidden="true" style={{ flex: 'none', color: 'var(--nv-ink40)' }}>
        <path d="M1.5 1.5 7.5 7.5 1.5 13.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Interactive>
  );
}

function Group({ label, children }) {
  return (
    <section style={{ marginTop: '22px' }}>
      <Eyebrow as="h2" style={{ margin: '0 4px 8px' }}>{label}</Eyebrow>
      <div className="nv-pane" style={{ padding: 0, overflow: 'hidden' }}>{children}</div>
    </section>
  );
}

// LOADING IS A SHAPE, not a blank: the rows it will be, shimmering.
function Loading() {
  return (
    <Group label="Loading">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', boxShadow: i ? 'inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 7%, transparent)' : 'none' }}>
          <SkeletonBar w="42px" h="52px" radius="9px" />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <SkeletonBar w={`${62 - i * 7}%`} h="15px" />
            <SkeletonBar w={`${84 - i * 5}%`} h="11px" />
          </span>
        </div>
      ))}
    </Group>
  );
}

// EMPTY IS AN INVITATION, and it is drawn: the three covers he will get, one
// per agent, fanned like a hand of cards.
function Empty({ title, line, action }) {
  const fan = [
    { a: 'coach', r: -9, x: -34 },
    { a: 'leader', r: 8, x: 34 },
    { a: 'nova', r: 0, x: 0 },
  ];
  return (
    <div style={{ marginTop: '34px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 12px', animation: rise(0) }}>
      <div aria-hidden="true" style={{ position: 'relative', width: '150px', height: '96px' }}>
        {fan.map((f, i) => (
          <span key={f.a} style={{ position: 'absolute', left: '50%', top: 0, transform: `translateX(calc(-50% + ${f.x}px)) rotate(${f.r}deg)`, transformOrigin: '50% 100%', zIndex: i }}>
            <CoverTile agent={f.a} kind={f.a === 'leader' ? 'html' : 'doc'} w={62} h={80} glyph={26} />
          </span>
        ))}
      </div>
      <div style={{ marginTop: '18px', font: `400 26px/1.15 ${SERIF}`, color: 'var(--nv-ink)' }}>{title}</div>
      <div style={{ marginTop: '8px', maxWidth: '34ch', font: `400 15px/1.5 ${UI}`, color: 'var(--nv-ink60)', textWrap: 'pretty' }}>{line}</div>
      {action ? <div style={{ marginTop: '14px' }}>{action}</div> : null}
    </div>
  );
}

export function Documents({ v }) {
  const d = v.docs;
  const load = d?.load;
  // the list is read when the screen opens, never at boot
  useEffect(() => { load?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  let row = 0;
  return (
    <div style={d.wrap} data-screen-label="Documents">
      <ScreenHead numeral="XX." label="Documents" />
      {/* THE NEWS LINE: what is new, counted from the list, in the serif */}
      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
        <span aria-hidden="true" style={{ flex: 'none', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--nv-cy)', boxShadow: '0 0 12px var(--nv-cy)', transform: 'translateY(-4px)', opacity: d.state === 'ready' ? 1 : 0.35 }} />
        <h1 style={{ margin: 0, font: `400 ${d.mobile ? 32 : 38}px/1.08 ${SERIF}`, letterSpacing: '-.015em', color: 'var(--nv-ink)', textWrap: 'balance', minWidth: 0 }}>
          {d.state === 'ready' ? d.headline.line : 'What your agents wrote'}
        </h1>
      </div>
      {d.state === 'ready' && d.headline.sub ? <Meta tone="quiet" style={{ display: 'block', marginTop: '6px', paddingLeft: '18px' }}>{d.headline.sub}</Meta> : null}

      {d.state !== 'offline' && (
        <div style={{ marginTop: '18px' }}>
          <SearchField d={d} />
          <Rail ariaLabel="Filter by agent" gap="8px" style={{ marginTop: '12px', padding: '2px 0' }}>
            {d.filters.map((f) => (
              <Chip key={f.key} onClick={() => d.setFilter(f.key)} active={f.active} tone={f.hue} ariaLabel={`${f.label}${f.count != null ? `, ${f.count}` : ''}`} style={{ flex: 'none' }}>
                {f.key !== 'all' && f.key !== 'html' ? <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: f.active ? 'currentColor' : f.hue }} /> : null}
                {f.key === 'html' ? <KindGlyph kind="html" size={14} /> : null}
                {f.label}
                {f.count != null ? <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{f.count}</span> : null}
              </Chip>
            ))}
          </Rail>
        </div>
      )}

      {d.state === 'loading' && <Loading />}
      {d.state === 'offline' && (
        <Empty title="Not connected" line="Documents live in your vault on your Mac. Connect Nova to it in Settings and everything the agents wrote shows up here." />
      )}
      {d.state === 'error' && (
        <Empty title="Couldn't reach your Mac" line={`${d.error ? `${String(d.error).replace(/[.\s]*$/, '')}. ` : ''}Your documents are safe in the vault.`}
          action={<TextAction onClick={d.load}>Try again</TextAction>} />
      )}
      {d.state === 'empty' && (
        <Empty title="Nothing yet." line="Ask Coach or Nova for a plan, a report or a comparison and it lands here." />
      )}
      {d.noMatch && (
        <Empty title="No match" line={d.query ? `Nothing the agents wrote mentions “${d.query.trim()}”${d.filter !== 'all' ? ' under this filter' : ''}.` : 'Nothing under this filter yet.'}
          action={d.query ? <TextAction onClick={d.clearQuery}>Clear the search</TextAction> : <TextAction onClick={() => d.setFilter('all')}>Show all</TextAction>} />
      )}

      {d.pinned.length > 0 && (
        <section style={{ marginTop: '24px' }}>
          <Eyebrow as="h2" style={{ margin: '0 4px 10px' }}>Pinned</Eyebrow>
          <Rail ariaLabel="Pinned documents" gap="14px" style={{ alignItems: 'flex-start', paddingBottom: '6px' }}>
            {d.pinned.map((r, i) => <Cover key={r.id} r={r} i={i} />)}
          </Rail>
        </section>
      )}

      {d.groups.map((g) => (
        <Group key={g.key} label={g.label}>
          {g.rows.map((r, i) => <Row key={r.id} r={r} i={row++} first={i === 0} />)}
        </Group>
      ))}

      {d.state === 'ready' && (
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {Object.values(AGENT).map((a) => (
            <span key={a.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: a.hue }} />
              <Meta tone="faint">{a.name}</Meta>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
