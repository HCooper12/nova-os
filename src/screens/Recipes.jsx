import { useRef, useState } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { VoicePanel } from '../VoicePanels.jsx';
import { useDictation } from '../useDictation.js';
import { useOptionPager } from '../swipeAction.js';
import { SafeVisual } from '../SafeVisual.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, ScreenHead, Button } from '../Controls.jsx';
import { PickItUp } from './PickItUp.jsx';

// the material pass (6 Sep 2026): labels and controls through Controls.jsx;
// filled buttons sentence-case in the UI face under the Apple styles
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase()).replace(/\bnova\b/g, 'Nova');

// ONE CARD ON THE QUICK-LOG RAIL — a food he has eaten before, one tap from
// being on today's plate again.
//
// His ask (22 Sep 2026) was to stop scrolling for something he had just added.
// The answer is a rail at the top, but a rail of plain name-and-numbers boxes
// would be the thing CLAUDE.md forbids outright: "nothing on a Nova surface is
// a plain box with text in it, and colour means something".
//
// So the card carries a picture of the food rather than a sentence about it.
// The energy is the figure, at display size, because that is what he is
// choosing on. Underneath, the macro split is drawn as one bar in three
// widths — protein cyan, carbs gold, fat violet, the same three hues these
// macros wear everywhere else in Nova, so a glance tells him whether this is
// the protein thing or the carb thing without reading a single number. The
// bar is proportional to GRAMS, which is honest about composition and says
// nothing about calories; the calorie figure above it carries that.
//
// A food with no macros at all draws no bar rather than a bar of zeros.
function QuickLogCard({ item }) {
  const grams = item.p + item.c + item.f;
  const pct = (n) => (grams > 0 ? `${(n / grams) * 100}%` : '0%');
  return (
    <Interactive as="div" onClick={item.log} haptic="commit"
      aria-label={`Log ${item.name} again — ${item.kcal} calories`}
      base={{
        flex: '0 0 132px', minWidth: 0, cursor: 'pointer', borderRadius: '15px', padding: '11px 12px 10px',
        border: '1px solid var(--nv-edge)', background: 'var(--nv-glass)',
        display: 'flex', flexDirection: 'column', gap: '7px', textAlign: 'left',
        transition: 'border-color .18s var(--nv-ease), background .18s var(--nv-ease)',
      }}
      hoverStyle={{ borderColor: 'color-mix(in srgb, var(--nv-good) 55%, transparent)', background: 'color-mix(in srgb, var(--nv-good) 07%, var(--nv-glass))' }}>
      {/* two lines then ellipsis: "Almond Butter Blueberry Protein Smoothie"
          is a real name in his log and a single clamped line says almost
          nothing about which food it is */}
      <span style={css("min-height:32px;font:600 12.5px/1.28 var(--nv-font-ui);color:var(--nv-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden")}>{item.name}</span>
      <span style={css("display:flex;align-items:baseline;gap:4px")}>
        <span style={css("font:700 19px var(--nv-font-ui);letter-spacing:var(--nv-display-track);color:var(--nv-ink);font-variant-numeric:tabular-nums;line-height:1")}>{item.kcal}</span>
        <span style={css("font:600 9.5px var(--nv-font-ui);letter-spacing:.06em;color:color-mix(in srgb, var(--nv-ink) 42%, transparent)")}>KCAL</span>
        {item.often && <span style={css("margin-left:auto;font:600 9.5px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-gold) 85%, transparent)")}>{item.often}</span>}
      </span>
      {grams > 0 && (
        <span aria-hidden="true" style={css("display:flex;height:3px;border-radius:2px;overflow:hidden;background:color-mix(in srgb, var(--nv-ink) 10%, transparent)")}>
          <span style={{ width: pct(item.p), background: 'var(--nv-cy)' }} />
          <span style={{ width: pct(item.c), background: 'var(--nv-gold)' }} />
          <span style={{ width: pct(item.f), background: 'var(--nv-vi)' }} />
        </span>
      )}
    </Interactive>
  );
}

// Apple-layout twin for the eaten-today strip: same dayMacros object,
// rendered as four stat tiles instead of the inline HUD strip.
// ONE MEAL CARD. Its own component because a multi-option card takes a
// gesture (useOptionPager), and a hook cannot live inside a .map().
function RotationCard({ s }) {
  const many = s.optionCount > 1;
  // the swipe zone is ONLY the focused-dish header, and only when there is
  // something to page between — see the note in swipeAction.js for why the
  // zone, not the threshold, is what makes this safe on a scrolling strip
  const pager = useOptionPager({ onNext: s.next, onPrev: s.prev, enabled: many });
  return (
    <Interactive as="div" onLongPress={many ? undefined : s.onLongPress}
      base={{ flex: `0 0 ${many ? 196 : 172}px`, minWidth: 0, borderRadius: '16px', padding: '12px', position: 'relative', cursor: s.recipeName ? 'pointer' : 'default',
        border: s.out ? '1px solid color-mix(in srgb, var(--nv-warn) 65%, transparent)'
          : s.consumed ? '1px solid color-mix(in srgb, var(--nv-good) 50%, transparent)' : '1px solid var(--nv-edge)',
        background: s.out ? 'linear-gradient(180deg,color-mix(in srgb, var(--nv-warn) 09%, transparent),var(--nv-glass))' : 'var(--nv-glass)', transition: 'border-color .2s' }}>
      {s.recipeName ? (
        <>
          {/* the focused dish — and, when there are options, the swipe zone */}
          <Interactive as="div" onLongPress={many ? s.onLongPress : undefined} base={{ minWidth: 0 }}>
          <div ref={pager.ref} {...pager.handlers} style={pager.enabled ? { touchAction: 'pan-y' } : undefined}>
            <div style={css("display:flex;align-items:baseline;gap:6px;padding-right:40px;flex-wrap:wrap")}>
              <Eyebrow as="span" tone={s.custom ? 'faint' : 'violet'}>{s.name}</Eyebrow>
              {many && <span style={css("font:var(--nv-micro-s);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{s.eatenCount}/{s.optionCount} eaten</span>}
            </div>
            <Interactive as="div" onClick={s.open} base="cursor:pointer;font:600 14px var(--nv-font-ui);margin-top:3px;line-height:1.25;color:var(--nv-ink)" hoverStyle="color:var(--nv-cy)">{s.recipeName}{s.variant ? ` · ${s.variant}` : ''}</Interactive>
            <div style={css("font:var(--nv-micro-m);margin-top:6px;display:flex;align-items:center;gap:4px;flex-wrap:wrap")}>
              <span style={css("color:var(--nv-cy)")}>{s.p}P</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>·</span> <span style={css("color:var(--nv-gold)")}>{s.c}C</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>·</span> <span style={css("color:var(--nv-vi)")}>{s.f}F</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>·</span> <span style={css("color:var(--nv-good)")}>{s.kcal}</span>
              {/* THE FRIDGE — cooked portions of the focused dish. Red and loud at zero: cook more before this slot comes round. */}
              {s.portionsLeft != null && (
                <span title={s.out ? 'None left — cook more' : `${s.portionsLeft} cooked portion${s.portionsLeft === 1 ? '' : 's'} in the fridge`}
                  style={css(`margin-left:auto;font:600 10px var(--nv-font-ui);letter-spacing:.06em;padding:2px 7px;border-radius:999px;font-variant-numeric:tabular-nums;${s.out
                    ? 'color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 60%, transparent);background:color-mix(in srgb, var(--nv-warn) 14%, transparent)'
                    : 'color:color-mix(in srgb, var(--nv-ink) 70%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)'}`)}>
                  {s.out ? 'OUT' : `${s.portionsLeft} left`}
                </span>
              )}
            </div>
            {/* ‹ dots › — the tap route to the same switch the swipe does */}
            {many && (
              <div style={css("display:flex;align-items:center;gap:6px;margin-top:8px")}>
                <Interactive as="span" onClick={s.prev} aria-label="Previous option" base={{ cursor: 'pointer', width: '32px', height: '32px', marginLeft: '-8px', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 16px var(--nv-font-ui)', color: 'var(--nv-acc)', borderRadius: '8px' }} hoverStyle={{ background: 'var(--nv-acc-bg)' }}>‹</Interactive>
                <span style={css("display:flex;gap:5px;flex:1;justify-content:center")}>
                  {s.options.map((o, i) => (
                    <Interactive key={o.id} as="span" onClick={o.focusIt} aria-label={`Focus ${o.name}`} title={o.name}
                      base={{ cursor: 'pointer', width: '8px', height: '8px', borderRadius: '50%', transition: 'all .2s',
                        background: i === s.focusIndex ? 'var(--nv-acc)' : o.eaten ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 22%, transparent)',
                        boxShadow: i === s.focusIndex ? '0 0 8px -1px var(--nv-acc)' : 'none' }} />
                  ))}
                </span>
                <Interactive as="span" onClick={s.next} aria-label="Next option" base={{ cursor: 'pointer', width: '32px', height: '32px', marginRight: '-8px', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 16px var(--nv-font-ui)', color: 'var(--nv-acc)', borderRadius: '8px' }} hoverStyle={{ background: 'var(--nv-acc-bg)' }}>›</Interactive>
              </div>
            )}
          </div>
          </Interactive>
          {/* NO SWIPE outside that header, deliberately. These cards sit in a
              horizontally-scrolling strip (measured: 904px of content in a
              468px viewport), so a sideways drag anywhere else must stay the
              strip's scroll — otherwise reaching dinner would mean fighting
              the gesture. Paging lives in the header of a multi-option card
              only, where the browser is told (touch-action: pan-y) not to
              scroll, and it changes nothing destructive. */}
          {/* 44x44 tap target on the action taken 4× a day; the ring stays 30px */}
          <Interactive as="span" onClick={s.toggleConsumed} aria-label={s.consumed ? 'Mark not eaten' : 'Mark eaten'}
            base={{ cursor: 'pointer', position: 'absolute', top: '3px', right: '3px', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: s.consumed ? '1.5px solid var(--nv-good)' : '1.5px solid var(--nv-edge)',
              background: s.consumed ? 'color-mix(in srgb, var(--nv-good) 15%, transparent)' : 'transparent',
              boxShadow: s.consumed ? '0 0 12px -2px color-mix(in srgb, var(--nv-good) 70%, transparent)' : 'none', transition: 'all .2s' }}>
              {s.consumed ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--nv-good)" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg> : null}
            </span>
          </Interactive>
          {/* every option, each with its own tick — 4 snacks, tick 3. Hold a
              row for its own swaps: a variant belongs to the DISH, not the
              slot, so the snack you swapped stays swapped when focus moves. */}
          {many && (
            <div style={css("display:flex;flex-direction:column;gap:2px;margin-top:4px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:6px")}>
              {s.options.map((o) => (
                <Interactive as="div" key={o.id} onLongPress={o.onLongPress} base={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '28px' }}>
                  <Interactive as="span" onClick={o.tick} aria-label={o.eaten ? `Mark ${o.name} not eaten` : `Mark ${o.name} eaten`}
                    base={{ cursor: 'pointer', width: '28px', height: '28px', marginLeft: '-6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: o.eaten ? '1.5px solid var(--nv-good)' : '1.5px solid color-mix(in srgb, var(--nv-ink) 25%, transparent)',
                      background: o.eaten ? 'color-mix(in srgb, var(--nv-good) 18%, transparent)' : 'transparent', transition: 'all .2s' }}>
                      {o.eaten ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--nv-good)" strokeWidth="3.5"><path d="M20 6L9 17l-5-5"/></svg> : null}
                    </span>
                  </Interactive>
                  <Interactive as="span" onClick={o.focusIt} title={`${o.p}P · ${o.kcal} kcal — tap to make this the one that counts${o.alts.length ? ' · hold to swap' : ''}`}
                    base={{ cursor: 'pointer', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: `${o.focus ? 600 : 400} 12px var(--nv-font-ui)`,
                      color: o.out ? 'var(--nv-warn)' : o.focus ? 'var(--nv-ink)' : 'color-mix(in srgb, var(--nv-ink) 62%, transparent)', textDecoration: o.eaten && !o.focus ? 'line-through' : 'none' }}
                    hoverStyle={{ color: 'var(--nv-cy)' }}>{o.focus ? '★ ' : ''}{o.name}{o.variant ? ` · ${o.variant}` : ''}{o.out ? ' · out' : ''}</Interactive>
                  <Interactive as="span" onClick={o.remove} aria-label={`Remove ${o.name} from ${s.name}`}
                    base={{ cursor: 'pointer', width: '28px', height: '28px', marginRight: '-8px', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 14px var(--nv-font-ui)', color: 'color-mix(in srgb, var(--nv-ink) 32%, transparent)', flex: '0 0 auto' }}
                    hoverStyle={{ color: 'var(--nv-warn)' }}>×</Interactive>
                </Interactive>
              ))}
            </div>
          )}
          {/* 32px-tall targets: CLEAR measured 26×11px at 375px on 3 Sep — the action taken 4× a day was the smallest thing on the screen */}
          <div style={css("display:flex;gap:14px;margin-top:4px;align-items:center;flex-wrap:wrap")}>
            {s.clearVariant && <TextAction compact tone="gold" onClick={s.clearVariant} style={{ marginLeft: '-8px' }}>Undo variant</TextAction>}
            <TextAction compact tone="faint" onClick={s.clear}>{many ? 'Drop this one' : 'Clear'}</TextAction>
            {s.rename && <TextAction compact tone="faint" onClick={() => { const l = window.prompt('Name this meal', s.name); if (l && l.trim()) s.rename(l.trim()); }}>Rename</TextAction>}
          </div>
        </>
      ) : (
        <>
          <Eyebrow as="span" tone={s.custom ? 'faint' : 'violet'}>{s.name}</Eyebrow>
          <div style={css("font:400 12px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 35%, transparent);margin-top:8px")}>Empty — pick from the bank below (tap a recipe's {s.name[0].toUpperCase()} chip)</div>
          {(s.rename || s.removeSlot) && (
            <div style={css("display:flex;gap:14px;margin-top:6px;align-items:center")}>
              {s.rename && <TextAction compact tone="faint" onClick={() => { const l = window.prompt('Name this meal', s.name); if (l && l.trim()) s.rename(l.trim()); }} style={{ marginLeft: '-8px' }}>Rename</TextAction>}
              {s.removeSlot && <TextAction compact tone="faint" onClick={s.removeSlot}>Remove meal</TextAction>}
            </div>
          )}
        </>
      )}
    </Interactive>
  );
}

function EatenTiles({ m }) {
  const tiles = [
    { k: 'P', val: `${m.p}${m.proteinTarget ? '/' + m.proteinTarget : ''}`, sub: m.proteinPct != null ? `${m.proteinPct}% of floor` : 'grams', color: 'var(--nv-cy)' },
    { k: 'C', val: String(m.c), sub: 'grams', color: 'var(--nv-gold)' },
    { k: 'F', val: String(m.f), sub: 'grams', color: 'var(--nv-vi)' },
    { k: 'KCAL', val: `${m.kcal}${m.targetKcal ? '/' + m.targetKcal : ''}`, sub: m.targetKcal ? 'vs target' : 'eaten', color: 'var(--nv-good)' },
  ];
  return (
    <div className="nv-pane" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2px', padding: '10px 8px' }}>
      {tiles.map((t) => (
        <div key={t.k} style={{ padding: '4px 10px' }}>
          <div style={{ font: '600 10px var(--nv-font-ui)', letterSpacing: '.06em', color: 'var(--nv-ink60)' }}>{t.k}</div>
          <div style={{ font: '700 19px var(--nv-font-ui)', letterSpacing: '-.02em', marginTop: '2px', fontVariantNumeric: 'tabular-nums', color: t.color }}>{t.val}</div>
          <div style={{ font: 'var(--nv-micro-m)', color: 'var(--nv-ink40)' }}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

// THE FUEL HERO — ONE RING, THREE MACROS, AND A GAP IS A DASHED RING.
//
// Finding 15 of the 22 Sep aesthetic review: this ring drew a SOLID dim
// circle at "0 of 150" where the SLEEP ring on Home draws a dashed one for
// the identical "nothing logged" condition — a zero looks like a bad day,
// a hole is a hole (§2b r2, and the note at the top of RingTile.jsx). And
// the other three numbers were spelled out beside it as a label/value table
// ("Calories 0 / 2,200", "Carbs · Fat  0C · 0F"), which is the plain box
// with text in it that §2b r7 forbids outright.
//
// So the table becomes geometry. Protein is the outer arc, carbs and fat two
// thin concentric ones inside it — cyan, gold, violet, the hues these macros
// wear on every quick-log card and in every rotation row. Each arc is eaten
// against its OWN target, and a macro with no target draws no arc at all,
// the same rule the quick-log bar keeps: a ring of zero against a number
// nobody set is a claim about his diet Nova has not been told (see the
// macroState note in vals/valsRecipes.js).
//
// The calories are the one figure in the middle, in the serif face, because
// the kcal number is what he is actually deciding on at 8pm. The offsets
// TRANSITION rather than keyframe — exactly what RingTile does — so the arcs
// sweep when the day's numbers change and the global prefers-reduced-motion
// rules still own them.
const RING_BOX = 140;
// The innermost radius is what the calorie figure has to live inside: 36
// less its 5px stroke leaves a 67px well, and "1,520" set in Instrument
// Serif at 22px measures 54 of them. The first pass drew 26px over a
// 61px well and the comma sat on the fat arc — measured, not eyeballed.
const RING_GEO = [{ r: 61, w: 9 }, { r: 48, w: 5 }, { r: 36, w: 5 }];
// RingTile's own gap tone and dash pattern, so the two rings say "no data"
// in one voice rather than two.
const GAP_TONE = 'color-mix(in srgb, var(--nv-ink) 28%, transparent)';

// THE CALORIE RING — one arc, same box and stroke as the macro ring's
// outer arc, so the two read as a pair. Its own component because calories
// are not a macro in grams: one figure, one target, one verdict colour.
function KcalRing({ ring }) {
  const g = RING_GEO[0];
  const circ = 2 * Math.PI * g.r;
  const c = RING_BOX / 2;
  return (
    <div style={{ position: 'relative', width: RING_BOX, height: RING_BOX, flex: 'none' }}
      aria-label={ring.state === 'absent' ? 'calories: nothing logged' : `calories ${ring.eaten} of ${ring.target}${ring.over ? ', over the target' : ''}`}>
      <svg viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} width={RING_BOX} height={RING_BOX} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={c} cy={c} r={g.r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth={g.w} />
        {ring.state === 'absent' ? (
          <circle cx={c} cy={c} r={g.r} fill="none" stroke={GAP_TONE} strokeWidth="3" strokeDasharray="3 5" />
        ) : (
          <circle cx={c} cy={c} r={g.r} fill="none" stroke={ring.hue} strokeWidth={g.w} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - ring.pct / 100)}
            style={{
              filter: `drop-shadow(0 0 6px color-mix(in srgb, ${ring.hue} 55%, transparent))`,
              '--nv-arc-full': circ,
              animation: 'nvArcIn 1s cubic-bezier(.2,.8,.2,1) both',
              transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1), stroke .4s ease',
            }} />
        )}
      </svg>
      <div style={css("position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px")}>
        <b style={css(`font:400 ${ring.eaten.toLocaleString().length > 5 ? '18' : '22'}px/1 var(--nv-font-serif);color:${ring.over ? 'var(--nv-warn)' : 'var(--nv-ink)'};font-variant-numeric:tabular-nums`)}>{ring.state === 'arc' || ring.eaten > 0 ? ring.eaten.toLocaleString() : '—'}</b>
        <Meta tone="faint" style={{ fontVariantNumeric: 'tabular-nums' }}>{ring.target ? `of ${ring.target.toLocaleString()} kcal` : 'kcal, no target'}</Meta>
      </div>
    </div>
  );
}

function MacroRings({ hero }) {
  const drawn = hero.macros.filter((m) => m.state !== 'none');
  return (
    <div style={{ position: 'relative', width: RING_BOX, height: RING_BOX, flex: 'none' }}
      aria-label={drawn.map((m) => `${m.name} ${m.state === 'absent' ? 'not logged' : `${m.eaten} of ${m.target} grams`}`).join(', ')}>
      <svg viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} width={RING_BOX} height={RING_BOX} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        {hero.macros.map((m, i) => {
          if (m.state === 'none') return null;
          const g = RING_GEO[i];
          const circ = 2 * Math.PI * g.r;
          return (
            <g key={m.key}>
              <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={g.r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth={g.w} />
              {m.state === 'absent' ? (
                <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={g.r} fill="none" stroke={GAP_TONE} strokeWidth="3" strokeDasharray="3 5" />
              ) : (
                <circle cx={RING_BOX / 2} cy={RING_BOX / 2} r={g.r} fill="none" stroke={m.hue} strokeWidth={g.w} strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - m.pct / 100)}
                  style={{
                    // the bloom belongs to the OUTER arc only — it is what
                    // makes protein read as the hero rather than one of three
                    // — and it is mixed from the macro's own token, not the
                    // hardcoded rgba(89,230,255) the old ring carried, which
                    // stayed electric cyan under Daylight where --nv-cy is a
                    // deep blue
                    filter: i === 0 ? `drop-shadow(0 0 6px color-mix(in srgb, ${m.hue} 55%, transparent))` : 'none',
                    // the SWEEP. A transition only fires on a CHANGE, and an
                    // arc that replaces the dashed gap MOUNTS at its final
                    // offset — rec.mjs showed frame one dashed and frame two
                    // finished, no motion between. nvArcIn (index.css) starts
                    // the stroke at the full circumference so the arc grows
                    // in; the transition still carries later changes.
                    '--nv-arc-full': circ,
                    animation: 'nvArcIn 1s cubic-bezier(.2,.8,.2,1) both',
                    transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)',
                  }} />
              )}
            </g>
          );
        })}
      </svg>
      <div style={css("position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px")}>
        {/* nothing logged is a GAP, not a zero — the dash RingTile uses,
            beside the dashed ring the arcs already draw for the same state */}
        {/* protein owns this ring's middle now; calories have their own
            ring beside it (26 Sep) */}
        <b style={css("font:400 22px/1 var(--nv-font-serif);color:var(--nv-cy);font-variant-numeric:tabular-nums")}>{hero.p > 0 ? `${hero.p}` : '—'}<span style={css("font-size:13px")}>{hero.p > 0 ? 'g' : ''}</span></b>
        <Meta tone="faint" style={{ fontVariantNumeric: 'tabular-nums' }}>{hero.target ? `of ${hero.target} g protein` : 'protein, no floor'}</Meta>
      </div>
    </div>
  );
}

// The legend the arcs need: which hue is which macro, and the figure behind
// each one. A macro with nothing to report reads "—", never a zero.
function MacroLegend({ hero }) {
  return (
    <div style={css("flex:1 0 100%;display:flex;gap:18px;flex-wrap:wrap;padding-top:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent)")}>
      {hero.macros.map((m) => (
        <span key={m.key} style={css("display:flex;flex-direction:column;gap:2px;min-width:0")}>
          <Eyebrow as="span" tone={m.hue}>{m.name}</Eyebrow>
          <span style={css(`font:600 13px var(--nv-font-ui);color:${m.hue};font-variant-numeric:tabular-nums`)}>
            {m.eaten > 0 || m.target > 0 ? (
              <>{m.eaten > 0 ? m.eaten : '—'}<span style={css("color:color-mix(in srgb, var(--nv-ink) 38%, transparent)")}> / {m.target > 0 ? m.target : '—'} g</span></>
            ) : '—'}
          </span>
        </span>
      ))}
    </div>
  );
}

// TWO NUMBERS, DRAWN. The cross-check card's whole payload is a standard and
// a measurement — "2,065 kcal against the 2,668 target, 603 apart" — and it
// was arriving as five lines of prose in a violet box. Both bars run from the
// same left baseline so their ends are directly comparable; the dashed block
// between those two ends IS the gap, and the serif figure names it. The prose
// keeps its place underneath, demoted, because the sentence still carries the
// reasoning the bars can't.
function CrossBars({ bars, severity }) {
  const hue = severity === 'high' ? 'var(--nv-warn)' : 'var(--nv-vi)';
  const pc = (n) => `${Math.max(0, Math.min(100, (n / bars.max) * 100))}%`;
  const lo = Math.min(bars.need.value, bars.have.value);
  const hi = Math.max(bars.need.value, bars.have.value);
  const row = (r, fill) => (
    <>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0")}>
        <Meta tone="faint" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</Meta>
        <span style={css(`flex:none;font:600 12.5px var(--nv-font-ui);font-variant-numeric:tabular-nums;color:${fill === hue ? hue : 'var(--nv-ink)'}`)}>{r.value.toLocaleString()} {bars.unit}</span>
      </div>
      <div style={css("position:relative;height:9px;margin-top:4px;border-radius:999px;background:color-mix(in srgb, var(--nv-ink) 09%, transparent);overflow:hidden")}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pc(r.value), background: fill, borderRadius: '999px', transition: 'width .7s cubic-bezier(.2,.8,.2,1)' }} />
      </div>
    </>
  );
  return (
    <div style={css("margin-top:10px")}>
      {row(bars.need, 'color-mix(in srgb, var(--nv-ink) 24%, transparent)')}
      <div style={css("height:10px")} />
      {row(bars.have, hue)}
      {/* the distance between the two ends, drawn where it actually is */}
      <div style={css("position:relative;height:22px;margin-top:2px")}>
        <span style={{ position: 'absolute', left: pc(lo), width: `calc(${pc(hi)} - ${pc(lo)})`, top: 0, height: '7px', borderLeft: `1px dashed ${hue}`, borderRight: `1px dashed ${hue}`, borderBottom: `1px dashed ${hue}` }} />
        <span style={{ position: 'absolute', left: 0, right: 0, top: '9px', textAlign: 'center' }}>
          <b style={css(`font:400 19px/1 var(--nv-font-serif);color:${hue};font-variant-numeric:tabular-nums`)}>{bars.gap.toLocaleString()}</b>
          <span style={css(`margin-left:5px;font:600 11.5px var(--nv-font-ui);color:${hue}`)}>{bars.unit} {bars.gapWord}</span>
        </span>
      </div>
    </div>
  );
}

export function Recipes({ v }) {
  // the one bar's "say it": on-device dictation straight into the log input
  const dict = useDictation(() => v.foodDescribeValue || '', (text) => v.setFoodDescribeInput(text), null);
  const [manualOpen, setManualOpen] = useState(false);
  // THE ROTATION RAIL'S OWN ARROWS. The header used to read "‹ › to switch"
  // as an instruction; the arrows are now real controls that move the rail
  // one screenful, which is what the words were asking him to do by hand.
  // A ref, not state — nothing here re-renders.
  const rotationRail = useRef(null);
  const nudgeRotation = (dir) => {
    const el = rotationRail.current;
    if (!el) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(150, el.clientWidth * 0.75), behavior: reduced ? 'auto' : 'smooth' });
  };
  // a photo-scan result lands its numbers in these fields — they must never
  // hide behind a collapsed disclosure while holding his data
  const manualVisible = manualOpen || !!(v.foodLogName || v.foodLogP || v.foodLogC || v.foodLogF || v.foodLogKcal);
  return (
    <div style={v.wrapRecipes} data-screen-label="Recipes">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <ScreenHead numeral="VI." label="Vault · Fuel" />
        <Meta tone="faint">{v.recipesHeaderLabel}</Meta>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:var(--nv-display-track)")}>Fuel, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>macros first.</span></h1>

      {/* the redesigned Fuel hero: three macro arcs + the calories in the
          middle + the gap-fill coach line — one glance answers "where am I,
          and what do I eat next?" (design/UI-REDESIGN-SPEC.md, and finding
          15 of the 22 Sep review for why the numbers beside it became
          geometry). Falls back to the old strip when no protein target
          exists. */}
      {v.fuelHero && (
        <div style={css("margin-top:16px;display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;border:1px solid var(--nv-edge);border-radius:18px;padding:16px;background:var(--nv-glass)")}>
          <div style={css("display:flex;gap:12px;flex:none;justify-content:center")}>
            <KcalRing ring={v.fuelHero.kcalRing} />
            <MacroRings hero={v.fuelHero} />
          </div>
          <div style={css("flex:1;min-width:170px;display:flex;flex-direction:column;gap:6px")}>
            {v.fuelHero.kcalLeft != null && (
              <Tag tone="good" style={{ alignSelf: 'flex-start' }}>Fits {v.fuelHero.kcalLeft} kcal left</Tag>
            )}
            <span style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 62%, transparent);line-height:1.45")}>Coach: {v.fuelHero.gapText}</span>
            {v.askProteinVerdict && (
              <Chip tone="cyan" onClick={v.askProteinVerdict} style={{ alignSelf: 'flex-start' }}>Where did my protein go?</Chip>
            )}
          </div>
          <MacroLegend hero={v.fuelHero} />
        </div>
      )}

      {/* PICK IT UP — the answer to the hero's "Fits N kcal left": every
          chain and supermarket item that fits, prefilled from the real day */}
      <PickItUp v={v} />

      {/* today so far — everything actually eaten, at a glance */}
      {!v.fuelHero && v.dayMacros && v.structured && <EatenTiles m={v.dayMacros} />}
      {!v.fuelHero && v.dayMacros && !v.structured && (
        <div style={css("margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-cy) 22%, transparent);border-radius:12px;padding:11px 16px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 05%, transparent),transparent)")}>
          <Eyebrow as="span" tone="cyan" style={{ flex: 'none' }}>Eaten today</Eyebrow>
          {v.dayMacros.proteinPct != null && (
            <span style={css("flex:none;display:flex;align-items:center;gap:7px")}>
              <span style={{ width: '30px', height: '30px', borderRadius: '50%', padding: '2px', flex: 'none', background: `conic-gradient(var(--nv-cy) ${v.dayMacros.proteinPct}%, var(--nv-edge) 0)` }}>
                <span style={css("width:100%;height:100%;border-radius:50%;background:var(--nv-glass2);display:flex;align-items:center;justify-content:center;font:var(--nv-micro-s);color:var(--nv-cy)")}>{v.dayMacros.proteinPct}%</span>
              </span>
              <span style={css("font:var(--nv-micro-l);color:var(--nv-cy)")}>{v.dayMacros.p}/{v.dayMacros.proteinTarget}g P</span>
            </span>
          )}
          {v.dayMacros.proteinPct == null && <span style={css("font:var(--nv-micro-l);color:var(--nv-cy)")}>{v.dayMacros.p}g P</span>}
          <span style={css("font:var(--nv-micro-l);color:color-mix(in srgb, var(--nv-ink) 62%, transparent)")}>
            <span style={css("color:var(--nv-gold)")}>{v.dayMacros.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.dayMacros.f}F</span> · <span style={css("color:var(--nv-good)")}>{v.dayMacros.kcal}{v.dayMacros.targetKcal ? `/${v.dayMacros.targetKcal}` : ''} kcal</span>
          </span>
        </div>
      )}

      {/* the week, at a glance — same truth (and same renderer) as the
          voice panel; the archive is calendar-true so gaps show honestly */}
      {v.fuelWeek && (
        <div style={css("margin-top:12px")}>
          <SafeVisual what="panel:nutrition-week"><VoicePanel panel={{ type: 'nutrition-week', data: v.fuelWeek }} /></SafeVisual>
        </div>
      )}

      {/* the cross-reference agent's card (mockup v2): training × fuel joins,
          surfaced where the eating decisions happen. Hidden when the agent
          has nothing true to say. */}
      {v.fuelCross && (
        <div style={css("margin-top:12px;border:1px solid color-mix(in srgb, var(--nv-vi) 38%, transparent);border-radius:14px;padding:14px 17px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-vi) 06%, transparent),transparent)")}>
          <Eyebrow tone={v.fuelCross.couldntLook ? 'warn' : 'violet'}>◈ Training × fuel — {v.fuelCross.couldntLook ? "couldn't check" : 'cross-check'}</Eyebrow>
          {v.fuelCross.bars && <CrossBars bars={v.fuelCross.bars} severity={v.fuelCross.severity} />}
          {/* the prose still carries the reasoning, but it is no longer the
              only thing on the card, so it reads at the size of a footnote */}
          <div style={{ marginTop: v.fuelCross.bars ? '10px' : '8px', font: `400 12.5px/1.5 var(--nv-font-ui)`, color: 'var(--nv-ink60)' }}>{v.fuelCross.line}</div>
          {v.fuelCross.draft && (
            <Interactive as="span" onClick={v.fuelCross.draft}
              /* 149x13 — the action on the cross-check card, and the
                 smallest target on Fuel (measured 23 Sep) */
              base={css("cursor:pointer;display:inline-flex;align-items:center;min-height:32px;margin-top:5px;padding:6px 10px 6px 0;font:600 12.5px var(--nv-font-ui);color:var(--nv-vi)")}
              hoverStyle="filter:brightness(1.25)">Draft the fix with Coach →</Interactive>
          )}
        </div>
      )}

      {/* the mockup's rotation: horizontal tick-cards — the action taken 4x
          a day gets the biggest targets on the screen. One component, both
          layouts. v2 (7 Sep): a slot holds OPTIONS. The one in FOCUS (★) is
          what today's plan counts; each option has its own tick (✓ eaten →
          the food log, and one portion off the fridge). The fridge count
          rides the card and goes red when that dish is out. Extra meals
          beyond the standard five are his to add and name. */}
      {v.rotationVisible && (
        <div style={css("margin-top:18px")}>
          {/* THE HEADER IS NOT A MANUAL (finding 15 of the 22 Sep review,
              which quotes the old label in full). It was one uppercase
              micro-label wrapping to two lines to explain three controls
              that are all already on screen: the card IS the tap target, the
              arrows-and-dots row inside a multi-option card already switches
              the focused dish, and the hold menu is the hold menu. What was
              missing was a way to move the RAIL, so that is what the arrows
              here do. apple-design §16: if you need a label to explain a
              control, the mapping is weak. */}
          <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin:0 2px 8px")}>
            <span style={css("display:flex;align-items:center;gap:2px;min-width:0")}>
              <Eyebrow as="span">Today's rotation</Eyebrow>
              <TextAction compact tone="accent" ariaLabel="Scroll the rotation back" onClick={() => nudgeRotation(-1)} style={{ fontSize: '15px', minWidth: '34px', marginLeft: '6px' }}>‹</TextAction>
              <TextAction compact tone="accent" ariaLabel="Scroll the rotation on" onClick={() => nudgeRotation(1)} style={{ fontSize: '15px', minWidth: '34px' }}>›</TextAction>
            </span>
            <span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
              <span style={css("color:var(--nv-cy)")}>{v.rotationTotals.p}P</span> · <span style={css("color:var(--nv-gold)")}>{v.rotationTotals.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.rotationTotals.f}F</span> · <span style={css("color:var(--nv-good)")}>{v.rotationTotals.kcal}</span>
            </span>
          </div>
          {/* THE PEEK IS ALREADY REAL, and the trailing 12px is what keeps
              it honest at the end of the run. Five slots at 172-196px plus
              gaps is ~900px of content: at 375 and at 1280 the rail always
              overflows, so the next card is cut by the edge rather than
              sitting flush — which is the affordance the old "‹ › to switch"
              label was trying to supply in words. Nothing measured, no state:
              the geometry does it. */}
          <div ref={rotationRail} style={css("display:flex;gap:10px;overflow-x:auto;padding:2px 12px 8px 2px;scrollbar-width:none;align-items:stretch")}>
            {v.rotationSlots.map((s) => <RotationCard key={s.key} s={s} />)}
            {/* a meal beyond the five — pre-workout, second breakfast, whatever he calls it */}
            {v.rotationAddMeal && (
              <Interactive as="div" onClick={() => { const l = window.prompt('Name the meal (e.g. Pre-workout)', ''); if (l && l.trim()) v.rotationAddMeal(l.trim()); }}
                base={{ flex: '0 0 120px', cursor: 'pointer', borderRadius: '16px', border: '1px dashed var(--nv-edge)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', font: 'var(--nv-micro-l)', color: 'var(--nv-acc)', minHeight: '110px', padding: '8px' }}
                hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}>+ ADD A MEAL</Interactive>
            )}
          </div>
        </div>
      )}

      {v.foodLogVisible && (
        <div style={css("margin-top:12px;border:1px solid color-mix(in srgb, var(--nv-good) 18%, transparent);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-good) 05%, transparent),color-mix(in srgb, var(--nv-good) 01%, transparent));box-shadow:inset 0 1px 0 rgba(255,255,255,.04)")}>
          {/* mockup v2: no headline, no furniture — the bar IS the feature.
              The day strip lives BELOW it; off-plan totals ride the strip. */}
          <div style={css("display:none")}>
            {v.foodLogDays.map((d) => (
              <Interactive key={d.key} as="span" onClick={d.pick}
                base={{ cursor: 'pointer', font: 'var(--nv-micro-s)', letterSpacing: '.1em', padding: '5px 10px', borderRadius: '7px',
                  border: d.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)',
                  color: d.active ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)',
                  background: d.active ? 'var(--nv-acc-bg)' : 'none' }}
                hoverStyle={{ color: 'var(--nv-ink)' }}
              >{d.label}</Interactive>
            ))}
          </div>
          {v.foodLogViewingLabel && (
            <Meta as="div" tone="gold" style={{ marginTop: '8px' }}>{v.foodLogViewingLabel}</Meta>
          )}
          {/* ONE FIELD, NOT FIVE BOXES (22 Sep 2026). "I need the food log to
              be revised to be cleaner, easier, more apple-like aesthetic."
              This was an input followed by four separate 42px bordered
              squares in a row — at 375px that is 168px of chrome plus gaps
              beside a field with nowhere left to go, and it read as a toolbar
              rather than a place to type.

              Apple's own composers put the verbs INSIDE the field: one
              rounded well, the text on the left, the ways of saying it on the
              right, and the send control appearing only once there is
              something to send. Same four capabilities — type it, say it,
              shoot it, scan it — one object instead of five. */}
          <div style={css("margin-top:12px;display:flex;align-items:center;gap:2px;background:var(--nv-well);border:1px solid var(--nv-edge);border-radius:14px;padding:4px 5px 4px 6px;transition:border-color .18s var(--nv-ease)")}>
            {/* his report: typing a food and hitting Enter looked like it did
                nothing — because it didn't SHOW anything, even though a
                search was genuinely running. Disabled proves the tap
                registered; the caption below the bar (not the placeholder —
                the box still holds what he typed, so a placeholder swap
                would never actually be visible) is the rest of the fix. */}
            <Interactive as="input" value={v.foodDescribeInput} onChange={v.setFoodDescribeInput} onKeyDown={v.describeFoodKey}
              disabled={v.foodScanBusy}
              placeholder="Log anything…"
              base="flex:1;min-width:0;box-sizing:border-box;background:none;border:none;border-radius:10px;padding:9px 8px;color:var(--nv-ink);font-family:var(--nv-font-ui);outline:none" />
            {dict.supported && (
              <Interactive as="span" onClick={dict.toggle} aria-label={dict.on ? 'Stop dictating' : 'Say it'}
                base={css(`cursor:pointer;flex:none;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${dict.on ? 'color-mix(in srgb, var(--nv-good) 22%, transparent)' : 'none'}`)}
                hoverStyle="background:rgba(255,255,255,.06)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={dict.on ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)'} strokeWidth="2.2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
              </Interactive>
            )}
            {/* THE CAMERA IS A LABEL WRAPPING THE INPUT, and stays one. On
                iOS that single element is what opens the sheet offering Take
                Photo OR the library — `capture` would force the camera and
                take the library away, and a click() from a handler is the
                shape iOS blocks in a standalone PWA. */}
            <label aria-label="Shoot or add photos" style={css("cursor:pointer;flex:none;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center")}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="color-mix(in srgb, var(--nv-ink) 55%, transparent)" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>
              <input type="file" accept="image/*" multiple onChange={v.addFoodScanPhotos} disabled={v.foodScanBusy} style={css("display:none")} />
            </label>
            <Interactive as="span" onClick={v.foodScanBusy ? undefined : v.openBarcodeScanner} aria-label="Scan barcode"
              base="cursor:pointer;flex:none;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center"
              hoverStyle="background:rgba(255,255,255,.06)">
              <svg width="17" height="17" viewBox="0 0 24 24" stroke="color-mix(in srgb, var(--nv-ink) 55%, transparent)" strokeWidth="2"><path d="M4 6v12M8 6v12M12 6v12M15 6v12M19 6v12" fill="none"/></svg>
            </Interactive>
            {/* THE SUBMIT CONTROL. The bar once had none — the comment here
                claimed "Enter or the arrow submits" while only Enter existed,
                so on a phone (no Enter key in reach, keyboard over the view) a
                typed food genuinely could not be searched. It now ARRIVES
                when there is something to send, the way a send button does,
                instead of sitting there greyed out taking up the width. */}
            {v.canDescribeFood && (
              <Interactive as="span" onClick={v.describeFoodSearch} aria-label="Search this food" haptic="commit"
                base={{ cursor: 'pointer', flex: 'none', width: '34px', height: '34px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--nv-good)', opacity: v.foodScanBusy ? 0.5 : 1,
                  animation: 'nvSendArrive var(--nv-dur-fast) var(--nv-ease) both' }}
                hoverStyle={{ filter: 'brightness(1.08)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#122015" strokeWidth="2.6"><path d="M12 19V6M5 12l7-7 7 7"/></svg>
              </Interactive>
            )}
          </div>
          {v.foodScanBusy && (
            <div style={css("margin-top:7px;display:flex;align-items:center;gap:6px;font-size:11px;color:color-mix(in srgb, var(--nv-good) 75%, var(--nv-ink))")}>
              <span style={css("width:6px;height:6px;border-radius:50%;background:var(--nv-good);flex:none;animation:novaPulse 1.4s ease-in-out infinite")}></span>
              {v.foodScanSlow ? 'Still searching — a named product can take a moment…' : 'Searching…'}
            </div>
          )}

          {/* THE QUICK-LOG RAIL. Directly under the composer, because this is
              the fastest way to log and the fastest way should be the nearest
              thing to hand. Newest first — see foodHistory.js. */}
          {v.foodQuickLog.length > 0 && (
            <div style={css("margin-top:12px")}>
              <Eyebrow as="div" style={{ margin: '0 2px 7px' }}>Log it again</Eyebrow>
              <div style={css("display:flex;gap:8px;overflow-x:auto;padding:1px 2px 6px;scrollbar-width:none;scroll-snap-type:x proximity")}>
                {v.foodQuickLog.map((it) => (
                  <div key={it.key} style={css("scroll-snap-align:start;display:flex")}><QuickLogCard item={it} /></div>
                ))}
              </div>
            </div>
          )}

          {/* WHICH DAY THIS LANDS ON — one scrolling rail, never two wrapped
              rows. Seven chips plus the "For" label wrapped at 402px and the
              second row read as a separate control (aesthetic review, finding
              15). A rail is also the honest shape: this is a list that has no
              natural end, not a set of options that happens to be seven. */}
          <div style={css("margin-top:10px;display:flex;gap:7px;align-items:center;overflow-x:auto;padding-bottom:2px;scrollbar-width:none")}>
            <Meta tone="faint" style={{ flex: 'none' }}>For</Meta>
            {v.foodLogDays.map((d) => (
              <span key={d.key} style={css("flex:none")}><Chip tone={d.active ? 'accent' : 'quiet'} active={d.active} onClick={d.pick}>{cap(d.label)}</Chip></span>
            ))}
          </div>
          {/* WHAT TODAY ALREADY HOLDS, as a shape rather than a sentence. The
              line used to read "off-plan: 113P · 1255 kcal" in 11px grey — a
              number he is steering by, set smaller than the labels around it.
              Same three hues as the rail cards, so the bar means the same
              thing in both places. */}
          {v.foodLogEntries.length > 0 && (
            <div style={css("margin-top:10px;display:flex;align-items:center;gap:11px")}>
              <span style={css("display:flex;align-items:baseline;gap:4px;flex:none")}>
                <span style={css("font:700 17px var(--nv-font-ui);letter-spacing:var(--nv-display-track);color:var(--nv-ink);font-variant-numeric:tabular-nums")}>{v.foodLogTotals.kcal}</span>
                <span style={css("font:600 9.5px var(--nv-font-ui);letter-spacing:.06em;color:color-mix(in srgb, var(--nv-ink) 42%, transparent)")}>KCAL OFF-PLAN</span>
              </span>
              <span style={css("flex:1;min-width:0;display:flex;flex-direction:column;gap:4px")}>
                <span aria-hidden="true" style={css("display:flex;height:4px;border-radius:2px;overflow:hidden;background:color-mix(in srgb, var(--nv-ink) 10%, transparent)")}>
                  {(() => {
                    const t = v.foodLogTotals, g = (Number(t.p) || 0) + (Number(t.c) || 0) + (Number(t.f) || 0);
                    const w = (n) => (g > 0 ? `${((Number(n) || 0) / g) * 100}%` : '0%');
                    return (<>
                      <span style={{ width: w(t.p), background: 'var(--nv-cy)' }} />
                      <span style={{ width: w(t.c), background: 'var(--nv-gold)' }} />
                      <span style={{ width: w(t.f), background: 'var(--nv-vi)' }} />
                    </>);
                  })()}
                </span>
                <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                  <span style={css("color:var(--nv-cy)")}>{v.foodLogTotals.p}P</span> · <span style={css("color:var(--nv-gold)")}>{v.foodLogTotals.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.foodLogTotals.f}F</span>
                </span>
              </span>
            </div>
          )}
          {/* Log part of something already in his collection — his ask: a bag
              stored as one full serving, eaten a third at a time, without
              re-entering it as a new food. */}
          {/* the two slower ways in, on ONE line. They were stacked rows,
              which gave a fallback (typing four numbers by hand) the same
              vertical weight as the composer above it. */}
          <div style={css("margin-top:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
            <Chip tone={v.foodRecipePickerOpen ? 'accent' : 'quiet'} active={v.foodRecipePickerOpen} onClick={v.foodRecipePickerOpen ? v.closeFoodRecipePicker : v.openFoodRecipePicker}>
              {v.foodRecipePickerOpen ? '× From your recipes' : '＋ From your recipes'}
            </Chip>
            <TextAction compact tone="quiet" onClick={() => setManualOpen(!manualOpen)}>{manualVisible ? '▾' : '▸'} Enter macros myself</TextAction>
          </div>
          {v.foodRecipePickerOpen && (
            <div style={css("margin-top:10px;border:1px solid var(--nv-edge);border-radius:12px;background:rgba(0,0,0,.22);padding:12px;animation:fadeUp var(--nv-dur-base) var(--nv-ease)")}>
              <Interactive as="input" value={v.foodRecipePickerQuery} onChange={v.setFoodRecipePickerQuery}
                placeholder="Search your recipes…"
                base="width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
                focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
              <div style={css("margin-top:9px;max-height:210px;overflow-y:auto;display:flex;flex-direction:column;gap:5px")}>
                {v.foodRecipeOptions.length === 0 && (
                  <div style={css("padding:10px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>No recipes match that.</div>
                )}
                {v.foodRecipeOptions.map((r) => (
                  <Interactive key={r.id} onClick={r.pick}
                    base={{ cursor: 'pointer', padding: '9px 11px', borderRadius: '9px', border: r.active ? '1px solid var(--nv-acc-border)' : '1px solid transparent', background: r.active ? 'var(--nv-acc-bg)' : 'none' }}
                    hoverStyle="background:rgba(255,255,255,.05)">
                    <div style={css("font-size:13px;color:var(--nv-ink)")}>{r.name}</div>
                    <div style={css("margin-top:3px;font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{r.sub}</div>
                  </Interactive>
                ))}
              </div>
              {v.foodRecipePick && (
                <div style={css("margin-top:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent);padding-top:12px")}>
                  <Eyebrow>How much of it?</Eyebrow>
                  <div style={css("margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center")}>
                    {v.foodRecipePick.portions.map((pn) => (
                      <Interactive key={pn.label} as="span" onClick={pn.pick}
                        base={{ cursor: 'pointer', minWidth: '44px', textAlign: 'center', font: "600 13px var(--nv-font-ui)", padding: '9px 12px', borderRadius: '9px',
                          border: pn.active ? '1px solid var(--nv-good)' : '1px solid color-mix(in srgb, var(--nv-ink) 13%, transparent)',
                          color: pn.active ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 60%, transparent)',
                          background: pn.active ? 'color-mix(in srgb, var(--nv-good) 12%, transparent)' : 'none' }}
                        hoverStyle="background:rgba(255,255,255,.06)">{pn.label}</Interactive>
                    ))}
                    <Interactive as="input" value={v.foodRecipePick.custom} onChange={v.foodRecipePick.setCustom}
                      placeholder="or 0.4…" inputMode="decimal"
                      base="width:88px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-mono);outline:none"
                      focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
                  </div>
                  <div style={css("margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap")}>
                    <div style={css("flex:1;min-width:180px")}>
                      <div style={css("font-size:12.5px;color:var(--nv-ink)")}>{v.foodRecipePick.loggedName || v.foodRecipePick.name}</div>
                      <div style={{ marginTop: '3px', font: 'var(--nv-micro-l)', color: v.foodRecipePick.valid ? 'var(--nv-good)' : '#e08f6f' }}>{v.foodRecipePick.preview}</div>
                    </div>
                    <Button onClick={v.foodRecipePick.confirm} disabled={!v.foodRecipePick.valid}
                      tone="good" style={{ flex: 'none' }}>
                      Log it
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {v.foodScanCount > 0 && (
            <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              <Interactive as="input" value={v.foodScanNote} onChange={v.setFoodScanNote} placeholder="Note — e.g. “ate half” (optional)" base="flex:1;min-width:160px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            </div>
          )}
          {v.foodScanCount > 0 && (
            <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              {v.foodScanPhotos.map((ph) => (
                <div key={ph.src.slice(-28)} style={css("position:relative;width:52px;height:52px;border-radius:8px;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)")}>
                  <img src={ph.src} alt="" style={css("width:100%;height:100%;object-fit:cover;display:block")} />
                  <Interactive as="span" onClick={ph.remove} base="cursor:pointer;position:absolute;top:1px;right:1px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;border-radius:5px;background:rgba(0,0,0,.6);color:#fff" hoverStyle="background:var(--nv-warn)">×</Interactive>
                </div>
              ))}
              <Button onClick={v.canRunFoodScan ? v.runFoodScan : undefined} disabled={v.foodScanBusy || !v.canRunFoodScan} tone="good" style={{ flex: 'none' }}>{v.foodScanBusy ? 'Analyzing…' : `Analyze ${v.foodScanCount} photo${v.foodScanCount === 1 ? '' : 's'}`}</Button>
            </div>
          )}
          {v.foodScanCount > 0 && <div style={css("margin-top:8px;font-size:11px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent);line-height:1.5")}>Add up to 5 — nutrition labels and/or the food itself. More photos + a note give a sharper estimate.</div>}
          {v.foodScanError && <div style={css("margin-top:8px;font-size:12px;color:#e08f6f")}>{v.foodScanError}</div>}
          {v.foodScanQuestion && (
            <div style={css("margin-top:10px;border:1px solid color-mix(in srgb, var(--nv-gold) 32%, transparent);border-radius:11px;padding:11px 13px;background:color-mix(in srgb, var(--nv-gold) 05%, transparent)")}>
              <div style={css("font-size:12.5px;line-height:1.5;color:var(--nv-gold)")}>Nova asks: <em>{v.foodScanQuestion}</em></div>
              {v.foodScanCanAnswer ? (
                <div style={css("margin-top:9px;display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
                  <Interactive as="input" value={v.foodScanAnswer} onChange={v.setFoodScanAnswer}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !v.foodScanBusy) v.answerFoodScan(); }}
                    placeholder='Answer — e.g. "ate the whole packet", "about 300g"'
                    base="flex:1;min-width:170px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-family:var(--nv-font-ui);outline:none"
                    focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)" />
                  {/* GOLD HERE IS EARNED, and is the exception to the sweep
                      of 22 Sep. Nova has asked him a question it cannot answer
                      itself and can file nothing until he replies: that is the
                      undecided state of a proposal, which is the one job §2b
                      rule 8 keeps gold for. The whole panel is gold with it. */}
                  <Button onClick={v.answerFoodScan} disabled={v.foodScanBusy || !v.foodScanAnswer.trim()}
                    tone="undecided" style={{ flex: 'none' }}>{v.foodScanBusy ? 'Refining…' : 'Refine estimate'}</Button>
                  <TextAction compact tone="faint" onClick={v.dismissFoodScanQuestion}>Keep as is</TextAction>
                </div>
              ) : (
                <div style={css("margin-top:5px;font-size:11px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Adjust the numbers below if needed — saving works either way.</div>
              )}
              <div style={css("margin-top:7px;font-size:10.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Answering refines the estimate from your words. Or skip it — the numbers below save exactly as they are.</div>
            </div>
          )}
          {/* manual macros are the fallback, not the feature — folded away
              (mockup: one bar, four senses; numbers only when he wants them) */}
          {manualVisible && <div style={css("margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
            <Interactive as="input" value={v.foodLogName} onChange={v.setFoodLogName} placeholder="What did you eat?" base="flex:1;min-width:140px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogP} onChange={v.setFoodLogP} placeholder="P" base="width:52px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-cy);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogC} onChange={v.setFoodLogC} placeholder="C" base="width:52px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-gold);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogF} onChange={v.setFoodLogF} placeholder="F" base="width:52px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-vi);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogKcal} onChange={v.setFoodLogKcal} placeholder="kcal" base="width:62px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-good);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Button onClick={v.submitFoodLog} disabled={v.foodLogBusy} tone="good" style={{ flex: 'none' }}>{v.foodLogBusy ? 'Adding…' : '+ Add'}</Button>
          </div>}
          {v.canSaveScanToRecipe && (
            <div style={css("margin-top:8px")}>
              <Interactive as="span" onClick={v.saveScanToRecipe} base="cursor:pointer;font-size:11px;color:var(--nv-gold)" hoverStyle="text-decoration:underline">＋ Save this to my recipe bank</Interactive>
            </div>
          )}
          {v.foodLogError && <div style={css("margin-top:8px;font-size:12px;color:#e08f6f")}>{v.foodLogError}</div>}
          {v.foodLogPending && (
            <div style={css("margin-top:10px;border:1px solid color-mix(in srgb, var(--nv-good) 30%, transparent);border-radius:11px;padding:11px 13px;background:color-mix(in srgb, var(--nv-good) 05%, transparent)")}>
              <Eyebrow tone="good">Broken down into {v.foodLogPending.count} lines</Eyebrow>
              <div style={css("margin-top:7px;display:flex;flex-direction:column;gap:3px")}>
                {v.foodLogPending.lines.map((l) => (
                  <div key={l.key} className={l.fresh ? 'nv-deck-rise' : undefined} style={css(`display:flex;align-items:baseline;gap:8px;min-width:0${l.fresh ? ';border-radius:6px;margin:0 -6px;padding:1px 6px;background:color-mix(in srgb, var(--nv-good) 12%, transparent)' : ''}`)}>
                    <span style={css(`min-width:0;flex:1;font-size:12.5px;color:${l.fresh ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 80%, transparent)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)} title={l.source || undefined}>
                      {l.name}{l.grams ? ` · ${l.grams} g` : ''}
                    </span>
                    <span style={css("flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{l.macros}</span>
                  </div>
                ))}
              </div>
              <Meta tone="faint" style={{ display: 'block', marginTop: '7px' }}>They ride with the entry — you can drop any single line after logging.</Meta>
            </div>
          )}
          {/* SAY WHAT'S DIFFERENT (26 Sep). His plate was read as a beef
              rissole; it was vegetarian, and there was no way to tell Nova
              after the first answer. Now every estimate can be corrected in
              words, as many times as he likes, before anything is logged. Each
              turn is acted out: what left the plate is struck, what arrived is
              lit, and the calorie shift is a figure. */}
          {v.foodRefine && (
            <div style={css("margin-top:10px;border:1px solid color-mix(in srgb, var(--nv-cy) 26%, transparent);border-radius:12px;padding:11px 13px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
              {v.foodRefine.thread.length > 0 && (
                <div style={css("display:flex;flex-direction:column;gap:9px;margin-bottom:10px")}>
                  {v.foodRefine.thread.map((t) => (
                    <div key={t.key} className="nv-deck-rise" style={css("display:flex;flex-direction:column;gap:4px;min-width:0")}>
                      <span style={css("align-self:flex-end;max-width:85%;font-size:12.5px;line-height:1.4;padding:6px 10px;border-radius:12px 12px 3px 12px;background:color-mix(in srgb, var(--nv-ink) 08%, transparent);color:var(--nv-ink);overflow-wrap:anywhere")}>{t.said}</span>
                      <div style={css("display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0")}>
                        {t.removed.map((n) => <span key={`r-${n}`} style={css("font-size:12px;color:var(--nv-ink60);text-decoration:line-through;text-decoration-color:var(--nv-warn)")}>{n}</span>)}
                        {t.removed.length > 0 && t.added.length > 0 && <span aria-hidden="true" style={css("font-size:12px;color:var(--nv-ink60)")}>to</span>}
                        {t.added.map((n) => <span key={`a-${n}`} style={css("font-size:12px;font-weight:600;color:var(--nv-good)")}>{n}</span>)}
                        {t.delta && <Tag tone={t.up ? 'gold' : 'good'} style={{ flex: 'none' }}>{t.delta}</Tag>}
                      </div>
                      {t.changes && <span style={css("font-size:11.5px;line-height:1.45;color:var(--nv-ink60)")}>{t.changes}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div style={css("display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
                <Interactive as="input" value={v.foodRefine.value} onChange={v.foodRefine.set}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !v.foodRefine.busy) v.foodRefine.send(); }}
                  placeholder={v.foodRefine.thread.length ? 'Anything else different?' : 'Anything different? e.g. “the rissole was vegetarian”'}
                  aria-label="Correct the estimate"
                  base="flex:1;min-width:170px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:16px;font-family:var(--nv-font-ui);outline:none"
                  focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
                <Button onClick={v.foodRefine.send} disabled={v.foodRefine.busy || !v.foodRefine.value.trim()} tone="cyan" style={{ flex: 'none' }}>{v.foodRefine.busy ? 'Refining…' : 'Refine'}</Button>
              </div>
              <Meta tone="faint" style={{ display: 'block', marginTop: '7px' }}>Keep correcting as often as you like. Nothing is logged until you tap Add.</Meta>
            </div>
          )}
          {v.foodItemUndo && (
            <div style={css("margin-top:10px")}>
              <TextAction onClick={v.foodItemUndo.run}>{v.foodItemUndo.label}</TextAction>
            </div>
          )}
          {/* THE DAY, AS ONE GROUPED LIST (22 Sep 2026). Every row used to
              carry its own top border, so eight entries drew eight hairlines
              across the full width and the list read as eight objects rather
              than one day. Apple's grouped list is the opposite: ONE inset
              container, separators that start where the text starts and stop
              at the last row, and no line at all above the first or below the
              last. Nothing else changed about what a row does — the ✎ and ×
              stay exactly where his thumb already knows they are, because his
              complaint was that this looked cluttered, not that it behaved
              wrongly. */}
          {v.foodLogEntries.length > 0 && (
            <div style={css("margin-top:12px;border-radius:14px;border:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);background:color-mix(in srgb, var(--nv-void) 22%, transparent);overflow:hidden")}>
              {v.foodLogEntries.map((e, i) => (
                <div key={e.id}>
                {/* the separator starts where the NAME starts, not at the
                    container's edge — that inset is the whole signature of an
                    Apple grouped list, and a full-bleed rule reads as a table */}
                {i > 0 && <div aria-hidden="true" style={css("height:1px;margin-left:58px;background:color-mix(in srgb, var(--nv-ink) 09%, transparent)")} />}
                <div style={css("display:flex;align-items:center;gap:10px;font-size:12.5px;padding:9px 10px 9px 12px")}>
                  <span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 40%, transparent);width:36px;flex:none;font-variant-numeric:tabular-nums")}>{e.time}</span>
                  {/* title over macros, iOS-list style: side by side, a long
                      name plus four macro figures pushed the ✎ and × past the
                      row's right edge at 375px (measured, not guessed) */}
                  <span style={css("min-width:0;flex:1;display:flex;flex-direction:column;gap:2px")}>
                    <span style={css("overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500")}>{e.name}</span>
                    <span style={css("display:flex;align-items:center;gap:7px;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>
                      <span><span style={css("color:color-mix(in srgb, var(--nv-cy) 80%, transparent)")}>{e.p}P</span> · <span style={css("color:color-mix(in srgb, var(--nv-gold) 80%, transparent)")}>{e.c}C</span> · <span style={css("color:color-mix(in srgb, var(--nv-vi) 80%, transparent)")}>{e.f}F</span> · {e.kcal}kcal</span>
                      {e.edited && <Tag tone="gold" title="amended after logging" style={{ flex: 'none' }}>Edited</Tag>}
                    </span>
                  </span>
                  {/* a 44px tap target either side — these rows sit close together */}
                  <Interactive as="span" onClick={e.edit} aria-label={`Edit ${e.name}`}
                    base="cursor:pointer;flex:none;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)"
                    hoverStyle="color:var(--nv-cy)">✎</Interactive>
                  <Interactive as="span" onClick={e.remove} aria-label={`Remove ${e.name}`}
                    base="cursor:pointer;flex:none;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)"
                    hoverStyle="color:var(--nv-warn)">×</Interactive>
                </div>
                {/* THE ITEMISED PLATE — what the photo or the sentence was
                    broken into. Each line goes on its own, and the meal's
                    total is the server's sum of the ones that are left, so a
                    wrong estimate is correctable instead of all-or-nothing. */}
                {e.items.length > 0 && (
                  <div style={css("margin:0 0 7px 58px;display:flex;flex-direction:column;gap:2px")}>
                    {e.items.map((it) => (
                      <div key={it.id} style={css("display:flex;align-items:center;gap:8px;min-width:0")}>
                        <span style={css("flex:none;color:color-mix(in srgb, var(--nv-ink) 26%, transparent);font-size:11px")}>└</span>
                        <span style={css("min-width:0;flex:1;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 72%, transparent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}
                          title={it.source || undefined}>
                          {it.name}{it.grams ? ` · ${it.grams} g` : ''}
                        </span>
                        <span style={css("flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 42%, transparent)")}>{it.macros}</span>
                        <Interactive as="span" onClick={it.remove} aria-label={`Remove ${it.name} from ${e.name}`}
                          base="cursor:pointer;flex:none;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 30%, transparent)"
                          hoverStyle="color:var(--nv-warn)">×</Interactive>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              ))}
            </div>
          )}
          {v.foodLogEntries.length > 0 && (
            <div style={css("margin-top:6px;display:flex;flex-direction:column;gap:6px")}>
              {v.foodEdit && (
                <div style={css("margin-top:6px;border:1px solid color-mix(in srgb, var(--nv-cy) 32%, transparent);border-radius:11px;padding:12px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent);animation:fadeUp var(--nv-dur-base) var(--nv-ease)")}>
                  <Eyebrow tone="cyan">Edit this entry</Eyebrow>
                  <Interactive as="input" value={v.foodEdit.name} onChange={v.foodEdit.setName}
                    base="margin-top:9px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 12px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none"
                    focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 55%, transparent)" />
                  <div style={css("margin-top:8px;display:flex;gap:7px;flex-wrap:wrap")}>
                    {v.foodEdit.fields.map((f) => (
                      <div key={f.key} style={css("flex:1;min-width:64px")}>
                        <div style={css("font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{f.label}</div>
                        <Interactive as="input" value={f.value} onChange={f.set} inputMode="decimal"
                          base="margin-top:3px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 10px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-mono);outline:none"
                          focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 55%, transparent)" />
                      </div>
                    ))}
                  </div>
                  <div style={css("margin-top:9px;display:flex;gap:7px;align-items:center;flex-wrap:wrap")}>
                    <Meta tone="faint">Ate less —</Meta>
                    {v.foodEdit.quick.map((q) => (
                      <Interactive key={q.label} as="span" onClick={q.apply}
                        base="cursor:pointer;font:600 12px var(--nv-font-ui);padding:6px 11px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 13%, transparent);color:color-mix(in srgb, var(--nv-ink) 60%, transparent)"
                        hoverStyle="background:rgba(255,255,255,.06);color:var(--nv-ink)">{q.label}</Interactive>
                    ))}
                    <div style={css("margin-left:auto;display:flex;gap:8px")}>
                      <TextAction compact tone="quiet" onClick={v.foodEdit.cancel}>Cancel</TextAction>
                      <Button compact onClick={v.foodEdit.save}>Save</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={css("margin-top:14px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:10px")}>
            <TextAction compact tone="quiet" onClick={v.toggleFoodHistory} style={{ marginLeft: '-8px' }}>{v.foodHistoryOpen ? '▾' : '▸'} Everything you've logged</TextAction>
            {v.foodHistoryOpen && (
              <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:5px")}>
                {!v.foodHistoryLoaded && <div style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Loading…</div>}
                {v.foodHistoryLoaded && v.foodHistory.length === 0 && <div style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);line-height:1.5")}>Nothing off-plan yet. Scanned and quick-added foods collect here, and the newest of them ride the rail at the top.</div>}
                {v.foodHistory.map((it) => (
                  <div key={it.key} style={css("display:flex;align-items:center;gap:9px;font-size:12.5px;padding:4px 0")}>
                    <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{it.name}{it.seen && <span style={css("margin-left:6px;font:var(--nv-micro-m);color:var(--nv-gold)")}>{it.seen}</span>}</span>
                    <span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 42%, transparent);flex:none")}>{it.macroLabel}</span>
                    <TextAction compact tone="good" onClick={it.relog} style={{ flex: 'none' }}>＋ Log</TextAction>
                    <Interactive as="span" onClick={it.toRecipe} aria-label="Save to recipe bank" base="cursor:pointer;flex:none;font-size:15px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 38%, transparent)" hoverStyle="color:var(--nv-gold)">☆</Interactive>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;justify-content:space-between;align-items:center")}>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px;align-items:center")}>
          {v.recipeFilters.map((f) => (
            <Chip key={f.label} tone="accent" active={f.active} onClick={f.go}>{f.label}</Chip>
          ))}
          {/* local echo, filter-only (no submit): typing no longer
              re-renders the whole app per character; the 150ms debounce
              drives the actual filtering. */}
          <LocalInput value={v.recipeSearch} onChange={(t) => v.setRecipeSearch(t)} submitOnEnter={false} placeholder="Search recipes or ingredients…"
            style={css("width:190px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:7px 11px;color:var(--nv-ink);font:400 12px var(--nv-font-ui);outline:none")} />
          {v.recipeFitsAvailable && (
            <Chip tone={v.recipeFitsOn ? 'accent' : 'good'} active={v.recipeFitsOn} onClick={v.toggleRecipeFits}>{cap(v.recipeFitsLabel)}</Chip>
          )}
        </div>
        {v.recipeAddVisible && (
          <Chip tone="gold" onClick={v.openAddRecipe}>{cap('+ Add recipe')}</Chip>
        )}
      </div>
      {/* NO SKELETON HERE, deliberately. The recipe grid falls back to the
          demo bank whenever `liveRecipes` is null, so it is never actually
          empty — a skeleton would stack ON TOP of visible cards rather than
          fill a void (caught in verification, 23 Aug). A skeleton must only
          ever occupy space that is genuinely blank; the Inbox qualifies,
          this grid does not. */}
      <div style={v.gridRecipes}>
        {v.recipeList.map((r) => (
          <Interactive
            key={r.name}
            onClick={r.open}
            style={r.vtName ? { viewTransitionName: r.vtName } : undefined}
            base="cursor:pointer;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);overflow:hidden;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec),0 14px 34px -20px rgba(0,0,0,.9)"
            hoverStyle="border-color:color-mix(in srgb, var(--nv-gold) 40%, transparent);transform:translateY(-2px)"
          >
            {r.photoUrl ? (
              <div style={css("height:104px;overflow:hidden")}><img src={r.photoUrl} alt={r.name} style={css("width:100%;height:100%;object-fit:cover;display:block")} /></div>
            ) : (
              <div style={r.phStyle}><span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>{r.phLabel}</span></div>
            )}
            <div style={css("padding:14px 17px")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <div style={css("font-size:15.5px;font-weight:500")}>{r.name}</div>
                <Tag tone="gold">{r.tag}</Tag>
              </div>
              <div style={css("margin-top:7px;display:flex;gap:12px;font:var(--nv-micro-l);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                <span style={css("color:var(--nv-cy)")}>{r.p}P</span><span>{r.c}C</span><span>{r.f}F</span><span style={css("margin-left:auto")}><span style={css("color:var(--nv-good)")}>{r.kcal} kcal</span>{r.time ? ` · ${r.time}` : ''}</span>
              </div>
              <div style={css("margin-top:10px;display:flex;gap:3px;height:4px")}>
                <span style={r.pBar}></span><span style={r.cBar}></span><span style={r.fBar}></span>
              </div>
              {r.slotToggles && r.slotToggles.length > 0 && (
                <div style={css("margin-top:10px;display:flex;gap:5px")} onClick={(e) => e.stopPropagation()}>
                  {r.slotToggles.map((s) => (
                    <Interactive
                      key={s.key}
                      as="span"
                      onClick={s.onClick}
                      base={{
                        cursor: 'pointer', flex: '1', textAlign: 'center', font: 'var(--nv-micro-m)', padding: '4px 0', borderRadius: '5px',
                        border: `1px solid rgba(${s.hue},${s.active ? '.6' : '.14'})`,
                        color: s.active ? `rgb(${s.hue})` : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)',
                        background: s.active ? `rgba(${s.hue},.14)` : 'transparent',
                      }}
                      hoverStyle={{ borderColor: `rgba(${s.hue},.6)` }}
                    >
                      {s.label}
                    </Interactive>
                  ))}
                </div>
              )}
              {/* His ask: log a meal straight from the recipe itself rather
                  than opening the separate picker higher up the screen. The
                  slot chips above say "which meal is this today"; this says
                  "I ate it" — a different question, so it gets its own row.
                  stopPropagation, or the tap opens the recipe instead. */}
              {r.logIt && (
                <div style={css("margin-top:8px")} onClick={(e) => e.stopPropagation()}>
                  <Chip tone="good" onClick={r.logIt} style={{ display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>＋ Log this</Chip>
                </div>
              )}
            </div>
          </Interactive>
        ))}
      </div>
    </div>
  );
}
