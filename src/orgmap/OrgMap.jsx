// THE ORG MAP on the Ops screen (AGENT-WORLD-PLAN §3, step C): the nine
// beings on their districts, a marker over each one that is waiting on him
// with the real count, and a tap that says what it is asking.
//
// Under the picture is the same thing as a list (the marker list, step B):
// it is the keyboard's way in, and it is what stands if WebGL cannot.
//
// The view model is valsOrgMap's; the scene is scene.js. Nothing here calls
// a model or the network (server/test/agentWorldNoModel.test.js).

import { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '../css.js';
import { Eyebrow, Meta, TextAction } from '../Controls.jsx';
import { createOrgScene } from './scene.js';

const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;
// each department speaks in its own hue, the same one its district is lit in
const HUE = {
  train: 'var(--nv-m-chest)', knowledge: 'var(--nv-m-quads)', logistics: 'var(--nv-cy)', fuel: 'var(--nv-m-shoulders)',
  platform: 'var(--nv-vi)', money: 'var(--nv-good)', mind: 'var(--nv-mg)', core: 'var(--nv-cy)',
};
// the loop list's own dots — a state read at a glance, same four states the
// old fleet ring drew, now living on the being that stands for each loop
const LOOP_DOT = {
  today: 'var(--nv-good)', recent: 'var(--nv-cy)', stale: 'var(--nv-warn)',
  never: 'color-mix(in srgb, var(--nv-ink) 30%, transparent)',
};

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Card({ c, onClose, onInbox, hue }) {
  return (
    <div className="nv-liquid" role="dialog" aria-label={`${c.name}, ${c.district}`}
      style={css(`position:absolute;left:10px;right:10px;bottom:10px;max-width:440px;margin:0 auto;padding:13px 15px 12px;border-radius:calc(var(--nv-radius) + 4px);border-left:2px solid ${hue};animation:nvRise var(--nv-dur-base) var(--nv-ease) both;max-height:62%;overflow:auto`)}>
      <div style={css('display:flex;align-items:baseline;gap:10px')}>
        <Eyebrow as="span" tone={hue}>{c.district}</Eyebrow>
        <span style={css('margin-left:auto')}><TextAction compact tone="faint" onClick={onClose} ariaLabel="Close">Close</TextAction></span>
      </div>
      <div style={css('font:400 24px/1.1 var(--nv-font-serif);color:var(--nv-ink);margin-top:2px')}>{c.name}</div>
      <div style={css(`margin-top:4px;font:450 13.5px/1.45 var(--nv-font-ui);color:${dim(72)}`)}>{c.line}</div>
      {c.asks.length > 0 && (
        <div style={css('margin-top:9px;display:flex;flex-direction:column;gap:5px')}>
          {c.asks.map((a) => (
            <div key={a.id} style={css(`display:flex;align-items:baseline;gap:9px;padding:6px 9px;border-radius:9px;background:${dim(4)};border:1px solid ${dim(8)}`)}>
              <span style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: 'var(--nv-gold)', alignSelf: 'center' }} />
              <span style={css(`flex:1;min-width:0;font:500 12.5px/1.4 var(--nv-font-ui);color:${dim(88)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{a.title}</span>
              <Meta tone={dim(40)} style={{ flex: 'none', textTransform: 'none', letterSpacing: 0 }}>{a.when}</Meta>
            </div>
          ))}
          {c.more > 0 && <Meta as="div" tone={dim(45)} style={{ textTransform: 'none', letterSpacing: 0, paddingLeft: '2px' }}>and {c.more} more in the Inbox</Meta>}
        </div>
      )}
      {c.last && (
        <Meta as="div" tone={dim(48)} style={{ marginTop: '9px', textTransform: 'none', letterSpacing: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Last: {c.last.title} · {c.last.status} · {c.last.when} ago
        </Meta>
      )}
      {c.loops && <Meta as="div" tone={dim(40)} style={{ marginTop: '3px', textTransform: 'none', letterSpacing: 0 }}>{c.loops}</Meta>}
      {/* every loop's own state, stale/never first — the picture the old
          fleet ring drew, now carried on the being that stands for it */}
      {c.loopList?.length > 0 && (
        <div style={css('margin-top:8px;display:flex;flex-direction:column;gap:4px')}>
          {c.loopList.map((m) => (
            <div key={m.id} style={css(`padding:5px 9px;border-radius:9px;background:${dim(3)}`)}>
              <div style={css('display:flex;align-items:baseline;gap:8px')}>
                <span style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', alignSelf: 'center', background: LOOP_DOT[m.state] }} />
                <span style={css(`font:500 12.5px var(--nv-font-ui);color:${dim(86)}`)}>{m.label}</span>
                <span style={css(`font:450 11.5px var(--nv-font-ui);color:${dim(42)}`)}>{m.role}</span>
                <Meta tone={dim(40)} style={{ marginLeft: 'auto', flex: 'none', textTransform: 'none', letterSpacing: 0 }}>{m.stateLabel}</Meta>
              </div>
              {m.last && <Meta as="div" tone={dim(36)} style={{ marginTop: '2px', paddingLeft: '14px', textTransform: 'none', letterSpacing: 0 }}>{m.last}</Meta>}
            </div>
          ))}
        </div>
      )}
      {c.asks.length > 0 && (
        <div style={css('margin-top:10px')}><TextAction compact onClick={onInbox}>Open Inbox →</TextAction></div>
      )}
    </div>
  );
}

export function OrgMap({ v }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [rebuild, setRebuild] = useState(0);
  const [failed, setFailed] = useState(false);
  const selectRef = useRef(v.select);
  const closeRef = useRef(v.close);
  selectRef.current = v.select;
  closeRef.current = v.close;

  // the scene is built once per theme: its colours are token reads, and a
  // theme or Calm switch re-reads them by rebuilding rather than drifting
  useEffect(() => {
    if (!mountRef.current) return undefined;
    let s;
    try {
      s = createOrgScene(mountRef.current, {
        reduceMotion: reducedMotion(),
        onSelect: (id) => (id ? selectRef.current(id) : closeRef.current()),
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    sceneRef.current = s;
    if (import.meta.env?.DEV) window.__novaOrgMap = s;
    return () => { s.dispose(); sceneRef.current = null; };
  }, [rebuild]);
  useEffect(() => {
    const mo = new MutationObserver(() => setRebuild((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nv-theme', 'data-nv-calm'] });
    return () => mo.disconnect();
  }, []);

  // the app re-renders often; the scene only hears about a real change
  const signature = useMemo(() => JSON.stringify([v.beings.map((b) => [b.id, b.pose, b.waiting, b.dim]), v.core.waiting]), [v.beings, v.core]);
  useEffect(() => { sceneRef.current?.update(v); }, [signature, rebuild]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sceneRef.current?.select(v.selectedId); }, [v.selectedId, rebuild]);

  const asking = v.beings.filter((b) => b.waiting > 0).sort((a, b) => b.waiting - a.waiting);
  const hue = v.card ? HUE[v.card.id === 'core' ? 'core' : (v.beings.find((b) => b.id === v.card.id)?.district)] || 'var(--nv-cy)' : 'var(--nv-cy)';

  return (
    <section aria-label="The org map" style={css('margin-top:24px;animation:nvRise var(--nv-dur-base) var(--nv-ease) both')}>
      <div style={css('display:flex;align-items:baseline;gap:10px;flex-wrap:wrap')}>
        <Eyebrow as="span">The org</Eyebrow>
        <Meta tone={dim(35)} style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>drawn from the records · tap a being</Meta>
      </div>
      <div style={css('margin-top:6px;font:italic 400 19px/1.3 var(--nv-font-serif);color:var(--nv-ink);text-wrap:balance')}>{v.headline}</div>

      {!failed && (
        <div style={css(`position:relative;margin-top:10px;height:clamp(360px, 96vw, 560px);border-radius:calc(var(--nv-radius) + 6px);overflow:hidden;border:1px solid ${dim(7)};background:radial-gradient(120% 90% at 50% 30%, color-mix(in srgb, var(--nv-cy) 7%, transparent), transparent 70%)`)}>
          <div ref={mountRef} style={css('position:absolute;inset:0')} />
          {v.card && <Card c={v.card} hue={hue} onClose={v.close} onInbox={v.openInbox} />}
        </div>
      )}
      {failed && (
        <Meta as="div" tone={dim(55)} style={{ marginTop: '10px', textTransform: 'none', letterSpacing: 0 }}>
          The map needs WebGL, which this browser will not give it. Here is the same thing as a list.
        </Meta>
      )}

      {/* THE MARKER LIST: who is asking, most first. The keyboard's way into
          the map, and the whole of it when WebGL is not there. */}
      <div role="list" style={css('margin-top:10px;display:flex;flex-wrap:wrap;gap:6px')}>
        {asking.map((b) => (
          <button key={b.id} type="button" role="listitem" onClick={() => v.select(b.id)}
            aria-pressed={v.selectedId === b.id}
            style={css(`appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:6px 12px;border-radius:999px;border:1px solid ${v.selectedId === b.id ? 'var(--nv-acc-border)' : dim(12)};background:${v.selectedId === b.id ? 'var(--nv-acc-bg)' : 'transparent'};color:${dim(85)};font:600 12.5px var(--nv-font-ui)`)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: HUE[b.district] }} />
            {b.name}
            <span style={css('font:700 11px var(--nv-font-ui);color:var(--nv-gold)')}>{b.waiting}</span>
          </button>
        ))}
        {v.core.waiting > 0 && (
          <button type="button" role="listitem" onClick={() => v.select('core')} aria-pressed={v.selectedId === 'core'}
            style={css(`appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:6px 12px;border-radius:999px;border:1px solid ${dim(12)};background:transparent;color:${dim(85)};font:600 12.5px var(--nv-font-ui)`)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: HUE.core }} />
            Your own notes
            <span style={css('font:700 11px var(--nv-font-ui);color:var(--nv-gold)')}>{v.core.waiting}</span>
          </button>
        )}
      </div>
      {v.unfiledLine && <Meta as="div" tone={dim(42)} style={{ marginTop: '6px', textTransform: 'none', letterSpacing: 0 }}>{v.unfiledLine}</Meta>}
    </section>
  );
}
