// DOCUMENTS IN A REPLY — the one format every agent writes and every surface
// reads (28 Sep 2026).
//
// His ask: "the chat feature is overall limited because it does not produce
// any artefacts or reports or other information that I can interact with and
// open up ... if I were to use Claude directly I know that it would provide me
// with a document or artefact that I can open up instead to view." Coach,
// Ask Nova and the Leader answered a four-day plan as a wall of chat text.
//
// So an agent can put a DOCUMENT in its reply:
//
//   <<<ARTIFACT {"title":"Four-day upper/lower plan","kind":"doc","summary":"..."}
//   # Four-day plan
//   ...markdown, tables, and ```nova panels (the same VIS kinds the glass draws)
//   ARTIFACT>>>
//
// kind "doc" is markdown Nova draws natively in glass; kind "html" is a
// self-contained interactive page Nova runs in a sandboxed frame (a
// calculator, a tracker, a chart he can play with) — the two things Claude
// artefacts are.
//
// SHARED by client and server, like visualBeats.js: the server cuts finished
// documents out of the reply and files them (server/lib/artifacts.js); the
// client uses the same cut on a HALF-ARRIVED reply so a document's body never
// streams into the chat bubble or gets read aloud. One parser, so the two can
// never disagree about where a document begins.
//
// A FORGIVING READER, per the running-glass lesson: "a model-facing format
// needs a forgiving reader, because the prompt is a request and the fields
// are not." Header synonyms are read, a missing header falls back to the
// first heading, and at the end of a reply an unclosed document is closed.

import { normaliseSpec } from './visualBeats.js';

export const OPEN = '<<<ARTIFACT';
export const CLOSE = 'ARTIFACT>>>';
// a filed document in a message: [[artifact:<id>]] on its own line
export const TOKEN_RE = /\[\[artifact:([a-z0-9][a-z0-9-]{3,63})\]\]/gi;
export const PENDING_TOKEN = '[[artifact:pending]]';
export const KINDS = ['doc', 'html'];
export const MAX_BODY = 200_000; // ~50 pages; a runaway reply is clipped, not filed whole

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// the header object ends at its balanced closing brace (strings respected)
function balancedEnd(s, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

const looksHtml = (body) => /^\s*(```html\s*)?(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(body);

/** The header, read forgivingly. Pure. */
export function normaliseHeader(raw, body = '') {
  const h = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const firstHeading = (String(body).match(/^\s*#{1,3}\s+(.+?)\s*$/m) || [])[1] || '';
  const title = (str(h.title) || str(h.name) || str(h.heading) || str(h.label) || firstHeading || 'Untitled document').slice(0, 120);
  const k = str(h.kind || h.type || h.format).toLowerCase();
  const kind = ['html', 'app', 'interactive', 'tool', 'page', 'widget'].includes(k) || (!KINDS.includes(k) && looksHtml(body)) ? 'html' : 'doc';
  const summary = (str(h.summary) || str(h.description) || str(h.caption) || str(h.subtitle)).slice(0, 280);
  const tags = (Array.isArray(h.tags) ? h.tags : []).map((t) => str(t).toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 6);
  const revises = str(h.revises || h.replaces || h.update).slice(0, 64) || null;
  return { title, kind, summary, tags, revises };
}

// an html document may arrive wrapped in a ```html fence — unwrap it
function cleanBody(body, kind) {
  let b = String(body || '').replace(/^\n+/, '').replace(/\s+$/, '');
  if (kind === 'html') {
    const m = b.match(/^```(?:html)?\s*\n([\s\S]*?)\n```\s*$/i);
    if (m) b = m[1];
  }
  return b.length > MAX_BODY ? b.slice(0, MAX_BODY) : b;
}

/**
 * Cut the documents out of a reply.
 *   final:false (streaming) — an unfinished document is withheld and the text
 *     ends with PENDING_TOKEN, so the chat shows "writing a document" instead
 *     of its body.
 *   final:true — an unfinished document is closed at the end of the reply.
 * Returns { text, blocks: [{ n, header, body }], pending: { title } | null }.
 * Each finished block leaves `[[artifact:new-<n>]]` in the text, for the
 * filer to swap for the real id.
 */
export function parseArtifactBlocks(raw, { final = false } = {}) {
  const s = String(raw ?? '');
  const blocks = [];
  let out = '';
  let cursor = 0;
  let pending = null;
  const re = /(^|\n)[ \t]*<<<ARTIFACT\b/g;
  let m;
  while ((m = re.exec(s))) {
    const at = m.index + m[1].length;
    out += s.slice(cursor, at);
    let i = at + m[0].length - m[1].length;
    while (s[i] === ' ' || s[i] === '\t') i += 1;
    let headerRaw = null;
    if (s[i] === '{') {
      const end = balancedEnd(s, i);
      if (end === -1) {
        // the header itself is still arriving
        if (final) { cursor = s.length; break; }
        pending = { title: '' };
        cursor = s.length;
        break;
      }
      try { headerRaw = JSON.parse(s.slice(i, end + 1)); } catch { headerRaw = null; }
      i = end + 1;
    }
    const nl = s.indexOf('\n', i);
    const bodyStart = nl === -1 ? s.length : nl + 1;
    const closeRe = /(^|\n)[ \t]*ARTIFACT>>>[ \t]*(?=\n|$)/g;
    closeRe.lastIndex = Math.max(0, bodyStart - 1);
    const c = closeRe.exec(s);
    if (!c) {
      const body = s.slice(bodyStart);
      if (!final) {
        pending = { title: normaliseHeader(headerRaw, body).title };
        cursor = s.length;
        break;
      }
      const header = normaliseHeader(headerRaw, body);
      if (cleanBody(body, header.kind).trim()) {
        blocks.push({ n: blocks.length, header, body: cleanBody(body, header.kind) });
        out += `[[artifact:new-${blocks.length - 1}]]`;
      }
      cursor = s.length;
      break;
    }
    const body = s.slice(bodyStart, c.index + c[1].length);
    const header = normaliseHeader(headerRaw, body);
    const clean = cleanBody(body, header.kind);
    if (clean.trim()) {
      blocks.push({ n: blocks.length, header, body: clean });
      out += `[[artifact:new-${blocks.length - 1}]]`;
    }
    cursor = c.index + c[0].length;
    re.lastIndex = cursor;
  }
  if (cursor < s.length) out += s.slice(cursor);
  // STREAMING: the opening marker itself can be half-typed at the very end
  // ("…\n<<<ART") — withhold it, or the chat flashes the marker
  if (!final && !pending) {
    const tail = out.match(/(^|\n)[ \t]*(<{1,3}A?R?T?I?F?A?C?T?)$/);
    if (tail && tail[2] && OPEN.startsWith(tail[2]) && tail[2].length >= 1 && /^<+/.test(tail[2])) {
      out = out.slice(0, out.length - tail[0].length + tail[1].length);
    }
  }
  let text = out.replace(/\n{3,}/g, '\n\n');
  if (pending) text = `${text.replace(/\s+$/, '')}${text.trim() ? '\n\n' : ''}${PENDING_TOKEN}`;
  return { text, blocks, pending };
}

/** The ids a message refers to (filed documents only, never placeholders). */
export function artifactIds(text) {
  const ids = [];
  for (const m of String(text || '').matchAll(TOKEN_RE)) {
    const id = m[1].toLowerCase();
    if (id !== 'pending' && !id.startsWith('new-') && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * A message split into prose and document references, for a chat bubble:
 * [{ type:'text', text } | { type:'artifact', id } | { type:'pending', title }].
 * Handles a half-arrived reply too (it runs parseArtifactBlocks first).
 */
export function messageParts(raw, { final = true } = {}) {
  const { text, pending } = parseArtifactBlocks(raw, { final });
  const parts = [];
  let cursor = 0;
  const re = /\[\[artifact:([a-z0-9][a-z0-9-]{3,63})\]\]/gi;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(cursor, m.index);
    if (before.trim()) parts.push({ type: 'text', text: before.replace(/\n+$/, '') });
    const id = m[1].toLowerCase();
    if (id === 'pending') parts.push({ type: 'pending', title: pending?.title || '' });
    else if (!id.startsWith('new-')) parts.push({ type: 'artifact', id });
    cursor = m.index + m[0].length;
  }
  const rest = text.slice(cursor);
  if (rest.trim()) parts.push({ type: 'text', text: rest.replace(/^\n+/, '') });
  return parts;
}

/** What may be SPOKEN: no document bodies, no tokens. */
export function speakableText(raw, { final = false } = {}) {
  const { text } = parseArtifactBlocks(raw, { final });
  // a token sits on its own line: take the line, not just the token
  return text.replace(/\n?[ \t]*\[\[artifact:[^\]]*\]\][ \t]*(?=\n|$)/gi, '').replace(/\[\[artifact:[^\]]*\]\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A doc body as segments: markdown runs and ```nova panels (the VIS kinds
 * the glass already draws: key, steps, metric, bars, list …). A panel that
 * does not normalise stays as its code block, so nothing is silently lost.
 */
export function docSegments(body) {
  const s = String(body || '');
  const segs = [];
  const re = /(^|\n)```(?:nova|nova-panel|panel)[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/g;
  let cursor = 0;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[1].length;
    const md = s.slice(cursor, start);
    if (md.trim()) segs.push({ type: 'md', text: md.replace(/^\n+|\n+$/g, '') });
    let spec = null;
    try { spec = normaliseSpec(JSON.parse(m[2])); } catch { spec = null; }
    if (spec) segs.push({ type: 'panel', spec });
    else segs.push({ type: 'md', text: '```\n' + m[2] + '\n```' });
    cursor = m.index + m[0].length;
  }
  const tail = s.slice(cursor);
  if (tail.trim()) segs.push({ type: 'md', text: tail.replace(/^\n+|\n+$/g, '') });
  return segs;
}
