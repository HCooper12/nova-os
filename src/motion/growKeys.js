// The data-grow key a briefing pill wears (src/motion/briefingGrow.js). Pure,
// so the view models that hand it to a pill import no DOM code.
export const BRIEFING_GROW = 'briefing';
export const briefingGrowKey = (id) => `${BRIEFING_GROW}:${id}`;
