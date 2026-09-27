import { useEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { SwipeRow } from '../SwipeRow.jsx';
import { SkeletonBar } from '../Skeleton.jsx';
import { Eyebrow, Segmented, TextAction } from '../Controls.jsx';
import { muscleVar } from '../muscleHue.js';
import { autoSeenDue, elapsedLabel, AUTO_SEEN_MS, TONE_HUE } from '../inboxSummaryFacts.js';
import { Ico, Tile } from '../InboxSumIcons.jsx';
import { DeeperReportSheet } from '../DeeperReportSheet.jsx';
import { Verbs } from '../InboxSumVerbs.jsx';

// THE SUMMARY INBOX (27 Sep 2026) — design/mockups/60-redesign-inbox-r2.html,
// his pick ("Option A seems best and most clean/organised"), answering the
// audit design/audits/redesign-2026-09/02-inbox.md. Inbox.jsx hands over to
// this under the `summary` style only; cupertino and command keep theirs.
//
// One job on this page: the decisions waiting on his call, one card at a
// time, with everything a card can tell him on the card (You captured, Will
// be filed, the reason, Look deeper) and three verbs (✓ · Talk about it · ✕).
// Filed is the second half of the same page. Capture moved to the Nova
// button (CaptureSheet.jsx); the loops, the ladder and Nova's proposals moved
// to Agents & Operations, under "Waiting on your call".
//
// It draws what src/vals/valsInboxSummary.js hands it and calls what that
// hands it; nothing here computes a fact or writes a thing. Every card below
// is a module-level component under a stable key, so the entrance
// (.nv-sum-rise) runs once, as on the summary Home.

// A FORM FOR THE CHANGE (the Coach deck's grammar, at this page's sizes): the
// lift that goes solid, the one that arrives dashed, the set dots.
function ExPill({ ex, arrive, gold, extra }) {
  const hue = gold ? 'var(--nv-gold)' : ex?.muscle ? muscleVar(ex.muscle) : 'var(--nv-ink40)';
  return (
    <span className={`nv-sum-ib-pill${arrive ? ' arrive' : ''}`} style={{ '--h': hue }}>
      <i /><span className="nm">{ex?.name}</span>{extra ? <span className="x">{extra}</span> : null}
    </span>
  );
}
const Arrow = () => <Ico name="arrow" className="nv-sum-ib-ico nv-sum-ib-arrow" />;

function ChangeDrawn({ change }) {
  if (!change) return null;
  if (change.kind === 'route') {
    return (
      <div className="nv-sum-ib-change" role="img" aria-label={`${change.from} into ${change.to}${change.low ? ', low confidence' : ''}`}>
        <span className="nv-sum-ib-pill" style={{ '--h': 'var(--nv-ink40)' }}><i /><span className="nm">{change.from}</span></span>
        <Arrow />
        <span className="nv-sum-ib-pill arrive" style={{ '--h': TONE_HUE[change.tone] || 'var(--nv-ink40)' }}><i /><span className="nm">{change.to}</span></span>
        {change.low && <span className="nv-sum-ib-cnote">low confidence</span>}
      </div>
    );
  }
  const x = change.diff || {};
  const reps = (sets, r) => (sets ? `${sets}${r ? ` × ${r}` : ' sets'}` : null);
  switch (x.type) {
    case 'create':
      return <div className="nv-sum-ib-change"><ExPill ex={{ name: `New: ${x.name}` }} arrive gold /><span className="nv-sum-ib-cnote">empty until the changes after it fill it</span></div>;
    case 'remove':
      return <div className="nv-sum-ib-change" role="img" aria-label={`${x.exercise?.name} comes out`}><ExPill ex={x.exercise} extra={x.sets ? `−${x.sets} sets` : null} /><span className="nv-sum-ib-cnote">comes out</span></div>;
    case 'add':
      return <div className="nv-sum-ib-change" role="img" aria-label={`${x.exercise?.name} goes in${x.place ? `, ${x.place}` : ''}`}><ExPill ex={x.exercise} arrive extra={`+${reps(x.sets, x.reps)}`} />{x.place && <span className="nv-sum-ib-cnote">{x.place}</span>}</div>;
    case 'swap':
      return <div className="nv-sum-ib-change" role="img" aria-label={`${x.from?.name} out, ${x.to?.name} in`}><ExPill ex={x.from} /><Arrow /><ExPill ex={x.to} arrive /></div>;
    case 'move':
      return (
        <>
          <div className="nv-sum-ib-change"><ExPill ex={x.exercise} extra={reps(x.sets, x.reps)} /></div>
          <div className="nv-sum-ib-change tight" role="img" aria-label={`From ${x.from} to ${x.to}${x.place ? `, ${x.place}` : ''}`}>
            <span className="nv-sum-ib-pill" style={{ '--h': 'var(--nv-ink40)' }}><i /><span className="nm">{x.from}</span>{x.fromSets && <span className="x">{x.fromSets.before}→{x.fromSets.after}</span>}</span>
            <Arrow />
            <ExPill ex={{ name: x.to }} arrive gold />
            {x.place && <span className="nv-sum-ib-cnote">{x.place}</span>}
          </div>
        </>
      );
    case 'targets': {
      const hue = x.exercise?.muscle ? muscleVar(x.exercise.muscle) : 'var(--nv-ink40)';
      const b = x.before?.sets || 0;
      const a = x.after?.sets || 0;
      return (
        <div className="nv-sum-ib-change" role="img" aria-label={`${b} sets becomes ${a}${x.before?.reps !== x.after?.reps ? `, ${x.before?.reps} reps becomes ${x.after?.reps}` : ''}`}>
          <span className="nv-sum-ib-dots" style={{ '--h': hue }}>
            {Array.from({ length: Math.max(a, b) }, (_, k) => <i key={k} className={k >= b ? 'new' : k >= a ? 'drop' : undefined} />)}
          </span>
          {x.before?.reps && x.after?.reps && x.before.reps !== x.after.reps && <span className="nv-sum-ib-cnote">{x.before.reps} → {x.after.reps} reps</span>}
        </div>
      );
    }
    case 'reorder':
      return <div className="nv-sum-ib-change" role="img" aria-label={`${x.exercise?.name} to number ${x.to}`}><ExPill ex={x.exercise} />{x.from ? <span className="nv-sum-ib-cnote">#{x.from}</span> : null}<Arrow /><ExPill ex={{ name: `#${x.to}` }} arrive gold /></div>;
    case 'remap':
      return <div className="nv-sum-ib-change" role="img" aria-label={`${x.exercise?.name} counts as ${x.exercise?.muscle}`}><ExPill ex={{ name: x.exercise?.name, muscle: x.before }} /><Arrow /><ExPill ex={{ name: x.exercise?.muscle, muscle: x.exercise?.muscle }} arrive /></div>;
    case 'schedule':
      return (
        <div className="nv-sum-ib-week" role="img" aria-label={(x.week || []).filter((d) => d.changes).map((d) => `${d.day}: ${d.before} becomes ${d.after}`).join('; ')}>
          {(x.week || []).map((d) => (
            <div key={d.day} className={d.changes ? 'chg' : undefined}>
              <span className="d">{d.day}</span>
              {d.changes && <span className="b">{d.before}</span>}
              <span className="a">{d.after}</span>
            </div>
          ))}
        </div>
      );
    case 'gauge':
      return (
        <div className="nv-sum-ib-gauge" role="img" aria-label={`${Math.round(x.pct)}% ${x.label || ''}`}>
          <span className="bar"><i style={{ width: `${Math.max(0, Math.min(100, x.pct))}%` }} /></span>
          <span className="nv-sum-ib-cnote">{Math.round(x.pct)}% {x.label}</span>
        </div>
      );
    default:
      return null;
  }
}

// the working line's clock: real seconds from the research record's start
function WorkingClock({ startedAt, stage }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const t = Date.parse(startedAt || '');
  // the clock first: it is what moves, and a long stage gives way before it
  return <>{Number.isFinite(t) ? `${elapsedLabel((now - t) / 1000)} · ` : ''}{stage}</>;
}

// LOOK DEEPER, on the card: in flight, returned, stopped, or failed
function DeeperSlot({ d }) {
  if (!d || d.mode !== 'report') return null;
  if (d.busy && d.state !== 'running') {
    return (
      <div className="nv-sum-ib-working" role="status">
        <span className="pd" aria-hidden="true" />
        <span className="lx"><b>Sending the Researcher</b><span className="wx">with this card's own question</span></span>
        <span />
      </div>
    );
  }
  if (d.state === 'running') {
    return (
      <div className="nv-sum-ib-working" role="status">
        <span className="pd" aria-hidden="true" />
        <span className="lx"><b>Nova is looking deeper</b><span className="wx"><WorkingClock startedAt={d.startedAt} stage={d.stage} /></span></span>
        <Interactive as="button" className="stop" onClick={d.stop} haptic="tick" aria-label="Stop watching this look" base={{ cursor: 'pointer' }}>Stop</Interactive>
      </div>
    );
  }
  if (d.state === 'stopped') {
    return <p className="nv-sum-ib-quiet">Stopped watching. The Researcher cannot be called back once it is sent, so if it finishes, its report still lands here.</p>;
  }
  if (d.state === 'error') {
    return (
      <div className="nv-sum-ib-working failed" role="status">
        <span className="pd" aria-hidden="true" />
        <span className="lx"><b>Look deeper did not finish</b><span className="wx">{d.error}</span></span>
        <Interactive as="button" className="stop" onClick={d.start} haptic="tick" base={{ cursor: 'pointer' }}>Try again</Interactive>
      </div>
    );
  }
  if (d.state === 'ready') {
    return (
      <div className="nv-sum-ib-report">
        <span className="nv-sum-ib-bh"><span className="nd" aria-hidden="true" />Report<span className="rt">{d.sources} source{d.sources === 1 ? '' : 's'}{d.when ? ` · asked ${d.when}` : ''}</span></span>
        {d.sentence && <p className="nv-sum-ib-rsay">{d.sentence}</p>}
        <Interactive as="button" className="nv-sum-ib-readr" onClick={d.openReport} haptic="tick" base={{ cursor: 'pointer' }}>
          Read the report<Ico name="right" />
        </Interactive>
      </div>
    );
  }
  return null;
}

// the two quiet blocks: You captured, Will be filed. A tap opens one in full, in place.
function Blocks({ card }) {
  const [open, setOpen] = useState(null);
  const hasCap = !!card.captured;
  const hasWill = card.will.lines.length > 0 || !!card.will.full;
  if (!hasCap && !hasWill) return null;
  const two = hasCap && hasWill && !open;
  return (
    <div className={`nv-sum-ib-qb${two ? '' : ' one'}`}>
      {hasCap && (
        <Interactive as="button" className={`nv-sum-ib-blk${open === 'cap' ? ' open' : ''}`} aria-expanded={open === 'cap'}
          onClick={() => setOpen(open === 'cap' ? null : 'cap')} base={{ cursor: 'pointer' }}>
          <span className="nv-sum-ib-bh"><Ico name="quote" />{card.capturedLabel || 'You captured'}<Ico name="down" className="nv-sum-ib-ico x" /></span>
          {open === 'cap' ? <span className="nv-sum-ib-full">{card.captured}</span> : <span className="nv-sum-ib-bt">“{card.captured}”</span>}
        </Interactive>
      )}
      {hasWill && (
        <Interactive as="button" className={`nv-sum-ib-blk${open === 'will' ? ' open' : ''}`} aria-expanded={open === 'will'}
          onClick={() => setOpen(open === 'will' ? null : 'will')} base={{ cursor: 'pointer' }}>
          <span className="nv-sum-ib-bh"><Ico name="into" />{card.will.label}<Ico name="down" className="nv-sum-ib-ico x" /></span>
          {open === 'will'
            ? <span className="nv-sum-ib-full">{[card.will.lines[0], card.will.full || card.will.lines.slice(1).join('\n')].filter(Boolean).join('\n\n')}</span>
            : card.will.lines.map((l, i) => <span key={i} className="nv-sum-ib-bt1">{l}</span>)}
        </Interactive>
      )}
    </div>
  );
}

// the ask-why panel: reasons as chips, his own words, discard or keep
function AskWhy({ a }) {
  const [text, setText] = useState(a.text || '');
  return (
    <div className="nv-sum-ib-ask">
      <span className="q">{a.q}</span>{a.rest ? <span className="rest"> {a.rest}</span> : null}
      <div className="nv-sum-ib-chips">
        {a.chips.map((c) => <Interactive key={c} as="button" className="nv-sum-ib-chip" onClick={() => a.submit(c)} haptic="tick" base={{ cursor: 'pointer' }}>{c}</Interactive>)}
      </div>
      <input className="nv-sum-ib-own" value={text} placeholder="Or say it in your own words" aria-label="Your reason, in your own words"
        onChange={(e) => { setText(e.target.value); a.onText?.(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') a.submit(text.trim() || undefined); }} />
      <div className="nv-sum-ib-askrow">
        <Interactive as="button" className="nv-sum-ib-discard" onClick={() => a.submit(text.trim() || undefined)} haptic="commit" base={{ cursor: 'pointer' }}>
          {text.trim() ? 'Discard with reason' : 'Discard anyway'}
        </Interactive>
        <Interactive as="button" className="nv-sum-ib-keep" onClick={a.cancel} haptic="tick" base={{ cursor: 'pointer' }}>Keep it</Interactive>
      </div>
    </div>
  );
}

// SEEN, WITHOUT A BUTTON: three seconds as the top card, while the page is
// actually in front of him, and it is marked once (valsInboxSummary).
function useAutoSeen(card) {
  const id = card?.id;
  const seen = !!card?.seen;
  const mark = useRef(null);
  mark.current = card?.markSeen || null;
  useEffect(() => {
    if (!id || seen) return undefined;
    const shownAt = Date.now();
    const t = setTimeout(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (autoSeenDue(shownAt, Date.now())) mark.current?.();
    }, AUTO_SEEN_MS + 40);
    return () => clearTimeout(t);
  }, [id, seen]);
}

function DeckCard({ card, ghosts, position }) {
  useAutoSeen(card);
  const d = card.deeper;
  const running = d && d.mode === 'report' && (d.state === 'running' || d.busy);
  const deeperOff = !d || running;
  return (
    <div className="nv-sum-ib-deck">
      {ghosts > 1 && <div className="nv-sum-ib-ghost g2" aria-hidden="true" />}
      {ghosts > 0 && <div className="nv-sum-ib-ghost g1" aria-hidden="true" />}
      <div className={card.leaving ? `nv-leave-${card.leaving}` : 'nv-deck-rise'} style={{ position: 'relative' }}>
        <SwipeRow
          right={card.swipe.right ? { label: 'File', icon: '✓', tone: 'var(--nv-good)', run: card.swipe.right } : null}
          left={{ label: 'Discard', icon: '✕', tone: 'var(--nv-warn)', run: card.swipe.left }}>
          <article className={`nv-sum-card nv-sum-ib-card${running ? ' waiting' : ''}`} aria-label={`${position}: ${card.sentence}`} aria-busy={running ? 'true' : 'false'}>
            <div className="nv-sum-ib-khead">
              <Tile tile={card.tile} />
              <span className="lx">
                <span className="nv-sum-ib-kl" style={{ color: TONE_HUE[card.tile.tone] || 'var(--nv-sum-ink2)' }}>{card.kindLabel}{card.low ? ' · low confidence' : ''}</span>
                <span className="nv-sum-ib-kt">{card.where}</span>
              </span>
              <span className="nv-sum-ib-when">{card.when}</span>
            </div>
            <p className="nv-sum-ib-say">{card.sentence}</p>
            {card.tldr && (
              <ol className="nv-sum-ib-tldr">
                {card.tldr.items.map((t, i) => <li key={i}>{t}</li>)}
                {card.tldr.more > 0 && <li className="more">and {card.tldr.more} more in the report</li>}
              </ol>
            )}
            <ChangeDrawn change={card.change} />
            <Blocks key={card.id} card={card} />
            {card.adjustments && (
              <ul className="nv-sum-ib-adj">
                {card.adjustments.map((a, i) => (
                  <li key={i} className={a.outcome ? 'marked' : undefined}>
                    <span className="n">{i + 1}</span>
                    <span className="lx"><span className={a.outcome === 'done' ? 't done' : 't'}>{a.text}</span>{a.why && <span className="w">{a.why}</span>}</span>
                    <span className="marks">
                      <Interactive as="button" className={`nv-sum-ib-mark${a.outcome === 'done' ? ' on' : ''}`} onClick={() => a.mark('done')} haptic="tick" base={{ cursor: 'pointer' }}>Done</Interactive>
                      <Interactive as="button" className={`nv-sum-ib-mark${a.outcome === 'skipped' ? ' off' : ''}`} onClick={() => a.mark('skipped')} haptic="tick" base={{ cursor: 'pointer' }}>Not today</Interactive>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <DeeperSlot d={d} />
            <div className="nv-sum-ib-srcrow">
              <p className="nv-sum-ib-src">{card.reason}</p>
              {d && (
                <Interactive as="button" className="nv-sum-ib-deeper" aria-disabled={deeperOff ? 'true' : undefined}
                  onClick={deeperOff ? undefined : d.start} haptic={deeperOff ? undefined : 'tick'} base={{ cursor: deeperOff ? 'default' : 'pointer' }}>
                  <Ico name="search" />{d.label}
                </Interactive>
              )}
            </div>
            {card.stale && <p className="nv-sum-ib-quiet gold">Already changed: {card.stale}. Clear it with ✕, or talk about it.</p>}
            {card.error && <p className="nv-sum-ib-err">{card.error}</p>}
            {card.ask && <AskWhy key={card.id} a={card.ask} />}
            <Verbs verbs={card.verbs} busy={card.busy} tight />
          </article>
        </SwipeRow>
      </div>
    </div>
  );
}

function RailRow({ rail, position }) {
  if (!rail || !rail.total) return null;
  return (
    <div className="nv-sum-ib-railrow">
      {rail.bar ? (
        <span className="nv-sum-ib-rail bar" aria-hidden="true">
          <i className="done" style={{ width: `${rail.bar.done * 100}%` }} />
          <i className="on" style={{ left: `${rail.bar.done * 100}%`, width: `${Math.max(rail.bar.on * 100, 1.5)}%` }} />
        </span>
      ) : (
        <span className="nv-sum-ib-rail" aria-hidden="true">{rail.marks.map((m, i) => <i key={i} className={m === 'wait' ? undefined : m} />)}</span>
      )}
      {position && <span className="nv-sum-ib-pos">{position}</span>}
    </div>
  );
}

function SubjectCard({ s, i }) {
  return (
    <div className="nv-sum-card nv-sum-ib-scard nv-sum-rise" style={{ '--i': 2 + i * 0.25 }}>
      <Interactive as="div" className="open" onClick={s.open} haptic="tick" aria-label={`Open ${s.name}, ${s.count} waiting`} base={{ cursor: 'pointer' }}>
        <span className="nm"><i className="nv-sum-ib-dot" style={{ '--h': TONE_HUE[s.tone] || 'var(--nv-ink40)' }} />{s.name}</span>
        <span className="nv-sum-ib-num s wait">{s.count}</span>
      </Interactive>
      {s.all && (
        <Interactive as="button" className="nv-sum-ib-allb" aria-label={s.aria} haptic="commit" base={{ cursor: s.busy ? 'default' : 'pointer' }}
          onClick={s.busy ? undefined : s.all}>
          <Ico name="check" />{s.busy ? '…' : `all ${s.fileable}`}
        </Interactive>
      )}
    </div>
  );
}

// the receipt a decision leaves: green, holding Undo; it goes after a while
function Receipt({ r }) {
  const [gone, setGone] = useState(null);
  const at = r?.at;
  useEffect(() => {
    if (!at) return undefined;
    const t = setTimeout(() => setGone(at), 45_000);
    return () => clearTimeout(t);
  }, [at]);
  if (!r || gone === r.at) return null;
  return (
    <div className={`nv-sum-ib-receipt ${r.tone}`} role="status" key={r.at}>
      <span className="ok" aria-hidden="true"><Ico name={r.tone === 'discard' ? 'x' : r.tone === 'busy' ? 'loop' : 'check'} /></span>
      <span className="rx"><b>{r.title}</b><span>{r.sub}</span></span>
      {r.undo ? <TextAction onClick={r.undo.busy ? undefined : r.undo.run} disabled={r.undo.busy}>{r.undo.busy ? '…' : 'Undo'}</TextAction> : <span />}
    </div>
  );
}

function FiledRow({ row }) {
  return (
    <div data-record={row.id} className={`nv-sum-ib-fitem${row.dim ? ' dim' : ''}`}>
      <div className="nv-sum-ib-frow">
        <Interactive as="div" className="main" onClick={row.toggle} aria-expanded={row.expanded}
          aria-label={`${row.title}, ${row.kindLabel}${row.state ? `, ${row.state}` : ''}. ${row.expanded ? 'Hide' : 'Show'} the details`}
          base={{ cursor: 'pointer' }} activeStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 8%, transparent)' }}>
          <span className="t">{row.time}</span>
          <Tile tile={row.tile} tick={row.tick} title={row.kindLabel} />
          <span className="ti">{row.title}</span>
        </Interactive>
        {row.action
          ? <TextAction onClick={row.action.busy ? undefined : row.action.run} disabled={row.action.busy}>{row.action.busy ? '…' : row.action.label}</TextAction>
          : <span className="st">{row.state}</span>}
      </div>
      {row.expanded && (
        <div className="nv-sum-ib-fdetail">
          {row.detail.line && <span className="dl">{row.detail.line}</span>}
          {row.detail.captured && <div><span className="k">You captured</span><span className="v">{row.detail.captured}</span></div>}
          {row.detail.full && <div><span className="k">{row.detail.fullLabel}</span><span className="v">{row.detail.full}</span></div>}
          {(row.detail.dismiss || row.detail.weave) && (
            <div className="acts">
              {row.detail.weave && <TextAction onClick={row.detail.weave.run} disabled={row.detail.weave.busy}>Deep weave</TextAction>}
              {row.detail.dismiss && <TextAction tone="warn" onClick={row.detail.dismiss.run} disabled={row.detail.dismiss.busy}>{row.detail.dismiss.busy ? '…' : 'Dismiss'}</TextAction>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Filed({ f }) {
  return (
    <>
      <div className="nv-sum-ib-count nv-sum-rise" style={{ '--i': 1 }}>
        <span className="nv-sum-ib-num">{f.count}</span>
        <div className="nv-sum-ib-cx"><b>on the record</b><span>{f.sub}</span></div>
      </div>
      {f.honest && <p className="nv-sum-ib-honest nv-sum-rise" style={{ '--i': 2 }}><Ico name="checkc" /><span>{f.honest}</span></p>}
      {!f.groups.length && f.empty && <p className="nv-sum-ib-quiet center">{f.empty}</p>}
      {f.groups.map((g, i) => (
        <section key={g.key} className="nv-sum-ib-group nv-sum-rise" style={{ '--i': 3 + Math.min(i, 4) }} aria-label={g.label}>
          <Eyebrow as="h2" tone="quiet" style={{ margin: '0 0 6px 14px' }}>{g.label} · {g.rows.length}</Eyebrow>
          <div className="nv-sum-card nv-sum-ib-rows">
            {g.rows.map((row) => <FiledRow key={row.id} row={row} />)}
          </div>
        </section>
      ))}
      {f.moreLabel && (
        <Interactive as="button" className="nv-sum-ib-more" onClick={f.showMore} haptic="tick" base={{ cursor: 'pointer' }}>{f.moreLabel}</Interactive>
      )}
    </>
  );
}

function Waiting({ S, v }) {
  const card = S.card;
  const ops = S.ops;
  return (
    <>
      <div className="nv-sum-ib-count nv-sum-rise" style={{ '--i': 1 }}>
        <span className={`nv-sum-ib-num${S.count ? ' wait' : ''}`}>{S.count}</span>
        <div className="nv-sum-ib-cx">
          <b>waiting on your call</b>
          {S.digestLine && <span>{S.digestLine}</span>}
          <RailRow rail={S.rail} position={S.position} />
        </div>
      </div>
      {S.subjects.length > 0 && (
        <div className="nv-sum-ib-trio">
          {S.subjects.map((s, i) => <SubjectCard key={s.key} s={s} i={i} />)}
        </div>
      )}
      {S.focus && (
        <div className="nv-sum-ib-focus">
          <span>Showing {S.focus.name} · {S.focus.count}</span>
          <TextAction tone="quiet" onClick={S.focus.clear}>Back to all</TextAction>
        </div>
      )}
      {card
        ? <DeckCard key={card.id} card={card} ghosts={S.ghosts} position={S.position} />
        : (
          <div className="nv-sum-card nv-sum-ib-empty nv-sum-rise" style={{ '--i': 3 }}>
            <Tile tile={{ tone: 'vault', glyph: 'checkc' }} />
            <p>Nothing is waiting on your call. Everything that came in has been filed or answered.</p>
          </div>
        )}
      <Receipt r={S.receipt} />
      <Interactive as="button" className="nv-sum-ib-hint" onClick={S.openCapture} haptic="tick" base={{ cursor: 'pointer' }}>
        Drop a thought: hold <span className="orb" aria-hidden="true"><NovaCore size={18} variant="mini" engine={v.coreStyle} style={{ pointerEvents: 'none' }} /></span> Nova, or tap to write it
      </Interactive>
      {ops && ops.live && (
        <Interactive as="button" className="nv-sum-card nv-sum-ib-oprow nv-sum-rise" style={{ '--i': 6 }} onClick={ops.openOps} haptic="tick" base={{ cursor: 'pointer' }}
          aria-label={`Loops, in Agents and Operations: ${ops.summary}`}>
          <span className="nv-sum-ib-dots7" aria-hidden="true">{ops.dots.map((d, i) => <i key={i} className={`d-${d}`} />)}</span>
          <span className="nv-sum-ib-lx"><span className="nm">Loops · Agents &amp; Operations</span><span className="sv">{ops.summary}</span></span>
          <Ico name="right" className="nv-sum-ib-ico cv" />
        </Interactive>
      )}
    </>
  );
}

export function InboxSummary({ v }) {
  const S = v.inboxSummary;
  // the batch on the rail is this visit's; a new visit starts it again
  const reset = useRef(S.resetBatch);
  useEffect(() => { reset.current?.(); }, []);
  return (
    <div style={v.wrapMission} data-screen-label="Inbox">
      <div className="nv-sum-ib" style={{ maxWidth: '760px', margin: '0 auto' }}>
        <div className="nv-sum-ib-top nv-sum-rise" style={{ '--i': 0 }}>
          <h1 className="nv-sum-ib-h1">Inbox</h1>
          <span className="nv-sum-ib-seg">
            <Segmented stretch ariaLabel="Inbox" options={[['waiting', 'Waiting'], ['filed', 'Filed']]} value={S.tab} onChange={S.setTab} />
          </span>
        </div>
        {S.offline && <p className="nv-sum-ib-quiet">Offline. This is the last-known Inbox; a capture waits in the Outbox until Nova reconnects.</p>}
        {!S.connected ? (
          <div className="nv-sum-card nv-sum-ib-empty nv-sum-rise" style={{ '--i': 1 }}>
            <Tile tile={{ tone: 'vault', glyph: 'link' }} />
            <p>The Inbox is live only. Connect a backend in Settings; captures write to your real vault.</p>
          </div>
        ) : S.loading ? (
          <div className="nv-sum-ib-loading" aria-label="Loading the Inbox">
            <div className="nv-sum-ib-count"><SkeletonBar w="60px" h="44px" radius="12px" /><div><SkeletonBar w="60%" h="15px" /><SkeletonBar w="40%" h="12px" style={{ marginTop: '8px' }} /></div></div>
            <div className="nv-sum-card nv-sum-ib-card" style={{ marginTop: '26px' }}>
              <SkeletonBar w="45%" h="14px" /><SkeletonBar w="90%" h="20px" style={{ marginTop: '14px' }} /><SkeletonBar w="70%" h="20px" style={{ marginTop: '8px' }} />
              <SkeletonBar w="100%" h="56px" radius="14px" style={{ marginTop: '14px' }} />
            </div>
          </div>
        ) : S.tab === 'filed' && S.filed ? <Filed f={S.filed} /> : <Waiting S={S} v={v} />}
      </div>
      {S.report && <DeeperReportSheet r={S.report} />}
    </div>
  );
}
