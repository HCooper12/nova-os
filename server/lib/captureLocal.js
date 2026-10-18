import { parseWhen } from './whenParser.js';
import { guessCategory, loadCategoryMemory } from './shoppingCategory.js';

// QUICK CAPTURE, CODE FIRST (18 Oct 2026, mockup 103). His ask: "me being
// able to just write toothpaste and nova intelligently identifies that I'm
// adding it to my shopping list", and the features must work without his
// Claude usage. Code claims only what it can read for certain: a thing to
// buy, a plain to-do, a reminder with a time, a labelled note, idea or
// journal line. Everything else goes to the model classifier as before, and
// if no model can answer it waits as Unsorted for him to place (never lost).
//
// Each function returns a RAW decision ({route, confidence, title, reason,
// payload}) that inbox.js runs through normalizeDecision like a model's.

const BUY_RE = /^(?:i need to buy|i need|buy|get|grab|pick up|need(?: to buy)?|we need|out of|run out of|ran out of|restock)\s+(.+)$/i;
// eaten, not to buy: "ate chicken" must never land on the shopping list
const EATEN_RE = /^(?:i\b|ate\b|had\b|just\b|drank\b|eating\b|eaten\b|for (?:breakfast|lunch|dinner)\b)/i;
const TO_LIST_RE = /^(?:add\s+)?(.+?)\s+(?:to|on)\s+(?:the\s+|my\s+)?shopping(?:\s+list)?$/i;
const TODO_VERBS = 'call|ring|phone|email|text|message|msg|book|pay|cancel|renew|fix|clean|send|return|post|sort|organise|organize|schedule|finish|submit|reply|follow up|check|update|order|print|sign|file|apply|register|confirm|chase|reschedule';
const TODO_RE = new RegExp(`^(?:todo:?\\s*|to do:?\\s*)?(?:${TODO_VERBS})\\b`, 'i');
const WORK_RE = /\b(work|client|deck|meeting|boss|team|report|invoice|proposal|slides|project|manager|colleague|office)\b/i;
const FITNESS_RE = /\b(gym|physio|trainer|workout|protein|supplement|creatine|run|stretch)\b/i;
const ERRAND_RE = /\b(post office|bank|pharmacy|chemist|car|rego|mechanic|dry clean|parcel|pick up)\b/i;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// "remind me tomorrow at 9am to stretch" leaves "to stretch" once the time is read
const action = (s) => clean(s).replace(/^(?:to|that|about)\s+/i, '');
const titleOf = (s) => clean(s).replace(/[.?!]+$/, '').slice(0, 60);
const splitItems = (s) => clean(s).split(/\s*(?:,|\band\b|&|\+)\s*/i).map((x) => x.replace(/^(?:some|a|an|more)\s+/i, '').trim()).filter(Boolean);

function todoCategory(text) {
  if (WORK_RE.test(text)) return 'work';
  if (FITNESS_RE.test(text)) return 'fitness';
  if (ERRAND_RE.test(text)) return 'errands';
  return 'personal';
}

export async function classifyLocal(text, now = new Date()) {
  const t = clean(text);
  if (!t || t.length > 300 || /https?:\/\//i.test(t)) return null;
  const memory = await loadCategoryMemory().catch(() => ({}));
  const shop = (names, why) => {
    const items = names.map((name) => ({ name, category: guessCategory(name, memory).category || 'Household & Other' }));
    return { route: 'shopping', confidence: 'high', title: `Buy ${names.join(', ')}`.slice(0, 80), reason: why, payload: { items } };
  };

  // labelled by him: the label is the decision
  let m;
  if ((m = t.match(/^(note|idea|journal)\s*[:\-–]\s*(.+)$/is))) return decisionFor(m[1].toLowerCase(), m[2], now, 'He labelled it');

  // a reminder needs a time code can read; no time, no claim
  if (/^remind me\b/i.test(t)) {
    const w = parseWhen(t.replace(/^remind me\s*(?:to\s+)?/i, ''), now);
    if (w?.when && w.when > now && w.text) {
      return { route: 'reminder', confidence: 'high', title: titleOf(action(w.text)), reason: 'A reminder with a time Nova could read', payload: { text: action(w.text), whenISO: w.when.toISOString() } };
    }
    return null;
  }

  if ((m = t.match(TO_LIST_RE))) return shop(splitItems(m[1]), 'He said the shopping list');
  if ((m = t.match(BUY_RE))) return shop(splitItems(m[1]), 'A thing to buy');

  // bare words that are all known shopping things ("toothpaste", "milk and eggs")
  const parts = splitItems(t);
  if (!EATEN_RE.test(t) && parts.length && parts.length <= 6 && t.split(/\s+/).length <= 8 && !/[?]/.test(t)
    && parts.every((p) => p.split(' ').length <= 3 && guessCategory(p, memory).sure)) {
    return shop(parts, 'Every word is a thing Nova knows you buy');
  }

  if (TODO_RE.test(t) && t.split(/\s+/).length <= 20) {
    const body = t.replace(/^(?:todo:?\s*|to do:?\s*)/i, '');
    return { route: 'todo', confidence: 'high', title: titleOf(body), reason: 'Starts with something to do', payload: { items: [{ text: clean(body), category: todoCategory(body) }] } };
  }
  return null;
}

// HE picked the place (the tag sheet), or labelled it: build that route's
// payload from his own words, by code. `detail` is the extra line he added.
export function decisionFor(route, text, now = new Date(), reason = 'He chose where it goes', detail = '') {
  const words = clean([text, detail].filter(Boolean).join('. '));
  if (!words) return null;
  const title = titleOf(words);
  if (route === 'shopping') {
    const items = splitItems(text).map((name) => ({ name, category: guessCategory(name).category || 'Household & Other' }));
    return { route, confidence: 'high', title: `Buy ${items.map((i) => i.name).join(', ')}`.slice(0, 80), reason, payload: { items } };
  }
  if (route === 'todo') return { route, confidence: 'high', title, reason, payload: { items: [{ text: words, category: todoCategory(words) }] } };
  if (route === 'note') return { route, confidence: 'high', title: title || 'Captured Note', reason, payload: { title: title || 'Captured Note', body: words } };
  if (route === 'journal') return { route, confidence: 'high', title, reason, payload: { text: words } };
  if (route === 'idea') return { route, confidence: 'high', title, reason, payload: { title, hook: words, format: 'short' } };
  if (route === 'reminder') {
    const w = parseWhen(words.replace(/^remind me\s*(?:to\s+)?/i, ''), now);
    if (!w?.when || w.when <= now) return null;
    return { route, confidence: 'high', title: titleOf(action(w.text || words)), reason, payload: { text: action(w.text || words), whenISO: w.when.toISOString() } };
  }
  return null;
}

// What a capture becomes when no model can answer and code could not place
// it: a note waiting for his yes, marked unsorted so the Inbox says so and
// offers the places. Approving files it as the note it already is.
export function unsortedDecision(text) {
  const words = clean(text);
  return {
    route: 'note', confidence: 'low', title: titleOf(words) || 'Captured thought',
    reason: "Claude isn't available, and Nova's own rules couldn't place this. Pick a place, or file it as a note.",
    payload: { title: titleOf(words) || 'Captured Note', body: words },
    unsorted: true,
  };
}

export const REROUTES = ['shopping', 'todo', 'note', 'journal', 'idea', 'reminder'];
