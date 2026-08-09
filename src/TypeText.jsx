import { useEffect, useRef, useState } from 'react';

// P7: the typing reveal lives here, in a leaf — not in App state. The old
// typeIn() setState'd the whole app every ~80ms for the length of a reply,
// which recomputed all nine val-builders and reconciled the whole tree per
// tick. Now the message arrives complete, this component animates the
// reveal with local state, and the rest of the tree never hears about it.
// active=false (regular and streamed messages) renders the text as-is.
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
  return (
    <>
      {revealing ? text.slice(0, n) : text}
      {revealing && <span style={{ color: 'var(--nv-cy)' }}>▍</span>}
    </>
  );
}
