#!/usr/bin/env node
// THE EARS SCORECARD (2 Nov 2026). Shadow mode (lib/sttShadow.js) hears every
// real spoken turn twice, Groq's words used and the local ears' compared, and
// writes one row per turn to server/data/voice/stt-shadow.jsonl. This reads
// them back into the numbers his 19 Oct condition turns on: is the local
// transcriber as accurate as Groq on HIS recordings, and fast enough to be
// the default?
//
//   node server/scripts/sttShadowReport.mjs [--all] [--json]
//
//   --all   include the rotated file (stt-shadow.1.jsonl), the 2,000 before
//   --json  the summary as JSON, for another script
//
// Read-only. Rows hold no audio and no full transcript (first 40 chars of
// each side only), so neither does this output.
import { readShadowRows, summarise, SHADOW_PATH, AGREE_WER } from '../lib/sttShadow.js';

const args = new Set(process.argv.slice(2));
const rows = await readShadowRows({ includeRotated: args.has('--all') });
const s = summarise(rows);

if (args.has('--json')) {
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}

const ms = (v) => (v == null ? '-' : `${v} ms`);
const pct = (v) => (v == null ? '-' : `${Math.round(v * 1000) / 10}%`);
console.log(`stt shadow: ${SHADOW_PATH()}${args.has('--all') ? ' (+ rotated)' : ''}`);
if (!rows.length) {
  console.log('no rows yet. Shadow runs when NOVA_STT_PROVIDER=shadow (the default once server/voice-stt/setup.sh has run) and a spoken turn arrives.');
  process.exit(0);
}
const span = `${rows[0].at} → ${rows[rows.length - 1].at}`;
console.log(`rows ${s.rows} (compared ${s.compared}, local failed ${s.localErrors})   ${span}`);
console.log('');
console.log(`                median     p90`);
console.log(`groq            ${ms(s.groqMs.median).padEnd(10)} ${ms(s.groqMs.p90)}`);
console.log(`local           ${ms(s.localMs.median).padEnd(10)} ${ms(s.localMs.p90)}`);
console.log(`local (warm)    ${ms(s.localWarmMs.median).padEnd(10)} ${ms(s.localWarmMs.p90)}`);
console.log('');
console.log(`mean WER (local vs groq)  ${s.meanWer ?? '-'}`);
console.log(`agreement (WER <= ${AGREE_WER})    ${pct(s.agreement)}`);
const byDevice = {};
for (const r of rows.filter((x) => Number.isFinite(x.wer))) {
  const k = `${r.device || '?'} · ${r.source || '?'}`;
  (byDevice[k] ||= []).push(r);
}
if (Object.keys(byDevice).length > 1) {
  console.log('');
  for (const [k, rs] of Object.entries(byDevice)) {
    console.log(`  ${k.padEnd(24)} ${String(rs.length).padStart(4)} rows   agree ${pct(rs.filter((r) => r.agree).length / rs.length)}`);
  }
}
if (s.worst.length) {
  console.log('');
  console.log('the ten worst (first 40 chars of each):');
  for (const r of s.worst) {
    console.log(`  WER ${String(r.wer).padEnd(6)} ${r.at.slice(0, 16)} ${r.device || ''}`);
    console.log(`    groq:  ${JSON.stringify(r.groqHead || '')}`);
    console.log(`    local: ${JSON.stringify(r.localHead || '')}`);
  }
}
