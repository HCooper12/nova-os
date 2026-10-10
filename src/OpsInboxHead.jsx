import { useRef, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { GlassSheet } from './GlassSheet.jsx';
import { Eyebrow, TextAction, Chip, Select, Button } from './Controls.jsx';
import { Ico, Tile } from './InboxSumIcons.jsx';

// AGENTS & OPERATIONS, IN HIS ORDER (27 Sep 2026, mockup 60 #6). Under the
// `summary` style Ops opens with what the Inbox handed over: "Waiting on your
// call" first, then what Nova proposes, then the seven loops, then the filing
// ladder. His words: "Nova proposes options could appear at the top of the
// agents and operations … but under the decisions waiting on my call." Ops'
// own sections (the Org Map, the Forge, the stream) follow unchanged.
//
// Every control here is the one the Inbox had (valsInbox's loops, ladder and
// proposals, reshaped in valsInboxSummary); nothing new writes. A loop's row
// shows its state in one line; its settings open in the house sheet.

function ProposalCard({ p }) {
  return (
    <div className="nv-sum-ib-prop">
      <span className="pk"><Ico name={p.glyph} />{p.label}</span>
      <p className="nv-sum-ib-say">{p.say}</p>
      {p.ladder && (
        <div className="nv-sum-ib-change" role="img" aria-label={`${p.ladder.from} now, ${p.ladder.to} proposed`}>
          <span className="nv-sum-ib-pill" style={{ '--h': 'var(--nv-cy)' }}><i /><span className="nm">{p.ladder.from}</span></span>
          <Ico name="arrow" className="nv-sum-ib-ico nv-sum-ib-arrow" />
          <span className="nv-sum-ib-pill arrive" style={{ '--h': 'var(--nv-gold)' }}><i /><span className="nm">{p.ladder.to}</span></span>
        </div>
      )}
      <div className="nv-sum-ib-answer">
        <Interactive as="button" className="nv-sum-ib-yes" onClick={p.accept.run} haptic="commit" base={{ cursor: 'pointer' }}>
          <Ico name="check" /><span className="lbl">{p.accept.label}</span>
        </Interactive>
        {p.alt
          ? <Interactive as="button" className="nv-sum-ib-talk" onClick={p.alt.run} haptic="tick" base={{ cursor: 'pointer' }}>{p.alt.label}</Interactive>
          : <Interactive as="button" className="nv-sum-ib-talk" onClick={p.talk} haptic="tick" base={{ cursor: 'pointer' }}><Ico name="talk" />Talk about it</Interactive>}
        <Interactive as="button" className="nv-sum-ib-no" onClick={p.skip} aria-label="Skip" title="Skip" haptic="tick" base={{ cursor: 'pointer' }}>
          <Ico name="x" />
        </Interactive>
      </div>
    </div>
  );
}

// one proposal a loop's own sheet also carries (Briefs), as a row
function ProposalRow({ p, onOpen }) {
  return (
    <Interactive as="button" className="nv-sum-ib-prop2" onClick={onOpen} haptic="tick" base={{ cursor: 'pointer' }}>
      <Tile tile={{ tone: 'gold', glyph: p.glyph }} />
      <span className="nv-sum-ib-lx"><span className="nm">{p.label}</span><span className="sv">{p.say}</span></span>
      <Ico name="right" className="nv-sum-ib-ico cv" />
    </Interactive>
  );
}

const LINE = { fontFamily: 'var(--nv-font-ui)', fontSize: '13px', lineHeight: 1.45, color: 'var(--nv-sum-ink2)', margin: 0 };
const hourOpts = (list) => list.map((h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }));

// A LOOP'S OWN CONTROLS, in its sheet: exactly what its Inbox card had
function LoopControls({ k, c }) {
  if (k === 'review') {
    const d = c.review;
    return (
      <>
        <p style={LINE}>Nova reasons across your whole day: one coached read and its adjustments.</p>
        <div className="nv-sum-ib-lctl">
          {(d.modes || []).map((m) => <Chip key={m.value} tone={m.active ? 'accent' : 'quiet'} active={m.active} onClick={m.pick}>{m.label}</Chip>)}
          <Select value={d.hour} onChange={d.setHour} ariaLabel="Day read time" style={{ marginLeft: 'auto' }} options={hourOpts(d.hourOptions || [])} />
        </div>
        <div className="nv-sum-ib-lstat"><span>{d.status}</span><TextAction disabled={d.busy} onClick={d.run}>{d.busy ? 'Reasoning…' : 'Run now'}</TextAction></div>
      </>
    );
  }
  if (k === 'briefs') {
    return (
      <>
        <p style={LINE}>Real data only. Draft asks you first; Auto files straight into the journal.</p>
        {c.briefsProposals.map((p) => <div key={p.key} style={{ marginTop: '12px' }}><ProposalCard p={p} /></div>)}
        {c.briefs.map((s) => (
          <div key={s.slot} className="nv-sum-ib-slot">
            <div className="nv-sum-ib-lstat"><b>{s.name}</b><Select value={s.hour} onChange={s.setHour} ariaLabel={`${s.name} time`} options={hourOpts(s.hourOptions || [])} /></div>
            <div className="nv-sum-ib-lctl">{s.modes.map((m) => <Chip key={m.value} tone={m.active ? 'accent' : 'quiet'} active={m.active} onClick={m.pick}>{m.label}</Chip>)}</div>
            <div className="nv-sum-ib-lstat"><span>{s.status}</span><TextAction disabled={c.briefsBusy} onClick={s.run}>{c.briefsBusy ? 'Composing…' : 'Run now'}</TextAction></div>
          </div>
        ))}
      </>
    );
  }
  if (k === 'compost' || k === 'promises') {
    const d = k === 'compost' ? c.compost : c.promises;
    return (
      <>
        <div className="nv-sum-ib-lstat">
          <span>{k === 'compost' ? 'Weekly · a read-only scan' : 'Fortnightly · a read-only scan'} · last pass {d.lastRun}</span>
          <TextAction disabled={d.busy} onClick={d.run}>{d.busy ? 'Scanning…' : 'Run now'}</TextAction>
        </div>
        {k === 'promises' && d.loaded && !d.proposals.length && <p style={LINE}>Nothing you wrote down has been left hanging. Every promise is closed, tracked, or written about since.</p>}
        {d.proposals.map((p) => (
          <div key={p.id} className="nv-sum-ib-lprop">
            <b>{p.title}</b>
            <p style={LINE}>{p.detail}</p>
            <div className="nv-sum-ib-lctl">
              {p.actionable && <Button compact onClick={p.accept} disabled={p.busy}>{p.busy ? '…' : (p.acceptLabel || 'Accept')}</Button>}
              {p.open && <Button variant="quiet" compact tone="violet" onClick={p.open}>{k === 'promises' ? 'Open the note' : 'Open'}</Button>}
              <Button variant="quiet" compact tone="quiet" onClick={p.dismiss} disabled={p.busy}>{k === 'promises' ? 'Let it go' : 'Dismiss'}</Button>
            </div>
          </div>
        ))}
      </>
    );
  }
  if (k === 'todoist') {
    const d = c.todoist;
    return (
      <>
        <div className="nv-sum-ib-lstat"><span>{d.status}</span>{d.configured && <TextAction disabled={d.busy} onClick={d.sync}>{d.busy ? 'Syncing…' : 'Sync now'}</TextAction>}</div>
        {d.configured && <p style={LINE}>To-dos filed here appear in Todoist's Inbox; tasks added or completed there flow back. Nothing is ever deleted on either side.</p>}
      </>
    );
  }
  if (k === 'mealprep') {
    const d = c.mealPrep;
    return (
      <div className="nv-sum-ib-lstat">
        <span>Thursdays, same meals by design. Keeps this week's rotation, checks the protein floor, and drafts the shopping list those meals need; one Accept fills the list.</span>
        <TextAction disabled={d.busy} onClick={d.run}>{d.busy ? 'Composing…' : 'Run now'}</TextAction>
      </div>
    );
  }
  if (k === 'guardian') {
    const d = c.guardian;
    return (
      <>
        <div className="nv-sum-ib-lstat">
          <span>{d.loaded ? `${String(d.status || '').charAt(0).toUpperCase()}${String(d.status || '').slice(1)} · ${d.checkedLabel}` : d.checkedLabel}</span>
        </div>
        <div className="nv-sum-ib-lctl">
          <TextAction disabled={d.busy} onClick={d.run}>{d.busy ? 'Checking…' : 'Run checks'}</TextAction>
          <TextAction tone="quiet" disabled={d.busy} onClick={d.report}>Report</TextAction>
          <TextAction tone="quiet" disabled={d.busy} onClick={d.exportVault} title={`Zip vault and data to the Desktop · ${d.lastExportLabel}`}>Export</TextAction>
        </div>
        {(d.checks || []).map((ch) => (
          <div key={ch.id} className="nv-sum-ib-check">
            <span className="d" style={{ background: ch.color }} aria-hidden="true" />
            <span style={LINE}><b style={{ color: 'var(--nv-ink)', fontWeight: 600 }}>{ch.label}.</b> {ch.detail}</span>
          </div>
        ))}
      </>
    );
  }
  return null;
}

// review: the evening model read (server/lib/dailyReview.js), shown as "Day
// read" since 11 Oct — "Daily review" now names the forgetting-curve card.
const LOOP_NAME = { review: 'Day read', briefs: 'Briefs', compost: 'Compost', promises: 'Open promises', todoist: 'Todoist', mealprep: 'Meal prep', guardian: 'Guardian' };

export function OpsInboxHead({ o }) {
  const origin = useRef({});
  const [propOrigin, setPropOrigin] = useState(null);
  const [first, ...rest] = o.proposals;
  return (
    <div className="nv-sum-ib" style={{ maxWidth: '760px', margin: '0 auto 8px' }}>
      <h1 className="nv-sum-ib-h1 nv-sum-rise" style={{ '--i': 0, margin: '2px 4px 4px' }}>Agents &amp; Operations</h1>

      <section className="nv-sum-ib-group nv-sum-rise" style={{ '--i': 1 }} aria-label="Waiting on your call">
        <Eyebrow as="h2" tone="quiet" style={{ margin: '0 0 6px 14px' }}>Waiting on your call</Eyebrow>
        <Interactive as="button" className="nv-sum-card nv-sum-ib-waitcard" onClick={o.waiting.open} haptic="tick" base={{ cursor: 'pointer' }}
          aria-label={`${o.waiting.count} decisions waiting on your call. Open the Inbox`}>
          <span className={`nv-sum-ib-num xl${o.waiting.count ? ' wait' : ''}`}>{o.waiting.count}</span>
          <span className="nv-sum-ib-cx"><b>{o.waiting.count === 1 ? 'decision' : 'decisions'}</b>{o.waiting.line && <span>{o.waiting.line}</span>}</span>
          <span className="nv-sum-ib-go">Open the Inbox<Ico name="right" className="nv-sum-ib-ico cv" /></span>
        </Interactive>
      </section>

      {o.proposals.length > 0 && (
        <section className="nv-sum-ib-group nv-sum-rise" style={{ '--i': 2 }} aria-label="Nova proposes">
          <Eyebrow as="h2" tone="quiet" style={{ margin: '0 0 6px 14px' }}>Nova proposes · {o.proposals.length}</Eyebrow>
          <ProposalCard p={first} />
          {rest.map((p) => (
            <div key={p.key} ref={(el) => { origin.current[p.key] = el; }}>
              <ProposalRow p={p} onOpen={() => { setPropOrigin(origin.current[p.key] || null); p.open(); }} />
            </div>
          ))}
        </section>
      )}

      <section className="nv-sum-ib-group nv-sum-rise" style={{ '--i': 3 }} aria-label="Loops">
        <Eyebrow as="h2" tone="quiet" style={{ margin: '0 0 6px 14px' }}>Loops · {o.loops.length}</Eyebrow>
        <div className="nv-sum-card nv-sum-ib-rows">
          {o.loops.map((l) => (
            <div key={l.key} className="nv-sum-ib-lrow" ref={(el) => { origin.current[`loop:${l.key}`] = el; }}>
              <Interactive as="div" className="main" onClick={l.open} haptic="tick" aria-label={`${l.name}: ${l.line || 'loading'}. Open its settings`}
                base={{ cursor: 'pointer' }} activeStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 8%, transparent)' }}>
                <span className={`d d-${l.dot}`} aria-hidden="true" />
                <span className="nv-sum-ib-lx">
                  <span className="nm">{l.name}</span>
                  {l.loading ? <span className="nv-sum-ib-skel" role="img" aria-label="Loading" /> : <span className={`sv${l.em ? ' em' : ''}`}>{l.line}</span>}
                </span>
              </Interactive>
              {l.run && (
                <Interactive as="button" className="nv-sum-ib-run" onClick={l.run.go ? (l.run.busy ? undefined : l.run.go) : l.open} haptic="tick"
                  aria-disabled={l.run.busy ? 'true' : undefined} base={{ cursor: l.run.busy ? 'default' : 'pointer' }}>{l.run.label}</Interactive>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="nv-sum-ib-group nv-sum-rise" style={{ '--i': 4 }} aria-label="Filing">
        <Eyebrow as="h2" tone="quiet" style={{ margin: '0 0 6px 14px' }}>Filing</Eyebrow>
        <div className="nv-sum-ib-ladder" role="radiogroup" aria-label="Filing mode">
          {o.ladder.options.map((m) => (
            <Interactive key={m.value} as="button" role="radio" aria-checked={m.active} className={`${m.active ? 'on' : ''}${m.next ? ' next' : ''}`}
              onClick={m.active ? undefined : m.pick} haptic="tick" base={{ cursor: m.active ? 'default' : 'pointer' }}>{m.label}</Interactive>
          ))}
        </div>
        {o.ladder.hint && <p className="nv-sum-ib-lhint">{o.ladder.hint}</p>}
      </section>

      {o.loopOpen && (
        <GlassSheet label={LOOP_NAME[o.loopOpen] || 'Loop'} onClose={o.closeLoop} originEl={origin.current[`loop:${o.loopOpen}`] || null}>
          <div className="nv-sum-ib nv-sum-ib-lsheet">
            <h2 className="nv-sum-ib-sh2">{LOOP_NAME[o.loopOpen]}</h2>
            <LoopControls k={o.loopOpen} c={o.controls} />
          </div>
        </GlassSheet>
      )}
      {o.proposalOpen && (
        <GlassSheet label={o.proposalOpen.label} onClose={o.closeProposal} originEl={propOrigin}>
          <div className="nv-sum-ib nv-sum-ib-lsheet"><ProposalCard p={o.proposalOpen} /></div>
        </GlassSheet>
      )}
    </div>
  );
}
