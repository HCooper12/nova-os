// THE VIEW MODEL, BUILT ONLY WHERE SOMETHING CHANGED (2 Nov 2026, fluidity
// audit finding 2, design/audits/2026-11-02-fluidity-audit.md).
//
// App.renderVals() used to run all 24 builders on every commit: 9.6-10.8 ms
// at 1x and 45-51 ms at 4x, 87-92% of each commit, on screens that showed
// none of what most of them built. This module keeps each builder's last
// result and hands it back when nothing it read has changed since.
//
// HOW "NOTHING IT READ" IS KNOWN. Not from hand-written dependency lists:
// the ctx contract (builders hand derived values to later builders through
// ctx and through the merged view model) is exactly what made a hand list
// fragile (nova-ui-performance, P8, 9 Aug). Instead each builder runs
// against thin proxies that record every read while it runs:
//   - `app.state.<key>` (top-level key, compared by identity: state slices
//     are replaced, never mutated, so a new slice is a new object)
//   - `app.<field>` instance fields read while building (methods are not
//     reads; they run with the proxy as `this`, so what they read is
//     recorded too)
//   - `ctx.<key>` written by an earlier builder (rotation, todayRoutine, ...)
//   - `v.<key>` of the merged view model a stage builder takes
//   - `localStorage.getItem(key)` (getConnection, the screen visits, the
//     Home's seen-markers), recorded while a build runs
//   - the minute: every builder's result carries the minute it was built in
//     and is rebuilt in the next one (in idle time, warmEachMinute), so
//     "today" and "since 06:40" read as before. What is finer than a minute
//     reads as of the build, not the commit: a todo's continuous staleness
//     fraction, and a "minutes ago" that rounds on its own phase can be one
//     behind for under a minute (the verify mode lists exactly these). The
//     one reader that needs the second (the island: standby's end, the lock
//     screen's rest) is rebuilt on every commit.
// A builder whose reads all compare equal is skipped and replays the ctx
// values it wrote last time, so the builders after it see the same ctx.
//
// THE ORDER IS THE CONTRACT. BASE runs first, in this order, each taking
// (app, ctx); then each STAGE takes (app, ctx, merged-so-far). The map of who
// reads whose output is in the audit ("The dependency map"); this list must
// keep that order.
//
// LIVE READS AFTER THE BUILD. A cached result's closures were made in an
// earlier commit. So that they behave like closures made in this one, the
// proxies read the LIVE value once no build is running: `st.x` in a click
// handler reads this.state.x, `ctx.x` reads the latest ctx, `v.x` the latest
// merged model of that stage.
//
// PROOF. composeVals() is the old renderVals body (plus round 2's
// valsMiscScreens stage, a move out of valsMisc), kept as the reference:
// server/test/valsMemo.test.js deep-compares it with the memoised build over
// recorded states and every screen, and `window.__novaValsVerify = true` in
// a running app compares the two on every commit (scripts/fluidity.mjs
// --verify reads the result).
import { valsRecipes } from './valsRecipes.js';
import { valsWorkouts } from './valsWorkouts.js';
import { valsNotes } from './valsNotes.js';
import { valsLibrary } from './valsLibrary.js';
import { valsDocuments } from './valsDocuments.js';
import { valsWishlist } from './valsWishlist.js';
import { valsLeader } from './valsLeader.js';
import { valsPractice } from './valsPractice.js';
import { valsBriefing } from './valsBriefing.js';
import { valsMisc, valsMiscScreens } from './valsMisc.js';
import { valsInbox } from './valsInbox.js';
import { valsTodos } from './valsTodos.js';
import { valsMoney } from './valsMoney.js';
import { valsMission } from './valsMission.js';
import { valsOps } from './valsOps.js';
import { valsChrome, islandView } from './valsChrome.js';
import { valsSummary } from './valsSummary.js';
import { valsIndex } from './valsIndex.js';
import { valsTrainSummary } from './valsTrainSummary.js';
import { valsFuelSummary } from './valsFuelSummary.js';
import { valsInboxSummary } from './valsInboxSummary.js';
import { valsSessionSummary } from './valsSessionSummary.js';
import { valsSettings } from './valsSettings.js';
import { valsNovaThread } from './valsNovaThread.js';
import { lastEdgeGesture, depthOf } from '../edgeBack.js';
import { artifactMeta } from '../artifactClient.js';

// earlier builders add shared derived values to ctx that later ones consume
// (valsMission reads from all three data domains; valsChrome builds the nav
// counts last), so this order is load-bearing
export const BASE = [
  ['recipes', valsRecipes], ['workouts', valsWorkouts], ['notes', valsNotes],
  ['library', valsLibrary], ['documents', valsDocuments], ['wishlist', valsWishlist],
  ['leader', valsLeader], ['practice', valsPractice], ['briefing', valsBriefing],
  ['misc', valsMisc], ['inbox', valsInbox], ['todos', valsTodos], ['money', valsMoney],
  ['mission', valsMission], ['ops', valsOps], ['chrome', valsChrome],
];
// each takes the whole merged model so far and spreads after it
export const STAGES = [
  // the screen-only models (Code, Projects, Stash, summary Shopping), split
  // out of valsMisc on 2 Nov so a tab switch does not rebuild all of misc
  ['miscScreens', valsMiscScreens],
  ['summary', valsSummary], ['index', valsIndex], ['trainSummary', valsTrainSummary],
  ['fuelSummary', valsFuelSummary], ['inboxSummary', valsInboxSummary],
  ['sessionSummary', valsSessionSummary], ['settings', valsSettings], ['novaThread', valsNovaThread],
];

// The reference: renderVals as it was before 2 Nov, every builder on every
// call (with valsMisc's screen-only models as their own stage, the one
// structural move of round 2). Kept for the equivalence test and the in-app
// verify mode.
export function composeVals(app, ctx) {
  const all = {
    ...valsRecipes(app, ctx),
    ...valsWorkouts(app, ctx),
    ...valsNotes(app, ctx),
    ...valsLibrary(app, ctx),
    ...valsDocuments(app, ctx),
    ...valsWishlist(app, ctx),
    ...valsLeader(app, ctx),
    ...valsPractice(app, ctx),
    ...valsBriefing(app, ctx),
    ...valsMisc(app, ctx),
    ...valsInbox(app, ctx),
    ...valsTodos(app, ctx),
    ...valsMoney(app, ctx),
    ...valsMission(app, ctx),
    ...valsOps(app, ctx),
    ...valsChrome(app, ctx),
  };
  // valsMisc's screen-only models (Code, Projects, Stash, summary Shopping);
  // they read misc's codeModelOptions, and nothing after reads them
  const withScreens = { ...all, ...valsMiscScreens(app, ctx, all) };
  // the summary Home reads fields from four of the builders above
  // (practiceCard, macSessionsHeadline, goWorkouts, and valsMission's), so
  // it takes the merged view model and goes last; null off `summary`
  const withSummary = { ...withScreens, ...valsSummary(app, ctx, withScreens) };
  // the Index (P3) reads eight builders' fields — the sidebar's counts, the
  // protein ring, the Home cards' labels — so it takes everything, last of
  // all; null off the Index screen
  const withIndex = { ...withSummary, ...valsIndex(app, ctx, withSummary) };
  // the summary Train page (redesign variation A) reads valsWorkouts and the
  // Home's Training card (valsSummary's trainingCard) from the merged view
  // model; the summary Fuel page (mockup 59 A) reshapes valsRecipes'
  // composer, log, rotation and recipe overlay with Home's own plate
  // fields; the summary Inbox (mockup 60) reads the Inbox's own rows, the
  // loops, the ladder and the proposals. Each takes the whole merged model
  // and spreads nothing another builder set; all three null off `summary`.
  const withTrain = { ...withIndex, ...valsTrainSummary(app, ctx, withIndex) };
  const withFuel = { ...withTrain, ...valsFuelSummary(app, ctx, withTrain) };
  const withInbox = { ...withFuel, ...valsInboxSummary(app, ctx, withFuel) };
  // the summary live session (Train round B, mockup 61) reshapes the
  // classic session's rows and the mid-session Coach fields; last of all,
  // and null off `summary` or whenever the session is not on screen
  const withSession = { ...withInbox, ...valsSessionSummary(app, ctx, withInbox) };
  // Settings (direction A, 7 Oct 2026) reads the voice slice, the settings
  // slice and the rest timer from everything above; null off Settings
  const withSettings = { ...withSession, ...valsSettings(app, ctx, withSession) };
  // the Nova thread (mockup 63 D) reads the classic Voice fields, the glass
  // and the chrome's talk door from everything above; last of all, and null
  // off `summary` or off the Nova tab
  return { ...withSettings, ...valsNovaThread(app, ctx, withSettings) };
}

// INPUTS NO PROXY SEES: three builders read something that is neither App
// state, an instance field, ctx nor localStorage. Each is listed here and
// compared on every commit (found by the verify mode on his data, 2 Nov):
//   - misc: the back-swipe readout (history depth, the last edge gesture)
//   - documents: the viewer's metadata, from artifactClient's module cache,
//     which fills in after the viewer opens
//   - settings: the check page's diagnostics (history depth, the gesture,
//     the switches on screen counted from the DOM)
// the depth, not the entry: every navigation pushes a new entry, and only
// the depth is read (valsMisc's backSwipe)
const historyDepth = () => (typeof window === 'undefined' ? 0 : depthOf(window.history.state));
const gestureKey = () => { const g = lastEdgeGesture(); return g ? JSON.stringify(g) : null; };
const switchesOnScreen = () => (typeof document === 'undefined' ? 0 : document.querySelectorAll('input[type="checkbox"][switch]').length);
const EXTERNAL = {
  misc: () => [historyDepth(), gestureKey()],
  documents: (st) => [st.artifactOpenId ? artifactMeta(st.artifactOpenId) : null],
  settings: (st) => (st.screen === 'settings' ? [historyDepth(), gestureKey(), switchesOnScreen()] : null),
};
const sameList = (a, b) => (a === b) || (!!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])));

// THE MERGED MODEL, WITHOUT THE COPIES. The old renderVals made a new
// object of ~950 keys after every stage (`{ ...withIndex, ...next }`, eight
// times), and the profile put those spreads among the largest single costs
// of a build. A stage now reads a LAYERED view: its own predecessors' outputs,
// newest first, then the base builders' merge. A key a later stage overrides
// (valsSummary's heroTaglineTopic over valsMission's) resolves to the later
// value exactly as the spread did. One copy is made, at the end.
const own = Object.prototype.hasOwnProperty;
const lookup = (layer, k) => {
  for (let j = layer.outs.length - 1; j >= 0; j--) { const o = layer.outs[j]; if (o && own.call(o, k)) return o[k]; }
  return layer.all[k];
};
const layerHas = (layer, k) => layer.outs.some((o) => o && own.call(o, k)) || k in layer.all;
const layerKeys = (layer) => [...new Set([...Reflect.ownKeys(layer.all), ...layer.outs.flatMap((o) => (o ? Reflect.ownKeys(o) : []))])];
const sameLayer = (a, b) => a.all === b.all && a.outs.length === b.outs.length && a.outs.every((o, j) => o === b.outs[j]);

const minuteOf = (ms) => Math.floor(ms / 60000);
const hasLS = () => { try { return typeof Storage !== 'undefined' && typeof localStorage !== 'undefined' && !!localStorage; } catch { return false; } };

// `base`, `stages` and `external` are the lists above; the tests pass small
// ones to pin the mechanism with builders of their own.
export function createValsMemo({ now = () => Date.now(), base = BASE, stages = STAGES, external = EXTERNAL } = {}) {
  let app = null;        // the real App instance (one per memo)
  let cur = null;        // the recorder of the builder running now, or null
  let latestCtx = null;  // the last compose's ctx, for closures read later
  const latestStage = []; // the last compose's layer handed to each stage
  const cache = new Map(); // builder name -> { rec, out }
  let baseParts = null; let baseAll = null; // to reuse the base merge
  let prevMerged = null; // { all, outs, merged }: the last full merge
  const stats = { composes: 0, builders: {} };

  const newRec = (minute, ext) => ({ minute, ext, setState: false, fn: new Set(), owned: new Set(), st: new Map(), inst: new Map(), ctx: new Map(), v: new Map(), ls: new Map(), writes: {}, stateObj: null, vLayer: null, ctxWhole: false });

  // app.state, live: during a build it IS the state being rendered (React
  // sets instance.state before render), and after it the committed state
  const stProxy = new Proxy({}, {
    get(_, k) {
      const v = app.state[k];
      if (cur && typeof k === 'string' && !cur.st.has(k)) cur.st.set(k, v);
      return v;
    },
    has(_, k) {
      if (cur && typeof k === 'string' && !cur.st.has(k)) cur.st.set(k, app.state[k]);
      return k in app.state;
    },
    ownKeys() { if (cur) cur.stateObj = app.state; return Reflect.ownKeys(app.state); },
    getOwnPropertyDescriptor(_, k) {
      if (cur) cur.stateObj = app.state;
      const d = Reflect.getOwnPropertyDescriptor(app.state, k);
      if (d) d.configurable = true;
      return d;
    },
    set(_, k, v) { app.state[k] = v; return true; },
  });

  let appProxy = null;
  const makeAppProxy = () => new Proxy(app, {
    get(t, k, recv) {
      if (k === 'state') return stProxy;
      if (cur && k === 'setState') cur.setState = true;
      const v = Reflect.get(t, k, recv);
      if (cur && typeof k === 'string') { if (typeof v !== 'function') { if (!cur.inst.has(k) && !cur.owned.has(k)) cur.inst.set(k, v); } else cur.fn.add(k); }
      return v;
    },
    // a field the builder writes is its own cache (valsInbox's
    // _inboxItemsMemo, keyed on slices it also reads): not an input
    set(t, k, v) { t[k] = v; if (cur && typeof k === 'string') { cur.inst.delete(k); cur.owned.add(k); } return true; },
  });

  const ctxProxy = (target) => new Proxy(target, {
    get(t, k) {
      if (!cur) return (latestCtx || t)[k];
      if (typeof k === 'string' && !(k in cur.writes) && !cur.ctx.has(k)) cur.ctx.set(k, t[k]);
      return t[k];
    },
    set(t, k, v) { t[k] = v; if (cur) cur.writes[k] = v; return true; },
    ownKeys(t) { if (cur) cur.ctxWhole = true; return Reflect.ownKeys(t); },
    has(t, k) { if (cur && typeof k === 'string' && !(k in cur.writes) && !cur.ctx.has(k)) cur.ctx.set(k, t[k]); return k in t; },
  });

  // the target is an empty object; the layer is held in the closure (a
  // proxy's own-keys answer must agree with its target, so the target stays
  // empty and extensible and every descriptor is reported configurable)
  const stageProxy = (i, layer) => new Proxy({}, {
    get(_, k) {
      const L = cur ? layer : (latestStage[i] || layer);
      const v = lookup(L, k);
      if (cur && typeof k === 'string' && !cur.v.has(k)) cur.v.set(k, v);
      return v;
    },
    has(_, k) {
      const L = cur ? layer : (latestStage[i] || layer);
      if (cur && typeof k === 'string' && !cur.v.has(k)) cur.v.set(k, lookup(L, k));
      return layerHas(L, k);
    },
    ownKeys() { if (cur) cur.vLayer = layer; return layerKeys(cur ? layer : (latestStage[i] || layer)); },
    getOwnPropertyDescriptor(_, k) {
      const L = cur ? layer : (latestStage[i] || layer);
      if (cur) cur.vLayer = layer;
      if (!layerHas(L, k)) return undefined;
      return { value: lookup(L, k), writable: true, enumerable: true, configurable: true };
    },
  });

  // still true? every read compared with what it read last time
  const valid = (rec, minute, ctx, layer, getItem) => {
    if (rec.minute !== minute || rec.ctxWhole) return false;
    if (rec.stateObj && rec.stateObj !== app.state) return false;
    const s = app.state;
    for (const [k, v] of rec.st) if (!Object.is(s[k], v)) return false;
    for (const [k, v] of rec.inst) if (!Object.is(app[k], v)) return false;
    for (const [k, v] of rec.ctx) if (!Object.is(ctx[k], v)) return false;
    if (rec.vLayer && !sameLayer(rec.vLayer, layer)) return false;
    for (const [k, v] of rec.v) if (!Object.is(lookup(layer, k), v)) return false;
    if (rec.ls.size) {
      if (!getItem) return false;
      for (const [k, v] of rec.ls) if (getItem(k) !== v) return false;
    }
    return true;
  };

  const tally = (name, hit, ms) => {
    const b = stats.builders[name] || (stats.builders[name] = { runs: 0, hits: 0, ms: 0 });
    if (hit) b.hits += 1; else { b.runs += 1; b.ms += ms; }
  };

  function compose(realApp, ctx) {
    if (app !== realApp) { app = realApp; appProxy = makeAppProxy(); cache.clear(); baseParts = null; prevMerged = null; }
    stats.composes += 1;
    const minute = minuteOf(now());
    const timing = !!stats.timing || (typeof window !== 'undefined' && !!window.__novaValsTiming);
    // every localStorage read during a build becomes a dependency
    const ls = hasLS() ? Storage.prototype : null;
    const origGetItem = ls ? ls.getItem : null;
    const getItem = origGetItem ? (k) => { try { return origGetItem.call(localStorage, k); } catch { return null; } } : null;
    if (ls) {
      ls.getItem = function (k) {
        const v = origGetItem.call(this, k);
        if (cur && this === localStorage) cur.ls.set(String(k), v);
        return v;
      };
    }
    const cP = ctxProxy(ctx);
    const run = (name, fn, layer, sP) => {
      const hit = cache.get(name);
      const ext = external[name] ? external[name](app.state) : null;
      if (hit && sameList(hit.rec.ext, ext) && valid(hit.rec, minute, ctx, layer, getItem)) {
        Object.assign(ctx, hit.rec.writes);
        tally(name, true, 0);
        return hit.out;
      }
      const rec = newRec(minute, ext);
      const t0 = timing ? performance.now() : 0;
      cur = rec;
      let out;
      try { out = sP ? fn(appProxy, cP, sP) : fn(appProxy, cP); } finally { cur = null; }
      tally(name, false, timing ? performance.now() - t0 : 0);
      cache.set(name, { rec, out });
      return out;
    };
    let result;
    try {
      const parts = base.map(([name, fn]) => run(name, fn, null, null));
      let all;
      if (baseParts && parts.every((p, i) => p === baseParts[i])) all = baseAll;
      else { all = {}; for (const p of parts) Object.assign(all, p); baseParts = parts; baseAll = all; }
      const outs = [];
      stages.forEach(([name, fn], i) => {
        const layer = { all, outs: outs.slice() };
        latestStage[i] = layer;
        outs.push(run(name, fn, layer, stageProxy(i, layer)));
      });
      // the one copy: the same keys, in the same order, as the spreads made
      if (prevMerged && prevMerged.all === all && prevMerged.outs.every((o, j) => o === outs[j])) result = prevMerged.merged;
      else { result = Object.assign({}, all, ...outs); prevMerged = { all, outs, merged: result }; }
    } finally {
      if (ls) ls.getItem = origGetItem;
    }
    latestCtx = ctx;
    // the island reads the clock to the second (standby's end, the lock
    // screen's rest and "touched" window): rebuilt on every commit, exactly
    // as it was, whatever the chrome's cache holds
    return base === BASE ? { ...result, island: islandView(appProxy, app.state, ctx.demoMode) } : result;
  }

  // what each builder read last time it ran (the audit's dependency map is
  // checked against this: scripts/fluidity.mjs stores it as result.memoDeps)
  const inspect = () => {
    const o = {};
    for (const [name, { rec, out }] of cache) {
      o[name] = { keys: Object.keys(out || {}), st: [...rec.st.keys()].sort(), inst: [...rec.inst.keys()].sort(), ctx: [...rec.ctx.keys()].sort(),
        v: [...rec.v.keys()].sort(), ls: [...rec.ls.keys()].sort(), writes: Object.keys(rec.writes).sort(),
        wholeState: !!rec.stateObj, wholeV: !!rec.vLayer, wholeCtx: rec.ctxWhole, setState: rec.setState, external: !!rec.ext, methods: [...rec.fn].sort() };
    }
    return o;
  };
  // THE MINUTE, REBUILT WHEN NOTHING IS HAPPENING. Every result carries the
  // minute it was built in, so the first commit of a new minute would pay
  // for every builder at once, often the first commit of a tap. Instead,
  // just after each minute turns, the view model is built once in idle time
  // (nothing is committed or drawn) and the tap finds it ready.
  const warmEachMinute = (build) => {
    let t = null; let stopped = false;
    const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50));
    const arm = () => {
      if (stopped) return;
      t = setTimeout(() => idle(() => {
        if (stopped) return;
        const hidden = typeof document !== 'undefined' && document.hidden;
        if (app && !hidden) { try { build(); } catch { /* the next commit builds it */ } }
        arm();
      }), 60000 - (now() % 60000) + 40);
    };
    arm();
    return () => { stopped = true; clearTimeout(t); };
  };
  return { compose, stats, inspect, warmEachMinute, reset() { cache.clear(); baseParts = null; prevMerged = null; } };
}

// THE VERIFY MODE. A structural deep-compare of two view models: functions
// compare by their source (a cached closure is the same code from an earlier
// commit), everything else by value. Returns the first `limit` differing
// paths.
export function diffVals(a, b, { limit = 20, path = '', seen = new WeakMap(), out = [] } = {}) {
  const push = (p, why) => { if (out.length < limit) out.push(`${p || '(root)'}: ${why}`); };
  const walk = (x, y, p, depth) => {
    if (out.length >= limit) return;
    if (Object.is(x, y)) return;
    const tx = typeof x; const ty = typeof y;
    if (tx !== ty) { push(p, `${tx} vs ${ty}`); return; }
    if (tx === 'function') { if (String(x) !== String(y)) push(p, 'function source differs'); return; }
    if (tx !== 'object' || x === null || y === null) { push(p, `${JSON.stringify(x)?.slice(0, 80)} vs ${JSON.stringify(y)?.slice(0, 80)}`); return; }
    if (depth > 60) return;
    let s = seen.get(x);
    if (s && s.has(y)) return;
    if (!s) { s = new WeakSet(); seen.set(x, s); }
    s.add(y);
    if (x instanceof Date || y instanceof Date) { if (!(x instanceof Date && y instanceof Date) || x.getTime() !== y.getTime()) push(p, 'date differs'); return; }
    if (Array.isArray(x) !== Array.isArray(y)) { push(p, 'array vs object'); return; }
    if (x instanceof Map || x instanceof Set) {
      const ax = [...x]; const ay = y instanceof Map || y instanceof Set ? [...y] : [];
      walk(ax, ay, `${p}<entries>`, depth + 1);
      return;
    }
    const kx = Object.keys(x); const ky = Object.keys(y);
    if (kx.length !== ky.length || kx.some((k, i) => k !== ky[i])) {
      const sx = new Set(kx); const sy = new Set(ky);
      const only = [...kx.filter((k) => !sy.has(k)).map((k) => `-${k}`), ...ky.filter((k) => !sx.has(k)).map((k) => `+${k}`)];
      if (only.length) { push(p, `keys differ ${only.slice(0, 6).join(' ')}`); return; }
    }
    for (const k of kx) walk(x[k], y[k], p ? `${p}.${k}` : k, depth + 1);
  };
  walk(a, b, path, 0);
  return out;
}

// Build the view model the old way beside the memoised one and keep any
// difference on window.__novaValsDiffs (screen, the first differing paths).
// Runs only with window.__novaValsVerify set: it doubles the commit's cost.
export function verifyVals(app, ctx, memoOut) {
  let diffs;
  try { diffs = diffVals(memoOut, composeVals(app, ctx), { limit: 12 }); } catch (e) { diffs = [`(verify threw) ${e && e.message}`]; }
  const log = window.__novaValsDiffs || (window.__novaValsDiffs = { checked: 0, differed: 0, samples: [] });
  log.checked += 1;
  if (diffs.length) {
    log.differed += 1;
    if (log.samples.length < 60) log.samples.push({ screen: app.state.screen, at: Date.now(), diffs });
  }
}
