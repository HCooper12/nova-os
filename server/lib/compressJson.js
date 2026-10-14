import { promisify } from 'node:util';
import zlib from 'node:zlib';

// THE SYNC WAS 1.9 MB OF PLAIN JSON (measured 14 Oct 2026): over his phone's
// mobile data and Tailscale that took 5 to 6 seconds, and a stall mid-body
// read on the phone as "Backend unreachable". Nothing on this server
// compressed. Big JSON answers now go out brotli (or gzip) when the client
// says it accepts it, which every browser and WKWebView does: ~6x smaller.

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const MIN_BYTES = 8 * 1024; // below this the saving is not worth the CPU

export function pickEncoding(acceptEncoding = '') {
  const a = String(acceptEncoding).toLowerCase();
  if (/\bbr\b/.test(a)) return 'br';
  if (/\bgzip\b/.test(a)) return 'gzip';
  return null;
}

export async function sendJson(req, res, body) {
  const raw = Buffer.from(JSON.stringify(body));
  const enc = raw.length >= MIN_BYTES ? pickEncoding(req.headers['accept-encoding']) : null;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Accept-Encoding');
  if (!enc) return res.end(raw);
  const out = enc === 'br'
    ? await brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
    : await gzip(raw, { level: 6 });
  res.setHeader('Content-Encoding', enc);
  res.setHeader('Content-Length', out.length);
  return res.end(out);
}
