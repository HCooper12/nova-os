// the same state icons as markup, for the lens, which is drawn outside React
// (it changes per frame under a finger)
const SVG = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const STATE_SVG = {
  done: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  work: SVG('<path d="M12 4a8 8 0 1 1-7.4 5"/>'),
  wait: SVG('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
  pause: SVG('<path d="M9 6.5v11M15 6.5v11"/>'),
  need: SVG('<path d="M12 6v7.5"/><path d="M12 17.5v.5"/>'),
  dim: SVG('<circle cx="12" cy="12" r="6.5"/>'),
};
