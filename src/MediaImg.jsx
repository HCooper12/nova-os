// A PICTURE FROM NOVA'S OWN ORIGIN (8 Nov 2026, the Rose wall).
//
// Every picture the glass shows — a page's cover, a clip's poster, an image
// a panel fetched — is cached on the Mac and served at /api/briefing/media/…
// (server/lib/briefingMedia.js), which needs his token, from an origin that
// is not the page's. So an <img src="/api/…"> never loads: measured on the
// first wall, every poster a black box. This swaps the path for a blob URL
// fetched with the token, once per path, and draws nothing until it has it.
// A plain https:// or blob: src is used as it is.
import { useEffect, useState } from 'react';
import { api, getConnection } from './api.js';

const cache = new Map();   // apiPath -> blob url | null (a miss stays a miss)
const pending = new Map(); // apiPath -> promise

export function resolveMediaSrc(src) {
  const s = String(src || '');
  if (!s.startsWith('/api/')) return Promise.resolve(s || null);
  if (cache.has(s)) return Promise.resolve(cache.get(s));
  if (!pending.has(s)) {
    pending.set(s, api.mediaBlobUrl(getConnection(), s).then((u) => { cache.set(s, u); pending.delete(s); return u; }).catch(() => { cache.set(s, null); pending.delete(s); return null; }));
  }
  return pending.get(s);
}

export function useMediaSrc(src) {
  const s = String(src || '');
  const [url, setUrl] = useState(() => (s.startsWith('/api/') ? cache.get(s) ?? null : s || null));
  useEffect(() => {
    let live = true;
    if (!s) { setUrl(null); return undefined; }
    if (!s.startsWith('/api/')) { setUrl(s); return undefined; }
    resolveMediaSrc(s).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [s]);
  return url;
}

export function MediaImg({ src, alt = '', style, ...rest }) {
  const url = useMediaSrc(src);
  if (!url) return null;
  return <img src={url} alt={alt} style={style} {...rest} />;
}
