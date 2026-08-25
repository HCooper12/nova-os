// Book text extraction (Librarian Phase 2). Deliberately dependency-free:
// EPUB is a zip of XHTML, PDF goes through macOS PDFKit. The properties that
// matter are reading ORDER (from the spine, never filenames), that markup and
// scripts never reach the Librarian as prose, and that a file which yields
// nothing says so instead of handing over garbage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  xhtmlToText, spineOrder, metaFromOpf, kindOf, extractBookText,
  normalizeReadingState, READING_STATES, provenanceForUpload, MIN_USEFUL_CHARS,
} from '../lib/bookText.js';

const run = promisify(execFile);
const PARA = 'Deliberate practice is not repetition. Repetition entrenches what you already do; practice restructures it. ';

test('xhtmlToText: markup, scripts and styles never reach the prose', () => {
  const out = xhtmlToText('<html><head><style>p{color:red}</style></head><body><h1>T</h1><p>Real <em>text</em>.</p><script>bad()</script></body></html>');
  assert.match(out, /Real text\./);
  assert.doesNotMatch(out, /color:red|bad\(\)|<[a-z]/i);
});

test('xhtmlToText: entities decode, blocks become breaks', () => {
  const out = xhtmlToText('<p>A &amp; B &#8212; C</p><p>Second</p>');
  assert.match(out, /A & B — C/);
  assert.match(out, /\n\n/, 'paragraphs do not run together');
});

test('spineOrder: reading order comes from the spine, not the filenames', () => {
  const opf = `<package><manifest>
    <item id="a" href="ch10.xhtml"/><item id="b" href="ch2.xhtml"/>
  </manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>`;
  // filename sort would put ch10 after ch2 and silently scramble the book
  assert.deepEqual(spineOrder(opf), ['ch10.xhtml', 'ch2.xhtml']);
});

test('metaFromOpf: title and author come from the file when he does not type them', () => {
  const opf = '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Deep Work</dc:title><dc:creator>Cal Newport</dc:creator></metadata>';
  assert.deepEqual(metaFromOpf(opf), { title: 'Deep Work', author: 'Cal Newport' });
});

test('kindOf: only the formats Nova can actually read', () => {
  assert.equal(kindOf('a.epub'), 'epub');
  assert.equal(kindOf('a.PDF'), 'pdf');
  assert.equal(kindOf('notes.md'), 'text');
  assert.equal(kindOf('book.mobi'), null, 'an unreadable format is refused, not attempted');
  assert.equal(kindOf(''), null);
});

test('reading lifecycle: only the three real states, unknown input falls back', () => {
  assert.deepEqual(READING_STATES, ['want-to-read', 'reading', 'absorbed']);
  assert.equal(normalizeReadingState('Absorbed'), 'absorbed');
  assert.equal(normalizeReadingState('want to read'), 'want-to-read');
  assert.equal(normalizeReadingState('nonsense'), null);
  assert.equal(normalizeReadingState('nonsense', 'absorbed'), 'absorbed');
  assert.equal(provenanceForUpload(), 'read', 'a file he supplied was read BY him');
});

test('a file that yields almost nothing refuses rather than handing over noise', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-bt-'));
  try {
    const f = path.join(dir, 'tiny.txt');
    await writeFile(f, 'too short');
    await assert.rejects(() => extractBookText(f), (e) => {
      assert.match(e.message, new RegExp(String(MIN_USEFUL_CHARS)));
      assert.match(e.message, /extracted cleanly/, 'short-but-fine is not diagnosed as a scan');
      return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an unsupported format is refused with what to do instead', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-bt-'));
  try {
    const f = path.join(dir, 'book.mobi');
    await writeFile(f, PARA.repeat(20));
    await assert.rejects(() => extractBookText(f), /Export it to text first/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('EPUB end-to-end: real zip, spine order honoured, metadata read', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-epub-t-'));
  try {
    const root = path.join(dir, 'src');
    await mkdir(path.join(root, 'META-INF'), { recursive: true });
    await mkdir(path.join(root, 'OEBPS'), { recursive: true });
    await writeFile(path.join(root, 'META-INF/container.xml'),
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
    await writeFile(path.join(root, 'OEBPS/content.opf'),
      '<?xml version="1.0"?><package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
      + '<dc:title>Practice</dc:title><dc:creator>K. Ericsson</dc:creator></metadata>'
      + '<manifest><item id="a" href="ch10.xhtml"/><item id="b" href="ch2.xhtml"/></manifest>'
      + '<spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
    const body = (mark) => `<html><body><h1>${mark}</h1>${`<p>${PARA}</p>`.repeat(10)}</body></html>`;
    await writeFile(path.join(root, 'OEBPS/ch10.xhtml'), body('FIRST_IN_SPINE'));
    await writeFile(path.join(root, 'OEBPS/ch2.xhtml'), body('SECOND_IN_SPINE'));
    const epub = path.join(dir, 'book.epub');
    try {
      await run('zip', ['-q', '-X', '-r', epub, '.'], { cwd: root });
    } catch { return t.skip('zip unavailable'); }

    const out = await extractBookText(epub);
    assert.equal(out.kind, 'epub');
    assert.equal(out.parts, 2);
    assert.deepEqual(out.meta, { title: 'Practice', author: 'K. Ericsson' });
    assert.ok(out.chars > MIN_USEFUL_CHARS);
    assert.ok(out.text.indexOf('FIRST_IN_SPINE') < out.text.indexOf('SECOND_IN_SPINE'),
      'ch10 precedes ch2 because the SPINE says so, not the filename');
    assert.doesNotMatch(out.text, /<[a-z]/i, 'no markup survives into the text');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('PDF end-to-end via macOS PDFKit — no dependency, no poppler', async (t) => {
  if (process.platform !== 'darwin') return t.skip('macOS only');
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-pdf-t-'));
  try {
    const txt = path.join(dir, 'src.txt');
    const pdf = path.join(dir, 'book.pdf');
    await writeFile(txt, PARA.repeat(40));
    try {
      const { stdout } = await run('/bin/sh', ['-c', `cupsfilter ${JSON.stringify(txt)} 2>/dev/null`],
        { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
      if (!stdout?.length) return t.skip('cupsfilter produced nothing');
      await writeFile(pdf, stdout);
    } catch { return t.skip('cupsfilter unavailable'); }

    const out = await extractBookText(pdf);
    assert.equal(out.kind, 'pdf');
    assert.ok(out.chars > MIN_USEFUL_CHARS, `expected real text, got ${out.chars} chars`);
    assert.match(out.text, /Deliberate practice/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// A MIDDLEWARE ORDERING INVARIANT, pinned in source because that is where it
// can break. index.js mounts a global express.text() that claims
// application/octet-stream and decodes it as UTF-8 with a 1mb cap. Any binary
// upload route registered AFTER it receives a mangled string instead of
// bytes: the request succeeds, the file is ruined, and extraction silently
// yields zero characters. The book upload must claim its path first.
test('binary upload parser is mounted before the global text parser', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = await readFile(path.join(here, '..', 'index.js'), 'utf8');

  const rawAt = src.indexOf("app.use('/api/ingest/book-file'");
  const textAt = src.search(/app\.use\(express\.text\(/);
  const jsonAt = src.search(/app\.use\(express\.json\(/);

  assert.ok(rawAt > -1, 'the book-file raw parser must be mounted explicitly in index.js');
  assert.ok(textAt > -1, 'the global text parser is still there — this test is about their order');
  assert.ok(rawAt < textAt, 'raw body parser for uploads must come BEFORE express.text, or binaries arrive as mangled UTF-8');
  assert.ok(rawAt < jsonAt, 'and before express.json, which would also consume the stream');
  assert.match(src.slice(rawAt, rawAt + 220), /express\.raw/);
});
