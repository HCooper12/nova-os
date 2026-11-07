// WHAT NOVA BELIEVES, ON HOME. One view model for both idioms (the Apple
// layout group under cupertino, the summary card under summary).
//
// His call (7 Nov 2026): about once a week, only when something is worth
// checking, one card in the feed styled as content (not a banner or a pill),
// on an existing Home card slot. It opens the page. No push notification.
// Tapped or dismissed, it is quiet for seven days; the server holds that
// (lib/beliefs.js quietHome), so it holds across his devices.
//
// Nothing here is computed on the phone: the count, the lead belief and the
// reason arrive from the server's read (snapshot slice `beliefsHome`).

export function beliefsHomeCard(st, app) {
  const h = st.liveBeliefsHome;
  if (!h || !h.show || !h.lead || st.demoMode) return null;
  return {
    count: h.count,
    line: h.line,
    lead: h.lead,
    more: h.more || [],
    open: () => app.quietBeliefsHome(true),
    dismiss: () => app.quietBeliefsHome(false),
  };
}
