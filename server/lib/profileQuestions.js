import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_SECTIONS } from './profile.js';

// THE INTERVIEW (his ask, 27 Oct 2026): "Nova should interview me just like
// you would, with random or specific questions, to get to know someone better
// and have an overall better context."
//
// The questions are written here, by hand, the way a good podcast host or a
// new close friend asks: one thing at a time, concrete, plain words, at most
// twenty words, never two questions in one. Code picks which one comes next
// (pickQuestion, pure, seeded randomness injectable); the model only reacts
// to his answer and may follow a thread for up to two turns before moving on
// to the question code handed it (lib/profileTalk.js).
//
// Out of bounds on purpose: passwords, money in detail, and health conditions
// beyond what he volunteers. Life questions carry no gym metaphors (his
// rejection of them in leadership advice, design memory "agent relevance").

const Q = (id, key, depth, q) => ({ id, key, depth, q });

export const PROFILE_QUESTIONS = [
  // about: who he is, in the plain facts a friend would know
  Q('about-tuesday', 'about', 'light', 'What does a normal Tuesday look like for you, start to finish?'),
  Q('about-intro', 'about', 'light', 'How do you usually introduce yourself to someone new?'),
  Q('about-hometown', 'about', 'light', 'What was it like where you grew up?'),
  Q('about-misread', 'about', 'deep', 'What do people often get wrong about you when they first meet you?'),
  Q('about-friends-say', 'about', 'light', 'How would your closest friend describe you in three words?'),
  Q('about-energy', 'about', 'light', 'What time of day do you feel most like yourself?'),
  Q('about-proud-trait', 'about', 'deep', 'Which part of your character are you proudest of?'),

  // story: where he has come from
  Q('story-surprised', 'story', 'deep', 'When did you last surprise yourself?'),
  Q('story-turning', 'story', 'deep', 'What was a turning point that changed the direction of your life?'),
  Q('story-kid', 'story', 'light', 'What were you like as a kid?'),
  Q('story-first-job', 'story', 'light', 'What did your first job teach you?'),
  Q('story-hardest', 'story', 'deep', 'What is the hardest thing you have come through so far?'),
  Q('story-teen-dream', 'story', 'light', 'What did you want to be when you were sixteen?'),
  Q('story-mentor', 'story', 'deep', 'Who shaped you most when you were younger?'),
  Q('story-moved', 'story', 'light', 'Which place you have lived in shaped you the most?'),
  Q('story-failure', 'story', 'deep', 'Which failure ended up being good for you?'),
  Q('story-best-year', 'story', 'light', 'Which year of your life would you happily live again?'),
  Q('story-decision', 'story', 'deep', 'What is the best decision you have ever made?'),
  Q('story-changed-mind', 'story', 'deep', 'What is something you believed strongly ten years ago that you no longer do?'),

  // toward: what he is working toward
  Q('toward-year', 'toward', 'light', 'What would make the next twelve months a great year for you?'),
  Q('toward-five', 'toward', 'deep', 'Picture yourself five years from now on a good day. What are you doing?'),
  Q('toward-one-thing', 'toward', 'light', 'If you could only make progress on one thing this month, what would it be?'),
  Q('toward-why', 'toward', 'deep', 'Why does your biggest goal matter so much to you?'),
  Q('toward-stuck', 'toward', 'deep', 'Where do you feel most stuck right now?'),
  Q('toward-best-self', 'toward', 'deep', 'What does the best version of you do differently from today?'),
  Q('toward-quit', 'toward', 'light', 'What is something you keep meaning to start but have not yet?'),
  Q('toward-measure', 'toward', 'light', 'How will you know you are on track by Christmas?'),
  Q('toward-scared', 'toward', 'deep', 'What goal do you hold that you are a little scared to say out loud?'),
  Q('toward-legacy', 'toward', 'deep', 'What do you want people to say about you at seventy?'),
  Q('toward-drop', 'toward', 'light', 'What is one goal you could drop that would free you up?'),

  // values: what matters to him
  Q('values-non-negotiable', 'values', 'deep', 'What is one thing you will not compromise on, even when it costs you?'),
  Q('values-admire', 'values', 'light', 'Who do you admire most?'),
  Q('values-angry', 'values', 'deep', 'What makes you genuinely angry when you see it?'),
  Q('values-rich-life', 'values', 'deep', 'What does a rich life mean to you, money aside?'),
  Q('values-proud-week', 'values', 'light', 'What would make you proud of how you spent this week?'),
  Q('values-lesson', 'values', 'deep', 'What lesson do you want your kids, or the next generation, to learn from you?'),
  Q('values-lines', 'values', 'deep', 'Where do you draw the line between ambition and balance?'),
  Q('values-respect', 'values', 'light', 'What earns your respect quickly?'),
  Q('values-lose-respect', 'values', 'light', 'What makes you lose respect for someone?'),
  Q('values-faith', 'values', 'deep', 'What do you believe in that guides how you live?'),
  Q('values-time', 'values', 'light', 'Where does your free time actually go?'),

  // training: how he likes to train (facts and taste, not a program)
  Q('training-why', 'training', 'deep', 'What got you into training in the first place?'),
  Q('training-favourite', 'training', 'light', 'What is your favourite session of the week?'),
  Q('training-skip', 'training', 'light', 'What makes you skip a session when you do skip one?'),
  Q('training-best-shape', 'training', 'light', 'When were you in the best shape of your life?'),
  Q('training-gym', 'training', 'light', 'What equipment do you have at your gym?'),
  Q('training-feel', 'training', 'deep', 'How do you want your body to feel day to day, beyond how it looks?'),

  // fuel: how he eats
  Q('fuel-typical', 'fuel', 'light', 'What did you eat yesterday, roughly, from breakfast to bed?'),
  Q('fuel-comfort', 'fuel', 'light', 'What is your go-to comfort meal?'),
  Q('fuel-hard', 'fuel', 'deep', 'When does eating well fall apart for you?'),
  Q('fuel-cook', 'fuel', 'light', 'How much do you enjoy cooking, honestly?'),
  Q('fuel-never', 'fuel', 'light', 'Which foods will you never eat, no matter what?'),
  Q('fuel-grew-up', 'fuel', 'deep', 'How did your family eat when you were growing up?'),

  // work: work and projects
  Q('work-what', 'work', 'light', 'How would you explain your job to a ten-year-old?'),
  Q('work-best-day', 'work', 'light', 'What does a really good day at work look like for you?'),
  Q('work-drain', 'work', 'light', 'Which part of your work drains you most?'),
  Q('work-team', 'work', 'deep', 'What kind of leader do you want your team to say you are?'),
  Q('work-side', 'work', 'light', 'What are you building outside your day job right now?'),
  Q('work-flow', 'work', 'light', 'When do you lose track of time while working?'),
  Q('work-next', 'work', 'deep', 'Where do you want your career to be in three years?'),
  Q('work-hard-call', 'work', 'deep', 'What is the hardest call you have made at work?'),

  // mind: how he learns and thinks
  Q('mind-learning', 'mind', 'light', 'What are you most curious about at the moment?'),
  Q('mind-book', 'mind', 'light', 'Which book or podcast has changed how you think?'),
  Q('mind-unwind', 'mind', 'light', 'How do you switch your brain off at the end of a day?'),
  Q('mind-stress', 'mind', 'deep', 'How do you know when you are under too much pressure?'),
  Q('mind-master', 'mind', 'deep', 'If you could master one skill overnight, which would you choose?'),
  Q('mind-think-best', 'mind', 'light', 'Where do you do your best thinking?'),
  Q('mind-doubt', 'mind', 'deep', 'What story do you tell yourself on a bad day?'),

  // people: the people in his life
  Q('people-closest', 'people', 'light', 'Who are the people you see most in a normal week?'),
  Q('people-call', 'people', 'light', 'Who is the first person you call with good news?'),
  Q('people-family', 'people', 'light', 'Who is in your family?'),
  Q('people-partner', 'people', 'light', 'Is there someone special in your life right now?'),
  Q('people-miss', 'people', 'deep', 'Is there someone you have drifted from that you would like back?'),
  Q('people-energy', 'people', 'light', 'Who leaves you with more energy after you have seen them?'),
  Q('people-owe', 'people', 'deep', 'Who do you owe a thank-you that you have never quite said?'),
  Q('people-parents', 'people', 'deep', 'What did you learn from your parents that you still carry?'),
  Q('people-friend-kind', 'people', 'deep', 'What kind of friend are you, honestly?'),
  Q('people-team-names', 'people', 'light', 'Who are the people at work I should know by name?'),
  Q('people-hard', 'people', 'deep', 'Which relationship takes the most out of you right now?'),
  Q('people-more-time', 'people', 'light', 'Who would you like to spend more time with?'),

  // life: home, rest, the rest of the week
  Q('life-weekend', 'life', 'light', 'What does a perfect Saturday look like for you?'),
  Q('life-home', 'life', 'light', 'What do you like most about where you live?'),
  Q('life-recharge', 'life', 'light', 'What recharges you when you are running low?'),
  Q('life-sleep', 'life', 'light', 'What time do you usually go to bed?'),
  Q('life-travel', 'life', 'light', 'Where is the best place you have ever travelled?'),
  Q('life-fun', 'life', 'light', 'What do you do purely for fun, with no goal attached?'),
  Q('life-change', 'life', 'deep', 'If you could change one thing about your life tomorrow, what would it be?'),
  Q('life-grateful', 'life', 'deep', 'What are you most grateful for right now?'),

  // talk: how he wants Nova to talk to him
  Q('talk-good-advice', 'talk', 'light', 'Think of the best advice anyone gave you. How did they say it?'),
  Q('talk-pushback', 'talk', 'light', 'When you are wrong, how do you want me to tell you?'),
  Q('talk-annoy', 'talk', 'light', 'What is something assistants say that annoys you?'),
  Q('talk-length', 'talk', 'light', 'Do you prefer short answers first, or the full picture straight away?'),
  Q('talk-bad-day', 'talk', 'deep', 'On a bad day, what do you want from me?'),
  Q('talk-praise', 'talk', 'light', 'How do you feel about praise when you hit a goal?'),
  Q('talk-humour', 'talk', 'light', 'How much humour do you want from me?'),
  Q('talk-push', 'talk', 'deep', 'How hard should I push when you are avoiding something?'),
  Q('talk-check-in', 'talk', 'light', 'How often would you like me to check in on how you are feeling?'),
  Q('talk-trust', 'talk', 'deep', 'What would make you trust my advice more than you do now?'),

  // taste: what he likes
  Q('taste-music', 'taste', 'light', 'What music have you had on repeat lately?'),
  Q('taste-show', 'taste', 'light', 'What is the last show or film you really loved?'),
  Q('taste-design', 'taste', 'light', 'Which app or product do you think is beautifully made?'),
  Q('taste-style', 'taste', 'light', 'How would you describe your style, clothes and all?'),
  Q('taste-place', 'taste', 'light', 'Which cafe or restaurant would you take a visiting friend to?'),
  Q('taste-dislike', 'taste', 'light', 'What is something popular that you just do not get?'),
  Q('taste-gift', 'taste', 'deep', 'What is the best gift anyone has ever given you?'),
];

export const NO_REPEAT_DAYS = 60;

const byId = new Map(PROFILE_QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id) => byId.get(String(id || '')) || null;

/* ---------------------------------- state ---------------------------------- */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statePath = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'profile-interview.json');

/** { asked: [{ id, on }], thread: { id, followUps } | null } — `on` is an
 *  ISO stamp (UTC, operational). `thread` is the question on the table and
 *  how many follow-ups Nova has asked on it (at most two, then he moves on). */
export async function loadInterviewState() {
  try {
    const s = JSON.parse(await readFile(statePath(), 'utf8'));
    const thread = s?.thread && byId.has(s.thread.id) ? { id: s.thread.id, followUps: Math.max(0, Number(s.thread.followUps) || 0) } : null;
    return { asked: Array.isArray(s?.asked) ? s.asked.filter((a) => a && byId.has(a.id)) : [], thread };
  } catch {
    return { asked: [], thread: null };
  }
}

async function saveState(s) {
  const file = statePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify({ asked: s.asked.slice(-500), thread: s.thread || null }, null, 2));
  await rename(`${file}.tmp`, file);
  return s;
}

/** A bank question was asked: it joins the asked list and opens a thread.
 *  Unknown ids are ignored. */
export async function recordAsked(id, now = new Date()) {
  const s = await loadInterviewState();
  if (!byId.has(String(id || ''))) return s;
  const last = s.asked[s.asked.length - 1];
  if (!last || last.id !== id) s.asked.push({ id, on: now.toISOString() });
  s.thread = { id, followUps: 0 };
  return saveState(s);
}

/** After a conversation turn: moved on to a new question (recordAsked), or
 *  one more follow-up on the question still on the table. */
export async function recordTurn({ questionId = null, movedOn = false } = {}, now = new Date()) {
  if (movedOn) return recordAsked(questionId, now);
  const s = await loadInterviewState();
  if (!byId.has(String(questionId || ''))) return s;
  s.thread = s.thread?.id === questionId ? { id: questionId, followUps: s.thread.followUps + 1 } : { id: questionId, followUps: 1 };
  return saveState(s);
}

/** How many follow-ups the question on the table has had. */
export function followUpsOn(state, questionId) {
  return state?.thread && state.thread.id === questionId ? state.thread.followUps : 0;
}

/* --------------------------------- picking --------------------------------- */

// empty > drafted > short text of his own > a full section
export function thinnessWeight(section) {
  if (!section || !section.text) return 6;
  if (section.drafted) return 3;
  if (section.text.length < 160) return 2;
  return 1;
}

/**
 * The next question, picked by code. Pure: everything it reads is passed in.
 *   mode 'interview': sections weighted by thinness, a random pick among the
 *     eligible; mode 'section': only `key`.
 *   Depth alternates light/deep, starting light (falls back to the other
 *   depth when none of the wanted one is left). Never a question asked in
 *   the last 60 days. null when nothing is eligible.
 */
export function pickQuestion({ profile = null, state = { asked: [] }, mode = 'interview', key = null, now = new Date(), rand = Math.random } = {}) {
  const asked = Array.isArray(state?.asked) ? state.asked : [];
  const cutoff = now.getTime() - NO_REPEAT_DAYS * 86400000;
  const recent = new Set(asked.filter((a) => new Date(a.on).getTime() >= cutoff).map((a) => a.id));
  const lastAsked = [...asked].reverse().map((a) => byId.get(a.id)).find(Boolean);
  const wantDepth = lastAsked ? (lastAsked.depth === 'light' ? 'deep' : 'light') : 'light';

  let pool = PROFILE_QUESTIONS.filter((q) => !recent.has(q.id));
  if (mode === 'section') pool = pool.filter((q) => q.key === key);
  if (!pool.length) return null;
  const ofDepth = pool.filter((q) => q.depth === wantDepth);
  if (ofDepth.length) pool = ofDepth;

  const r = () => { const x = Number(rand()); return Number.isFinite(x) ? Math.min(Math.max(x, 0), 0.999999) : 0; };
  if (mode === 'section') return pool[Math.floor(r() * pool.length)];

  const sections = profile?.sections || [];
  const sectionOf = (k) => sections.find((s) => s.key === k) || null;
  const keys = PROFILE_SECTIONS.map((s) => s.key).filter((k) => pool.some((q) => q.key === k));
  const weights = keys.map((k) => thinnessWeight(sectionOf(k)));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  let chosen = keys[keys.length - 1];
  for (let i = 0; i < keys.length; i++) {
    if (x < weights[i]) { chosen = keys[i]; break; }
    x -= weights[i];
  }
  const inKey = pool.filter((q) => q.key === chosen);
  return inKey[Math.floor(r() * inKey.length)];
}
