import { useState, useRef, useEffect } from 'react';

// iOS-style drag-to-reorder for the bottom tabs. Pointer-based (works on touch),
// reorders live as you drag a row past its neighbours, commits on release.
const ROW_H = 46; // row height + margin, for mapping pointer-Y → target index

export function TabOrderEditor({ items, onReorder }) {
  const [order, setOrder] = useState(items);
  const [dragIdx, setDragIdx] = useState(-1);
  const containerRef = useRef(null);
  const dragging = useRef(false);

  // resync from props when the parent order changes and we're not mid-drag
  useEffect(() => { if (!dragging.current) setOrder(items); }, [items]);

  const onDown = (e, idx) => {
    e.preventDefault();
    dragging.current = true;
    setDragIdx(idx);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (dragIdx < 0 || !containerRef.current) return;
    const top = containerRef.current.getBoundingClientRect().top;
    const target = Math.max(0, Math.min(order.length - 1, Math.floor((e.clientY - top) / ROW_H)));
    if (target !== dragIdx) {
      setOrder((prev) => {
        const next = prev.slice();
        const [moved] = next.splice(dragIdx, 1);
        next.splice(target, 0, moved);
        return next;
      });
      setDragIdx(target);
    }
  };
  const onUp = () => {
    if (dragIdx < 0) return;
    dragging.current = false;
    const committed = order;
    setDragIdx(-1);
    onReorder(committed.map((o) => o.key));
  };

  return (
    <div ref={containerRef} style={{ maxWidth: '360px' }}>
      {order.map((it, i) => (
        <div
          key={it.key}
          onPointerDown={(e) => onDown(e, i)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{
            height: `${ROW_H - 8}px`, margin: '4px 0', display: 'flex', alignItems: 'center', gap: '12px',
            padding: '0 14px', borderRadius: '10px', border: '1px solid var(--nv-edge)',
            background: dragIdx === i ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
            boxShadow: dragIdx === i ? '0 10px 26px -12px rgba(0,0,0,.85)' : 'none',
            transform: dragIdx === i ? 'scale(1.02)' : 'none',
            touchAction: 'none', cursor: 'grab', userSelect: 'none',
          }}
        >
          <span aria-hidden style={{ color: 'var(--nv-ink40)', fontSize: '15px', lineHeight: 1, letterSpacing: '-2px' }}>⠿</span>
          <span style={{ font: "600 14px 'Rajdhani',sans-serif", color: 'var(--nv-ink)' }}>{it.label}</span>
          <span style={{ marginLeft: 'auto', font: "500 9px 'IBM Plex Mono',monospace", color: 'var(--nv-ink40)' }}>{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
