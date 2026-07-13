import { css } from './css.js';

export function Toast({ v }) {
  return (
    <div style={css("position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:10px;border:1px solid rgba(216,181,115,.4);border-radius:11px;padding:11px 18px;background:rgba(24,17,30,.95);box-shadow:0 18px 44px -14px rgba(0,0,0,.9),0 0 30px -10px rgba(216,181,115,.35);animation:fadeUp .3s ease-out")}>
      <span style={css("color:#d8b573")}>✦</span><span style={css("font-size:13px;color:rgba(236,229,218,.9)")}>{v.toast}</span>
    </div>
  );
}
