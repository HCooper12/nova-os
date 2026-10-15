// "4 sets on unaudited lifts not counted" (15 Oct 2026, his standing rule:
// no exercise counts until its muscles are audited and he approves them).
// Drawn under every hard-sets figure that left sets out, so a lower number
// never reads as less training. The hollow gold diamond is the house mark
// for "waiting on his decision" (NOVA-METHOD §2b rule 8): the decision is the
// audit card in his Inbox, which the hint names. `u` is uncountedView()'s
// shape (src/weekSets.js); nothing is drawn when nothing was left out.
import './uncounted.css';

export function Uncounted({ u, compact = false, style }) {
  if (!u?.line) return null;
  return (
    <p className={`nv-uc${compact ? ' compact' : ''}`} style={style} role="note">
      <i className="nv-uc-mark" aria-hidden="true" />
      <span className="nv-uc-line">{u.line}</span>
      {!compact && u.hint && <span className="nv-uc-hint">{u.hint}</span>}
    </p>
  );
}
