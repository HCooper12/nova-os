// THE JOURNAL'S DEMO DAY (demoMode only, mockup 95). Shaped exactly like the
// server's /api/journal/entries, so the view model runs the same code over
// it. Every entry, prompt and time is invented and labelled demo; the
// prompts are original to the mockup and quote no one. Nothing here is his.
//
// URL switches for checking every state in demo (#/journal?jdemo=...):
//   notion=not-connected | syncing | error | wait     the Notion states
//   jdemo=empty | long | offline                     break-ui cases

export const DEMO_DEEP = [
  'Which belief about yourself have you defended for so long that you no longer check whether it is still true?',
  'What are you waiting to feel before you let yourself begin, and what if that feeling never arrives?',
  'If you were remembered only for how you treated people when nothing was at stake, what would this week say?',
];
export const DEMO_REVIEW = { concept: 'Second-order effects', prompt: "Today's review is second-order effects. Which easy yes from this month will cost the most in a year, and who will pay it?" };
export const DEMO_LIFE = [
  { source: 'cal', from: 'From your calendar · Thursday', prompt: 'Thursday has three meetings back to back. Who do you want to be in the third one, when you are tired and no one would notice the difference?' },
  { source: 'train', from: 'From your training · bench, three weeks', prompt: 'Your bench has held the same weight for three weeks. What does staying with a plateau ask of you that a good week never does?' },
  { source: 'lead', from: 'From your Lead picture', prompt: 'Your team picture says one person has gone quiet. What might they be waiting for you to notice?' },
  { source: 'review', from: 'From the Daily review topic', prompt: 'Where in your own week can you see a second-order effect already arriving?' },
];
// money has no import this month in the demo, so it is drawn dashed and skipped
export const DEMO_LIFE_SOURCES = { cal: true, train: true, lead: true, money: false, review: true };

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const his = (time, words, { tag = 'own', prompt = null, promptFrom = null, notion = false } = {}) => ({
  time, category: 'personal', by: 'Hayden', author: 'hayden', tag, prompt, promptFrom, words,
  writtenIn: notion ? 'notion' : undefined, heading: promptFrom ? { deep: 'Deep question', review: 'Daily review', life: 'My life' }[promptFrom] : null,
  text: prompt ? `> ${prompt}\n\n${words}` : words,
});
const log = (time, author, by, heading, text, category = 'system') => ({ time, category, by, heading, author, text });

const LONG = 'Demo words, the worst case. Wrote this one in one go after a long day and did not stop to edit it: the drive home, the call with the team that ran over, the thing I said that I want back, and the walk afterwards that sorted most of it out. Bartholomew-Fitzgerald’s idea about the Northwind roll-out still sits wrong with me and I think it is because nobody asked the people who will carry it. Tomorrow I ask them first.';

export function demoJournalEntries(scenario) {
  if (scenario === 'empty') return [];
  const today = ago(0);
  const days = [
    { date: today, sections: [
      log('06:30', 'nova', 'Nova', 'Morning dispatch', 'Demo. Two meetings before noon; training at 17:30.'),
      his('07:40', 'Demo words. Patient with the people who could do nothing for me; short with the ones closest.', { tag: 'deep', prompt: DEMO_DEEP[2], promptFrom: 'deep' }),
      log('07:05', 'nova', 'Nova', 'Plan today', 'Demo. Three things: the draft, the session, a call back.'),
      his('12:15', scenario === 'long' ? LONG : 'Demo words. A walk at lunch fixed more than the coffee did.'),
      log('12:40', 'leader', 'Leader', 'Leader follow-up', 'Demo. One check-in waiting from Friday.'),
      log('18:40', 'coach', 'Coach', 'Session receipt', 'Demo. Upper body done; every set logged.', 'training'),
      log('20:30', 'nova', 'Nova', 'Evening debrief', 'Demo. Two of the three planned things done.'),
      log('21:00', 'nova', 'Nova', 'Daily review reflection', 'Demo. A steady day with one long tail.', 'personal'),
    ] },
    { date: ago(1), sections: [
      his('08:10', 'Demo words. Saturday training felt like paying a debt I chose.', { tag: 'life', prompt: DEMO_LIFE[1].prompt, promptFrom: 'life' }),
      log('09:00', 'nova', 'Nova', 'Morning dispatch', 'Demo. A free morning; the long run at 10.'),
      his('22:30', 'Demo words. Dinner with friends; I listened more than I talked.'),
    ] },
    { date: ago(2), sections: [
      his('21:05', 'Demo words. The review concept landed: small choices, long tails.', { tag: 'life', prompt: DEMO_REVIEW.prompt, promptFrom: 'review' }),
      his('21:40', 'Demo words. Tired, but the week moved.'),
      log('17:00', 'coach', 'Coach', 'Weekly debrief', 'Demo. Four sessions this week, one short.', 'training'),
    ] },
    { date: ago(3), sections: [
      his('06:50', 'Demo words. Up before the alarm.'),
      his('20:55', 'Demo words. Wrote this one on the laptop between calls.', { notion: true }),
    ] },
  ];
  // novaIds as the server derives them
  return days.map((d) => ({ ...d, sections: d.sections.map((s) => ({ ...s, novaId: `${d.date}T${s.time}` })) }));
}

export function journalScenarioFromUrl() {
  if (typeof window === 'undefined') return {};
  const q = (window.location.hash.split('?')[1] || '') + '&' + window.location.search.replace(/^\?/, '');
  const p = new URLSearchParams(q);
  return { jdemo: p.get('jdemo') || null, notion: p.get('notion') || null };
}
