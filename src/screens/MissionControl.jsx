import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

function GaugeDots({ active, accent, onPick }) {
  return (
    <div style={css("position:absolute;top:14px;right:14px;display:flex;gap:7px")}>
      {[0, 1, 2].map((i) => (
        <Interactive
          key={i}
          as="span"
          onClick={() => onPick(i)}
          base={{ cursor: 'pointer', width: '13px', height: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          hoverStyle={{}}
        >
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: i === active ? accent : 'rgba(236,229,218,.2)' }}></span>
        </Interactive>
      ))}
    </div>
  );
}

function GaugeCard({ idx, accent, label, value, hint, hintColor, dasharray, onPick }) {
  return (
    <div style={css("position:relative;border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:18px 20px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9);display:flex;gap:16px;align-items:center;animation:fadeUp .5s ease-out")}>
      <svg width="62" height="62" viewBox="0 0 62 62" style={{ flex: 'none' }} aria-hidden="true">
        <circle cx="31" cy="31" r="26" fill="none" stroke="rgba(236,229,218,.1)" strokeWidth="4"></circle>
        <circle cx="31" cy="31" r="26" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeDasharray={dasharray} transform="rotate(-90 31 31)"></circle>
      </svg>
      <div>
        <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>{label}</div>
        <div style={css("margin-top:6px;font:400 25px 'Instrument Serif',serif;font-variant-numeric:tabular-nums")}>{value}</div>
        <div style={{ marginTop: '2px', fontSize: '11.5px', color: hintColor }}>{hint}</div>
      </div>
      <GaugeDots active={idx} accent={accent} onPick={onPick} />
    </div>
  );
}

export function MissionControl({ v }) {
  return (
    <div style={v.wrapMission} data-screen-label="Mission Control">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>I.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>SELF · MISSION CONTROL</span>
        </div>
        <div style={css("display:flex;gap:10px;align-items:center")}>
          <Interactive
            onClick={v.openPalette}
            base="cursor:pointer;font:500 10.5px 'JetBrains Mono',monospace;padding:8px 14px;border:1px solid rgba(236,229,218,.14);border-radius:8px;color:rgba(236,229,218,.65);background:rgba(0,0,0,.25);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)"
            hoverStyle="border-color:rgba(216,181,115,.4);color:#ece5da"
          >
            ⌘K&nbsp;&nbsp;Summon
          </Interactive>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', font: "500 10.5px 'JetBrains Mono',monospace", padding: '8px 14px', border: `1px solid ${v.statusChip.color}55`, borderRadius: '8px', color: v.statusChip.color, background: 'rgba(0,0,0,.2)' }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.statusChip.color, boxShadow: `0 0 8px ${v.statusChip.color}`, animation: v.statusChip.label === 'LIVE' ? 'novaPulse 2s infinite' : 'none' }}></span>{v.statusChip.label}
          </span>
        </div>
      </div>

      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:22px")}>
        <div>
          <h1 style={css("margin:0;font:400 48px/1.05 'Instrument Serif',serif;letter-spacing:-.01em;text-shadow:0 2px 30px rgba(0,0,0,.4)")}>{v.greeting}</h1>
          <div style={css("margin-top:12px;display:flex;flex-wrap:wrap;gap:8px 16px;font:400 10.5px 'JetBrains Mono',monospace;letter-spacing:.1em;color:rgba(236,229,218,.5)")}>
            <span>{v.dateLabel}</span>
            {v.missionStatusItems.map((item, i) => (
              <span key={i} style={css("display:flex;gap:16px")}><span style={css("color:rgba(216,181,115,.7)")}>·</span><span>{item}</span></span>
            ))}
          </div>
        </div>
        <div style={css("font:400 32px 'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:rgba(236,229,218,.9);letter-spacing:.04em")}>{v.clock}</div>
      </div>

      <div style={v.gridStats}>
        <div style={css("border:1px solid rgba(216,181,115,.35);border-radius:14px;padding:20px 22px;background:linear-gradient(135deg,rgba(216,181,115,.13),rgba(216,181,115,.04) 60%);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 0 50px -14px rgba(216,181,115,.4)")}>
          <div style={css("display:flex;justify-content:space-between")}><span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#d8b573")}>SUGGESTED FOCUS</span><span style={css("font:italic 400 14px 'Instrument Serif',serif;color:rgba(216,181,115,.7)")}>{v.suggestedFocus.source}</span></div>
          <div style={css("margin-top:12px;font:400 26px/1.15 'Instrument Serif',serif")}>{v.suggestedFocus.title}<span style={css("font-style:italic;color:#d8b573")}>{v.suggestedFocus.accent}</span></div>
          <div style={css("margin-top:14px;display:flex;gap:10px")}>
            {v.suggestedFocus.onPrimary && (
              <Interactive as="span" onClick={v.suggestedFocus.onPrimary} base="cursor:pointer;font-size:12px;font-weight:500;padding:7px 14px;border-radius:8px;background:#d8b573;color:#1a1322;box-shadow:0 4px 16px -6px rgba(216,181,115,.6)" hoverStyle="background:#e6c98f">{v.suggestedFocus.primaryLabel}</Interactive>
            )}
            {v.suggestedFocus.onSecondary && (
              <Interactive as="span" onClick={v.suggestedFocus.onSecondary} base="cursor:pointer;font-size:12px;padding:7px 14px;border-radius:8px;border:1px solid rgba(236,229,218,.16);color:rgba(236,229,218,.7)" hoverStyle="background:rgba(255,255,255,.05)">{v.suggestedFocus.secondaryLabel}</Interactive>
            )}
          </div>
        </div>

        {v.rotSleep && (
          <GaugeCard idx={0} accent="#6be5f5" label="SLEEP" hintColor="rgba(107,229,245,.85)"
            dasharray={v.sleepGaugeDasharray} hint={v.sleepGaugeHint} onPick={v.setGaugeIdx}
            value={v.sleepGaugeValue} />
        )}
        {v.rotProtein && (
          <GaugeCard idx={1} accent="#d8b573" label="PROTEIN" hintColor="rgba(236,229,218,.55)"
            dasharray={v.proteinGaugeDasharray} hint={v.proteinGaugeHint} onPick={v.setGaugeIdx}
            value={<>{v.proteinGaugeValue}<span style={css("font-size:15px;color:rgba(236,229,218,.5)")}>{v.proteinGaugeTargetLabel}</span></>} />
        )}
        {v.rotSteps && (
          <GaugeCard idx={2} accent="#a8e063" label="STEPS" hintColor="rgba(236,229,218,.55)"
            dasharray={v.stepsGaugeDasharray} hint={v.stepsGaugeHint} onPick={v.setGaugeIdx}
            value={v.stepsGaugeValue} />
        )}

        <div style={css("border:1px solid rgba(138,106,209,.35);border-radius:14px;padding:16px 20px;background:linear-gradient(135deg,rgba(138,106,209,.13),rgba(138,106,209,.03) 60%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 0 50px -14px rgba(138,106,209,.4);display:flex;flex-direction:column")}>
          <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
            <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#b9a1e8")}>DAILY REVIEW</span>
            <Interactive as="span" onClick={v.shuffleReview} base="cursor:pointer;font:400 13px 'JetBrains Mono',monospace;color:rgba(236,229,218,.45)" hoverStyle="color:#ece5da">⟳</Interactive>
          </div>
          <div style={css("margin-top:8px;font:400 16px/1.4 'Instrument Serif',serif;text-wrap:pretty;color:rgba(236,229,218,.92);max-height:90px;overflow-y:auto")}>{v.reviewConcept}</div>
          <div style={css("margin-top:auto;padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px")}>
            <span style={css("font-size:13px;color:rgba(236,229,218,.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>from <span style={css("font-style:italic;font-family:'Instrument Serif',serif;font-size:15px;color:#cbb6f2")}>{v.reviewFrom}</span></span>
            <Interactive as="span" onClick={v.openReview} base="cursor:pointer;flex:none;font-size:11.5px;font-weight:500;padding:6px 12px;border-radius:7px;border:1px solid rgba(138,106,209,.45);color:#cbb6f2;background:rgba(138,106,209,.1)" hoverStyle="background:rgba(138,106,209,.22)">Review</Interactive>
          </div>
        </div>
      </div>

      <div style={v.gridNoticed}>
        <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:20px 24px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:#d8b573")}>Nova noticed</span>
            <span style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.4)")}>WHILE YOU SLEPT</span>
          </div>
          {v.streakBadges.length > 0 && (
            <div style={css("margin-top:12px;display:flex;flex-wrap:wrap;gap:7px")}>
              {v.streakBadges.map((b) => (
                <span key={b.key} style={{ font: "500 9.5px 'JetBrains Mono',monospace", letterSpacing: '.04em', padding: '5px 10px', borderRadius: '7px', color: `rgb(${b.hue})`, background: `rgba(${b.hue},.12)`, border: `1px solid rgba(${b.hue},.3)` }}>{b.label}</span>
              ))}
            </div>
          )}
          <div style={css("margin-top:14px;display:flex;flex-direction:column;max-height:180px;overflow-y:auto")}>
            {v.usingLiveHealthInsight ? (
              v.healthInsightItems.length > 0 ? (
                v.healthInsightItems.map((item, i) => (
                  <div key={item.key} style={css(`display:flex;gap:13px;align-items:baseline;padding:11px 0${i < v.healthInsightItems.length - 1 ? ';border-bottom:1px solid rgba(236,229,218,.06)' : ''}`)}>
                    <span style={css("color:#d8b573")}>✦</span>
                    <span style={css("font-size:13.5px;line-height:1.55;color:rgba(236,229,218,.88)")}><span style={css("font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:rgba(216,181,115,.75);margin-right:8px")}>{item.label}</span>{item.text}</span>
                  </div>
                ))
              ) : (
                <div style={css("display:flex;gap:13px;align-items:baseline;padding:11px 0")}><span style={css("color:#d8b573")}>✦</span><span style={css("font-size:13.5px;line-height:1.55;color:rgba(236,229,218,.88)")}>{v.healthInsightEmptyText}</span></div>
              )
            ) : (
              <>
                <div style={css("display:flex;gap:13px;align-items:baseline;padding:11px 0;border-bottom:1px solid rgba(236,229,218,.06)")}><span style={css("color:#d8b573")}>✦</span><span style={css("font-size:13.5px;line-height:1.55;color:rgba(236,229,218,.88)")}>You've skipped three runs — Coach moved tomorrow's zone-2 to 7 am. <span onClick={v.acceptRun} style={css("cursor:pointer;color:#6be5f5;font-size:12px;border-bottom:1px dotted rgba(107,229,245,.5)")}>Accept</span></span></div>
                <div style={css("display:flex;gap:13px;align-items:baseline;padding:11px 0;border-bottom:1px solid rgba(236,229,218,.06)")}><span style={css("color:#d8b573")}>✦</span><span style={css("font-size:13.5px;line-height:1.55;color:rgba(236,229,218,.88)")}>Your <em onClick={v.openProteinNote} style={css("cursor:pointer;font-family:'Instrument Serif',serif;color:#d8b573")}>Huberman — protein timing</em> note now links to 4 recipes in the vault.</span></div>
                <div style={css("display:flex;gap:13px;align-items:baseline;padding:11px 0")}><span style={css("color:#d8b573")}>✦</span><span style={css("font-size:13.5px;line-height:1.55;color:rgba(236,229,218,.88)")}>CFO flagged two overlapping subscriptions — $23/mo recoverable. <span onClick={v.reviewSubs} style={css("cursor:pointer;color:#6be5f5;font-size:12px;border-bottom:1px dotted rgba(107,229,245,.5)")}>Review</span></span></div>
              </>
            )}
          </div>
        </div>
        <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:20px 24px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:#d8b573")}>Today</span>
            {v.todayIsLive && <span style={css("font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#6be5f5")}>LIVE · CALENDAR</span>}
          </div>
          <div style={css("margin-top:14px;display:flex;flex-direction:column")}>
            {v.todayEvents.map((ev, i) => (
              <div key={i} style={css("display:flex;gap:14px;align-items:baseline;padding:8px 0")}>
                <span style={css("font:500 10.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4);width:46px;flex:none;padding-top:2px;font-variant-numeric:tabular-nums")}>{ev.time}</span>
                <span style={css("font-size:13.5px")}>{ev.label}</span>
                {ev.category && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', letterSpacing: '.06em', padding: '2px 7px', borderRadius: '5px', flex: 'none', color: `rgba(${ev.categoryHue},.9)`, background: `rgba(${ev.categoryHue},.12)` }}>{ev.category.toUpperCase()}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={v.gridVault}>
        <Interactive onClick={v.openLunch} base="cursor:pointer;border:1px solid rgba(236,229,218,.09);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)" hoverStyle="border-color:rgba(216,181,115,.35)">
          <div style={css("height:86px;background:repeating-linear-gradient(45deg, rgba(216,181,115,.12) 0 8px, rgba(216,181,115,.04) 8px 16px);display:flex;align-items:center;justify-content:center")}><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5)")}>{v.lunchCardPhoto}</span></div>
          <div style={css("padding:12px 16px")}><div style={css("font-size:14px;font-weight:500")}>{v.lunchCardLabel}</div><div style={css("margin-top:3px;font:400 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5)")}>{v.lunchCardMacros}</div></div>
        </Interactive>
        <Interactive onClick={v.goWorkouts} base="cursor:pointer;border:1px solid rgba(236,229,218,.09);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)" hoverStyle="border-color:rgba(107,229,245,.35)">
          <div style={css("height:86px;background:repeating-linear-gradient(45deg, rgba(107,229,245,.1) 0 8px, rgba(107,229,245,.03) 8px 16px);display:flex;align-items:center;justify-content:center")}><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5)")}>{v.workoutCardPhoto}</span></div>
          <div style={css("padding:12px 16px")}><div style={css("font-size:14px;font-weight:500")}>{v.workoutCardLabel}</div><div style={css("margin-top:3px;font:400 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5)")}>{v.workoutCardMeta}</div></div>
        </Interactive>
        <Interactive onClick={v.noteCard.onOpen} base="cursor:pointer;border:1px solid rgba(236,229,218,.09);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)" hoverStyle="border-color:rgba(138,106,209,.45)">
          <div style={css("height:86px;background:repeating-linear-gradient(45deg, rgba(138,106,209,.12) 0 8px, rgba(138,106,209,.04) 8px 16px);display:flex;align-items:center;justify-content:center;padding:0 12px;overflow:hidden")}><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{v.noteCard.photoLabel}</span></div>
          <div style={css("padding:12px 16px")}><div style={css("font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{v.noteCard.title}</div><div style={css("margin-top:3px;font:400 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5)")}>{v.noteCard.meta}</div></div>
        </Interactive>
      </div>

      {v.isMobile && (
        <div style={css("margin-top:14px;border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)")}>
          <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>AGENTS · CONCEPT</div>
          <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:12px")}>
            {v.agents.map((ag) => (
              <span key={ag.name} style={css("display:flex;align-items:center;gap:8px;font-size:12px;padding:7px 12px;border-radius:8px;border:1px solid rgba(236,229,218,.12);color:rgba(236,229,218,.75)")}>{ag.name}<span style={ag.dotStyle}></span></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
