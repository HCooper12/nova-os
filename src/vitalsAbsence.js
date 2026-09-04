// A metric with no data is a HOLE, not a small number.
//
// His report, 4 Sep: the Sleep tile read "—" while his health push had been
// down for two days. The reason was already carried in the tile's `hint`
// field — the data model has been honest about this all along — but the hint
// rendered at 8px and 38% opacity, so what he actually saw was a bare dash
// that looked like a glitch.
//
// Shared, because the same tile is drawn by THREE renderers: the satellite
// cluster and the metric grid in MissionControl.jsx, and MetricTile in
// AppleLayout.jsx (which the structured/cupertino layout uses). Styling two
// of them and missing the third is how a fix ships and the bug survives —
// which is exactly what happened on the first attempt at this one.

export const ABSENT = '—';
export const isAbsent = (m) => m?.value === ABSENT;

// The reason comes forward in the warning tone; the dash goes quiet. A dashed
// underline marks the hole without shouting, matching the "this is missing"
// treatment used elsewhere.
export function absentHintStyle(m, monoVar) {
  return isAbsent(m)
    ? { font: `500 9px ${monoVar}`, marginTop: '3px', letterSpacing: '.1em', color: 'var(--nv-warn)' }
    : { font: `400 8px ${monoVar}`, marginTop: '1px', letterSpacing: '.04em', color: 'var(--nv-ink40)' };
}

export function absentValueStyle(m, colorVar) {
  return isAbsent(m)
    // NO lineHeight here: the tiles set `font` as a shorthand, and adding the
    // longhand back on only some renders makes React drop it on the others —
    // it warns about exactly this, and the result is a tile that shifts height
    // when data arrives.
    ? { color: 'var(--nv-ink40)', borderBottom: '1px dashed color-mix(in srgb, var(--nv-warn) 45%, transparent)', display: 'inline-block' }
    : { color: `var(${colorVar})` };
}
