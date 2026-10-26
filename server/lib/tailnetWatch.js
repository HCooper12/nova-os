// THE ROAD TO HIS PHONE (27 Oct 2026). Nova's server lives on the Mac; his
// phone reaches it only through Tailscale. That morning Tailscale on the Mac
// had switched itself off (his widget's last request landed at 00:56; at
// 10:46 his phone said "Fetch is aborted" and he could not open Nova). The
// server was healthy the whole time and nothing noticed: the tailnet address
// was checked once, at boot, and `tailscale ip -4` prints the address even
// while Tailscale is stopped, so the retry failed with EADDRNOTAVAIL every
// minute without ever saying why.
//
// His rule, that morning: "I should be able to access and open Nova at any
// time." So this watches the real state (`tailscale status --json`,
// BackendState) every minute, and when Tailscale is Stopped it turns it back
// on with the same settings it had (`tailscale up`, restating the flags
// Tailscale itself names when it refuses a bare `up`), then tells him on
// Telegram, which does not need the tailnet. A state code cannot fix
// (NeedsLogin: the Mac must be signed in again) is said plainly instead.
// NOVA_TAILNET_AUTOUP=0 turns the reconnect off and keeps the telling.
//
// Pure parts are exported for tests; `exec` and `tell` are injected.

/** `tailscale status --json` text → { state, ip } (state null when unreadable). */
export function parseTailscaleStatus(text) {
  try {
    const d = JSON.parse(String(text || ''));
    const ips = Array.isArray(d?.Self?.TailscaleIPs) ? d.Self.TailscaleIPs : [];
    return { state: typeof d?.BackendState === 'string' ? d.BackendState : null, ip: ips.find((x) => /^100\./.test(x)) || null };
  } catch {
    return { state: null, ip: null };
  }
}

/** Tailscale refuses a bare `tailscale up` when non-default flags are set, and
 *  prints the command that keeps them ("tailscale up --accept-routes"). Return
 *  just those flags, or null. Only `--flag` / `--flag=value` tokens are taken,
 *  so nothing else in the message can become an argument. */
export function suggestedUpFlags(text) {
  const m = String(text || '').match(/^\s*tailscale up((?:\s+--[a-z][a-z0-9-]*(?:=\S*)?)+)\s*$/m);
  if (!m) return null;
  const flags = m[1].trim().split(/\s+/).filter((f) => /^--[a-z][a-z0-9-]*(=\S*)?$/.test(f) && !/^--timeout\b/.test(f));
  return flags.length ? flags : null;
}

const hhmm = (t) => new Date(t).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' });

/**
 * One watcher. `exec(args)` runs the tailscale CLI and resolves { ok, stdout,
 * stderr }; `tell(text)` messages him; `onUp(ip)` / `onDown()` let the server
 * (re)bind or drop its tailnet listener. `tick()` is one check, exported so a
 * test drives it without timers.
 */
export function createTailnetWatch({ exec, tell = async () => {}, onUp = () => {}, onDown = () => {}, autoUp = process.env.NOVA_TAILNET_AUTOUP !== '0', now = () => Date.now(), log = console.log } = {}) {
  let lastState = null;
  let downSince = null;
  let toldDown = false;
  let lastUpTry = 0;

  async function reconnect() {
    let out = await exec(['up', '--timeout=20s']);
    if (!out.ok) {
      const flags = suggestedUpFlags(`${out.stderr || ''}\n${out.stdout || ''}`);
      if (flags) out = await exec(['up', '--timeout=20s', ...flags]);
    }
    return out;
  }

  async function tick() {
    const st = await exec(['status', '--json']);
    const { state, ip } = parseTailscaleStatus(st.stdout);
    if (state === 'Running') {
      if (lastState !== 'Running') {
        if (downSince) {
          const msg = `Nova is reachable from your phone again. Tailscale on the Mac was off from about ${hhmm(downSince)} to ${hhmm(now())}${toldDown ? '' : ', and is back on now'}.`;
          log(`tailnet watch: Tailscale running again (${ip || 'no 100.x address'})`);
          await tell(msg).catch(() => {});
        }
        downSince = null;
        toldDown = false;
        onUp(ip);
      }
      lastState = state;
      return { state, ip, action: null };
    }
    // not running: Stopped, NeedsLogin, Starting, or unreadable
    if (lastState === 'Running' || lastState === null) onDown();
    if (!downSince) downSince = now();
    lastState = state;
    if (state === 'Stopped' && autoUp && now() - lastUpTry > 55_000) {
      lastUpTry = now();
      log('tailnet watch: Tailscale is stopped on the Mac; turning it back on');
      const out = await reconnect();
      if (out.ok) return { state, ip, action: 'up' };
      const why = String(out.stderr || out.stdout || 'no reason given').trim().split('\n')[0].slice(0, 200);
      log(`tailnet watch: tailscale up failed: ${why}`);
      if (!toldDown) {
        toldDown = true;
        await tell(`Your phone cannot reach Nova: Tailscale on the Mac is off and turning it back on failed (${why}). Open Tailscale on the Mac to fix it.`).catch(() => {});
      }
      return { state, ip, action: 'up-failed' };
    }
    if (!toldDown && (state === 'NeedsLogin' || state === 'Stopped' || (state === null && now() - downSince > 3 * 60_000))) {
      toldDown = true;
      const why = state === 'NeedsLogin' ? 'Tailscale on the Mac needs you to sign in again'
        : state === 'Stopped' ? 'Tailscale on the Mac is switched off'
          : 'Tailscale on the Mac is not answering';
      await tell(`Your phone cannot reach Nova: ${why}. Nova itself is running.`).catch(() => {});
    }
    return { state, ip, action: null };
  }

  return { tick, get state() { return lastState; } };
}
