import { useEffect, useRef, useState } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { LocalInput } from './LocalInput.jsx';
import { useDictation } from './useDictation.js';
import { TypeText } from './TypeText.jsx';
import { Eyebrow, TextAction, Chip, Meta, Button, Tag } from './Controls.jsx';
import { RGlyph, RecipeMetaRow, RecipeFigures, RecipeScale, RecipeIngredients, RecipeMethod, RecipeMenu } from './RecipePage.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase());

// THE RECIPE, AS A PAGE (29 Sep 2026) — cupertino (his phone) and command.
// His ask came with the Osta reel: share a recipe, get a clean page with the
// dish on top, how many it makes and how long it takes, scale the servings,
// send the batch to the shopping list. The audit (04-fuel, finding 10) found
// the old overlay opening on a striped placeholder, an add-photo bar, a macro
// table and a fridge row, with the dish's NAME the fifth object at 581px and
// 27 targets on one recipe. Now, top to bottom, from ONE view model
// (v.recipePage, which the summary sheet reads too):
//   the dish (photo full-bleed, its name in the serif over it) · a meta row
//   (serves · prep · cook · source, each absent one simply not drawn) · the
//   four figures per serving · the scale · the ingredients as a checklist ·
//   the method with a cook mode · the fridge and Ask Nova, folded.
// One filled button, Log a portion, rides the foot with the scaled "Add to
// list"; Delete, Rename, versions, the photo, the editor and the source live
// in the ⋯ sheet. Nothing was deleted: every capability the overlay had is
// one tap or one hold away.
export function RecipeOverlay({ v }) {
  const P = v.recipePage;
  // Talking about a meal, in the place the meal is. One-shot dictation: a
  // pause ends the take and the question goes straight to Nova, and because
  // the last preview travels with it, "keep the two whole eggs, what else
  // raises the protein?" refines rather than restarts.
  const askRef = useRef('');
  askRef.current = v.recipeTweakInput;
  const askVoice = useRef(v.submitRecipeTweakVoice);
  askVoice.current = v.submitRecipeTweakVoice;
  const dict = useDictation(
    () => '',
    (text) => { askRef.current = text; v.setRecipeTweakValue?.(text); },
    // the turn's words travel with its end (the 25 Sep race in useDictation)
    (said) => { const t = String(said ?? askRef.current ?? '').trim(); if (t) askVoice.current?.(t); },
    { holdMs: v.voiceHoldMs, leadMs: v.voiceLeadMs, onError: (err) => v.recipeDictationError?.(err) },
  );
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const id = P?.id;
  const resetKey = `${id}:${P?.version || ''}`;
  // a different recipe (or version) starts with every fold shut
  useEffect(() => { setMenu(null); setEditing(null); setAskOpen(false); }, [id]);
  if (!P) return null;

  const mobile = v.recipeOvMobile;
  const active = (v.orAlternates || []).find((a) => a.active);
  const fridge = v.orPortions;
  const batch = P.scale ? P.scale.servings : null;
  const tweakOpen = askOpen || !!v.recipeTweakPreview || !!v.recipeTweakBusy;
  const openDetail = (field) => {
    const known = P.meta.find((m) => m.field === field);
    setEditing(known || P.unset.find((u) => u.field === field) || null);
  };
  const more = {
    title: P.name,
    items: [
      P.hero.onFile && { label: P.hero.busy ? 'Saving the photo…' : P.hero.photoUrl ? 'Change the photo' : 'Add a photo', file: P.hero.onFile, disabled: P.hero.busy },
      ...P.unset.map((u) => ({ label: u.field === 'servings' ? 'Say how many it makes' : `Add the ${u.label.toLowerCase()} time`, run: () => openDetail(u.field) })),
      ...((v.orAlternates || []).length > 1 ? v.orAlternates.map((a) => ({ label: `${a.id == null ? 'Version: ' : ''}${a.label}${a.isToday ? ' · today' : ''}`, on: !!a.active, run: a.onClick })) : []),
      active?.rename && { label: 'Rename this version', run: active.rename },
      active?.useToday && { label: 'Use this version today', run: active.useToday },
      active?.makePrimary && { label: 'Make this version the recipe', run: active.makePrimary },
      v.orCanEdit && !v.orEditing && { label: 'Edit what’s in it', run: v.startEdit },
      P.source && { label: `Open the source · ${P.source.label}`, href: P.source.url },
      fridge?.left != null && { label: 'Stop counting portions', run: fridge.stop },
      v.orDelete && { label: v.orDeleteArmed ? 'Tap again to delete this recipe' : 'Delete recipe', danger: true, keepOpen: !v.orDeleteArmed, run: v.orDelete },
    ],
  };
  const hasMore = more.items.some(Boolean);

  return (
    // data-edge-page: the back swipe pops this like an iOS detail page (src/edgeBack.js)
    <div role="dialog" aria-modal="true" aria-label={P.name} data-edge-page="" onClick={v.closeRecipe} style={v.recipeOvWrap}>
      {/* the panel carries the SAME view-transition-name the card had, so the
          card morphs into this rather than one vanishing and the other
          appearing. The fadeUp fallback only runs where the API is absent. */}
      <div onClick={v.stopClick} className="nv-rp" data-mobile={mobile ? 'true' : undefined} style={{ ...(mobile
        ? css("width:100%;height:100%;overflow-y:auto;background:var(--nv-void)")
        : css("width:860px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-void);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 var(--nv-spec)")),
        ...(v.recipeOvVtName ? { viewTransitionName: v.recipeOvVtName } : {}),
        animation: v.supportsViewTransitions ? undefined : 'fadeUp var(--nv-dur-base) var(--nv-ease)' }}>

        {/* the two controls float over the photo and stay with him as he scrolls */}
        <div className="nv-rp-bar">
          <Interactive as="button" type="button" className="nv-rp-fab" onClick={v.closeRecipe} data-edge-close="" haptic="tick" aria-label={mobile ? 'Back' : 'Close'}>
            <RGlyph n={mobile ? 'back' : 'close'} />
          </Interactive>
          {hasMore && (
            <Interactive as="button" type="button" className="nv-rp-fab" onClick={() => setMenu(more)} haptic="tick" aria-label="More: photo, versions, edit, source, delete">
              <RGlyph n="more" />
            </Interactive>
          )}
        </div>

        {/* THE DISH: the photo settles in; no photo is a quiet material with
            its own way to add one — never a striped box with a caption */}
        <header className={`nv-rp-hero${P.hero.photoUrl ? '' : ' empty'}`}>
          {P.hero.photoUrl
            ? <img key={P.hero.photoUrl} src={P.hero.photoUrl} alt="" className="nv-rp-photo" />
            : (
              <div className="nv-rp-ph" aria-hidden={!P.hero.onFile}>
                <RGlyph n="fork" className="nv-rp-ph-g" />
                {P.hero.onFile && (
                  <label className="nv-rp-addph">
                    <RGlyph n="photo" /><span>{P.hero.busy ? 'Saving the photo…' : 'Add a photo'}</span>
                    <input type="file" accept="image/*" onChange={P.hero.onFile} disabled={P.hero.busy} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            )}
          <div className="nv-rp-title">
            {(P.category || P.version) && (
              <span className="nv-rp-tags">
                {P.category && <Tag style={{ fontSize: '13px' }}>{P.category}</Tag>}
                {P.version && <Tag tone="cyan" style={{ fontSize: '13px' }}>Version · {P.version}</Tag>}
              </span>
            )}
            <h2>{P.name}</h2>
          </div>
        </header>

        <div className="nv-rp-body">
          <RecipeMetaRow page={P} editing={editing} onEdit={setEditing} />

          {v.renameAltId && (
            <div style={css("margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              <Interactive as="input" autoFocus value={v.renameValue} onChange={v.setRenameValue} onKeyDown={v.renameKey}
                placeholder="Version name…" aria-label="The version's name"
                base="flex:1;min-width:180px;max-width:340px;box-sizing:border-box;min-height:44px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:12px;padding:8px 12px;color:var(--nv-ink);font:400 16px var(--nv-font-ui);outline:none"
                focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
              <Button compact onClick={v.commitRename}>Save name</Button>
              <TextAction compact tone="quiet" onClick={v.cancelRename}>Cancel</TextAction>
              {v.renameError && <Meta tone="warn" style={{ flexBasis: '100%' }}>{v.renameError}</Meta>}
            </div>
          )}

          <RecipeFigures page={P} />

          {P.description && <p className="nv-rp-desc">{P.description}</p>}

          {v.orEditing ? <MealEditor v={v} /> : (
            <>
              <RecipeScale key={id} page={P} onSetServings={P.setMeta ? () => openDetail('servings') : null} />

              {/* the page reads as two columns on the Mac: a cookbook spread */}
              <div className="nv-rp-cols">
                <div>
                  <RecipeIngredients page={P} resetKey={resetKey} onHold={(it) => setMenu(it.hold)} />
                  {v.ingredientRemovals?.length > 0 && (
                    <div className="nv-rp-drops nv-deck-rise">
                      <span>{v.ingredientRemovals.length} dropped. Nova works the figures out again when you keep the change; nothing is saved until then.</span>
                      <Button compact onClick={v.openRemovalPrompt}>Keep the change</Button>
                    </div>
                  )}
                  {P.shopping?.whole && (
                    <p className="nv-rp-hint">A whole item: no ingredients to shop for, just the thing itself.</p>
                  )}
                </div>
                <div><RecipeMethod page={P} resetKey={resetKey} /></div>
              </div>
            </>
          )}

          {/* folded: the fridge, Ask Nova, his notes */}
          <section className="nv-rp-sec nv-rp-end" aria-label="More for this recipe">
            {fridge && (
              <div className="nv-rp-fridge" data-out={fridge.out ? 'true' : undefined}>
                <span className="nv-rp-fl">
                  <b>In the fridge</b>
                  <span>{fridge.left == null ? 'Not counted' : fridge.out ? 'None left: cook more' : `${fridge.left} portion${fridge.left === 1 ? '' : 's'} left, one off each rotation tick`}</span>
                </span>
                {fridge.left == null ? (
                  <TextAction compact onClick={() => fridge.set(batch || 1)}>Cooked a batch{batch ? ` of ${batch}` : ''}</TextAction>
                ) : (
                  <span className="nv-rp-step sm">
                    <Interactive as="button" type="button" className="nv-rp-step-b" onClick={fridge.out ? undefined : fridge.ate} disabled={fridge.out} aria-label="Ate one outside the rotation" haptic="tick"><RGlyph n="minus" /></Interactive>
                    <span className="nv-rp-step-n"><b key={fridge.left}>{fridge.left}</b></span>
                    <Interactive as="button" type="button" className="nv-rp-step-b" onClick={() => fridge.cooked(1)} aria-label="One more cooked" haptic="tick"><RGlyph n="plus" /></Interactive>
                  </span>
                )}
              </div>
            )}
            {fridge?.left != null && batch > 1 && (
              <div className="nv-rp-fnext"><TextAction compact tone="quiet" onClick={() => fridge.cooked(batch)}>Cooked another batch of {batch}</TextAction></div>
            )}

            {(v.orShowTweak || v.orShowAskNova) && !tweakOpen && (
              <div className="nv-rp-askrow">
                <TextAction onClick={() => setAskOpen(true)}>{v.orShowTweak ? 'Ask Nova for a tweak' : 'Ask Nova about it'}</TextAction>
              </div>
            )}
            {v.orShowTweak && tweakOpen && <TweakPanel v={v} dict={dict} onFold={() => setAskOpen(false)} />}
            {!v.orShowTweak && v.orShowAskNova && askOpen && <AskPanel v={v} />}

            {P.notes.length > 0 && (
              <div className="nv-rp-notes">
                <span className="nv-rp-eyebrow">Notes</span>
                {P.notes.map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}
          </section>
        </div>

        {/* THE FOOT: the one filled button, and the batch onto the list */}
        <div className="nv-rp-foot">
          <div className="nv-rp-foot-in">
            <Button tone="good" haptic="commit" onClick={P.log || undefined} disabled={!P.log}
              ariaLabel={P.log ? 'Log a portion of this to your food log' : `Log a portion. ${P.logNote || ''}`}>Log a portion</Button>
            {P.shopping && P.shopping.count > 0 && (
              <Button variant="quiet" tone="ink" onClick={P.shopping.add}
                ariaLabel={P.shopping.whole ? 'Add it to the shopping list' : `Add ${P.shopping.count} items${P.shopping.scaled ? `, scaled for ${batch},` : ''} to the shopping list`}>
                {P.shopping.whole ? 'Add to list' : `Add ${P.shopping.count} to list`}
              </Button>
            )}
          </div>
          {!P.log && P.logNote && <p className={`nv-rp-footnote${P.pending ? ' gold' : ''}`}>{P.logNote}</p>}
        </div>
      </div>

      {/* the removal choice (a dropped line changes nothing until he keeps it) */}
      {v.removalPromptOpen && (
        <div role="dialog" aria-modal="true" aria-label="Keep the change" className="nv-rp-menu" style={{ zIndex: 96 }} onClick={(e) => { e.stopPropagation(); v.cancelRemovalPrompt(); }}>
          <div className="nv-rp-menu-p" onClick={(e) => e.stopPropagation()}>
            <div className="nv-rp-menu-g">
              <p className="nv-rp-menu-t">Dropping {v.ingredientRemovals.join(', ')}. Nova works the macros out again; the recipe itself is only touched if you save a version.</p>
              {v.removalCanToday && <Interactive as="div" className="nv-rp-menu-i" onClick={() => v.confirmRemovalSave('today')} haptic="tick">Just for today</Interactive>}
              <Interactive as="div" className="nv-rp-menu-i" onClick={() => v.confirmRemovalSave('alt')} haptic="tick">Save as a new version</Interactive>
            </div>
            <Interactive as="div" className="nv-rp-menu-i cancel" onClick={v.cancelRemovalPrompt} haptic="tick">Cancel</Interactive>
          </div>
        </div>
      )}
      <RecipeMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

// ASK NOVA FOR A TWEAK — folded under a TextAction until he wants it. Out of
// an ingredient, want it lighter: type it or say it, attach a photo of a
// substitute, and Nova suggests a version he can keep, switch back from, and
// keep refining by talking.
function TweakPanel({ v, dict, onFold }) {
  return (
    <div className="nv-rp-ask nv-deck-rise">
      <div className="nv-rp-sechead">
        <h3 className="nv-rp-eyebrow">Ask Nova for a tweak</h3>
        {!v.recipeTweakPreview && !v.recipeTweakBusy && <TextAction compact tone="quiet" onClick={onFold}>Fold</TextAction>}
      </div>
      <p className="nv-rp-sub">Out of something, or want it lighter? Say it, or show Nova a photo of the swap.</p>
      <div className="nv-rp-askin">
        <LocalInput
          value={v.recipeTweakInput}
          onChange={v.setRecipeTweakValue}
          onSubmit={(text) => v.submitRecipeTweak(text)}
          disabled={v.recipeTweakBusy}
          autoCorrect="on" autoCapitalize="sentences" spellCheck
          aria-label="Ask Nova for a tweak"
          placeholder={v.recipeTweakPreview ? 'Refine it: “keep the whole eggs”' : 'Try “no soy sauce, what instead?”'}
        />
        {v.addRecipeTweakPhotos && (
          <label className="nv-rp-ib" aria-label="Show Nova a different ingredient">
            <RGlyph n="photo" />
            <input type="file" accept="image/*" multiple onChange={v.addRecipeTweakPhotos} disabled={v.recipeTweakBusy} style={{ display: 'none' }} />
          </label>
        )}
        {dict.supported && v.setRecipeTweakValue && (
          <Interactive as="button" type="button" className="nv-rp-ib" data-on={dict.on ? 'true' : undefined} onClick={v.recipeTweakBusy ? undefined : dict.toggle} haptic="tick"
            aria-label={dict.on ? 'Listening; pause to send' : 'Ask out loud'}><RGlyph n="mic" /></Interactive>
        )}
        <Button compact onClick={v.submitRecipeTweak} disabled={v.recipeTweakBusy}>{v.recipeTweakBusy ? 'Thinking…' : 'Ask'}</Button>
      </div>
      {v.recipeTweakPhotos?.length > 0 && (
        <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap")}>
          {v.recipeTweakPhotos.map((ph, i) => (
            <div key={i} style={css("position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden")}>
              <img src={ph.src} alt="" style={css("width:100%;height:100%;object-fit:cover;display:block")} />
              {!v.recipeTweakBusy && (
                <Interactive as="button" type="button" onClick={ph.remove} aria-label="Take this photo out"
                  base="cursor:pointer;position:absolute;top:0;right:0;width:28px;height:28px;border:0;padding:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--nv-void) 70%, transparent);color:var(--nv-ink)"><RGlyph n="close" /></Interactive>
              )}
            </div>
          ))}
        </div>
      )}
      {v.recipeTweakError && <p className="nv-rp-err" role="alert">{v.recipeTweakError}</p>}
      {v.recipeTweakPreview && (
        // a suggestion waiting on his call: the one place gold is earned here
        <div className="nv-rp-preview">
          <Eyebrow tone="gold" style={{ fontSize: '13px' }}>Suggestion · ask again to refine it</Eyebrow>
          <b>{v.recipeTweakPreview.label}</b>
          <p className="nv-rp-sub">
            <span style={{ color: 'var(--nv-cy)' }}>{Math.round(v.recipeTweakPreview.macros.p)} g protein</span> · <span style={{ color: 'var(--nv-good)' }}>{Math.round(v.recipeTweakPreview.macros.kcal)} kcal</span> · {Math.round(v.recipeTweakPreview.macros.c)} g carbs · {Math.round(v.recipeTweakPreview.macros.f)} g fat
          </p>
          <ul>{v.recipeTweakPreview.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}</ul>
          <div className="nv-rp-acts">
            <Button compact onClick={v.saveRecipeTweak}>Save as a version</Button>
            {v.saveRecipeTweakToday && <Button compact variant="quiet" onClick={v.saveRecipeTweakToday}>Save and use today</Button>}
            <TextAction compact tone="quiet" onClick={v.discardRecipeTweak}>Discard</TextAction>
          </div>
        </div>
      )}
    </div>
  );
}

// the demo's scripted conversation (demoMode only; live recipes use the tweak)
function AskPanel({ v }) {
  return (
    <div className="nv-rp-ask nv-deck-rise">
      <h3 className="nv-rp-eyebrow">Ask Nova</h3>
      {v.recipeMsgs.map((m, i) => (
        <p key={i} className="nv-rp-sub" style={{ animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)' }}><span style={m.tagStyle}>{m.tag}</span> <TypeText text={m.text} active={m.typing} /></p>
      ))}
      <div className="nv-rp-askin">
        <LocalInput
          value={v.recipeInput}
          onChange={v.setRecipeInput}
          onSubmit={(text) => v.sendRecipe(text)}
          autoCorrect="on" autoCapitalize="sentences" spellCheck
          aria-label="Ask Nova about this recipe"
          placeholder="Try “suggest a swap”"
        />
        <Button compact onClick={v.sendRecipe}>Ask</Button>
      </div>
    </div>
  );
}

const EDIT_FIELD = "width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 13px;color:var(--nv-ink);font:400 13px/1.7 var(--nv-font-ui);outline:none;resize:vertical";

// One line per ingredient, one per step — the same shape the file stores, so
// what he types is what lands in the vault. Macros sit alongside because
// changing what's in a meal without correcting them would leave the numbers
// lying, and Nova doesn't do that.
export function MealEditor({ v }) {
  return (
    <div style={css("margin-top:16px;border:1px solid color-mix(in srgb, var(--nv-cy) 24%, transparent);border-radius:12px;padding:16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
      <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
        <Eyebrow as="span" tone="cyan">Editing · {cap(v.orEditTarget)}</Eyebrow>
        <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>writes to Obsidian</Meta>
      </div>

      <div style={css("margin-top:14px")}>
        <Eyebrow>Ingredients — one per line</Eyebrow>
        <Interactive as="textarea" rows={7} value={v.orEditIngredients} onChange={v.setEditField('ingredients')}
          placeholder={'2 eggs\n100g egg whites'}
          style={css("margin-top:8px")} base={EDIT_FIELD} focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
      </div>

      <div style={css("margin-top:14px")}>
        <Eyebrow>Method — one step per line</Eyebrow>
        <Interactive as="textarea" rows={6} value={v.orEditMethod} onChange={v.setEditField('method')}
          placeholder={'Leave blank for a variant cooked the same way as the original'}
          style={css("margin-top:8px")} base={EDIT_FIELD} focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
      </div>

      <div style={css("margin-top:14px")}>
        <Eyebrow>Macros</Eyebrow>
        {v.orEditPending && <Meta as="div" tone="gold" style={{ marginTop: '6px', textTransform: 'none', letterSpacing: 0 }}>Not set yet. Fill in all four, or leave all four blank for now.</Meta>}
        <div style={css("margin-top:8px;display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:8px")}>
          {[['p', 'P', 'var(--nv-cy)'], ['c', 'C', 'var(--nv-gold)'], ['f', 'F', 'var(--nv-vi)'], ['kcal', 'kcal', 'var(--nv-good)']].map(([key, label, colour]) => (
            <label key={key} style={css("display:flex;flex-direction:column;gap:5px")}>
              <Meta tone={colour} style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</Meta>
              <Interactive as="input" type="number" inputMode="decimal" min="0"
                value={key === 'p' ? v.orEditP : key === 'c' ? v.orEditC : key === 'f' ? v.orEditF : v.orEditKcal}
                placeholder={v.orEditPending ? '—' : undefined}
                onChange={v.setEditField(key)}
                base="width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-mono);font-variant-numeric:tabular-nums;outline:none"
                focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
            </label>
          ))}
        </div>
      </div>

      {/* MACROS FROM THE LABELS. His ask (7 Sep): the numbers on some recipes
          are wrong; let him photograph each ingredient's nutrition panel, say
          the grams the recipe uses, and have Nova do the sums. The model reads
          the per-100g column, the server scales/sums/divides by servings, and
          the result only fills the four fields above — Save is still his. */}
      <div style={css("margin-top:14px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:12px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap")}>
          <Eyebrow>Or work them out from the labels</Eyebrow>
          <label style={css("cursor:pointer;font:600 12px var(--nv-font-ui);color:var(--nv-cy)")}>
            ＋ Add label photos
            <input type="file" accept="image/*" multiple style={css("display:none")} onChange={(e) => { v.addEditLabels(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {v.orEditLabels.length === 0 ? (
          <Meta tone="faint" style={{ display: 'block', marginTop: '6px', textTransform: 'none', letterSpacing: 0 }}>One photo per ingredient's nutrition panel, then the grams this recipe uses of it.</Meta>
        ) : (
          <div style={css("display:flex;flex-direction:column;gap:8px;margin-top:10px")}>
            {v.orEditLabels.map((l) => (
              <div key={l.key} style={css("display:flex;align-items:center;gap:8px")}>
                <img src={l.image} alt="" style={css("width:40px;height:40px;object-fit:cover;border-radius:8px;flex:none;border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)")} />
                <Interactive as="input" type="text" value={l.name} onChange={l.setName} placeholder="what it is" aria-label="Ingredient"
                  base="flex:1;min-width:0;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-ui)"
                  focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
                <Interactive as="input" type="number" inputMode="decimal" min="1" value={l.grams} onChange={l.setGrams} placeholder="grams" aria-label={`Grams of ${l.name} in the recipe`}
                  base="width:84px;flex:none;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-ui);font-variant-numeric:tabular-nums"
                  focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
                <Interactive as="span" onClick={l.remove} aria-label={`Remove ${l.name}`} base="cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);font:400 16px var(--nv-font-ui)" hoverStyle="color:var(--nv-warn)">×</Interactive>
              </div>
            ))}
            <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px")}>
              <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>The whole recipe makes</Meta>
              <Interactive as="input" type="number" inputMode="decimal" min="1" value={v.orEditServings} onChange={v.setEditField('servings')} aria-label="Servings the recipe makes"
                base="width:64px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:8px 10px;color:var(--nv-ink);font:400 13px var(--nv-font-ui);font-variant-numeric:tabular-nums"
                focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
              <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>servings</Meta>
              <Chip tone="good" onClick={v.orEditLabelBusy ? undefined : v.computeFromLabels} style={{ marginLeft: 'auto', opacity: v.orEditLabelBusy ? .6 : 1 }}>{v.orEditLabelBusy ? 'Reading the labels…' : 'Work out the macros'}</Chip>
            </div>
          </div>
        )}
        {v.orEditLabelError && <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.orEditLabelError}</div>}
        {v.orEditLabelResult && (
          <div style={css("margin-top:10px;border-radius:10px;padding:10px 12px;background:var(--nv-well);font:400 12px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 75%, transparent);line-height:1.5")}>
            {v.orEditLabelResult.parts.map((p, i) => (
              <div key={i} style={css("display:flex;justify-content:space-between;gap:10px")}>
                <span style={css("min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{p.name} · {p.grams}g{p.low ? ' · hard to read' : ''}</span>
                <span style={css("flex:none;font-variant-numeric:tabular-nums")}><span style={css("color:var(--nv-cy)")}>{p.p}P</span> · <span style={css("color:var(--nv-gold)")}>{p.c}C</span> · <span style={css("color:var(--nv-vi)")}>{p.f}F</span> · <span style={css("color:var(--nv-good)")}>{p.kcal}</span></span>
              </div>
            ))}
            <div style={css("margin-top:6px;padding-top:6px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);display:flex;justify-content:space-between;gap:10px")}>
              <span>Whole recipe → ÷ {v.orEditLabelResult.servings} · the fields above are per serving</span>
              <span style={css("flex:none;font-variant-numeric:tabular-nums")}>{v.orEditLabelResult.total.p}P · {v.orEditLabelResult.total.c}C · {v.orEditLabelResult.total.f}F · {v.orEditLabelResult.total.kcal}</span>
            </div>
            {v.orEditLabelResult.warning && <div style={css("margin-top:6px;color:var(--nv-warn)")}>{v.orEditLabelResult.warning}</div>}
          </div>
        )}
      </div>

      {v.orEditError && (
        <div style={css("margin-top:12px;font-size:12px;color:var(--nv-warn)")}>{v.orEditError}</div>
      )}

      <div style={css("margin-top:16px;display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
        <Button onClick={v.saveEdit} disabled={v.orEditBusy}>
          {v.orEditBusy ? 'Saving…' : 'Save changes'}
        </Button>
        <Interactive as="span" onClick={v.cancelEdit}
          base="cursor:pointer;font:500 12.5px var(--nv-font-ui);padding:11px 16px;border-radius:980px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)"
          hoverStyle={{ color: 'var(--nv-ink)' }}>Cancel</Interactive>
      </div>
    </div>
  );
}
