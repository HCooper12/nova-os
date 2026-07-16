import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let active = true;
    let liveControls = null;
    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result, _err, controls) => {
        if (result && active) {
          active = false;
          controls.stop();
          onDetected(result.getText());
        }
      }
    ).then((controls) => { liveControls = controls; if (!active) controls.stop(); })
      .catch((e) => setError(e.message || 'Could not access the camera'));

    return () => {
      active = false;
      liveControls?.stop();
    };
  }, [onDetected]);

  return (
    <div style={css("position:fixed;inset:0;background:rgba(10,8,14,.92);z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px")}>
      <div style={css("font:500 11px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(236,229,218,.65)")}>POINT AT A BARCODE</div>
      <video ref={videoRef} style={css("width:min(92vw,440px);border-radius:16px;border:1px solid rgba(236,229,218,.18);background:#000")} muted playsInline />
      {error && <div style={css("color:#e08f6f;font-size:13px;max-width:340px;text-align:center;line-height:1.5")}>{error}</div>}
      <Interactive as="span" onClick={onClose} base="cursor:pointer;font:500 11px 'JetBrains Mono',monospace;padding:9px 20px;border-radius:8px;border:1px solid rgba(236,229,218,.2);color:rgba(236,229,218,.7)" hoverStyle="border-color:rgba(236,229,218,.4);color:#ece5da">Cancel</Interactive>
    </div>
  );
}
