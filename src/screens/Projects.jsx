import '../code.css';
import { Interactive } from '../Interactive.jsx';
import { ScreenHead, Eyebrow, Meta, Tag, Button, Chip, TextAction, Rail, Segmented } from '../Controls.jsx';
import { Group, GRow } from '../AppleLayout.jsx';
import { RingTile } from '../RingTile.jsx';
import { Line } from './NovaThread.jsx';
import { LibraryFlag } from '../LibraryFlag.jsx';

// PROJECTS (phase 1, 29 Oct 2026; design/PROJECTS-PLAN.md §4). Absorbs the
// Code screen: the list is a rail of projects (the next tile peeks), a
// project's page holds its thread, its phases as one joined path, its files,
// what waits on him, its cost and its controls. One view model
// (src/vals/valsProjects.js), two idioms: under `summary` the house
// .nv-sum-card tiles, under cupertino AppleLayout groups.
//
// Colour means something: gold is waiting on his call, cyan is a session
// running now; everything else is ink.

const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';

function KindGlyph({ kind, linked }) {
  const d = linked ? 'M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1'
    : kind === 'build' ? 'M8 7l-5 5 5 5M16 7l5 5-5 5'
      : kind === 'research' ? 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5'
        : 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProjectTile({ p, i, summary }) {
  const pct = p.phaseRing.total ? Math.round((p.phaseRing.done / p.phaseRing.total) * 100) : 0;
  return (
    <Interactive as="section" className={`${summary ? 'nv-sum-card ' : 'nv-pane '}nv-deck-rise`} onClick={p.open}
      aria-label={`${p.name}, ${p.stage}${p.waiting ? `, ${p.waiting} waiting on you` : ''}`}
      base={{
        cursor: 'pointer', flex: '0 0 70%', maxWidth: '280px', minWidth: 0, boxSizing: 'border-box', padding: '14px 16px',
        scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: '10px', '--i': i,
        borderRadius: 'var(--nv-radius)',
        boxShadow: p.waiting ? 'inset 0 0 0 1px color-mix(in srgb, var(--nv-gold) 55%, transparent)' : undefined,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, color: p.waiting ? 'var(--nv-gold)' : 'var(--nv-ink60)' }}>
        <KindGlyph kind={p.kind} linked={p.linked} />
        <span style={{ font: `600 15px ${UI}`, color: 'var(--nv-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {p.linked ? (
          <div style={{ minWidth: 0 }}><Tag>LINKED · READ ONLY</Tag></div>
        ) : (
          <RingTile label="Phases" value={`${p.phaseRing.done}/${p.phaseRing.total}`} pct={pct} state={p.phaseRing.total ? (pct >= 100 ? 'good' : 'behind') : 'absent'} size={52} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <Tag>{p.stage.toUpperCase()}</Tag>
          {p.dryRun && <Tag dashed>DRY RUN</Tag>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minWidth: 0, minHeight: '18px' }}>
        {p.working && <span style={{ font: `600 12px ${UI}`, color: 'var(--nv-cy)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><span className="nv-pj-live" />working</span>}
        {!p.working && p.sessions > 0 && <Meta>{p.sessions} session{p.sessions === 1 ? '' : 's'} open</Meta>}
        {p.waiting > 0 && <span style={{ font: `600 12px ${UI}`, color: 'var(--nv-gold)' }}>{p.waiting} waiting on you</span>}
      </div>
    </Interactive>
  );
}

function Intake({ it, summary }) {
  return (
    <div className={summary ? 'nv-sum-card' : 'nv-pane'} style={{ padding: '14px 16px', marginTop: '18px', borderRadius: 'var(--nv-radius)', minWidth: 0 }}>
      <Eyebrow tone="cyan">Start a project</Eyebrow>
      {it.turns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
          {it.turns.map((t, i) => (
            <div key={i} className="nv-deck-rise" style={{
              alignSelf: t.who === 'him' ? 'flex-end' : 'flex-start', maxWidth: '88%', minWidth: 0,
              padding: '8px 12px', borderRadius: '14px', font: `400 14px/1.45 ${UI}`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              background: t.who === 'him' ? 'color-mix(in srgb, var(--nv-acc) 18%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 7%, transparent)',
            }}>{t.text}</div>
          ))}
          {it.busy && <div style={{ alignSelf: 'flex-start' }}><Meta>Nova is thinking…</Meta></div>}
        </div>
      )}
      {it.filed ? (
        <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ font: `500 14px ${UI}`, color: 'var(--nv-gold)' }}>The brief for {it.filed.name} is in your Inbox, waiting for your yes.</span>
          <TextAction onClick={it.reset}>Start another</TextAction>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', minWidth: 0 }}>
          <textarea value={it.text} onChange={it.set} rows={it.turns.length ? 2 : 3} placeholder={it.turns.length ? 'Answer Nova' : 'Say what you want to make, research or sort out. A sentence is enough; a whole prompt works too.'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) it.send(); }}
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', resize: 'vertical', background: 'var(--nv-well)', color: 'var(--nv-ink)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '10px', padding: '10px 12px', font: `400 16px/1.4 ${UI}`, outline: 'none' }} />
          <Button onClick={it.text.trim() && !it.busy ? it.send : undefined} disabled={!it.text.trim() || it.busy} style={{ flex: 'none', alignSelf: 'flex-end' }}>{it.busy ? 'Sent' : 'Send'}</Button>
        </div>
      )}
      {it.error && <div style={{ marginTop: '8px', font: `400 13px ${UI}`, color: 'var(--nv-warn)' }}>{it.error}</div>}
    </div>
  );
}

// the phases as ONE path: a line joins the steps (uniform connectedness)
function PhasePath({ phases }) {
  if (!phases.length) return <Meta>No phases named yet.</Meta>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: '4px 0 0', position: 'relative' }}>
      {phases.map((ph, i) => (
        <li key={i} className="nv-deck-rise" style={{ '--i': i, position: 'relative', display: 'flex', gap: '12px', paddingBottom: i === phases.length - 1 ? 0 : '14px', minWidth: 0 }}>
          {i < phases.length - 1 && <span aria-hidden="true" style={{ position: 'absolute', left: '7px', top: '18px', bottom: 0, width: '2px', background: ph.done ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 16%, transparent)' }} />}
          <span aria-hidden="true" style={{
            flex: 'none', width: '16px', height: '16px', borderRadius: '50%', marginTop: '2px', boxSizing: 'border-box',
            background: ph.done ? 'var(--nv-good)' : 'transparent',
            border: `2px solid ${ph.done ? 'var(--nv-good)' : ph.current ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 28%, transparent)'}`,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: `600 14px ${UI}`, color: ph.current ? 'var(--nv-cy)' : 'var(--nv-ink)' }}>{ph.name}{ph.current ? ' · now' : ''}</div>
            {ph.what && <div style={{ font: `400 13px/1.4 ${UI}`, color: 'var(--nv-ink60)', overflowWrap: 'anywhere' }}>{ph.what}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// THE PROJECT'S CONVERSATION: the transcript of what he and Nova said about
// this project (the conversation record, filtered by projectId), and a typed
// box. TALKING is the Voice conversation's job (his words, 1 Nov 2026: "The UI
// should be the same as the nova voice section"): "Talk about this" opens it
// with this project attached, and every turn there lands here too.
function ProjectTalk({ c, name }) {
  return (
    <div className="nv-pj-talk">
      {c.lines.length ? (
        <div className="nv-nt-thread">
          {c.lines.map((m, i) => <Line key={`${m.at}-${i}`} i={i} m={m} fresh={i === c.lines.length - 1} onHold={null} onOpen={() => {}} onReplay={() => {}} />)}
        </div>
      ) : <Meta>Nothing said about {name} yet. Talk it through with Nova, or type below.</Meta>}
      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={c.talk} ariaLabel={`Talk to Nova about ${name}, in the Voice conversation`}>Talk about this</Button>
        <Meta>Opens Nova with {name} attached</Meta>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', minWidth: 0 }}>
        <textarea value={c.text} onChange={c.set} rows={1} placeholder="Or type a question" aria-label={`Ask Nova about ${name}`}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); c.send(); } }}
          style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', resize: 'none', background: 'var(--nv-well)', color: 'var(--nv-ink)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '20px', padding: '10px 14px', font: `400 16px/1.4 ${UI}`, outline: 'none' }} />
        <Button variant="quiet" onClick={c.text.trim() && !c.busy ? c.send : undefined} disabled={!c.text.trim() || c.busy} style={{ flex: 'none' }}>{c.busy ? 'Asking' : 'Ask'}</Button>
      </div>
    </div>
  );
}

// ---- PHASE 2: research and videos for the project ---------------------------
//
// The feed is a rail (the next card peeks: there is more), newest first; each
// card is one line code wrote, the model and cost, and "Tell me". A running
// job wears the cyan live dot and its real stage; a failed one says why in
// warn and offers Retry. The two ways in sit under it: a question, and a
// video with its lens. Colour means something: cyan is working now, gold is
// his call, warn is a failure; everything else is ink.

function ResearchCard({ c, i }) {
  const tone = c.status === 'running' ? 'var(--nv-cy)' : c.status === 'error' ? 'var(--nv-warn)' : 'var(--nv-ink60)';
  return (
    <article className="nv-pj-rcard nv-deck-rise" data-state={c.status} style={{ '--i': i }} aria-label={`${c.label}: ${c.title}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, color: tone, font: `600 11.5px ${UI}`, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {c.status === 'running' && <span className="nv-pj-live" />}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
        <span style={{ marginLeft: 'auto', flex: 'none', color: 'var(--nv-ink50)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{c.when}</span>
      </div>
      <Interactive as="div" onClick={c.open} base={{ cursor: 'pointer', minWidth: 0 }}>
        <div style={{ font: `400 18px/1.25 ${S}`, color: 'var(--nv-ink)', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.title}</div>
        <div style={{ marginTop: '6px', font: `400 13px/1.4 ${UI}`, color: c.status === 'error' ? 'var(--nv-warn)' : 'var(--nv-ink60)', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.line}</div>
      </Interactive>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
        {c.tellMe && <Button compact onClick={c.tellMe}>Tell me</Button>}
        {c.retry && <Button compact variant="quiet" tone="warn" onClick={c.retry}>Retry</Button>}
        {c.receipt && <Meta>{c.receipt}</Meta>}
      </div>
      {c.library && <LibraryFlag flag={c.library} compact />}
    </article>
  );
}

function ResearchSection({ r, summary, name }) {
  const v = r.video;
  return (
    <Section summary={summary} label="Research" trailing={r.feed.length ? <Meta>{r.feed.length} filed or running</Meta> : null}>
      {r.feed.length ? (
        <Rail gap="12px" ariaLabel={`Research for ${name}`} style={{ paddingBottom: '4px', alignItems: 'stretch' }}>
          {r.feed.map((c, i) => <ResearchCard key={c.id} c={c} i={i} />)}
        </Rail>
      ) : <Meta>Nothing researched yet. Ask a question, or send Nova a video, below.</Meta>}

      <div className="nv-pj-in" style={{ marginTop: '16px' }}>
        <Eyebrow tone="cyan">Ask research</Eyebrow>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', minWidth: 0 }}>
          <input value={r.ask.text} onChange={r.ask.set} placeholder={`A question for ${name}`} aria-label={`A research question for ${name}`}
            onKeyDown={(e) => { if (e.key === 'Enter') r.ask.send(); }} className="nv-pj-field" />
          <Button onClick={r.ask.text.trim() && !r.ask.busy ? r.ask.send : undefined} disabled={!r.ask.text.trim() || r.ask.busy} style={{ flex: 'none' }}>{r.ask.busy ? 'Sending' : 'Research'}</Button>
        </div>
        {r.ask.error && <div style={{ marginTop: '6px', font: `400 13px ${UI}`, color: 'var(--nv-warn)' }}>{r.ask.error}</div>}
      </div>

      <div className="nv-pj-in" style={{ marginTop: '16px' }}>
        <Eyebrow tone="gold">Send a video</Eyebrow>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', minWidth: 0 }}>
          <input value={v.url} onChange={v.set} inputMode="url" placeholder="Paste a YouTube, Instagram or TikTok link" aria-label="A video link for this project"
            onKeyDown={(e) => { if (e.key === 'Enter') v.send(); }} className="nv-pj-field" />
          <Button onClick={v.url.trim() && !v.busy ? v.send : undefined} disabled={!v.url.trim() || v.busy} style={{ flex: 'none' }}>{v.busy ? 'Sending' : 'Send'}</Button>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }} role="radiogroup" aria-label="Read it for">
          {v.lenses.map((l) => <Chip key={l.id} active={v.lens === l.id} title={l.hint} onClick={() => v.setLens(l.id)}>{l.label}</Chip>)}
        </div>
        <div style={{ marginTop: '8px', font: `500 12.5px ${UI}`, color: 'var(--nv-ink60)' }}>{v.note}</div>
        {v.error && <div style={{ marginTop: '6px', font: `400 13px ${UI}`, color: 'var(--nv-warn)' }}>{v.error}</div>}
      </div>
    </Section>
  );
}

// found videos, waiting on him: a light tick or cross on each, one "Watch them"
function Candidates({ c, discard }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
      <ol className="nv-pj-cands">
        {c.items.map((it, i) => (
          <li key={it.url} className="nv-deck-rise" data-crossed={it.crossed ? '' : undefined} style={{ '--i': i }}>
            <Interactive as="button" type="button" onClick={it.toggle} aria-pressed={!it.crossed} aria-label={`${it.crossed ? 'Keep' : 'Leave out'} ${it.host}`}
              base={{ flex: 'none', width: '30px', height: '30px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: `1px solid color-mix(in srgb, ${it.crossed ? 'var(--nv-ink)' : 'var(--nv-gold)'} ${it.crossed ? 22 : 55}%, transparent)`, color: it.crossed ? 'var(--nv-ink50)' : 'var(--nv-gold)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d={it.crossed ? 'M6 6l12 12M18 6L6 18' : 'M5 12.5l4.5 4.5L19 7.5'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Interactive>
            <div style={{ minWidth: 0 }}>
              <div className="h" style={{ font: `600 13.5px ${UI}`, color: it.crossed ? 'var(--nv-ink50)' : 'var(--nv-ink)', overflowWrap: 'anywhere' }}>{it.host}</div>
              {it.why && <div style={{ font: `400 12.5px/1.4 ${UI}`, color: 'var(--nv-ink60)', overflowWrap: 'anywhere' }}>{it.why}</div>}
            </div>
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button compact onClick={c.watch && !c.busy ? c.watch : undefined} disabled={!c.watch || c.busy}>{c.busy ? 'Starting' : `Watch them${c.keptCount ? ` · ${c.keptCount}` : ''}`}</Button>
        <Button compact variant="quiet" tone="quiet" onClick={discard}>Not these</Button>
      </div>
      {c.estimate && <Meta>{c.estimate}</Meta>}
    </div>
  );
}

const ALLOW_LABEL = { research: 'Research', draft: 'Draft', code: 'Write code', test: 'Run tests', commit: 'Commit', deploy: 'Deploy' };

function Section({ summary, label, trailing, children }) {
  if (!summary) return <Group label={label} trailing={trailing}><div style={{ padding: '12px 16px', minWidth: 0 }}>{children}</div></Group>;
  return (
    <section className="nv-sum-card nv-deck-rise" style={{ padding: '14px 16px', marginTop: '12px', borderRadius: 'var(--nv-radius)', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '10px' }}><Eyebrow>{label}</Eyebrow>{trailing}</div>
      {children}
    </section>
  );
}

function ProjectPage({ pg, summary }) {
  if (pg.missing) {
    return (<div><TextAction onClick={pg.back}>‹ Projects</TextAction><div style={{ marginTop: '16px' }}><Meta>That project is not on this Mac.</Meta></div></div>);
  }
  const p = pg.project;
  const c = pg.controls;
  return (
    <div style={{ minWidth: 0 }}>
      <TextAction onClick={pg.back}>‹ Projects</TextAction>
      <h1 style={{ margin: '12px 0 4px', font: `700 28px/1.15 ${UI}`, letterSpacing: 'var(--nv-display-track)', overflowWrap: 'anywhere' }}>{p.name}</h1>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Tag>{p.kind.toUpperCase()}</Tag><Tag>{p.stage.toUpperCase()}</Tag>
        {p.linked && <Tag>LINKED · NOVA ONLY READS IT</Tag>}
        {p.dryRun && <Tag dashed>DRY RUN</Tag>}
      </div>
      {p.goal && <p style={{ margin: '10px 0 0', font: `italic 400 17px/1.45 ${S}`, color: 'var(--nv-ink60)' }}>{p.goal}</p>}
      {pg.error && <div style={{ marginTop: '10px', font: `400 13px ${UI}`, color: 'var(--nv-warn)' }}>{pg.error}</div>}

      {pg.waiting.length > 0 && (
        <Section summary={summary} label="Waiting on you">
          {pg.waiting.map((w) => (
            <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 0', minWidth: 0 }}>
              <div style={{ font: `600 15px ${UI}`, color: 'var(--nv-gold)' }}>{w.title}</div>
              {w.reason && <div style={{ font: `400 13px/1.4 ${UI}`, color: 'var(--nv-ink60)' }}>{w.reason}</div>}
              {w.candidates ? <Candidates c={w.candidates} discard={w.discard} /> : <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button compact onClick={w.approve}>{w.dryRun ? 'Yes · dry run' : 'Yes'}</Button>
                <Button compact variant="quiet" tone="quiet" onClick={w.discard}>No</Button>
                {w.dryRun && <Tag dashed>DRY RUN</Tag>}
              </div>}
            </div>
          ))}
        </Section>
      )}

      {pg.research && <ResearchSection r={pg.research} summary={summary} name={p.name} />}

      <Section summary={summary} label={`Talk to Nova about ${p.name}`}>
        <ProjectTalk c={pg.conversation} name={p.name} />
      </Section>

      <Section summary={summary} label="Phases"><PhasePath phases={pg.phases} /></Section>

      <Section summary={summary} label={p.linked ? 'Recent commits' : 'What happened'}>
        {pg.loading ? <Meta>Reading the project…</Meta> : pg.thread.length ? pg.thread.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', padding: '4px 0', minWidth: 0 }}>
            <span style={{ flex: 'none', font: 'var(--nv-micro-m)', color: 'var(--nv-ink50)', fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>{t.at.slice(5)}</span>
            <span style={{ font: `400 13px/1.45 ${UI}`, minWidth: 0, overflowWrap: 'anywhere' }}>{t.dry && <Tag dashed>DRY RUN</Tag>} {t.text}</span>
          </div>
        )) : <Meta>Nothing yet.</Meta>}
      </Section>

      {!p.linked && (
        <Section summary={summary} label="Files" trailing={<Meta>read only</Meta>}>
          {pg.loading ? <Meta>Reading the folder…</Meta> : pg.files.length ? pg.files.map((f) => (
            <div key={f.path} style={{ font: `400 13px ${'var(--nv-font-mono)'}`, padding: '2px 0', paddingLeft: `${(f.path.split('/').length - 1) * 14}px`, color: f.dir ? 'var(--nv-ink60)' : 'var(--nv-ink)', overflowWrap: 'anywhere' }}>
              {f.path.split('/').pop()}{f.dir ? '/' : ''}
            </div>
          )) : <Meta>The folder is empty.</Meta>}
        </Section>
      )}

      <Section summary={summary} label="Cost so far">
        {pg.cost.known
          ? <div style={{ font: `400 34px/1 ${S}`, fontVariantNumeric: 'tabular-nums' }}>US${pg.cost.usd.toFixed(2)}</div>
          : <div><span style={{ font: `italic 400 22px ${S}`, color: 'var(--nv-ink60)' }}>not yet known</span><div style={{ marginTop: '4px' }}><Meta>Runs are not yet tagged with a project (phase 4).</Meta></div></div>}
      </Section>

      {pg.actions.openCode && (
        <Section summary={summary} label="Build">
          <Button onClick={pg.actions.openCode}>Open the Build tab</Button>
        </Section>
      )}

      {c && (
        <Section summary={summary} label="Controls">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
            <div>
              <Eyebrow>Dry run</Eyebrow>
              <div style={{ marginTop: '6px' }}>
                <Segmented ariaLabel="Dry run" options={[['on', 'On'], ['off', 'Off']]} value={c.dryRun ? 'on' : 'off'} onChange={(v) => pg.actions.setSetting({ dryRun: v === 'on' })} />
              </div>
            </div>
            <div>
              <Eyebrow>May do alone</Eyebrow>
              <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.keys(ALLOW_LABEL).map((k) => (
                  <Chip key={k} active={!!c.allowances[k]} onClick={() => pg.actions.setSetting({ allowances: { [k]: !c.allowances[k] } })}>{ALLOW_LABEL[k]}</Chip>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>Videos are read for</Eyebrow>
              <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {c.lenses.map((l) => <Chip key={l.id} active={c.lens === l.id} title={l.hint} onClick={() => pg.actions.setSetting({ lens: l.id })}>{l.label}</Chip>)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Meta>Quiet {c.quiet ? `${c.quiet.from}–${c.quiet.to}` : 'not set'}</Meta>
              <Meta>Model {c.modelOverride || 'Nova picks by task'}</Meta>
            </div>
            {pg.nextStages.length > 0 && (
              <div>
                <Eyebrow>Propose a stage</Eyebrow>
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {pg.nextStages.map((s) => <Chip key={s} onClick={() => pg.actions.proposeStage(s)}>{s}</Chip>)}
                </div>
              </div>
            )}
            {p.stage !== 'archived' && <div><TextAction tone="quiet" onClick={pg.actions.archive}>Archive this project</TextAction></div>}
          </div>
        </Section>
      )}
    </div>
  );
}

export function Projects({ v }) {
  const P = v.projects;
  if (!P) return null;
  const summary = !!v.summary;
  return (
    <div style={v.wrapStash} data-screen-label="Projects">
      {P.page ? <ProjectPage pg={P.page} summary={summary} /> : (
        <>
          <ScreenHead numeral="IV." label="Projects" />
          <h1 style={{ margin: '14px 0 0', font: `700 28px/1.15 ${UI}`, letterSpacing: 'var(--nv-display-track)' }}>
            Work Nova holds <span style={{ font: `italic 400 25px ${S}`, color: 'var(--nv-cy)' }}>and comes back to.</span>
          </h1>
          <Intake it={P.intake} summary={summary} />
          <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <Eyebrow>Your projects</Eyebrow>
            {P.list.showAll && <TextAction onClick={P.list.showAll.run}>{P.list.showAll.label}</TextAction>}
          </div>
          {!P.list.loaded ? (
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }} aria-label="Loading projects">
              {[0, 1].map((i) => <div key={i} className={summary ? 'nv-sum-card' : 'nv-pane'} style={{ flex: '0 0 70%', maxWidth: '280px', height: '150px', borderRadius: 'var(--nv-radius)', opacity: 0.5 }} />)}
            </div>
          ) : P.list.empty ? (
            <div style={{ marginTop: '10px' }}><Meta>No projects yet. Tell Nova about one above.</Meta></div>
          ) : (
            <Rail gap="12px" ariaLabel="Projects" style={{ marginTop: '10px', paddingBottom: '4px', alignItems: 'stretch' }}>
              {P.list.projects.map((p, i) => <ProjectTile key={p.id} p={p} i={i} summary={summary} />)}
            </Rail>
          )}
          {!summary && P.list.projects.length > 0 && (
            <div style={{ marginTop: '18px' }}>
              <Group label="All of them">
                {P.list.projects.map((p, i) => (
                  <GRow key={p.id} first={i === 0} onClick={p.open}
                    leading={<span style={{ color: p.waiting ? 'var(--nv-gold)' : 'var(--nv-ink60)', display: 'inline-flex' }}><KindGlyph kind={p.kind} linked={p.linked} /></span>}
                    title={<span style={{ fontWeight: 500 }}>{p.name}</span>}
                    sub={p.linked ? 'linked · read only' : `${p.stage} · ${p.phaseRing.done} of ${p.phaseRing.total} phases`}
                    trailing={p.waiting ? <Tag tone="gold">{p.waiting} WAITING</Tag> : <span style={{ color: 'var(--nv-ink40)' }}>›</span>} />
                ))}
              </Group>
            </div>
          )}
        </>
      )}
    </div>
  );
}
