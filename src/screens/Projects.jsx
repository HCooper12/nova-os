import '../code.css';
import { Interactive } from '../Interactive.jsx';
import { ScreenHead, Eyebrow, Meta, Tag, Button, Chip, TextAction, Rail, Segmented } from '../Controls.jsx';
import { Group, GRow } from '../AppleLayout.jsx';
import { RingTile } from '../RingTile.jsx';

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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button compact onClick={w.approve}>{w.dryRun ? 'Yes · dry run' : 'Yes'}</Button>
                <Button compact variant="quiet" tone="quiet" onClick={w.discard}>No</Button>
                {w.dryRun && <Tag dashed>DRY RUN</Tag>}
              </div>
            </div>
          ))}
        </Section>
      )}

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
