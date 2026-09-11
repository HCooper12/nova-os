import { useEffect } from 'react';
import { css } from '../css.js';
import { ScreenHead } from '../Controls.jsx';
import { Console } from '../Instruments.jsx';

// THE CONSOLE — his morning brief as five instruments rather than five
// paragraphs. Everything on it is derived server-side from live sources;
// this screen only arranges them and says when one has nothing to draw.
export function ConsoleScreen({ v }) {
  // The console is derived on every call and is the slowest slice in the
  // snapshot (calendar + vault + rotation), so it is fetched when the screen
  // opens rather than relied on having ridden in with the boot payload.
  useEffect(() => {
    if (!v.instruments && !v.instrumentsBusy) v.refreshInstruments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={v.wrapConsole} data-screen-label="Console">
      <ScreenHead numeral="XVIII" label="Console" note="Your day, drawn" />
      <div style={css('margin-top:14px;min-width:0')}>
        <Console data={v.instruments} loading={v.instrumentsBusy} error={v.instrumentsError}
          onRefresh={v.refreshInstruments} />
      </div>
    </div>
  );
}

export default ConsoleScreen;
