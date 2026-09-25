// THE BOARD'S SPEND LINE — pure view logic for what each model lane cost in
// the last week (server/lib/modelSpend.js measures it from the CLI's own
// envelopes; nothing here is estimated). His board used to offer a model per
// lane with no number beside any of them.

// 'claude-sonnet-5' -> 'Sonnet 5', 'claude-haiku-4-5-20251001' -> 'Haiku 4.5';
// an alias or anything unrecognised is returned readable, never mangled.
export function modelName(id) {
  const s = String(id || '');
  const m = s.match(/^claude-(opus|sonnet|haiku|fable)-(.+)$/);
  if (!m) return s ? s[0].toUpperCase() + s.slice(1) : '';
  const parts = m[2].split('-');
  if (/^\d{8}$/.test(parts[parts.length - 1])) parts.pop();
  if (!parts.every((p) => /^\d+$/.test(p))) return s;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${parts.join('.')}`;
}

export function dollars(usd) {
  const v = Number(usd) || 0;
  if (v <= 0) return '$0';
  if (v < 0.01) return '<$0.01';
  if (v >= 10) return `$${Math.round(v)}`;
  return `$${v.toFixed(2)}`;
}

export function seconds(ms) {
  if (!Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

// lanes: the board's lanes, each with `spend` (or null) from getModelPrefs.
// Returns the week's total and, per lane id, the line to draw. `share` is the
// lane's spend against the dearest lane's, so the tracks read as one
// distribution down the board; a lane that spent anything gets a visible
// sliver rather than an empty track.
export function spendView(lanes) {
  const withSpend = (lanes || []).filter((l) => l?.spend);
  const max = Math.max(0, ...withSpend.map((l) => Number(l.spend.usd) || 0));
  const total = withSpend.reduce((sum, l) => sum + (Number(l.spend.usd) || 0), 0);
  const byLane = {};
  for (const l of withSpend) {
    const s = l.spend;
    const usd = Number(s.usd) || 0;
    byLane[l.id] = {
      usd: dollars(usd),
      share: max > 0 ? Math.max(usd > 0 ? 0.02 : 0, usd / max) : 0,
      runs: s.runs,
      detail: [
        `${s.runs} run${s.runs === 1 ? '' : 's'}`,
        seconds(s.medianMs) && `${seconds(s.medianMs)} typical`,
        s.lastModel && `answered by ${modelName(s.lastModel)}`,
      ].filter(Boolean).join(' · '),
      limitHits: s.limitHits || 0,
      errors: s.errors || 0,
    };
  }
  return { total: dollars(total), measured: withSpend.length > 0, byLane };
}
