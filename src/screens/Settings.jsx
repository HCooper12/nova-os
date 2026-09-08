import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { TabOrderEditor } from '../TabOrderEditor.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, isAppleStyle, ScreenHead } from '../Controls.jsx';

// the material pass (6 Sep 2026): labels through Controls.jsx; a filled
// button is sentence-case in the UI face under the Apple styles
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '9px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

const statusColor = { idle: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', testing: 'var(--nv-gold)', ok: '#5aa87c', error: 'var(--nv-warn)' };

// Swatch dots shown on each theme card: accent, secondary, ground.
const THEME_SWATCHES = {
  command: ['#59e6ff', '#8f7bff', '#0a0f1e'],
  observatory: ['var(--nv-gold)', 'var(--nv-cy)', '#0c1424'],
  ember: ['#ffb35c', '#ff6a88', '#170e0b'],
  daylight: ['#007aff', '#ffffff', '#f2f2f7'],
};

export function Settings({ v }) {
  return (
    <div style={v.wrapSettings} data-screen-label="Settings">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <ScreenHead numeral="XIV." label="System · Settings" />
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Connect the <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>real vault.</span></h1>
      <div style={css("margin-top:8px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 60%, transparent);max-width:640px;line-height:1.6")}>
        Point Nova OS at the backend running on your Mac to replace the demo data with your
        real Obsidian vault, calendar, and health data. Until then the app runs in demo mode —
        everything you see is clearly-badged sample data.
      </div>

      <div style={css("margin-top:28px;max-width:520px;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:24px 26px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
        <Eyebrow as="label" htmlFor="settings-base-url">Backend URL</Eyebrow>
        <Interactive
          as="input"
          id="settings-base-url"
          value={v.settingsBaseUrl}
          onChange={v.setSettingsBaseUrl}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url"
          placeholder="https://your-mac.tailxxxx.ts.net:4173"
          base="margin-top:8px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-mono);outline:none"
          focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
        />

        <Eyebrow as="label" htmlFor="settings-token" style={{ marginTop: '16px' }}>API token</Eyebrow>
        <Interactive
          as="input"
          id="settings-token"
          type="password"
          value={v.settingsToken}
          onChange={v.setSettingsToken}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="printed in the server's terminal on first run"
          base="margin-top:8px;width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-mono);outline:none"
          focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
        />

        <div style={css("margin-top:18px;display:flex;gap:10px;flex-wrap:wrap")}>
          <Interactive as="span" onClick={v.testSettingsConnection} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy);background:color-mix(in srgb, var(--nv-cy) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 14%, transparent)">Test connection</Interactive>
          <Interactive as="span" onClick={v.saveSettingsConnection} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">Save &amp; connect</Interactive>
          {v.connectionActive && (
            <Interactive as="span" onClick={v.disconnectSettings} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)" hoverStyle="background:rgba(255,255,255,.05)">Disconnect</Interactive>
          )}
        </div>

        <div style={css(`margin-top:16px;font-size:12.5px;color:${statusColor[v.settingsTestStatus]}`)}>{v.settingsTestMessage}</div>
      </div>

      {v.profile && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <Eyebrow as="span" tone="gold">About you</Eyebrow>
            <Meta tone="faint">The root context every Nova agent reasons from · lives in your vault</Meta>
            {!v.profile.editing && (
              <Chip tone="gold" onClick={v.profile.startEdit}>{v.profile.set ? 'Edit' : 'Set up'}</Chip>
            )}
            {!v.profile.editing && (
              <Chip tone="blue" onClick={v.profile.setNumbers}>{v.profile.numbers ? 'Redo my numbers' : 'Set my numbers'}</Chip>
            )}
          </div>
          {!v.profile.editing && (
            <Meta tone="faint" style={{ display: 'block', marginTop: '8px' }}>
              {v.profile.numbers
                ? `Your numbers (Intake, ${v.profile.numbers.on}): ${v.profile.numbers.plan?.targetKcal} kcal · ${v.profile.numbers.plan?.proteinG} g protein floor · TDEE ${v.profile.numbers.plan?.tdee} — from ${v.profile.numbers.facts?.weightKg} kg, ${v.profile.numbers.facts?.activity}, goal ${v.profile.numbers.facts?.goal}`
                : 'No intake yet — every calorie target in Fuel rests on numbers typed once. Seven questions, by voice or typing, and code computes the rest.'}
            </Meta>
          )}

          {v.profile.editing ? (
            <div className="nv-pane" style={{ marginTop: '12px', padding: '18px 20px', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={css("display:block")}>
                <Eyebrow as="span">Current focus · what this season of life is about</Eyebrow>
                <input value={v.profile.draft.focus} onChange={v.profile.setField('focus')} placeholder="e.g. Building my body and my content while holding down full-time work"
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px var(--nv-font-ui)", padding: '9px 12px', outline: 'none' }} />
              </label>
              <label style={css("display:block")}>
                <Eyebrow as="span">Priorities · one per line, the handful that matter most now</Eyebrow>
                <textarea value={v.profile.draft.priorities} onChange={v.profile.setField('priorities')} rows={4} placeholder={"Get to 78kg lean\nShip one video a week\nProtein consistency\nSleep before 11"}
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px var(--nv-font-ui)", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              </label>
              <label style={css("display:block")}>
                <Eyebrow as="span">Performing at your best · what that looks and feels like for you</Eyebrow>
                <textarea value={v.profile.draft.bestSelf} onChange={v.profile.setField('bestSelf')} rows={2} placeholder="Disciplined but not rigid — training hard, eating well, creating consistently, present with people."
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px var(--nv-font-ui)", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              </label>
              <label style={css("display:block")}>
                <Eyebrow as="span">Context &amp; constraints · anything Nova should always know</Eyebrow>
                <textarea value={v.profile.draft.notes} onChange={v.profile.setField('notes')} rows={3} placeholder="Work 9-5 Mon-Fri. Gym has only dumbbells (to 40kg) on weekends. Left shoulder flares under heavy overhead. Prefer training evenings."
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px var(--nv-font-ui)", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              </label>
              <div style={css("display:flex;gap:10px;align-items:center")}>
                <Interactive as="span" onClick={v.profile.saving ? undefined : v.profile.save} base={btn('var(--nv-gold)', '#1a1322', { opacity: v.profile.saving ? 0.5 : 1 })} hoverStyle={{ filter: 'brightness(1.08)' }}>{v.profile.saving ? 'Saving…' : 'Save'}</Interactive>
                <TextAction compact tone="faint" onClick={v.profile.cancelEdit}>Cancel</TextAction>
              </div>
            </div>
          ) : v.profile.set ? (
            <div className="nv-pane" style={{ marginTop: '12px', padding: '18px 20px', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {v.profile.view.focus && <div><Eyebrow>Current focus</Eyebrow><div style={css("margin-top:3px;font:500 14px var(--nv-font-ui)")}>{v.profile.view.focus}</div></div>}
              {v.profile.view.priorities.length > 0 && <div><Eyebrow>Priorities</Eyebrow><div style={css("margin-top:4px;display:flex;flex-direction:column;gap:3px")}>{v.profile.view.priorities.map((p, i) => <div key={i} style={css("font:500 13px var(--nv-font-ui);color:var(--nv-ink60)")}>· {p}</div>)}</div></div>}
              {v.profile.view.bestSelf && <div><Eyebrow>At your best</Eyebrow><div style={css("margin-top:3px;font:500 12.5px/1.55 var(--nv-font-ui);color:var(--nv-ink60)")}>{v.profile.view.bestSelf}</div></div>}
              {v.profile.view.notes && <div><Eyebrow>Context &amp; constraints</Eyebrow><div style={css("margin-top:3px;font:500 12.5px/1.55 var(--nv-font-ui);color:var(--nv-ink60);white-space:pre-wrap")}>{v.profile.view.notes}</div></div>}
            </div>
          ) : (
            <div style={css("margin-top:10px;max-width:620px;font:500 12.5px/1.7 var(--nv-font-ui);color:var(--nv-ink60)")}>Nova knows your data but not yet your intentions. Tell it what you're working toward and it reasons through that in every answer, coaching session, and brief — the difference between a tool and a companion. Two minutes, editable anytime in Obsidian.</div>
          )}
        </div>
      )}

      {v.learning && v.learning.enoughData && (
        <div style={{ marginTop: '28px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <Eyebrow as="span" tone="cyan">What Nova has noticed</Eyebrow>
            <Meta tone="faint">Learned from your real decisions · shapes every suggestion</Meta>
          </div>
          <div className="nv-pane" style={{ marginTop: '12px', padding: '16px 18px', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {v.learning.noticed.map((n, i) => (
              <div key={i} style={css("font:500 12.5px/1.5 var(--nv-font-ui);color:var(--nv-ink60)")}>· {n}</div>
            ))}
          </div>
        </div>
      )}

      <Eyebrow style={{ marginTop: '34px' }}>Appearance</Eyebrow>
      <div style={css("margin-top:12px;max-width:520px;display:flex;flex-direction:column;gap:10px")}>
        <Eyebrow>Design style · same data, same features — two skins</Eyebrow>
        {v.novaStyleOptions.map((s) => (
          <Interactive
            key={s.value}
            onClick={s.pick}
            base={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px',
              border: s.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
              background: s.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
              boxShadow: s.active ? 'var(--nv-glow-tab)' : 'none',
            }}
            hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
          >
            {/* material swatch: HUD bracket square · calm rounded glass · grouped rows */}
            <span style={{ flex: 'none', width: '16px', height: '16px',
              borderRadius: s.value === 'command' ? '2px' : '6px',
              border: s.value === 'command' ? '1px solid var(--nv-acc-border)' : '1px solid rgba(255,255,255,.35)',
              background: s.value === 'command' ? 'var(--nv-acc-bg)'
                : s.value === 'cupertino' ? 'repeating-linear-gradient(180deg, rgba(255,255,255,.22) 0 4px, rgba(255,255,255,.06) 4px 8px)'
                : 'rgba(255,255,255,.12)',
              boxShadow: s.value === 'command' ? '0 0 8px -2px var(--nv-acc)' : 'none' }}></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: s.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{s.label}</span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{s.hint}</span>
            </span>
            {s.active && <Tag tone="accent" style={{ marginLeft: 'auto' }}>Active</Tag>}
          </Interactive>
        ))}

        <Eyebrow style={{ marginTop: '14px' }}>Theme · the palette, in either style</Eyebrow>
        {v.novaThemeOptions.map((t) => (
          <Interactive
            key={t.value}
            onClick={t.pick}
            base={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px',
              border: t.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
              background: t.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
              boxShadow: t.active ? 'var(--nv-glow-tab)' : 'none',
            }}
            hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
          >
            <span style={{ display: 'flex', gap: '5px', flex: 'none' }}>
              {(THEME_SWATCHES[t.value] || []).map((c, i) => (
                <span key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,.18)' }}></span>
              ))}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: t.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{t.label}</span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{t.hint}</span>
            </span>
            {t.active && <Tag tone="accent" style={{ marginLeft: 'auto' }}>Active</Tag>}
          </Interactive>
        ))}

        <Eyebrow style={{ marginTop: '14px' }}>Nova core</Eyebrow>
        {v.novaCoreOptions.map((c) => (
          <Interactive
            key={c.value}
            onClick={c.pick}
            base={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px',
              border: c.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
              background: c.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
              boxShadow: c.active ? 'var(--nv-glow-tab)' : 'none',
            }}
            hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
          >
            <span style={{ flex: 'none', width: '16px', height: '16px', borderRadius: '50%',
              border: c.value === 'hologram' ? '1.5px solid #59e6ff' : 'none',
              background: c.value === 'hologram'
                ? 'radial-gradient(circle at 50% 50%, #eafcff 0%, rgba(89,230,255,.5) 25%, transparent 60%)'
                : 'radial-gradient(circle at 40% 35%, #eafcff 0%, #9ef0ff 35%, #37b8de 70%, #0c3550 100%)',
              transform: c.value === 'hologram' ? 'rotateX(0deg)' : 'none' }}></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: c.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{c.label}</span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{c.hint}</span>
            </span>
            {c.active && <Tag tone="accent" style={{ marginLeft: 'auto' }}>Active</Tag>}
          </Interactive>
        ))}

        <Interactive
          onClick={v.toggleCalm}
          base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px', border: '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)', background: 'var(--nv-well)', marginTop: '14px' }}
          hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>Calm mode</span>
            <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>dims the glow and pauses ambient motion — same layout, lower voltage</span>
          </span>
          <Chip tone={v.calmMode ? 'accent' : 'quiet'} active={v.calmMode} style={{ marginLeft: 'auto' }}>{v.calmMode ? 'On' : 'Off'}</Chip>
        </Interactive>
      </div>

      {v.pushSettings && (
        <div style={{ marginTop: '34px' }}>
          <Eyebrow>Notifications</Eyebrow>
          <div className="nv-pane" style={{ marginTop: '12px', padding: '14px 18px', maxWidth: '520px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0, flex: '1 1 240px' }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>Phone & Watch notifications</span>
              <Meta as="div" tone={v.pushSettings.state === 'on' ? 'good' : 'faint'} style={{ marginTop: '2px' }}>{v.pushSettings.label}</Meta>
            </span>
            {v.pushSettings.state !== 'on' && v.pushSettings.state !== 'unsupported' && (
              <Interactive as="span" onClick={v.pushSettings.enable} base={btn('var(--nv-cy)', 'var(--nv-on-acc)')} hoverStyle={{ filter: 'brightness(1.08)' }}>Enable</Interactive>
            )}
            {v.pushSettings.state === 'on' && (
              <Chip tone="cyan" onClick={v.pushSettings.test}>Test</Chip>
            )}
          </div>
          <div style={css("margin-top:8px;max-width:520px;font-size:11px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Pushes fire when something needs your call — a drafted brief, a research outline, a Guardian alert. iPhone mirrors them to the Apple Watch automatically. Requires Nova installed to the Home Screen (Safari → Share → Add to Home Screen).</div>
        </div>
      )}

      {/* SETTINGS BY VOICE has no button by definition — so it needs a line
          that tells him it exists. (7 Sep: a capability he cannot find is a
          capability he does not have.) */}
      <div style={css("margin-top:26px;max-width:520px;border:1px solid color-mix(in srgb, var(--nv-cy) 26%, transparent);border-radius:12px;padding:13px 16px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent)")}>
        <Eyebrow tone="cyan">You can just say it</Eyebrow>
        <div style={css("margin-top:6px;font:400 12.5px/1.6 var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)")}>
          Most of this page answers to speech, on Voice or the ✦ Ask bar: “dark mode”, “light mode”, “use the ember theme”, “apple layout”, “calm mode on”, “stop talking”, “hey nova off”. Nova changes it and says what it did.
        
          <div style={css("margin-top:9px;padding-top:9px;border-top:1px solid color-mix(in srgb, var(--nv-cy) 18%, transparent)")}>
            And Nova can now FIX what is already written, by voice — it always asks first and shows the change: “that protein bar was 25 grams of protein”, “take the mars bar off my food log”, “my bench press second set was 80 for 8”, “add 30g of oats to the banana bread baked oats”. Your yes writes it; undo puts back exactly what was there.
          </div>
        </div>
      </div>

      {/* VOICE — moved off the Voice screen, which is a command centre, not
          a preferences page. Everything that only gets set once lives here. */}
      <div style={{ marginTop: '34px' }}>
        <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
          <Eyebrow as="span">Voice</Eyebrow>
          <Meta tone="faint">How Nova speaks, and how it hears you</Meta>
        </div>
        <div style={css("margin-top:12px;max-width:520px;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:20px 22px;background:var(--nv-glass);display:flex;flex-direction:column;gap:16px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:center;gap:12px")}>
            <div>
              <div style={css("font:600 12.5px var(--nv-font-ui)")}>Speak replies</div>
              <div style={css("margin-top:2px;font-size:11px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.voiceEngineLabel === 'BROWSER' ? 'Using the browser voice' : `Engine: ${v.voiceEngineLabel}`}</div>
            </div>
            <Chip tone={v.speakOn ? 'accent' : 'quiet'} active={v.speakOn} onClick={v.toggleSpeak}>{v.speakOn ? 'On' : 'Off'}</Chip>
          </div>

          <div style={css("display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:16px")}>
            <div>
              <div style={css("font:600 12.5px var(--nv-font-ui)")}>“Hey Nova”</div>
              <div style={css("margin-top:2px;max-width:340px;font-size:11px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>
                {v.wakeWordSupported
                  ? 'Say it anywhere in Nova and the conversation starts — no tap. Holds the microphone open while you’re in the app, and stands down whenever you or Nova are already talking.'
                  : 'This browser has no speech recognition, so the wake word can’t run here.'}
              </div>
            </div>
            {v.wakeWordSupported && (
              <Chip tone={v.wakeWordOn ? 'accent' : 'quiet'} active={v.wakeWordOn} onClick={() => v.setWakeWord(!v.wakeWordOn)} style={{ flex: 'none' }}>{v.wakeWordOn ? 'On' : 'Off'}</Chip>
            )}
          </div>

          {/* His 9-Sep report: "my speech is cut off and I feel like I am
              rushing to keep speaking before it thinks I have stopped
              talking." The browser's endpointer has no knob, so Nova ends
              the turn itself and this is the length. */}
          {v.wakeWordSupported && (
            <div style={css("border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:16px")}>
              <div style={css("font:600 12.5px var(--nv-font-ui)")}>How long a pause ends your turn</div>
              <div style={css("margin-top:2px;max-width:400px;font-size:11px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>
                Nova waits this long after you stop before it takes the turn and answers. Tap the core to send straight away.
              </div>
              <div style={css("margin-top:10px;display:flex;flex-wrap:wrap;gap:8px")}>
                {v.voiceHoldOptions.map((o) => (
                  <Chip key={o.value} tone={v.voiceHold === o.value ? 'accent' : 'quiet'} active={v.voiceHold === o.value}
                    onClick={() => v.setVoiceHold(o.value)}>{o.label} · {(o.holdMs / 1000).toFixed(1)}s</Chip>
                ))}
              </div>
              <div style={css("margin-top:8px;font:var(--nv-micro-l);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
                {v.voiceHoldOptions.find((o) => o.value === v.voiceHold)?.hint}
              </div>
            </div>
          )}

          {/* "I heard nothing" is not a diagnosis — this makes it one. */}
          <div style={css("border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px")}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={css("font:600 12.5px var(--nv-font-ui)")}>Can you hear Nova?</div>
              <div style={css("margin-top:2px;font-size:11px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Walks the whole path and names whatever fails.</div>
              {v.voiceTest?.stages?.length > 0 && (
                <div style={css("margin-top:9px;display:flex;flex-direction:column;gap:5px")}>
                  {v.voiceTest.stages.map((st, i) => (
                    <div key={i} style={css("display:flex;gap:8px;align-items:baseline;font:var(--nv-micro-l)")}>
                      <span style={{ color: st.ok ? 'var(--nv-good)' : 'var(--nv-warn)', flex: 'none' }}>{st.ok ? '✓' : '✕'}</span>
                      <span style={{ color: 'var(--nv-ink)', flex: 'none' }}>{st.stage}</span>
                      <span style={{ color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)', minWidth: 0 }}>{st.detail}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* the running build, so "am I on your fix?" is answerable — and
                  the research-browser sign-in — belong WITH this block, not as
                  flex siblings of it: four items across one flex row (this one,
                  Build, Research Browser, Test) squeezed the first down to a
                  one-word-wide column and printed Build\u2019s text over it. */}
              <Meta as="div" tone="faint" style={{ marginTop: '14px' }}>Build {v.novaBuild}</Meta>

              {/* RESEARCH BROWSER. Instagram, TikTok, X and LinkedIn refuse an
                  anonymous reader, so the Scout gets a Chrome profile of its
                  own that he signs into once. His hands type the password —
                  Nova never sees one, and this is the only place in the app
                  that opens a login page at all. */}
              <div style={css("margin-top:16px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:14px")}>
                <Eyebrow>Research browser</Eyebrow>
                <div style={css("margin-top:7px;font-size:11.5px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                  Instagram, TikTok, X and LinkedIn refuse an anonymous reader. Sign in once here and the Scout
                  reads them as you. It uses its own browser profile, never your everyday Chrome, and only ever
                  reads — it never posts, follows or fills anything. You type the password; Nova never sees it.
                </div>
                <Chip tone="accent" active disabled={v.browserSignIn.busy} onClick={v.browserSignIn.busy ? undefined : v.browserSignIn.open} style={{ marginTop: '10px' }}>
                  {v.browserSignIn.busy ? 'Opening…' : 'Sign in on the Mac'}
                </Chip>
              </div>
            </div>

            <Chip tone="accent" active onClick={v.runVoiceTest} style={{ flex: 'none' }}>{v.voiceTest?.running ? 'Testing…' : 'Test'}</Chip>
          </div>

          {v.voiceOptions.length > 0 && (
            <div style={css("border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:16px")}>
              <Eyebrow>{v.voicePickerLabel}</Eyebrow>
              <select value={v.voiceVoiceId} onChange={v.setVoiceId}
                style={{ marginTop: '7px', width: '100%', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: 'var(--nv-micro-l)', padding: '8px 9px', outline: 'none' }}>
                <option value="" style={{ background: '#141019' }}>{v.voiceDefaultLabel}</option>
                {v.voiceOptions.map((o) => <option key={o.id} value={o.id} style={{ background: '#141019' }}>{o.name}</option>)}
              </select>
            </div>
          )}

          {v.usingBrowserVoice && v.systemVoices.length > 0 && (
            <div style={css("border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:16px")}>
              <Eyebrow>Voice · free on-device</Eyebrow>
              <select value={v.speechVoiceURI} onChange={v.setSpeechVoice}
                style={{ marginTop: '7px', width: '100%', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: 'var(--nv-micro-l)', padding: '8px 9px', outline: 'none' }}>
                <option value="" style={{ background: '#141019' }}>System default</option>
                {v.systemVoices.map((o) => <option key={o.uri} value={o.uri} style={{ background: '#141019' }}>{o.name}</option>)}
              </select>
              <div style={css("margin-top:6px;font-size:10px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>More free voices: iOS Settings → Accessibility → Spoken Content → Voices → download, then they appear here.</div>
            </div>
          )}
          {v.voiceEngineDetail && (
            <div style={css("font-size:10.5px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 38%, transparent)")}>{v.voiceEngineDetail}</div>
          )}
        </div>
      </div>

      {v.tabOrderItems && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <Eyebrow as="span">Navigation order</Eyebrow>
            <Meta tone="faint">Drag to reorder the tab bar and the sidebar</Meta>
          </div>
          <div style={{ marginTop: '12px' }}>
            <TabOrderEditor items={v.tabOrderItems} onReorder={v.setTabOrder} />
          </div>
          <div style={css("margin-top:8px;max-width:520px;font-size:11px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Press and drag a row to reorder. On your phone the first three fill the floating dock and the rest live in More. On the Mac this same order sorts the sidebar within its groups — Workspace, Vault and System stay as they are. Remembered on this device.</div>
        </div>
      )}

      {v.calendarSettings && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <Eyebrow as="span">Calendars</Eyebrow>
            <Meta tone="faint">Turn off any you don't want Nova reading</Meta>
            <TextAction compact tone="quiet" onClick={v.calendarSettings.load}>Refresh</TextAction>
          </div>
          {v.calendarSettings.error && (
            <div style={css("margin-top:10px;max-width:520px;font-size:12px;line-height:1.6;color:var(--nv-warn)")}>Couldn't load the calendar list — a connection problem, not "no calendars". Tap REFRESH to retry.</div>
          )}
          {!v.calendarSettings.error && !v.calendarSettings.loaded && (
            <div style={css("margin-top:10px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Loading your calendars…</div>
          )}
          {!v.calendarSettings.error && v.calendarSettings.loaded && v.calendarSettings.calendars.length === 0 && (
            <div style={css("margin-top:10px;max-width:520px;font-size:12px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>No calendars found — check that iCloud calendar access is connected on the server.</div>
          )}
          {v.calendarSettings.calendars.length > 0 && (
            <>
              <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:8px;max-width:520px")}>
                {v.calendarSettings.calendars.map((c) => (
                  <div key={c.url} className="nv-pane" style={{ padding: '11px 15px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 500, opacity: c.hidden ? 0.5 : 1, textDecoration: c.hidden ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{c.name}</span>
                    <Chip tone={c.hidden ? 'quiet' : 'accent'} active={!c.hidden} onClick={c.toggle} style={{ flex: 'none' }}>{c.hidden ? 'Hidden' : 'Shown'}</Chip>
                  </div>
                ))}
              </div>
              <div style={css("margin-top:8px;max-width:520px;font-size:11px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Hidden calendars are skipped everywhere — today's view, dispatches and the daily review. The Apple Calendar app's own show/hide checkboxes aren't visible to Nova, so set it here.</div>
            </>
          )}
        </div>
      )}

      {/* THE MODEL BOARD — one row per lane that talks to Claude: pick the
          model, or switch the lane off. Server-held, so what you set here is
          what the Mac's schedulers run at 3am too. */}
      {v.modelSettings && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <Eyebrow as="span" tone="gold">Claude models</Eyebrow>
            <Meta tone="faint">Every agent and feature · pick the model, or switch it off</Meta>
            {v.modelSettings.loaded && v.modelSettings.customisedCount + v.modelSettings.offCount > 0 && (
              <TextAction compact tone="quiet" disabled={v.modelSettings.busyAll} onClick={v.modelSettings.busyAll ? undefined : v.modelSettings.resetAll}>{v.modelSettings.busyAll ? 'Resetting…' : 'Reset all'}</TextAction>
            )}
          </div>

          {v.modelSettings.error && (
            <div style={css("margin-top:10px;max-width:640px;font-size:12px;line-height:1.6;color:var(--nv-warn)")}>
              Couldn't load the model board — a connection problem, not “no lanes”. Nothing has changed on the server.
              <TextAction compact tone="gold" onClick={v.modelSettings.load} style={{ marginLeft: '10px' }}>Retry</TextAction>
            </div>
          )}
          {!v.modelSettings.error && !v.modelSettings.loaded && (
            <div style={css("margin-top:10px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Loading the model board…</div>
          )}

          {v.modelSettings.loaded && (
            <>
              <div style={css("margin-top:10px;max-width:640px;font-size:11.5px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>
                {v.modelSettings.laneCount} lanes talk to Claude. Each names its model explicitly — none of them inherit
                whatever your account happens to default to. Aliases (Opus 5, Sonnet 5…) follow the newest release in
                that family; the <em>pinned</em> entries stay on one exact version forever.
                {v.modelSettings.offCount > 0 && <span style={css("color:var(--nv-warn)")}> {v.modelSettings.offCount} switched off.</span>}
              </div>

              {v.modelSettings.groups.map((g) => (
                <div key={g.id} style={{ marginTop: '18px', maxWidth: '640px' }}>
                  <Interactive as="div" onClick={g.toggleOpen}
                    base="cursor:pointer;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:7px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)"
                    hoverStyle="border-bottom-color:var(--nv-acc-border)"
                  >
                    <Eyebrow as="span" tone="cyan">{g.open ? '▾' : '▸'} {g.label}</Eyebrow>
                    <Meta tone="faint">{g.hint}</Meta>
                    <Meta tone={g.offCount ? 'warn' : 'faint'} style={{ marginLeft: 'auto' }}>
                      {g.offCount ? `${g.offCount}/${g.count} off` : `${g.count}`}
                    </Meta>
                  </Interactive>

                  {g.open && g.lanes.map((l) => (
                    <div key={l.id} className="nv-pane" style={{ marginTop: '8px', padding: '13px 15px', opacity: l.busy ? 0.55 : 1 }}>
                      <div style={css("display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap")}>
                        <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: l.enabled ? 'var(--nv-ink)' : 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{l.label}</span>
                          <span style={{ display: 'block', marginTop: '3px', fontSize: '11px', lineHeight: 1.55, color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{l.hint}</span>
                        </span>
                        <Chip tone={l.enabled ? 'accent' : 'warn'} active={l.enabled} disabled={l.busy} onClick={l.busy ? undefined : l.toggle} style={{ flex: 'none' }}>{l.enabled ? 'On' : 'Off'}</Chip>
                      </div>

                      {l.enabled && l.deterministic ? (
                        // a computed lane: nothing to pick — the switch above is the whole setting
                        <Meta as="div" tone="faint" style={{ marginTop: '10px' }}>Deterministic — no model runs; the switch is the setting</Meta>
                      ) : l.enabled ? (
                        <div style={css("margin-top:10px;display:flex;align-items:center;gap:9px;flex-wrap:wrap")}>
                          <select value={l.model} onChange={l.setModel} disabled={l.busy}
                            style={{ flex: '1 1 220px', background: 'var(--nv-well)', border: `1px solid ${l.customised ? 'color-mix(in srgb, var(--nv-gold) 45%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 15%, transparent)'}`, borderRadius: '7px', color: 'var(--nv-ink)', font: 'var(--nv-micro-l)', padding: '8px 9px', outline: 'none' }}>
                            {v.modelSettings.models.map((m) => (
                              <option key={m.value} value={m.value} style={{ background: '#141019' }}>
                                {m.label}{m.value === l.defaultModel ? ' · default' : ''}
                              </option>
                            ))}
                          </select>
                          {l.reset && (
                            <TextAction compact tone="faint" disabled={l.busy} onClick={l.busy ? undefined : l.reset} style={{ flex: 'none' }}>Reset</TextAction>
                          )}
                        </div>
                      ) : (
                        // An off switch that doesn't say what it stopped is a
                        // trap — this is the honest half of the toggle.
                        <div style={css("margin-top:10px;font-size:11px;line-height:1.6;color:color-mix(in srgb, var(--nv-warn) 80%, var(--nv-ink))")}>
                          {l.offEffect}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {v.timeMachine && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <Eyebrow as="span" tone="gold">Time machine · Guardian</Eyebrow>
            <Meta tone="faint">Every vault write snapshots first — restore any file, undoably</Meta>
            {!v.timeMachine.loaded && (
              <Chip tone="gold" onClick={v.timeMachine.load}>Browse snapshots</Chip>
            )}
          </div>
          {v.timeMachine.loaded && v.timeMachine.files.length === 0 && (
            <div style={css("margin-top:10px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>No snapshots yet — they appear with the first vault write-back.</div>
          )}
          {v.timeMachine.files.length > 0 && (
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:10px;max-width:640px")}>
              {v.timeMachine.files.map((f) => (
                <div key={f.file} className="nv-pane" style={{ padding: '12px 15px' }}>
                  <div style={css("display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap")}>
                    <span style={css("font:600 13px var(--nv-font-ui);overflow-wrap:anywhere")}>{f.file}{!f.exists && <Tag tone="warn" style={{ marginLeft: '6px' }}>Deleted</Tag>}</span>
                  </div>
                  <div style={css("margin-top:6px;display:flex;flex-direction:column;gap:4px")}>
                    {f.backups.map((b) => (
                      <div key={b.backupRel} style={css("display:flex;justify-content:space-between;gap:10px;align-items:center")}>
                        <Meta tone="faint">{b.stamp}</Meta>
                        {v.timeMachine.confirming === b.backupRel ? (
                          <span style={css("display:flex;gap:8px;align-items:center")}>
                            <span style={css("font-size:11px;color:var(--nv-warn)")}>Overwrite the current file with this snapshot?</span>
                            <Chip tone="warn" active onClick={() => v.timeMachine.restore(b.backupRel)}>Restore</Chip>
                            <TextAction compact tone="faint" onClick={v.timeMachine.cancelConfirm}>Cancel</TextAction>
                          </span>
                        ) : (
                          <TextAction compact tone="quiet" onClick={() => v.timeMachine.askConfirm(b.backupRel)}>Restore…</TextAction>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={css("margin-top:20px;max-width:520px;font-size:11.5px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
        The token comes from <code>server/.env</code> on your Mac (auto-generated on first run).
        See <code>server/README.md</code> in the repo for running the backend, installing it as a
        launchd service, and setting up Tailscale so your phone can reach it from anywhere.
      </div>
    </div>
  );
}
