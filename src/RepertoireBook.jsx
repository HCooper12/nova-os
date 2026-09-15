import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { ChatMarkdown } from './ChatMarkdown.jsx';

// THE REPERTOIRE, OPENED. His ask, 15 Sep: "I'd like to be able to view all of
// the research and techniques catalogue it has stored as well, so allow me to
// open it up from the technique page on the Home Screen."
//
// Two halves, because he named two things. TECHNIQUES is the curriculum in
// teaching order — everything the daily card will ever show him, with what he
// has actually practised. RESEARCH is the reports themselves, in full, read in
// the app rather than hunted for in Obsidian.
//
// Discarded runs are KEPT and labelled. Two of the three reports here are
// drafts that were thrown away on the way to the one that stuck; hiding them
// would make the research look tidier than it was, and the point of a research
// archive is what was actually done.

const M = 'var(--nv-font-mono)';
const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';

function Field({ label, value, accent }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: '5px', font: `450 12.5px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>
      <span style={{ font: `600 12.5px ${UI}`, color: accent ? `var(${accent})` : 'var(--nv-ink)' }}>{label} </span>{value}
    </div>
  );
}

function Technique({ t, n }) {
  return (
    <div style={css('padding:13px 0;border-top:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent)')}>
      <div style={css('display:flex;align-items:baseline;gap:9px;min-width:0')}>
        <span style={{ flex: 'none', font: `600 11px ${M}`, color: 'var(--nv-mg)', fontVariantNumeric: 'tabular-nums' }}>{String(n).padStart(2, '0')}</span>
        <span style={{ flex: 1, minWidth: 0, font: `600 14.5px ${UI}`, lineHeight: 1.3, color: 'var(--nv-ink)' }}>{t.name}</span>
        <span style={{ flex: 'none', font: `500 10.5px ${M}`, letterSpacing: '.08em', color: t.tried ? 'var(--nv-good)' : 'var(--nv-ink40)' }}>
          {t.tried ? `${t.tried}×` : t.seen ? 'shown' : 'new'}
        </span>
      </div>
      {t.summary && <div style={{ marginTop: '5px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink)' }}>{t.summary}</div>}
      <Field label="Move." value={t.move} />
      <Field label="Drill." value={t.drill} accent="--nv-mg" />
      <Field label="Tell." value={t.tell} />
      <Field label="Source." value={t.source} />
    </div>
  );
}

export function RepertoireBook({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Your Repertoire" onClick={v.close}
      style={css('position:fixed;inset:0;background:rgba(8,5,12,.82);backdrop-filter:blur(6px);z-index:80;display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto')}>
      {/* the SAME view-transition-name the technique card had, so the card
          expands into this panel and his eye follows one object the whole way */}
      <div onClick={(e) => e.stopPropagation()}
        style={{
          ...css('width:620px;max-width:96vw;max-height:92vh;overflow-y:auto;border:1px solid color-mix(in srgb, var(--nv-mg) 26%, transparent);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95), 0 0 80px -30px color-mix(in srgb, var(--nv-mg) 50%, transparent);padding:22px 24px'),
          ...(v.vtName ? { viewTransitionName: v.vtName } : {}),
        }}>

        <div style={css('display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap')}>
          <span style={css('font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:var(--nv-mg)')}>YOUR REPERTOIRE</span>
          <Interactive as="span" onClick={v.close} base="cursor:pointer;font:var(--nv-micro-l);color:var(--nv-ink60);border:1px solid var(--nv-edge);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">CLOSE</Interactive>
        </div>

        <div style={css('margin-top:12px;display:flex;gap:8px')}>
          {[['techniques', `Techniques · ${v.techniqueCount}`], ['research', `Research · ${v.reportCount}`]].map(([key, label]) => (
            <Interactive key={key} as="span" onClick={() => v.setTab(key)}
              base={{ cursor: 'pointer', font: `600 12.5px ${UI}`, padding: '8px 15px', borderRadius: '999px',
                background: v.tab === key ? 'color-mix(in srgb, var(--nv-mg) 16%, transparent)' : 'transparent',
                color: v.tab === key ? 'var(--nv-mg)' : 'var(--nv-ink60)',
                border: `1px solid color-mix(in srgb, var(--nv-mg) ${v.tab === key ? 42 : 12}%, transparent)` }}
              hoverStyle={{ color: 'var(--nv-ink)' }}
            >{label}</Interactive>
          ))}
        </div>

        {v.tab === 'techniques' ? (
          <div style={css('margin-top:6px')}>
            {!v.families.length && <p style={{ font: `450 13px ${UI}`, color: 'var(--nv-ink60)' }}>{v.empty}</p>}
            {v.families.map((f) => (
              <div key={f.name} style={css('margin-top:16px')}>
                <div style={css('font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:var(--nv-ink60);text-transform:uppercase')}>{f.name}</div>
                {f.techniques.map((t) => <Technique key={t.id} t={t} n={t.position} />)}
              </div>
            ))}
            {!!v.families.length && (
              <p style={{ marginTop: '16px', font: `450 12px/1.5 ${UI}`, color: 'var(--nv-ink40)' }}>
                Teaching order — Nova works down this list. Reorder the page in Obsidian and it teaches the new order.
              </p>
            )}
          </div>
        ) : (
          <div style={css('margin-top:10px')}>
            {!v.reports.length && <p style={{ font: `450 13px ${UI}`, color: 'var(--nv-ink60)' }}>No research yet — send Nova a clip or an article and ask it to teach you what is in it.</p>}
            {v.reports.map((r) => (
              <div key={r.id} style={css('margin-top:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);padding-top:12px')}>
                <Interactive as="div" onClick={() => v.toggleReport(r.id)} base={css('cursor:pointer;display:flex;align-items:baseline;gap:9px;min-width:0')} hoverStyle={{}}>
                  <span style={{ flex: 'none', font: `600 11px ${M}`, color: r.kept ? 'var(--nv-good)' : 'var(--nv-ink40)' }}>{r.kept ? '✓' : '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, font: `500 14px ${S}`, lineHeight: 1.3, color: 'var(--nv-ink)' }}>{r.title}</span>
                  <span style={{ flex: 'none', font: `500 10.5px ${M}`, letterSpacing: '.06em', color: 'var(--nv-ink40)' }}>{r.open ? '−' : '+'}</span>
                </Interactive>
                <div style={{ marginTop: '4px', font: `450 11.5px ${UI}`, color: 'var(--nv-ink40)' }}>
                  {r.meta}
                </div>
                {r.open && (
                  <div style={{ marginTop: '10px', padding: '13px 14px', borderRadius: '10px', background: 'color-mix(in srgb, var(--nv-ink) 04%, transparent)', font: `450 13px/1.6 ${UI}`, color: 'var(--nv-ink60)', animation: 'fadeUp var(--nv-dur-fast) var(--nv-ease)' }}>
                    <ChatMarkdown text={r.body} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
