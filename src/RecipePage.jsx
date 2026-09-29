import { useEffect, useRef, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { CountUp } from './CountUp.jsx';
import { Button, Tag, TextAction } from './Controls.jsx';

// THE RECIPE PAGE'S PARTS (29 Sep 2026). His ask, with the Osta reel: a
// recipe he shares should read like a page in a cookbook — the dish, how many
// it makes and how long it takes, the batch scaled, ticked off while he cooks,
// then onto his plate or his shopping list. These are the pieces both idioms
// draw from ONE view model (v.recipePage, src/vals/valsRecipes.js):
// RecipeOverlay lays them out as a full page under cupertino and command, and
// RecipeSheet sets them inside the summary sheet. Nothing here reaches the
// network: every action is a function the view model handed over, and each of
// those is an existing app method. Styles are the .nv-rp-* block at the end of
// index.css; every colour is a token and means one thing (protein cyan,
// calories green, gold only for "macros not set", warn only for a dropped line).

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const PATHS = {
  serves: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.2A5.5 5.5 0 0 1 20.5 19" /></>,
  prep: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2.5M10 3h4" /></>,
  cook: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.9 2.3-5 .3 1.6 1 2.6 2 3 0-3 .2-5.4.7-8z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  reel: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M10 8.8v6.4l5.2-3.2z" /></>,
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  more: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  photo: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></>,
  check: <path d="M5.5 12.5l4 4L18.5 7.5" />,
  minus: <path d="M5.5 12h13" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  fork: <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M16 3c-2 0-3 2-3 5v3h3v10M16 3v18" /></>,
};
export function RGlyph({ n, className = '' }) {
  return <svg className={`nv-rp-ico ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{PATHS[n] || PATHS.link}</svg>;
}

// ---- the meta row: glyph + figure pairs, absent values simply not drawn ----
// Serves, Prep and Cook are taps that open a small stepper in place; the
// source is a link. Only a live recipe can be set (the view model hands
// setMeta only then).
export function RecipeMetaRow({ page, editing, onEdit }) {
  if (!page.meta.length && !editing) return null;
  return (
    <>
      {page.meta.length > 0 && (
        <div className="nv-rp-meta">
          {page.meta.map((m) => (m.url ? (
            <a key={m.key} className="nv-rp-mi link" href={m.url} target="_blank" rel="noopener noreferrer" aria-label={`Open the source: ${m.text}`}>
              <RGlyph n={m.glyph} /><span>{m.text}</span>
            </a>
          ) : page.setMeta ? (
            <Interactive key={m.key} as="button" type="button" className="nv-rp-mi" onClick={() => onEdit(editing?.field === m.field ? null : m)} haptic="tick"
              aria-expanded={editing?.field === m.field} aria-label={`${m.text}. Change it`}>
              <RGlyph n={m.glyph} /><span>{m.text}</span>
            </Interactive>
          ) : (
            <span key={m.key} className="nv-rp-mi"><RGlyph n={m.glyph} /><span>{m.text}</span></span>
          )))}
        </div>
      )}
      {editing && page.setMeta && (
        <MetaEditor key={editing.field} field={editing} onCancel={() => onEdit(null)}
          onSave={(n) => { page.setMeta({ [editing.field]: n }); onEdit(null); }} />
      )}
    </>
  );
}

function MetaEditor({ field, onSave, onCancel }) {
  const [val, setVal] = useState(String(field.value ?? (field.field === 'servings' ? 2 : 10)));
  const n = Number(val);
  const ok = val.trim() !== '' && Number.isInteger(n) && n >= field.min && n <= field.max;
  const nudge = (d) => setVal(String(Math.max(field.min, Math.min(field.max, (Number.isFinite(n) ? n : 0) + d))));
  return (
    <div className="nv-rp-edit" role="group" aria-label={`Set ${field.label.toLowerCase()}`}>
      <span className="nv-rp-edit-l">{field.label}</span>
      <span className="nv-rp-step sm">
        <Interactive as="button" type="button" className="nv-rp-step-b" onClick={() => nudge(-field.step)} aria-label={`${field.step} less`} haptic="tick"><RGlyph n="minus" /></Interactive>
        <input className="nv-rp-edit-n" type="number" inputMode="numeric" value={val} min={field.min} max={field.max}
          onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ok) onSave(n); if (e.key === 'Escape') onCancel(); }}
          aria-label={`${field.label}, in ${field.unit}`} />
        <Interactive as="button" type="button" className="nv-rp-step-b" onClick={() => nudge(field.step)} aria-label={`${field.step} more`} haptic="tick"><RGlyph n="plus" /></Interactive>
      </span>
      <span className="nv-rp-edit-u">{field.unit}</span>
      <span className="nv-rp-edit-a">
        <TextAction compact onClick={() => ok && onSave(n)} disabled={!ok}>Save</TextAction>
        <TextAction compact tone="quiet" onClick={onCancel}>Cancel</TextAction>
      </span>
    </div>
  );
}

// ---- the four figures, per serving -----------------------------------------
// They count up when the page opens (a fresh mount per recipe), and a version
// switch ticks them from the old figures to the new. Protein cyan, calories
// green, carbs and fat plain: they carry no target.
export function RecipeFigures({ page }) {
  if (page.pending) {
    // MACROS NOT SET: filed without numbers, never a guess — gold is Nova's
    // "not yet decided", and Add macros opens the editor (label helper inside)
    return (
      <div className="nv-rp-pending">
        <Tag tone="gold" dashed>Macros not set</Tag>
        <p>Nova won’t guess them. Add them when you make it, typed in or read off the labels.</p>
        {page.pending.add && <Button tone="undecided" compact onClick={page.pending.add}>Add macros</Button>}
      </div>
    );
  }
  if (!page.macros) return null;
  return <Figures key={page.id} m={page.macros} />;
}

function Figures({ m }) {
  // mount at zero, then hand CountUp the real figure: that is the count-up
  const [armed, setArmed] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setArmed(true)); return () => cancelAnimationFrame(r); }, []);
  const at = (n) => (armed ? n : 0);
  const kc = (n) => Math.round(n).toLocaleString('en-AU');
  return (
    <div className="nv-rp-figs-w">
      <span className="nv-rp-eyebrow">Per serving</span>
      <div className="nv-rp-figs" role="img" aria-label={`Per serving: ${m.p} grams protein, ${m.kcal} kilocalories, ${m.c} grams carbs, ${m.f} grams fat`}>
        <div className="p"><b><CountUp value={at(m.p)} /></b><span>g protein</span></div>
        <div className="k"><b><CountUp value={at(m.kcal)} format={kc} /></b><span>kcal</span></div>
        <div><b><CountUp value={at(m.c)} /></b><span>g carbs</span></div>
        <div><b><CountUp value={at(m.f)} /></b><span>g fat</span></div>
      </div>
    </div>
  );
}

// ---- the scale: how many he is cooking --------------------------------------
// A view of the recipe, never a write: every amount below re-renders through
// scaleRecipe, and the per-serving figures above stay where they are.
export function RecipeScale({ page, onSetServings }) {
  const s = page.scale;
  const touched = useRef(false);
  const first = useRef(s ? s.servings : null);
  if (s && s.servings !== first.current) touched.current = true;
  if (!s) {
    // a recipe that does not say what it makes cannot be scaled honestly
    return onSetServings ? (
      <div className="nv-rp-scale none">
        <span className="nv-rp-scale-l"><span className="nv-rp-eyebrow">Scale</span><span className="nv-rp-sub">Say how many it makes, and the amounts scale.</span></span>
        <TextAction compact onClick={onSetServings}>Set servings</TextAction>
      </div>
    ) : null;
  }
  return (
    <div className="nv-rp-scale-w">
      <div className="nv-rp-scale">
        <span className="nv-rp-scale-l">
          <span className="nv-rp-eyebrow">Makes</span>
          <span className="nv-rp-sub">{s.changed ? `The recipe makes ${s.base} ${s.baseNoun}` : 'The amounts follow this'}</span>
        </span>
        <span className="nv-rp-step" role="group" aria-label={`Cooking ${s.servings} ${s.noun}`}>
          <Interactive as="button" type="button" className="nv-rp-step-b" onClick={s.dec || undefined} disabled={!s.dec} aria-label="One fewer" haptic="tick"><RGlyph n="minus" /></Interactive>
          <span className="nv-rp-step-n" aria-live="polite">
            <b key={s.servings} className={touched.current ? 'tick' : undefined}>{s.servings}</b>
            <small>{s.noun}</small>
          </span>
          <Interactive as="button" type="button" className="nv-rp-step-b" onClick={s.inc} aria-label="One more" haptic="tick"><RGlyph n="plus" /></Interactive>
        </span>
      </div>
      {s.changed && (
        <div className="nv-rp-scale-note">
          <span>Every amount is for {s.servings}. The figures stay per serving.</span>
          <TextAction compact tone="quiet" onClick={s.reset}>Back to {s.base}</TextAction>
        </div>
      )}
    </div>
  );
}

// ---- the ingredients, as a checklist for cooking ----------------------------
// A tap ticks a line off (local: it resets when the recipe changes). A hold
// (long-press, or right-click on the Mac) offers the quiet per-line actions:
// just this line to the shopping list, or drop it from this version. The
// amount is set in the mono face and ticks when the batch is rescaled.
export function RecipeIngredients({ page, resetKey, onHold }) {
  const [done, setDone] = useState(() => new Set());
  const touched = useRef(false);
  const factor = page.scale ? page.scale.factor : 1;
  const firstFactor = useRef(factor);
  useEffect(() => { setDone(new Set()); touched.current = false; firstFactor.current = factor; }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (factor !== firstFactor.current) touched.current = true;
  const items = page.ingredients;
  const lines = items.filter((it) => !it.group);
  if (!lines.length) return null;
  const count = lines.filter((it) => done.has(it.key)).length;
  const toggle = (key) => setDone((d) => { const n = new Set(d); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const canHold = !!onHold && lines.some((it) => it.shop || it.drop);
  return (
    <section className="nv-rp-sec" aria-label="Ingredients">
      <div className="nv-rp-sechead">
        <h3 className="nv-rp-eyebrow">Ingredients</h3>
        <span className="nv-rp-count">{count ? `${count} of ${lines.length} in` : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`}</span>
      </div>
      <div className="nv-rp-ings nv-stagger">
        {items.map((it) => (it.group ? (
          <div key={it.key} className="nv-rp-group"><span className="nv-rp-eyebrow">{it.label}</span></div>
        ) : (
          <Interactive key={it.key} as="div" className="nv-rp-ing" role="checkbox" aria-checked={done.has(it.key)}
            data-done={done.has(it.key) ? 'true' : undefined} data-dropped={it.dropped ? 'true' : undefined}
            onClick={() => toggle(it.key)} onLongPress={canHold ? () => onHold(it) : undefined} haptic="tick"
            activeStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 5%, transparent)' }}
            aria-label={`${it.line}${it.dropped ? ', dropped from this version' : ''}`}>
            <span className="nv-rp-tick"><RGlyph n="check" /></span>
            {it.amount && <span key={it.amount} className={`nv-rp-amt${touched.current ? ' tick' : ''}`}>{it.amount}</span>}
            <span className="nv-rp-item">{it.item}{it.dropped && <em>Dropped</em>}</span>
          </Interactive>
        )))}
      </div>
      <p className="nv-rp-hint">Tap a line as it goes in{canHold ? '. Hold one to add just it to the list, or drop it.' : '.'}</p>
    </section>
  );
}

// ---- the method, with a cook mode -----------------------------------------
// A tap makes a step the current one (the rest step back); Next step walks
// on and brings the new one into view.
export function RecipeMethod({ page, resetKey }) {
  const [at, setAt] = useState(null);
  const listRef = useRef(null);
  useEffect(() => { setAt(null); }, [resetKey]);
  const steps = page.method;
  if (!steps.length) return null;
  const go = (i) => {
    setAt(i);
    const el = listRef.current?.children?.[i];
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  };
  const last = steps.length - 1;
  return (
    <section className="nv-rp-sec" aria-label="Method">
      <div className="nv-rp-sechead">
        <h3 className="nv-rp-eyebrow">Method</h3>
        <span className="nv-rp-count">{at == null ? `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}` : `Step ${at + 1} of ${steps.length}`}</span>
      </div>
      <ol ref={listRef} className="nv-rp-steps" data-cooking={at != null ? 'true' : undefined}>
        {steps.map((st, i) => (
          <Interactive key={i} as="li" className="nv-rp-stp" onClick={() => setAt(at === i ? null : i)} haptic="tick"
            data-current={at === i ? 'true' : undefined} aria-current={at === i ? 'step' : undefined}
            activeStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 5%, transparent)' }}>
            <b className="nv-rp-sn">{st.n}</b>
            <span>{st.text}</span>
          </Interactive>
        ))}
      </ol>
      {steps.length > 1 && (
        <div className="nv-rp-next">
          <TextAction onClick={() => go(at == null ? 0 : Math.min(last, at + 1))} disabled={at === last}>
            {at == null ? 'Start cooking' : at === last ? 'That’s the last step' : 'Next step'}
          </TextAction>
        </div>
      )}
    </section>
  );
}

// ---- a small action sheet: the ⋯ menu, and a held ingredient's actions ----
// An aria-modal root with its z-index inline that closes on its own backdrop,
// so the back swipe (src/edgeBack.js) can find it and close it. It lives
// inside the page that opened it, so its clicks never reach the page's own
// backdrop close.
export function RecipeMenu({ menu, onClose, z = 96 }) {
  if (!menu) return null;
  const items = menu.items.filter(Boolean);
  return (
    <div role="dialog" aria-modal="true" aria-label={menu.title || 'More'} className="nv-rp-menu" style={{ zIndex: z }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="nv-rp-menu-p" onClick={(e) => e.stopPropagation()}>
        <div className="nv-rp-menu-g">
          {menu.title && <p className="nv-rp-menu-t">{menu.title}</p>}
          {items.map((it) => (it.file ? (
            <label key={it.label} className="nv-rp-menu-i">
              <span>{it.label}</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={it.disabled}
                onChange={(e) => { it.file(e); onClose(); }} />
            </label>
          ) : it.href ? (
            <a key={it.label} className="nv-rp-menu-i" href={it.href} target="_blank" rel="noopener noreferrer" onClick={onClose}><span>{it.label}</span></a>
          ) : (
            <Interactive key={it.label} as="div" className={`nv-rp-menu-i${it.danger ? ' danger' : ''}${it.on ? ' on' : ''}`} haptic="tick"
              onClick={() => { if (!it.keepOpen) onClose(); it.run(); }} aria-pressed={it.on != null ? !!it.on : undefined}>
              <span>{it.label}</span>{it.on && <RGlyph n="check" />}
            </Interactive>
          )))}
        </div>
        <Interactive as="div" className="nv-rp-menu-i cancel" onClick={onClose} haptic="tick">Cancel</Interactive>
      </div>
    </div>
  );
}

