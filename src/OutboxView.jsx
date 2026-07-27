import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

const KIND_LABEL = {
  capture: 'Capture', food: 'Food log', todo: 'To-do', shopping: 'Shopping',
  journal: 'Journal', healthDay: 'Steps / weight', session: 'Workout', recipe: 'Recipe',
};

// The Outbox — writes queued while the backend was unreachable. Honest by
// design: nothing here is presented as synced; failed items (the server saw
// them and said no) carry the rejection and wait for a human call.
export function OutboxView({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Outbox" onClick={v.close} style={css("position:fixed;inset:0;background:rgba(8,5,12,.78);backdrop-filter:blur(6px);z-index:85;display:flex;align-items:center;justify-content:center;padding:18px")}>
      <div onClick={(e) => e.stopPropagation()} style={css("width:520px;max-width:96vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.9);padding:20px 22px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center;gap:10px")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:var(--nv-gold)")}>OUTBOX · {v.items.length} WAITING</span>
          <span style={css("display:flex;gap:8px;align-items:center")}>
            {v.hasQueued && (
              <Interactive as="span" onClick={v.syncNow} base="cursor:pointer;font:600 10px var(--nv-font-mono);letter-spacing:.08em;padding:6px 13px;border-radius:8px;background:var(--nv-cy);color:var(--nv-on-acc)" hoverStyle="filter:brightness(1.08)">SYNC NOW</Interactive>
            )}
            <Interactive as="span" onClick={v.close} base="cursor:pointer;font:500 11px var(--nv-font-mono);color:var(--nv-ink60);border:1px solid var(--nv-edge);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">ESC</Interactive>
          </span>
        </div>
        <div style={css("margin-top:6px;font-size:11.5px;line-height:1.55;color:var(--nv-ink60)")}>Saved on this phone while Nova's backend was unreachable — they file automatically the moment it answers. Nothing here counts in totals yet.</div>
        <div style={css("margin-top:12px;display:flex;flex-direction:column")}>
          {v.items.map((it, i) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 2px', borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
              <span style={{ flex: 'none', font: '500 8.5px var(--nv-font-mono)', letterSpacing: '.1em', padding: '3px 9px', borderRadius: '6px', color: it.failed ? 'var(--nv-warn)' : 'var(--nv-gold)', border: `1px solid color-mix(in srgb, ${it.failed ? 'var(--nv-warn)' : 'var(--nv-gold)'} 40%, transparent)` }}>{KIND_LABEL[it.kind] || it.kind}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 550, color: 'var(--nv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                <span style={{ display: 'block', marginTop: '1px', font: '400 10px var(--nv-font-mono)', color: it.failed ? 'var(--nv-warn)' : 'var(--nv-ink40)' }}>
                  {it.failed ? `rejected: ${it.error}` : `queued ${it.when}`}
                </span>
              </span>
              {it.failed && (
                <Interactive as="span" onClick={it.retry} base="cursor:pointer;flex:none;font:600 9px var(--nv-font-mono);letter-spacing:.08em;padding:5px 10px;border-radius:6px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 08%, transparent)">RETRY</Interactive>
              )}
              <Interactive as="span" onClick={it.discard} base="cursor:pointer;flex:none;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 38%, transparent);padding:4px" hoverStyle="color:var(--nv-warn)">discard</Interactive>
            </div>
          ))}
          {v.items.length === 0 && (
            <div style={css("padding:18px 2px;font-size:12.5px;color:var(--nv-ink40)")}>Empty — everything is synced.</div>
          )}
        </div>
      </div>
    </div>
  );
}
