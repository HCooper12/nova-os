// The spoken log — everything CODE says with Nova's voice, so the MODEL
// always knows what "it" said.
//
// The failure this exists to prevent (observed live, 17 Aug 2026): the
// Morning Show told him "nearest is 'Distillation — 5 pages woven into the
// graph'", he asked "what do you mean by distillation?", and the model —
// which had never seen those words — flatly denied saying them. Two brains
// behind one face. Every code-authored utterance (show beats, reflex
// answers, greetings) lands here, and todayLocalContext carries the recent
// tail into every ask on both lanes, phrased so the model OWNS those lines.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url'; // never URL.pathname — repo path has a space
import path from 'node:path';

// honors NOVA_DATA_DIR like every sibling store (the healthInsight precedent)
// — the third hard-coded path the mechanical sweep found; the item-by-item
// audit had seen two
const FILE = path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'spoken-log.json');
const CAP = 60;

async function load() {
  try { return JSON.parse(await readFile(FILE, 'utf8')).lines || []; } catch { return []; }
}

export async function logSpoken(source, text) {
  const clean = (text || '').toString().trim();
  if (!clean) return;
  const lines = await load();
  lines.push({ at: new Date().toISOString(), source, text: clean.slice(0, 300) });
  while (lines.length > CAP) lines.shift();
  await mkdir(path.dirname(FILE), { recursive: true }).catch(() => {});
  await writeFile(FILE, JSON.stringify({ lines }, null, 2));
}

// The context block: recent code-authored lines, oldest first, with clock
// times — phrased in second person so the model treats them as its own.
export async function recentSpokenBlock({ withinMs = 6 * 3600e3, max = 12 } = {}) {
  const cutoff = Date.now() - withinMs;
  const lines = (await load()).filter((l) => new Date(l.at).getTime() > cutoff).slice(-max);
  if (!lines.length) return null;
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return 'LINES YOU (NOVA) SPOKE RECENTLY VIA YOUR OWN AUTOMATIONS (briefs, reflex answers — he heard these in YOUR voice; own them as things you said, never deny them):\n'
    + lines.map((l) => `- [${fmt(l.at)} ${l.source}] "${l.text}"`).join('\n');
}
