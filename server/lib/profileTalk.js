import { runTextLane } from './textLane.js';
import { NOVA_LENS } from './lens.js';
import { TURN_TAKING, talkPrefsBlock } from './talk.js';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { getProfile, PROFILE_SECTIONS, localDay } from './profile.js';
import { fileProfileFact } from './inbox.js';
import { questionById } from './profileQuestions.js';

// THE ABOUT-YOU CONVERSATION (his ask, 26 Oct 2026): "a general conversation
// with Nova that I can have back-and-forth while it learns about me."
//
// Models decide, code acts. The model hears the profile as it stands and his
// new words, and answers with one short spoken turn plus what it heard him
// say about himself. Code then checks every item (a real section, a short
// fact, a replace only where nothing of his would be lost, a confirm only of
// a draft, at most three a turn) and files each one through the inbox rails
// as a 'profile-fact' record with Undo. Nothing the model says reaches the
// page unless code passed it.

const LANE = 'profile-talk';
const MAX_LEARNED = 3;
const MAX_FACT = 200;
const HISTORY_TURNS = 12;

const isHayden = (role) => ['hayden', 'user', 'you', 'me', 'him', 'he'].includes(String(role || '').toLowerCase());

function emptySections() {
  return PROFILE_SECTIONS.map(({ key, title }) => ({ key, title, text: '', drafted: false, draftedOn: null }));
}

const sectionsOf = (profile) => profile?.sections || emptySections();

// thinnest first: empty, then drafted, then the shortest of his own
function thinnest(sections) {
  const rank = (s) => (!s.text ? 0 : s.drafted ? 1 : 2);
  return [...sections].sort((a, b) => rank(a) - rank(b) || a.text.length - b.text.length
    || PROFILE_SECTIONS.findIndex((p) => p.key === a.key) - PROFILE_SECTIONS.findIndex((p) => p.key === b.key))[0];
}

/** The first line when the conversation opens: no model, counted by code. */
export function talkOpener(profile) {
  const sections = sectionsOf(profile);
  const filled = sections.filter((s) => s.text).length;
  const drafts = sections.filter((s) => s.text && s.drafted).length;
  const next = thinnest(sections);
  if (filled === sections.length && !drafts) {
    return `Tell me about you. All ${sections.length} sections are filled and confirmed. Anything changed lately?`;
  }
  const have = filled ? `I have ${filled} of ${sections.length} sections${drafts ? (drafts === 1 ? ', one of them a draft' : `, ${drafts} of them drafts`) : ''}.` : `I have none of the ${sections.length} sections yet.`;
  const ask = next.drafted
    ? `Shall we check my draft of ${next.title}?`
    : `Shall we start with ${next.title}?`;
  return `Tell me about you. ${have} ${ask}`;
}

function sectionBlock(sections) {
  return sections.map((s) => {
    if (!s.text) return `- ${s.key} (${s.title}): EMPTY`;
    const state = s.drafted ? `DRAFTED by Claude on ${s.draftedOn || 'an unknown date'}, not confirmed by him` : 'his own, confirmed';
    return `- ${s.key} (${s.title}) [${state}]:\n${s.text.split('\n').map((l) => `    ${l}`).join('\n')}`;
  }).join('\n');
}

function historyBlock(history) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((t) => t && typeof t.text === 'string' && t.text.trim())
    .slice(-HISTORY_TURNS);
  if (!turns.length) return '(this is the start of the conversation)';
  return turns.map((t) => `${isHayden(t.role ?? t.who) ? 'Hayden' : 'Nova'}: ${t.text.trim().slice(0, 600)}`).join('\n');
}

// THE INTERVIEW'S RULES (27 Oct 2026). Code picked the next question from
// the bank (lib/profileQuestions.js); the model reacts like a curious friend,
// may follow a thread for at most two turns, then asks the question code
// handed it, verbatim or lightly reworded, and says so with "moved_on".
function interviewBlock({ mode, nextQuestion, lastQuestion, followUps = 0 }) {
  if (mode !== 'interview' && mode !== 'section') return '';
  const lines = [
    `THIS IS AN INTERVIEW${mode === 'section' ? ' ABOUT ONE SECTION' : ''}: you are getting to know him the way a warm, skilled interviewer or a new close friend would.`,
    '- First react to what he just said in a few words, like a curious friend. No praise for answering, no summary of what he said.',
    lastQuestion ? `- The question on the table: "${lastQuestion.q}"` : null,
    followUps >= 2
      ? '- You have already followed this thread twice. Move on now: ask the NEXT QUESTION below.'
      : `- If his answer opens something worth knowing, ask ONE follow-up on the same thread (${2 - followUps} left on this thread). Otherwise move on with the NEXT QUESTION below.`,
    nextQuestion ? `- NEXT QUESTION (picked by code; ask it verbatim or lightly reworded, keeping its meaning): "${nextQuestion.q}"` : '- There is no next question left in the bank right now: follow his lead, or ask what else he would like you to know.',
    '- Never two questions in one reply. Your reply ends with exactly one question.',
    '- Set "moved_on": true when your question is the NEXT QUESTION, false when it is a follow-up.',
    '- Never ask for passwords, money in detail, or health conditions he has not raised himself.',
  ];
  return `\n${lines.filter(Boolean).join('\n')}\n`;
}

export function buildProfileTalkPrompt({ profile, history, text, today, mode = null, nextQuestion = null, lastQuestion = null, followUps = 0, talkPrefs = '' }) {
  const sections = sectionsOf(profile);
  const interview = interviewBlock({ mode, nextQuestion, lastQuestion, followUps });
  return `${NOVA_LENS}

You are Nova, getting to know Hayden so you hold full context of him. His profile page (Wiki/Profile.md) has these sections. Today is ${today}.

SECTIONS (key, title, state, text):
${sectionBlock(sections)}

THE CONVERSATION SO FAR:
${historyBlock(history)}

HOW THIS CONVERSATION WORKS:
- One short reply: at most 2 sentences, each at most 20 words. Warm, like a friend getting to know him. No filler, no praise for answering.
- Ask ONE question at a time. Start with the thinnest sections: empty ones, then drafted ones. For a drafted section, read it back in one sentence and ask if it is right.
- When he states a fact about himself, record it in "learned" under the section it belongs to: one fact, third person, at most 160 characters, his own words kept where possible. Mode "append" adds it; use "replace" only to correct a drafted section or fill an empty one with what he just said.
- When he confirms a draft ("yes", "that's right"), put its key in "confirmed". When he corrects a draft, record the corrected version with mode "replace".
- Never invent. Never record something he did not say in his new words. A guess or an inference is not a fact; ask instead.
- If he says to stop, or he is done, say a short goodbye and set "done": true.
${interview}
${talkPrefs ? `${talkPrefs}\n\n` : ''}${TURN_TAKING}

Ignore the MORE rule above for this conversation: everything you say is spoken.

OUTPUT ONLY JSON, nothing else:
{"say": "...", "learned": [{"key": "<section key>", "text": "<one fact>", "mode": "append"}], "confirmed": ["<key>"], "done": false${interview ? ', "moved_on": false' : ''}}

HIS NEW WORDS:
${String(text || '').trim()}`;
}

function authorOf(out) {
  if (out?.provider === 'local') return `Nova (the model on this Mac${out.fallback ? ', standing in for Claude' : ''})`;
  return `Nova (Claude ${out?.model || 'unknown model'})`;
}

/** CODE's check of what the model heard: only real sections, short facts,
 *  replace only where nothing of his is lost, confirm only a draft. */
export function vetTurn(parsed, sections) {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const learned = [];
  for (const item of Array.isArray(parsed?.learned) ? parsed.learned : []) {
    if (learned.length >= MAX_LEARNED) break;
    const s = byKey.get(String(item?.key || ''));
    if (!s) continue;
    const text = String(item?.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_FACT).trim();
    if (!text) continue;
    // a section of his own words is never overwritten by the model
    const replaceOk = !s.text || s.drafted;
    const mode = item?.mode === 'replace' && replaceOk ? 'replace' : 'append';
    learned.push({ key: s.key, title: s.title, text, mode });
  }
  const confirmed = [];
  for (const k of Array.isArray(parsed?.confirmed) ? parsed.confirmed : []) {
    const s = byKey.get(String(k || ''));
    if (!s || !s.text || !s.drafted) continue;
    if (confirmed.some((c) => c.key === s.key)) continue;
    // replaced in this same turn: the replacement already makes it his
    if (learned.some((l) => l.key === s.key && l.mode === 'replace')) continue;
    confirmed.push({ key: s.key, title: s.title, text: s.text });
  }
  return { learned, confirmed };
}

/** One turn: his words in, Nova's short reply out, every fact filed by code
 *  with Undo. A model failure is { error } and writes nothing. */
//
// Interview and section modes (27 Oct 2026): `nextQuestion` is the bank
// question code picked; `questionId` the one on the table; `followUps` how
// many follow-ups this thread has had. The result's `questionId` is the next
// question's id when Nova moved on to it, else the one on the table, and
// `movedOn` says which.
export async function profileTalkTurn(vaultPath, { history = [], text = '', now = new Date(), mode = null, questionId = null, nextQuestion = null, followUps = 0 } = {}, deps = {}) {
  const run = deps.run || runTextLane;
  const words = String(text || '').trim();
  if (!words) return { error: 'Say something first' };
  const today = localDay(now);
  const before = await getProfile(vaultPath);
  const sections = sectionsOf(before);

  let out;
  let parsed;
  try {
    const interviewing = mode === 'interview' || mode === 'section';
    const lastQuestion = interviewing && questionId ? questionById(questionId) : null;
    let talkPrefs = '';
    try { talkPrefs = talkPrefsBlock(vaultPath); } catch { talkPrefs = ''; }
    out = await run(LANE, buildProfileTalkPrompt({
      profile: before, history, text: words, today, talkPrefs,
      mode: interviewing ? mode : null, nextQuestion: interviewing ? nextQuestion : null, lastQuestion, followUps,
    }), { json: true, maxTokens: 700 });
    const m = firstBalancedObjectMatch(out?.text || '');
    if (!m) throw new Error('no JSON in the reply');
    parsed = parseModelJson(m[0]);
  } catch (e) {
    return { error: e?.message || String(e), cause: e };
  }
  const say = String(parsed?.say || '').trim();
  if (!say) return { error: 'the reply came back empty' };

  const { learned, confirmed } = vetTurn(parsed, sections);
  const filedLearned = [];
  for (const l of learned) {
    const rec = await fileProfileFact(vaultPath, {
      key: l.key, text: l.text, append: l.mode === 'append', confirm: false, said: today, source: 'profile-talk',
    });
    filedLearned.push({ key: l.key, title: l.title, text: l.text, mode: l.mode, recordId: rec.id });
  }
  const filedConfirmed = [];
  for (const c of confirmed) {
    // the section as it stands now (a fact may have been appended this turn)
    const rec = await fileProfileFact(vaultPath, { key: c.key, confirm: true, text: '', source: 'profile-talk' });
    filedConfirmed.push({ key: c.key, title: c.title, recordId: rec.id });
  }

  // did Nova move on to the question code handed it? Its own flag, or the
  // question itself in its words
  const squash = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
  const movedOn = !!nextQuestion && (parsed?.moved_on === true || squash(say).includes(squash(nextQuestion.q)));
  const nextId = movedOn ? nextQuestion.id : (questionId || null);

  return {
    say,
    questionId: nextId,
    movedOn,
    learned: filedLearned,
    confirmed: filedConfirmed,
    done: parsed?.done === true,
    profile: await getProfile(vaultPath),
    author: authorOf(out),
  };
}
