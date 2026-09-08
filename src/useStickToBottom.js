import { useEffect, useRef } from 'react';

// A CHAT LOG THAT STAYS AT THE FOOT WHILE THE ANSWER IS STILL BEING WRITTEN.
//
// His report, 9 Sep: "I have to keep scrolling down to see all of the new
// text so I am technically not able to just sit here and read the sentence
// by sentence formation as I listen to Nova also speak it."
//
// The old hook — copied into the Voice screen, the Coach and the Leader —
// re-ran on `[messages.length, busy]`. But a streaming reply does not add a
// message: applyStreamPartial REPLACES the text of the last one, so the array
// length never changes and the effect never fired again. The log followed the
// arrival of a reply and then sat still for the whole of it, which is exactly
// the stretch he wanted to read.
//
// So nothing here is keyed on React state. It watches the DOM, which is the
// only thing that actually knows the text got longer:
//   characterData — a reply growing inside one bubble, token by token
//   childList     — a new message, an evidence card, a tool line
//   ResizeObserver— the container itself changing (the keyboard, a rotation)
//
// And it follows him rather than measuring geometry after the fact: growth
// pushes the foot away from him without him touching anything, so distance
// alone cannot tell "he scrolled up to read back" from "the answer got
// longer". Scrolling UP is the unambiguous signal, and nothing here ever
// scrolls up.
export const NEAR = 48;   // close enough to the foot to count as reading live

// THE RULE, kept pure so it can be tested without a browser: given where the
// log was and where it is now, is he still reading live?
//
//   growth alone must NOT unstick him — a longer answer moves the foot away
//     from him without him touching anything, which is precisely the case the
//     old distance-only check got wrong
//   scrolling UP is the one unambiguous "leave me alone"; nothing here ever
//     scrolls up, so only he can cause it
//   coming back to the foot re-sticks, and is checked LAST so that an
//     overscroll bounce (which reads as upward movement while still at the
//     bottom) does not strand him
export function nextStuck(wasStuck, { top, lastTop, scrollHeight, clientHeight }) {
  let stuck = wasStuck;
  if (top < lastTop - 2) stuck = false;
  if (scrollHeight - top - clientHeight <= NEAR) stuck = true;
  return stuck;
}

export function useStickToBottom() {
  const ref = useRef(null);
  const stuck = useRef(true);
  const lastTop = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // Instant, never smooth. A smooth scroll restarted on every token never
    // arrives — the words slide out from under him while it animates.
    const toFoot = () => {
      el.scrollTop = el.scrollHeight;
      lastTop.current = el.scrollTop;
    };
    // one scroll per frame however many mutations a token burst caused
    const follow = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (stuck.current) toFoot();
      });
    };

    const onScroll = () => {
      const top = el.scrollTop;
      stuck.current = nextStuck(stuck.current, {
        top, lastTop: lastTop.current, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      });
      lastTop.current = top;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    let mo = null;
    let ro = null;
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(follow);
      mo.observe(el, { childList: true, subtree: true, characterData: true });
    }
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(follow);
      ro.observe(el);
    }
    toFoot();   // land on the newest line — his 21-Aug ask, unchanged

    return () => {
      el.removeEventListener('scroll', onScroll);
      mo?.disconnect();
      ro?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  return ref;
}
