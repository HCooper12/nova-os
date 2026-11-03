// HOW HEAVY IS THE GLASS, ON HIS PHONE (3 Nov 2026). Every measurement of
// the liquid glass so far was Chrome on the Mac (design/audits/2026-11-02-
// fluidity-audit.md, "Glass"); WebKit composites backdrop-filter its own way,
// so what it costs on his iPhone was never known. This measures it there.
//
// On each screen it is given, it scrolls the page down and back the same way
// three times, glass on, glass off, glass on again (the repeat shows how much
// of a difference is the order, not the glass), and times every frame the
// phone draws with requestAnimationFrame. Glass off is a data attribute on
// <html> that index.css reads to drop every backdrop-filter for the run only;
// nothing is saved and the attribute is always removed, even on an error.
//
// What it cannot see: frames the compositor drops without the main thread
// noticing show up only as a longer gap, which is exactly what it counts.

export const SCROLL_MS = 2400;
const SETTLE_MS = 900;
const OFF_ATTR = 'data-nv-glass-meter-off';

const raf = () => new Promise((r) => requestAnimationFrame(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** Frame intervals in ms, a pure reading: p50, p95, longest, and how many
 *  frames were missed against the display's own refresh (an interval of 2.6
 *  refreshes is 2 missed frames). Exported for the test. */
export function readFrames(intervals, refreshMs) {
  const xs = intervals.filter((x) => x > 0 && x < 1000);
  const missed = refreshMs ? xs.reduce((n, x) => n + Math.max(0, Math.round(x / refreshMs) - 1), 0) : null;
  return { frames: xs.length, p50: r1(q(xs, 0.5)), p95: r1(q(xs, 0.95)), longest: r1(xs.length ? Math.max(...xs) : null), missed };
}

// the display's refresh, from a still half second: the median gap
async function refreshOf() {
  const xs = [];
  let last = await raf();
  const end = last + 500;
  while (last < end) { const t = await raf(); xs.push(t - last); last = t; }
  return q(xs, 0.5) || 16.7;
}

// down and back over SCROLL_MS, eased, driven per frame; the gaps recorded
async function scrollPass(main) {
  const max = Math.max(0, main.scrollHeight - main.clientHeight);
  const depth = Math.min(1800, max);
  const xs = [];
  const start = await raf();
  let last = start;
  for (;;) {
    const t = await raf();
    xs.push(t - last);
    last = t;
    const k = Math.min(1, (t - start) / SCROLL_MS);
    main.scrollTop = depth * Math.sin(Math.PI * k);
    if (k >= 1) break;
  }
  main.scrollTop = 0;
  return { xs, depth };
}

const panesOn = () => {
  let n = 0;
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el);
    const f = cs.backdropFilter || cs.webkitBackdropFilter;
    if (f && f !== 'none') {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight && r.width > 0) n++;
    }
  }
  return n;
};

/**
 * measureGlass({ screens, go, onStage }) -> report
 *   screens  the screen ids to measure, in order
 *   go(id)   brings that screen up (App.navigate)
 *   onStage(text) what it is doing now, for the Check page
 */
export async function measureGlass({ screens, go, onStage = () => {} }) {
  const root = document.documentElement;
  const out = { at: new Date().toISOString(), dpr: devicePixelRatio, ua: navigator.userAgent, refreshMs: null, screens: [] };
  try {
    for (const id of screens) {
      onStage(`Opening ${id}`);
      go(id);
      await wait(SETTLE_MS);
      const main = document.querySelector('main');
      if (!main) { out.screens.push({ id, error: 'no page to scroll' }); continue; }
      out.refreshMs = out.refreshMs || r1(await refreshOf());
      const row = { id, panes: panesOn(), passes: [] };
      // one untimed pass first: a screen's first scroll pays for images and
      // rows arriving, which is not the glass (a 217 ms frame on Home's first
      // timed pass, Chrome, 3 Nov)
      onStage(`${id}: warming up`);
      await scrollPass(main);
      await wait(250);
      for (const glass of [true, false, true]) {
        onStage(`${id}: scrolling, glass ${glass ? 'on' : 'off'}`);
        if (glass) root.removeAttribute(OFF_ATTR); else root.setAttribute(OFF_ATTR, '1');
        await wait(250);
        const { xs, depth } = await scrollPass(main);
        row.depth = depth;
        row.passes.push({ glass, ...readFrames(xs, out.refreshMs) });
        await wait(250);
      }
      out.screens.push(row);
    }
  } finally {
    root.removeAttribute(OFF_ATTR);
  }
  return out;
}

/** One line per screen, in his words: what the glass costs in missed frames. */
export function glassSummary(report) {
  return (report?.screens || []).map((s) => {
    if (s.error) return { id: s.id, ok: false, line: s.error };
    const [on1, off, on2] = s.passes;
    const on = Math.round(((on1.missed || 0) + (on2.missed || 0)) / 2);
    const hz = report.refreshMs ? Math.round(1000 / report.refreshMs) : null;
    return {
      id: s.id,
      ok: on <= (off.missed || 0) + 2,
      line: `${s.panes} glass panes on screen. Missed frames in a ${SCROLL_MS / 1000} s scroll: ${on} with glass, ${off.missed} without${hz ? ` (display ${hz} Hz)` : ''}. Slowest frame ${Math.max(on1.longest || 0, on2.longest || 0)} ms with glass, ${off.longest} ms without.`,
    };
  });
}
