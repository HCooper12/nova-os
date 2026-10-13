// Nova appearance controller. The tokens themselves live in index.css as
// CSS custom properties per data-nv-theme block; this module only flips the
// root attributes and persists the choice. "Calm" is a modifier, not a
// theme — it layers over any theme (its CSS block comes last, so it wins).
const THEME_KEY = 'novaos.theme';
const CALM_KEY = 'novaos.calm';
const CORE_KEY = 'novaos.core';
const STYLE_KEY = 'novaos.style';
const MATERIAL_KEY = 'novaos.material';
const GLOW_KEY = 'novaos.glow';
const GLOW_QUIET_KEY = 'novaos.glowQuiet';

export const NOVA_THEMES = [
  { value: 'command', label: 'Command', hint: 'the flagship — cyan HUD over the void' },
  { value: 'observatory', label: 'Observatory', hint: 'gold and bone — the classic Nova, evolved' },
  { value: 'ember', label: 'Ember', hint: 'molten copper — the forge at night' },
  // designed for the Apple-family styles; Settings only offers it there
  { value: 'daylight', label: 'Daylight', hint: 'the white study — light grouped ground, Apple system hues', appleOnly: true },
  { value: 'sky', label: 'Sky', hint: 'Apple glass over a sky that follows the hour', appleOnly: true },
];

// Style is orthogonal to theme: the theme picks the palette, the style picks
// the design language it's drawn in. Both compose (Ember × Apple works).
// 'cupertino' = the Apple skin PLUS restructured layouts (grouped lists,
// native-app rhythm) — same features, same data, different bones.
export const NOVA_STYLES = [
  { value: 'command', label: 'Command Core', hint: 'the HUD — glow, brackets, mono telemetry' },
  { value: 'apple', label: 'Apple skin', hint: 'calm glass, SF type, silhouette icons — the classic layout' },
  { value: 'cupertino', label: 'Apple layout', hint: 'the full restructure — grouped lists, native rhythm; every feature intact' },
  { value: 'summary', label: 'Summary', hint: 'the calm Home — one highlight, pinned cards, the Index; glass or solid' },
];

export function getNovaStyle() {
  try {
    const s = localStorage.getItem(STYLE_KEY);
    return NOVA_STYLES.some((x) => x.value === s) ? s : 'command';
  } catch {
    return 'command';
  }
}

// The core is a React prop rather than a CSS token — the two engines live in
// NovaCore.jsx. Blue in every theme either way.
export const NOVA_CORES = [
  { value: 'hologram', label: 'Hologram', hint: 'gyroscopic true-3D — tilted rings, trackers, a living globe' },
  { value: 'filament', label: 'Filament', hint: 'the original — layered circuit-arc nebula' },
];

export function getCoreStyle() {
  try {
    const c = localStorage.getItem(CORE_KEY);
    return NOVA_CORES.some((x) => x.value === c) ? c : 'hologram';
  } catch {
    return 'hologram';
  }
}

export function saveCoreStyle(core) {
  try {
    localStorage.setItem(CORE_KEY, core);
  } catch {
    /* best-effort */
  }
}

export function getNovaTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return NOVA_THEMES.some((x) => x.value === t) ? t : 'command';
  } catch {
    return 'command';
  }
}

export function getCalm() {
  try {
    return localStorage.getItem(CALM_KEY) === '1';
  } catch {
    return false;
  }
}

// The material is a modifier meaningful only under the `summary` style: glass
// = translucent cards over the theme's sky; solid = the theme's pane fill, no
// sky; lit = the same glass, each card lit in its own hue (his ask, 27 Sep:
// the glow his cupertino Home's panes wear, on Nova glass). Same shape as
// every other appearance getter — try/catch around localStorage, default
// when absent or foreign.
// 13 Oct 2026 (mockup 101, his approval): Lit leaves Material and becomes
// the Glow setting below, so the glow works on Glass or Solid. A stored
// 'lit' reads as glass with the glow on in its own colours (getGlow).
export const NOVA_MATERIALS = [
  { value: 'glass', label: 'Glass', hint: 'translucent cards over the sky' },
  { value: 'solid', label: 'Solid', hint: 'the pane fill, no sky' },
];

export function getMaterial() {
  try {
    const m = localStorage.getItem(MATERIAL_KEY);
    if (m === 'lit') return 'glass';
    return NOVA_MATERIALS.some((x) => x.value === m) ? m : 'glass';
  } catch {
    return 'glass';
  }
}

// THE GLOW (13 Oct 2026, his words: "allow there to be an option to toggle
// glow in the settings"). Off · Soft (one colour, quiet) · One colour (the
// lit card) · Its own colours (each card glows in the colours inside it).
// Two quieter switches, both on by default: during a session the glow goes
// soft ("it feels a bit much"), and Fuel's background cards (the plate, the
// rotation, the log) glow softly so the page is "less loud all over".
export const NOVA_GLOWS = [
  { value: 'off', label: 'Off' },
  { value: 'soft', label: 'Soft' },
  { value: 'lit', label: 'One colour' },
  { value: 'dyn', label: 'Its own colours' },
];

export function getGlow() {
  try {
    const g = localStorage.getItem(GLOW_KEY);
    if (NOVA_GLOWS.some((x) => x.value === g)) return g;
    // before the setting existed the glow WAS the Lit material
    return localStorage.getItem(MATERIAL_KEY) === 'lit' ? 'dyn' : 'off';
  } catch {
    return 'off';
  }
}

export function getGlowQuiet() {
  try {
    const q = JSON.parse(localStorage.getItem(GLOW_QUIET_KEY) || 'null');
    return { session: q?.session !== false, back: q?.back !== false };
  } catch {
    return { session: true, back: true };
  }
}

export function applyGlow(glow, quiet = { session: true, back: true }) {
  const root = document.documentElement;
  root.setAttribute('data-nv-glow', glow);
  if (quiet.session) root.setAttribute('data-nv-glow-session', 'quiet'); else root.removeAttribute('data-nv-glow-session');
  if (quiet.back) root.setAttribute('data-nv-glow-back', 'quiet'); else root.removeAttribute('data-nv-glow-back');
  try {
    localStorage.setItem(GLOW_KEY, glow);
    localStorage.setItem(GLOW_QUIET_KEY, JSON.stringify({ session: !!quiet.session, back: !!quiet.back }));
  } catch {
    /* best-effort */
  }
}

// The hour band drives the `sky` theme's gradient and Nova glass's aurora
// shift. Pure arithmetic on a Date — no document access — so it is safe to
// import and test in plain node (src/theme.test.js), the same reason
// src/shelf3d/edition.js keeps its geometry pure.
export function hourBand(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

// Stamps data-nv-hour now, refreshes it every 15 minutes, and again whenever
// the tab comes back into view (a backgrounded tab's timers get throttled or
// paused, so the boundary can otherwise be missed by minutes or hours).
// Idempotent: called once from main.jsx; a second call is a silent no-op so a
// hot-reloaded module or a defensive extra call never stacks a second timer.
let hourClockStarted = false;
export function startHourClock() {
  if (hourClockStarted) return;
  hourClockStarted = true;
  const stamp = () => {
    try {
      document.documentElement.setAttribute('data-nv-hour', hourBand());
    } catch {
      /* best-effort */
    }
  };
  stamp();
  setInterval(stamp, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') stamp();
  });
}

export function applyAppearance(theme, calm, style = getNovaStyle(), material = getMaterial()) {
  const root = document.documentElement;
  if (theme === 'command') root.removeAttribute('data-nv-theme');
  else root.setAttribute('data-nv-theme', theme);
  if (calm) root.setAttribute('data-nv-calm', '1');
  else root.removeAttribute('data-nv-calm');
  if (style === 'command') root.removeAttribute('data-nv-style');
  else root.setAttribute('data-nv-style', style);
  // Unlike theme/style, the material is always stamped — 'glass' is a real,
  // explicit value for index.css to key off, not the absence of an attribute.
  root.setAttribute('data-nv-material', material);
  root.setAttribute('data-nv-hour', hourBand());
  // THE STATUS BAR IS PART OF THE APP (16 Sep 2026). index.html pins
  // theme-color to a single dark #06070d, and Nova ships `daylight` — a LIGHT
  // palette — so choosing it left a black strip above a near-white app on his
  // phone, and the browser chrome to match. Read the ground back out of the
  // token rather than keeping a second table of colours here, so a theme whose
  // --nv-void changes can never drift from its status bar.
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    const ground = getComputedStyle(root).getPropertyValue('--nv-void').trim();
    if (meta && ground) meta.setAttribute('content', ground);
  } catch {
    /* best-effort: a missing meta tag is not worth failing a theme change over */
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(CALM_KEY, calm ? '1' : '0');
    localStorage.setItem(STYLE_KEY, style);
    localStorage.setItem(MATERIAL_KEY, material);
  } catch {
    /* best-effort */
  }
}
