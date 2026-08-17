// Text-to-speech with two providers behind one contract (text in, mp3 out):
// ElevenLabs when a key is set, otherwise the free local Kokoro sidecar when
// NOVA_TTS_LOCAL=1 (lib/ttsLocal.js). Honest degradation: when neither is
// available, /tts/status says so and the client falls back to the browser's
// built-in speech engine.

import { localTtsEnabled, localVoices, synthesizeLocal } from './ttsLocal.js';

const API_BASE = () => process.env.NOVA_ELEVENLABS_API || 'https://api.elevenlabs.io';
const KEY = () => (process.env.ELEVENLABS_API_KEY || '').trim();
const DEFAULT_VOICE = () => (process.env.ELEVENLABS_VOICE_ID || '').trim();

// Low-latency model tier — voice replies should feel conversational.
const MODEL_ID = 'eleven_turbo_v2_5';

// ElevenLabs wins when keyed — a paid key is an explicit choice.
export function ttsEngine() {
  if (KEY()) return 'elevenlabs';
  if (localTtsEnabled()) return 'local';
  return null;
}

export function ttsConfigured() {
  return ttsEngine() !== null;
}

let voicesCache = { at: 0, voices: null };

export async function listVoices() {
  if (!ttsConfigured()) return [];
  if (ttsEngine() === 'local') return localVoices();
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
  if (!ttsConfigured()) throw new Error('no TTS engine (set ELEVENLABS_API_KEY or NOVA_TTS_LOCAL=1 in server/.env)');
  const clean = (text || '').trim();
  if (!clean) throw new Error('text is required');
  if (clean.length > 2400) throw new Error('text too long for one utterance');
  if (ttsEngine() === 'local') return synthesizeLocal(clean, voiceId);
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
