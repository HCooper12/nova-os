// The ring that fills around the Nova icon while it is held
// (motion/holdToTalk.js useHoldRing drives it; this is only its markup).
export function HoldRing({ ringRef, inset }) {
  return (
    <span ref={ringRef} className="nv-hold-ring" aria-hidden="true" style={inset ? { '--nv-hold-inset': inset } : undefined}>
      <span className="nv-hold-half r"><i /></span>
      <span className="nv-hold-half l"><i /></span>
    </span>
  );
}
