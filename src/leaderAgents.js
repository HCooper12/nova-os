import { FINDERS } from './glassMarks.js';

// Whose hue and name an agent the Leader asked wears (glassMarks.FINDERS),
// shared by the Leader page's faces, seats and byline.
export const agentHue = (a) => (FINDERS[a] ? FINDERS[a].hue : 'var(--nv-nova)');
export const agentName = (a) => (FINDERS[a] ? FINDERS[a].name : String(a || 'Agent').replace(/^\w/, (c) => c.toUpperCase()));
export const agentThe = (a) => (FINDERS[a] ? FINDERS[a].the : `the ${agentName(a)}`);
