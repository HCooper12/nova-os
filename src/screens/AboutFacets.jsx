import { useEffect, useRef, useState } from 'react';
import { Button, TextAction } from '../Controls.jsx';
import { NumberRoll } from '../NumberRoll.jsx';
import { Group } from './SettingsKit.jsx';

// ABOUT YOU, IN NINE PARTS (26 Oct 2026, his ask: "improve the About me
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
        : 'Nothing yet. Talk it through and Nova fills these in as you go.';
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
          <Button onClick={() => Y.startTalk(null)} style={{ width: '100%' }}>
            <svg className="nv-set-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
            Talk to Nova about you
          </Button>
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
      <span className="nv-ab-tx">{s.text ? excerpt(s.text) : s.hint || 'Nothing yet'}</span>
    </button>
  );
}

function OpenPart({ s, Y, origin, onClose, staleAt }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.text);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const st = stateOf(s);
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
          {s.text
            ? <p className="nv-ab-full">{s.text}</p>
            : <p className="nv-ab-full none">Nova does not know this part yet. Tell him, or write it yourself.</p>}
          {st === 'draft' ? <p className="nv-ab-note">Claude drafted this from your vault{on ? ` on ${on}` : ''}. Nova treats it as a guess until you say it is right.</p> : null}
          {Y.readOnly ? (
            <p className="nv-ab-note">Offline{staleAt ? `: as your vault said it at ${staleAt}` : ''}, read only.</p>
          ) : (
            <div className="nv-ab-acts">
              {st === 'draft' ? <Button compact tone={s.hue} disabled={busy} onClick={() => run(Y.confirmSection?.(s.key))}>{busy ? 'Saving' : "That's right"}</Button> : null}
              <Button compact variant="soft" tone={s.hue} disabled={busy} onClick={() => setEditing(true)}>{s.text ? 'Edit' : 'Write it'}</Button>
              <Button compact variant="soft" tone={s.hue} disabled={busy} onClick={() => Y.startTalk?.(s.key)}>Tell Nova</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function AboutFacets({ Y, staleAt }) {
  const [openKey, setOpenKey] = useState(null);
  const [place, setPlace] = useState({ origin: 50, after: 0 });
  const grid = useRef(null);
  const sections = Y.sections || [];
  const k = Y.knows || { filled: 0, confirmed: 0, total: sections.length || 9 };
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
  const foot = `Nova reads this before every answer, coaching session and brief. Tap a part to read it, fix it, or tell him more.${Y.demo ? ' Demo words.' : ''}${Y.readOnly && staleAt ? ` Offline: as your vault said it at ${staleAt}, read only.` : ''}`;
  return (
    <Group label="About you" k="about" i={2} plain foot={foot}>
      <Hero Y={Y} k={k} />
      <div ref={grid} className="nv-ab-grid">
        {sections.flatMap((s, i) => {
          const tile = <Tile key={s.key} s={s} i={i} open={openKey === s.key} onTap={() => tap(s, i)} />;
          return open && i === place.after
            ? [tile, <OpenPart key={`open-${open.key}`} s={open} Y={Y} origin={place.origin} staleAt={staleAt} onClose={() => setOpenKey(null)} />]
            : [tile];
        })}
      </div>
    </Group>
  );
}
