import { captureTag, PLACES } from '../captureTag.js';

// QUICK CAPTURE's view model (mockup 103), shared by both Inbox layouts so
// the box, the receipts and the tag sheet are one thing: this visit's
// captures as rows with the tag naming where each went, and the sheet that
// moves one. Records come from the live Inbox; a capture still in flight is
// the provisional card captureToInbox already puts on the board.
export function quickCaptureModel(st, app) {
  const items = st.liveInbox?.items || [];
  const byId = new Map(items.map((r) => [r.id, r]));
  const rows = (st.qcRecent || []).map((id) => byId.get(id)).filter(Boolean)
    .map((r) => {
      const tag = captureTag(r);
      if (!tag) return null;
      return {
        id: r.id,
        text: r.text,
        tag,
        onTag: tag.movable ? () => app.openCaptureTag(r.id) : null,
        onUndo: r.status === 'filed' ? () => app.inboxAction(r.id, 'undo') : null,
      };
    }).filter(Boolean);
  const open = st.qcSheetId ? byId.get(st.qcSheetId) : null;
  const tag = open ? captureTag(open) : null;
  const here = open?.decision && !open.decision.unsorted && open.status !== 'error' ? open.decision.route : null;
  return {
    rows,
    error: st.qcError || null,
    unsortedNote: rows.some((r) => r.tag.tone === 'unsorted')
      ? "Claude isn't available right now. Nova's own rules filed what they know. Pick a place for the rest, or it sorts itself when Claude is back."
      : null,
    sheet: open ? {
      text: open.text,
      where: here ? `"${open.text}" is in ${tag.label.split(' · ')[0].toLowerCase()} now.` : `"${open.text}" hasn't been placed yet.`,
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
