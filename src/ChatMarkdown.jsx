// Light markdown for chat replies — links, bold, bullets. Built for the
// Coach's resource curation: a link the UI renders as plain text is a
// resource he can't open. Deliberately tiny (no library, no HTML injection:
// everything is React elements, URLs restricted to http/https).
//
// DOCUMENTS (28 Sep 2026). Every chat surface draws its messages through
// here, so this is where a document in a reply becomes a card: the message
// is split by messageParts (src/artifactBlocks.js, the one parser the server
// shares) and each [[artifact:<id>]] renders as an ArtifactCard, each
// half-arrived document as a "writing a document" card. The prose around
// them renders exactly as before. A message with no document takes the old
// path untouched.
//
// The same renderer draws a document's BODY in the viewer (variant "doc"):
// reading type, serif headings, and the block forms a plan or a report is
// made of — tables (scrolling inside their own well at 375px, never the
// page), block quotes, numbered lists, code. Chat keeps its compact size.
import { useLayoutEffect, useRef, useState } from 'react';
import { css } from './css.js';
import { messageParts } from './artifactBlocks.js';
import { ArtifactCard, ArtifactPending } from './ArtifactCard.jsx';

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const UI = 'var(--nv-font-ui)';
const SERIF = 'var(--nv-font-serif)';
const MONO = 'var(--nv-font-mono)';

function renderInline(text, keyBase) {
  const out = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    LINK_RE.lastIndex = 0;
    const link = LINK_RE.exec(rest);
    const bold = /\*\*([^*]+)\*\*/.exec(rest);
    const code = /`([^`\n]+)`/.exec(rest);
    // *italic* / _italic_ — a word boundary on the outside, so "5 * 3" and
    // snake_case stay as written
    const ital = /(^|[\s(])[*_]([^*_\s][^*_\n]*?)[*_](?=[\s).,;:!?]|$)/.exec(rest);
    const next = [link, bold, code, ital].filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (!next) { out.push(rest); break; }
    if (next === ital) {
      const lead = ital[1];
      if (ital.index + lead.length > 0) out.push(rest.slice(0, ital.index + lead.length));
      out.push(<em key={`${keyBase}-${k++}`}>{ital[2]}</em>);
      rest = rest.slice(ital.index + ital[0].length);
      continue;
    }
    if (next.index > 0) out.push(rest.slice(0, next.index));
    if (next === link) {
      out.push(
        <a key={`${keyBase}-${k++}`} href={link[2]} target="_blank" rel="noopener noreferrer"
          style={css('color:var(--nv-cy);text-decoration:underline;text-underline-offset:2px')}>{link[1]}</a>,
      );
      rest = rest.slice(next.index + link[0].length);
    } else if (next === code) {
      out.push(<code key={`${keyBase}-${k++}`} style={{ font: `500 .9em ${MONO}`, padding: '1px 5px', borderRadius: '5px', background: 'var(--nv-well)', color: 'var(--nv-ink)' }}>{code[1]}</code>);
      rest = rest.slice(next.index + code[0].length);
    } else {
      out.push(<strong key={`${keyBase}-${k++}`} style={css('color:var(--nv-ink)')}>{bold[1]}</strong>);
      rest = rest.slice(next.index + bold[0].length);
    }
  }
  return out;
}

// ------------------------------------------------------------- blocks --
const FENCE_RE = /^\s*```/;
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l) || (/\|/.test(l) && /^\s*[^|]+\|/.test(l) && l.split('|').length >= 3);
const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const OL_RE = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const BULLET_RE = /^\s*[-•*]\s+(.*)$/;
const HEAD_RE = /^\s*(#{1,4})\s+(.*)$/;

// A wide table scrolls inside its own well, never the page — and says so: the
// edge it continues past fades, the way the Rail's does (§12, scroll edge
// effects), measured so the fade is only there when there is more that way.
function useEdges() {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
  };
  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  });
  const f = '26px';
  const mask = edges.left && edges.right ? `linear-gradient(90deg, transparent 0, #000 ${f}, #000 calc(100% - ${f}), transparent 100%)`
    : edges.right ? `linear-gradient(90deg, #000 calc(100% - ${f}), transparent 100%)`
      : edges.left ? `linear-gradient(90deg, transparent 0, #000 ${f})` : undefined;
  return { ref, measure, mask, more: edges.right };
}

function Table({ rows, doc }) {
  const [head, ...body] = rows;
  const cellPad = doc ? '10px 14px' : '6px 10px';
  const size = doc ? 14.5 : 13;
  const e = useEdges();
  return (
    <span ref={e.ref} onScroll={e.measure} className="nv-doc-table" role="region" aria-label={e.more ? 'Table, scrolls sideways' : 'Table'} tabIndex={0} style={{
      margin: doc ? '6px 0 20px' : '8px 0', borderRadius: '12px',
      background: 'color-mix(in srgb, var(--nv-ink) 4%, transparent)',
      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--nv-ink) 9%, transparent)',
      maskImage: e.mask, WebkitMaskImage: e.mask,
    }}>
      <table>
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i} className={c.length > 26 ? 'nv-wrap' : undefined} style={{ padding: cellPad, font: `600 ${doc ? 12.5 : 11.5}px ${UI}`, letterSpacing: '.03em', color: 'var(--nv-ink60)', borderBottom: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)' }}>{renderInline(c, `h${i}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {head.map((_, ci) => {
                const c = r[ci] ?? '';
                return (
                  <td key={ci} className={c.length > 26 ? 'nv-wrap' : undefined} style={{
                    padding: cellPad, font: `${ci === 0 ? 600 : 400} ${size}px/1.45 ${UI}`,
                    color: ci === 0 ? 'var(--nv-ink)' : 'color-mix(in srgb, var(--nv-ink) 86%, transparent)',
                    borderTop: ri ? '1px solid color-mix(in srgb, var(--nv-ink) 7%, transparent)' : 'none',
                  }}>{renderInline(c, `c${ri}-${ci}`)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </span>
  );
}

function Markdown({ text, variant }) {
  const doc = variant === 'doc';
  const lines = String(text || '').split('\n');
  const out = [];
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const k = `p${out.length}`;
    out.push(
      <span key={k} style={{ display: 'block', margin: '0 0 14px', font: `400 16.5px/1.62 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 88%, transparent)', textWrap: 'pretty' }}>
        {renderInline(para.join(' '), k)}
      </span>,
    );
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // a fenced code block — kept exactly as written, in its own scrolling well
    if (FENCE_RE.test(line)) {
      flushPara();
      const body = [];
      let j = i + 1;
      while (j < lines.length && !FENCE_RE.test(lines[j])) body.push(lines[j++]);
      out.push(
        <span key={`f${i}`} className="nv-doc-code" style={{ margin: doc ? '4px 0 18px' : '8px 0', padding: doc ? '12px 14px' : '8px 10px', borderRadius: '10px', background: 'var(--nv-well)', font: `400 ${doc ? 13 : 12}px/1.55 ${MONO}`, color: 'var(--nv-ink)' }}>{body.join('\n')}</span>,
      );
      i = j;
      continue;
    }
    // a table: a row of pipes, then the |---| rule under it
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      flushPara();
      const rows = [cells(line)];
      let j = i + 2;
      while (j < lines.length && isRow(lines[j])) rows.push(cells(lines[j++]));
      out.push(<Table key={`t${i}`} rows={rows} doc={doc} />);
      i = j - 1;
      continue;
    }
    // a block quote: consecutive "> " lines, one quote
    if (QUOTE_RE.test(line)) {
      flushPara();
      const q = [];
      let j = i;
      while (j < lines.length && QUOTE_RE.test(lines[j])) q.push(QUOTE_RE.exec(lines[j++])[1]);
      out.push(
        <span key={`q${i}`} style={{ display: 'block', margin: doc ? '4px 0 18px' : '6px 0', padding: doc ? '2px 0 2px 16px' : '0 0 0 10px', borderLeft: '3px solid var(--nv-doc-hue, color-mix(in srgb, var(--nv-ink) 30%, transparent))', font: doc ? `400 19px/1.45 ${SERIF}` : 'inherit', fontStyle: doc ? 'italic' : 'normal', color: 'color-mix(in srgb, var(--nv-ink) 82%, transparent)' }}>
          {renderInline(q.join(' '), `q${i}`)}
        </span>,
      );
      i = j - 1;
      continue;
    }
    if (HR_RE.test(line)) {
      flushPara();
      out.push(<span key={`r${i}`} role="separator" style={{ display: 'block', height: '1px', margin: doc ? '10px 0 22px' : '8px 0', background: 'color-mix(in srgb, var(--nv-ink) 12%, transparent)' }} />);
      continue;
    }
    // HEADINGS. Without this a report's "## What was analysed" rendered as
    // literal hashes wherever one was shown — the reports are mostly
    // headings, so the whole document read as noise.
    const head = HEAD_RE.exec(line);
    if (head) {
      flushPara();
      const level = head[1].length;
      const style = doc
        ? (level <= 2
          ? { display: 'block', margin: `${out.length ? (level === 1 ? 30 : 26) : 0}px 0 10px`, font: `400 ${level === 1 ? 29 : 24}px/1.15 ${SERIF}`, letterSpacing: '-.01em', color: 'var(--nv-ink)', textWrap: 'balance' }
          : { display: 'block', margin: `${out.length ? 20 : 0}px 0 8px`, font: `600 ${level === 3 ? 17 : 15}px/1.3 ${UI}`, letterSpacing: '-.005em', color: 'var(--nv-ink)' })
        : { display: 'block', marginTop: i ? '14px' : 0, marginBottom: '4px', font: `600 ${level <= 2 ? 14.5 : 13}px var(--nv-font-ui)`, letterSpacing: '.01em', color: 'var(--nv-ink)' };
      out.push(<span key={i} role="heading" aria-level={level} style={style}>{renderInline(head[2], i)}</span>);
      continue;
    }
    const ol = OL_RE.exec(line);
    if (ol) {
      flushPara();
      out.push(
        <span key={i} style={{ display: 'block', position: 'relative', paddingLeft: doc ? '28px' : '20px', margin: doc ? '0 0 8px' : 0, font: doc ? `400 16.5px/1.55 ${UI}` : 'inherit', color: doc ? 'color-mix(in srgb, var(--nv-ink) 88%, transparent)' : 'inherit' }}>
          <span style={{ position: 'absolute', left: 0, top: 0, minWidth: doc ? '20px' : '14px', font: `600 ${doc ? 14 : 12}px/${doc ? '1.75' : 'inherit'} ${UI}`, fontVariantNumeric: 'tabular-nums', color: 'var(--nv-doc-hue, color-mix(in srgb, var(--nv-ink) 55%, transparent))' }}>{ol[1]}.</span>
          {renderInline(ol[2], i)}
        </span>,
      );
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (doc) {
      if (bullet) {
        flushPara();
        out.push(
          <span key={i} style={{ display: 'block', position: 'relative', paddingLeft: '22px', margin: '0 0 8px', font: `400 16.5px/1.55 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 88%, transparent)' }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: '6px', top: '.68em', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--nv-doc-hue, color-mix(in srgb, var(--nv-ink) 45%, transparent))' }} />
            {renderInline(bullet[1], i)}
          </span>,
        );
      } else if (!line.trim()) flushPara();
      else para.push(line.trim());
      continue;
    }
    // chat: the original line-by-line rendering, unchanged
    const content = renderInline(bullet ? bullet[1] : line, i);
    out.push(
      <span key={i} style={bullet ? css('display:block;padding-left:14px;position:relative') : undefined}>
        {bullet && <span style={css('position:absolute;left:2px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)')}>·</span>}
        {content}
        {i < lines.length - 1 && !bullet ? <br /> : null}
      </span>,
    );
  }
  flushPara();
  return doc ? <span className="nv-doc-prose" style={{ display: 'block' }}>{out}</span> : <span>{out}</span>;
}

export function ChatMarkdown({ text, variant }) {
  const s = String(text || '');
  // the common case — no document in this message — takes the old path
  if (!/\[\[artifact:|<<<ARTIFACT/i.test(s)) return <Markdown text={s} variant={variant} />;
  const parts = messageParts(s, { final: true });
  let pending = 0;
  return (
    <span>
      {parts.map((p, i) => {
        if (p.type === 'artifact') return <ArtifactCard key={`a${p.id}`} id={p.id} />;
        if (p.type === 'pending') { const n = pending++; return <ArtifactPending key={`w${i}`} index={n} title={p.title} />; }
        return <Markdown key={`t${i}`} text={p.text} variant={variant} />;
      })}
    </span>
  );
}
