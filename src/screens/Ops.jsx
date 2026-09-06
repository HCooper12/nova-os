import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { Eyebrow, TextAction, Tag, Meta, isAppleStyle } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '10px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

const M = "var(--nv-font-mono)";
const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;

// Nova Operations — the machinery made visible, honestly. A ring of the real
// scheduled fleet around the core (glow = ran today, amber = gone quiet,
// hollow = never run), the human gate front and centre, and the receipts
// stream underneath. Nothing here is invented; it is the record ledger and
// the heartbeat file, drawn.

const RING = 150; // ring radius (px) on desktop; the map scales down on mobile

// The topology's outer columns — channels flow IN (left), connections are
// the hands (right). A dot pulses only while a request is genuinely in
// flight; configured-but-idle sits steady; unconfigured sits dim and says so.
function TopoCol({ title, items }) {
  return (
    <div style={css("flex:0 1 175px;min-width:150px")}>
      <Eyebrow>{title}</Eyebrow>
      {items.map((c) => (
        <div key={c.key} style={css(`display:flex;align-items:center;gap:8px;padding:7px 2px;border-bottom:1px solid ${dim(5)}`)}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none',
            background: c.working ? 'var(--nv-cy)' : c.on ? 'color-mix(in srgb, var(--nv-cy) 45%, transparent)' : dim(14),
            boxShadow: c.working ? '0 0 8px var(--nv-cy)' : 'none',
            ...(c.working ? { animation: 'novaPulse 1.2s infinite var(--nv-anim)' } : {}) }} />
          <Meta tone={c.on ? dim(75) : dim(35)} style={{ textTransform: 'none', letterSpacing: 0 }}>{c.label}</Meta>
          <Meta tone={dim(35)} style={{ marginLeft: 'auto', whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0 }}>{c.sub}</Meta>
        </div>
      ))}
    </div>
  );
}

// The map drawn — the tapped agent unfolded: who it is, the skills it owns
// (from the vault registry, by department), and its last receipts. Rendered
// under the tapped conversational row, or under the ring for fleet agents.
// Every absence says so: "no skills mapped yet", "registry unavailable",
// "no receipts yet", "leaves heartbeats, not inbox records".
function AgentDetail({ d }) {
  return (
    <div style={css(`margin:10px 0 4px;border:1px solid ${dim(10)};border-left:2px solid color-mix(in srgb, var(--nv-cy) 55%, transparent);border-radius:11px;padding:12px 14px;background:${dim(2)};text-align:left`)}>
      <div style={css("display:flex;align-items:baseline;gap:8px;flex-wrap:wrap")}>
        <Eyebrow as="span" tone={dim(72)}>{d.label}</Eyebrow>
        <Meta tone={dim(42)} style={{ textTransform: 'none', letterSpacing: 0 }}>— {d.role} · {d.stateLabel}</Meta>
      </div>
      <Eyebrow style={{ marginTop: '10px' }}>Skills owned</Eyebrow>
      {d.lastNote && <Meta as="div" tone="warn" style={{ marginTop: '5px', textTransform: 'none', letterSpacing: 0 }}>{d.lastNote}</Meta>}
      {d.skillsNote && <Meta as="div" tone={dim(42)} style={{ marginTop: '5px', textTransform: 'none', letterSpacing: 0 }}>{d.skillsNote}</Meta>}
      {!d.skillsNote && d.skillGroups.map((g) => (
        <div key={g.name} style={css("margin-top:6px")}>
          <Eyebrow tone="color-mix(in srgb, var(--nv-cy) 65%, var(--nv-ink))">{g.name}</Eyebrow>
          {g.missing && <Meta as="div" tone={dim(40)} style={{ padding: '2px 0', textTransform: 'none', letterSpacing: 0 }}>not on the registry page</Meta>}
          {g.skills.map((s) => (
            <div key={s.text} style={css("display:flex;align-items:baseline;gap:8px;padding:2.5px 0")}>
              <Meta tone={dim(72)} style={{ flex: 1, textTransform: 'none', letterSpacing: 0 }}>{s.text}</Meta>
              <Tag tone={s.autonomyColor} style={{ flex: 'none' }}>{s.autonomy}</Tag>
            </div>
          ))}
        </div>
      ))}
      <Eyebrow style={{ marginTop: '12px' }}>Last receipts</Eyebrow>
      {d.receiptsNote && <Meta as="div" tone={dim(42)} style={{ marginTop: '5px', textTransform: 'none', letterSpacing: 0 }}>{d.receiptsNote}</Meta>}
      {d.receipts.map((r) => (
        <div key={r.id} style={css(`display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid ${dim(5)};font:var(--nv-micro-m)`)}>
          <span style={css(`flex:none;width:32px;text-align:right;color:${dim(35)};font-size:9px`)}>{r.when}</span>
          <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${dim(78)}`)}>{r.title}</span>
          <Tag tone={r.statusColor} style={{ flex: 'none' }}>{r.status}</Tag>
        </div>
      ))}
    </div>
  );
}

export function Ops({ v }) {
  if (!v.opsLive) {
    return (
      <div style={css("padding:34px 28px")}>
        <div style={css(`font:var(--nv-micro-l);letter-spacing:.3em;color:${dim(45)}`)}>XIV. OPERATIONS</div>
        <div style={css(`margin-top:16px;font:400 13px ${M};color:${dim(55)};max-width:480px;line-height:1.7`)}>{v.opsEmptyLine}</div>
      </div>
    );
  }
  return (
    <div style={css("padding:28px 28px 40px;max-width:1080px;margin:0 auto")}>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px")}>
        <div style={css(`font:var(--nv-micro-l);letter-spacing:.3em;color:${dim(45)}`)}>XIV. OPERATIONS</div>
        <Meta tone={dim(38)} style={{ textTransform: 'none', letterSpacing: 0 }}>records + heartbeats · nothing invented</Meta>
      </div>

      {/* the human gate — the only checkpoint, shown proudly */}
      <Interactive as="div" onClick={v.goInboxFromOps}
        base={`cursor:pointer;margin-top:18px;display:flex;align-items:center;gap:12px;border:1px solid color-mix(in srgb, var(--nv-gold) ${v.opsPending > 0 ? 45 : 18}%, transparent);border-radius:12px;padding:13px 16px;background:color-mix(in srgb, var(--nv-gold) ${v.opsPending > 0 ? 7 : 3}%, transparent)`}
        hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">
        <span style={css(`font:600 20px ${M};color:var(--nv-gold);min-width:28px;text-align:center`)}>{v.opsPending}</span>
        <Meta tone={dim(75)} style={{ flex: 1, textTransform: 'none', letterSpacing: 0, fontSize: isAppleStyle() ? '14px' : undefined }}>{v.opsGateLine}</Meta>
        <Meta tone="gold" style={{ fontWeight: 600 }}>Open Inbox →</Meta>
      </Interactive>

      <div style={css("display:flex;flex-wrap:wrap;gap:30px;margin-top:26px;align-items:flex-start;justify-content:center")}>
        {/* channels → core/agents → connections: the real topology, framed
            the way the map reads — ways in on the left, hands on the right */}
        <TopoCol title="Channels · ways in" items={v.opsChannels} />
        {/* the fleet ring — tap an agent to unfold its skills + receipts */}
        <div style={css(`flex:0 0 auto;width:${RING * 2 + 120}px;max-width:100%;margin:0 auto`)}>
          <div style={css(`position:relative;height:${RING * 2 + 110}px`)}>
            <div style={css("position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)")}>
              <NovaCore size={86} engine={v.coreStyle} />
            </div>
            <div style={css(`position:absolute;left:50%;top:50%;width:${RING * 2}px;height:${RING * 2}px;transform:translate(-50%,-50%);border:1px dashed ${dim(8)};border-radius:50%`)} />
            {v.opsAgents.map((a) => (
              // activeStyle restates the centring translate on purpose: the
              // default press spring would replace transform and jump the node
              <Interactive as="div" key={a.id} title={`${a.label} — ${a.role} · ${a.stateLabel}`} onClick={a.toggle}
                base={`cursor:pointer;position:absolute;left:calc(50% + ${Math.round(a.x * RING)}px);top:calc(50% + ${Math.round(a.y * RING)}px);transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:86px;text-align:center;padding:3px 0;border-radius:8px`}
                activeStyle="transform:translate(-50%,-50%) scale(.94)"
                hoverStyle={`background:${dim(4)}`}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', ...a.dotStyle, ...(a.state === 'today' ? { animation: 'novaPulse 2.6s infinite var(--nv-anim)' } : {}) }} />
                <Eyebrow as="span" tone={a.open ? 'var(--nv-cy)' : a.state === 'never' ? dim(35) : dim(72)} style={{ fontSize: isAppleStyle() ? '11px' : undefined }}>{a.label}</Eyebrow>
                <Meta tone={a.state === 'stale' ? 'warn' : dim(38)} style={{ textTransform: 'none', letterSpacing: 0, fontSize: isAppleStyle() ? '11px' : undefined }}>{a.stateLabel}</Meta>
              </Interactive>
            ))}
          </div>
          {v.opsOpenAgent?.scheduled && <AgentDetail d={v.opsOpenAgent} />}
        </div>

        <TopoCol title="Connections · hands" items={v.opsConnections} />

        {/* conversational agents + legend */}
        <div style={css("flex:1 1 280px;min-width:260px")}>
          <Eyebrow>In conversation</Eyebrow>
          {v.opsConversational.map((a) => (
            <div key={a.id} style={css(`border-bottom:1px solid ${dim(6)}`)}>
              <Interactive as="div" onClick={a.toggle}
                base="cursor:pointer;display:flex;align-items:baseline;gap:9px;padding:9px 2px"
                hoverStyle={`background:${dim(4)}`}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', alignSelf: 'center', ...a.dotStyle }} />
                <Meta tone={a.open ? 'var(--nv-cy)' : dim(85)} style={{ textTransform: 'none', letterSpacing: 0, fontSize: isAppleStyle() ? '14px' : undefined, fontWeight: 600 }}>{a.label}</Meta>
                <Meta tone={dim(40)} style={{ textTransform: 'none', letterSpacing: 0 }}>{a.role}</Meta>
                <Meta tone={dim(45)} style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, textTransform: 'none', letterSpacing: 0 }}>{a.last}</Meta>
              </Interactive>
              {a.open && v.opsOpenAgent && !v.opsOpenAgent.scheduled && <AgentDetail d={v.opsOpenAgent} />}
            </div>
          ))}
          <Meta as="div" tone={dim(38)} style={{ marginTop: '14px', lineHeight: 2, textTransform: 'none', letterSpacing: 0 }}>
            <span style={css("color:var(--nv-cy)")}>●</span> ran today&nbsp;&nbsp;
            <span style={css(`color:color-mix(in srgb, var(--nv-cy) 55%, transparent)`)}>●</span> last 2 days&nbsp;&nbsp;
            <span style={css("color:var(--nv-warn)")}>●</span> gone quiet&nbsp;&nbsp;
            <span style={css(`color:${dim(18)}`)}>●</span> never run
          </Meta>
          {v.opsFiledToday > 0 && (
            <Meta as="div" tone={dim(55)} style={{ marginTop: '8px', textTransform: 'none', letterSpacing: 0 }}>{v.opsFiledToday} thing{v.opsFiledToday === 1 ? '' : 's'} filed into the vault today.</Meta>
          )}
        </div>
      </div>

      {/* the skill map — what Nova can actually do, from the vault registry */}
      {v.skillDepartments.length > 0 && (
        <>
          <Eyebrow style={{ marginTop: '30px' }}>The skill map · Wiki/Library/Nova Skills.md — yours to edit</Eyebrow>
          <div style={css("display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:12px")}>
            {v.skillDepartments.map((d) => (
              <div key={d.name} style={css(`border:1px solid ${dim(8)};border-radius:11px;padding:12px 14px;background:${dim(2)}`)}>
                <Eyebrow tone={dim(55)} style={{ marginBottom: '8px' }}>{d.name}</Eyebrow>
                {d.skills.map((s) => (
                  <div key={s.text} style={css("display:flex;align-items:baseline;gap:8px;padding:3px 0")}>
                    <Meta tone={dim(72)} style={{ flex: 1, textTransform: 'none', letterSpacing: 0 }}>{s.text}</Meta>
                    <Tag tone={s.autonomyColor} style={{ flex: 'none' }}>{s.autonomy}</Tag>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* THE FORGE — one sentence becomes a running artifact. It has had a
          sandbox, a cost cap, a stop and screenshot proof since August, and
          no way in from the app until now. */}
      <div style={css("margin-top:30px;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px")}>
        <Eyebrow as="span">The Forge · a sentence becomes something that runs</Eyebrow>
      </div>
      <div style={css("margin-top:10px;display:flex;gap:9px;flex-wrap:wrap")}>
        <Interactive as="input" value={v.forge.input} onChange={v.forge.setInput} onKeyDown={v.forge.onKey}
          placeholder="Build me a… (it works in its own sandbox, never your vault)"
          base={{ flex: '1 1 320px', boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '10px', padding: '11px 14px', color: 'var(--nv-ink)', fontSize: '13px', outline: 'none' }}
          focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
        <Interactive as="span" onClick={v.forge.busy ? undefined : v.forge.start}
          base={btn('var(--nv-cy)', 'var(--nv-on-acc)', { cursor: v.forge.busy ? 'default' : 'pointer', display: 'flex', padding: '0 18px', opacity: v.forge.busy ? .6 : 1 })}
          hoverStyle={v.forge.busy ? '' : 'filter:brightness(1.08)'}>
          {v.forge.busy ? 'Starting…' : 'Build it'}
        </Interactive>
      </div>
      {v.forge.jobs.length > 0 && (
        <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:8px")}>
          {v.forge.jobs.map((j) => (
            <div key={j.id} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent);border-radius:11px;padding:11px 13px;background:var(--nv-well)")}>
              <div style={css("display:flex;align-items:baseline;gap:10px;flex-wrap:wrap")}>
                <Tag tone={j.running ? 'cyan' : j.state === 'error' ? 'warn' : dim(45)}>{j.state}</Tag>
                <span style={css("flex:1;min-width:0;font-size:12.5px;color:var(--nv-ink)")}>{j.title}</span>
                {j.cost && <Meta tone={dim(40)} style={{ textTransform: 'none', letterSpacing: 0 }}>{j.cost}</Meta>}
                {j.running && (
                  <TextAction compact tone="warn" onClick={j.stop}>Stop</TextAction>
                )}
              </div>
              {j.summary && <div style={css(`margin-top:6px;font-size:11.5px;line-height:1.5;color:${dim(55)}`)}>{j.summary}</div>}
            </div>
          ))}
        </div>
      )}

      {/* the overnight queue — work that runs while he sleeps */}
      <div style={css("margin-top:30px;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px")}>
        <Eyebrow as="span">Overnight queue · runs {v.overnightWindow} while you sleep</Eyebrow>
        {v.overnightQueuedCount > 0 && (
          <TextAction compact tone="faint" onClick={v.overnightRunNow}>Run now ▸</TextAction>
        )}
      </div>
      <div style={css("display:flex;gap:8px;margin-top:10px;max-width:640px")}>
        <Interactive as="input" value={v.overnightInput} onChange={v.setOvernightInput} onKeyDown={v.overnightKey}
          placeholder="Queue a research question for tonight…"
          base={`flex:1;background:var(--nv-well);border:1px solid ${dim(12)};border-radius:9px;padding:9px 13px;color:var(--nv-ink);font:400 12px ${M};outline:none`}
          focusStyle="border-color:color-mix(in srgb, var(--nv-vi) 50%, transparent)" />
        <Interactive as="span" onClick={v.overnightAdd}
          base={btn('var(--nv-vi)', 'var(--nv-on-acc)', { display: 'flex', padding: '0 15px' })}
          hoverStyle="filter:brightness(1.08)">Queue</Interactive>
      </div>
      <div style={css("margin-top:8px;max-width:820px")}>
        {v.overnightItems.length === 0 && <Meta as="div" tone={dim(38)} style={{ textTransform: 'none', letterSpacing: 0 }}>Nothing queued — hand Nova a question here (or say “research this tonight” in conversation) and wake up to the brief.</Meta>}
        {v.overnightItems.map((i) => (
          <div key={i.id} style={css(`display:flex;align-items:baseline;gap:10px;padding:7px 0;border-bottom:1px solid ${dim(5)};font:var(--nv-micro-l)`)}>
            <Tag tone={i.statusColor} style={{ flex: 'none', animation: i.running ? 'dotBlink 1.6s infinite' : 'none' }}>{i.status}</Tag>
            <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${dim(80)}`)}>{i.question}</span>
            {i.note && <Meta tone={dim(45)} style={{ flex: 'none', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0 }}>{i.note}</Meta>}
            <Meta tone={dim(35)} style={{ flex: 'none', textTransform: 'none', letterSpacing: 0 }}>{i.when}</Meta>
            {i.remove && <Interactive as="span" onClick={i.remove} base={`cursor:pointer;flex:none;font-size:10px;color:${dim(35)}`} hoverStyle="color:var(--nv-warn)">✕</Interactive>}
          </div>
        ))}
      </div>

      {/* the stream — receipts, newest first */}
      <Eyebrow style={{ marginTop: '30px' }}>The stream · last {v.opsStream.length} receipts</Eyebrow>
      <div style={css("margin-top:10px")}>
        {v.opsStream.length === 0 && <Meta as="div" tone={dim(40)} style={{ textTransform: 'none', letterSpacing: 0 }}>Nothing on the ledger yet.</Meta>}
        {v.opsStream.map((r) => (
          <div key={r.id} style={css(`display:flex;align-items:baseline;gap:10px;padding:7px 0;border-bottom:1px solid ${dim(5)};font:var(--nv-micro-l)`)}>
            <Meta tone={dim(35)} style={{ flex: 'none', width: '36px', textAlign: 'right', textTransform: 'none', letterSpacing: 0 }}>{r.when}</Meta>
            <Tag tone={dim(45)} style={{ flex: 'none', width: '78px', boxSizing: 'border-box', textAlign: 'center' }}>{r.kind}</Tag>
            <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${dim(80)}`)}>{r.title}</span>
            <Tag tone={r.statusColor} style={{ flex: 'none' }}>{r.status}</Tag>
          </div>
        ))}
      </div>
    </div>
  );
}
