// The app icon is drawn by the core itself: this page renders NovaCore,
// the same component the tab bar and the full screen use, at icon size on a
// transparent ground, so scripts/gen-icons.mjs can photograph it.
//   ?size=120&dpr=8&bg=%23000&state=idle|listening|thinking|speaking&engine=hologram
import { createRoot } from 'react-dom/client';
import { NovaCore } from '../../src/NovaCore.jsx';

const q = new URLSearchParams(location.search);
const state = q.get('state') || 'idle';
document.body.style.background = q.get('bg') || 'transparent';
createRoot(document.getElementById('root')).render(
  <NovaCore size={Number(q.get('size') || 880)} engine={q.get('engine') || 'hologram'} variant={q.get('variant') || 'full'}
    listening={state === 'listening'} thinking={state === 'thinking'} speaking={state === 'speaking'} still
    pixelRatio={Number(q.get('dpr') || 0)} />,
);
