import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { Eyebrow, TextAction, Chip, isAppleStyle } from './Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '10px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

const macroField = (label, value, onChange) => (
  <div style={css("flex:1")}>
    <Eyebrow>{label}</Eyebrow>
    <Interactive
      as="input"
      type="number"
      inputMode="numeric"
      min="0"
      value={value}
      onChange={onChange}
      base="margin-top:5px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 10px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-mono);outline:none"
      focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
    />
  </div>
);

export function AddRecipeModal({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Add a recipe" onClick={v.closeAddRecipe} style={css("position:fixed;inset:0;background:rgba(8,5,12,.72);backdrop-filter:blur(6px);z-index:60;display:flex;align-items:center;justify-content:center;padding:40px;overflow-y:auto")}>
      <div onClick={v.stopClick} style={css("width:640px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 var(--nv-spec);animation:fadeUp var(--nv-dur-base) var(--nv-ease);padding:26px 28px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <Eyebrow as="span" tone="gold">New recipe</Eyebrow>
          <Chip tone="quiet" onClick={v.closeAddRecipe}>Esc</Chip>
        </div>
        <h2 style={css("margin:14px 0 0;font:400 26px var(--nv-font-serif)")}>Add a recipe</h2>
        <div style={css("margin-top:8px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);line-height:1.6")}>
          Saved into Nova and written straight into your <code>Meal Prep Recipe Collection.md</code> in Obsidian.
        </div>

        <div style={css("margin-top:16px;border:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
          <Eyebrow tone="cyan">Scan from photos — optional</Eyebrow>
          <div style={css("margin-top:6px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);line-height:1.5")}>
            A nutrition label, a recipe card, or a screenshot — Nova reads it and fills in the fields below for you to check over.
          </div>
          <div style={css("margin-top:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
            <label style={css("cursor:pointer;font-size:12px;padding:9px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);color:var(--nv-cy);background:color-mix(in srgb, var(--nv-cy) 08%, transparent)")}>
              {v.recipeScanBusy ? 'Analyzing…' : 'Upload photo(s)'}
              <input type="file" accept="image/*" multiple onChange={v.onRecipeScanFiles} disabled={v.recipeScanBusy} style={css("display:none")} />
            </label>
            <span style={css("font-size:11px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>up to 4 images</span>
          </div>
          {v.recipeScanError && (
            <div style={css("margin-top:10px;font-size:12px;color:var(--nv-warn)")}>{v.recipeScanError}</div>
          )}
        </div>

        <div style={css("margin-top:16px")}>
          <Eyebrow>Dish photo (optional)</Eyebrow>
          <div style={css("margin-top:6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
            {v.recipeAddPhotoDataUrl && (
              <div style={css("width:64px;height:64px;border-radius:8px;overflow:hidden;flex:none")}>
                <img src={v.recipeAddPhotoDataUrl} alt="" style={css("width:100%;height:100%;object-fit:cover;display:block")} />
              </div>
            )}
            <label style={css("cursor:pointer;font-size:12px;padding:9px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)")}>
              {v.recipeAddPhotoDataUrl ? 'Change photo' : 'Choose photo'}
              <input type="file" accept="image/*" onChange={v.onRecipeAddPhotoFile} style={css("display:none")} />
            </label>
            {v.recipeAddPhotoDataUrl && (
              <Interactive as="span" onClick={v.clearRecipeAddPhoto} base="cursor:pointer;font-size:11.5px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-warn)">remove</Interactive>
            )}
          </div>
        </div>

        <div style={css("margin-top:16px;display:flex;gap:12px")}>
          <div style={css("flex:2")}>
            <Eyebrow>Name</Eyebrow>
            <Interactive
              as="input"
              value={v.recipeAddName}
              onChange={v.setRecipeAddName}
              placeholder="e.g. Turkey Wrap"
              base="margin-top:5px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 10px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
            />
          </div>
          <div style={css("flex:1")}>
            <Eyebrow>Category</Eyebrow>
            <select
              value={v.recipeAddCategory}
              onChange={v.setRecipeAddCategory}
              style={css("margin-top:5px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 10px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none")}
            >
              {v.recipeAddCategoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={css("margin-top:12px")}>
          <Eyebrow>Makes (optional)</Eyebrow>
          <Interactive
            as="input"
            value={v.recipeAddMakes}
            onChange={v.setRecipeAddMakes}
            placeholder="e.g. 1 wrap, or 4 servings"
            base="margin-top:5px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 10px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none"
            focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
          />
        </div>

        <div style={css("margin-top:12px;display:flex;gap:10px")}>
          {macroField('Protein (g)', v.recipeAddP, v.setRecipeAddP)}
          {macroField('Carbs (g)', v.recipeAddC, v.setRecipeAddC)}
          {macroField('Fat (g)', v.recipeAddF, v.setRecipeAddF)}
          {macroField('kcal', v.recipeAddKcal, v.setRecipeAddKcal)}
        </div>
        <div style={css("margin-top:10px;display:flex;align-items:center;gap:12px")}>
          <div style={css("flex:1")}>
            {macroField('Or enter kJ — auto-fills kcal', v.recipeAddKj, v.setRecipeAddKj)}
          </div>
          <div style={css("flex:2;font-size:11px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Aussie food labels often only list kJ — type it here and Nova converts it to kcal for you.</div>
        </div>

        <div style={css("margin-top:12px")}>
          <Eyebrow>Ingredients — one per line</Eyebrow>
          <textarea
            value={v.recipeAddIngredients}
            onChange={v.setRecipeAddIngredients}
            placeholder={"1 wholemeal wrap\n120g turkey breast, sliced\n1 tbsp mustard"}
            style={css("margin-top:6px;width:100%;box-sizing:border-box;height:90px;resize:vertical;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-mono);line-height:1.6;outline:none")}
          />
        </div>

        <div style={css("margin-top:12px")}>
          <Eyebrow>Method — one step per line</Eyebrow>
          <textarea
            value={v.recipeAddMethod}
            onChange={v.setRecipeAddMethod}
            placeholder={"Warm the wrap 10 sec.\nLayer turkey, mustard, spinach.\nRoll tightly and slice in half."}
            style={css("margin-top:6px;width:100%;box-sizing:border-box;height:90px;resize:vertical;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-mono);line-height:1.6;outline:none")}
          />
        </div>

        {v.recipeAddError && (
          <div style={css("margin-top:12px;font-size:12px;color:var(--nv-warn)")}>{v.recipeAddError}</div>
        )}

        <div style={css("margin-top:16px;display:flex;justify-content:flex-end;gap:10px")}>
          <TextAction tone="quiet" onClick={v.closeAddRecipe}>Cancel</TextAction>
          <Interactive as="span" onClick={v.recipeAddBusy ? undefined : v.submitAddRecipe} base={btn('var(--nv-gold)', '#1a1322', { opacity: v.recipeAddBusy ? .6 : 1 })} hoverStyle={{ filter: 'brightness(1.08)' }}>{v.recipeAddBusy ? 'Saving…' : 'Save recipe'}</Interactive>
        </div>
      </div>
    </div>
  );
}
