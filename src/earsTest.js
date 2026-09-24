// "TEST NOVA'S EARS" — ten seconds on his own phone that settle whether the
// recording path hears him, where the browser engine never did. Records until
// he pauses (or 8s), sends it to the Mac, and shows the words that came back.
// Nothing is asked and nothing is filed: this only listens and reports.
import { openRecording, transcribeRecording, recorderSupported } from './recorder.js';

const MAX_MS = 8000;
const HOLD_MS = 1500;   // a pause this long after speech ends the test early

// onUpdate({ running, stage, text, error, ms, meter })
export async function runEarsTest(onUpdate) {
  if (!recorderSupported()) {
    onUpdate({ running: false, error: 'This browser cannot record audio, so Nova’s own ears cannot work here.' });
    return;
  }
  onUpdate({ running: true, stage: 'Say something, like “what did I eat today”…' });
  let handle;
  try {
    handle = await openRecording();
  } catch (e) {
    onUpdate({ running: false, error: e?.name === 'NotAllowedError'
      ? 'The microphone was refused. Allow it for Nova in iOS Settings, then try again.'
      : `The microphone would not open: ${e?.message || e}` });
    return;
  }
  const started = Date.now();
  let lastLoud = null;
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      const v = handle.vad();
      if (v.speaking) lastLoud = Date.now();
      const done = Date.now() - started >= MAX_MS || (lastLoud && Date.now() - lastLoud >= HOLD_MS);
      if (done) { clearInterval(iv); resolve(); }
    }, 100);
  });
  onUpdate({ running: true, stage: 'Sending it to your Mac…' });
  const meter = handle.blind() ? 'blind' : handle.vad().heardAny ? 'heard' : 'silent';
  const blob = await handle.stop();
  try {
    const out = await transcribeRecording(blob, { vad: meter });
    onUpdate({ running: false, text: out.text, ms: out.ms, meter, bytes: blob.size });
  } catch (e) {
    onUpdate({ running: false, error: e.message, meter, bytes: blob.size });
  }
}
