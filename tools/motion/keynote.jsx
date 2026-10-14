// THE KEYNOTE MOMENTS, filmable (13 Oct 2026): each new motion mounted on its
// own, driven by window.__kn so a recorder can step it and photograph frames.
// Dev only; never shipped (vite builds index.html, not tools/).
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/index.css';
import { NumberRoll } from '../../src/NumberRoll.jsx';
import { RingTile } from '../../src/RingTile.jsx';
import { Interactive } from '../../src/Interactive.jsx';
import { TickButton } from '../../src/TickButton.jsx';

function App() {
  const [n, setN] = useState(1250);
  const [p, setP] = useState(92);
  const [done, setDone] = useState(false);
  const [pct, setPct] = useState(86);
  const [fin, setFin] = useState('idle');
  const [struck, setStruck] = useState(false);
  const [got, setGot] = useState(false);
  window.__kn = { setN, setP, setDone, setPct, setFin, setStruck, setGot };
  return (
    <div style={{ padding: 20, display: 'grid', gap: 22, color: 'var(--nv-ink)', background: 'var(--nv-bg1)', width: 360 }}>
      <div style={{ font: '400 44px/1 var(--nv-font-serif)' }}><NumberRoll value={n} /> <span style={{ fontSize: 14 }}>kcal</span></div>
      <div style={{ font: '400 22px/1 var(--nv-font-serif)', color: 'var(--nv-cy)' }}><NumberRoll value={p} />g</div>
      <Interactive as="span" className="nv-setdone" data-done={done ? '1' : '0'} base={{ width: 40, height: 40 }} onClick={() => setDone(!done)}>
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Interactive>
      <div style={{ position: 'relative', width: 90 }}><RingTile label="Protein" value={String(pct)} small="g" pct={pct} state="good" /></div>
      <TickButton state={fin} onClick={() => setFin('working')} label="Finish workout" ariaLabel="Finish" />
      <span style={{ width: 21, height: 21, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--nv-on-acc)', background: got ? 'var(--nv-cy)' : 'transparent', border: got ? '1px solid var(--nv-cy)' : '1px solid #555', transition: 'background-color .16s' }}>
        <svg className="nv-checkmark" data-on={got ? '1' : '0'} viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="nv-struck" data-struck={struck ? '1' : '0'} style={{ font: '600 16px var(--nv-font-ui)', opacity: struck ? 0.6 : 1 }}>Ten minutes of mobility before bed</span>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
