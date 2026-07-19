// ElevenLabs text-to-speech proxy. The API key stays server-side in
// server/.env (ELEVENLABS_API_KEY); the client only ever posts text and gets
// audio back. Honest degradation: when no key is set, /tts/status says so
// and the client falls back to the browser's built-in speech engine.

const API_BASE = () => process.env.NOVA_ELEVENLABS_API || 'https://api.elevenlabs.io';
const KEY = () => (process.env.ELEVENLABS_API_KEY || '').trim();
const DEFAULT_VOICE = () => (process.env.ELEVENLABS_VOICE_ID || '').trim();

// Low-latency model tier — voice replies should feel conversational.
const MODEL_ID = 'eleven_turbo_v2_5';

export function ttsConfigured() {
  return !!KEY();
}

let voicesCache = { at: 0, voices: null };

export async function listVoices() {
  if (!ttsConfigured()) return [];
  if (voicesCache.voices && Date.now() - voicesCache.at < 10 * 60 * 1000) return voicesCache.voices;
  const res = await fetch(`${API_BASE()}/v1/voices`, {
    headers: { 'xi-api-key': KEY() },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs voices → ${res.status}`);
  const data = await res.json();
  const voices = (data.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category || null }));
  voicesCache = { at: Date.now(), voices };
  return voices;
}

export async function synthesize(text, voiceId) {
  if (!ttsConfigured()) throw new Error('ElevenLabs is not configured (set ELEVENLABS_API_KEY in server/.env)');
  const clean = (text || '').trim();
  if (!clean) throw new Error('text is required');
  if (clean.length > 2400) throw new Error('text too long for one utterance');
  let voice = (voiceId || '').trim() || DEFAULT_VOICE();
  if (!voice) {
    const voices = await listVoices();
    if (!voices.length) throw new Error('no voices on this ElevenLabs account');
    voice = voices[0].id;
  }
  const res = await fetch(`${API_BASE()}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: clean,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs synthesis → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// test hook
export function _resetTtsCache() {
  voicesCache = { at: 0, voices: null };
}
