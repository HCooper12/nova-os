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
  const be = await loadWhisperBackend();
  if (!be) throw new Error('no transcription key is configured (~/.config/watch/.env: GROQ_API_KEY or OPENAI_API_KEY)');
  const form = new FormData();
  form.append('file', new Blob([await readFile(filePath)], { type: mime }), path.basename(filePath));
  form.append('model', be.model);
  form.append('language', language);
  form.append('response_format', 'json');
  const r = await fetch(be.url, { method: 'POST', headers: { Authorization: `Bearer ${be.key}` }, body: form, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${be.backend} transcription failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const j = await r.json();
  return { text: String(j.text || '').trim(), backend: be.backend };
}
