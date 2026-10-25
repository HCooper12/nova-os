import { useEffect, useRef, useState } from 'react';
import { Button, TextAction } from '../Controls.jsx';
import { NumberRoll } from '../NumberRoll.jsx';
import { Group } from './SettingsKit.jsx';
import { PROFILE_OPTIONS, OPTIONS_SHOWN } from '../../server/lib/profileOptions.js';

// ABOUT YOU, IN TWELVE PARTS (27 Oct: "interview me just like you would...
// options I can further expand upon... ensure Nova is undoubtedly using all
// of this"). The hero now starts an interview; a part with options shows
// them as chips in its hue (tap = on or off at once, with Undo), every part
// takes one more line of his own words, and under each open part sits the
// list of the agents that read it: the proof the page is used.
//
// First version: ABOUT YOU, IN NINE PARTS (26 Oct 2026, his ask: "improve the About me
// section... the option to verbally talk with Nova to fill out my profile...
// clean, beautifully aesthetic... remember to use colours").
//
// One hero: the ring of how well Nova knows him, confirmed parts bright and
// Claude's drafts a fainter arc behind, with the one action that matters
// most, talking it through. Under it the nine parts, each in its own hue
// (src/profileSections.js says which and why). A tap opens the part below
// the tile's row, growing out of the tile's side, with the full words and three
// moves: That's right, Edit, Tell Nova. Every write is the view model's
// (valsSettings → App.saveProfileSection), so demo and offline are handled
// there and here alike: demo toasts, offline reads only.

const R = 36;
const CIRC = 2 * Math.PI * R;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const excerpt = (t, n = 72) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t);
// his own words: the section text without the option lines the chips show
const own = (s) => {
  const picked = new Set((s.chosen || []).map((c) => c.toLowerCase()));
  return String(s.text || '').split('\n').filter((l) => !(/^\s*[-*]\s+/.test(l) && picked.has(l.replace(/^\s*[-*]\s+/, '').trim().toLowerCase()))).join('\n').trim();
};
const stateOf = (s) => (!s.text ? 'empty' : s.drafted ? 'draft' : 'confirmed');
const fmtDay = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null;
};

// THE RING (keynote-motion §6): both arcs sweep shut on arrival on the house
// smooth spring, and every later change retargets from where they are. The
// first paint is the empty ring, so the sweep is the arrival; reduced motion
// paints the real arc at once.
function KnowsRing({ confirmed, filled, total }) {
  const [armed, setArmed] = useState(reduced);
  useEffect(() => {
    if (armed) return undefined;
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setArmed(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [armed]);
  const frac = (n) => (armed && total > 0 ? Math.max(0, Math.min(1, n / total)) : 0);
  const whole = total > 0 && confirmed >= total;
  return (
    <div className={`nv-ab-ring${whole ? ' whole' : ''}`} role="img" aria-label={`Nova knows ${confirmed} of ${total} parts in your words, ${Math.max(0, filled - confirmed)} more drafted`}>
      <svg viewBox="0 0 88 88" aria-hidden="true">
        <defs>
          <linearGradient id="nv-ab-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--nv-cy)' }} />
            <stop offset="1" style={{ stopColor: 'var(--nv-vi)' }} />
          </linearGradient>
        </defs>
        <circle className="tr" cx="44" cy="44" r={R} />
        <circle className="dr" cx="44" cy="44" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac(filled))} />
        <circle className="cf" cx="44" cy="44" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac(confirmed))} />
      </svg>
      <span className="nv-ab-rn"><NumberRoll value={confirmed} /><small>/{total}</small></span>
    </div>
  );
}

function Hero({ Y, k }) {
  const drafts = Math.max(0, k.filled - k.confirmed);
  const sub = k.total > 0 && k.confirmed >= k.total
    ? 'All of it in your own words. Talk again whenever something changes.'
    : drafts > 0
      ? `${drafts} drafted by Claude, waiting for your word.`
      : k.confirmed > 0
        ? 'The rest is empty. A short talk fills it in.'
        : 'Nothing yet. An interview fills these in as you go.';
  return (
    <div className="nv-set-card nv-ab-hero">
      <KnowsRing confirmed={k.confirmed} filled={k.filled} total={k.total} />
      <div className="nv-ab-ht">
        <span className="nv-ab-eb">How well Nova knows you</span>
        <h3>Nova knows <NumberRoll value={k.confirmed} /> of {k.total}</h3>
        <p>{sub}</p>
        <div className="nv-ab-key" aria-hidden="true">
          <span><i className="cf" />Your words</span>
          <span><i className="dr" />Claude&apos;s draft</span>
        </div>
      </div>
      {!Y.readOnly && Y.startTalk ? (
        <div className="nv-ab-go">
          <Button onClick={() => Y.startTalk('interview')} style={{ width: '100%' }}>
            <svg className="nv-set-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H11l-4 3.5V16h-.5a2 2 0 0 1-2-2z" /><path d="M10.2 8.6a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.3M12 13.6v.1" /></svg>
            Interview me
          </Button>
          <p className="nv-ab-gosub">Nova asks, you answer. Like getting to know someone.</p>
        </div>
      ) : null}
    </div>
  );
}

const TAG = { confirmed: 'Confirmed', draft: 'Draft', empty: 'Empty' };

function Tile({ s, i, open, onTap }) {
  const st = stateOf(s);
  return (
    <button type="button" className={`nv-set-card nv-ab-tile ${st}${open ? ' open' : ''}`} style={{ '--h': s.hue, '--i': i }}
      onClick={onTap} aria-expanded={open} aria-controls="nv-ab-open">
      <span className="nv-ab-th">
        <i className="nv-ab-mk" aria-hidden="true" />
        <span key={st} className={`nv-ab-tag nv-set-flip ${st}`}>{TAG[st]}</span>
      </span>
      <b>{s.title}</b>
      <span className="nv-ab-tx">{own(s) ? excerpt(own(s)) : s.chosen?.length ? s.chosen.join(' · ') : s.hint || 'Nothing yet'}</span>
      {s.chosen?.length ? <span key={s.chosen.length} className="nv-ab-cnt"><NumberRoll value={s.chosen.length} /> chosen</span> : null}
    </button>
  );
}

// ONE OPTION CHIP (keynote-motion: a toggle flips). Chosen, it fills from
// its centre in the part's hue on the snappy spring and its tick draws;
// unchosen it is a quiet outline. Reduced motion: the fill is just there.
function OptionChip({ phrase, on, onTap, disabled }) {
  return (
    <button type="button" className={`nv-ab-chip${on ? ' on' : ''}`} aria-pressed={on} disabled={disabled} onClick={onTap}>
      <svg className="nv-ab-ck" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 6.3l2.3 2.3 4.9-5" /></svg>
      <span>{phrase}</span>
    </button>
  );
}

function Options({ s, Y }) {
  const list = PROFILE_OPTIONS[s.key] || [];
  const [all, setAll] = useState(false);
  const [over, setOver] = useState({}); // phrase → on, while the server has not said so yet
  const [err, setErr] = useState(null);
  const server = new Set(s.chosen || []);
  const isOn = (p) => (p in over ? over[p] : server.has(p));
  // a chosen option past the first few stays in view; "Show all" brings the rest
  const shown = all ? list : list.filter((p, i) => i < OPTIONS_SHOWN || isOn(p));
  const hidden = list.length - shown.length;
  const tap = (p) => {
    if (Y.readOnly || !Y.toggleOption) return;
    const on = !isOn(p);
    setErr(null);
    setOver((o) => ({ ...o, [p]: on }));
    Promise.resolve(Y.toggleOption(s.key, p, on)).then((r) => {
      // the live profile now carries it; demo keeps the chip as tapped
      if (r?.profile) setOver((o) => { const n = { ...o }; delete n[p]; return n; });
    }).catch((e) => {
      setOver((o) => { const n = { ...o }; delete n[p]; return n; });
      setErr(`Could not ${on ? 'add' : 'take off'} "${p}". ${e?.message || e}`);
    });
  };
  const count = list.filter(isOn).length;
  return (
    <div className="nv-ab-opts">
      <div className="nv-ab-ol">
        <span>Pick what fits</span>
        {count ? <span className="nv-ab-oc"><NumberRoll value={count} /> chosen</span> : null}
      </div>
      <div className="nv-ab-chips">
        {shown.map((p) => <OptionChip key={p} phrase={p} on={isOn(p)} disabled={Y.readOnly} onTap={() => tap(p)} />)}
        {list.length > OPTIONS_SHOWN ? (
          <button type="button" className="nv-ab-more" onClick={() => setAll((x) => !x)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all${hidden ? ` (${hidden} more)` : ''}`}
          </button>
        ) : null}
      </div>
      {err ? <p className="nv-ab-err" role="alert">{err}</p> : null}
    </div>
  );
}

// "Add your own": one line of his words under what is there, saved on return
function AddOwn({ s, Y }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (Y.readOnly || !Y.appendSection) return null;
  const save = () => {
    const t = v.trim();
    if (!t || busy) return;
    setBusy(true); setErr(null);
    Promise.resolve(Y.appendSection(s.key, t)).then(() => setV(''))
      .catch((e) => setErr(`Not added. ${e?.message || e}`)).finally(() => setBusy(false));
  };
  return (
    <div className="nv-ab-add">
      <label className="nv-ab-lab" htmlFor={`nv-ab-add-${s.key}`}>Add your own</label>
      <div className="nv-ab-addrow">
        <input id={`nv-ab-add-${s.key}`} className="nv-set-fin nv-ab-addin" type="text" enterKeyHint="done" autoComplete="off"
          placeholder={PROFILE_OPTIONS[s.key] ? 'Anything the chips miss' : 'One more thing, in your words'}
          value={v} disabled={busy} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        {v.trim() ? <Button compact tone={s.hue} disabled={busy} onClick={save}>{busy ? 'Adding' : 'Add'}</Button> : null}
      </div>
      {err ? <p className="nv-ab-err" role="alert">{err}</p> : null}
    </div>
  );
}

// WHO READS THIS: the agents the server says take About you in. For "How to
// talk to me" the ones that speak to him are named as following it in every
// reply. A failed check says so; it is never hidden.
function Reach({ s, reach }) {
  if (!reach) {
    return (
      <div className="nv-ab-reach" aria-busy="true">
        <span className="nv-ab-rl">Nova reads this in</span>
        <span className="nv-ab-rchips">{[54, 70, 46].map((w) => <i key={w} className="nv-ab-rsk" style={{ width: w }} />)}</span>
      </div>
    );
  }
  if (reach.error) return <div className="nv-ab-reach"><span className="nv-ab-rl">Could not check who reads this</span></div>;
  if (!reach.readers.length) return <div className="nv-ab-reach"><span className="nv-ab-rl">No agent reads this yet</span></div>;
  const talk = s.key === 'talk';
  const follows = talk ? reach.readers.filter((r) => r.talks) : [];
  const rest = talk ? reach.readers.filter((r) => !r.talks) : reach.readers;
  const chips = (list, strong) => list.map((r) => (
    <span key={r.id || r.label} className={`nv-ab-rchip${strong ? ' strong' : ''}`}>{r.label}</span>
  ));
  return (
    <div className="nv-ab-reach">
      {follows.length ? (
        <>
          <span className="nv-ab-rl">Follows it in every reply</span>
          <span className="nv-ab-rchips">{chips(follows, true)}</span>
        </>
      ) : null}
      {rest.length ? (
        <>
          <span className="nv-ab-rl">{follows.length ? 'Also reads it' : 'Nova reads this in'}</span>
          <span className="nv-ab-rchips">{chips(rest, false)}</span>
        </>
      ) : null}
    </div>
  );
}

function OpenPart({ s, Y, origin, onClose, staleAt, reach }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.text);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const st = stateOf(s);
  const hasOpts = !!PROFILE_OPTIONS[s.key];
  const words = own(s);
  useEffect(() => { setEditing(false); setDraft(s.text); }, [s.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }, [s.key]);
  const run = (p) => {
    if (busy || !p) return;
    setBusy(true);
    Promise.resolve(p).then(() => setEditing(false)).catch(() => {}).finally(() => setBusy(false));
  };
  const on = fmtDay(s.draftedOn);
  return (
    <section ref={ref} id="nv-ab-open" key={s.key} className={`nv-set-card nv-ab-open ${st}`} style={{ '--h': s.hue, transformOrigin: `${origin}% 0` }} aria-label={s.title}>
      <div className="nv-ab-oh">
        <i className="nv-ab-mk" aria-hidden="true" />
        <h4>{s.title}</h4>
        <span key={st} className={`nv-ab-tag nv-set-flip ${st}`}>{st === 'draft' ? "Claude's draft" : TAG[st]}</span>
        <button type="button" className="nv-ab-x" onClick={onClose} aria-label="Close">
          <svg className="nv-set-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
        </button>
      </div>
      {editing ? (
        <>
          <label className="nv-ab-lab" htmlFor="nv-ab-ed">In your own words</label>
          <textarea id="nv-ab-ed" className="nv-set-fin nv-ab-ed" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="nv-ab-acts">
            <TextAction onClick={() => { setEditing(false); setDraft(s.text); }}>Cancel</TextAction>
            <Button compact tone={s.hue} disabled={busy || !draft.trim() || draft.trim() === s.text}
              onClick={() => run(Y.saveSection?.(s.key, draft.trim(), true))}>{busy ? 'Saving' : 'Save'}</Button>
          </div>
        </>
      ) : (
        <>
          {words
            ? <p className="nv-ab-full">{words}</p>
            : !hasOpts || !s.chosen?.length
              ? <p className="nv-ab-full none">{hasOpts ? 'Nothing yet. Pick what fits, add your own, or talk it through with Nova.' : 'Nova does not know this part yet. Tell him, or write it yourself.'}</p>
              : null}
          {st === 'draft' ? <p className="nv-ab-note">Claude drafted this from your vault{on ? ` on ${on}` : ''}. Nova treats it as a guess until you say it is right.</p> : null}
          {hasOpts ? <Options s={s} Y={Y} /> : null}
          <AddOwn s={s} Y={Y} />
          {Y.readOnly ? (
            <p className="nv-ab-note">Offline{staleAt ? `: as your vault said it at ${staleAt}` : ''}, read only.</p>
          ) : (
            <div className="nv-ab-acts">
              {st === 'draft' ? <Button compact tone={s.hue} disabled={busy} onClick={() => run(Y.confirmSection?.(s.key))}>{busy ? 'Saving' : "That's right"}</Button> : null}
              <Button compact variant="soft" tone={s.hue} disabled={busy} onClick={() => setEditing(true)}>{s.text ? 'Edit' : 'Write it'}</Button>
              <Button compact variant="soft" tone={s.hue} disabled={busy} onClick={() => Y.startTalk?.('section', s.key)}>{hasOpts ? 'Discuss with Nova' : 'Tell Nova'}</Button>
            </div>
          )}
        </>
      )}
      <Reach s={s} reach={reach} />
    </section>
  );
}

export function AboutFacets({ Y, staleAt }) {
  const [openKey, setOpenKey] = useState(null);
  const [place, setPlace] = useState({ origin: 50, after: 0 });
  const [reach, setReach] = useState(null);
  const grid = useRef(null);
  const sections = Y.sections || [];
  const k = Y.knows || { filled: 0, confirmed: 0, total: sections.length || 12 };
  // who reads About you, asked once per visit (the vals hand a fresh
  // function every render, so the effect keys on whether there is one)
  const loader = useRef(Y.loadReach);
  loader.current = Y.loadReach;
  const canReach = !!Y.loadReach;
  useEffect(() => {
    let live = true;
    if (!canReach) { setReach({ error: true, readers: [] }); return undefined; }
    setReach(null);
    Promise.resolve().then(() => loader.current()).then(
      (readers) => { if (live) setReach({ readers: Array.isArray(readers) ? readers : [] }); },
      () => { if (live) setReach({ error: true, readers: [] }); },
    );
    return () => { live = false; };
  }, [canReach]);
  const open = sections.find((s) => s.key === openKey) || null;
  // the part opens out of its own tile's side: the column it sits in sets
  // where the panel grows from
  const tap = (s, i) => {
    if (openKey === s.key) { setOpenKey(null); return; }
    const cols = grid.current ? getComputedStyle(grid.current).gridTemplateColumns.split(' ').filter(Boolean).length || 2 : 2;
    const col = i % cols;
    // it opens right under the row it came from, spanning the row
    setPlace({ origin: Math.round(((col + 0.5) / cols) * 100), after: Math.min(sections.length - 1, i - col + cols - 1) });
    setOpenKey(s.key);
  };
  const foot = `Nova reads this before every answer, coaching session and brief. Tap a part to pick, add, fix, or talk it through.${Y.demo ? ' Demo words.' : ''}${Y.readOnly && staleAt ? ` Offline: as your vault said it at ${staleAt}, read only.` : ''}`;
  return (
    <Group label="About you" k="about" i={2} plain foot={foot}>
      <Hero Y={Y} k={k} />
      <div ref={grid} className="nv-ab-grid">
        {sections.flatMap((s, i) => {
          const tile = <Tile key={s.key} s={s} i={i} open={openKey === s.key} onTap={() => tap(s, i)} />;
          return open && i === place.after
            ? [tile, <OpenPart key={`open-${open.key}`} s={open} Y={Y} origin={place.origin} staleAt={staleAt} reach={reach} onClose={() => setOpenKey(null)} />]
            : [tile];
        })}
      </div>
    </Group>
  );
}
