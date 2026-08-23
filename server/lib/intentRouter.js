// The front door's router — Workstream C1, his standing ask:
//
//   "I shouldn't need to go to many different sections of the platform in
//    order to ask for something like this... friction free is the goal."
//
// One input takes anything — a question, a link, a command, a build request
// — and DETERMINISTIC code decides which existing lane it belongs to. No
// model in the routing decision: a classifier that occasionally sends a
// workout question to the Researcher would be worse than no front door at
// all, and every lane it routes to already exists and is already tested.
//
// The router only DECIDES. Dispatch lives in the route, so a decision can
// always be shown to him before anything runs.

export const LANES = ['watch', 'study', 'research', 'code', 'coach', 'capture', 'play', 'ask', 'book'];

// "add the book Atomic Habits by James Clear" — a Librarian research run.
// Deliberately narrow: needs the word "book" AND a "<title> by <author>"
// shape, so "what does that book say about sleep" still routes to ask, and
// "add book club to my calendar" (no "by") is a capture. Pure and exported
// so the parse is testable on its own.
const BOOK_RE = /\b(?:add|ingest|research|get|read|pull in|bring in)\b[^.?!]{0,30}?\bbook\b\s+(.+?)\s+by\s+(.+?)\s*[.?!]?\s*$/i;
export function parseBookIntent(text) {
  const m = BOOK_RE.exec(String(text || '').trim());
  if (!m) return null;
  const strip = (s) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const title = strip(m[1]);
  const author = strip(m[2]);
  if (!title || !author) return null;
  return { title, author };
}
// "pull up the latest Diary of a CEO video" — a request to WATCH something
// now, as opposed to handing a link to the Watcher to digest. Needs a naming
// verb AND a media noun, so "what did that video say" still routes to ask.
const PLAY_RE = /\b(pull up|put on|play|open|bring up|start)\b[\s\S]{0,60}\b(video|episode|podcast|clip|documentary)\b|\b(video|episode|podcast|clip)\b[\s\S]{0,30}\b(by|from)\b/i;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|twitch\.tv|x\.com|twitter\.com)$/i;
// a channel/profile URL is a BODY OF WORK, not one video — that's a study
const CHANNEL_RE = /youtube\.com\/(@|c\/|channel\/|user\/)|instagram\.com\/[^/]+\/?$|tiktok\.com\/@[^/]+\/?$/i;
const VIDEO_PATH_RE = /watch\?v=|youtu\.be\/|\/reel\/|\/shorts\/|\/video\/|vimeo\.com\/\d+|\/p\/|\/status\//i;

const CODE_RE = /\b(build|implement|refactor|fix the bug|write a (script|test|function)|add a (feature|test)|deploy|commit|pull request|codebase|in nova|to nova|the repo)\b/i;
const STUDY_RE = /\b(analyse|analyze|study|research) (this |their |the )?(creator|channel|account|profile|competitor|person|guy|team)\b|\bevery video\b|\ball (their|his|her) videos\b/i;
const RESEARCH_RE = /\b(research|look up|find out|dig into|what does the (evidence|science) say|sources? on)\b/i;
const COACH_RE = /\b(my (bench|squat|deadlift|press|pull-?ups?|lift|program|routine|volume|macros|protein|sleep|recovery|hrv)|should i (train|deload|lift|eat)|why (is|am) (my|i) .*(stalled|tired|sore|plateau)|reps?|sets?|rpe|deload|hypertrophy|cutting|bulking)\b/i;
const CAPTURE_RE = /^(remind me|remember|note:|todo:|add|buy|log)\b/i;

function urlsIn(text) {
  return String(text || '').match(URL_RE) || [];
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Pure: text in, decision out. `why` is shown to him — a router he can't
// see reasoning for is a black box, and black boxes lose trust the first
// time they route wrong.
export function routeIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return { lane: null, why: 'nothing to route' };
  const urls = urlsIn(raw);
  const prose = raw.replace(URL_RE, ' ').trim();
  const hasStudyWords = STUDY_RE.test(raw);

  if (urls.length) {
    const u = urls[0];
    const host = hostOf(u);
    const isMediaHost = VIDEO_HOSTS.test(host);
    const looksChannel = CHANNEL_RE.test(u) && !VIDEO_PATH_RE.test(u);

    // several media links, or a channel link, or explicit study language →
    // a STUDY: a body of work, not a single artefact
    if (hasStudyWords || looksChannel || urls.filter((x) => VIDEO_HOSTS.test(hostOf(x))).length > 1) {
      return { lane: 'study', urls, prose, why: looksChannel ? 'a channel/profile link is a body of work, not one video' : hasStudyWords ? 'you asked for an analysis of a creator or their whole catalogue' : 'several media links in one request' };
    }
    if (isMediaHost && VIDEO_PATH_RE.test(u)) {
      return { lane: 'watch', urls, prose, why: 'a single video link — the Watcher pulls the transcript and drafts a verdict' };
    }
    return { lane: 'research', urls, prose, why: 'a link to read — the Researcher reads it and cites what it finds' };
  }

  const bookMeta = parseBookIntent(raw);
  if (bookMeta) return { lane: 'book', urls: [], prose: raw, book: bookMeta, why: `a book — the Librarian researches "${bookMeta.title}" and weaves it into your vault` };
  if (hasStudyWords) return { lane: 'study', urls: [], prose: raw, why: 'you asked for a creator/catalogue analysis' };
  if (PLAY_RE.test(raw)) return { lane: 'play', urls: [], prose: raw, why: 'you asked to watch something — Nova finds the newest one and opens it playing' };
  if (CODE_RE.test(raw)) return { lane: 'code', urls: [], prose: raw, why: 'a build/change request — this runs as a Claude Code session inside Nova' };
  if (RESEARCH_RE.test(raw)) return { lane: 'research', urls: [], prose: raw, why: 'you asked for research — the Researcher answers with citations' };
  if (COACH_RE.test(raw)) return { lane: 'coach', urls: [], prose: raw, why: 'a training/nutrition question — the Coach has your full history' };
  if (CAPTURE_RE.test(raw)) return { lane: 'capture', urls: [], prose: raw, why: 'a thing to file — the Inbox classifies and routes it' };
  return { lane: 'ask', urls: [], prose: raw, why: 'a question for Nova, answered from your vault' };
}

export const LANE_LABEL = {
  play: 'PLAY',
  watch: 'WATCH', study: 'STUDY', research: 'RESEARCH',
  code: 'CLAUDE CODE', coach: 'COACH', capture: 'INBOX', ask: 'ASK NOVA', book: 'LIBRARIAN',
};
