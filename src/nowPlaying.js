// NOVA IN THE REAL DYNAMIC ISLAND — while she is talking and he has left.
//
// His ask, 25 Sep 2026: when Nova is speaking and he leaves the app, show her
// icon in the Dynamic Island so he can see she is still talking, and tap it to
// come back. A web app cannot draw in the hardware island. iOS can, for any
// app that is playing audio: that is the Now Playing activity — artwork on the
// left, a moving waveform on the right, and a tap that opens the app. So Nova
// tells the system what is playing (the Media Session API) and iOS draws the
// rest.
//
// What this does NOT decide is whether iOS keeps a home-screen app's audio
// running once he leaves; speechResume.js measures that, and nothing here
// assumes it. It only makes sure that WHEN audio is playing, the island says
// "Nova" with her face, not "localhost" with a blank square — and that the
// island's pause button actually stops her.
//
// Only Nova's <audio> path shows up in Now Playing; the Web Audio buffer path
// and the browser's own speech synthesis do not. Setting metadata for them is
// harmless and costs nothing.

const art = () => {
  const at = (p) => { try { return new URL(p, document.baseURI).href; } catch { return p; } };
  return [
    { src: at('icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
    { src: at('icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
  ];
};

const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator
  && typeof window !== 'undefined' && typeof window.MediaMetadata === 'function';

// The line under her name: the start of what she is saying, cut at a word.
export function nowPlayingLine(text, max = 64) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Speaking';
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,.;:—–-]+$/, '')}…`;
}

let current = '';

export function nowPlayingSpeaking(text, onStop) {
  if (!supported()) return;
  const line = nowPlayingLine(text);
  try {
    if (line !== current) {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: 'Nova', artist: line, album: 'Nova OS', artwork: art() });
      current = line;
    }
    navigator.mediaSession.playbackState = 'playing';
    for (const action of ['pause', 'stop']) {
      try { navigator.mediaSession.setActionHandler(action, () => onStop?.()); } catch { /* action unsupported */ }
    }
  } catch { /* the platform declined; the audio still plays */ }
}

export function nowPlayingIdle() {
  if (!supported()) return;
  current = '';
  try {
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
    for (const action of ['pause', 'stop']) {
      try { navigator.mediaSession.setActionHandler(action, null); } catch { /* action unsupported */ }
    }
  } catch { /* nothing to clear */ }
}
