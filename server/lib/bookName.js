// NAMING A BOOK THAT DOES NOT NAME ITSELF (his report, 3 Oct 2026: a PDF of
// "The Next Conversation" by Jefferson Fisher was refused for want of a title
// and author — "It should be capable of just obtaining that from the front
// page itself and/or I could edit it after the fact"). Code reads, in order:
// what he typed, the file's own metadata, the title page, the filename. Pure.

const SITE_PREFIX = /^(?:_+)?(?:[a-z0-9-]+\.(?:com|org|net|io|co)(?:\.[a-z]{2})?)[_\s.-]*/i;
const tidy = (s) => String(s || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').trim();
const looksLikeName = (s) => /^[A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,3}$/u.test(s);

// "_OceanofPDF.com_The_Next_Conversation_-_Jefferson_Fisher.pdf"
// → { title: 'The Next Conversation', author: 'Jefferson Fisher' }
export function nameFromFilename(filename) {
  let base = String(filename || '').split('/').pop().replace(/\.(pdf|epub|txt|md)$/i, '');
  base = base.replace(SITE_PREFIX, '');
  const parts = base.split(/\s*(?:_-_|\s-\s|\s–\s|\s—\s| by )\s*/i).map(tidy).filter(Boolean);
  if (parts.length >= 2) {
    const [a, b] = [parts[0], parts[parts.length - 1]];
    if (looksLikeName(b)) return { title: a, author: b };
    if (looksLikeName(a)) return { title: b, author: a };
    return { title: a, author: b };
  }
  return { title: tidy(base) || null, author: null };
}

// The title page: the first lines carry the title, and a "by X" line (or a
// lone name line right after the title) carries the author.
export function nameFromTitlePage(text) {
  const lines = String(text || '').slice(0, 4000).split(/\n+/).map((l) => l.trim()).filter((l) => l && l.length < 120);
  let author = null;
  for (const l of lines.slice(0, 40)) {
    const m = l.match(/^by\s+(.{3,60})$/i);
    if (m && looksLikeName(tidy(m[1]))) { author = tidy(m[1]); break; }
  }
  return { title: null, author };
}

export function nameBook({ typedTitle, typedAuthor, metaTitle, metaAuthor, text, filename } = {}) {
  const fromFile = nameFromFilename(filename);
  const fromPage = nameFromTitlePage(text);
  const title = tidy(typedTitle) || tidy(metaTitle) || fromFile.title || null;
  const author = tidy(typedAuthor) || tidy(metaAuthor) || fromPage.author || fromFile.author || null;
  return { title, author, guessed: !tidy(typedTitle) || !tidy(typedAuthor) };
}
