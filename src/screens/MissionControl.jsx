import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';

// Command Core (design 45): hero with eyebrow/tagline/standfirst beside the
// living Nova core + three conic-progress satellites, then Suggested Focus /
// Today / Daily Review, the wide "Nova noticed" pane, and three vault cards.
// Everything renders from the view-model — same live-data truth as before.

const M = "'IBM Plex Mono',monospace";
const R = "'Rajdhani',sans-serif";
const S = "'Instrument Serif',serif";

const orbStyle = (size, dur, dir) => ({
  position: 'absolute', width: size, height: size, borderRadius: '50%',
  border: '1px dashed var(--nv-edge)',
  animation: `nvSpin ${dur} linear infinite ${dir} var(--nv-anim)`,
});

function Sat({ pos, colorVar, glowVar, d }) {
  return (
    <div style={{ position: 'absolute', ...pos, borderRadius: '11px', padding: '2px', background: `conic-gradient(from 210deg, var(${colorVar}) ${d.pct}%, var(--nv-edge) 0)`, boxShadow: `var(${glowVar})` }}>
      <div style={{ borderRadius: '9px', background: 'var(--nv-glass2)', backdropFilter: 'blur(14px)', padding: '10px 15px' }}>
        <div style={{ font: `500 8px ${M}`, letterSpacing: '.22em', color: 'var(--nv-ink60)' }}>{d.label}</div>
        <div style={{ font: `700 24px ${R}`, marginTop: '2px', fontVariantNumeric: 'tabular-nums', color: `var(${colorVar})` }}>
          {d.value}{d.small ? <small style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--nv-ink40)' }}>{d.small}</small> : null}
        </div>
        <div style={{ font: `400 8px ${M}`, marginTop: '1px', letterSpacing: '.04em', color: 'var(--nv-ink40)' }}>{d.hint}</div>
      </div>
    </div>
  );
}

function Cluster({ v }) {
  const mob = v.isMobile;
  const core = mob ? 232 : 312;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: mob ? '344px' : '368px', marginTop: mob ? '10px' : 0 }}>
      <div style={orbStyle(mob ? 308 : 424, '70s', 'normal')}></div>
      <div style={orbStyle(mob ? 252 : 344, '50s', 'reverse')}></div>
      <Interactive
        onClick={v.openVoice}
        aria-label="Open Voice — talk to Nova"
        base={{ position: 'relative', width: core, height: core, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--nv-glow-core)' }}
        hoverStyle={{}}
      >
        <NovaCore size={core} />
        {v.coreWaveOn && (
          <div style={{ position: 'absolute', bottom: Math.round(core * 0.19), display: 'flex', gap: '2.5px', alignItems: 'flex-end', height: '12px' }}>
            {[5, 10, 7, 11, 6].map((h, i) => (
              <span key={i} style={{ width: '2.5px', height: h + 'px', background: 'var(--nv-cy)', borderRadius: '2px', transformOrigin: 'bottom', animation: `wave 1.1s ease-in-out ${i * 0.12}s infinite var(--nv-anim)` }}></span>
            ))}
          </div>
        )}
        <div style={{ position: 'absolute', bottom: Math.round(core * 0.135), font: `500 7.5px ${M}`, letterSpacing: '.34em', color: 'var(--nv-cy)' }}>{v.coreLabel}</div>
      </Interactive>
      <Sat pos={{ top: '10px', right: 0 }} colorVar="--nv-cy" glowVar="--nv-glow-sat1" d={v.satSleep} />
      <Sat pos={{ bottom: '16px', left: mob ? 0 : '-6px' }} colorVar="--nv-mg" glowVar="--nv-glow-sat2" d={v.satSteps} />
      <Sat pos={{ bottom: '64px', right: mob ? 0 : '-10px' }} colorVar="--nv-vi" glowVar="--nv-glow-sat3" d={v.satProtein} />
    </div>
  );
}

const phH = (colorVar, tshVar) => ({ font: `700 19px ${R}`, letterSpacing: '.16em', color: `var(${colorVar})`, textShadow: `var(${tshVar})` });
const phMeta = { font: `500 8.5px ${M}`, letterSpacing: '.2em', color: 'var(--nv-ink40)' };
const noticedRow = (last) => css(`display:flex;gap:12px;align-items:baseline;padding:9px 0;font:500 14px/1.55 ${R};color:var(--nv-ink60)${last ? '' : ';border-bottom:1px solid rgba(130,175,255,.09)'}`);

export function MissionControl({ v }) {
  const mob = v.isMobile;
  const heroGrid = mob
    ? { display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 0 18px' }
    : { display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '26px', padding: '14px 4px 26px', alignItems: 'center' };
  const rowA = mob ? { display: 'flex', flexDirection: 'column', gap: '12px' } : { display: 'grid', gridTemplateColumns: '1.08fr .8fr .8fr', gap: '16px' };
  const cardsGrid = mob ? { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' } : { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px', marginTop: '18px' };

  return (
    <div style={v.wrapMission} data-screen-label="Mission Control">
      <section style={heroGrid}>
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', font: `500 10px ${M}`, letterSpacing: '.28em', color: 'var(--nv-ink60)', marginBottom: '16px' }}>
            <span>{v.heroDate}</span>
            <span style={{ color: 'var(--nv-ink40)' }}>·</span>
            <span style={{ color: 'var(--nv-gold)', fontVariantNumeric: 'tabular-nums' }}>{v.clock}</span>
            <span style={{ color: 'var(--nv-ink40)' }}>·</span>
            <span style={{ color: 'var(--nv-cy)', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--nv-cy)', boxShadow: '0 0 8px var(--nv-cy)', animation: 'novaPulse 2s infinite var(--nv-anim)' }}></span>
              {v.agentsLiveLabel}
            </span>
            <span style={{ color: 'var(--nv-ink40)' }}>·</span>
            <span style={{ color: v.systemsLabel.color }}>{v.systemsLabel.text}</span>
          </div>
          <h1 style={{ margin: 0, font: `700 ${mob ? '34px' : 'clamp(38px,3.9vw,50px)'}/1.04 ${R}`, letterSpacing: '.01em', textWrap: 'balance' }}>
            {v.greeting}
            <span style={css(`display:block;font:italic 400 ${mob ? '27px' : 'clamp(30px,3.2vw,41px)'}/1.12 ${S};margin-top:6px;background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi) 55%,var(--nv-mg));-webkit-background-clip:text;background-clip:text;color:transparent;text-wrap:balance`)}>{v.heroTagline}</span>
          </h1>
          <p style={{ margin: '16px 0 0', font: `500 16px/1.6 ${R}`, color: 'var(--nv-ink60)', maxWidth: '54ch' }}>
            {v.heroStand.map((seg, i) => (
              <span key={i} style={seg.b ? { color: 'var(--nv-ink)', fontWeight: 700 } : seg.cy ? { color: 'var(--nv-cy)', fontWeight: 700 } : undefined}>{seg.t}</span>
            ))}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '24px' }}>
            <Interactive as="span" onClick={v.onEngage}
              base={css(`cursor:pointer;font:600 11px ${M};letter-spacing:.16em;padding:13px 24px;border-radius:7px;border:1px solid var(--nv-cta-border);background:var(--nv-cta-bg);color:var(--nv-cta-ink);box-shadow:var(--nv-glow-cta);text-shadow:var(--nv-tsh-cta)`)}
              hoverStyle={{ filter: 'brightness(1.18)' }}
            >ENGAGE NEXT BLOCK</Interactive>
            <Interactive as="span" onClick={v.openPalette}
              base={css(`cursor:pointer;font:600 11px ${M};letter-spacing:.16em;padding:13px 20px;border-radius:7px;border:1px solid rgba(232,236,246,.16);color:var(--nv-ink60);background:transparent`)}
              hoverStyle={{ borderColor: 'var(--nv-acc-border)', color: 'var(--nv-ink)' }}
            ><b style={{ color: 'var(--nv-ink)', fontWeight: 600 }}>⌘K</b>&nbsp;&nbsp;SUMMON</Interactive>
          </div>
        </div>
        <Cluster v={v} />
      </section>

      <section style={rowA}>
        <div className="nv-pane nv-focus" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
            <span style={{ font: `500 9.5px ${M}`, letterSpacing: '.26em', color: 'var(--nv-gold)' }}>SUGGESTED FOCUS</span>
            <span style={{ font: `italic 400 13.5px ${S}`, color: 'rgba(224,178,106,.85)' }}>{v.suggestedFocus.source}</span>
          </div>
          <div style={{ font: `400 26px/1.18 ${S}`, textWrap: 'pretty' }}>
            {v.suggestedFocus.title}
            <em style={{ fontStyle: 'italic', color: 'var(--nv-gold)' }}>{v.suggestedFocus.accent}</em>
          </div>
          {v.suggestedFocus.detail && (
            <p style={{ margin: '12px 0 0', font: `500 14px/1.6 ${R}`, color: 'var(--nv-ink60)' }}>{v.suggestedFocus.detail}</p>
          )}
          {(v.suggestedFocus.onPrimary || v.suggestedFocus.onSecondary) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: 'auto', paddingTop: '16px' }}>
              {v.suggestedFocus.onPrimary && (
                <Interactive as="span" onClick={v.suggestedFocus.onPrimary}
                  base={css("cursor:pointer;font:600 13px 'Rajdhani',sans-serif;letter-spacing:.03em;padding:8px 16px;border-radius:8px;border:1px solid var(--nv-gold);background:var(--nv-gold);color:#1a1206;box-shadow:0 4px 16px -6px rgba(224,178,106,.6)")}
                  hoverStyle={{ filter: 'brightness(1.1)' }}
                >{v.suggestedFocus.primaryLabel}</Interactive>
              )}
              {v.suggestedFocus.onSecondary && (
                <Interactive as="span" onClick={v.suggestedFocus.onSecondary}
                  base={css("cursor:pointer;font:600 13px 'Rajdhani',sans-serif;letter-spacing:.03em;padding:8px 16px;border-radius:8px;border:1px solid rgba(232,236,246,.18);color:var(--nv-ink60);background:transparent")}
                  hoverStyle={{ background: 'rgba(255,255,255,.05)' }}
                >{v.suggestedFocus.secondaryLabel}</Interactive>
              )}
            </div>
          )}
        </div>

        <div className="nv-pane" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
            <span style={phH('--nv-cy', '--nv-tsh-head-cy')}>TODAY</span>
            {v.todayIsLive && <span style={phMeta}>LIVE · CALENDAR</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '218px', overflowY: 'auto' }}>
            {v.todayEvents.map((ev, i) => (
              <div key={i} style={css(`display:flex;gap:12px;align-items:baseline;padding:8px 0;font:500 14px ${R}${i < v.todayEvents.length - 1 ? ';border-bottom:1px solid rgba(130,175,255,.09)' : ''}`)}>
                <span style={{ font: `500 10.5px ${M}`, fontVariantNumeric: 'tabular-nums', width: '52px', flex: 'none', color: ev.now ? 'var(--nv-cy)' : 'var(--nv-ink40)', fontWeight: ev.now ? 600 : 500 }}>
                  {ev.now && <span style={{ color: 'var(--nv-mg)' }}>▸ </span>}{ev.time}
                </span>
                <span style={{ color: ev.now ? 'var(--nv-cy)' : ev.past ? 'var(--nv-ink40)' : 'var(--nv-ink)', fontWeight: ev.now ? 600 : 500, minWidth: 0 }}>
                  {ev.label}
                  {ev.until && <span style={{ font: `400 10px ${M}`, color: 'var(--nv-cy)', marginLeft: '8px' }}>{ev.until}</span>}
                </span>
                {ev.category && <span style={{ marginLeft: 'auto', font: `500 9px ${M}`, letterSpacing: '.06em', padding: '2px 7px', borderRadius: '5px', flex: 'none', color: `rgba(${ev.categoryHue},.9)`, background: `rgba(${ev.categoryHue},.12)` }}>{ev.category.toUpperCase()}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="nv-pane" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
            <span style={phH('--nv-vi', '--nv-tsh-head-vi')}>DAILY REVIEW</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={phMeta}>{v.reviewMeta}</span>
              <Interactive as="span" onClick={v.shuffleReview} aria-label="Shuffle daily review" base={{ cursor: 'pointer', font: `400 13px ${M}`, color: 'var(--nv-ink40)' }} hoverStyle={{ color: 'var(--nv-ink)' }}>⟳</Interactive>
            </span>
          </div>
          <div style={{ font: `400 16px/1.45 ${S}`, textWrap: 'pretty', color: 'rgba(232,236,246,.92)', maxHeight: '132px', overflowY: 'auto' }}>{v.reviewConcept}</div>
          <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ font: `500 12.5px ${R}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              from <em style={{ font: `italic 400 15px ${S}`, color: '#cbb6f2' }}>{v.reviewFrom}</em>
            </span>
            <Interactive as="span" onClick={v.openReview}
              base={css("cursor:pointer;flex:none;font:600 12.5px 'Rajdhani',sans-serif;padding:6px 14px;border-radius:8px;border:1px solid rgba(143,123,255,.45);color:#cbb6f2;background:rgba(143,123,255,.1)")}
              hoverStyle={{ background: 'rgba(143,123,255,.22)' }}
            >Review</Interactive>
          </div>
        </div>
      </section>

      <section style={{ marginTop: mob ? '12px' : '18px' }}>
        <div className="nv-pane nv-noticed nv-scan" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
            <span style={{ font: `700 19px ${R}`, letterSpacing: '.16em' }}>
              <em style={{ font: `italic 400 22px ${S}`, letterSpacing: 0, color: 'var(--nv-gold)', marginRight: '5px' }}>Nova</em>NOTICED
            </span>
            <span style={phMeta}>WHILE YOU SLEPT</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
            {v.usingLiveHealthInsight && v.healthInsightItems.length > 0 ? (
              v.healthInsightItems.map((item, i) => (
                <div key={item.key} style={noticedRow(i === v.healthInsightItems.length - 1)}>
                  <span style={{ color: 'var(--nv-gold)', flex: 'none' }}>✦</span>
                  <span><span style={{ font: `600 8.5px ${M}`, letterSpacing: '.14em', color: 'rgba(224,178,106,.8)', marginRight: '9px' }}>{item.label}</span>{item.text}</span>
                </div>
              ))
            ) : !v.noticedShowDemo ? (
              <div style={noticedRow(true)}><span style={{ color: 'var(--nv-gold)', flex: 'none' }}>✦</span><span>{v.healthInsightEmptyText}</span></div>
            ) : (
              <>
                <div style={noticedRow(false)}><span style={{ color: 'var(--nv-gold)', flex: 'none' }}>✦</span><span>You've skipped three runs — Coach moved tomorrow's zone-2 to 7 am. <Interactive as="span" onClick={v.acceptRun} base={css("cursor:pointer;color:var(--nv-cy);font-size:12px;border-bottom:1px dotted rgba(89,230,255,.5)")} hoverStyle={{ borderBottomStyle: 'solid' }}>Accept</Interactive></span></div>
                <div style={noticedRow(false)}><span style={{ color: 'var(--nv-gold)', flex: 'none' }}>✦</span><span>Your <em onClick={v.openProteinNote} style={css(`cursor:pointer;font:italic 400 15px ${S};color:var(--nv-gold)`)}>Huberman — protein timing</em> note now links to <b style={{ color: 'var(--nv-ink)' }}>4 recipes</b> in the vault.</span></div>
                <div style={noticedRow(true)}><span style={{ color: 'var(--nv-gold)', flex: 'none' }}>✦</span><span>CFO flagged two overlapping subscriptions — <b style={{ color: 'var(--nv-ink)' }}>$23/mo recoverable</b>. <Interactive as="span" onClick={v.reviewSubs} base={css("cursor:pointer;color:var(--nv-cy);font-size:12px;border-bottom:1px dotted rgba(89,230,255,.5)")} hoverStyle={{ borderBottomStyle: 'solid' }}>Review</Interactive></span></div>
              </>
            )}
          </div>
          {v.streakBadges.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {v.streakBadges.map((b) => (
                <span key={b.key} style={{ font: `500 9px ${M}`, letterSpacing: '.07em', padding: '5px 11px', borderRadius: '5px', color: `rgb(${b.hue})`, background: `rgba(${b.hue},.07)`, border: `1px solid rgba(${b.hue},.4)` }}>{b.label}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={cardsGrid}>
        <Interactive className="nv-pane" onClick={v.openLunch} base={{ padding: '14px 20px', borderRadius: '8px', cursor: 'pointer' }} hoverStyle={{ boxShadow: '0 0 28px -10px rgba(224,178,106,.6)' }}>
          <div style={{ font: `500 8.5px ${M}`, letterSpacing: '.24em', color: 'var(--nv-gold)' }}>{v.lunchCardK}</div>
          <div style={{ font: `700 20px ${R}`, letterSpacing: '.04em', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.lunchCardLabel}</div>
          <div style={{ font: `500 12.5px ${R}`, color: 'var(--nv-ink60)', marginTop: '2px' }}>{v.lunchCardMacros}</div>
        </Interactive>
        <Interactive className="nv-pane" onClick={v.goWorkouts} base={{ padding: '14px 20px', borderRadius: '8px', cursor: 'pointer' }} hoverStyle={{ boxShadow: '0 0 28px -10px rgba(89,230,255,.6)' }}>
          <div style={{ font: `500 8.5px ${M}`, letterSpacing: '.24em', color: 'var(--nv-cy)' }}>{v.workoutCardK}</div>
          <div style={{ font: `700 20px ${R}`, letterSpacing: '.04em', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.workoutCardLabel}</div>
          <div style={{ font: `500 12.5px ${R}`, color: 'var(--nv-ink60)', marginTop: '2px' }}>{v.workoutCardMeta}</div>
        </Interactive>
        <Interactive className="nv-pane" onClick={v.noteCard.onOpen} base={{ padding: '14px 20px', borderRadius: '8px', cursor: 'pointer' }} hoverStyle={{ boxShadow: '0 0 28px -10px rgba(255,122,217,.55)' }}>
          <div style={{ font: `500 8.5px ${M}`, letterSpacing: '.24em', color: 'var(--nv-mg)' }}>VAULT · LATEST ENTRY</div>
          <div style={{ font: `700 20px ${R}`, letterSpacing: '.04em', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.noteCard.title}</div>
          <div style={{ font: `500 12.5px ${R}`, color: 'var(--nv-ink60)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.noteCard.meta}</div>
        </Interactive>
      </section>

      {mob && (
        <div className="nv-pane" style={{ marginTop: '12px', padding: '16px 18px' }}>
          <div style={{ font: `500 8.5px ${M}`, letterSpacing: '.24em', color: 'var(--nv-ink40)' }}>{v.agentsGroupLabel}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {v.agents.map((ag) => (
              <span key={ag.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', font: `600 12.5px ${R}`, padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--nv-edge)', color: ag.on ? 'var(--nv-ink)' : 'var(--nv-ink40)' }}>{ag.name}<span style={ag.dotStyle}></span></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
