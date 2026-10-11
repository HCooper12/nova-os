import { useEffect } from 'react';
import { useEdgeBack } from './edgeBack.js';
import { installSheetDrag, installKeyboardInset } from './sheetDrag.js';

// The gesture, mounted. App is a class component, so the hook needs a leaf to
// live in — and a leaf is where it belongs anyway: it holds no state React can
// see, paints through a transform, and re-renders nothing (see the perf
// memory, and Elapsed.jsx for the same shape).
//
// IT TOUCHES NOTHING OF NOVA'S. The first cut transformed <main>, and a
// transformed ancestor re-anchors every position:fixed descendant inside it —
// mid-drag the recipe overlay stopped being pinned to the viewport and painted
// on top of the list beneath it. He filmed three screens' text superimposed.
// The affordance is now a fixed element the hook owns, appended to <body>.
export function EdgeBack() {
  useEdgeBack({ onBack: () => window.history.back() });
  // and its vertical sibling: every sheet pulls down and goes (sheetDrag.js),
  // with the keyboard's height published for the bars that stand on it
  useEffect(() => {
    const a = installSheetDrag();
    const b = installKeyboardInset();
    return () => { a(); b(); };
  }, []);
  return null;
}

export default EdgeBack;
