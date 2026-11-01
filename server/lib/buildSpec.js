// A SPEC PER BUILD (1 Nov 2026, Wren parity: atlas-partner lib/spec.mjs and
// lib/jobs.mjs, "a spec before every build"). Wren routes every build
// through a written spec: what is being made, where, and how we would know it
// is done. Nova's Builder started from his brief alone, so when a build came
// back there was nothing written down to check it against except the
// Builder's own account of itself.
//
// Now, before a build spawns, CODE writes the spec from his brief, never a
// model: server/data/builds/<jobId>.spec.md with
//   - the ask: his brief, verbatim;
//   - the paths it may touch: the boundary the lane already enforces (the
//     project folder the kernel walls in, or the workspace the Code screen
//     opened), plus any file the brief names;
//   - the acceptance check, in one sentence: HIS sentence when the brief
//     states one ("done when ...", "make sure ...", "acceptance: ..."), else
//     'none stated'. Code never invents a check he did not give;
//   - the suites to run: the workspace's own lint / build / test scripts
//     (builderGate.gatesFor, the same list Nova runs after the turn), or
//     plainly why there are none.
// The Builder's prompt carries the spec verbatim, and the job's result
// carries spec: { path, check } so the Code screen can show it (no UI yet).
// Operational state, so server/data, not the vault (NOVA-METHOD §2 law 3).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatesFor } from './builderGate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
export const BUILDS_DIR = () => path.join(dataRoot(), 'builds');
export const NONE_STATED = 'none stated';
const CHECK_MAX = 300;
const PATHS_MAX = 20;

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// A sentence of his that states how we would know it worked. Each is matched
// at the start of a sentence (or line), so "check the README" in passing is
// not mistaken for an acceptance test; "make sure" and "verify that" are the
// ways he says it out loud.
const CHECK_LEAD = [
  /^(?:acceptance(?:\s+(?:check|criteria|test))?|definition of done|success(?:\s+criteria)?|done means|check|test|verify|verification)\s*[:-]\s*\S/i,
  /^(?:it(?:'s|\s+is)\s+)?done when\b/i,
  /^(?:you(?:'ll|\s+will)|we(?:'ll|\s+will)|i(?:'ll|\s+will))\s+know\s+(?:it(?:'s|\s+is)\s+(?:done|working)|it\s+works)\s+when\b/i,
  /^it\s+works\s+when\b/i,
  /^(?:please\s+)?(?:make sure|verify that|check that|ensure that|confirm that)\b/i,
];

/** His stated acceptance check, as his own sentence, or null. Pure. */
export function statedCheck(brief) {
  const sentences = String(brief || '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => flat(s).replace(/^[-*•]\s+|^\d+[.)]\s+/, ''))
    .filter(Boolean);
  const hit = sentences.find((s) => CHECK_LEAD.some((re) => re.test(s)));
  if (!hit) return null;
  return hit.length > CHECK_MAX ? `${hit.slice(0, CHECK_MAX - 1).replace(/\s+\S*$/, '')}…` : hit;
}

/** Files and folders the brief names by path ("src/App.jsx", "server/lib/x.js",
 *  "README.md"). URLs are not paths. Pure. */
export function namedPaths(brief) {
  const out = [];
  const re = /(?:^|[\s`'"(])((?:\.{1,2}\/|~\/|\/)?[\w@.-]+(?:\/[\w@.-]+)+\/?|[\w-]+\.(?:jsx?|mjs|cjs|tsx?|json|md|css|scss|html|py|swift|sh|ya?ml|toml|txt))(?=$|[\s`'",;:)!?]|\.(?:\s|$))/g;
  for (const m of String(brief || '').matchAll(re)) {
    const p = m[1].replace(/[.]+$/, '');
    if (!p || /:\/\//.test(p) || /^\d+(?:\/\d+)+$/.test(p) || out.includes(p)) continue;
    out.push(p);
    if (out.length >= PATHS_MAX) break;
  }
  return out;
}

const suiteLine = (g, cwd) => {
  const where = g.cwd && cwd && path.relative(cwd, g.cwd) ? ` (in ${path.relative(cwd, g.cwd)}/)` : '';
  const cmd = g.cmd === 'npm' ? `npm ${g.args.join(' ')}` : `node ${g.args.join(' ')}`;
  return `${g.name}: ${cmd}${where}`;
};

/**
 * The spec, built by code from the brief. Pure (gatesFor reads package.json).
 *   lane 'project': builder.js, a new empty project folder (`dir`), `shell`
 *                   says whether it can run anything at all;
 *   lane 'code':    the Code screen's Builder in workspace `cwd`; `verify`
 *                   false means Nova's checks do not run after this turn.
 * → { jobId, lane, ask, paths, named, check, stated, suites, suitesNote, at }
 */
export function specFromBrief({ jobId, brief, lane = 'code', cwd = null, dir = null, shell = true, verify = true, now = new Date() } = {}) {
  const ask = String(brief || '').trim();
  const stated = statedCheck(ask);
  const named = namedPaths(ask);
  const paths = lane === 'project'
    ? [`${dir} (a new, empty project folder; the operating system refuses any write outside it${shell ? '' : ', and this build has no shell'})`]
    : [`files inside ${cwd} (the workspace the Code screen opened); committing, pushing, history rewrites and reloading the server are blocked`];
  let suites = [];
  let suitesNote = '';
  if (lane === 'project') {
    suitesNote = shell
      ? 'none yet: the folder starts empty. The Builder installs, builds and tests what it makes, and its README names the command that runs it.'
      : 'none can run: this build has no shell, so nothing in it is run before he sees it.';
  } else if (!verify) {
    suitesNote = "none: Nova's checks are off for this run.";
  } else {
    suites = gatesFor(cwd).map((g) => suiteLine(g, cwd));
    if (!suites.length) suitesNote = 'none: this workspace has no lint, build or test scripts.';
  }
  return {
    jobId: String(jobId || ''), lane, ask, paths, named, check: stated || NONE_STATED, stated: !!stated,
    suites, suitesNote, at: new Date(now).toISOString(),
  };
}

/** The spec as the file says it, and as the Builder's prompt carries it. Pure. */
export function specText(spec) {
  const list = (xs) => xs.map((x) => `- ${x}`).join('\n');
  return `# Spec for build ${spec.jobId}

Written by Nova's code from his brief at ${spec.at}, before the Builder started. No model wrote this.

## Ask

${spec.ask}

## Paths it may touch

${list(spec.paths)}
${spec.named.length ? `\nThe brief names: ${spec.named.join(', ')}` : '\nThe brief names no file.'}

## Acceptance check

${spec.stated ? spec.check : `${NONE_STATED}. He gave no check, so none is invented here.`}

## Suites to run

${spec.suites.length ? list(spec.suites) : spec.suitesNote}
`;
}

/** The block the Builder's prompt carries: the spec, verbatim. Pure. */
export function specBlock(spec, text = specText(spec)) {
  return `THE SPEC FOR THIS BUILD (written by Nova's code from his words before you started${spec.path ? `; it is on disk at ${spec.path}` : ''}). Work to it. If its acceptance check says "${NONE_STATED}", he gave none: do not invent one; say plainly in your final reply what you checked instead.

${text}`;
}

/**
 * Write the spec before the build spawns. Sync on purpose: the spawn comes
 * next, and a spec written after the build has started is not a spec. A
 * failed write still returns the spec (the prompt carries it either way) with
 * path null and the reason, so nothing claims a file that is not there.
 * → { ...spec, path, text, error? }
 */
export function writeSpec(spec) {
  const file = path.join(BUILDS_DIR(), `${String(spec.jobId).replace(/[^A-Za-z0-9_-]/g, '') || 'build'}.spec.md`);
  const text = specText(spec);
  try {
    mkdirSync(BUILDS_DIR(), { recursive: true });
    writeFileSync(file, text, 'utf8');
    return { ...spec, path: file, text };
  } catch (e) {
    return { ...spec, path: null, text, error: e.message };
  }
}

/** Build, write and return the spec in one call: what both Builder lanes use. */
export function prepareSpec(opts) {
  return writeSpec(specFromBrief(opts));
}

/** What the job's result carries. */
export const specRef = (spec) => (spec ? { path: spec.path, check: spec.check, ...(spec.error ? { error: spec.error } : {}) } : null);
