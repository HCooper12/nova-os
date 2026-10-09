// THE LOOK CHANGES IN ONE MOVE (9 Oct 2026, his call: "changing the theme
// cross-fades the whole app"; the reel's sixth move). Every switch of theme,
// style, material or calm goes through `crossFadeLook`, which App.changeLook
// calls with the change itself.
//
// WHY A ROOT CROSS-FADE IS SAFE HERE WHEN IT WAS NOT FOR TABS (17 Sep 2026):
// a snapshot of a backdrop-filtered element bakes in what was behind it at
// capture time, so a slide showed stale glass over a page that had moved.
// A look change moves nothing. The old frame and the new one are each a
// whole, self-consistent picture, glass included, and only their colours
// differ, so dissolving one into the other has nothing to double. Two
// guards keep it that way:
//   - while the look changes, NOTHING but the root has a view-transition
//     name (`:root.nv-look *` in index.css), so no glass element is
//     snapshotted on its own the way the 17 Sep dock was
//   - the dissolve is opacity only, 250 ms, no rise
// His phone is the judge of the glass (Safari rasterises it differently from
// Chrome); if it doubles there, `fadeGround` is the fallback already written:
// it freezes the old ground colour in one plain layer and fades that, which
// never photographs anything.
//
// Reduced motion: a cut. A browser without View Transitions: fadeGround.

export const LOOK_MS = 250;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// `apply` must change the look synchronously (App flushes its setState and
// stamps the attributes inside it), so the new frame is the one captured
export function crossFadeLook(apply, { doc = typeof document !== 'undefined' ? document : null } = {}) {
  if (!doc || reducedMotion() || doc.hidden) { apply(); return 'cut'; }
  if (typeof doc.startViewTransition !== 'function') { fadeGround(apply, doc); return 'ground'; }
  const root = doc.documentElement;
  root.classList.add('nv-look');
  try {
    const t = doc.startViewTransition(() => { apply(); });
    const done = () => root.classList.remove('nv-look');
    // a second switch mid-fade supersedes this one: its promises reject with
    // "Transition was skipped", which is expected and not worth a console line
    t?.finished?.then(done, done);
    t?.ready?.catch(() => {});
    t?.updateCallbackDone?.catch(() => {});
    return 'fade';
  } catch {
    root.classList.remove('nv-look');
    apply();
    return 'cut';
  }
}

// The fallback that photographs nothing: one fixed layer painted with the
// OLD ground colour is laid over the page, the look changes under it, and
// the layer fades away. What he sees is the old ground giving way to the new
// page; no glass is ever captured.
export function fadeGround(apply, doc = document) {
  let layer = null;
  try {
    const ground = getComputedStyle(doc.documentElement).getPropertyValue('--nv-void').trim() || getComputedStyle(doc.body).backgroundColor;
    layer = doc.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = `position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:${ground}`;
    doc.body.appendChild(layer);
  } catch { layer = null; }
  apply();
  if (!layer) return;
  const remove = () => layer.remove();
  try {
    const a = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LOOK_MS, easing: 'ease', fill: 'forwards' });
    a.finished.then(remove, remove);
  } catch { remove(); }
}
