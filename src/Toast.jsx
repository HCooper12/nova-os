import { css } from './css.js';

export function Toast({ v }) {
  // On the phone the toast must clear the fixed bottom tab bar (z 70) —
  // at bottom:26px it covered the tabs for 3.6s after nearly every action.
  const bottom = v.isMobile ? 'calc(76px + env(safe-area-inset-bottom))' : '26px';
  return (
    <div style={{ ...css("position:fixed;left:50%;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);border-radius:10px;padding:11px 18px;background:var(--nv-glass2);backdrop-filter:blur(14px);box-shadow:0 18px 44px -14px rgba(0,0,0,.9),0 0 30px -10px color-mix(in srgb, var(--nv-gold) 35%, transparent);animation:fadeUp .3s ease-out"), bottom }}>
      <span style={css("color:var(--nv-gold)")}>✦</span><span style={css("font:500 13px 'Rajdhani',sans-serif;color:color-mix(in srgb, var(--nv-ink) 90%, transparent)")}>{v.toast}</span>
    </div>
  );
}
