// ---------------------------------------------------------------------------
// NOVA'S OWN EARS — his voice arrives as audio and the Mac turns it into words.
//
// The receipts made this necessary: on his iPhone the browser's speech engine
// has heard him on 1 turn of 21 (server/data/voice/turns.json, grouped by
// device), on the Mac on every real one. The engine starts, stays alive, and
// receives nothing. Whatever the cause inside iOS, a recording does not
// depend on it: the app records with the plain microphone API and posts the
// bytes; a Shortcut on the Action Button records natively and posts the same.
// Either way the words come back from Whisper on this Mac's key.
//
// This file is the pure half: getting the audio OUT of whatever the client
// sent. A Shortcut can send the recording as a raw File body (the documented
// way) or as a Form with a file field (the way a hand-built Shortcut drifts
// to), and both must be heard rather than refused.
// ---------------------------------------------------------------------------

const AUDIO_TYPES = /^(audio|video)\//i;

// The multipart boundary from a Content-Type header, or null. Pure.
export function multipartBoundary(contentType) {
  const m = /multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType || ''));
  return m ? (m[1] || m[2]) : null;
}

// The first file part of a multipart body → { buf, mime, name }, or null.
// Minimal on purpose: one boundary, headers up to the blank line, bytes up to
// the next boundary. Works on Buffers so binary audio is never decoded. Pure.
export function firstMultipartFile(body, boundary) {
  if (!Buffer.isBuffer(body) || !boundary) return null;
  const delim = Buffer.from(`--${boundary}`);
  let at = body.indexOf(delim);
  while (at !== -1) {
    const headStart = at + delim.length + 2;          // skip the CRLF after the boundary
    const headEnd = body.indexOf('\r\n\r\n', headStart);
    if (headEnd === -1) return null;
    const head = body.slice(headStart, headEnd).toString('utf8');
    const next = body.indexOf(delim, headEnd + 4);
    if (next === -1) return null;
    const isFile = /filename=/i.test(head) || /content-type:\s*(audio|video)\//i.test(head);
    if (isFile) {
      const mime = (/content-type:\s*([^\r\n;]+)/i.exec(head)?.[1] || '').trim();
      const name = /filename="([^"]*)"/i.exec(head)?.[1] || '';
      return { buf: body.slice(headEnd + 4, next - 2), mime, name };   // -2: the CRLF before the boundary
    }
    at = next;
  }
  return null;
}

// What the request carried → { buf, mime, name } or an honest error string.
// `hintedType` is the app's own X-Audio-Type header, which beats a generic
// Content-Type because a browser's Blob upload can arrive typed as anything.
export function audioFromRequest(body, contentType = '', hintedType = '') {
  const ct = String(contentType || '').toLowerCase();
  if (!Buffer.isBuffer(body) || !body.length) return { error: 'no audio arrived: the request body was empty' };
  const boundary = multipartBoundary(contentType);
  if (boundary) {
    const part = firstMultipartFile(body, boundary);
    if (!part || !part.buf.length) return { error: 'the form carried no audio file' };
    return { buf: part.buf, mime: hintedType || part.mime || 'audio/mp4', name: part.name };
  }
  // A JSON or text body here is a Shortcut sending the wrong thing (a
  // dictionary instead of the recording). Say so rather than posting text to
  // Whisper and getting silence back.
  if (/^(application\/json|text\/)/.test(ct)) return { error: 'this route takes the recording itself, and a text body arrived. In the Shortcut, set Request Body to File and pick the Recorded Audio' };
  const mime = hintedType || (AUDIO_TYPES.test(ct) ? ct.split(';')[0].trim() : 'audio/mp4');
  return { buf: body, mime, name: '' };
}
