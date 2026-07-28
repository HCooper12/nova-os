import { composeDispatch } from './dispatch.js';
import { profileContext } from './profile.js';
import { preferencesContext } from './learning.js';
import { standingContext } from './standing.js';

// The shared first-turn context for every conversational surface (Voice
// screen, Siri sync ask, Telegram bridge). One builder so the surfaces can
// never drift apart — resumed sessions already carry it and pass ''.
export async function buildAskContext(vaultPath, sessionId) {
  if (sessionId) return '';
  const parts = [];
  try { parts.push(await profileContext(vaultPath)); } catch { /* optional */ }
  try { parts.push(await preferencesContext(vaultPath)); } catch { /* optional */ }
  try {
    const standing = await standingContext(vaultPath);
    if (standing) parts.push(standing);
  } catch { /* optional */ }
  try {
    const { skillsContext } = await import('./skills.js');
    const skills = await skillsContext(vaultPath);
    if (skills) parts.push(skills);
  } catch { /* optional */ }
  try {
    const [morning, evening] = await Promise.all([
      composeDispatch(vaultPath, 'morning'),
      composeDispatch(vaultPath, 'evening'),
    ]);
    parts.push(`${morning.text}\n\n${evening.text}`);
  } catch { /* the prompt says "(unavailable)" honestly */ }
  try {
    const { getMonthSummary } = await import('./money.js');
    const m = await getMonthSummary();
    if (m?.count) {
      const top = (m.byCategory || []).sort((a, b) => b.spent - a.spent).slice(0, 3).map((c) => `${c.category} $${Math.round(c.spent)}`);
      parts.push(`Money this month: $${Math.round(m.spent)} spent (last month $${Math.round(m.prevSpent)}); top: ${top.join(', ')}.`);
    }
  } catch { /* optional */ }
  return parts.join('\n\n');
}
