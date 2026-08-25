import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

// BOOK TEXT EXTRACTION — Librarian Phase 2's foundation.
//
// A book he OWNS is just a very long transcript to the machinery that
// already exists (chunkTranscript / digestTranscriptCached in watcher.js).
// The only missing piece was turning a file on disk into text. This is that
// piece, and it is deliberately DEPENDENCY-FREE:
//
//   EPUB — an EPUB is a zip of XHTML. `unzip` ships with macOS, the spine
//          order lives in the .opf, and stripping tags is a small parser.
//   PDF  — macOS ships PDFKit. A three-line JXA script gets the full text
//          out of it. Checked before choosing this route: `pdftotext`
//          (poppler) is NOT installed on his machine, so requiring it would
//          have meant a brew install as a hidden prerequisite for a feature
//          that is supposed to just work.
//   TXT/MD — read as-is.
//
// The alternative was an npm dependency (pdfjs-dist) on his server for one
// feature. Native wins: nothing to install, nothing to keep updated, and no
// new supply-chain surface on a machine that holds his whole life.
//
// HONESTY RULE, inherited from librarian.js: this only ever reads a file HE
// PROVIDES. It never fetches, searches for, or reconstructs a book's text.
// Pages built from a file he owns are provenance `read`; the verbatim stays
// in Raw/ under the vault's paraphrase-for-Wiki rule.

export const SUPPORTED = ['.epub', '.pdf', '.txt', '.md', '.markdown'];
// Below this, extraction "succeeded" but produced nothing usable — almost
// always a scanned PDF with no text layer. Saying so is the honest move;
// handing the Librarian 40 characters of noise is not.
export const MIN_USEFUL_CHARS = 500;
// A PDF yielding less than this has no text layer at all — the pages are
// images. Distinct from "short but extracted fine", which needs different
// advice.
export const NO_TEXT_LAYER_CHARS = 80;

export function kindOf(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext === '.epub') return 'epub';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') return 'text';
  return null;
}

/* ------------------------------- XHTML → text ------------------------------ */

// Small and predictable rather than a full HTML parser: EPUB content is
// XHTML, so tags are well-formed. Script/style are dropped entirely (their
// contents are not prose), block elements become newlines so chapters do not
// run together, and entities are decoded.
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”',
};

export function xhtmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
  s = s.replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
  s = s.replace(/[ \t ]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// Reading order comes from the spine, not from filename sort — "ch10" sorts
// before "ch2" and a book read out of order is worse than no book.
export function spineOrder(opfXml) {
  const xml = String(opfXml || '');
  const hrefById = new Map();
  for (const m of xml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = m[0];
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (id && href) hrefById.set(id, decodeURIComponent(href));
  }
  const order = [];
  for (const m of xml.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = /\bidref\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    const href = idref && hrefById.get(idref);
    if (href) order.push(href);
  }
  return order;
}

export function metaFromOpf(opfXml) {
  const xml = String(opfXml || '');
  const grab = (tag) => {
    const m = new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i').exec(xml)
      || new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
    return m ? xhtmlToText(m[1]) : null;
  };
  return { title: grab('title'), author: grab('creator') };
}

/* -------------------------------- extractors ------------------------------- */

async function extractEpub(file) {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-epub-'));
  try {
    // -o overwrite, -qq silent. A malformed EPUB fails here rather than
    // producing half a book.
    await run('unzip', ['-qq', '-o', file, '-d', dir], { maxBuffer: 64 * 1024 * 1024 });
    const containerPath = path.join(dir, 'META-INF', 'container.xml');
    let opfRel = null;
    if (existsSync(containerPath)) {
      const container = await readFile(containerPath, 'utf8');
      opfRel = /full-path\s*=\s*["']([^"']+)["']/i.exec(container)?.[1] || null;
    }
    if (!opfRel) throw new Error('not a readable EPUB (no container.xml rootfile)');
    const opfPath = path.join(dir, opfRel);
    const opf = await readFile(opfPath, 'utf8');
    const base = path.dirname(opfPath);
    const meta = metaFromOpf(opf);
    const chapters = [];
    for (const href of spineOrder(opf)) {
      const p = path.join(base, href.split('#')[0]);
      if (!existsSync(p)) continue;
      const text = xhtmlToText(await readFile(p, 'utf8'));
      if (text) chapters.push(text);
    }
    return { text: chapters.join('\n\n'), meta, parts: chapters.length };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// macOS PDFKit through JXA. The script is passed as an argument rather than
// interpolated into a shell string so a path with quotes or spaces cannot
// break out of it.
const PDF_JXA = `
ObjC.import('Quartz');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const doc = $.PDFDocument.alloc.initWithURL(url);
  if (doc.isNil()) throw new Error('unreadable PDF');
  const s = doc.string;
  return s.isNil ? (s.isNil() ? '' : ObjC.unwrap(s)) : ObjC.unwrap(s);
}
`;

async function extractPdf(file) {
  if (process.platform !== 'darwin') throw new Error('PDF extraction needs macOS PDFKit');
  const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', PDF_JXA, file], {
    maxBuffer: 128 * 1024 * 1024,
  });
  return { text: String(stdout || '').trim(), meta: {}, parts: 1 };
}

/* ---------------------------------- entry ---------------------------------- */

// Returns { text, kind, meta, parts, chars }. Throws with a line he can act
// on — never returns silent garbage. A scanned PDF is the common real case
// and it gets its own message, because "try again" is useless advice there.
export async function extractBookText(file, filename = file) {
  const kind = kindOf(filename);
  if (!kind) {
    throw new Error(`Nova can read ${SUPPORTED.join(', ')} — that file is something else. Export it to text first.`);
  }
  if (!existsSync(file)) throw new Error('file not found');

  let out;
  if (kind === 'epub') out = await extractEpub(file);
  else if (kind === 'pdf') out = await extractPdf(file);
  else out = { text: (await readFile(file, 'utf8')).trim(), meta: {}, parts: 1 };

  const text = String(out.text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < MIN_USEFUL_CHARS) {
    // Two different failures that must not share a message. A PDF yielding
    // almost NOTHING is a scanned image with no text layer — a real and
    // common case with its own remedy. A PDF yielding a few hundred
    // characters extracted perfectly well and is simply short; telling him
    // to run OCR on it would send him off to fix nothing.
    const scanned = kind === 'pdf' && text.length < NO_TEXT_LAYER_CHARS;
    throw new Error(scanned
      ? `That PDF has no text layer — only ${text.length} characters came out, so it is almost certainly scanned images. Run it through OCR, or add the book by title and author and let the Librarian research it instead.`
      : `Only ${text.length} characters came out of that file, and the Librarian needs at least ${MIN_USEFUL_CHARS} to build anything honest from. It extracted cleanly — there just is not much in there.`);
  }
  return { text, kind, meta: out.meta || {}, parts: out.parts || 1, chars: text.length };
}

/* --------------------------- reading lifecycle ----------------------------- */

// The plan's `want-to-read → reading → absorbed`, so Nova knows the
// difference between researched-FOR-him and actually-read-BY-him. Ordered,
// because "further along" is a question the resurfacing picker will want.
export const READING_STATES = ['want-to-read', 'reading', 'absorbed'];

export function normalizeReadingState(v, fallback = null) {
  const s = String(v || '').toLowerCase().trim().replace(/\s+/g, '-');
  return READING_STATES.includes(s) ? s : fallback;
}

// A file he supplied is read BY him; a dossier Nova assembled is researched
// FOR him. That distinction is the whole provenance rule — it must be
// derived from how the pages were made, never guessed or defaulted.
export function provenanceForUpload() { return 'read'; }
