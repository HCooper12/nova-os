// THE WAYS TO ASK FOR A BRIEFING — the phrasings the router actually accepts
// (server/lib/intentRouter.js BRIEF_RE), offered on the empty Briefing screen
// so the first one he ever asks for is asked in words that work. The blank is
// his topic; a chip places the phrase in the Voice composer with the cursor
// where the topic goes, and says nothing to Nova until he does.
// server/test/briefingEmpty.test.js routes each one and fails if the router
// stops recognising it.
export const BRIEFING_STARTERS = [
  { phrase: 'Brief me on ', hint: 'a topic' },
  { phrase: 'Research ', tail: ' and write me a report', hint: 'a question' },
  { phrase: 'Explain ', tail: ' properly', hint: 'a concept' },
];

export function starterLabel(s) {
  return `${s.phrase}…${s.tail || ''}`.replace(/\s+…/, ' …');
}
