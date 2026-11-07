import { urlsIn, URL_RE } from '../../src/linkKind.js';

// "learn this <link>", "learn from these", "turn this into a playbook": the
// method kept as a playbook his agents apply (lib/playbookLearn.js). Pure, so
// the job grammar (chat, voice, Siri) and the capture path (Quick Capture,
// Telegram) read his words the same way without importing each other.
//
// Only when the sentence OPENS with it, and not for "learn this technique",
// which is the Repertoire's (a technique taught one a day).
const LEARN_LEAD_RE = /^(?:(?:can|could|would) you\s+|please\s+|go\s+(?:and\s+)?)?(?:learn(?:\s+(?:from|what\s+(?:this|these|that|it|they)\s+teach(?:es)?|this|these|that|it|them))|(?:turn|make)\s+(?:this|these|that|it|them)\s+(?:into\s+)?an?\s+(?:playbook|skill)|(?:make|build|write)\s+(?:me\s+)?an?\s+(?:playbook|skill)\s+(?:from|out of|off)|playbook\s+(?:from|of)|watch\s+(?:this|these|that|it|them)\s+(?:and|then)\s+(?:learn|turn|make))/i;
const TECHNIQUE_RE = /\b(?:techniques?|tricks?|tactics?|moves?)\b/i;
const GREETING_RE = /^(?:hey|hi|ok|okay)?[,\s]*(?:nova|jarvis)[,\s]*/i;

/** { urls, purpose } for a learn ask with at least one link, else null. */
export function parseLearnAsk(text) {
  const raw = String(text || '').replace(GREETING_RE, '').trim();
  const urls = urlsIn(raw).map((u) => u.replace(/[.,;:!?)\]]+$/, ''));
  if (!urls.length) return null;
  const prose = raw.replace(URL_RE, ' ').replace(/\s+/g, ' ').replace(/^[\s:,—–-]+|[\s:,—–-]+$/g, '').trim();
  const p = prose.toLowerCase().replace(/[.!]+$/, '').trim();
  if (!LEARN_LEAD_RE.test(p)) return null;
  if (TECHNIQUE_RE.test(p) && !/playbook|skill/i.test(p)) return null;
  const purpose = prose
    .replace(LEARN_LEAD_RE, '')
    .replace(/^\s*(?:this|these|that|it|them|(?:the\s+)?(?:videos?|podcasts?|episodes?|clips?|reels?))\b[\s:,—–-]*/i, '')
    .replace(/^(?:\s*(?:and|to|so that|so)\b)?[\s:,—–-]+/i, '')
    .replace(/^(?:into|as)\s+an?\s+(?:playbook|skill)\b[\s:,—–-]*/i, '')
    .trim();
  return { urls, purpose };
}
