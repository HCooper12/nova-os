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

      {/* the overnight queue — work that runs while he sleeps */}
      <div style={css("margin-top:30px;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px")}>
        <span style={css(`font:500 9.5px ${M};letter-spacing:.24em;color:${dim(42)}`)}>OVERNIGHT QUEUE · RUNS {v.overnightWindow} WHILE YOU SLEEP</span>
        {v.overnightQueuedCount > 0 && (
          <Interactive as="span" onClick={v.overnightRunNow} base={`cursor:pointer;font:500 9px ${M};letter-spacing:.1em;color:${dim(40)}`} hoverStyle="color:var(--nv-vi)">RUN NOW ▸</Interactive>
        )}
      </div>
      <div style={css("display:flex;gap:8px;margin-top:10px;max-width:640px")}>
        <Interactive as="input" value={v.overnightInput} onChange={v.setOvernightInput} onKeyDown={v.overnightKey}
          placeholder="Queue a research question for tonight…"
          base={`flex:1;background:var(--nv-well);border:1px solid ${dim(12)};border-radius:9px;padding:9px 13px;color:var(--nv-ink);font:400 12px ${M};outline:none`}
          focusStyle="border-color:color-mix(in srgb, var(--nv-vi) 50%, transparent)" />
        <Interactive as="span" onClick={v.overnightAdd}
          base={`cursor:pointer;display:flex;align-items:center;font:500 10px ${M};letter-spacing:.08em;padding:0 15px;border-radius:9px;background:var(--nv-vi);color:var(--nv-on-acc)`}
          hoverStyle="background:color-mix(in srgb, var(--nv-vi) 80%, white)">QUEUE</Interactive>
      </div>
      <div style={css("margin-top:8px;max-width:820px")}>
        {v.overnightItems.length === 0 && <div style={css(`font:400 10.5px ${M};color:${dim(38)}`)}>Nothing queued — hand Nova a question here (or say “research this tonight” in conversation) and wake up to the brief.</div>}
        {v.overnightItems.map((i) => (
          <div key={i.id} style={css(`display:flex;align-items:baseline;gap:10px;padding:7px 0;border-bottom:1px solid ${dim(5)};font:400 11px ${M}`)}>
            <span style={css(`flex:none;font-size:8.5px;letter-spacing:.1em;color:${i.statusColor};${i.running ? 'animation:dotBlink 1.6s infinite' : ''}`)}>{i.status}</span>
            <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${dim(80)}`)}>{i.question}</span>
            {i.note && <span style={css(`flex:none;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;color:${dim(45)}`)}>{i.note}</span>}
            <span style={css(`flex:none;font-size:9px;color:${dim(35)}`)}>{i.when}</span>
            {i.remove && <Interactive as="span" onClick={i.remove} base={`cursor:pointer;flex:none;font-size:10px;color:${dim(35)}`} hoverStyle="color:var(--nv-warn)">✕</Interactive>}
          </div>
        ))}
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
