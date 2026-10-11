// REAL-DEVICE FRAME TELEMETRY (11 Oct): desktop Chrome and Playwright WebKit
// both measured the Skill sets at 60 fps while his iPhone recorded ~18 and a
// stalled renderer. The phone now reports what it actually draws, every 5 s,
// and it lands here. Operational data only (server/data/perf/), never the
// vault; the file is capped so it can never grow without bound.
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const perfFile = (name) => path.join(dataRoot(), 'perf', `${name}.jsonl`);
export const PERF_CAP_BYTES = 512 * 1024;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const loop = (l) => (l && typeof l === 'object' ? { p50: num(l.p50), p95: num(l.p95), n: num(l.n), dropped: num(l.dropped), drawMs: num(l.drawMs) } : null);

// only the known fields, bounded: a report can never smuggle anything else in
export function cleanReport(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    at: new Date().toISOString(),
    session: str(b.session, 40),
    main: loop(b.main),
    worker: loop(b.worker),
    centreFps: num(b.centreFps),
    mode: str(b.mode, 16),
    workerAlive: typeof b.workerAlive === 'boolean' ? b.workerAlive : null,
    restarts: num(b.restarts),
    errors: Array.isArray(b.errors) ? b.errors.slice(0, 5).map((e) => str(String(e), 200)) : [],
    dpr: num(b.dpr),
    renderDpr: num(b.renderDpr),
    centre: str(b.centre, 24),
    dragging: typeof b.dragging === 'boolean' ? b.dragging : null,
    ua: str(b.ua, 240),
  };
}

export async function appendPerf(name, body) {
  const file = perfFile(name);
  await mkdir(path.dirname(file), { recursive: true });
  const row = cleanReport(body);
  // the cap: past it, keep the newest half
  try {
    const st = await stat(file);
    if (st.size > PERF_CAP_BYTES) {
      const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
      await writeFile(file, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n');
    }
  } catch { /* first write */ }
  await appendFile(file, JSON.stringify(row) + '\n');
  return row;
}

export async function readPerf(name, limit = 200) {
  try {
    const lines = (await readFile(perfFile(name), 'utf8')).split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
