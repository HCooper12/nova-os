// NOVA'S EYES ON THE MAC (8 Nov 2026, design/ROSE-STUDY.md phase 6, his
// yes). Rose: "open the camera" / "highlight the pumpkin" / "clear them,
// everything other than pumpkin": labelled boxes drawn over the live feed.
//
// Measured 8 Nov on this Mac (Ollama): Qwen3.5 4B labels a 448 px frame with
// boxes in 4.6 s warm (keyboard, microphone, remote control); the 9B in
// 7.6 s with better words ("black keyboard with blue keycaps"). Boxes come
// back in Qwen's 0–1000 grid as `bbox_2d`. So: the client sends ONE frame,
// code asks the model on this Mac for labels and boxes, checks every box
// is a box, and hands back fractions the client can draw at any size. A
// box the model cannot give is no box. Nothing here speaks; the glass draws
// and Nova says what code found, by count.
//
// `deps.generate` is the test seam (an Ollama /api/generate call).

import { localModelFor } from './modelPrefs.js';

const OLLAMA = () => String(process.env.OLLAMA_HOST || process.env.NOVA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
export const SEE_TIMEOUT_MS = 25_000;

export const PROMPT_OBJECTS = 'List the distinct physical objects in this photo. For each give a short specific label (what the thing is, two or three words) and a bounding box [x1,y1,x2,y2] in 0-1000 image coordinates. JSON array only, no prose: [{"label":"…","bbox_2d":[x1,y1,x2,y2]}]';
export const PROMPT_HELD = 'What object is the person holding or showing to the camera? Answer in at most six words naming the thing as specifically as you can (brand or product if printed on it), or "nothing" if no object is held.';

async function ollamaGenerate({ model, prompt, image, timeoutMs = SEE_TIMEOUT_MS, numPredict = 300 }) {
  const res = await fetch(`${OLLAMA()}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, images: [image], stream: false, think: false, options: { num_predict: numPredict, temperature: 0 } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const j = await res.json();
  return { text: String(j.response || ''), ms: Math.round((j.total_duration || 0) / 1e6) };
}
export const deps = { generate: ollamaGenerate };

/** The model for seeing: the Ask Nova lane's own local model, or the 4B. */
export function seeModel() {
  try { return localModelFor('ask-nova') || 'qwen3.5:4b'; } catch { return 'qwen3.5:4b'; }
}

/** The base64 body of a data URL (or a bare base64 string). Pure. */
export function imageBase64(src) {
  const s = String(src || '').trim();
  const m = s.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return m ? m[1] : (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 100 ? s : null);
}

/** Qwen's answer as boxes in fractions: [{ label, box: [x1,y1,x2,y2] in
 *  0..1 }]. A row without a sane box is dropped; labels trimmed; at most
 *  twelve. Pure. */
export function parseBoxes(text) {
  const t = String(text || '');
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let rows;
  try { rows = JSON.parse(t.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const b = Array.isArray(r?.bbox_2d) ? r.bbox_2d : Array.isArray(r?.box) ? r.box : Array.isArray(r?.bbox) ? r.bbox : null;
    const label = String(r?.label || r?.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!b || b.length !== 4 || !label) continue;
    const n = b.map(Number);
    if (n.some((x) => !Number.isFinite(x))) continue;
    // 0–1000 grid, or already fractions
    const scale = n.every((x) => x <= 1.0001) ? 1 : 1000;
    let [x1, y1, x2, y2] = n.map((x) => Math.max(0, Math.min(1, x / scale)));
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    if (x2 - x1 < 0.01 || y2 - y1 < 0.01) continue;
    out.push({ label, box: [x1, y1, x2, y2].map((x) => Number(x.toFixed(4))) });
    if (out.length >= 12) break;
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const singular = (w) => w.replace(/(ies)$/, 'y').replace(/(sses|xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

/** The boxes whose label matches a thing he named ("the pumpkin", "keyboard
 *  and the coffee cup"): a word in common, singular or plural. Pure. */
export function pickBoxes(boxes, wanted) {
  const names = String(wanted || '').split(/\s*(?:,|\band\b|\bor\b|\bplus\b)\s*/i).map(norm).map((s) => s.replace(/^(?:the|a|an|my|that|this) /, '')).filter(Boolean);
  if (!names.length) return boxes;
  return boxes.filter((b) => {
    const have = new Set(norm(b.label).split(' ').map(singular));
    return names.some((n) => n.split(' ').map(singular).some((w) => w.length > 2 && have.has(w)));
  });
}

/** Load the seeing model now (the camera just opened), so the first look
 *  does not pay the load. Never throws. */
export async function warmSee({ model = seeModel(), generate = deps.generate } = {}) {
  try {
    const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const r = await generate({ model, prompt: 'Say ok.', image: px, numPredict: 3, timeoutMs: 60_000 });
    return { ok: true, model, ms: r.ms };
  } catch (e) { return { ok: false, model, error: String(e?.message || e) }; }
}

/** Look at one frame. `want` narrows to the things he named. Never throws:
 *  { boxes, all, held, model, ms } or { error }. */
export async function see(image, { want = null, held = false, model = seeModel(), generate = deps.generate } = {}) {
  const b64 = imageBase64(image);
  if (!b64) return { error: 'no image to look at' };
  try {
    if (held) {
      const r = await generate({ model, prompt: PROMPT_HELD, image: b64, numPredict: 40 });
      const text = r.text.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
      return { held: /^nothing\b/i.test(text) ? null : text.slice(0, 80), model, ms: r.ms };
    }
    const r = await generate({ model, prompt: PROMPT_OBJECTS, image: b64 });
    const all = parseBoxes(r.text);
    const boxes = want ? pickBoxes(all, want) : all;
    return { boxes, all, model, ms: r.ms, ...(want && !boxes.length ? { miss: `nothing in view matched "${want}"` } : {}) };
  } catch (e) {
    return { error: /abort|timeout/i.test(String(e?.message)) ? `the model on this Mac took longer than ${Math.round(SEE_TIMEOUT_MS / 1000)} s to look` : String(e?.message || e) };
  }
}

/** The line Nova says, in code's words. Pure. */
export function seeLine(result, { want = null } = {}) {
  if (!result) return '';
  if (result.error) return `I couldn't look: ${result.error}.`;
  if ('held' in result) return result.held ? `That looks like ${result.held}.` : 'I can\'t see anything being held.';
  const n = (result.boxes || []).length;
  if (want) return n ? `Boxed ${n === 1 ? 'it' : `${n} of them`}.` : `I can't find ${want} in view.`;
  return n ? `${n} thing${n === 1 ? '' : 's'} in view.` : 'Nothing I can name in view.';
}
