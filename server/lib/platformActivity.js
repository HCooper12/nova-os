// The front door's own ledger — what he has GIVEN the platform lately
// (videos to watch, creators to study, research questions), read straight
// off the inbox rails. Deterministic: code assembles it, no model involved.
//
// This exists because of a real failure (20 Aug): asked "what's the last
// video I gave you to watch and analyse?", Nova answered from the current
// conversation instead of the platform record. Nova is his second brain —
// the one front door over everything he hands ANY part of the platform,
// with specialists (Coach, Researcher, Studio) working beneath it. A second
// brain that only remembers the current chat is not one.

const LANE = { video: 'video to watch', study: 'creator study', research: 'research question' };
const STATUS = {
  classifying: 'still running',
  pending: 'done — result waiting in his Inbox',
  error: 'FAILED',
  filed: 'done and filed in the vault',
  approved: 'done and filed in the vault',
  discarded: 'he discarded the result',
};
const MAX_ITEMS = 8;

// The pending drafts WITH ENOUGH OF THEIR CONTENT TO DISCUSS. His 21-Aug
// failure: Nova mentioned a Fuel agent draft and then could not open it —
// because inbox records live in server/data/, outside the vault, so none of
// its file tools can reach them. Naming a thing you cannot open is worse
// than staying quiet, so the drafts now ride the context itself.
const DIGEST_MAX = 10;
const DIGEST_CHARS = 420;

export async function inboxDigestContext() {
  try {
    const { listRecords } = await import('./inboxStore.js');
    const allPending = (await listRecords()).filter((r) => r.status === 'pending');
    const pending = allPending.slice(0, DIGEST_MAX);
    if (!pending.length) return null;
    // count BEFORE slicing: 14 drafts rendered as "10 shown" with the total lost
    const shownOf = allPending.length > pending.length ? `${pending.length} of ${allPending.length} shown — the rest are in his Inbox` : `${pending.length} shown`;
    const lines = pending.map((r) => {
      const title = r.decision?.title || String(r.text || '').split('\n')[0];
      const body = r.decision?.payload?.body || r.text || '';
      const flat = String(body).replace(/\s+/g, ' ').trim();
      const shown = flat.slice(0, DIGEST_CHARS);
      return `- [${r.kind} · ${String(r.createdAt || '').slice(0, 10)}] ${String(title).slice(0, 90)}\n  ${shown}${flat.length > DIGEST_CHARS ? ' …(truncated — say so if he wants the rest; it is in his Inbox)' : ''}`;
    });
    return `HIS PENDING DRAFTS, IN FULL ENOUGH TO READ OUT (newest first, ${shownOf}). When he asks you to open, read, summarise or discuss one of these, DO IT FROM HERE — read the actual words back, quote the number that matters, answer follow-ups about it. Never say you cannot open a draft: these are the drafts.\n${lines.join('\n')}`;
  } catch {
    return null;
  }
}

export async function platformActivityContext() {
  try {
    const { listRecords } = await import('./inboxStore.js');
    const all = (await listRecords()).filter((r) => LANE[r.kind]);
    const items = all.slice(0, MAX_ITEMS);
    if (!items.length) return null;
    const capNote = all.length > items.length ? ` ${items.length} of ${all.length} shown — the rest are on the Ops screen.` : '';
    const lines = items.map((r) => {
      const when = String(r.createdAt || '').slice(0, 10);
      const status = STATUS[r.status] || r.status;
      const err = r.status === 'error' && r.error ? ` (${String(r.error).slice(0, 80)})` : '';
      const result = r.decision?.title ? ` → "${r.decision.title}"` : '';
      const what = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
      return `- ${when} · ${LANE[r.kind]} · ${status}${err}: ${what}${result}`;
    });
    return `WHAT HE HAS GIVEN THE PLATFORM LATELY (newest first — the platform's own record, independent of this conversation). Questions like "what was the last video I gave you?" or "what have you watched/studied/researched for me?" are answered from THIS list — the whole platform is your memory, never just the current chat:\n${lines.join('\n')}${capNote}`;
  } catch {
    return null; // an absent section, never a broken conversation
  }
}
