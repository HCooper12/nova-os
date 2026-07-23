import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const [manual, setManual] = useState('');
  // Keep the latest onDetected without making it an effect dependency — the app
  // re-renders often and a new onDetected each time used to tear down and
  // re-acquire the camera every render (the old flicker). Acquire once.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let active = true;
    let liveControls = null;
    // Installed iOS PWAs sometimes never grant the live camera, leaving a black
    // frame with no error. If nothing has come up in a few seconds, say so
    // rather than stranding the user on a blank screen.
    const timeout = setTimeout(() => { if (active && !liveControls) setError('camera-timeout'); }, 7000);
    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result, _err, controls) => {
        if (result && active) {
          active = false;
          controls.stop();
          onDetectedRef.current(result.getText());
        }
      }
    ).then((controls) => {
      liveControls = controls;
      if (active) setStarted(true);
      if (!active) controls.stop();
    }).catch((e) => { if (active) setError(e?.message || 'Could not access the camera'); });

    return () => {
      active = false;
      clearTimeout(timeout);
      liveControls?.stop();
    };
  }, []); // acquire the camera exactly once for the scanner's lifetime

  const submitManual = () => {
    const code = manual.replace(/\D/g, '');
    if (code.length >= 6) onDetectedRef.current(code);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan a barcode" style={css("position:fixed;inset:0;background:rgba(10,8,14,.96);z-index:200;display:flex;flex-direction:column")}>
      {/* an always-reachable close, pinned top-right — never let a black camera trap the app */}
      <div style={css("flex:none;display:flex;align-items:center;justify-content:space-between;padding:calc(10px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left))")}>
        <span style={css("font:500 11px var(--nv-font-mono2);letter-spacing:.16em;color:rgba(236,229,218,.6)")}>SCAN A BARCODE</span>
        <Interactive as="span" onClick={onClose} base="cursor:pointer;font:500 12px var(--nv-font-mono2);padding:10px 16px;border-radius:9px;border:1px solid rgba(236,229,218,.28);color:#ece5da">✕ Close</Interactive>
      </div>

      <div style={css("flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:12px 16px 24px")}>
        {!started && !error && <div style={css("font-size:13px;color:rgba(236,229,218,.6)")}>Starting camera…</div>}
        <video ref={videoRef} style={css("width:min(90vw,420px);max-height:52vh;object-fit:cover;border-radius:16px;border:1px solid rgba(236,229,218,.18);background:#000")} muted playsInline />
        {started && !error && <div style={css("font:500 11px var(--nv-font-mono2);letter-spacing:.16em;color:rgba(236,229,218,.55)")}>POINT AT A BARCODE</div>}
        {error && (
          <div style={css("max-width:360px;text-align:center;font-size:12.5px;line-height:1.55;color:#e0a06f")}>
            {error === 'camera-timeout'
              ? "The camera didn't start — installed apps on iPhone can block the live camera. Type the barcode number below, or close this and use “Take photo” to snap the label instead."
              : error}
          </div>
        )}

        {/* manual fallback — barcode lookup works even when the camera won't */}
        <div style={css("margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center")}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitManual(); }}
            inputMode="numeric"
            placeholder="or type the barcode number"
            style={{ width: '220px', maxWidth: '70vw', background: 'var(--nv-well)', border: '1px solid rgba(236,229,218,.22)', borderRadius: '9px', padding: '11px 13px', color: '#ece5da', fontSize: '14px', fontFamily: "var(--nv-font-mono2)", outline: 'none' }}
          />
          <Interactive as="span" onClick={submitManual} base="cursor:pointer;font:600 11px var(--nv-font-mono2);letter-spacing:.06em;padding:11px 16px;border-radius:9px;background:var(--nv-good,#5fe8a8);color:#0a2018" hoverStyle="filter:brightness(1.08)">LOOK UP</Interactive>
        </div>
      </div>
    </div>
  );
}
