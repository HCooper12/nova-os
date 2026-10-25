import { chosenOptions } from '../server/lib/profileOptions.js';

// THE TWELVE PARTS OF "ABOUT YOU" (26 Oct 2026; twelve since 27 Oct, his
// ask to be interviewed "just like you would" to get to know someone). The
// server owns the words (GET /api/profile → profile.sections); this is only
// the order, the titles a missing answer falls back to, the hue each part
// wears on screen, a hint at what belongs in an empty part, and the line
// Nova opens with when he taps "Tell Nova" on one part (code's words, not a
// model's).
// Colour means something (NOVA-METHOD §2b rule 8): training is the orange
// Train wears and fuel the green Fuel wears; nothing else takes either. The
// rest cycle cyan, gold, violet, magenta so no two neighbours share a hue in
// the two-column phone grid OR the three-column wide one (checked by
// src/profileSections.test.js).
export const PROFILE_SECTIONS = [
  { key: 'about', title: 'About me', ask: "Tell me about you. Who you are, where you're at.", hint: 'Who you are, in a line or two', hue: 'var(--nv-cy)' },
  { key: 'story', title: 'My story', ask: 'Tell me how you got here. Where you grew up, the turns that shaped you.', hint: 'Where you come from, the turns that shaped you', hue: 'var(--nv-gold)' },
  { key: 'toward', title: "What I'm working toward", ask: "Tell me what you're working toward.", hint: 'The goals that matter this year', hue: 'var(--nv-vi)' },
  { key: 'values', title: 'What matters to me', ask: 'Tell me what matters most to you. The things you would not trade.', hint: 'What you stand for, and will not trade', hue: 'var(--nv-mg)' },
  { key: 'training', title: 'Training', ask: 'Tell me about your training.', hint: 'How you train, and what holds you back', hue: 'var(--nv-or)' },
  { key: 'fuel', title: 'Fuel', ask: 'Tell me how you like to eat.', hint: 'How you eat and what you are aiming for', hue: 'var(--nv-good)' },
  { key: 'work', title: 'Work and projects', ask: "Tell me about your work and what you're building.", hint: 'Your job, your team, what you are building', hue: 'var(--nv-cy)' },
  { key: 'mind', title: 'Mind and learning', ask: "Tell me what you're learning, and what's on your mind.", hint: 'What you read, listen to and want to learn', hue: 'var(--nv-gold)' },
  { key: 'people', title: 'People in my life', ask: 'Tell me about the people who matter in your life.', hint: 'Family, friends, the people who matter', hue: 'var(--nv-vi)' },
  { key: 'life', title: 'Life', ask: 'Tell me about life outside work and the gym.', hint: 'Home, routines, the rest of the week', hue: 'var(--nv-mg)' },
  { key: 'talk', title: 'How to talk to me', ask: 'Tell me how you like me to talk to you.', hint: 'How Nova should speak to you', hue: 'var(--nv-cy)' },
  { key: 'taste', title: 'Taste', ask: 'Tell me what you like. Music, books, films, anything.', hint: 'Music, books, films, the things you like', hue: 'var(--nv-gold)' },
];

export const sectionTitle = (key) => PROFILE_SECTIONS.find((s) => s.key === key)?.title || key;

/**
 * The twelve parts in order, whatever the server sent: a missing or unknown
 * list is twelve empty parts, never a crash and never invented words. An
 * older server that sends no `chosen` list has it read from the text, by
 * the same shared rule the server uses (server/lib/profileOptions.js).
 */
export function normaliseSections(sections) {
  const byKey = new Map((Array.isArray(sections) ? sections : []).filter((s) => s && s.key).map((s) => [s.key, s]));
  return PROFILE_SECTIONS.map((d) => {
    const s = byKey.get(d.key) || {};
    const text = typeof s.text === 'string' ? s.text.trim() : '';
    const chosen = Array.isArray(s.chosen) ? s.chosen.filter((c) => typeof c === 'string') : chosenOptions(d.key, text);
    return { key: d.key, title: s.title || d.title, hue: d.hue, hint: d.hint, ask: d.ask, text, chosen, drafted: !!(text && s.drafted), draftedOn: s.draftedOn || null };
  });
}

/** How well Nova knows him: the server's count when it sent one, else counted here from the same parts. */
export function knowsOf(knows, sections) {
  const list = normaliseSections(sections);
  const filled = list.filter((s) => s.text).length;
  const confirmed = list.filter((s) => s.text && !s.drafted).length;
  if (knows && Number.isFinite(knows.total) && knows.total > 0) {
    return { filled: Number(knows.filled) || 0, confirmed: Number(knows.confirmed) || 0, total: knows.total };
  }
  return { filled, confirmed, total: PROFILE_SECTIONS.length };
}

// "interview me", "ask me some questions about myself", "get to know me
// better", and the older "let's talk about me" family: each starts the
// interview. Anchored on asking-about-HIM phrasings so a sentence that only
// mentions him ("what do you think about me skipping legs") never does.
const TALK_VOICE = /\b(?:interview me|ask me (?:some |a few )?questions about (?:me|myself)|get to know me(?: better)?|tell you (?:about me|about myself|more about me)|learn (?:about|more about) me|update my profile|fill (?:in|out) my profile|(?:fill (?:in|out)|update|go through|work on) (?:my )?about me|(?:let's |let us )?(?:talk|chat) about me)\b/i;
export const isProfileTalkVoice = (q) => TALK_VOICE.test(String(q || ''));
