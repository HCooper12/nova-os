import { useEffect, useRef, useState } from 'react';

// HIS HOME, IN MINIATURE (mockup 72's Appearance preview: "a setting that
// changes a look should show the look", audit finding 6). Drawn at 200 x 420
// and scaled by its wrapper; each style draws its own Home's shape (Summary's
// rings and tiles over the tab bar, Apple layout's grouped rows over the
// floating dock, Apple skin's arc tiles, Command Core's brackets and core),
// in the palette, material and calm picked. A schematic of the layout, and
// the caption under the large one says so: the figures in it are not his.

const RINGS = [[27, '--m-r1', 0.64], [20, '--m-r2', 0.82], [13, '--m-r3', 0.48]];
function Rings() {
  return (
    <svg viewBox="0 0 62 62" aria-hidden="true">
      {RINGS.map(([r, c, f]) => {
        const C = 2 * Math.PI * r;
        return (
          <g key={r}>
            <circle cx="31" cy="31" r={r} fill="none" stroke="var(--m-ink3)" strokeWidth="5.5" />
            <circle cx="31" cy="31" r={r} fill="none" stroke={`var(${c})`} strokeWidth="5.5" strokeLinecap="round" strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`} />
          </g>
        );
      })}
    </svg>
  );
}
const Bars = ({ h, on }) => (
  <span className="nvm-strip">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} className={i === on || i === on - 2 ? 'on' : undefined} style={i === on || i === on - 2 ? { '--h': h } : undefined} />)}</span>
);
const MRow = ({ h }) => <span className="nvm-row" style={{ '--h': h }}><u /><b /><s /></span>;
const B = ({ w, cls = '', style }) => <span className={`nvm-b nvm-${w} ${cls}`} style={style} />;

function Inner({ style }) {
  if (style === 'summary') {
    return (
      <>
        <span className="nvm-pad">
          <B w="w30" /><span className="nvm-t">Good morning</span><B w="w85" cls="acc" /><B w="w70" />
          <span className="nvm-card nvm-rings" style={{ '--h': 'var(--m-r1)' }}>
            <Rings />
            <span className="nvm-nums">
              <span><i style={{ background: 'var(--m-r1)' }} />96 g</span>
              <span><i style={{ background: 'var(--m-r2)' }} />6.2k</span>
              <span><i style={{ background: 'var(--m-r3)' }} />72</span>
            </span>
          </span>
          <span className="nvm-two">
            <span className="nvm-card" style={{ '--h': 'var(--m-r3)' }}><B w="w55" cls="hue" style={{ '--h': 'var(--m-r3)' }} /><span className="nvm-n">Push</span><Bars h="var(--m-r3)" on={5} /></span>
            <span className="nvm-card" style={{ '--h': 'var(--m-r1)' }}><B w="w40" cls="hue" style={{ '--h': 'var(--m-r1)' }} /><span className="nvm-n">2,140</span><Bars h="var(--m-r1)" on={4} /></span>
          </span>
          <span className="nvm-card nvm-wide" style={{ '--h': 'var(--m-acc2)' }}>
            <B w="w40" style={{ margin: 0 }} />
            <span className="nvm-lamps" style={{ '--h': 'var(--m-acc2)' }}><i className="on" /><i className="on" /><i /><i /></span>
          </span>
        </span>
        <span className="nvm-dock"><span className="nvm-bar"><i className="on" /><i /><i /><i /><i /></span><span className="nvm-orb" /></span>
      </>
    );
  }
  const float = <span className="nvm-float"><i className="on" /><i /><span className="nvm-orb" /><i /><i /></span>;
  if (style === 'cupertino') {
    return (
      <>
        <span className="nvm-pad">
          <B w="w30" /><span className="nvm-t">Today</span>
          <span className="nvm-gl" /><span className="nvm-card nvm-rows"><MRow h="var(--m-r3)" /><MRow h="var(--m-r1)" /><MRow h="var(--m-acc2)" /></span>
          <span className="nvm-gl" /><span className="nvm-card nvm-rows"><MRow h="var(--m-r2)" /><MRow h="var(--m-ink3)" /><MRow h="var(--m-acc)" /><MRow h="var(--m-ink3)" /></span>
          <span className="nvm-gl" /><span className="nvm-card nvm-rows"><MRow h="var(--m-r1)" /><MRow h="var(--m-ink3)" /></span>
        </span>
        {float}
      </>
    );
  }
  if (style === 'apple') {
    return (
      <>
        <span className="nvm-pad">
          <B w="w30" /><span className="nvm-t">Mission</span>
          <span className="nvm-card" style={{ display: 'block', padding: 10 }}><B w="w85" cls="acc" /><B w="w70" /><B w="w55" style={{ margin: 0 }} /></span>
          <span className="nvm-tiles">
            {['--m-r1', '--m-r2', '--m-r3', '--m-acc'].map((h) => (
              <span key={h} className="nvm-card" style={{ '--h': `var(${h})` }}><span className="nvm-arc" style={{ '--h': `var(${h})` }} /><B w="w55" style={{ margin: '6px 0 0' }} /></span>
            ))}
          </span>
          <span className="nvm-card" style={{ display: 'block', marginTop: 8, padding: 10 }}><B w="w70" /><B w="w40" style={{ margin: 0 }} /></span>
        </span>
        {float}
      </>
    );
  }
  return (
    <>
      <span className="nvm-pad">
        <span className="nvm-lab" /><span className="nvm-t" style={{ font: '600 12px/1 var(--nv-font-mono)', letterSpacing: '.16em' }}>MISSION</span><span className="nvm-core" />
        <span className="nvm-hud"><span className="nvm-lab" /><span className="nvm-big">72</span><span className="nvm-rule" /><B w="w70" /><B w="w55" style={{ margin: 0 }} /></span>
        <span className="nvm-hud"><span className="nvm-lab" /><B w="w85" cls="acc" /><B w="w40" style={{ margin: 0 }} /></span>
        <span className="nvm-hud"><span className="nvm-lab" /><Bars h="var(--m-acc)" on={5} /></span>
      </span>
      {float}
    </>
  );
}

function Face({ look, className = '' }) {
  return (
    <div className={`nvm nvm-v ${className}`} data-style={look.style} data-theme={look.theme}
      data-mat={look.style === 'summary' ? look.material : 'glass'} data-calm={look.calm ? '1' : '0'}>
      <span className="nvm-sky" /><span className="nvm-notch" />
      <Inner style={look.style} />
    </div>
  );
}

const sig = (l) => [l.style, l.theme, l.material, l.calm ? 1 : 0].join('/');
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// A CHANGE IS ACTED OUT: the old look fades out under a blur while the new
// one comes in, so picking a palette is something he watches happen.
export function Mini({ look, k = 1, label }) {
  const s = sig(look);
  const [faces, setFaces] = useState([{ s, look, state: 'in' }]);
  const timer = useRef(null);
  useEffect(() => {
    if (faces[faces.length - 1].s === s) return undefined;
    if (reduced()) { setFaces([{ s, look, state: 'in' }]); return undefined; }
    setFaces((f) => [...f.filter((x) => x.state !== 'leaving').map((x) => ({ ...x, state: 'leaving' })), { s, look, state: 'entering' }]);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setFaces((f) => f.map((x) => (x.state === 'entering' ? { ...x, state: 'in' } : x)))));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFaces((f) => f.filter((x) => x.state !== 'leaving')), 300);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span className="nvm-wrap" style={{ '--k': k }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      {faces.map((f) => <Face key={f.s} look={f.look} className={`ghost${f.state === 'in' ? '' : ' out'}`} />)}
    </span>
  );
}

// a palette drawn as its own sky (never the current theme's tokens)
export function Disc({ theme, className = 'nv-set-disc' }) {
  return <span className={`${className} nv-set-d-${theme}`} aria-hidden="true" />;
}

// a material over the theme's sky, with one card in it
export function MaterialPatch({ theme, material }) {
  return (
    <span className="nv-set-mpatch nvm-v" data-theme={theme} data-mat={material} aria-hidden="true">
      <span className="nvm-card" style={{ '--h': 'var(--m-acc)' }} />
    </span>
  );
}
