import { getRecord, listRecords } from './inboxStore.js';
import { startResearch } from './researcher.js';

// LOOK DEEPER (27 Sep 2026, the summary Inbox, design/mockups/60). His words:
// "the ability to ask for further reasoning and research for a card's
// decision that'll prompt a further research or report to come back with,
// which I should be able to open and view from that same card."
//
// It rides rails that already exist. The Researcher is started exactly as
// POST /api/research starts it (same lane switch, same model gate, same
// citation check, the brief ALWAYS lands pending), with two additions: the
// question is built here from the card's own fields, and the research record
// carries `parentId`, the card's id, so the card can find its report. Nothing
// here files anything: the decision on the card is still his.

// The Researcher refuses a question over 500 characters (researcher.js), so
// the question is the card's title and his words, clamped on a word; the
// full card travels as `context`, which it reads as the material to check.
export const DEEPER_QUESTION_MAX = 500;
const HEAD = 'Look deeper into this: ';
const TAIL = '. Give the reasoning for the proposed filing or change, and what the sources say.';

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function clampOnWord(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

export function deeperQuestion(card) {
  const title = squash(card?.decision?.title);
  const captured = squash(card?.text);
  const parts = [title, captured && captured !== title ? `what he captured: "${captured}"` : ''].filter(Boolean);
  const subject = clampOnWord(parts.join('; ') || 'this Inbox card', DEEPER_QUESTION_MAX - HEAD.length - TAIL.length);
  return `${HEAD}${subject}${TAIL}`;
}

// The card itself, as the material the Researcher checks. Only fields the
// record already carries; nothing inferred.
export function deeperContext(card) {
  const d = card?.decision || {};
  let payload = '';
  try { payload = d.payload ? JSON.stringify(d.payload) : ''; } catch { payload = ''; }
  return [
    `THE INBOX CARD HE ASKED ABOUT (kind ${card?.kind || 'capture'}, from ${card?.source || 'unknown'}).`,
    d.title ? `Its title: ${d.title}` : null,
    card?.text ? `What he captured: ${card.text}` : null,
    d.route ? `What approving would do: file it by the "${d.route}" route${d.confidence ? ` (Nova's confidence: ${d.confidence})` : ''}.` : null,
    d.reason ? `The reason Nova gave: ${d.reason}` : null,
    payload ? `What approving would write: ${payload.slice(0, 5000)}` : null,
  ].filter(Boolean).join('\n').slice(0, 8000);
}

function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Starts the look, or hands back the one already running for this card, so
// a double tap never sends two Researchers after the same question.
export async function startDeeper(vaultPath, id, { model } = {}) {
  const card = await getRecord(id);
  if (!card) throw httpError('not found', 404);
  if (card.status !== 'pending') throw httpError('only a card waiting on his call can be looked into', 409);
  const running = (await listRecords()).find((r) => r.parentId === card.id && r.kind === 'research' && r.status === 'classifying');
  if (running) return { record: running, jobId: running.id, already: true };
  const record = await startResearch(vaultPath, deeperQuestion(card), { model, context: deeperContext(card), parentId: card.id });
  return { record, jobId: record.id, already: false };
}
