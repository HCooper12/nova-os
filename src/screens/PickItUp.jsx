import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { Eyebrow, Chip, Tag, Meta, Rail, Segmented, Button, Chevron } from '../Controls.jsx';

// PICK IT UP — "so what do I get?" (his reel, 26 Sep 2026).
//
// The fuel hero above already says "Fits 500 kcal left". This is the answer
// to the next sentence: every item from the big chains and the supermarkets
// that fits what is left, so he can go and pick one up. Nova knows both
// numbers, so the finder opens PREFILLED from the real day (the vals own that,
// see eatOutBudget in vals/valsRecipes.js) and he only edits if he wants to.
//
// The forms, per §2b r7–8:
//   - the budget is FOUR RINGS, not four boxes: each arc is the figure against
//     today's own target, the numeral inside is the input, and a blank field
//     is the house dashed gap, never a zero;
//   - each result is a glass card on a vertical rail with the kcal as the
//     display figure, a budget bar under it that fills to how much of the
//     budget the item spends, a protein pill that is green when it reaches
//     the target and gold with the shortfall when it does not, and the P/C/F
//     composition bar every quick-log card wears (cyan, gold, violet);
//   - a pair is two rows joined by a "+" seam over one summed footer.
// Colour means the same thing as everywhere else on Fuel: kcal green, protein
// cyan, carbs gold, fat violet; gold on a TAG is "not in the catalogue yet".

const EASE = 'var(--nv-ease)';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// arrival: a rise under normal motion, a cross-fade under reduced motion
const arrive = (i = 0, dur = 320) => ({
  animation: reducedMotion()
    ? `fadeIn 200ms ease ${Math.min(i, 12) * 30}ms both`
    : `popIn ${dur}ms ${EASE} ${Math.min(i, 12) * 45}ms both`,
});

// A small arc, the RingTile geometry at glance size. `pct` null = a gap.
function GlanceRing({ value, pct, hue, label }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const gap = value == null;
  return (
    <span style={css('position:relative;width:38px;height:38px;flex:none;display:inline-block')} aria-label={gap ? `${label}: no target` : `${label}: ${value} left`}>
      <svg viewBox="0 0 38 38" width="38" height="38" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="3.5" />
        {gap || pct == null ? (
          <circle cx="19" cy="19" r={r} fill="none" stroke="color-mix(in srgb, var(--nv-ink) 28%, transparent)" strokeWidth="2" strokeDasharray="3 4" />
        ) : (
          <circle cx="19" cy="19" r={r} fill="none" stroke={hue} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
            style={{ '--nv-arc-full': c, animation: 'nvArcIn .9s cubic-bezier(.2,.8,.2,1) both', transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
        )}
      </svg>
      <b style={css(`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 ${String(value ?? '').length > 3 ? '9.5' : '11'}px var(--nv-font-mono);font-variant-numeric:tabular-nums;color:${gap ? 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' : 'var(--nv-ink)'}`)}>{gap ? '—' : value}</b>
    </span>
  );
}

// ONE BUDGET RING — the arc is the figure against today's target, the
// numeral inside is where he types. Transparent input, centred, in the
// ring's own hue; 20px so iOS never zooms the page on focus.
function BudgetRing({ ring }) {
  const size = 74;
  const r = 31;
  const c = 2 * Math.PI * r;
  const gap = ring.state === 'gap';
  return (
    <div style={css('display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0')}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="6" />
          {gap ? (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`color-mix(in srgb, ${ring.hue} 45%, transparent)`} strokeWidth="2.5" strokeDasharray="3 5" />
          ) : (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.hue} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - ring.pct / 100)}
              style={{
                filter: `drop-shadow(0 0 5px color-mix(in srgb, ${ring.hue} 45%, transparent))`,
                '--nv-arc-full': c,
                animation: 'nvArcIn .9s cubic-bezier(.2,.8,.2,1) both',
                transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)',
              }} />
          )}
        </svg>
        <LocalInput value={ring.value} onChange={ring.set} debounceMs={120} submitOnEnter={false}
          inputMode="numeric" pattern="[0-9]*" enterKeyHint="search" autoComplete="off"
          aria-label={`${ring.label} budget${ring.of ? `, of ${ring.of} today` : ''}`}
          placeholder="—"
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: '52px', padding: 0, border: 'none', outline: 'none', background: 'transparent', textAlign: 'center',
            font: `400 ${String(ring.value).length > 3 ? '17' : '20'}px/1 var(--nv-font-serif)`, fontVariantNumeric: 'tabular-nums',
            color: ring.hue, caretColor: ring.hue,
          }} />
      </div>
      <Eyebrow as="span" tone={ring.hue}>{ring.label}</Eyebrow>
      <Meta tone={ring.source === 'yours' ? 'ink' : 'faint'} style={{ marginTop: '-3px' }}>{ring.source}</Meta>
    </div>
  );
}

// the P/C/F composition, exactly as QuickLogCard draws it (proportional to
// GRAMS — composition, not calories; the kcal figure carries energy)
function CompositionBar({ r }) {
  if (!(r.macros.p + r.macros.c + r.macros.f > 0)) return null;
  return (
    <span aria-hidden="true" style={css('display:flex;height:3px;border-radius:2px;overflow:hidden;background:color-mix(in srgb, var(--nv-ink) 10%, transparent)')}>
      <span style={r.pBar}></span><span style={r.cBar}></span><span style={r.fBar}></span>
    </span>
  );
}

// how much of the budget this spends: green to 100%, warn past it
function BudgetBar({ use }) {
  if (use == null) return null;
  const pct = Math.max(0, Math.min(1, use)) * 100;
  const over = use > 1;
  return (
    <span style={css('display:flex;align-items:center;gap:8px;min-width:0')}>
      <span aria-hidden="true" style={css('position:relative;flex:1;min-width:0;height:5px;border-radius:999px;overflow:hidden;background:color-mix(in srgb, var(--nv-good) 12%, transparent)')}>
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '999px', transformOrigin: 'left center',
          background: over ? 'var(--nv-warn)' : 'var(--nv-good)', transform: `scaleX(${pct / 100})`,
          transition: 'transform .6s cubic-bezier(.2,.8,.2,1)',
        }} />
      </span>
      <Meta tone={over ? 'warn' : 'faint'} style={{ flex: 'none' }}>{Math.round(use * 100)}% of budget</Meta>
    </span>
  );
}

function ProteinPill({ p, hit, gap }) {
  const tone = hit === true ? 'var(--nv-good)' : hit === false ? 'var(--nv-gold)' : 'var(--nv-cy)';
  return (
    <span title={hit === false && gap > 0 ? `${gap} g short of the protein target` : hit ? 'Reaches the protein target' : 'Protein'}
      style={css(`flex:none;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font:600 12px var(--nv-font-ui);font-variant-numeric:tabular-nums;color:${tone};background:color-mix(in srgb, ${tone} 13%, transparent);border:1px solid color-mix(in srgb, ${tone} 30%, transparent)`)}>
      {hit === true && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>}
      {p} g protein
      {hit === false && gap > 0 && <span style={css('opacity:.9')}>· −{gap} g</span>}
    </span>
  );
}

// The figure he is choosing on, then its two readings of "does it fit".
function FitBlock({ r, big = 26 }) {
  return (
    <>
      <span style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0')}>
        <span style={css('display:flex;align-items:baseline;gap:5px;min-width:0')}>
          <span style={css(`font:700 ${big}px/1 var(--nv-font-ui);letter-spacing:var(--nv-display-track);font-variant-numeric:tabular-nums;color:var(--nv-ink)`)}>{r.macros.kcal.toLocaleString()}</span>
          <Meta tone="good">kcal</Meta>
        </span>
        <span style={css('margin-left:auto')}><ProteinPill p={r.macros.p} hit={r.proteinHit} gap={r.proteinGap} /></span>
      </span>
      <BudgetBar use={r.kcalUse} />
      <CompositionBar r={r} />
      <span style={css('display:flex;gap:9px;font:600 11px var(--nv-font-mono);font-variant-numeric:tabular-nums')}>
        <span style={css('color:var(--nv-cy)')}>{r.macros.p}P</span>
        <span style={css('color:var(--nv-gold)')}>{r.macros.c}C</span>
        <span style={css('color:var(--nv-vi)')}>{r.macros.f}F</span>
      </span>
    </>
  );
}

const CARD = {
  cursor: 'pointer', minWidth: 0, textAlign: 'left', borderRadius: '16px', padding: '13px 14px 12px',
  border: '1px solid var(--nv-edge)', background: 'var(--nv-glass)',
  // the bright top edge: light catching the material
  boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 10%, transparent)',
  display: 'flex', flexDirection: 'column', gap: '8px',
  transition: 'border-color .18s var(--nv-ease), transform .12s var(--nv-ease)',
};
const HOVER = { borderColor: 'color-mix(in srgb, var(--nv-good) 50%, transparent)' };
const PRESS = { transform: 'scale(.985)' };

function ItemCard({ r, i }) {
  return (
    <Interactive as="div" onClick={r.log} haptic="commit" aria-label={`Log ${r.brand} ${r.name}, ${r.macros.kcal} calories`}
      base={{ ...CARD, ...arrive(i) }} hoverStyle={HOVER} activeStyle={PRESS}>
      <span style={css('display:flex;align-items:center;gap:8px;min-width:0')}>
        {/* the brand tag keeps its words; the serve size gives way first */}
        <Tag tone={r.kind === 'Supermarket' ? 'violet' : 'cyan'} style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.brand} · {r.kind}</Tag>
        {r.serve && <Meta tone="faint" style={{ marginLeft: 'auto', flex: '0 20 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.serve}</Meta>}
      </span>
      <span style={css('font:600 14.5px/1.3 var(--nv-font-ui);color:var(--nv-ink);overflow-wrap:anywhere')}>{r.name}</span>
      <FitBlock r={r} />
    </Interactive>
  );
}

function PairCard({ pr, i }) {
  return (
    <Interactive as="div" onClick={pr.log} haptic="commit" aria-label={`Log ${pr.items.map((x) => `${x.brand} ${x.name}`).join(' plus ')}, ${pr.macros.kcal} calories together`}
      base={{ ...CARD, ...arrive(i), gap: '0' }} hoverStyle={HOVER} activeStyle={PRESS}>
      {pr.items.map((it, k) => (
        <div key={it.id || k} style={css('min-width:0')}>
          {k > 0 && (
            // THE SEAM: the two items are one order, so the join is drawn
            <div aria-hidden="true" style={css('position:relative;height:22px;display:flex;align-items:center;justify-content:center')}>
              <span style={css('position:absolute;left:0;right:0;top:50%;height:1px;background:color-mix(in srgb, var(--nv-ink) 10%, transparent)')} />
              <span style={css('position:relative;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 13px/1 var(--nv-font-ui);color:var(--nv-good);background:var(--nv-glass2);border:1px solid color-mix(in srgb, var(--nv-good) 40%, transparent)')}>+</span>
            </div>
          )}
          <div style={css('display:flex;align-items:center;gap:8px;min-width:0')}>
            <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
              <Tag tone={it.kind === 'Supermarket' ? 'violet' : 'cyan'} style={{ alignSelf: 'flex-start', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.brand}</Tag>
              <span style={css('font:600 13.5px/1.3 var(--nv-font-ui);color:var(--nv-ink);overflow-wrap:anywhere')}>{it.name}</span>
            </span>
            <span style={css('flex:none;font:600 14px var(--nv-font-mono);font-variant-numeric:tabular-nums;color:color-mix(in srgb, var(--nv-ink) 75%, transparent)')}>{it.macros.kcal}</span>
          </div>
        </div>
      ))}
      <div style={css('margin-top:11px;padding-top:10px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);display:flex;flex-direction:column;gap:8px')}>
        <Meta tone="faint">Together</Meta>
        <FitBlock r={pr} big={24} />
      </div>
    </Interactive>
  );
}

// A REAL LOADING STATE — three dim cards the shape of the real ones,
// pulsing; still under reduced motion, never a blank.
function SkeletonRail() {
  const still = reducedMotion();
  return (
    <div aria-hidden="true" style={css('display:flex;flex-direction:column;gap:10px')}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ ...CARD, cursor: 'default', gap: '10px', opacity: 0.7 }}>
          {['38%', '72%', '100%'].map((w, k) => (
            <span key={k} style={{
              display: 'block', width: w, height: k === 2 ? '5px' : k === 1 ? '14px' : '11px', borderRadius: '6px',
              background: 'linear-gradient(90deg, color-mix(in srgb, var(--nv-ink) 06%, transparent) 0%, color-mix(in srgb, var(--nv-ink) 13%, transparent) 50%, color-mix(in srgb, var(--nv-ink) 06%, transparent) 100%)',
              backgroundSize: '200% 100%',
              animation: still ? 'none' : `skeletonSweep 1.5s ease-in-out ${i * 120}ms infinite`,
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PickItUp({ v }) {
  const k = v.pickItUp;
  if (!k || !k.available) return null;
  return (
    <div style={css('margin-top:12px;border:1px solid var(--nv-edge);border-radius:18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 09%, transparent);min-width:0')}>
      {/* THE ROW IS ITSELF A FORM: what is left, as two rings, then the
          question as the tap target */}
      <Interactive as="div" onClick={k.toggle} haptic="tick" role="button" aria-expanded={k.open}
        aria-label={k.open ? 'Close the pick-it-up finder' : 'What can I pick up? Open the finder'}
        base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', minWidth: 0, borderRadius: '18px' }}
        activeStyle={{ transform: 'scale(.99)' }}>
        <span style={css('display:flex;gap:4px;flex:none')}>
          <GlanceRing value={k.glance.kcal} pct={k.glance.kcalPct} hue="var(--nv-good)" label="Calories" />
          <GlanceRing value={k.glance.p} pct={k.glance.pPct} hue="var(--nv-cy)" label="Protein to go" />
        </span>
        <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
          <span style={css('font:400 19px/1.15 var(--nv-font-serif);color:var(--nv-ink)')}>What can I pick up?</span>
          {k.summaryLoaded && !k.countLine
            ? <Tag tone="gold" style={{ alignSelf: 'flex-start' }}>no catalogue yet</Tag>
            : <Meta tone="faint" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.countLine || 'Chains and supermarkets that fit what’s left'}</Meta>}
        </span>
        <Chevron open={k.open} />
      </Interactive>

      {k.open && (
        <div className="nv-deck-rise" style={css('padding:4px 14px 16px;display:flex;flex-direction:column;gap:14px;min-width:0')}>
          {/* 1 · THE BUDGET, AS RINGS */}
          <div>
            <div style={{
              display: 'grid', gap: '12px', justifyItems: 'center',
              // four across when there is room, two by two when there is
              // not: the track floor jumps from a quarter to a half of the
              // row at ~400px of panel, so it never lands on 3 + 1
              gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(calc(25% - 10px), calc((400px - 100%) * 999), calc(50% - 8px)), 1fr))',
            }}>
              {k.rings.map((r) => <BudgetRing key={r.key} ring={r} />)}
            </div>
            <Meta as="div" tone="faint" style={{ marginTop: '10px', textAlign: 'center' }}>
              {k.noTargets ? 'No calorie or protein target is set, so nothing is prefilled.' : 'A blank ring is ignored. Protein is a target to get close to.'}
            </Meta>
          </div>

          {/* 2 · FILTERS */}
          <div style={css('display:flex;flex-direction:column;gap:10px;min-width:0')}>
            <div style={css('display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between')}>
              <Segmented ariaLabel="Kind of place" value={k.kind} onChange={k.setKind}
                options={[['all', 'All'], ['fast-food', 'Takeaway'], ['supermarket', 'Supermarket']]} />
              <Segmented ariaLabel="Single items or pairings" value={k.mode} onChange={k.setMode}
                options={[['single', 'Single item'], ['pairs', 'Pairings']]} />
            </div>
            {(k.brands.length > 0 || k.missing.length > 0) && (
              <Rail ariaLabel="Brands" style={{ margin: '0 -14px', padding: '2px 14px' }}>
                {k.brands.map((b) => (
                  <Chip key={b.key} tone={b.stale ? 'gold' : b.kind === 'supermarket' ? 'violet' : 'cyan'} active={b.active} onClick={b.toggle}
                    title={b.title} style={{ flex: 'none', whiteSpace: 'nowrap' }}>{b.name}{b.stale ? ' · stale' : ''}</Chip>
                ))}
                {k.missing.map((m) => (
                  <Tag key={m.name} tone="gold" title={m.why}
                    style={{ flex: 'none', border: '1px dashed color-mix(in srgb, var(--nv-gold) 55%, transparent)', background: 'transparent' }}>{m.name} · not in</Tag>
                ))}
              </Rail>
            )}
          </div>

          {/* 3 · RESULTS */}
          <div style={css('display:flex;flex-direction:column;gap:10px;min-width:0')}>
            {k.refreshing || (k.busy && !k.results.length && !k.pairs.length) ? (
              <>
                {k.refreshing && <Meta as="div" tone="gold">Fetching the catalogue. This takes a few minutes.</Meta>}
                <SkeletonRail />
              </>
            ) : k.emptyLine ? (
              <div style={{ ...arrive(0, 260), padding: '8px 2px' }}>
                <span style={css('font:italic 400 18px/1.35 var(--nv-font-serif);color:color-mix(in srgb, var(--nv-ink) 72%, transparent)')}>{k.emptyLine}</span>
              </div>
            ) : (
              <>
                {k.searched && <Eyebrow as="div" tone="good">{k.count} {k.mode === 'pairs' ? `pairing${k.count === 1 ? '' : 's'}` : `item${k.count === 1 ? '' : 's'}`} fit</Eyebrow>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, opacity: k.busy ? 0.55 : 1, transition: 'opacity .2s ease' }}>
                  {k.mode === 'pairs'
                    ? k.pairs.map((pr, i) => <PairCard key={pr.id} pr={pr} i={i} />)
                    : k.results.map((r, i) => <ItemCard key={r.id} r={r} i={i} />)}
                </div>
              </>
            )}

            {/* 4 · HONESTY — which chains, when, from where */}
            {k.catalogueEmpty && !k.refreshing && (
              <div style={css('display:flex;flex-direction:column;gap:8px;align-items:flex-start')}>
                <Button onClick={k.refresh}>Fetch the catalogue</Button>
                <Meta tone="faint">Reads Open Food Facts and the chains’ own nutrition PDFs. Takes a few minutes.</Meta>
              </div>
            )}
            {k.summaryLine && <Meta as="div" tone="faint">{k.summaryLine}</Meta>}
            {k.missing.length > 0 && (
              <Meta as="div" tone="faint">Not in yet: {k.missing.map((m) => m.name).join(', ')}.</Meta>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
