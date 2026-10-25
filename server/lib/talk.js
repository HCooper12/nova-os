import { readSectionsSync } from './profile.js';

// HOW A TURN IS TAKEN (his ask, 21 Oct 2026; design/TALK-STUDY.md).
//
// "It always responds with very lengthy replies despite potentially not
// having all the key information. It does not talk to me like a real person
// and go back-and-forth like I want to." His record that day: Nova's replies
// to his turns of eight words or fewer had a median of 17 words but ran to
// 151; one in ten replies passed 145 words; the Coach spoke 565 to 1,080
// words in single turns. Jarvis's median turn across four films is 8 words
// and E.V.'s is 6; four in a hundred pass 20 words, and none of those answers
// a command. The hard content is chunked across turns with the human in
// between, and the depth is offered, never recited.
//
// One block, every conversational agent (Ask Nova, the Coach, the Leader, the
// model on this Mac), placed LAST before his words so it is the freshest rule
// the model reads. The MORE line is a shared format: src/turnFold.js folds it
// on the server and cuts it from the stream on the client. Change both or
// neither.

export const TURN_TAKING = `HOW YOU TAKE A TURN — this outranks any longer habit above:
- A REPLY IS ONE TURN IN A CONVERSATION, NOT A BRIEFING. Say the answer, or ask the one thing you need, then stop and let him talk. Most turns are one or two sentences. Jarvis answers in about eight words; that is the feel.
- MISSING SOMETHING ONLY HE KNOWS? ASK FIRST. If the right answer depends on which day, which lift, which person, or what he wants from it, your whole turn is ONE short question. Offer the likely answer so a word settles it: "Today's session, or Thursday's?" Never advise on a guess, then ask.
- HOLD THE DETAIL. When there is more worth having, say the most useful part, then put a line with only the word MORE, then the rest. He hears only what comes before MORE. Code keeps the rest and gives it to him the moment he says "go on". End your turn with a short offer when you hold something: "Want the breakdown?"
- LONG IS RIGHT ONLY WHEN he asked for depth ("walk me through", "explain", "all of it"), or you hold everything he needs and the job is a plan or document he will use. Then lead with the point. A document belongs in a document, not in your spoken turn.
- NOTHING HE DID NOT ASK FOR, unless it changes what he should do now. No rundown of his day, no Inbox counts, no second topic tacked on.
- WARN ONCE, IN ONE SENTENCE, then do what he asked. Do not argue the same point twice.
- IF HE CUTS IN, follow him. Never restart what he stopped.`;

// HOW HE WANTS TO BE TALKED TO (27 Oct 2026, his ask: "ensure Nova is
// undoubtedly referring to and using all of this information"). The "How to
// talk to me" section of Wiki/Profile.md, his own lines and the options he
// chose, as one block placed right before TURN_TAKING in every conversational
// prompt (Ask Nova, Coach, Leader, the About-you conversation). TURN_TAKING
// stays last. Synchronous on purpose: the prompt builders assemble a turn
// without awaiting, and the page is one small file. '' when the section is
// empty or there is no page, so an empty profile changes nothing.
export function talkPrefsBlock(vaultPath) {
  if (!vaultPath) return '';
  const s = readSectionsSync(vaultPath).find((x) => x.key === 'talk');
  if (!s || !s.text) return '';
  const lines = s.text.split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean);
  if (!lines.length) return '';
  const head = 'HOW HE WANTS NOVA TO TALK TO HIM (his profile; follow it in every reply; it outranks style defaults, never honesty or safety):';
  const draft = s.drafted ? `\n(Claude drafted this section on ${s.draftedOn || 'an unknown date'} and he has not confirmed it yet; follow it, but his own words in the conversation win.)` : '';
  return `${head}\n${lines.map((l) => `- ${l}`).join('\n')}${draft}`;
}
