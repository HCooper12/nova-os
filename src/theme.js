// Nova appearance controller. The tokens themselves live in index.css as
// CSS custom properties per data-nv-theme block; this module only flips the
// root attributes and persists the choice. "Calm" is a modifier, not a
// theme — it layers over any theme (its CSS block comes last, so it wins).
const THEME_KEY = 'novaos.theme';
const CALM_KEY = 'novaos.calm';
const CORE_KEY = 'novaos.core';
const STYLE_KEY = 'novaos.style';

export const NOVA_THEMES = [
  { value: 'command', label: 'Command', hint: 'the flagship — cyan HUD over the void' },
  { value: 'observatory', label: 'Observatory', hint: 'gold and bone — the classic Nova, evolved' },
  { value: 'ember', label: 'Ember', hint: 'molten copper — the forge at night' },
  // designed for the Apple-family styles; Settings only offers it there
  { value: 'daylight', label: 'Daylight', hint: 'the white study — light grouped ground, Apple system hues', appleOnly: true },
];

// Style is orthogonal to theme: the theme picks the palette, the style picks
// the design language it's drawn in. Both compose (Ember × Apple works).
// 'cupertino' = the Apple skin PLUS restructured layouts (grouped lists,
// native-app rhythm) — same features, same data, different bones.
export const NOVA_STYLES = [
  { value: 'command', label: 'Command Core', hint: 'the HUD — glow, brackets, mono telemetry' },
  { value: 'apple', label: 'Apple skin', hint: 'calm glass, SF type, silhouette icons — the classic layout' },
  { value: 'cupertino', label: 'Apple layout', hint: 'the full restructure — grouped lists, native rhythm; every feature intact' },
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

export function applyAppearance(theme, calm, style = getNovaStyle()) {
  const root = document.documentElement;
  if (theme === 'command') root.removeAttribute('data-nv-theme');
  else root.setAttribute('data-nv-theme', theme);
  if (calm) root.setAttribute('data-nv-calm', '1');
  else root.removeAttribute('data-nv-calm');
  if (style === 'command') root.removeAttribute('data-nv-style');
  else root.setAttribute('data-nv-style', style);
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(CALM_KEY, calm ? '1' : '0');
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    /* best-effort */
  }
}
