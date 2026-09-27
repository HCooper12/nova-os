// The Leader box's hue per face, as a --nv-* token NAME. The situation face
// earns a colour of its own: it is not the day's idea, and a stale one is a
// question outstanding rather than a warning.
//
// Its own module (not an export of LeaderBox.jsx, where fast refresh wants
// components only) because two surfaces read it: the box's own lit panel,
// and the summary Home's lit card, which draws the box bare and lights its
// own material in the same hue. One table, so the two cannot disagree.
const ACCENT = { lead: '--nv-gold', situation: '--nv-vi' };

export const leaderAccent = (box) => ACCENT[box?.face?.key] || '--nv-cy';
