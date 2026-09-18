import { useEdgeBack } from './edgeBack.js';

// The gesture, mounted. App is a class component, so the hook needs a leaf to
// live in — and a leaf is where it belongs anyway: it holds no state React can
// see, paints through a transform, and re-renders nothing (see the perf
// memory, and Elapsed.jsx for the same shape).
//
// The SCROLLER slides, not the whole app, so the dock stays put under the
// finger the way a tab bar does on iOS.
export function EdgeBack({ getEl }) {
  useEdgeBack({ getEl, onBack: () => window.history.back() });
  return null;
}

export default EdgeBack;
