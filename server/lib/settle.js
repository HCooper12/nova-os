// THE SETTLE WATCHDOG — a model child that never exits must not leave its
// record 'classifying' forever.
//
// Twenty-four spawn-and-settle lanes awaited a claude child with no clock on
// it. The budget cap bounds SPEND, not time: a hung web fetch inside the
// researcher, a stalled pass anywhere, left a record in-flight until the next
// server restart, when the boot reaper finally flipped it. Nothing at runtime
// ever said "this has been running for two hours". The overnight queue had
// the right instinct for its own polling ("check the Inbox; it may still
// land"); this is that instinct at the child itself.
//
// One line per site. Every lane already composes its failure text as
// `outer.result || stderr.trim() || "claude exited with code N"`, so the
// honest reason is put onto stderr just before the kill and lands exactly
// where each site reads it — no per-site error rewrite, no new shape. The
// child is asked to stop (TERM) and made to (KILL) if it lingers.
//
// Minutes are judgment, so they stay visible at each site: a vault weave can
// honestly take an hour; a classifier that takes five minutes is stuck.

export function settleWatchdog(child, { label = 'the model', minutes = 10 } = {}) {
  const ms = Math.max(1000, minutes * 60_000);
  const message = `${label} did not settle within ${minutes} minute${minutes === 1 ? '' : 's'} — stopped; nothing was written to the vault. Retry when ready.`;
  let timedOut = false;
  let kill = null;
  const timer = setTimeout(() => {
    timedOut = true;
    try { child.stderr?.emit('data', Buffer.from(message)); } catch { /* no stderr pipe — the exit code still fails the site */ }
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
    kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 5_000);
    kill.unref?.();
  }, ms);
  timer.unref?.();
  const clear = () => { clearTimeout(timer); if (kill) clearTimeout(kill); };
  child.once('close', clear);
  child.once('error', clear);
  return { get timedOut() { return timedOut; }, message, clear };
}
