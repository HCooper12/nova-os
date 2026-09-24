import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// SPEECH TO TEXT, the way the watch toolchain already does it: prefer Groq's
// Whisper (fast, cheap), fall back to OpenAI's, both keyed from
// ~/.config/watch/.env — one key store, one preference order, so a voice note
// in Telegram is transcribed exactly as a video's audio would be.

const ENV_PATH = () => process.env.NOVA_WHISPER_ENV || path.join(os.homedir(), '.config', 'watch', '.env');

// KEY=VALUE lines, quotes stripped, comments ignored. Pure.
export function parseEnvKeys(text) {
  const out = {};
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// Groq first, OpenAI second, honestly nothing otherwise. Pure.
export function pickBackend(env) {
  if (env?.GROQ_API_KEY) return { backend: 'groq', key: env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3' };
  if (env?.OPENAI_API_KEY) return { backend: 'openai', key: env.OPENAI_API_KEY, url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1' };
  return null;
}

export async function loadWhisperBackend() {
  try { return pickBackend(parseEnvKeys(await readFile(ENV_PATH(), 'utf8'))); } catch { return null; }
}

// The audio file → its text. Throws with the honest reason: no key, or the
// API said no. Node's own fetch/FormData/Blob — no dependency.
export async function transcribeAudio(filePath, { mime = 'audio/ogg', language = 'en' } = {}) {
  // no vocabulary prompt: this also reads other people's videos, where his
  // words are the wrong bias (and a prompt is what Whisper repeats into silence)
  return transcribeBuffer(await readFile(filePath), { mime, language, name: path.basename(filePath), prompt: '' });
}

// The upload's type → the extension Whisper judges the bytes by. Both APIs
// read the FILENAME, not the Content-Type: an iPhone's AAC recording sent as
// "audio" is refused, the same bytes sent as "audio.m4a" are heard. Pure.
export function audioExtension(mime) {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (m === 'audio/mp4' || m === 'audio/x-m4a' || m === 'audio/m4a' || m === 'audio/aac' || m === 'video/mp4') return 'm4a';
  if (m === 'audio/webm' || m === 'video/webm') return 'webm';
  if (m === 'audio/ogg' || m === 'audio/opus') return 'ogg';
  if (m === 'audio/wav' || m === 'audio/x-wav' || m === 'audio/wave') return 'wav';
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'mp3';
  if (m === 'audio/flac') return 'flac';
  return 'm4a';   // what an iPhone records, and what a Shortcut's Record Audio sends
}

// WHAT WHISPER SAYS TO SILENCE. Fed a breath, a car, or nothing at all, it
// does not return nothing — it returns the most common line in its training
// captions: "Thank you.", "Thanks for watching!". Sent on as his words, Nova
// would answer a question he never asked. Dropped only when it is the WHOLE
// transcript; the same words inside a real sentence are his. Pure.
const SILENCE_LINES = new Set([
  'thank you', 'thank you very much', 'thanks for watching', 'thank you for watching',
  'thanks for listening', 'you', 'bye', 'bye bye', 'okay', 'so', 'hmm', 'um',
  'subtitles by the amara org community', 'please subscribe', '',
]);
export function cleanTranscript(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  // sentence by sentence: silence comes back repeated ("Thank you. Thank you.")
  const bare = (x) => x.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = t.split(/[.!?…]+/).map(bare).filter(Boolean);
  return sentences.every((x) => SILENCE_LINES.has(x)) ? '' : t;
}

// Words Whisper would otherwise hear as something else. A prompt biases
// spelling, it does not add content: "Nova" instead of "Noah", his own
// vocabulary instead of the nearest common word.
const VOCAB_PROMPT = 'Nova, Hayden. Push, pull, legs, RPE, protein, macros, Todoist, Coach, Leader.';

// Bytes in hand (an upload, a Shortcut's recording) → text. `name` carries the
// extension; when absent it is derived from the type.
// `spoke`: the client's level meter heard real speech in this recording, so a
// bare "Thank you." is him thanking Nova, not Whisper filling silence.
export async function transcribeBuffer(buf, { mime = 'audio/mp4', language = 'en', name = '', prompt = VOCAB_PROMPT, spoke = false } = {}) {
  const be = await loadWhisperBackend();
  if (!be) throw new Error('no transcription key is configured (~/.config/watch/.env: GROQ_API_KEY or OPENAI_API_KEY)');
  if (!buf?.length) throw new Error('the recording arrived empty');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), name || `speech.${audioExtension(mime)}`);
  form.append('model', be.model);
  form.append('language', language);
  if (prompt) form.append('prompt', prompt);
  form.append('response_format', 'json');
  const started = Date.now();
  const r = await fetch(be.url, { method: 'POST', headers: { Authorization: `Bearer ${be.key}` }, body: form, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${be.backend} transcription failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const j = await r.json();
  const raw = String(j.text || '').replace(/\s+/g, ' ').trim();
  return { text: spoke ? raw : cleanTranscript(raw), raw, backend: be.backend, ms: Date.now() - started };
}
