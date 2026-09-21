import { useState } from 'react';
import { Elapsed } from './Elapsed.jsx';
import { css } from './css.js';
import { TabIcon } from './TabIcon.jsx';
import { Interactive } from './Interactive.jsx';
import { VoiceHalo } from './VoiceHalo.jsx';
import { NovaCore } from './NovaCore.jsx';
import { Eyebrow, isAppleStyle } from './Controls.jsx';

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";

// Mobile chrome, dock edition: the old 14-tab horizontal scroller made every
// trip a hunt. Now a floating pill dock — the user's top THREE tabs (first
// three in the Settings tab order), a raised ✦ Capture at true center, and
// More opening a grid sheet of every screen. Positions never move, so muscle
// memory forms; capture — the most important act in a second brain — owns
// the throne. Token-drawn, so all three design styles wear it natively.

// Six slots plus the core has to survive a 390pt iPhone: 6x44 + 52 + margins
// lands near 360, where 52px each would have overflowed. Tap targets stay
// comfortably past the 44pt minimum because the padding is vertical.
function DockTab({ t, size = 21 }) {
  return (
    // Interactive, not a bare div, for ONE reason: on iOS the only thing that
    // produces a Taptic is his finger landing on the invisible switch overlay
    // Interactive renders for an element given a haptic word. A plain <div
    // onClick> cannot buzz, and a programmatic haptic() call cannot either —
    // haptic() takes the retick branch on iOS and retick returns immediately
    // for a one-pulse word. So the dock — the control he touches more than any
    // other in the app — was silent by construction, not by omission.
    <Interactive as="div" onClick={t.go} haptic="tick" onPointerDown={t.warm} base={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '44px', padding: '6px 4px', cursor: 'pointer', borderRadius: '13px', color: t.active ? 'var(--nv-acc)' : 'var(--nv-ink40)', background: t.active ? 'var(--nv-acc-bg)' : 'none' }}>
      <TabIcon name={t.screen} size={size} />
      <span style={css(`font:600 9px ${R};letter-spacing:.01em;white-space:nowrap`)}>{t.label}</span>
      {t.count != null && (
        <span style={css("position:absolute;top:1px;right:3px;min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:var(--nv-gold);color:#1a1206;font:var(--nv-micro-s);display:flex;align-items:center;justify-content:center")}>{t.count}</span>
      )}
    </Interactive>
  );
}

export function MobileChrome({ v }) {
  const [moreOpen, setMoreOpen] = useState(false);
  // the top bar's chips: under the Apple styles a tinted pill in the UI face,
  // under Command the bordered mono chip they always were (see Controls.jsx)
  const apple = isAppleStyle();
  const chip = (color) => (apple
    ? `cursor:pointer;display:flex;align-items:center;gap:6px;font:600 12.5px ${R};padding:7px 12px;border:1px solid transparent;border-radius:999px;color:${color};background:color-mix(in srgb, ${color} 14%, transparent)`
    : `cursor:pointer;display:flex;align-items:center;gap:6px;font:600 9px ${M};letter-spacing:.08em;padding:6px 10px;border:1px solid color-mix(in srgb, ${color} 45%, transparent);border-radius:8px;color:${color};background:color-mix(in srgb, ${color} 08%, transparent)`);
  const dockTabs = v.tabs.slice(0, 5);
  const activeInDock = dockTabs.some((t) => t.active);

  return (
    <>
      <div className="nv-liquid nv-liquid-flush" style={css("position:fixed;top:0;left:0;right:0;z-index:70;display:flex;align-items:center;gap:10px;padding:calc(6px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left))")}>
        {/* ONE SLOT, TWO LAYERS. The wordmark is the compact-title slot: as the
            screen's large title scrolls under the bar the wordmark yields to it,
            and returns when he scrolls back. Scroll-driven in index.css; both
            layers ride the same tappable element so either takes him home. */}
        <Interactive as="span" onClick={v.goHome} haptic="tick" className="nv-title-slot" base={css('cursor:pointer')}>
          <span className="nv-wordmark" style={css(`font:700 17px ${R};letter-spacing:.16em;color:var(--nv-ink);white-space:nowrap`)}>
            NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span>
          </span>
          <span className="nv-compact-title" aria-hidden="true">{v.compactTitle}</span>
        </Interactive>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: apple ? `600 11px ${R}` : `500 9px ${M}`, letterSpacing: apple ? '.02em' : '.12em', color: v.statusChip.color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.statusChip.color, animation: v.statusChip.label === 'LIVE' ? 'novaPulse 2s infinite var(--nv-anim)' : 'none' }}></span>{v.statusChip.label}</span>
        {/* C3 — in-flight work, visible: a spinner chip while agents run */}
        {v.jobTray.jobs.length > 0 && (
          <Interactive as="span" onClick={v.jobTray.toggle} haptic="tick" base={css(`${chip('var(--nv-cy)')}`)}>
            <span style={css("width:9px;height:9px;border-radius:50%;border:1.5px solid var(--nv-cy);border-top-color:transparent;animation:spin 1s linear infinite")}></span>
            {v.jobTray.jobs.length}
          </Interactive>
        )}
        {v.outboxCount > 0 && (
          <Interactive as="span" onClick={v.openOutbox} haptic="tick" base={css(chip('var(--nv-gold)'))}>⇪ {v.outboxCount}</Interactive>
        )}
        <Interactive as="span" onClick={v.openPalette} haptic="tick" base={css(apple
          ? `cursor:pointer;font:600 13px ${R};padding:8px 14px;border:1px solid transparent;border-radius:999px;color:var(--nv-acc);background:var(--nv-acc-bg)`
          : `cursor:pointer;font:500 10px ${M};padding:7px 12px;border:1px solid var(--nv-acc-border);border-radius:8px;color:var(--nv-acc);background:var(--nv-acc-bg)`)}>{apple ? '✦ Ask' : '✦ ASK'}</Interactive>
        <Interactive as="span" onClick={v.goSettings} aria-label="Settings" haptic="tick" base={css(apple
          ? `cursor:pointer;font-size:15px;line-height:1;padding:8px 11px;border:1px solid transparent;border-radius:999px;color:${v.isSettings ? 'var(--nv-acc)' : 'var(--nv-ink60)'};background:${v.isSettings ? 'var(--nv-acc-bg)' : 'color-mix(in srgb, var(--nv-ink) 8%, transparent)'}`
          : `cursor:pointer;font-size:14px;line-height:1;padding:7px 10px;border:1px solid ${v.isSettings ? 'var(--nv-acc-border)' : 'var(--nv-edge)'};border-radius:8px;color:${v.isSettings ? 'var(--nv-acc)' : 'var(--nv-ink60)'}`)}>⚙</Interactive>
      </div>
      {/* THE JOB TRAY LIVES OUTSIDE THE BAR (17 Sep 2026).
          It is a full-screen `position: fixed` overlay, and it used to be a
          CHILD of the bar. That made the bar the one place in the chrome that
          could not be given a transform — a transform makes an element the
          containing block for its fixed descendants, so this would have
          positioned against the BAR instead of the viewport. It has no reason
          to be nested; moving it out is what lets the bar be composited
          properly. See the transform note in index.css. */}
      {v.jobTray.open && v.jobTray.jobs.length > 0 && (
        <div onClick={v.jobTray.toggle} style={css("position:fixed;inset:0;z-index:110")}>
          <div onClick={(e) => e.stopPropagation()} style={css("position:absolute;top:56px;right:12px;width:min(340px,92vw);border:1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent);border-radius:14px;background:color-mix(in srgb, var(--nv-bg2) 94%, black);box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;animation:fadeUp var(--nv-dur-base) var(--nv-ease)")}>
            <Eyebrow style={{ padding: '11px 15px 8px' }}>Running now — Nova pings you when each lands</Eyebrow>
            {v.jobTray.jobs.map((j) => (
              <Interactive as="div" key={j.id} onClick={j.go || v.jobTray.goInbox} haptic="tick" base={css("cursor:pointer;display:flex;align-items:center;gap:10px;padding:11px 15px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent);font:400 12.5px var(--nv-font-ui);color:var(--nv-ink)")}>
                <span style={css("flex:none;width:9px;height:9px;border-radius:50%;border:1.5px solid var(--nv-cy);border-top-color:transparent;animation:spin 1s linear infinite")}></span>
                <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>
                  {j.label}{j.note ? <span style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}> · {j.note}</span> : null}
                </span>
                <Elapsed job={j} />
              </Interactive>
            ))}
          </div>
        </div>
      )}

      {/* the More sheet — every screen, grid of silhouettes, one tap */}
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={css("position:fixed;inset:0;z-index:74;background:rgba(8,5,12,.6);backdrop-filter:blur(4px)")}>
          <div onClick={(e) => e.stopPropagation()} className="nv-liquid nv-liquid-thick nv-materialize" style={css("position:absolute;left:0;right:0;bottom:0;border-radius:22px 22px 0 0;padding:18px 16px calc(20px + env(safe-area-inset-bottom))")}>
            <div style={css("width:36px;height:4px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 22%, transparent);margin:0 auto 14px")}></div>
            {v.frequentTabs?.length > 0 && (
              <>
                <Eyebrow style={{ padding: '0 6px 8px' }}>Frequent</Eyebrow>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px 2px', marginBottom: '14px' }}>
                  {v.frequentTabs.map((t) => (
                    <Interactive as="div" key={'f' + t.screen} onClick={() => { setMoreOpen(false); t.go(); }} haptic="tick" base={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '11px 4px', cursor: 'pointer', borderRadius: '14px', color: 'var(--nv-acc)', background: 'var(--nv-acc-bg)' }}>
                      <TabIcon name={t.screen} size={24} />
                      <span style={css(`font:550 10.5px ${R};white-space:nowrap`)}>{t.label}</span>
                    </Interactive>
                  ))}
                </div>
                <Eyebrow style={{ padding: '0 6px 8px' }}>All screens</Eyebrow>
              </>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px 2px' }}>
              {v.tabs.map((t) => (
                <Interactive as="div" key={t.screen} onClick={() => { setMoreOpen(false); t.go(); }} haptic="tick" base={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '11px 4px', cursor: 'pointer', borderRadius: '14px', color: t.active ? 'var(--nv-acc)' : 'var(--nv-ink60)', background: t.active ? 'var(--nv-acc-bg)' : 'none' }}>
                  <TabIcon name={t.screen} size={24} />
                  <span style={css(`font:550 10.5px ${R};white-space:nowrap`)}>{t.label}</span>
                  {t.count != null && (
                    <span style={css("position:absolute;top:6px;right:calc(50% - 26px);min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:var(--nv-gold);color:#1a1206;font:var(--nv-micro-s);display:flex;align-items:center;justify-content:center")}>{t.count}</span>
                  )}
                </Interactive>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* the floating dock — [t1 t2 t3 ✦ t4 t5 More]: THREE either side of the
          core, so the row is symmetrical about it. Five one-tap screens (the
          sixth slot is More). Reorder them in Settings → Tab order. The
          raised centre button opens
          VOICE: talking is the fastest way in, and the command palette is
          still a tap away on the top bar (✦ ASK) and ⌘K on desktop. */}
      <div className="nv-liquid nv-liquid-dock" style={css("position:fixed;left:50%;transform:translateX(-50%);bottom:calc(6px + min(env(safe-area-inset-bottom), 34px));z-index:72;display:flex;align-items:center;gap:2px;padding:7px 10px;border-radius:999px")}>
        {dockTabs.slice(0, 3).map((t) => <DockTab key={t.screen} t={t} />)}
        {/* THE mini Nova icon — his ask: tapping it starts talking right
            here, natively, without opening the Voice section (long-press
            still goes there). The halo breathes with real audio. */}
        <Interactive onClick={v.startLiveTalk} onLongPress={v.holdNovaText} aria-label="Talk to Nova"
          base={{ position: 'relative', width: '54px', height: '54px', margin: '0 3px', flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            // the bottom-right core's own treatment, moved in here: a dark
            // well with a thin lit edge, NOT a filled accent disc. The solid
            // cyan fill is what made the core look washed-out and glitchy.
            // A WELL IN THE GLASS, not a hole through it (22 Sep 2026). The
            // near-black fill plus a 4px dark ring read as a black disc punched
            // into the dock — the one thing on the pill that was not glass. The
            // orb still needs a darker ground to glow against, so this is a
            // deeper tint of the same material with the bright edge every other
            // glass surface has, and the outer ring is gone.
            background: 'color-mix(in srgb, var(--nv-void) 62%, transparent)',
            border: `1px solid ${v.novaSpeaking || v.novaListening || v.novaTalkOn ? 'var(--nv-acc-border)' : 'rgba(255,255,255,.28)'}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), inset 0 0 14px -4px rgba(255,255,255,.35), 0 10px 26px -10px rgba(0,0,0,.75)' }}>
          <VoiceHalo speaking={v.novaSpeaking} listening={v.novaListening} inset="-6px" />
          {v.novaListening && (
            <span aria-hidden="true" style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', border: '2px solid var(--nv-cy)', opacity: 0.7, animation: 'novaPulse 1.6s infinite var(--nv-anim)' }}></span>
          )}
          {/* ONE Nova icon on the phone, and it is this one: his chosen core,
              always drawn (never the ✦ glyph), live-dynamic while talking */}
          <NovaCore size={46} variant="mini" engine={v.coreStyle} speaking={v.novaSpeaking} listening={v.novaListening} style={{ pointerEvents: 'none' }} />
        </Interactive>
        {dockTabs.slice(3, 5).map((t) => <DockTab key={t.screen} t={t} />)}
        <Interactive as="div" onClick={() => setMoreOpen(true)} haptic="tick" base={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '44px', padding: '6px 4px', cursor: 'pointer', borderRadius: '14px', color: moreOpen || !activeInDock ? 'var(--nv-acc)' : 'var(--nv-ink40)' }}>
          <TabIcon name="more" size={21} />
          <span style={css(`font:600 9px ${R};white-space:nowrap`)}>More</span>
        </Interactive>
      </div>
    </>
  );
}
