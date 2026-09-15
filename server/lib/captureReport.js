// THE CONFIRMED REPORT — what was actually analysed, written by code.
//
// His ask, 15 Sep: "when I give Nova something to analyse and capture I'd like
// a confirmed report with what's been analysed and if anything noteworthy is
// evident from the research."
//
// The word carrying the weight is CONFIRMED. A model asked to describe its own
// coverage writes the coverage it wishes it had — "analysed the full video"
// when the captions never downloaded, "researched widely" when one search
// returned nothing. Every lane that has ever reported on itself has had this
// hole; the study lane patched it by ASKING the model to state coverage in a
// section, which is the same hope in a nicer shape.
//
// So the receipt is not the model's to write. Each fetch stage records what it
// actually got back — a transcript or an exception, eleven frames or none, six
// sources or two — and this module turns those recorded facts into the first
// section of the report. The model is handed the material and fills in
// FINDINGS only, underneath a receipt it never sees a draft of and cannot edit.
//
// The two Method rules this implements, joined: deterministic first (models
// decide, code acts), and honest degradation, never fiction. A capture that
// read nothing says so in the receipt AND is refused findings entirely —
// because the failure mode that matters is not a thin report, it is a
// confident one about a video nobody could open.

/* ------------------------------- the source ------------------------------- */

// "a 42-second Instagram reel by bondwayne", "a 12-minute YouTube video by
// Huberman Lab", "an article at nature.com". Pure, and it never invents: an
// unknown author is simply absent from the sentence rather than guessed.
export function sourceLine(source = {}) {
  const kind = describeKind(source);
  const dur = durationPhrase(source.durationSec);
  const who = String(source.author || '').trim();
  const head = [dur, kind].filter(Boolean).join(' ');
  return `${head}${who ? ` by ${who}` : ''}`;
}

function describeKind(source) {
  const explicit = String(source.kind || '').trim();
  const known = hostOf(source.url);
  // An explicit kind still earns its host: the article path sets kind:'article'
  // as a semantic marker, and a receipt reading "Analysed article" names nothing
  // he could go back and check.
  if (explicit) return known && !explicit.includes(known) ? `${explicit} at ${known}` : explicit;
  const host = known;
  if (!host) return 'source';
  if (/instagram\.com$/.test(host)) return 'Instagram reel';
  if (/(youtube\.com|youtu\.be)$/.test(host)) return 'YouTube video';
  if (/tiktok\.com$/.test(host)) return 'TikTok';
  return `page at ${host}`;
}

export function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch { return null; }
}

// 42 → "42-second"; 250 → "4-minute"; 4_800 → "1h 20m". Null when unknown, so
// the sentence closes over it cleanly instead of saying "0-second".
export function durationPhrase(seconds) {
  const s = Math.round(Number(seconds));
  if (!Number.isFinite(s) || s <= 0) return null;
  if (s < 90) return `${s}-second`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins}-minute`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}-hour`;
}

/* ------------------------------ the evidence ------------------------------ */
//
// Every stage appends one of these. `ok:false` is as valuable as `ok:true` —
// a report whose receipt lists what failed is the only kind he can trust the
// successes in.
//
//   { what: 'Transcript', ok: true, detail: '39 lines · 640 characters', via: 'Whisper (no captions available)' }
//   { what: 'Frames',     ok: false, detail: 'ffmpeg not available' }

export function readEntry(what, ok, detail, via = null) {
  return { what: String(what), ok: !!ok, detail: detail ? String(detail) : null, via: via ? String(via) : null };
}

// What counts as having actually read the thing. Metadata alone does not:
// a title and an uploader is a library card, not the book. This is the gate
// the whole "confirmed" promise rests on, so it is explicit and testable
// rather than implied by whichever fields happen to be truthy.
const SUBSTANTIVE = new Set(['transcript', 'page text', 'captions', 'body', 'frames']);

export function isGrounded(evidence = {}) {
  const read = evidence.read || [];
  const wins = read.filter((r) => r.ok && SUBSTANTIVE.has(String(r.what).toLowerCase()));
  if (!wins.length) {
    return {
      grounded: false,
      why: read.length
        ? `nothing readable came back — ${read.filter((r) => !r.ok).map((r) => `${r.what.toLowerCase()} (${r.detail || 'failed'})`).join('; ')}`
        : 'nothing was fetched',
    };
  }
  // Frames alone are a real read but a partial one — worth saying out loud,
  // because a silent-video read and a transcript read are not the same claim.
  const onlyFrames = wins.every((r) => String(r.what).toLowerCase() === 'frames');
  return { grounded: true, partial: onlyFrames, why: onlyFrames ? 'frames only — nothing was heard, so every claim is from what is visible' : null };
}

/* ------------------------------- the receipt ------------------------------ */

// The report's opening section. Code-built, in full, from recorded facts.
export function coverageSection(evidence = {}) {
  const lines = ['## What was analysed', ''];
  const src = evidence.source || {};
  lines.push(`**Source** — ${sourceLine(src)}${src.title ? `: “${String(src.title).trim()}”` : ''}`);
  if (src.url) lines.push(`${src.url}`);
  lines.push('');

  const read = evidence.read || [];
  if (read.length) {
    lines.push('**Actually read**');
    for (const r of read) {
      const mark = r.ok ? '✓' : '✗';
      const via = r.via ? ` — ${r.via}` : '';
      lines.push(`- ${mark} ${r.what}${r.detail ? `: ${r.detail}` : ''}${via}`);
    }
    lines.push('');
  }

  const res = evidence.research;
  if (res) {
    const bits = [];
    if (Number.isFinite(res.consulted)) bits.push(`${res.consulted} source${res.consulted === 1 ? '' : 's'} consulted`);
    if (Number.isFinite(res.cited)) bits.push(`${res.cited} cited`);
    lines.push(`**Research** — ${bits.length ? bits.join(', ') : 'ran'}${res.failed?.length ? `; could not reach: ${res.failed.join(', ')}` : ''}`);
    lines.push('');
  }

  const { grounded, partial, why } = isGrounded(evidence);
  if (!grounded) lines.push(`**Not analysed.** ${capitalise(why)}. No findings are offered below — there is nothing honest to base them on.`);
  else if (partial) lines.push(`**Partial read.** ${capitalise(why)}.`);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The one sentence that goes where a whole section will not fit: the Home
// card, the Telegram message, the spoken confirmation. Same facts, one line.
export function confirmLine(evidence = {}) {
  const { grounded, partial } = isGrounded(evidence);
  const src = evidence.source || {};
  const what = sourceLine(src);
  if (!grounded) return `Could not analyse ${what} — ${isGrounded(evidence).why}.`;
  const bits = [];
  const read = (evidence.read || []).filter((r) => r.ok);
  const t = read.find((r) => /transcript|captions/i.test(r.what));
  if (t) bits.push('transcript read');
  const f = read.find((r) => /frames/i.test(r.what));
  if (f) bits.push(f.detail && /^\d+/.test(f.detail) ? `${f.detail.match(/^\d+/)[0]} frames seen` : 'frames seen');
  const pg = read.find((r) => /page text|body/i.test(r.what));
  if (pg) bits.push(pg.detail && /^\d+/.test(pg.detail) ? `${Number(pg.detail.match(/^\d+/)[0]).toLocaleString()} characters read` : 'page read');
  const res = evidence.research;
  if (res && Number.isFinite(res.cited)) bits.push(`${res.cited} source${res.cited === 1 ? '' : 's'} cited`);
  return `Analysed ${what}${bits.length ? ` — ${bits.join(', ')}` : ''}${partial ? ' (frames only)' : ''}.`;
}

function capitalise(s) {
  const str = String(s || '');
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

/* ------------------------------- assembly -------------------------------- */

// Join the code-built receipt to the model-written findings, in his order:
// what was analysed, then what is noteworthy, then the rest. Refuses to
// assemble findings at all when the evidence does not support any — the
// caller gets a report that says why instead of one that pretends.
export function assembleReport({ evidence, findings = '', title = '' } = {}) {
  const { grounded } = isGrounded(evidence);
  const head = title ? `# ${title}\n\n` : '';
  const receipt = coverageSection(evidence);
  if (!grounded) return `${head}${receipt}`.trim();
  const body = String(findings || '').trim();
  if (!body) return `${head}${receipt}\n\n_The read succeeded but no findings came back._`.trim();
  return `${head}${receipt}\n\n${body}`.trim();
}
