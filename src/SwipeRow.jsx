import { Interactive } from './Interactive.jsx';
import { useSwipeAction } from './swipeAction.js';

// A row you can swipe, the way iOS Mail's rows swipe (3 Oct 2026, his words:
// "swipe to delete just like iOS typically allows ... consistent across the
// platform"). A partial swipe uncovers the buttons and the row stays open on
// them; a tap on one commits it; a long swipe commits the edge-most one with
// its button stretched across the row. The grammar lives in swipeAction.js
// and its rules in swipeReveal.js (tested). Buttons inside the row keep
// working: the swipe only claims the gesture once horizontal intent is
// locked, and a tap never reaches that state.
//
// `left`: what a LEFTWARD swipe uncovers (at the row's right edge, iOS's
// trailing actions), `right`: what a rightward swipe uncovers. Each is one
// action or a list, edge-most first; an action is
// { label, icon, tone, run, collapse?, full? }. `collapse: true` (a delete)
// slides the row out and folds its height away before `run`. Omit a side
// and that direction is inert: the row will not move that way at all.
//
// The buttons are an addition, never the only way: every caller keeps its
// own buttons for keyboard and VoiceOver, so the revealed ones are hidden
// from assistive tech and out of the tab order.
//
// `radius`: the track's corners, the card's own by default. A row inside a
// grouped list (the summary Train page's lifts) is square — the list card
// clips the corners — so it passes 0, and the track and the underlay take it
// together (they must always agree: server/test/concentric.test.js).
const cap = (t) => {
  const str = String(t || '');
  return str === str.toUpperCase() ? str.charAt(0) + str.slice(1).toLowerCase() : str;
};

function Act({ a, onRun }) {
  return (
    <Interactive as="span" className="nv-swipe-act" tabIndex={-1} haptic="commit" onClick={onRun}
      base={{ background: a.tone || 'var(--nv-warn)' }} focusStyle={{}} activeStyle={{ filter: 'brightness(.92)' }}>
      <span className="nv-swipe-in">
        {a.icon ? <span className="nv-swipe-ic" aria-hidden="true">{a.icon}</span> : null}
        <span className="nv-swipe-lb">{cap(a.label)}</span>
      </span>
    </Interactive>
  );
}

export function SwipeRow({ right, left, children, style, radius }) {
  const swipe = useSwipeAction({ left, right });

  if (!swipe.enabled) return <div style={style}>{children}</div>;

  return (
    // CONCENTRIC (16 Sep 2026): the track wraps the card FLUSH — gap zero —
    // so by Apple's nesting rule the two corners must be identical. This was a
    // hardcoded 12px around a card that reads var(--nv-radius), which is 22px
    // under his cupertino style: the card's corners bulged 10px outside the
    // track that was supposed to contain them. Measured in the live DOM, not
    // guessed. The token, not a number, is what keeps them equal through a
    // style switch.
    <div ref={swipe.wrapRef} className="nv-swipe" style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--nv-radius)', ...(radius != null ? { borderRadius: radius } : null), ...style }}>
      {/* the buttons the swipe uncovers, one group per side; each group's
          width follows the row's travel, so they grow out from the edge */}
      <div className="nv-swipe-under" aria-hidden="true"
        style={{ borderRadius: 'var(--nv-radius)', ...(radius != null ? { borderRadius: radius } : null) }}>
        {swipe.R.length > 0 && (
          <div ref={swipe.leadRef} className="nv-swipe-acts lead" data-full="false">
            {swipe.R.map((a, i) => <Act key={`${a.label}-${i}`} a={a} onRun={() => swipe.commit(a, 'right')} />)}
          </div>
        )}
        {swipe.L.length > 0 && (
          <div ref={swipe.trailRef} className="nv-swipe-acts trail" data-full="false">
            {swipe.L.map((a, i) => <Act key={`${a.label}-${i}`} a={a} onRun={() => swipe.commit(a, 'left')} />)}
          </div>
        )}
      </div>
      <div ref={swipe.ref} {...swipe.handlers} className="nv-swipe-row" style={{ position: 'relative', willChange: 'transform', touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  );
}
