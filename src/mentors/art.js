// Pictures and spring timings every Mentors surface shares (slice 1's, moved
// here in slice 2 so the News page uses the same ones).
import { useEffect, useState } from 'react';
import { resolveMediaSrc } from '../MediaImg.jsx';

// a picture behind the token: undefined while it loads, null when there is none
export function useArt(src) {
  const [url, setUrl] = useState(undefined);
  useEffect(() => {
    let live = true;
    if (!src) { setUrl(null); return undefined; }
    setUrl(undefined);
    resolveMediaSrc(src).then((u) => { if (live) setUrl(u || null); });
    return () => { live = false; };
  }, [src]);
  return url;
}

// the app's spring curves, for the Web Animations API (which takes no var())
export const springEase = (n) => (typeof document === 'undefined' ? 'ease' : getComputedStyle(document.documentElement).getPropertyValue(`--nv-spring-${n}`).trim() || 'cubic-bezier(.32,.72,0,1)');
// and their lengths (--nv-spring-*-ms), so a WAAPI animation runs the whole curve
export const springMs = (n, d) => {
  if (typeof document === 'undefined') return d;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--nv-spring-${n}-ms`));
  return Number.isFinite(v) && v > 0 ? v : d;
};

export const thumbSrc = (vid, hi) => (vid ? `/api/mentors/thumb/${encodeURIComponent(vid)}${hi ? '?size=hi' : ''}` : null);

