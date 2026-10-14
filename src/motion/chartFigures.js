// THE CHART MORPH'S NUMBERS (src/motion/ChartMorph.jsx), kept apart from the
// component so they can be read and tested on their own. Pure.

// the session volumes, oldest first, from the panel's newest-first rows
export function volumePoints(recent) {
  const rows = (recent || []).filter((r) => Array.isArray(r.setRows) && r.setRows.length);
  return rows
    .map((r) => ({
      key: r.date,
      date: r.date,
      value: Math.round(r.setRows.reduce((n, x) => n + (Number(x.weight) || 0) * (Number(x.reps) || 0), 0)),
    }))
    .filter((p) => p.value > 0)
    .reverse();
}

// first to last, as he would say it: "+35%", "−8%", "0%"
export function changeFigure(points) {
  if (!points || points.length < 2) return null;
  const a = points[0].value;
  const b = points[points.length - 1].value;
  if (!(a > 0)) return null;
  const pct = Math.round(((b - a) / a) * 100);
  return { pct, text: pct > 0 ? `+${pct}%` : pct < 0 ? `−${Math.abs(pct)}%` : '0%', from: a, to: b };
}
