// TIMING-ALLOW-ORIGIN (22 Nov 2026). The app runs on another origin than this
// server, so the browser hides a request's connect, TLS and time-to-first-byte
// from it unless the response says that origin may read them. The phone's
// turn instrument (src/turnNet.js) needs exactly those to tell a dead
// connection being re-made from a slow path. The header names the request's
// own origin, and only an origin CORS already allows (server/index.js reuses
// its list); never '*'.
export function timingAllowOrigin(allowedOrigins = []) {
  const allowed = new Set((allowedOrigins || []).filter((o) => typeof o === 'string' && o && o !== '*'));
  return (req, res, next) => {
    const origin = req.headers?.origin;
    if (typeof origin === 'string' && allowed.has(origin)) res.setHeader('Timing-Allow-Origin', origin);
    next();
  };
}
