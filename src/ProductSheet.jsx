import { Interactive } from './Interactive.jsx';

// THE PRODUCT SHEET (mockup 109, approved 1 Nov 2026: frames B and C). One
// tap on an ingredient line opens it over the recipe (a 60% scrim, so the
// question stands alone). Few choices up front: his own products that fit
// the line, then "Photograph a new label"; Search and Type it in sit under it
// as two small actions. What a label read is shown with what it means for
// this recipe, and one button uses it. Every number is code's
// (src/vals/valsRecipes.js productSheetOf, server/lib/products.js).

const KEYS = [['p', 'g protein', 'p'], ['c', 'g carbs', ''], ['f', 'g fat', ''], ['kcal', 'kcal', 'k']];

function Camera() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

function Row({ name, sub, onUse, busy }) {
  return (
    <Interactive as="button" type="button" className="nv-ps-row" onClick={busy ? undefined : onUse} haptic="tick" aria-label={`Use ${name}`}>
      <span className="nv-ps-rowtx"><span className="nv-ps-rowname">{name}</span><span className="nv-ps-rowsub">{sub}</span></span>
      <span className="nv-ps-use">Use</span>
    </Interactive>
  );
}

export function ProductSheet({ s }) {
  const photoInput = (
    <label className="nv-ps-primary" aria-busy={s.busy || undefined}>
      <input type="file" accept="image/*" capture="environment" onChange={s.photo} style={{ display: 'none' }} />
      <Camera />{s.stage === 'label' && s.busy ? 'Reading the label…' : s.matches?.length ? 'Photograph a new label' : 'Photograph the label'}
    </label>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label={`Your product for ${s.line}`} className="nv-ps-scrim" data-sheet-close="" onClick={s.close}>
      <div data-sheet="" className="nv-ps-sheet nv-deck-rise" onClick={(e) => e.stopPropagation()}>
        <div className="nv-ps-grabber" aria-hidden="true" />
        <div className="nv-ps-head">
          <div style={{ minWidth: 0 }}>
            <div className="nv-ps-eyebrow">{s.title}</div>
            <h2>{s.stage === 'label' && s.read ? 'Read from your label' : s.stage === 'search' ? 'Find it' : s.stage === 'type' ? 'Type it in' : 'Which one do you use?'}</h2>
          </div>
          {s.back && <Interactive as="button" type="button" className="nv-ps-text" onClick={s.back}>Back</Interactive>}
        </div>

        {s.stage === 'pick' && (
          <>
            {s.matches == null && <div className="nv-ps-skel" aria-label="Looking through your products" />}
            {s.matches?.length > 0 && (
              <div className="nv-ps-list">
                <div className="nv-ps-label">From your products</div>
                {s.matches.map((m) => <Row key={m.id} name={m.name} sub={m.sub} onUse={m.use} busy={s.busy} />)}
              </div>
            )}
            {photoInput}
            <div className="nv-ps-alts">
              <Interactive as="button" type="button" className="nv-ps-text" onClick={s.toSearch}>Search</Interactive>
              <Interactive as="button" type="button" className="nv-ps-text" onClick={s.toType}>Type it in</Interactive>
            </div>
          </>
        )}

        {s.stage === 'label' && !s.read && (
          <>
            {s.busy ? <div className="nv-ps-skel" aria-label="Reading the label" /> : null}
            {!s.busy && photoInput}
          </>
        )}

        {s.stage === 'label' && s.read && (
          <>
            <label className="nv-ps-field"><span>Product</span>
              <input value={s.read.name} onChange={s.read.setName} aria-label="Product name" />
            </label>
            <div className="nv-ps-grid">
              {KEYS.map(([k, label, tone]) => (
                <label key={k} className={`nv-ps-cell ${tone}`}>
                  <input inputMode="decimal" value={String(s.read.per100[k])} onChange={(e) => s.read.setValue(k, e.target.value)} aria-label={`${label} per 100 grams`} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="nv-ps-note">Per 100 g, as printed{s.read.question ? `. ${s.read.question}` : ''}. Tap a number to correct it.</p>
            {s.read.meaning && <div className="nv-ps-meaning">{s.read.meaning}</div>}
            <Interactive as="button" type="button" className="nv-ps-primary" onClick={s.busy ? undefined : s.read.use} haptic="commit">{s.busy ? 'Saving…' : 'Use this'}</Interactive>
            <p className="nv-ps-foot">Kept in your products, so the next recipe with it offers it.</p>
          </>
        )}

        {s.stage === 'search' && (
          <>
            <div className="nv-ps-searchrow">
              <input className="nv-ps-input" value={s.search.query} onChange={s.search.set} placeholder="Brand and product" aria-label="Search for a product"
                onKeyDown={(e) => { if (e.key === 'Enter') s.search.go(); }} />
              <Interactive as="button" type="button" className="nv-ps-text" onClick={s.search.go}>Search</Interactive>
            </div>
            {s.busy && <div className="nv-ps-skel" aria-label="Searching" />}
            {!s.busy && s.search.results.length > 0 && <div className="nv-ps-list">{s.search.results.map((r) => <Row key={r.key} name={r.name} sub={r.sub} onUse={r.use} />)}</div>}
            {!s.busy && s.search.searched && !s.search.results.length && <p className="nv-ps-note">Nothing found for “{s.search.searched}”. The label photo is the sure way.</p>}
          </>
        )}

        {s.stage === 'type' && (
          <>
            <label className="nv-ps-field"><span>Product</span>
              <input value={s.type.form.name || ''} onChange={s.type.set('name')} aria-label="Product name" placeholder="Brand and product" />
            </label>
            <div className="nv-ps-grid">
              {KEYS.map(([k, label, tone]) => (
                <label key={k} className={`nv-ps-cell ${tone}`}>
                  <input inputMode="decimal" value={s.type.form[k] || ''} onChange={s.type.set(k)} aria-label={`${label} per 100 grams`} placeholder="0" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="nv-ps-note">Per 100 g, from the panel.</p>
            {s.type.meaning && <div className="nv-ps-meaning">{s.type.meaning}</div>}
            <Interactive as="button" type="button" className="nv-ps-primary" onClick={s.type.use && !s.busy ? s.type.use : undefined} aria-disabled={!s.type.use || undefined}>{s.busy ? 'Saving…' : 'Use this'}</Interactive>
          </>
        )}

        {s.error && <p className="nv-ps-error">{s.error}</p>}
      </div>
    </div>
  );
}
