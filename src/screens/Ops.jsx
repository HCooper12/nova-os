import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';

const M = "var(--nv-font-mono)";
const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;

// Nova Operations — the machinery made visible, honestly. A ring of the real
// scheduled fleet around the core (glow = ran today, amber = gone quiet,
// hollow = never run), the human gate front and centre, and the receipts
// stream underneath. Nothing here is invented; it is the record ledger and
// the heartbeat file, drawn.

const RING = 150; // ring radius (px) on desktop; the map scales down on mobile

export function Ops({ v }) {
  if (!v.opsLive) {
    return (
      <div style={css("padding:34px 28px")}>
        <div style={css(`font:500 11px ${M};letter-spacing:.3em;color:${dim(45)}`)}>XIV. OPERATIONS</div>
        <div style={css(`margin-top:16px;font:400 13px ${M};color:${dim(55)};max-width:480px;line-height:1.7`)}>{v.opsEmptyLine}</div>
      </div>
    );
  }
  return (
    <div style={css("padding:28px 28px 40px;max-width:1080px;margin:0 auto")}>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px")}>
        <div style={css(`font:500 11px ${M};letter-spacing:.3em;color:${dim(45)}`)}>XIV. OPERATIONS</div>
        <div style={css(`font:400 10px ${M};color:${dim(38)}`)}>records + heartbeats · nothing invented</div>
      </div>

      {/* the human gate — the only checkpoint, shown proudly */}
      <Interactive as="div" onClick={v.goInboxFromOps}
        base={`cursor:pointer;margin-top:18px;display:flex;align-items:center;gap:12px;border:1px solid color-mix(in srgb, var(--nv-gold) ${v.opsPending > 0 ? 45 : 18}%, transparent);border-radius:12px;padding:13px 16px;background:color-mix(in srgb, var(--nv-gold) ${v.opsPending > 0 ? 7 : 3}%, transparent)`}
        hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">
        <span style={css(`font:600 20px ${M};color:var(--nv-gold);min-width:28px;text-align:center`)}>{v.opsPending}</span>
        <span style={css(`flex:1;font:400 11.5px ${M};color:${dim(75)}`)}>{v.opsGateLine}</span>
        <span style={css(`font:500 9px ${M};letter-spacing:.14em;color:var(--nv-gold)`)}>OPEN INBOX →</span>
      </Interactive>

      <div style={css("display:flex;flex-wrap:wrap;gap:30px;margin-top:26px;align-items:flex-start")}>
        {/* the fleet ring */}
        <div style={css(`flex:0 0 auto;width:${RING * 2 + 120}px;max-width:100%;position:relative;height:${RING * 2 + 110}px;margin:0 auto`)}>
          <div style={css("position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)")}>
            <NovaCore size={86} engine={v.coreStyle} />
          </div>
          <div style={css(`position:absolute;left:50%;top:50%;width:${RING * 2}px;height:${RING * 2}px;transform:translate(-50%,-50%);border:1px dashed ${dim(8)};border-radius:50%`)} />
          {v.opsAgents.map((a) => (
            <div key={a.id} title={`${a.label} — ${a.role} · ${a.stateLabel}`}
              style={css(`position:absolute;left:calc(50% + ${Math.round(a.x * RING)}px);top:calc(50% + ${Math.round(a.y * RING)}px);transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:86px;text-align:center`)}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', ...a.dotStyle, ...(a.state === 'today' ? { animation: 'novaPulse 2.6s infinite var(--nv-anim)' } : {}) }} />
              <span style={css(`font:500 9px ${M};letter-spacing:.08em;color:${a.state === 'never' ? dim(35) : dim(72)}`)}>{a.label.toUpperCase()}</span>
              <span style={css(`font:400 8px ${M};color:${a.state === 'stale' ? 'var(--nv-warn)' : dim(38)}`)}>{a.stateLabel}</span>
            </div>
          ))}
        </div>

        {/* conversational agents + legend */}
        <div style={css("flex:1 1 280px;min-width:260px")}>
          <div style={css(`font:500 9.5px ${M};letter-spacing:.24em;color:${dim(42)}`)}>IN CONVERSATION</div>
          {v.opsConversational.map((a) => (
            <div key={a.id} style={css(`display:flex;align-items:baseline;gap:9px;padding:9px 0;border-bottom:1px solid ${dim(6)}`)}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', alignSelf: 'center', ...a.dotStyle }} />
              <span style={css(`font:500 11.5px ${M};color:${dim(85)}`)}>{a.label}</span>
              <span style={css(`font:400 10px ${M};color:${dim(40)}`)}>{a.role}</span>
              <span style={css(`flex:1;text-align:right;font:400 9.5px ${M};color:${dim(45)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0`)}>{a.last}</span>
            </div>
          ))}
          <div style={css(`margin-top:14px;font:400 9px ${M};line-height:2;color:${dim(38)}`)}>
            <span style={css("color:var(--nv-cy)")}>●</span> ran today&nbsp;&nbsp;
            <span style={css(`color:color-mix(in srgb, var(--nv-cy) 55%, transparent)`)}>●</span> last 2 days&nbsp;&nbsp;
            <span style={css("color:var(--nv-warn)")}>●</span> gone quiet&nbsp;&nbsp;
            <span style={css(`color:${dim(18)}`)}>●</span> never run
          </div>
          {v.opsFiledToday > 0 && (
            <div style={css(`margin-top:8px;font:400 10.5px ${M};color:${dim(55)}`)}>{v.opsFiledToday} thing{v.opsFiledToday === 1 ? '' : 's'} filed into the vault today.</div>
          )}
        </div>
      </div>

      {/* the stream — receipts, newest first */}
      <div style={css(`margin-top:30px;font:500 9.5px ${M};letter-spacing:.24em;color:${dim(42)}`)}>THE STREAM · LAST {v.opsStream.length} RECEIPTS</div>
      <div style={css("margin-top:10px")}>
        {v.opsStream.length === 0 && <div style={css(`font:400 11px ${M};color:${dim(40)}`)}>Nothing on the ledger yet.</div>}
        {v.opsStream.map((r) => (
          <div key={r.id} style={css(`display:flex;align-items:baseline;gap:10px;padding:7px 0;border-bottom:1px solid ${dim(5)};font:400 11px ${M}`)}>
            <span style={css(`flex:none;width:36px;text-align:right;color:${dim(35)};font-size:9.5px`)}>{r.when}</span>
            <span style={css(`flex:none;width:78px;font-size:8.5px;letter-spacing:.1em;color:${dim(45)}`)}>{r.kind}</span>
            <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${dim(80)}`)}>{r.title}</span>
            <span style={css(`flex:none;font-size:8.5px;letter-spacing:.1em;color:${r.statusColor}`)}>{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
