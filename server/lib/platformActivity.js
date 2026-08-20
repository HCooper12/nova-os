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

export async function platformActivityContext() {
  try {
    const { listRecords } = await import('./inboxStore.js');
    const items = (await listRecords()).filter((r) => LANE[r.kind]).slice(0, MAX_ITEMS);
    if (!items.length) return null;
    const lines = items.map((r) => {
      const when = String(r.createdAt || '').slice(0, 10);
      const status = STATUS[r.status] || r.status;
      const err = r.status === 'error' && r.error ? ` (${String(r.error).slice(0, 80)})` : '';
      const result = r.decision?.title ? ` → "${r.decision.title}"` : '';
      const what = String(r.text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
      return `- ${when} · ${LANE[r.kind]} · ${status}${err}: ${what}${result}`;
    });
    return `WHAT HE HAS GIVEN THE PLATFORM LATELY (newest first — the platform's own record, independent of this conversation). Questions like "what was the last video I gave you?" or "what have you watched/studied/researched for me?" are answered from THIS list — the whole platform is your memory, never just the current chat:\n${lines.join('\n')}`;
  } catch {
    return null; // an absent section, never a broken conversation
  }
}
