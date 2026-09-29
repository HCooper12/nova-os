import { useEffect, useRef, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { useDictation } from './useDictation.js';
import { useExit } from './useExit.js';
import { useSheetDrag } from './useSheetDrag.js';
import { Button, Meta, Tag } from './Controls.jsx';
import { MealEditor } from './RecipeOverlay.jsx';
import { FIcon } from './FuelIcon.jsx';
import { PORTIONS, portionLabel, scaleMacros, validPortion } from './portion.js';
import { RecipeMetaRow, RecipeScale, RecipeIngredients, RecipeMethod, RecipeMenu } from './RecipePage.jsx';

// THE RECIPE, AS A SHEET — mockup 59, variation A · 3. Under the `summary`
// style App renders this in place of RecipeOverlay, on the same state and
// the same history entry (openRecipe / closeRecipe), so the back swipe, the
// browser's Back and Escape all close it exactly as they closed the overlay.
//
// The name comes FIRST, where it was the fifth object at 581px (the audit's
// finding 10); then the four figures; one portion picker where there were
// three (finding 8); the fridge as a stepper where there were three
// window.prompt dialogs; the ingredient lines with a 44pt × each (was 24);
// Ask Nova for a tweak; Log it, the one filled button; Add to rotation; then
// Method · Versions · Shopping · Edit · Notes as rows, and Delete at the
// foot, away from Done. Everything the overlay did is here, reached from
// v.fuelSummary.recipeSheet (src/vals/valsFuelSummary.js); every write is
// the overlay's own app method.
//
// THE RECIPE PAGE (29 Sep 2026, his Osta reel): the sheet now carries the
// page's parts from the same view model the cupertino page renders
// (R.page = v.recipePage; src/RecipePage.jsx) — the meta row (serves ·
// prep · cook · source, set in place), the scale, the ingredients as a
// checklist in the batch he is cooking (a hold adds one line to the list or
// drops it), and the method with a cook mode — so neither idiom lacks a
// field the other has.
//
// A real modal to the back swipe (edgeBack.js): an aria-modal root with its
// z-index inline, closed by its own backdrop tap. Done and the backdrop let
// it fall the way it rose (useExit); the grab zone throws it (useSheetDrag).

const NO_RING = {};
const MAIN = ['½', '¾', '1', '1½', '2'];
const kc = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');
// a tap on Done inside the grab zone is a tap, not a drag
const onControl = (el) => !!(el && el.closest && el.closest('[role="button"], button, a, input, label'));

function Act({ children, onClick, tone, label }) {
  return <Interactive as="span" className={`nv-fs-ta${tone ? ` ${tone}` : ''}`} onClick={onClick} aria-label={label} haptic="tick" focusStyle={NO_RING}>{children}</Interactive>;
}

function Row({ label, count, open, onClick }) {
  return (
    <Interactive as="div" className="nv-fs-rrow" onClick={onClick} aria-expanded={open} haptic="tick" focusStyle={NO_RING}
      activeStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 6%, transparent)' }}>
      <span className="nm">{label}</span>
      <span className="cnt">{count}</span>
      <FIcon n="right" className="nv-fs-cv" />
    </Interactive>
  );
}

export function RecipeSheet({ v }) {
  const R = v.fuelSummary.recipeSheet;
  const exit = useExit(R.close);
  const sheet = useSheetDrag(R.close, { threshold: 80 });
  const panelRef = useRef(null);
  const [factor, setFactor] = useState(1);
  const [custom, setCustom] = useState('');
  const [morePortions, setMorePortions] = useState(false);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  const P = R.page;
  const pageKey = `${R.id}:${P?.version || ''}`;
  const openDetail = (field) => setEditing(P?.meta.find((x) => x.field === field) || P?.unset.find((u) => u.field === field) || null);

  // talking about a meal, in the place the meal is (RecipeOverlay's rhythm:
  // a pause ends the take and the question goes straight to Nova)
  const askRef = useRef('');
  askRef.current = R.tweak?.value || '';
  const askVoice = useRef(R.tweak?.submitVoice);
  askVoice.current = R.tweak?.submitVoice;
  const dict = useDictation(
    () => '',
    (text) => { askRef.current = text; R.tweak?.setValue?.(text); },
    (said) => { const t = String(said ?? askRef.current ?? '').trim(); if (t) askVoice.current?.(t); },
    { holdMs: v.voiceHoldMs, leadMs: v.voiceLeadMs, onError: (err) => R.tweak?.dictError?.(err) },
  );

  // a new recipe in the same sheet starts at one portion, everything folded
  useEffect(() => { setFactor(1); setCustom(''); setMorePortions(false); setOpen(null); setEditing(null); setMenu(null); }, [R.id]);
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, []);

  const typed = custom.trim();
  const f = typed ? Number(typed) : factor;
  const valid = validPortion(f);
  const m = R.macros ? (valid ? scaleMacros(R.macros.raw, f) : R.macros) : null;
  const one = Math.abs(f - 1) < 0.001;
  const pick = (x) => { setFactor(x); setCustom(''); };
  const extra = PORTIONS.filter((p) => !MAIN.includes(p.label));
  const vers = R.versions.list;
  const active = vers.find((a) => a.active);

  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={R.name} className="nv-fs nv-fs-scrim" style={{ zIndex: 140 }} onClick={exit.close}>
      <div ref={(el) => { sheet.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }} tabIndex={-1}
        className="nv-liquid nv-liquid-thick nv-sum-sheet nv-fs-sheet" onClick={(e) => e.stopPropagation()}>
        {/* the grab zone: the grabber, the NAME, Done. It never scrolls */}
        <div {...sheet.handleProps} className="nv-fs-grab"
          onPointerDown={(e) => { if (!onControl(e.target)) sheet.handleProps.onPointerDown(e); }}
          style={{ ...sheet.handleProps.style }}>
          <div className="nv-fs-rhead">
            <div style={{ minWidth: 0 }}>
              <h2>{R.name}</h2>
              {R.meta && <p>{R.meta}</p>}
            </div>
            <Act onClick={exit.close} label="Done">Done</Act>
          </div>
        </div>

        <div className="nv-fs-body">
          {R.photo?.url && <div className="nv-fs-photo"><img src={R.photo.url} alt={R.name} /></div>}
          {P && <div className="nv-rp" style={{ marginTop: '8px' }}><RecipeMetaRow page={P} editing={editing} onEdit={setEditing} /></div>}

          {m && (
            <div className="nv-fs-m4" role="img" aria-label={`${one ? 'One portion' : `${portionLabel(f)} of a portion`}: ${m.p} grams protein, ${m.kcal} kilocalories, ${m.c} grams carbs, ${m.f} grams fat`}>
              <div className="p"><b>{m.p}</b>g protein</div>
              <div className="k"><b>{kc(m.kcal)}</b>kcal</div>
              <div className="plain"><b>{m.c}</b>g carbs</div>
              <div className="plain"><b>{m.f}</b>g fat</div>
            </div>
          )}

          {/* MACROS NOT SET — filed without numbers (a reel that gave none),
              never a guess. Gold is "not yet decided"; Add macros opens the
              same editor, right here, with the label helper inside it. */}
          {R.pending && (
            <div className="nv-fs-srow" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '10px' }}>
              <span className="nv-fs-lx">
                <span><Tag tone="gold" dashed>Macros not set</Tag></span>
                <span className="nv-fs-sv" style={{ marginTop: '6px' }}>Nova won’t guess them. Add them when you make it, typed in or read off the labels.</span>
              </span>
              {R.pending.add && !R.edit?.editing && <Button tone="undecided" compact onClick={R.pending.add}>Add macros</Button>}
              {R.edit?.editing && <MealEditor v={v} />}
            </div>
          )}

          {/* ONE PORTION PICKER: the five he reaches for, and the rest a tap deeper */}
          {R.log && (
            <>
              <span className="nv-fs-hk" style={{ marginTop: '16px' }}>Portion{one ? '' : ` · ${valid ? `${portionLabel(f)} of one` : 'between a sliver and 20'}`}</span>
              <div className="nv-fs-portion" role="group" aria-label="How much">
                {MAIN.map((lbl) => {
                  const p = PORTIONS.find((x) => x.label === lbl);
                  return (
                    <Interactive key={lbl} as="span" onClick={() => pick(p.factor)} aria-pressed={!typed && Math.abs(factor - p.factor) < 0.001} haptic="tick" focusStyle={NO_RING}
                      aria-label={`${lbl} of a portion`}>{lbl}</Interactive>
                  );
                })}
                <Interactive as="span" onClick={() => setMorePortions((o) => !o)} aria-pressed={morePortions || !!typed || !MAIN.includes(portionLabel(factor))} haptic="tick" focusStyle={NO_RING}
                  aria-label="Other amounts">···</Interactive>
              </div>
              {morePortions && (
                <div className="nv-fs-portion nv-deck-rise" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) minmax(0, 3fr)' }}>
                  {extra.map((p) => (
                    <Interactive key={p.label} as="span" onClick={() => pick(p.factor)} aria-pressed={!typed && Math.abs(factor - p.factor) < 0.001} haptic="tick" focusStyle={NO_RING}
                      aria-label={`${p.label} of a portion`}>{p.label}</Interactive>
                  ))}
                  <input className="nv-fs-field" style={{ borderRadius: '22px', padding: '0 14px' }} value={custom} onChange={(e) => setCustom(e.target.value)}
                    inputMode="decimal" placeholder="or 0.4" aria-label="Any other amount, as a multiple of one portion" />
                </div>
              )}
            </>
          )}

          {R.fridge && (
            <div className="nv-fs-srow">
              <span className="nv-fs-lx">
                <span className="nv-fs-nm">In the fridge</span>
                <span className="nv-fs-sv">{R.fridge.left == null ? 'Not counted. Add one to start counting.' : R.fridge.out ? 'None left: cook more' : 'One comes off each time it is ticked in the rotation'}</span>
              </span>
              <span className="nv-fs-mini">
                <Interactive as="span" onClick={R.fridge.less || undefined} aria-disabled={!R.fridge.less || undefined} haptic="tick" focusStyle={NO_RING} aria-label="One fewer"><FIcon n="minus" /></Interactive>
                <b className={`n${R.fridge.out ? ' out' : ''}`}>{R.fridge.left == null ? '—' : R.fridge.left}</b>
                <Interactive as="span" onClick={R.fridge.more} haptic="tick" focusStyle={NO_RING} aria-label="One more"><FIcon n="plus" /></Interactive>
              </span>
            </div>
          )}
          {R.fridge?.stop && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}><Act tone="quiet" onClick={R.fridge.stop}>Stop counting</Act></div>}

          {P && (
            <div className="nv-rp" style={{ overflow: 'visible' }}>
              {P.description && <p className="nv-rp-desc">{P.description}</p>}
              <RecipeScale key={R.id} page={P} onSetServings={P.setMeta ? () => openDetail('servings') : null} />
              <RecipeIngredients page={P} resetKey={pageKey} onHold={(it) => setMenu(it.hold)} />
              <RecipeMethod page={P} resetKey={pageKey} />
            </div>
          )}
          {/* a dropped line changes nothing until he keeps it: Nova recomputes
              the figures (the tweak pipeline), and code files the version */}
          {R.removals && (
            <div className="nv-fs-bar nv-deck-rise">
              <p>{R.removals.count} dropped. Nova works the figures out again when you keep the change; nothing is saved until then.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', margin: '0 -10px' }}>
                {R.removals.canToday && <Act onClick={R.removals.today}>Just for today</Act>}
                <Act onClick={R.removals.keep}>Keep it as a version</Act>
              </div>
            </div>
          )}

          {R.tweak && (
            <>
              <div className="nv-fs-own">
                <input value={R.tweak.value} onChange={R.tweak.set} onKeyDown={R.tweak.onKey} disabled={R.tweak.busy} aria-label="Ask Nova for a tweak"
                  placeholder={R.tweak.preview ? 'Refine it: “keep the whole eggs”' : 'Ask Nova for a tweak…'} />
                {R.tweak.addPhotos && (
                  <label className="nv-fs-ib" aria-label="Show Nova a different ingredient">
                    <FIcon n="photo" />
                    <input type="file" accept="image/*" multiple onChange={R.tweak.addPhotos} disabled={R.tweak.busy} />
                  </label>
                )}
                {String(R.tweak.value || '').trim() && !dict.on ? (
                  <Interactive as="span" className="nv-fs-ib send" onClick={R.tweak.busy ? undefined : R.tweak.submit} haptic="commit" focusStyle={NO_RING} aria-label="Ask"><FIcon n="up" /></Interactive>
                ) : dict.supported && R.tweak.setValue ? (
                  <Interactive as="span" className="nv-fs-ib talk" data-on={dict.on ? 'true' : undefined} onClick={R.tweak.busy ? undefined : dict.toggle} haptic="tick" focusStyle={NO_RING}
                    aria-label={dict.on ? 'Listening; pause to send' : 'Ask out loud'}><FIcon n="mic" /></Interactive>
                ) : null}
              </div>
              {R.tweak.photos?.length > 0 && (
                <div className="nv-fs-thumbs">
                  {R.tweak.photos.map((ph, i) => (
                    <span key={i}><img src={ph.src} alt="" />{!R.tweak.busy && <button type="button" onClick={ph.remove} aria-label="Take this photo out"><i><FIcon n="x" /></i></button>}</span>
                  ))}
                </div>
              )}
              {R.tweak.busy && <div className="nv-fs-status busy"><i aria-hidden="true" /><span>Nova is working it out…</span></div>}
              {R.tweak.error && <p className="nv-fs-err" role="alert">{R.tweak.error}</p>}
              {R.tweak.preview && (
                // a suggestion is waiting on his call: the one earned gold here
                <div className="nv-fs-preview" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--nv-gold) 40%, transparent)' }}>
                  <Meta tone="gold">Suggestion · ask again to refine it</Meta>
                  <b style={{ marginTop: '4px' }}>{R.tweak.preview.label}</b>
                  <div className="nv-fs-sv" style={{ whiteSpace: 'normal', marginTop: '4px' }}>
                    <span className="nv-fs-p">{Math.round(R.tweak.preview.macros.p)} g</span> protein · <span className="nv-fs-k">{kc(R.tweak.preview.macros.kcal)}</span> kcal · {Math.round(R.tweak.preview.macros.c)} g carbs · {Math.round(R.tweak.preview.macros.f)} g fat
                  </div>
                  <ul style={{ margin: '8px 0 0', paddingLeft: '18px', font: '400 13px/1.5 var(--nv-font-ui)', color: 'var(--nv-ink60)' }}>
                    {R.tweak.preview.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
                  </ul>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', margin: '6px -10px 0' }}>
                    <Act onClick={R.tweak.save}>Save as a version</Act>
                    {R.tweak.saveToday && <Act onClick={R.tweak.saveToday}>Save and use today</Act>}
                    <Act tone="quiet" onClick={R.tweak.discard}>Discard</Act>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="nv-fs-btns">
            {R.log
              ? <Button tone="good" haptic="commit" onClick={() => R.log(f, typed)} disabled={!valid}>{one ? 'Log it' : `Log ${portionLabel(f)}`}</Button>
              : <Button tone="good" disabled>Log it</Button>}
            {R.rotation && (
              <Button variant="quiet" tone="ink" onClick={() => toggle('rotation')}>{R.rotation.inSlots.length ? 'In the rotation' : 'Add to rotation'}</Button>
            )}
          </div>
          {R.logsTo && <Meta as="div" tone="faint" style={{ marginTop: '6px', textAlign: 'center' }}>{R.logsTo}</Meta>}
          {!R.log && <Meta as="div" tone={R.pending ? 'gold' : 'faint'} style={{ marginTop: '6px', textAlign: 'center' }}>{R.pending ? 'Add its macros first.' : R.live ? 'This recipe has no macros to log.' : 'Demo recipe: logging needs Nova connected to your Mac.'}</Meta>}
          {open === 'rotation' && R.rotation && (
            <div className="nv-fs-planfor" style={{ margin: '10px 0 0' }}>
              <span>Plan it for a meal. Tap it again to take it out.</span>
              <div className="nv-fs-pf" style={{ gridTemplateColumns: `repeat(${Math.min(5, R.rotation.slots.length)}, minmax(0, 1fr))` }}>
                {R.rotation.slots.map((s) => (
                  <Interactive key={s.key} as="span" onClick={s.toggle} aria-pressed={s.active} haptic="tick" focusStyle={NO_RING} aria-label={`${s.name}${s.active ? ', planned' : ''}`}>
                    {s.letter}<small>{s.name.split(' ')[0]}</small>
                  </Interactive>
                ))}
              </div>
            </div>
          )}

          <div className="nv-sum-card nv-fs-rows">
            {vers.length > 0 && (
              <>
                <Row label="Versions" count={vers.length} open={open === 'versions'} onClick={() => toggle('versions')} />
                {open === 'versions' && (
                  <div className="nv-fs-rpanel">
                    <div className="nv-fs-chips">
                      {vers.map((a) => (
                        <Interactive key={a.id ?? 'original'} as="span" onClick={a.onClick} aria-pressed={!!a.active} haptic="tick" focusStyle={NO_RING}>
                          {a.label}{a.isToday ? ' · today' : ''}
                        </Interactive>
                      ))}
                    </div>
                    {R.versions.rename ? (
                      <div className="nv-fs-frow">
                        <input className="nv-fs-field" autoFocus value={R.versions.rename.value} onChange={R.versions.rename.set} onKeyDown={R.versions.rename.onKey} aria-label="The version's name" />
                        <Button onClick={R.versions.rename.commit}>Save</Button>
                        <Act tone="quiet" onClick={R.versions.rename.cancel}>Cancel</Act>
                        {R.versions.rename.error && <p className="nv-fs-err" style={{ flexBasis: '100%' }}>{R.versions.rename.error}</p>}
                      </div>
                    ) : active && (
                      <div className="nv-fs-acts" style={{ marginTop: '6px' }}>
                        {active.rename && <Act onClick={active.rename}>Rename</Act>}
                        {active.useToday && <Act onClick={active.useToday}>Use for today</Act>}
                        {active.makePrimary && <Act onClick={active.makePrimary}>Make it the recipe</Act>}
                      </div>
                    )}
                    {active?.isToday && <Meta as="div" tone="faint">Today’s version. The recipe itself is unchanged.</Meta>}
                    {active?.makePrimary && <Meta as="div" tone="faint">Making it the recipe keeps the old one as a version.</Meta>}
                  </div>
                )}
              </>
            )}
            {R.shopping && (R.shopping.whole || R.shopping.all) && (
              <>
                <Row label="Add to shopping list" count={R.shopping.whole ? 'the item' : `${R.shopping.count} item${R.shopping.count === 1 ? '' : 's'}${R.shopping.scaled && P?.scale ? `, for ${P.scale.servings}` : ''}`} open={open === 'shopping'} onClick={() => toggle('shopping')} />
                {open === 'shopping' && (
                  <div className="nv-fs-rpanel">
                    {R.shopping.whole
                      ? <Act onClick={R.shopping.whole}>Add {R.name} to the list</Act>
                      : (
                        <>
                          <Act onClick={R.shopping.all}>Add all {R.shopping.count}</Act>
                          {R.lines.filter((l) => l.shop).map((l) => (
                            <div key={l.key} className="nv-fs-ln" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                              <span className="nv-fs-nm" style={{ fontWeight: 400 }}>{l.name}</span>
                              <Act onClick={l.shop} label={`Add ${l.raw} to the shopping list`}>Add</Act>
                            </div>
                          ))}
                        </>
                      )}
                  </div>
                )}
              </>
            )}
            {(R.edit || R.photo) && (
              <>
                <Row label="Edit this meal" count={P?.unset.length ? 'what’s in it, photo, times' : 'what’s in it, photo'} open={open === 'edit' || !!R.edit?.editing} onClick={() => toggle('edit')} />
                {(open === 'edit' || R.edit?.editing) && (
                  <div className="nv-fs-rpanel">
                    <div className="nv-fs-acts">
                      {R.edit && !R.edit.editing && <Act onClick={R.edit.start}>Change what’s in it</Act>}
                      {P?.unset.map((u) => <Act key={u.field} onClick={() => openDetail(u.field)}>{u.field === 'servings' ? 'Say how many it makes' : `Add the ${u.label.toLowerCase()} time`}</Act>)}
                      {R.photo && (
                        <label className="nv-fs-ta" style={{ position: 'relative' }}>
                          {R.photo.busy ? 'Saving the photo…' : R.photo.url ? 'Change the photo' : 'Add a photo'}
                          <input type="file" accept="image/*" onChange={R.photo.onFile} disabled={R.photo.busy} style={{ display: 'none' }} />
                        </label>
                      )}
                    </div>
                    {R.edit?.editing && !R.pending && <MealEditor v={v} />}
                  </div>
                )}
              </>
            )}
            {R.notes.length > 0 && (
              <>
                <Row label="Notes" count={R.notes.length} open={open === 'notes'} onClick={() => toggle('notes')} />
                {open === 'notes' && (
                  <div className="nv-fs-rpanel">
                    {R.notes.map((n, i) => <p key={i} className="nv-fs-desc" style={{ margin: i ? '8px 0 0' : 0 }}>{n}</p>)}
                  </div>
                )}
              </>
            )}
            {R.ask && (
              <>
                <Row label="Ask Nova" count="demo" open={open === 'ask'} onClick={() => toggle('ask')} />
                {open === 'ask' && (
                  <div className="nv-fs-rpanel">
                    {R.ask.msgs.map((m, i) => <p key={i} className="nv-fs-note" style={{ margin: '6px 0 0' }}>{m.text}</p>)}
                    <div className="nv-fs-frow">
                      <input className="nv-fs-field" value={R.ask.value} onChange={R.ask.set} onKeyDown={R.ask.onKey} placeholder="“suggest a swap”" aria-label="Ask Nova about this recipe" />
                      <Button onClick={R.ask.send}>Ask</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Delete, at the foot and in red, away from Done: asks once */}
          {R.remove && (
            <div className="nv-fs-gone">
              <Act tone="rm" onClick={R.remove.run} label={R.remove.armed ? 'Tap again to delete this recipe' : 'Delete this recipe'}>{R.remove.armed ? 'Tap again to delete' : 'Delete recipe'}</Act>
            </div>
          )}
        </div>
      </div>
      <RecipeMenu menu={menu} onClose={() => setMenu(null)} z={150} />
    </div>
  );
}
