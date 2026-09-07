// THE BRIEFING BY VOICE — pure, no DOM, no React, tested in
// server/test/briefingVoice.test.js. The words he says while Nova is reading
// a briefing to him, turned into a command the player runs instantly and
// locally: pause, carry on, skip a part, go back, hear that again, and the
// one that matters most — "explain that again", which hands the sentence
// just spoken (and its section) to Nova as a question, with the briefing
// paused, so the answer lands in the conversation and the briefing resumes
// where it was.
//
// Only consulted while a briefing is open. Anything unrecognised returns
// null and the sentence continues to the ordinary front door — the
// parser never guesses.

const clean = (q) => String(q || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function parseBriefingVoice(q) {
  const s = clean(q);
  if (!s) return null;
  if (/^(pause|stop|hold on|hang on|wait|shush|quiet|stop reading|pause it|pause that)( (the )?(briefing|reading|it))?$/.test(s)) return { kind: 'pause' };
  if (/^(resume|continue|carry on|keep going|go on|play|unpause|keep reading|carry on reading)( (the )?(briefing|reading|it))?$/.test(s)) return { kind: 'resume' };
  if (/^(start (again|over)|from the (top|start|beginning)|restart( it| the briefing)?|play (it )?again)$/.test(s)) return { kind: 'restart' };
  if (/^(next|skip|skip (it|this|ahead|this (part|section|bit))|next (part|section|bit|one)|move on|go on to the next( part| section)?)$/.test(s)) return { kind: 'next' };
  if (/^(back|go back|previous( (part|section|bit))?|last (part|section)|back a (bit|part|section))$/.test(s)) return { kind: 'back' };
  if (/^((say|read) (that|it) again|again|repeat( that| it)?|once more|what was that|sorry what|pardon)$/.test(s)) return { kind: 'again' };
  if (/^(close|close (it|the briefing|this)|done|i'm done|that's enough|enough|stop the briefing|exit)$/.test(s)) return { kind: 'close' };
  // the teaching move: he did not follow, and says so in any of the ways a
  // person does. The player pauses and hands the beat to Nova as a question.
  if (/^(explain (that|it|this)( (again|more|better|properly|simply|differently|to me|for me))*|what (does|did) (that|it|this) mean|what do you mean( by that)?|i (don't|didn't|do not) (get|follow|understand)( that| it| this)?|i'm lost|lost me|too fast|slow down|(can you )?(break|dumb) (that|it) down( for me)?|(what|why) is that|why does that (matter|happen)|simpler|in plain (english|words)|eli5|say that (more )?simply)$/.test(s)) {
    return { kind: 'explain', ask: s };
  }
  return null;
}

// The question Nova is handed when he asks for an explanation mid-briefing:
// the sentence he just heard, in its section, with his own words about what
// did not land. Grounded so the answer is about THIS beat, not the topic.
export function explainQuestion({ say, heading, title, ask }) {
  const what = /(simpl|plain (english|words)|dumb|eli5|slow)/.test(ask) ? 'in simpler words, no jargon' : 'more fully';
  return `You are reading me your briefing "${title}", in the part called "${heading}". You just said: "${say}". I didn't follow that — explain it ${what}, in a few sentences, then I will carry on listening.`;
}
