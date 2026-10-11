// THE SKILL SETS (mockup 97, round 2, with his final calls of 11 Oct).
//
// Ten glass slabs on a lit floor, one per agent, swiped with momentum and
// still until he swipes. Every visible agent is alive at his slab, playing
// in character between natural pauses; a working agent does his working
// tell instead; when whether he is working is unknown (the Mac unreachable,
// still loading) he stands still, because play would claim he is idle.
// Tap a panel and its agent hops onto the rising sheet and rides it up, and
// stays at its top while the skill set is read. Back runs it in reverse.
//
// All the agents are drawn by ONE renderer in ONE scene (./stage.js); the
// slabs are DOM moved by transform and opacity only. The view model is
// src/vals/valsSkillSets.js; nothing here invents a value.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextAction } from '../Controls.jsx';
import { createSkillStage } from './stage.js';

const ART = {
  compass: '<circle cx="12" cy="12" r="8"/><path d="M12 4l2 8-2 8-2-8z"/>',
  bar: '<path d="M3 12h18M5 8v8M8 9v6M16 9v6M19 8v8"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  lens: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  film: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 6v12M17 6v12"/>',
  book: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
  pot: '<path d="M5 10h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM3 10h18M10 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2"/>',
  orb: '<circle cx="12" cy="12" r="7"/><path d="M10 10a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.5M12 16v.01"/>',
  masks: '<path d="M4 5h8v6a4 4 0 0 1-8 0zM12 9h8v6a4 4 0 0 1-8 0"/>',
};
const TIER_CLASS = { o: 'observe', p: 'propose', a: 'act' };

// geometry, from the mockup: phone and Mac
const G_PHONE = { wide: false, STAGE_T: 66, SW: 236, SH: 350, STEP: 26, R: 520, PX: 150, P: 1100, CH: 118, SHEET_T: 276, MINH: 650 };
const G_MAC = { wide: true, STAGE_T: 110, SW: 300, SH: 430, STEP: 22, R: 900, PX: 260, P: 1800, CH: 150, SHEET_W: 560, MINH: 760 };
const STAGE_H = (g) => (g.wide ? 640 : 520);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const CSS = `
.nv-skl{position:relative;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;margin:0 -18px;
  background:radial-gradient(120% 70% at 50% 18%,var(--nv-bg2),var(--nv-bg1) 55%,var(--nv-void));border-radius:0;animation:nvRise var(--nv-dur-base) var(--nv-ease) both}
.nv-skl.wide{margin:0;border-radius:calc(var(--nv-radius) + 6px);border:1px solid var(--nv-edge)}
.nv-skl-top{position:absolute;left:20px;right:20px;top:4px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;z-index:5}
.nv-skl.open .nv-skl-top b{visibility:hidden}
.nv-skl-top b{font:700 30px/1 var(--nv-font-ui);letter-spacing:-.02em;color:var(--nv-ink)}
.nv-skl-top span{font:600 11px var(--nv-font-mono);letter-spacing:.08em;color:var(--nv-ink60);text-align:right}
.nv-skl .demo{display:inline-block;font:600 9.5px var(--nv-font-mono);letter-spacing:.08em;color:var(--nv-gold);border:1px solid color-mix(in srgb,var(--nv-gold) 45%,transparent);border-radius:4px;padding:1px 4px;vertical-align:1px;margin-left:4px}
.nv-skl-stage{position:absolute;left:0;right:0;z-index:2;perspective-origin:50% 30%}
.nv-skl-floor{position:absolute;left:-40%;right:-40%;height:420px;transform:rotateX(76deg);transform-origin:50% 0;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,color-mix(in srgb,var(--hue,var(--nv-cy)) 26%,transparent),transparent 70%),repeating-radial-gradient(circle at 50% 0,transparent 0 46px,color-mix(in srgb,var(--nv-cy) 7%,transparent) 46px 47px)}
.nv-skl-slab{position:absolute;left:50%;top:20px;border-radius:18px;box-sizing:border-box;
  background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 40%,rgba(10,15,30,.35));
  border:1px solid var(--nv-edge);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
  padding:18px 18px 16px;display:flex;flex-direction:column;gap:10px;will-change:transform,opacity;cursor:grab;
  box-shadow:inset 0 1px 0 var(--nv-spec);transition:opacity 220ms;outline:none}
.nv-skl-slab.lit{border-color:color-mix(in srgb,var(--h) 70%,transparent);box-shadow:inset 0 1px 0 var(--nv-spec),0 0 0 1px color-mix(in srgb,var(--h) 35%,transparent),0 30px 80px -30px color-mix(in srgb,var(--h) 60%,transparent)}
.nv-skl-slab:focus-visible{outline:2px solid var(--nv-cy);outline-offset:2px}
.nv-skl-art{width:54px;height:54px;border-radius:14px;display:grid;place-items:center;overflow:hidden;flex:none;background:color-mix(in srgb,var(--h) 14%,transparent);border:1px solid color-mix(in srgb,var(--h) 35%,transparent)}
.nv-skl-art svg{width:30px;height:30px;stroke:var(--h);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.nv-skl-art img{width:62px;height:62px;object-fit:cover;margin-top:6px}
.nv-skl-nm{font:700 23px/1 var(--nv-font-ui);letter-spacing:.2em;text-transform:uppercase;margin-top:6px;overflow-wrap:anywhere;color:var(--nv-ink)}
.wide .nv-skl-nm{font-size:28px}
.nv-skl-rl{font:italic 400 15px/1.35 var(--nv-font-serif);color:var(--nv-ink60)}
.nv-skl-st{font:600 10.5px var(--nv-font-mono);letter-spacing:.06em;color:var(--nv-ink40);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nv-skl-st.warn{color:var(--nv-warn)}
.nv-skl-dot{width:7px;height:7px;border-radius:50%;background:var(--nv-ink40);flex-shrink:0}
.nv-skl-dot.on{background:var(--h);animation:nvSklPulse 1.6s ease-out infinite}
@keyframes nvSklPulse{0%{box-shadow:0 0 0 0 var(--h)}100%{box-shadow:0 0 0 7px transparent}}
.nv-skl-slab ul{list-style:none;margin:auto 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.nv-skl-slab li{font:500 12.5px/1.3 var(--nv-font-ui);display:flex;gap:8px;align-items:flex-start;color:var(--nv-ink)}
.nv-skl-tier{flex-shrink:0;width:16px;height:16px;border-radius:5px;display:grid;place-items:center;font:700 9px var(--nv-font-mono);margin-top:1px}
.nv-skl-tier.observe{background:color-mix(in srgb,var(--nv-m-quads) 14%,transparent);color:var(--nv-m-quads)}
.nv-skl-tier.propose{background:color-mix(in srgb,var(--nv-gold) 18%,transparent);color:var(--nv-gold)}
.nv-skl-tier.act{background:color-mix(in srgb,var(--nv-good) 16%,transparent);color:var(--nv-good)}
.nv-skl-count{font:600 11px var(--nv-font-mono);color:var(--nv-ink40);display:flex;justify-content:space-between;gap:8px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px}
.nv-skl-pips{position:absolute;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:5}
.nv-skl-pips i{width:6px;height:6px;border-radius:50%;background:var(--nv-ink40);transition:transform 200ms var(--nv-ease),background 200ms}
.nv-skl-pips i.on{background:var(--hue);transform:scale(1.5)}
.nv-skl-hint{position:absolute;left:16px;right:16px;text-align:center;font:italic 400 13px var(--nv-font-serif);color:var(--nv-ink40);z-index:5;transition:opacity 200ms}
.nv-skl-busy{position:absolute;left:50%;transform:translateX(-50%);z-index:6;font:600 10px var(--nv-font-mono);letter-spacing:.06em;color:var(--hue);background:var(--nv-glass);border:1px solid color-mix(in srgb,var(--hue) 40%,transparent);border-radius:999px;padding:4px 10px;pointer-events:none;text-align:center;line-height:1.4;transition:opacity 200ms}
.nv-skl-chrbox{position:absolute;inset:0;pointer-events:none;z-index:3}
.nv-skl.open .nv-skl-chrbox{z-index:9}
canvas.nv-skl-chr{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.nv-skl-modal{position:absolute;inset:0;z-index:8}
.nv-skl-sheet{position:absolute;left:0;right:0;bottom:0;border-radius:28px 28px 0 0;background:var(--nv-glass2);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);
  border-top:1px solid color-mix(in srgb,var(--hue) 45%,transparent);transform:translateY(105%);overflow-y:auto;display:block;padding:16px 18px 130px;overscroll-behavior:contain;box-sizing:border-box;-webkit-user-select:text;user-select:text}
.wide .nv-skl-sheet{left:auto;top:0 !important;width:560px;max-width:100%;border-radius:0;border-top:0;border-left:1px solid color-mix(in srgb,var(--hue) 45%,transparent);transform:translateX(105%);padding-bottom:40px}
.nv-skl-back{position:absolute;left:16px;top:0;z-index:10;font:600 14px var(--nv-font-ui);color:var(--hue);background:var(--nv-bg1);border:1px solid var(--nv-edge);border-radius:999px;padding:9px 14px;min-height:44px;cursor:pointer}
.nv-skl-sh{display:flex;gap:12px;align-items:center;padding-right:110px;min-height:64px}
.wide .nv-skl-sh{padding-right:0;padding-left:120px}
.nv-skl-sh b{font:700 22px/1 var(--nv-font-ui);letter-spacing:.16em;text-transform:uppercase;color:var(--nv-ink);overflow-wrap:anywhere}
.nv-skl-sh .rl{font:italic 15px var(--nv-font-serif);color:var(--nv-ink60);margin-top:4px}
.nv-skl-tierbar{display:flex;flex-shrink:0;height:8px;border-radius:4px;overflow:hidden;margin:14px 0 4px;gap:2px}
.nv-skl-tierbar i{display:block;height:100%;transform-origin:0 50%;animation:nvSklGrow 500ms var(--nv-ease) both}
@keyframes nvSklGrow{from{transform:scaleX(0)}}
.nv-skl-legend{display:flex;flex-wrap:wrap;gap:12px;font:500 11px var(--nv-font-mono);color:var(--nv-ink60)}
.nv-skl-grp{margin-top:18px}
.nv-skl-grp h4{margin:0 0 8px;font:600 10.5px var(--nv-font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--nv-ink40)}
.nv-skl-sk{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:11px 12px;border-radius:12px;margin-bottom:6px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--hue) 9%,transparent),transparent 70%);border:1px solid rgba(255,255,255,.06);
  animation:nvSklRise 380ms var(--nv-ease) both;animation-delay:calc(var(--i)*45ms)}
@keyframes nvSklRise{from{opacity:0;transform:translateY(10px)}}
.nv-skl-sk .nv-skl-tier{width:22px;height:22px;font-size:10px}
.nv-skl-sk .t{font:500 14px/1.35 var(--nv-font-ui);color:var(--nv-ink);overflow-wrap:anywhere}
.nv-skl-sk .m{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.nv-skl-tag{font:600 10px var(--nv-font-mono);letter-spacing:.04em;padding:2px 6px;border-radius:5px;border:1px solid rgba(255,255,255,.1);color:var(--nv-ink60)}
.nv-skl-tag.vault{color:var(--nv-vi);border-color:color-mix(in srgb,var(--nv-vi) 40%,transparent)}
.nv-skl-tag.inbox{color:var(--nv-cy);border-color:color-mix(in srgb,var(--nv-cy) 40%,transparent)}
.nv-skl-tag.web{color:var(--nv-m-calves);border-color:color-mix(in srgb,var(--nv-m-calves) 40%,transparent)}
.nv-skl-tag.calendar{color:var(--nv-m-shoulders);border-color:color-mix(in srgb,var(--nv-m-shoulders) 40%,transparent)}
.nv-skl-tag.health,.nv-skl-tag.bank{color:var(--nv-good);border-color:color-mix(in srgb,var(--nv-good) 40%,transparent)}
.nv-skl-sk.notyet{background:none;border-style:dashed;opacity:.62}
.nv-skl-sk.notyet .t::after{content:"not yet";margin-left:8px;font:600 9.5px var(--nv-font-mono);letter-spacing:.06em;color:var(--nv-warn)}
.nv-skl-sk.arrive{animation:nvSklArrive 700ms var(--nv-ease) both}
@keyframes nvSklArrive{0%{opacity:0;transform:translateY(-14px) scale(.97);border-color:var(--hue)}60%{opacity:.9;border-color:var(--hue)}}
.nv-skl-sug{position:relative;border-radius:14px;padding:12px 12px 10px;margin-bottom:8px;border:1px solid color-mix(in srgb,var(--nv-gold) 30%,transparent);
  background:linear-gradient(160deg,color-mix(in srgb,var(--nv-gold) 9%,transparent),transparent 60%);animation:nvSklRise 380ms var(--nv-ease) both}
.nv-skl-sug .t{font:500 14px/1.35 var(--nv-font-ui);color:var(--nv-ink);overflow-wrap:anywhere}
.nv-skl-sug .why{display:flex;gap:10px;align-items:center;margin-top:8px}
.nv-skl-sug .n{font:700 22px/1 var(--nv-font-ui);color:var(--nv-gold);font-variant-numeric:tabular-nums;min-width:28px;text-align:center}
.nv-skl-sug .ev{font:italic 13.5px/1.35 var(--nv-font-serif);color:var(--nv-ink60);flex:1;min-width:0;overflow-wrap:anywhere}
.nv-skl-kind{display:inline-flex;align-items:center;gap:5px;font:600 9.5px var(--nv-font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--nv-gold)}
.nv-skl-ans{display:flex;gap:8px;margin-top:8px;align-items:center;justify-content:flex-end}
.nv-skl-ans button{width:44px;height:44px;border-radius:50%;border:1px solid var(--nv-edge);background:var(--nv-glass);display:grid;place-items:center;cursor:pointer;transition:transform 120ms}
.nv-skl-ans button:active{transform:scale(.94)}
.nv-skl-ans svg{width:18px;height:18px;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.nv-skl-ans .yes svg{stroke:var(--nv-good)} .nv-skl-ans .no svg{stroke:var(--nv-ink60)}
.nv-skl-said{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font:italic 13px var(--nv-font-serif);color:var(--nv-ink60);margin:2px 0 10px;animation:nvSklRise 320ms var(--nv-ease) both}
.nv-skl-consult{display:flex;align-items:center;margin-top:6px;flex-wrap:wrap;row-gap:8px}
.nv-skl-cn{display:flex;align-items:center;gap:6px;font:500 12px var(--nv-font-ui);color:var(--nv-ink);padding:5px 9px 5px 6px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-right:6px}
.nv-skl-cn i{width:10px;height:10px;border-radius:50%}
.nv-skl-runs{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:3px;align-items:end;height:46px;margin-top:8px}
.nv-skl-runs i{display:block;background:var(--hue);border-radius:2px;opacity:.75;transform-origin:50% 100%;animation:nvSklGrow2 420ms var(--nv-ease) both;animation-delay:calc(var(--i)*30ms)}
@keyframes nvSklGrow2{from{transform:scaleY(0)}}
.nv-skl-src{font:400 11px var(--nv-font-mono);color:var(--nv-ink40);margin-top:6px;overflow-wrap:anywhere}
.nv-skl-say{font:italic 14px/1.4 var(--nv-font-serif);color:var(--nv-ink)}
.nv-skl-skel{height:10px;border-radius:4px;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.12),rgba(255,255,255,.05));background-size:200% 100%;animation:nvSklShim 1.4s linear infinite}
@keyframes nvSklShim{to{background-position:-200% 0}}
@media (prefers-reduced-motion: reduce){
  .nv-skl,.nv-skl-sk,.nv-skl-sug,.nv-skl-said,.nv-skl-runs i,.nv-skl-tierbar i,.nv-skl-sk.arrive{animation:nvSklFade 200ms ease both !important}
  .nv-skl-dot.on,.nv-skl-skel{animation:none}
}
@keyframes nvSklFade{from{opacity:0}}
`;

const ICON_YES = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
const ICON_NO = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

function Slab({ a, i, portrait, loading, demo, g }) {
  const st = a.status;
  return (
    <div className="nv-skl-slab" data-i={i} tabIndex={0} role="button" aria-label={`${a.name}, open skill set`}
      style={{ '--h': a.hue, width: g.SW, height: g.SH, marginLeft: -g.SW / 2 }}>
      <div className="nv-skl-art">
        {portrait ? <img alt="" src={portrait} /> : <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ART[a.art] }} />}
      </div>
      <div className="nv-skl-nm">{a.name}</div>
      <div className="nv-skl-rl">{a.role}</div>
      {loading ? <div className="nv-skl-skel" style={{ width: '60%' }} /> : (
        <div className={`nv-skl-st${st.kind === 'offline' ? ' warn' : ''}`}>
          <span className={`nv-skl-dot${st.kind === 'working' ? ' on' : ''}`} />{st.label}{demo && <span className="demo">DEMO</span>}
        </div>
      )}
      {loading ? (
        <ul>{[80, 64, 72].map((w) => <li key={w}><div className="nv-skl-skel" style={{ width: `${w}%` }} /></li>)}</ul>
      ) : a.skillCount ? (
        <ul>{a.top3.map((s) => <li key={s.text}><span className={`nv-skl-tier ${TIER_CLASS[s.tier]}`}>{s.tier.toUpperCase()}</span>{s.text}</li>)}</ul>
      ) : (
        <ul><li style={{ color: 'var(--nv-ink60)', fontStyle: 'italic' }}>{a.skillCount === 0 ? 'No skills on the registry for him yet.' : st.kind === 'offline' ? 'His skills come from your Mac.' : ''}</li></ul>
      )}
      <div className="nv-skl-count">
        <span>{a.skillCount == null ? (loading ? '' : 'skills unknown') : `${a.skillCount} skill${a.skillCount === 1 ? '' : 's'}`}</span>
        <span>{a.canBeAsked == null ? '' : a.canBeAsked ? 'can be consulted' : 'answers only you'}</span>
      </div>
    </div>
  );
}

function SkillRow({ s, k, notYet, arrive }) {
  return (
    <div className={`nv-skl-sk${notYet ? ' notyet' : ''}${arrive ? ' arrive' : ''}`} style={{ '--i': k }}>
      <span className={`nv-skl-tier ${notYet ? 'observe' : TIER_CLASS[s.tier]}`}>{notYet ? '·' : s.tier.toUpperCase()}</span>
      <div><div className="t">{s.text}</div>
        {!notYet && s.tags?.length > 0 && <div className="m">{s.tags.map((t) => <span key={t} className={`nv-skl-tag ${t}`}>{t === 'inbox' ? 'Inbox' : t}</span>)}</div>}
      </div>
    </div>
  );
}

function Suggestion({ s, a, v }) {
  if (s.answered === 'accepted') {
    return (
      <div className="nv-skl-said" role="status">
        <span>{s.busy ? 'Filing it on the build list…' : 'On the build list. He can’t do it until it is built.'}</span>
        {!s.busy && <TextAction compact onClick={() => v.undo(s, a.id)}>Undo</TextAction>}
        {!s.busy && <TextAction compact tone="faint" onClick={() => v.talk(s, a.id)}>Talk it over</TextAction>}
      </div>
    );
  }
  if (s.answered === 'dismissed') {
    return (
      <div className="nv-skl-said" role="status">
        <span>Dismissed. This evidence won’t raise it again for 60 days.</span>
        {!s.busy && <TextAction compact onClick={() => v.undo(s, a.id)}>Undo</TextAction>}
      </div>
    );
  }
  return (
    <div className="nv-skl-sug">
      <span className="nv-skl-kind">{s.kindLabel}</span>
      <div className="t">{s.skill}</div>
      <div className="why"><span className="n">{s.count}</span><span className="ev">{s.evidence}</span></div>
      <div className="nv-skl-src">Counted from: {s.source}{v.demo && <span className="demo">DEMO</span>}</div>
      <div className="nv-skl-ans">
        <TextAction compact tone="faint" onClick={() => v.talk(s, a.id)} style={{ marginRight: 'auto' }}>Talk it over</TextAction>
        <button type="button" className="no" aria-label="Dismiss this suggestion" onClick={() => v.dismiss(s, a.id)}>{ICON_NO}</button>
        <button type="button" className="yes" aria-label="Add to the build list" onClick={() => v.accept(s, a.id)}>{ICON_YES}</button>
      </div>
    </div>
  );
}

function Sheet({ a, v }) {
  const c = a.tierCounts;
  let k = 0;
  const open = a.suggestions;
  return (
    <>
      <div className="nv-skl-sh"><div><b>{a.name}</b><div className="rl">{a.role}</div></div></div>
      {a.groups && a.skillCount > 0 && (
        <>
          <div className="nv-skl-tierbar" aria-hidden="true">
            <i style={{ flex: c.o, background: 'var(--nv-m-quads)' }} /><i style={{ flex: c.p, background: 'var(--nv-gold)' }} /><i style={{ flex: c.a, background: 'var(--nv-good)' }} />
          </div>
          <div className="nv-skl-legend"><span>{c.o} observe · reads, reports</span><span>{c.p} propose · waits for your yes</span><span>{c.a} act on approval</span></div>
        </>
      )}
      {a.skillsNote && <div className="nv-skl-grp"><div className="nv-skl-say">{a.skillsNote}</div>
        {a.skillCount === 0 && <div className="nv-skl-src">Source: Wiki/Library/Nova Skills.md (server/lib/skills.js)</div>}</div>}
      {(a.groups || []).map((grp) => (
        <div className="nv-skl-grp" key={grp.name}><h4>{grp.name}</h4>{grp.skills.map((s) => <SkillRow key={s.text} s={s} k={k++} />)}</div>
      ))}
      {a.notYet.length > 0 && (
        <div className="nv-skl-grp"><h4>Not yet</h4>
          {a.notYet.map((s) => <SkillRow key={s.text} s={s} k={k++} notYet arrive={s.arrive} />)}
        </div>
      )}
      {(open.length > 0 || v.state === 'live' || v.state === 'demo') && (
        <div className="nv-skl-grp"><h4>Suggested for him{v.demo && <span className="demo">DEMO</span>}</h4>
          {open.map((s) => <Suggestion key={s.id} s={s} a={a} v={v} />)}
          {open.length === 0 && <div className="nv-skl-say" style={{ color: 'var(--nv-ink60)' }}>Nothing to suggest yet. A suggestion needs real evidence: what you asked that nobody could do, what you keep doing by hand, or what you handle in the Inbox yourself.</div>}
          <div className="nv-skl-src">He never grants himself a skill. A tick adds it to the build list; it works only once it is built.</div>
          <div className="nv-skl-src">{v.lendNote}</div>
        </div>
      )}
      {v.askable.length > 0 && (
        <div className="nv-skl-grp"><h4>Who he can ask</h4>
          <div className="nv-skl-consult">{v.askable.filter((x) => x.name !== a.name).map((x) => <span key={x.id} className="nv-skl-cn"><i style={{ background: x.hue }} />{x.name}</span>)}</div>
          <div className="nv-skl-src">{a.canBeAsked ? 'He can also be asked by them.' : 'He is not on the consult rail yet, so the others cannot ask him.'} Source: server/lib/consult.js</div>
        </div>
      )}
      <div className="nv-skl-grp"><h4>Last two weeks{v.demo && <span className="demo">DEMO</span>}</h4>
        {a.neverRun ? <div className="nv-skl-say">Hasn’t run yet. His first run will show here.</div>
          : a.runs ? <div className="nv-skl-runs" role="img" aria-label={`Records by day, last two weeks: ${a.runs.join(', ')}`}>
            {a.runs.map((r, j) => <i key={j} style={{ '--i': j, height: `${r ? Math.min(46, 8 + r * 9) : 2}px`, opacity: r ? 0.75 : 0.25 }} />)}
          </div>
            : <div className="nv-skl-say" style={{ color: 'var(--nv-ink60)' }}>{v.state === 'offline' ? 'Runs are counted on your Mac, which can’t be reached.' : 'Not counted yet.'}</div>}
        <div className="nv-skl-src">Source: Inbox records by kind (orgMap.js KIND_BEING), via /api/skillsets</div>
      </div>
    </>
  );
}

export function SkillSets({ v }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const sheetRef = useRef(null);
  const stageRef = useRef(null);
  const [wide, setWide] = useState(false);
  const [height, setHeight] = useState(700);
  const [portraits, setPortraits] = useState({});
  const [no3d, setNo3d] = useState(false);
  const [shownId, setShownId] = useState(null);
  // the centred agent, for React's own lines (the working line); the arc
  // itself never re-renders
  const [centreIdx, setCentreIdx] = useState(0);
  const g = wide ? G_MAC : G_PHONE;
  const N = v.agents.length;
  const rm = reducedMotion();

  // the carousel lives in refs: a drag never re-renders React
  const car = useRef({ pos: 0, vel: 0, target: 0, raf: 0, dragging: false, settled: true, busy: false });
  const vRef = useRef(v); vRef.current = v;
  const centreRef = useRef(0);
  const widthRef = useRef(0); // read once per resize, never per frame (no forced reflow)
  const gRef = useRef(g); gRef.current = g;
  const shownRef = useRef(null); shownRef.current = shownId;
  const cur = () => clamp(Math.round(car.current.pos), 0, N - 1);

  // size: the phone fills the screen under the switch; the Mac is a wide panel
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth; widthRef.current = w;
      const isWide = w >= 900;
      setWide(isWide);
      const gg = isWide ? G_MAC : G_PHONE;
      setHeight(Math.max(gg.MINH, Math.min(isWide ? 920 : 860, window.innerHeight - (isWide ? 160 : 150))));
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- the layout of the slabs, and the slots the stage draws agents at ----
  const layout = () => {
    const root = rootRef.current; if (!root) return;
    const gg = gRef.current, c = car.current, open = !!shownRef.current;
    const slabs = root.querySelectorAll('.nv-skl-slab');
    slabs.forEach((el, i) => {
      const d = i - c.pos, a = (d * gg.STEP * Math.PI) / 180, ad = Math.abs(d);
      el.style.transform = `translate3d(${Math.sin(a) * gg.R}px,0,${(Math.cos(a) - 1) * gg.R}px) rotateY(${d * gg.STEP * 0.9}deg)`;
      el.style.opacity = ad > 3.2 ? 0 : open && i === cur() ? 0.12 : Math.max(0, 1 - ad * 0.28);
      el.style.zIndex = String(100 - Math.round(ad * 10));
      el.classList.toggle('lit', ad < 0.5);
      el.style.pointerEvents = ad > 2.5 || open ? 'none' : 'auto';
    });
    const hueNow = vRef.current.agents[cur()]?.hue || 'var(--nv-cy)';
    root.style.setProperty('--hue', hueNow);
    const ci = c.settled && !c.dragging ? cur() : -1;
    if (ci !== centreRef.current) { centreRef.current = ci; setCentreIdx(ci); }
    root.querySelectorAll('.nv-skl-pips i').forEach((p, i) => p.classList.toggle('on', i === cur()));
    stageRef.current?.invalidate();
  };
  const slots = () => {
    const root = rootRef.current; if (!root) return [];
    const gg = gRef.current, c = car.current, W = widthRef.current || root.offsetWidth, sh = STAGE_H(gg);
    const ox = W / 2, oy = sh * 0.3, footY = 20 + gg.SH;
    return vRef.current.agents.map((a, i) => {
      const d = i - c.pos, ad = Math.abs(d), centre = ad < 0.5;
      const side = centre ? 1 : d > 0 ? -1 : 1;
      const ang = (d * gg.STEP * Math.PI) / 180, ry = (d * gg.STEP * 0.9 * Math.PI) / 180;
      const lx = side * 0.36 * gg.SW;
      const X = Math.sin(ang) * gg.R + lx * Math.cos(ry);
      const Z = (Math.cos(ang) - 1) * gg.R - lx * Math.sin(ry);
      const k = gg.P / (gg.P - Z);
      const x = ox + X * k, y = gg.STAGE_T + oy + (footY - oy) * k;
      const openId = shownRef.current;
      const visible = openId ? a.id === openId : ad < 2.6 && x > -30 && x < W + 30;
      return {
        id: a.id, index: i, x, y, k, scale: gg.CH / 1.1, w: gg.SW * k, h: gg.SH * k, side, centre, visible,
        dragging: c.dragging || !c.settled,
        slab: { x: W / 2 - gg.SW / 2, y: gg.STAGE_T + 20, w: gg.SW, h: gg.SH },
      };
    });
  };

  // ---- the stage: one renderer for every agent, built once per mount ----
  useEffect(() => {
    if (!canvasRef.current || v.state === 'loading') return undefined;
    let s;
    // a fresh canvas per mount: a disposed renderer loses its context for good
    const cv = document.createElement('canvas');
    cv.className = 'nv-skl-chr'; cv.setAttribute('aria-hidden', 'true');
    canvasRef.current.appendChild(cv);
    try {
      s = createSkillStage(cv, { tokensFrom: rootRef.current, reduceMotion: rm, pixelRatio: 2 });
    } catch {
      cv.remove();
      setNo3d(true);
      return undefined;
    }
    stageRef.current = s;
    if (import.meta.env?.DEV) window.__novaSkillStage = s;
    // portraits for the slab art, once, before the first live frame
    try { setPortraits(s.portraits(vRef.current.agents.map((a) => a.id))); } catch { /* the marks stay */ }
    const root = rootRef.current;
    s.resize(root.offsetWidth, root.offsetHeight);
    s.setSlots(slots);
    s.setAgents(vRef.current.agents.map((a) => ({ id: a.id, working: !!a.working, canPlay: a.canPlay })));
    const ro = new ResizeObserver(() => { s.resize(root.offsetWidth, root.offsetHeight); layout(); });
    ro.observe(root);
    const io = new IntersectionObserver((es) => s.setActive(es.some((e) => e.isIntersecting)), { threshold: 0.05 });
    io.observe(root);
    const onVis = () => s.setActive(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      s.dispose(); stageRef.current = null; cv.remove();
      if (import.meta.env?.DEV) window.__novaSkillStage = null;
    };
  }, [v.state === 'loading']); // eslint-disable-line react-hooks/exhaustive-deps

  // what each agent may do changes only with the records
  const sig = v.agents.map((a) => `${a.id}:${a.working ? 1 : 0}${a.canPlay ? 1 : 0}`).join(',');
  useEffect(() => {
    stageRef.current?.setAgents(v.agents.map((a) => ({ id: a.id, working: !!a.working, canPlay: a.canPlay })));
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { layout(); });

  // the Mac's sidebar opens this on an agent: centre him without a spin
  useEffect(() => {
    if (!v.focusId) return;
    const i = v.agents.findIndex((a) => a.id === v.focusId);
    if (i >= 0 && i !== cur()) { car.current.pos = i; car.current.target = i; layout(); }
  }, [v.focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the spring that settles the arc ----
  const spring = () => {
    const c = car.current;
    cancelAnimationFrame(c.raf); c.settled = false;
    if (rm) { c.pos = c.target; c.vel = 0; c.settled = true; layout(); return; }
    let t0 = performance.now();
    const tick = (t) => {
      const dt = Math.min(0.032, (t - t0) / 1000); t0 = t;
      const w = (2 * Math.PI) / 0.4, f = -w * w * (c.pos - c.target) - 2 * w * c.vel;
      c.vel += f * dt; c.pos += c.vel * dt; layout();
      if (Math.abs(c.pos - c.target) > 0.001 || Math.abs(c.vel) > 0.01) c.raf = requestAnimationFrame(tick);
      else { c.pos = c.target; c.vel = 0; c.settled = true; layout(); }
    };
    c.raf = requestAnimationFrame(tick);
  };

  // ---- pointer: drag 1:1, momentum projection on release, rubber-banded ends ----
  const drag = useRef({ sx: 0, sp: 0, hist: [], moved: false, downEl: null });
  const rb = (o) => (o * 0.55) / (1 + 0.55 * o);
  const rootXY = (e) => { const r = rootRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onDown = (e) => {
    const c = car.current;
    if (shownRef.current || c.busy || e.target.closest('.nv-skl-modal')) return;
    const s = stageRef.current;
    if (s) { const [px, py] = rootXY(e); const hitId = s.hit(px, py); if (hitId) { s.tap(hitId); return; } }
    c.dragging = true; drag.current = { sx: e.clientX, sp: c.pos, hist: [[e.timeStamp, e.clientX]], moved: false, downEl: e.target.closest('.nv-skl-slab') };
    cancelAnimationFrame(c.raf);
    try { rootRef.current.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const onMove = (e) => {
    const c = car.current, d = drag.current;
    if (!c.dragging) return;
    const dx = e.clientX - d.sx;
    if (Math.abs(dx) > 8 && !d.moved) { d.moved = true; c.settled = false; }
    if (!d.moved) return;
    let p = d.sp - dx / gRef.current.PX;
    if (p < 0) p = -rb(-p);
    if (p > N - 1) p = N - 1 + rb(p - (N - 1));
    c.pos = p; layout();
    d.hist.push([e.timeStamp, e.clientX]); if (d.hist.length > 5) d.hist.shift();
  };
  const onUp = () => {
    const c = car.current, d = drag.current;
    if (!c.dragging) return;
    c.dragging = false;
    if (!d.moved) {
      const i = d.downEl ? Number(d.downEl.dataset.i) : -1;
      if (i >= 0) { if (i !== cur()) { c.target = i; spring(); } else vRef.current.open(vRef.current.agents[i].id); }
      return;
    }
    const [t0, x0] = d.hist[0], [t1, x1] = d.hist[d.hist.length - 1];
    const vel = -((x1 - x0) / gRef.current.PX) / Math.max(0.016, (t1 - t0) / 1000);
    c.target = clamp(Math.round(c.pos + (vel * 0.998) / (1 - 0.998) / 1000), 0, N - 1);
    c.vel = vel; spring();
  };
  const onCancel = () => { const c = car.current; c.dragging = false; c.target = cur(); spring(); };
  const onKey = (e) => {
    const c = car.current;
    if (shownRef.current) { if (e.key === 'Escape') vRef.current.close(); return; }
    if (e.key === 'ArrowRight') { c.target = Math.min(N - 1, cur() + 1); spring(); }
    if (e.key === 'ArrowLeft') { c.target = Math.max(0, cur() - 1); spring(); }
    if (e.key === 'Enter' && e.target.classList?.contains('nv-skl-slab')) vRef.current.open(vRef.current.agents[Number(e.target.dataset.i)].id);
  };

  // ---- the open and the close, driven by the history level (v.openId) ----
  const sheetAt = (q) => {
    const el = sheetRef.current; if (!el) return;
    if (rm) { el.style.transform = 'none'; el.style.opacity = String(q); return; }
    el.style.opacity = '1';
    el.style.transform = gRef.current.wide ? `translateX(${(1 - q) * 105}%)` : `translateY(${(1 - q) * 105}%)`;
  };
  const rideSpot = (q) => {
    const root = rootRef.current, gg = gRef.current, W = root.offsetWidth, H = root.offsetHeight;
    if (gg.wide) { const left = W - Math.min(gg.SHEET_W, W) + (1 - q) * Math.min(gg.SHEET_W, W) * 1.05; return { x: left + 70, y: 150 }; }
    return { x: W - 62, y: gg.SHEET_T + (1 - q) * (H - gg.SHEET_T) * 1.05 };
  };
  useEffect(() => {
    const id = v.openId;
    const c = car.current;
    if (id && id !== shownRef.current) {
      const i = v.agents.findIndex((a) => a.id === id);
      if (i < 0) return;
      c.pos = i; c.target = i; c.busy = true;
      shownRef.current = id; setShownId(id);
      requestAnimationFrame(() => {
        sheetAt(0); layout();
        const s = stageRef.current;
        if (!s) { sheetAt(1); c.busy = false; return; }
        s.ride({ id, dir: 1, dur: rm ? 240 : 950, spot: rideSpot, sheetAt, arc: gRef.current.wide ? 120 : 70, done: () => { c.busy = false; } });
      });
    } else if (!id && shownRef.current) {
      const was = shownRef.current;
      const s = stageRef.current;
      c.busy = true;
      const finish = () => { shownRef.current = null; setShownId(null); c.busy = false; layout(); rootRef.current?.querySelector(`.nv-skl-slab[data-i="${cur()}"]`)?.focus({ preventScroll: true }); };
      if (!s) { finish(); return; }
      s.ride({ id: was, dir: -1, dur: rm ? 240 : 950, spot: rideSpot, sheetAt, arc: gRef.current.wide ? 120 : 70, done: finish });
    }
  }, [v.openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const centre = v.agents[centreIdx] || null;
  const shown = shownId ? v.agents.find((a) => a.id === shownId) : null;
  const loading = v.state === 'loading';
  const sh = STAGE_H(g);
  const workingCentre = !shown && centre?.working && centre.jobLine;

  return (
    <section ref={rootRef} className={`nv-skl${wide ? ' wide' : ''}${shown ? ' open' : ''}`} aria-label="The agents and their skill sets"
      style={{ height }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onKeyDown={onKey}>
      <style>{CSS}</style>
      <div className="nv-skl-top">
        <b>Agents</b>
        <span>{v.workingLine || (v.state === 'offline' ? 'CAN’T REACH YOUR MAC' : v.state === 'error' ? 'COULD NOT READ YOUR MAC' : '')}{v.demo && <span className="demo">DEMO</span>}</span>
      </div>
      <div ref={canvasRef} className="nv-skl-chrbox" style={{ display: no3d || loading ? 'none' : 'block' }} />
      <div className="nv-skl-stage" style={{ top: g.STAGE_T, height: sh, perspective: `${g.P}px` }}>
        <div className="nv-skl-floor" style={{ top: g.wide ? 470 : 380 }} />
        {v.agents.map((a, i) => <Slab key={a.id} a={a} i={i} g={g} portrait={portraits[a.id]} loading={loading} demo={v.demo} />)}
      </div>
      <div className="nv-skl-pips" style={g.wide ? { bottom: 40 } : { top: g.STAGE_T + 528 }} aria-hidden="true">{v.agents.map((a) => <i key={a.id} />)}</div>
      <div className="nv-skl-hint" style={{ ...(g.wide ? { bottom: 12 } : { top: g.STAGE_T + 552 }), opacity: shown ? 0 : 1 }}>
        {loading ? 'Reading the roster from your Mac…' : no3d ? 'Swipe to turn. Tap a panel to open it. (This browser gives no WebGL, so the agents are drawn as their marks.)' : 'Swipe to turn. Tap a panel to open it, or tap its agent.'}
      </div>
      {workingCentre && (
        <div className="nv-skl-busy" style={{ top: g.STAGE_T + 20 + g.SH + 14, maxWidth: 'calc(100% - 40px)' }}>
          WORKING: {centre.jobLine}{v.demo && <span className="demo">DEMO</span>}
        </div>
      )}
      {!shown && v.state === 'offline' && (
        <div className="nv-skl-busy" style={{ top: g.STAGE_T + 20 + g.SH + 14, color: 'var(--nv-warn)', borderColor: 'color-mix(in srgb, var(--nv-warn) 40%, transparent)' }}>
          Whether he’s working is unknown, so he stands still.
        </div>
      )}
      {v.state === 'error' && !shown && (
        <div className="nv-skl-busy" style={{ top: g.STAGE_T + 20 + g.SH + 14, pointerEvents: 'auto' }}>
          The skill list could not be read. <TextAction compact onClick={v.retry}>Try again</TextAction>
        </div>
      )}
      {shown && (
        /* the open sheet is a history level: the back swipe and Back close it */
        <div className="nv-skl-modal" role="dialog" aria-modal="true" aria-label={`${shown.name}'s skill set`} data-edge-page="">
          <button type="button" className="nv-skl-back" data-edge-close="" onClick={v.close} style={{ top: g.wide ? 16 : 0 }}>‹ Agents</button>
          <div ref={sheetRef} className="nv-skl-sheet" style={g.wide ? null : { top: g.SHEET_T }}>
            <Sheet a={shown} v={v} />
          </div>
        </div>
      )}
    </section>
  );
}
