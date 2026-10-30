import { captureTag, PLACES } from '../captureTag.js';

// QUICK CAPTURE's view model (mockup 103), shared by both Inbox layouts so
// the box, the receipts and the tag sheet are one thing: this visit's
// captures as rows with the tag naming where each went, and the sheet that
// moves one. Records come from the live Inbox; a capture still in flight is
// the provisional card captureToInbox already puts on the board.
const WHERE = { shopping: 'on your shopping list', todo: 'on your to-do list', note: 'a note in your vault', journal: 'in your journal', idea: 'in your ideas', reminder: 'a reminder' };

// A Wishlist add (server/lib/wishlist.js): the ONE open question as taps
// (category, colour or size; priority is never asked), a few up front and
// the rest behind "Show all"; a failed add shows its real cause.
// ONE builder for the taps, shared with the Nova thread's receipt
// (valsNovaThread.js), so a question asked by voice and one asked in Quick
// Capture are the same object answering through the same POST.
export function wishlistAsk(recordId, questions, app) {
  const q = (questions || []).find((x) => x && Array.isArray(x.options) && x.options.length);
  if (!q || !recordId) return null;
  return {
    text: q.ask,
    upFront: q.upFront || 6,
    options: q.options.map((o) => ({ label: o, pick: () => app.answerWishlist(recordId, q.field, o) })),
  };
}

function wishlistExtras(r, app) {
  if (r.status === 'error') return { why: r.error || null };
  if (r.status !== 'filed') return {};
  const ask = wishlistAsk(r.id, r.decision?.payload?.questions, app);
  return ask ? { ask } : {};
}

export function quickCaptureModel(st, app) {
  const items = st.liveInbox?.items || [];
  const byId = new Map(items.map((r) => [r.id, r]));
  const rows = (st.qcRecent || []).map((id) => byId.get(id)).filter(Boolean)
    .map((r) => {
      const tag = captureTag(r);
      if (!tag) return null;
      return {
        id: r.id,
        text: r.kind === 'wishlist' && r.decision?.payload?.draft?.name ? r.decision.payload.draft.name : r.text,
        tag,
        onTag: tag.movable ? () => app.openCaptureTag(r.id) : null,
        onUndo: r.status === 'filed' && (r.kind !== 'wishlist' || r.undoData) ? () => app.inboxAction(r.id, 'undo') : null,
        ...(r.kind === 'wishlist' ? wishlistExtras(r, app) : {}),
      };
    }).filter(Boolean);
  const open = st.qcSheetId ? byId.get(st.qcSheetId) : null;
  const tag = open ? captureTag(open) : null;
  const here = open?.decision && !open.decision.unsorted && open.status !== 'error' ? open.decision.route : null;
  // the real cause the server recorded (plainCause), never a guessed one
  const unsorted = rows.filter((r) => r.tag.tone === 'unsorted');
  const cause = unsorted.map((r) => byId.get(r.id)?.modelCause).find(Boolean);
  return {
    rows,
    error: st.qcError || null,
    unsortedNote: unsorted.length
      ? `${cause ? `${cause}, so ` : ''}Claude couldn't sort ${unsorted.length === 1 ? 'this one' : 'these'}. Nova's own rules filed what they know. Pick a place for the rest, or it sorts itself on the next try.`
      : null,
    sheet: open ? {
      text: open.text,
      where: here ? `"${open.text}" is ${WHERE[here] || 'filed'} now.` : `"${open.text}" hasn't been placed yet.`,
      places: PLACES.map((p) => ({ ...p, current: p.route === here, pick: () => app.rerouteCapture(p.route) })),
      detail: st.qcDetail || '',
      setDetail: (e) => app.setState({ qcDetail: e.target.value }),
      sendDetail: () => app.rerouteCapture(null),
      busy: !!st.qcBusy,
      error: st.qcError || null,
      close: () => app.closeCaptureTag(),
    } : null,
  };
}
