// PROFILE OPTIONS (27 Oct 2026, his ask): "Some sections like how I want Nova
// to talk to me should provide me with options that I can further expand
// upon through discussion with Nova or just typing extra information."
//
// A shared format (server and the PWA both import this file): a chosen
// option is one line in its section of Wiki/Profile.md, written exactly as
// `- <phrase>`. The line IS the choice, so Obsidian, every agent's context
// and this list always agree, and anything he types beside it stays his.
// The first six of each list are the ones shown before "Show all".

export const PROFILE_OPTIONS = {
  talk: [
    'Short and direct',
    'Ask me before you advise',
    'Challenge me when I am wrong',
    'Explain the why, briefly',
    'Warm, like a friend',
    'No small talk',
    'Give me one action, not a list',
    'Use numbers, not adjectives',
    'Tell me the hard thing first',
    'Celebrate wins, but only real ones',
    'Plain words, no jargon',
    'Check in on how I am feeling',
  ],
  toward: [
    'Lose fat while keeping muscle',
    'Build a V-taper',
    'Grow my arms and shoulders',
    'Get stronger on the big lifts',
    'Sleep better',
    'Become a better leader',
    'More energy through the day',
    'Build Nova and Science Atlas',
    'Read and learn more',
    'Save and invest more',
  ],
  values: [
    'Discipline',
    'Honesty',
    'Growth',
    'Family',
    'Health',
    'Freedom',
    'Craft and quality',
    'Leading by example',
    'Calm under pressure',
    'Curiosity',
  ],
  training: [
    'Hypertrophy first',
    'Strength first',
    'Keep sessions under 75 minutes',
    'Progressive overload every week',
    'I like variety',
    'I like the same plan, repeated',
    'Train to failure on the last set',
    'Leave a rep or two in the tank',
    'Walk every day',
    'Cardio after lifting',
    'Mobility work most days',
  ],
  fuel: [
    'High protein, every meal',
    'Meal prep for the week',
    'Simple meals I repeat',
    'I like variety in food',
    'Eat out once or twice a week',
    'Big breakfast',
    'Skip breakfast',
    'Late dinners',
    'Sweet tooth at night',
    'Coffee most mornings',
    'Rarely drink alcohol',
  ],
  mind: [
    'Learn by listening (podcasts)',
    'Learn by reading',
    'Learn by doing',
    'Short videos and reels',
    'Spaced review works for me',
    'Journal in the evening',
    'Deep work in the morning',
    'I like summaries, then detail',
  ],
  work: [
    'I lead a team',
    'I build software',
    'Long days at a desk',
    'Lots of meetings',
    'I work best early',
    'I work best late',
    'Shift or irregular hours',
  ],
};

export const OPTIONS_SHOWN = 6;

const norm = (s) => String(s || '').trim().replace(/^[-*]\s+/, '').trim().toLowerCase();

// the options of one section that his text already carries, as lines
export function chosenOptions(key, text) {
  const list = PROFILE_OPTIONS[key] || [];
  const lines = new Set(String(text || '').split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).map(norm));
  return list.filter((p) => lines.has(norm(p)));
}

// add or remove one option's line; every other line (his own words) is kept
export function toggleOptionText(text, phrase, on) {
  const lines = String(text || '').split('\n');
  const isIt = (l) => /^\s*[-*]\s+/.test(l) && norm(l) === norm(phrase);
  const has = lines.some(isIt);
  if (on && !has) {
    const body = lines.join('\n').replace(/\s+$/, '');
    return body ? `${body}\n- ${phrase}` : `- ${phrase}`;
  }
  if (!on && has) return lines.filter((l) => !isIt(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return String(text || '');
}

export function isOption(key, phrase) {
  return (PROFILE_OPTIONS[key] || []).some((p) => norm(p) === norm(phrase));
}
