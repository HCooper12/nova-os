// Nova appearance controller. The tokens themselves live in index.css as
// CSS custom properties per data-nv-theme block; this module only flips the
// root attributes and persists the choice. "Calm" is a modifier, not a
// theme — it layers over any theme (its CSS block comes last, so it wins).
const THEME_KEY = 'novaos.theme';
const CALM_KEY = 'novaos.calm';
const CORE_KEY = 'novaos.core';

export const NOVA_THEMES = [
  { value: 'command', label: 'Command', hint: 'the flagship — cyan HUD over the void' },
  { value: 'observatory', label: 'Observatory', hint: 'gold and bone — the classic Nova, evolved' },
  { value: 'ember', label: 'Ember', hint: 'molten copper — the forge at night' },
];

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

export function applyAppearance(theme, calm) {
  const root = document.documentElement;
  if (theme === 'command') root.removeAttribute('data-nv-theme');
  else root.setAttribute('data-nv-theme', theme);
  if (calm) root.setAttribute('data-nv-calm', '1');
  else root.removeAttribute('data-nv-calm');
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(CALM_KEY, calm ? '1' : '0');
  } catch {
    /* best-effort */
  }
}
