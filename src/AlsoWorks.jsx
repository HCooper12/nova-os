// "Also works: Triceps ½ · Shoulders ½" — what else a lift trains, under
// wherever its muscle is shown (his ask, 15 Oct 2026). The list comes from
// src/muscleCredit.js (the same table the weekly counts credit at ½); each
// muscle wears its own hue from src/muscleHue.js at half strength. Nothing
// is drawn for a lift that trains only its own muscle.
import './alsoWorks.css';
import { muscleVar } from './muscleHue.js';

export function AlsoWorks({ muscles, label = 'Also works', style }) {
  const list = (muscles || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className="nv-also" style={style}
      aria-label={`${label}: ${list.join(', ')}, each set counting half`}>
      <span className="nv-also-label" aria-hidden="true">{label}</span>
      {list.map((m) => (
        <span key={m} className="nv-also-chip" aria-hidden="true" style={{ '--also-hue': muscleVar(m) }}>
          {m}<b>½</b>
        </span>
      ))}
    </span>
  );
}

// the lighter segment of a two-part bar: indirect credit stacked after the
// solid direct fill. `from` and `width` are percentages of the track.
export function AlsoSegment({ hue, from, width }) {
  if (!(width > 0)) return null;
  return <i className="nv-also-seg" aria-hidden="true" style={{ '--also-hue': hue, left: `${from}%`, width: `${width}%` }} />;
}
