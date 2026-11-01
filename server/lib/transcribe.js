import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { localSttConfigured, transcribeLocal } from './sttLocal.js';
import { recordShadow } from './sttShadow.js';

// SPEECH TO TEXT, the way the watch toolchain already does it: prefer Groq's
// Whisper (fast, cheap), fall back to OpenAI's, both keyed from
// ~/.config/watch/.env — one key store, one preference order, so a voice note
// in Telegram is transcribed exactly as a video's audio would be.
// Since 2 Nov 2026 the Mac also has its own ears (lib/sttLocal.js), which
// stand in whenever the cloud cannot be reached; see WHICH EARS below.

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
// API said no (and, since 2 Nov, only when the local ears could not stand in
// either). Node's own fetch/FormData/Blob — no dependency.
// `source` names the door (telegram, …) so shadow mode can measure it; a call
// with no source (another person's video, the repertoire lane) is never
// shadowed, because the 19 Oct measurement is of HIS recordings.
export async function transcribeAudio(filePath, { mime = 'audio/ogg', language = 'en', source = '', device = '', timeoutMs } = {}) {
  // no vocabulary prompt: this also reads other people's videos, where his
  // words are the wrong bias (and a prompt is what Whisper repeats into silence)
  return transcribeBuffer(await readFile(filePath), { mime, language, name: path.basename(filePath), prompt: '', source, device, timeoutMs });
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

// What Whisper returned → his words. With `spoke` (the meter heard speech) a
// bare "Thank you." is kept as his; otherwise the silence lines go. Either
// way a transcript with no letter or digit is never words: Whisper answers a
// quiet clip with "." (measured live, 29 Oct 2026, with X-Vad: heard), and the
// mid-turn read always says heard, so "." could reach Nova as a question. Pure.
export function heardText(raw, { spoke = false } = {}) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return '';
  return spoke ? t : cleanTranscript(t);
}

// Words Whisper would otherwise hear as something else. A prompt biases
// spelling, it does not add content: "Nova" instead of "Noah", his own
// vocabulary instead of the nearest common word.
const VOCAB_PROMPT = 'Nova, Hayden. Push, pull, legs, RPE, protein, macros, Todoist, Coach, Leader.';

// ---------------------------------------------------------------------------
// WHICH EARS (2 Nov 2026). His instruction that day: Nova works with no
// internet and no Claude. Groq's Whisper is internet; the local ears
// (lib/sttLocal.js, whisper-large-v3-turbo on this Mac) are not. His 19 Oct
// yes was to local ears MEASURED on his real recordings before they become
// the default, so the preference is a board-like setting, not a guess:
//
//   NOVA_STT_PROVIDER=groq    the cloud (Groq, else OpenAI) — the default
//                             when the local ears are not installed
//   NOVA_STT_PROVIDER=shadow  the cloud's words are used AND the local ears
//                             hear the same clip in parallel; one comparison
//                             row per turn (lib/sttShadow.js) — the default
//                             once server/voice-stt/setup.sh has been run
//   NOVA_STT_PROVIDER=local   the local ears first, the cloud if they fail
//
// And whatever the setting, a FALLBACK: when the cloud cannot be reached (no
// network, a timeout, a 5xx, a 429, or no key at all) and the local ears are
// installed, they answer, labelled {provider:'local', fallback:true, reason},
// so a turn on a Mac with no internet is heard instead of refused. A 4xx
// about the audio itself is NOT a reason to fall back: the recording is the
// problem, and a second engine would only hide it.
// ---------------------------------------------------------------------------
const PROVIDERS = new Set(['groq', 'local', 'shadow']);
export function sttProvider(env = process.env, configured = localSttConfigured()) {
  const want = String(env?.NOVA_STT_PROVIDER || '').trim().toLowerCase();
  if (PROVIDERS.has(want)) return (want === 'groq' || configured) ? want : 'groq';
  return configured ? 'shadow' : 'groq';
}

// An error that means "the cloud is not there", as opposed to "the cloud
// heard this and said no". Only the first is worth the local ears.
function unreachable(message) {
  const e = new Error(message);
  e.unreachable = true;
  return e;
}

// The cloud call alone: raw text, which backend, how long. Pure of choice.
async function transcribeCloud(buf, { mime, language, name, prompt, timeoutMs }) {
  const be = await loadWhisperBackend();
  if (!be) throw unreachable('no transcription key is configured (~/.config/watch/.env: GROQ_API_KEY or OPENAI_API_KEY)');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), name || `speech.${audioExtension(mime)}`);
  form.append('model', be.model);
  form.append('language', language);
  if (prompt) form.append('prompt', prompt);
  form.append('response_format', 'json');
  const started = Date.now();
  let r;
  try {
    r = await fetch(be.url, { method: 'POST', headers: { Authorization: `Bearer ${be.key}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw unreachable(`${be.backend} did not answer within ${Math.round(timeoutMs / 1000)} s`);
    throw unreachable(`${be.backend} could not be reached (${e?.cause?.code || e?.message || 'network error'})`);
  }
  if (!r.ok) {
    const msg = `${be.backend} transcription failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 160)}`;
    throw (r.status >= 500 || r.status === 429) ? unreachable(msg) : new Error(msg);
  }
  const j = await r.json();
  return { raw: String(j.text || '').replace(/\s+/g, ' ').trim(), backend: be.backend, ms: Date.now() - started };
}

// Bytes in hand (an upload, a Shortcut's recording) → text. `name` carries the
// extension; when absent it is derived from the type.
// `spoke`: the client's level meter heard real speech in this recording, so a
// bare "Thank you." is him thanking Nova, not Whisper filling silence.
// `source`/`device`: which door and which device, for the shadow row only.
// `timeoutMs`: how long the cloud gets before the local ears stand in.
// Every result carries `provider` (groq | openai | local) and `ms`; `backend`
// is kept, same value, for the callers and logs that read it.
export async function transcribeBuffer(buf, { mime = 'audio/mp4', language = 'en', name = '', prompt = VOCAB_PROMPT, spoke = false, source = '', device = '', timeoutMs = 60_000 } = {}) {
  if (!buf?.length) throw new Error('the recording arrived empty');
  const provider = sttProvider();
  const localOpts = { mime, language, prompt, name };
  const fromLocal = (l, extra = {}) => ({ text: heardText(l.text, { spoke }), raw: l.text, backend: 'local', provider: 'local', ms: l.ms, model: l.model, ...extra });
  const fromCloud = (c, extra = {}) => ({ text: heardText(c.raw, { spoke }), raw: c.raw, backend: c.backend, provider: c.backend, ms: c.ms, ...extra });

  if (provider === 'local') {
    try {
      return fromLocal(await transcribeLocal(buf, localOpts));
    } catch (localErr) {
      // he chose local and it failed: the cloud stands in, labelled the same way
      try {
        return fromCloud(await transcribeCloud(buf, { mime, language, name, prompt, timeoutMs }), { fallback: true, reason: localErr.message });
      } catch (cloudErr) {
        throw new Error(`the local transcriber failed (${localErr.message}) and so did the cloud (${cloudErr.message})`);
      }
    }
  }

  // shadow: both start NOW, in parallel; his turn waits only on the cloud
  const shadowing = provider === 'shadow' && !!source;
  const localP = shadowing ? transcribeLocal(buf, localOpts) : null;
  localP?.catch(() => {}); // a failure is recorded on the row, never unhandled
  let cloud;
  try {
    cloud = await transcribeCloud(buf, { mime, language, name, prompt, timeoutMs });
  } catch (cloudErr) {
    if (!cloudErr.unreachable || !localSttConfigured()) throw cloudErr;
    try {
      // the shadow run already started is the fallback: no second pass
      return fromLocal(await (localP || transcribeLocal(buf, localOpts)), { fallback: true, reason: cloudErr.message });
    } catch (localErr) {
      throw new Error(`${cloudErr.message}, and the local transcriber could not stand in (${localErr.message})`);
    }
  }
  if (localP) recordShadow({ groq: { text: cloud.raw, ms: cloud.ms }, localPromise: localP, device, source, bytes: buf.length, backend: cloud.backend });
  return fromCloud(cloud, localP ? { shadow: true } : {});
}
