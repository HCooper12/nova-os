#!/usr/bin/env node
// FORM REFERENCE — pull a real lift off video and stand it next to the figure.
//
// His instruction, 12 Sep 2026: "find, watch and analyse videos of the exact
// proper accurate form for all exercises… then compare them against the 3D
// model and continue refining the model until the form and movement of the
// models are precisely accurate as the correct form like the videos."
//
// Until now the figure has been checked against MY idea of correct form, which
// is exactly the kind of unexamined reference that has been wrong six times
// this week. A video of a coach doing the lift is an outside opinion, and the
// only one that settles an argument about what a rep looks like.
//
//   node tools/motion/formref.mjs squat "https://youtube.com/watch?v=..."
//   node tools/motion/formref.mjs --list
//
// Downloads once into tools/motion/ref/ (gitignored), pulls an even spread of
// frames across the rep, and writes a contact sheet next to the recorder's own
// GIF of the same lift so the two can be read side by side.
//
// The video is the reference for SHAPE — where the joints are at the top, at
// the bottom, and through the sticking point. It is not a motion-capture
// source and nothing here pretends to track joints automatically: the
// comparison is made by looking at the two sheets together, and then by
// measuring the rig where they disagree.

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = path.join(HERE, 'ref');
const OUT = path.join(HERE, 'out');
const CATALOGUE = path.join(HERE, 'form-refs.json');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const frames = Number(opt('frames', 8));

async function catalogue() {
  try { return JSON.parse(await readFile(CATALOGUE, 'utf8')); } catch { return {}; }
}

/* One lift: fetch if needed, then a strip of frames across a single rep.
 * `at` is where in the video the clean demonstration rep starts — most form
 * videos open with a minute of talking, and sampling the whole runtime gives
 * a contact sheet of a man explaining a squat rather than doing one. */
async function grab(id, url, at, dur) {
  await mkdir(REF, { recursive: true });
  const vid = path.join(REF, `${id}.mp4`);
  if (!existsSync(vid)) {
    console.log(`  fetching ${id}…`);
    await run('yt-dlp', ['-f', '18/bv*[height<=480]+ba/b', '--no-playlist',
      '--merge-output-format', 'mp4', '-o', vid, url], { maxBuffer: 1 << 26 });
  }
  const sheet = path.join(OUT, `ref-${id}.png`);
  await mkdir(OUT, { recursive: true });
  // an even spread across the rep, tiled in one row, so a glance reads the
  // whole movement the way the recorder's own strip does
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(at), '-t', String(dur),
    '-i', vid, '-vf',
    `fps=${(frames / dur).toFixed(3)},scale=220:-1,tile=${frames}x1`,
    '-frames:v', '1', sheet], { maxBuffer: 1 << 26 });
  console.log(`  ${id.padEnd(20)} ${sheet}`);
  return sheet;
}

/* Where in the video the lift actually happens.
 *
 * Form tutorials open with a minute of someone talking to camera, and a strip
 * sampled blind comes back as eight portraits of a presenter. Scanning the
 * whole runtime sparsely once, and reading the timestamps off the sheet, costs
 * one look and saves guessing for every lift after it. */
async function scan(id, url) {
  await mkdir(REF, { recursive: true });
  const vid = path.join(REF, `${id}.mp4`);
  if (!existsSync(vid)) {
    console.log(`  fetching ${id}…`);
    await run('yt-dlp', ['-f', '18/bv*[height<=480]+ba/b', '--no-playlist',
      '--merge-output-format', 'mp4', '-o', vid, url], { maxBuffer: 1 << 26 });
  }
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'csv=p=0', vid]);
  const dur = Math.max(1, Math.floor(Number(stdout.trim()) || 60));
  await mkdir(OUT, { recursive: true });
  const sheet = path.join(OUT, `scan-${id}.png`);
  // 6x4, evenly spaced: cell k is at k * dur / 24 seconds, so the timestamps
  // are arithmetic rather than burned in — this ffmpeg has no drawtext filter
  // and installing one to label a contact sheet would be a poor trade.
  const n = 24;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', vid, '-vf',
    `fps=${(n / dur).toFixed(4)},scale=170:-1,tile=6x4`,
    '-frames:v', '1', sheet], { maxBuffer: 1 << 26 });
  console.log(`  ${id.padEnd(20)} ${Math.round(dur)}s total · cell k = k*${(dur / n).toFixed(1)}s`);
  console.log(`  ${sheet}`);
}

/* The reference and the figure, one above the other.
 *
 * Two sheets in two files get compared from memory, and memory is exactly the
 * faculty that has been wrong all week. Stacked in one image the disagreement
 * is in front of you: where the trunk sits at the bottom, whether the bar
 * tracks the legs, how straight the arms hang. */
async function compare(id) {
  const ref = path.join(OUT, `ref-${id}.png`);
  const gif = path.join(OUT, `${id}.gif`);
  if (!existsSync(ref)) { console.log(`  ${id}: no reference — grab it first`); return; }
  if (!existsSync(gif)) { console.log(`  ${id}: no recording — run record.mjs ${id}`); return; }
  const mine = path.join(OUT, `mine-${id}.png`);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', gif, '-vf',
    `select='not(mod(n\,2))',scale=220:-1,tile=${frames}x1`, '-frames:v', '1', mine],
    { maxBuffer: 1 << 26 });
  const out = path.join(OUT, `vs-${id}.png`);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', ref, '-i', mine, '-filter_complex',
    '[0]scale=1760:-1[a];[1]scale=1760:-1[b];[a][b]vstack=2', '-frames:v', '1', out],
    { maxBuffer: 1 << 26 });
  console.log(`  ${id.padEnd(20)} ${out}`);
}

async function main() {
  const cat = await catalogue();
  if (argv.includes('--compare')) {
    const cmp = await catalogue();
    const only = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
    for (const id of (only.length ? only : Object.keys(cmp))) await compare(id);
    return;
  }
  if (argv.includes('--scan')) {
    const id = argv[argv.indexOf('--scan') + 1];
    const url = cat[id]?.url || argv[argv.indexOf('--scan') + 2];
    await scan(id, url);
    return;
  }
  if (argv.includes('--list')) {
    const ids = Object.keys(cat);
    console.log(ids.length ? ids.join('\n') : 'no references catalogued yet');
    return;
  }
  const only = argv.filter((a) => !a.startsWith('--')
    && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
  // `id url [at] [dur]` adds one to the catalogue and grabs it
  if (only.length >= 2 && /^https?:/.test(only[1])) {
    const [id, url, at = '0', dur = '6'] = only;
    cat[id] = { url, at: Number(at), dur: Number(dur) };
    await writeFile(CATALOGUE, `${JSON.stringify(cat, null, 2)}\n`);
    await grab(id, url, Number(at), Number(dur));
    return;
  }
  const ids = only.length ? only : Object.keys(cat);
  if (!ids.length) { console.log('nothing catalogued — add one: formref.mjs <id> <url> [at] [dur]'); return; }
  console.log(`form references: ${ids.length}`);
  for (const id of ids) {
    const e = cat[id];
    if (!e) { console.log(`  ${id.padEnd(20)} not catalogued`); continue; }
    try { await grab(id, e.url, e.at, e.dur); }
    catch (err) { console.log(`  ${id.padEnd(20)} FAILED ${err.message.split('\n')[0]}`); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
