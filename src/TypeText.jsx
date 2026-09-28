import { useEffect, useRef, useState } from 'react';
import { messageParts } from './artifactBlocks.js';
import { ArtifactCard, ArtifactPending } from './ArtifactCard.jsx';

// P7: the typing reveal lives here, in a leaf — not in App state. The old
// typeIn() setState'd the whole app every ~80ms for the length of a reply,
// which recomputed all nine val-builders and reconciled the whole tree per
// tick. Now the message arrives complete, this component animates the
// reveal with local state, and the rest of the tree never hears about it.
// active=false (regular and streamed messages) renders the text as-is.
//
// DOCUMENTS (28 Sep 2026): Voice draws its bubbles through here rather than
// ChatMarkdown, so a document Nova names ([[artifact:<id>]]) becomes the same
// card here as in every other chat, and a half-arrived one the same "writing
// a document" card. The reveal walks the prose; a card appears when the
// reveal reaches it.
const HAS_DOC = /\[\[artifact:|<<<ARTIFACT/i;

export function TypeText({ text, active }) {
  const [n, setN] = useState(active ? 0 : text.length);
  const nRef = useRef(0);
  useEffect(() => {
    if (!active) { setN(text.length); return undefined; }
    nRef.current = 0;
    const iv = setInterval(() => {
      nRef.current += 12;
      setN(nRef.current);
      if (nRef.current >= text.length) clearInterval(iv);
    }, 80);
    return () => clearInterval(iv);
  }, [active, text]);
  const revealing = active && n < text.length;
  if (HAS_DOC.test(text || '')) {
    const parts = messageParts(text, { final: true });
    let budget = revealing ? n : Infinity;
    let pending = 0;
    const out = [];
    for (let i = 0; i < parts.length && budget > 0; i++) {
      const p = parts[i];
      if (p.type === 'text') {
        const shown = budget >= p.text.length ? p.text : p.text.slice(0, budget);
        budget -= p.text.length;
        out.push(<span key={`t${i}`} style={{ whiteSpace: 'pre-line' }}>{shown}</span>);
      } else if (p.type === 'artifact') {
        out.push(<span key={`a${p.id}`} style={{ display: 'block' }}><ArtifactCard id={p.id} /></span>);
      } else {
        const idx = pending++;
        out.push(<span key={`w${i}`} style={{ display: 'block' }}><ArtifactPending index={idx} title={p.title} /></span>);
      }
    }
    return (
      <>
        {out}
        {revealing && <span style={{ color: 'var(--nv-cy)' }}>▍</span>}
      </>
    );
  }
  return (
    <>
      {revealing ? text.slice(0, n) : text}
      {revealing && <span style={{ color: 'var(--nv-cy)' }}>▍</span>}
    </>
  );
}
