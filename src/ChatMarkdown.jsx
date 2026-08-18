// Light markdown for chat replies — links, bold, bullets. Built for the
// Coach's resource curation: a link the UI renders as plain text is a
// resource he can't open. Deliberately tiny (no library, no HTML injection:
// everything is React elements, URLs restricted to http/https).
import { css } from './css.js';

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text, keyBase) {
  const out = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    LINK_RE.lastIndex = 0;
    const link = LINK_RE.exec(rest);
    const bold = /\*\*([^*]+)\*\*/.exec(rest);
    const next = [link, bold].filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (!next) { out.push(rest); break; }
    if (next.index > 0) out.push(rest.slice(0, next.index));
    if (next === link) {
      out.push(
        <a key={`${keyBase}-${k++}`} href={link[2]} target="_blank" rel="noopener noreferrer"
          style={css('color:var(--nv-cy);text-decoration:underline;text-underline-offset:2px')}>{link[1]}</a>,
      );
      rest = rest.slice(next.index + link[0].length);
    } else {
      out.push(<strong key={`${keyBase}-${k++}`} style={css('color:var(--nv-ink)')}>{bold[1]}</strong>);
      rest = rest.slice(next.index + bold[0].length);
    }
  }
  return out;
}

export function ChatMarkdown({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <span>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
        const content = renderInline(bullet ? bullet[1] : line, i);
        return (
          <span key={i} style={bullet ? css('display:block;padding-left:14px;position:relative') : undefined}>
            {bullet && <span style={css('position:absolute;left:2px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)')}>·</span>}
            {content}
            {i < lines.length - 1 && !bullet ? <br /> : null}
          </span>
        );
      })}
    </span>
  );
}
