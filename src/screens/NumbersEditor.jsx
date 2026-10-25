import { useEffect, useMemo, useRef, useState } from 'react';
import { TextAction, Segmented, Select, Chip, Rail } from '../Controls.jsx';
import { NumberRoll } from '../NumberRoll.jsx';
import { ACTIVITY, PACE, GOALS, compute, mergeFacts, bodyFat } from '../../server/lib/intake.js';
import { VISUAL_BANDS, GUIDE_URL, estimateBodyFat } from '../../server/lib/bodyFatEstimate.js';

// YOUR NUMBERS, EDITABLE (26 Oct 2026, his ask): "I should be able to go back
// and edit it without going back through the entire process again." The
// answers that do not change (sex, height) are kept; pace is one tap up
// front; the rest sits behind "Change more". The preview is the Intake's own
// compute() — one arithmetic, imported, never re-typed here — so the number
// that rolls is the number his yes will write.
//
// EVERY CHANGE SAVES AS HE MAKES IT (27 Oct 2026, his report: "I thought it
// saved but it had not. Twice it also reset for no reason"). The first
// version previewed a tapped pace in place and waited for "Use these"; the
// server log shows his phone opened the editor six times and never sent a
// save, so the preview read as done and was thrown away when he left the
// page. Now a tap saves at once, a typed number saves when he leaves the box,
// saves run one after another, and the card says Saving, Saved or the real
// reason it did not save, in the card itself. Undo is on the receipt.
const PACE_WORD = { gentle: 'Gentle', steady: 'Steady', aggressive: 'Aggressive' };
const GOAL_WORD = { lose: 'Lose', maintain: 'Maintain', gain: 'Gain' };
const ACT_WORD = { sedentary: 'Sedentary', light: 'Light', moderate: 'Moderate', very: 'Very active', athlete: 'Athlete' };
const fmt = (n) => Number(n).toLocaleString('en-AU');
const signed = (n, unit = '') => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}${unit}`;

export function NumbersEditor({ n, apply, loadContext, runReview, readOnly, demo }) {
  const stored = useMemo(() => n.facts || {}, [n.facts]);
  // what he has changed and not yet seen come back from the Mac: shown at once,
  // dropped key by key as each save lands
  const [change, setChange] = useState({});
  const [status, setStatus] = useState(null); // { state: 'saving'|'saved'|'error', text, retry }
  const queue = useRef(Promise.resolve());
  const [more, setMore] = useState(false);
  const [ctx, setCtx] = useState(null); // { known, review } from the Mac
  const [showChecks, setShowChecks] = useState(false);
  const [checking, setChecking] = useState(false);
  const [rev, setRev] = useState(0);
  const [estimating, setEstimating] = useState(false); // remounts the number fields after an outside change

  useEffect(() => {
    if (!loadContext) return undefined;
    let live = true;
    loadContext().then((c) => { if (live) setCtx(c); }).catch(() => { if (live) setCtx({ known: {}, review: null, failed: true }); });
    return () => { live = false; };
    // once per visit: the vals hand a fresh function each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the live preview: stored answers with only what he changed laid over them
  const facts = useMemo(() => mergeFacts(stored, change), [stored, change]);
  const plan = useMemo(() => { try { return compute(facts); } catch { return null; } }, [facts]);
  const pending = Object.keys(change).length > 0;
  const shown = pending && plan ? plan : n.plan;
  const preview = (obj) => setChange((c) => ({ ...c, ...obj }));
  // SAVE: shown at once, sent in order, and the card says how it went
  const save = (obj) => {
    const real = Object.fromEntries(Object.entries(obj).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(stored[k] ?? null)));
    if (!Object.keys(real).length) { setChange((c) => { const nx = { ...c }; for (const k of Object.keys(obj)) delete nx[k]; return nx; }); return; }
    if (!apply || readOnly) { setStatus({ state: 'error', text: readOnly ? 'Not saved: offline. Reconnect to the Mac and change it again.' : 'Not saved: this view cannot write.' }); return; }
    preview(real);
    setStatus({ state: 'saving', text: 'Saving' });
    const drop = () => setChange((c) => { const nx = { ...c }; for (const [k, v] of Object.entries(real)) if (JSON.stringify(nx[k]) === JSON.stringify(v)) delete nx[k]; return nx; });
    queue.current = queue.current.then(() => apply(real)).then((r) => {
      drop();
      setStatus({ state: 'saved', text: r?.plan ? `Saved. ${fmt(r.plan.targetKcal)} kcal and ${r.plan.proteinG} g protein from today on.` : 'Saved.' });
    }, (e) => {
      drop();
      setRev((x) => x + 1);
      setStatus({ state: 'error', text: `Not saved: ${String(e?.message || 'the Mac did not answer').replace(/\.$/, '')}.`, retry: () => save(real) });
    });
  };
  const set = (k, v) => save({ [k]: v });

  const known = ctx?.known || {};
  const newerWeight = known.weightKg && Math.abs(Number(known.weightKg.value) - Number(facts.weightKg)) >= 0.1 ? known.weightKg : null;
  const healthFat = known.bodyFatPct && bodyFat(known.bodyFatPct.value) !== bodyFat(facts.bodyFatPct) ? known.bodyFatPct : null;
  const formula = shown?.bmrFormula === 'katch-mcardle' || bodyFat(facts.bodyFatPct) != null
    ? `Katch-McArdle · ${bodyFat(facts.bodyFatPct)}% body fat${Array.isArray(facts.bodyFatRange) ? `, the middle of your ${facts.bodyFatRange[0]}–${facts.bodyFatRange[1]}% estimate` : facts.bodyFatMethod === 'health' ? ' from Apple Health' : ''}`
    : 'Mifflin-St Jeor · add your body fat % for Katch-McArdle';


  const review = ctx?.review;
  const reviewHead = review
    ? review.verdict === 'propose' ? 'Suggested a change. It is waiting in the Inbox.'
      : review.verdict === 'not-enough' ? 'Not enough logged days or weigh-ins yet to judge your burn.'
        : review.verdict === 'implausible' ? 'Your log and the scale disagree, so nothing was changed.'
          : 'Your numbers still fit. Nothing to change.'
    : 'Runs each Monday against your weigh-ins, food log, Apple Health and training.';

  return (
    <>
      <div className={`nv-set-nums${status?.state === 'saving' ? ' is-draft' : ''}`}>
        <span><b><NumberRoll value={shown?.targetKcal} /></b><span>kcal a day</span></span>
        <span><b><NumberRoll value={shown?.proteinG} format={(v) => `${Math.round(v)} g`} /></b><span>protein floor</span></span>
        <span><b><NumberRoll value={shown?.tdee} /></b><span>daily burn</span></span>
      </div>
      <p className="nv-set-numf">{formula}</p>

      {status ? (
        <div className={`nv-set-numd is-${status.state}`} role="status" aria-live="polite" key={status.state + status.text}>
          <span>{status.state === 'saving' ? <i className="nv-set-numsp" aria-hidden="true" /> : status.state === 'saved' ? <i className="nv-set-numok" aria-hidden="true" /> : null}{status.text}
            {status.state === 'saved' ? <span> Past days keep their own targets. Undo is on the receipt.</span> : null}</span>
          {status.state === 'error' && status.retry ? <span className="nv-set-numa"><TextAction onClick={status.retry}>Try again</TextAction></span> : null}
        </div>
      ) : null}

      {facts.goal !== 'maintain' ? (
        <div className="nv-set-numr">
          <span className="nv-set-rl">Pace</span>
          <Segmented stretch ariaLabel="How fast" value={facts.pace || 'steady'} onChange={(v) => set('pace', v)}
            options={Object.keys(PACE).map((k) => [k, PACE_WORD[k]])} />
          <span className="nv-set-rs">{PACE[facts.pace || 'steady'].label.split('— ')[1]}</span>
        </div>
      ) : null}

      {more ? (
        <div className="nv-set-numm">
          <div className="nv-set-numr">
            <span className="nv-set-rl">Goal</span>
            <Segmented stretch ariaLabel="Goal" value={facts.goal} onChange={(v) => set('goal', v)} options={GOALS.map((g) => [g, GOAL_WORD[g]])} />
          </div>
          <div className="nv-set-numr">
            <span className="nv-set-rl">Activity</span>
            <Select ariaLabel="Activity" value={facts.activity} onChange={(e) => set('activity', e.target.value)}
              options={Object.keys(ACTIVITY).map((k) => ({ value: k, label: ACT_WORD[k] }))} />
            <span className="nv-set-rs">{ACTIVITY[facts.activity]?.label.split('— ')[1]}</span>
          </div>
          <label className="nv-set-numr nv-set-numi">
            <span className="nv-set-rl">Weight</span>
            <span><NumField key={`weightKg${rev}`} value={facts.weightKg} min={35} max={250} onValue={(v) => preview({ weightKg: v ?? stored.weightKg })} onCommit={(v) => save({ weightKg: v ?? stored.weightKg })} label="Weight in kilograms" /> kg</span>
            {newerWeight ? <Chip onClick={() => { set('weightKg', newerWeight.value); setRev((r) => r + 1); }}>Use {newerWeight.value} kg from {newerWeight.on}</Chip> : null}
          </label>
          <div className="nv-set-numr nv-set-numi">
            <span className="nv-set-rl">Body fat</span>
            <span>
              <NumField key={`bodyFatPct${rev}`} value={facts.bodyFatPct} min={3} max={60} onValue={(v) => preview({ bodyFatPct: v })} onCommit={(v) => save({ bodyFatPct: v })} label="Body fat percent" /> %
              {Array.isArray(facts.bodyFatRange) ? <span className="nv-set-numrg">estimate {facts.bodyFatRange[0]}–{facts.bodyFatRange[1]}%</span> : null}
            </span>
            {healthFat ? <Chip onClick={() => { save({ bodyFatPct: healthFat.value, bodyFatMethod: 'health' }); setRev((r) => r + 1); }}>Use {healthFat.value}% from Apple Health</Chip>
              : bodyFat(facts.bodyFatPct) == null ? <span className="nv-set-rs">None in Apple Health. Estimate it from the visual guide and a tape measure.</span> : null}
            {!healthFat && !estimating ? <TextAction onClick={() => setEstimating(true)}>{bodyFat(facts.bodyFatPct) == null ? 'Estimate it' : 'Estimate again'}</TextAction> : null}
            {estimating ? (
              <BodyFatEstimator sex={stored.sex} heightCm={stored.heightCm} start={facts}
                onUse={(e) => { save(e); setEstimating(false); setRev((r) => r + 1); }}
                onClose={() => setEstimating(false)} />
            ) : null}
          </div>
          <label className="nv-set-numr nv-set-numi">
            <span className="nv-set-rl">Age</span>
            <span><NumField key={`age${rev}`} value={facts.age} min={14} max={90} integer onValue={(v) => preview({ age: v ?? stored.age })} onCommit={(v) => save({ age: v ?? stored.age })} label="Age in years" /> years</span>
          </label>
          <p className="nv-set-numk">Kept from your Intake: {stored.sex}, {stored.heightCm} cm. Nova will not ask again.</p>
        </div>
      ) : null}

      <div className="nv-set-row nx">
        <span className="nv-set-rt"><span className="nv-set-rs">Set {n.on}{n.facts?.tdeeAdjust ? `, calibrated ${signed(n.facts.tdeeAdjust)} kcal by the weekly review` : ''}.</span></span>
        <TextAction onClick={() => setMore((m) => !m)}>{more ? 'Fewer' : 'Change more'}</TextAction>
      </div>

      <div className="nv-set-numw">
        <div className="nv-set-ladh">
          <b>Weekly review</b>
          <span>{review?.on ? `checked ${review.on}` : demo ? 'demo' : ctx ? 'not run yet' : ''}</span>
        </div>
        {ctx || demo ? <p className="nv-set-rs">{reviewHead}</p> : <p className="nv-set-sk nv-set-numsk" aria-hidden="true" />}
        {review?.lines?.length ? (
          showChecks
            ? <ul className="nv-set-numl">{review.lines.map((l, i) => <li key={i} style={{ '--i': i }}>{l}</li>)}</ul>
            : null
        ) : null}
        <span className="nv-set-numa">
          {review?.lines?.length ? <TextAction tone="faint" onClick={() => setShowChecks((s) => !s)}>{showChecks ? 'Hide' : 'What it checked'}</TextAction> : null}
          {runReview ? (
            <TextAction disabled={checking || readOnly} onClick={() => {
              setChecking(true);
              runReview().then((r) => { setCtx((c) => ({ ...(c || {}), review: r })); setShowChecks(true); }).catch(() => {}).finally(() => setChecking(false));
            }}>{checking ? 'Checking' : 'Check now'}</TextAction>
          ) : null}
        </span>
      </div>
    </>
  );
}

// A number field that keeps what he is typing (an empty box, "84.") while
// the preview takes only a value inside the believable band; an outside value
// or an empty box hands up null, and the caller decides what null means.
// A value set from outside (a "Use 84.3 kg" tap, Cancel) remounts it by key.
function NumField({ value, min, max, integer, onValue, onCommit, label }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const parse = (t) => {
    const v = parseFloat(String(t).replace(',', '.'));
    return Number.isFinite(v) && v >= min && v <= max ? (integer ? Math.round(v) : Math.round(v * 10) / 10) : null;
  };
  // a typed number saves when he leaves the box or presses return, never per keystroke
  // (save() itself drops a value equal to what is stored, so a blur with no change writes nothing)
  const commit = () => { if (onCommit) onCommit(parse(text)); };
  return (
    <input inputMode={integer ? 'numeric' : 'decimal'} enterKeyHint="done" placeholder="—" aria-label={label} value={text}
      onChange={(e) => { setText(e.target.value); onValue(parse(e.target.value)); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

// THE ESTIMATE (26 Oct 2026, his ask): no scale and no scan, so a range from
// the ATHLEAN-X visual guide (the one the Protocols book points to), checked
// by the US Navy tape method and relative fat mass. The arithmetic and the
// combining rule are server/lib/bodyFatEstimate.js, imported, so what this
// shows is what the plan will use.
function BodyFatEstimator({ sex, heightCm, start, onUse, onClose }) {
  const startBand = VISUAL_BANDS.find((b) => Array.isArray(start.bodyFatRange) && b.lo === start.bodyFatRange[0] && b.hi === start.bodyFatRange[1])?.id || null;
  const [bandId, setBandId] = useState(startBand);
  const [waistCm, setWaist] = useState(start.waistCm ?? null);
  const [neckCm, setNeck] = useState(start.neckCm ?? null);
  const [hipCm, setHip] = useState(start.hipCm ?? null);
  const est = estimateBodyFat({ sex, heightCm, bandId, waistCm, neckCm, hipCm });
  const railRef = useRef(null);
  // open on the band he chose before, or the middle of the plausible bands
  useEffect(() => {
    // the rail scrolls itself, never the page (scrollIntoView would move both)
    const scroller = railRef.current?.firstElementChild;
    const el = scroller?.querySelector(`[data-band="${startBand || '13-15'}"]`);
    if (scroller && el) scroller.scrollLeft = el.offsetLeft - scroller.offsetLeft - 12;
  }, [startBand]);
  const female = sex === 'female';
  return (
    <div className="nv-set-bfe" role="group" aria-label="Estimate your body fat">
      <div className="nv-set-bfeh">
        <b>Which looks most like you?</b>
        <a href={GUIDE_URL} target="_blank" rel="noreferrer">See the photos</a>
      </div>
      <div ref={railRef}>
        <Rail gap="8px" ariaLabel="Body fat bands from the visual guide" style={{ padding: '2px 0 6px', alignItems: 'stretch' }}>
          {VISUAL_BANDS.map((b) => (
            <button key={b.id} type="button" data-band={b.id} aria-pressed={bandId === b.id}
              className={`nv-set-bfb${bandId === b.id ? ' on' : ''}`} onClick={() => setBandId(bandId === b.id ? null : b.id)}>
              <b>{b.lo}–{b.hi}%</b>
              <span>{b.look}</span>
            </button>
          ))}
        </Rail>
      </div>
      {female ? <p className="nv-set-rs">The guide shows men; for you the tape methods carry the estimate.</p> : null}
      <div className="nv-set-bfeh"><b>With a tape measure</b><span className="nv-set-rs">optional, sharper</span></div>
      <div className="nv-set-bft">
        <label><span>Waist, at the navel</span><span><NumField value={waistCm} min={50} max={200} onValue={setWaist} label="Waist in centimetres at the navel" /> cm</span></label>
        <label><span>Neck, below the Adam's apple</span><span><NumField value={neckCm} min={25} max={70} onValue={setNeck} label="Neck in centimetres" /> cm</span></label>
        {female ? <label><span>Hips, at the widest</span><span><NumField value={hipCm} min={60} max={200} onValue={setHip} label="Hips in centimetres" /> cm</span></label> : null}
      </div>
      {est ? (
        <div className="nv-set-bfr" role="status">
          <b><NumberRoll value={est.lo} format={(v) => `${Math.round(v * 10) / 10}`} />–<NumberRoll value={est.hi} format={(v) => `${Math.round(v * 10) / 10}%`} /></b>
          <span>Nova uses the middle, {est.pct}%, and shows what the range is worth in calories.</span>
          <ul className="nv-set-numl">{est.lines.map((l, i) => <li key={i} style={{ '--i': i }}>{l}</li>)}</ul>
        </div>
      ) : <p className="nv-set-rs">Pick the photo band closest to you, or measure your waist and neck.</p>}
      <span className="nv-set-numa">
        <TextAction tone="faint" onClick={onClose}>Cancel</TextAction>
        <TextAction disabled={!est} onClick={() => est && onUse({
          bodyFatPct: est.pct, bodyFatRange: [est.lo, est.hi], bodyFatMethod: est.method,
          waistCm: waistCm ?? null, neckCm: neckCm ?? null, hipCm: hipCm ?? null,
        })}>Use this estimate</TextAction>
      </span>
    </div>
  );
}
