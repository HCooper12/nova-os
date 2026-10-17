// A SILENT 500 IS NOT A RECEIPT. 18 Oct 2026 ledger: GET /api/health-data
// ×12, GET /api/review/today ×2, GET /api/claude-code/changes ×5 — every one
// answered an error status with nothing in the log naming the cause. A
// crash nobody can read back is a crash nobody can fix; the next person (or
// session) just sees "500" and has to reproduce it blind.
//
// `logRequestError` is one app-level log line per failed request — no
// stack dump, just the ISO time, method, path, status and message, plus the
// first real frame (the caller's own code, not node internals) so a grep for
// "err " finds every failure and its origin on one line. It then answers
// JSON {error}, never HTML, never a bare empty body.
//
// `wrapAsync` exists so a route handler can just `throw` instead of
// remembering `try { } catch (err) { next(err) }` at every call site; it
// forwards to whatever error middleware is wired (this one, when it is).

function firstOwnFrame(err) {
  const lines = String(err?.stack || '').split('\n').slice(1);
  const frame = lines.find((l) => l.includes('/server/')) || lines[0] || '';
  return frame.trim();
}

export function statusOf(err) {
  const s = Number(err?.status || err?.statusCode);
  return Number.isInteger(s) && s >= 400 && s < 600 ? s : 500;
}

// Express error-handling middleware: (err, req, res, next). Wire it LAST,
// after every route and after any other middleware, per Express's own rule
// that an error handler must be registered after everything it covers.
export function logRequestError(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = statusOf(err);
  const msg = err?.message || String(err);
  console.error(`err ${new Date().toISOString()} ${req.method} ${req.originalUrl || req.path} ${status} ${msg} | ${firstOwnFrame(err)}`);
  if (res.headersSent) return; // the handler already started a response; nothing more to send
  res.status(status).json({ error: msg });
}

// Wrap an async Express handler so a thrown error (or a rejected promise)
// reaches `next(err)` instead of becoming an unhandled rejection or a hang.
export function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
