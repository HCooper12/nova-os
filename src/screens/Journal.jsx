import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, Chip, Tag, Meta, ScreenHead, Button, Chevron } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase()).replace(/\bnova\b/g, 'Nova');

export function Journal({ v }) {
  return (
    <div style={v.wrapJournal} data-screen-label="Journal">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <ScreenHead numeral="XI." label="Vault · Journal" />
        <Meta tone="faint">{v.journalHeaderLabel}</Meta>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:var(--nv-display-track)")}>Write it <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>down.</span></h1>

      <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-vi) 25%, transparent);border-radius:14px;padding:18px 20px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-vi) 06%, transparent),color-mix(in srgb, var(--nv-vi) 01%, transparent))")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px")}>
          <Eyebrow as="span" tone="violet">New entry</Eyebrow>
          <Chip tone="#cbb6f2" disabled={v.journalPromptBusy} onClick={v.journalPromptBusy ? undefined : v.generateJournalPrompt}>
            {v.journalPromptBusy ? 'Thinking…' : '✦ Generate a prompt'}
          </Chip>
        </div>
        {v.journalPromptText && (
          <div style={css("margin-top:12px;font:italic 400 15px/1.5 var(--nv-font-serif);color:#cbb6f2")}>{v.journalPromptText}</div>
        )}
        <textarea
          value={v.journalComposerText}
          onChange={v.setJournalComposerText}
          placeholder="What's on your mind today…"
          style={css("margin-top:14px;width:100%;box-sizing:border-box;height:120px;resize:vertical;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:12px 14px;color:var(--nv-ink);font-size:13.5px;font-family:var(--nv-font-ui);line-height:1.6;outline:none")}
        />
        {v.journalSaveError && (
          <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.journalSaveError}</div>
        )}
        <div style={css("margin-top:10px;display:flex;justify-content:flex-end")}>
          <Button
            onClick={v.submitJournalEntry}
            disabled={v.journalSaveBusy}
            style={{ textTransform: 'none' }}
          >
            {v.journalSaveBusy ? 'Saving…' : 'Save entry'}
          </Button>
        </div>
      </div>

      {v.journalDays.length === 0 ? (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
          {v.journalLoaded ? 'No journal entries yet — write your first one above.' : 'Loading your journal…'}
        </div>
      ) : (
        <div style={css("margin-top:26px;display:flex;flex-direction:column;gap:10px")}>
          {/* category filter — personal reflections never lost among training logs */}
          <div style={css("display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px")}>
            {v.journalFilters.map((f) => (
              <Chip key={f.key} tone={f.active ? 'accent' : 'quiet'} active={f.active} onClick={f.go}>{cap(f.label)}</Chip>
            ))}
          </div>
          {v.journalDays.length === 0 && v.journalFilterActive && (
            <div style={css("margin-top:16px;text-align:center;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Nothing in this category yet.</div>
          )}
          {v.journalDays.map((d) => (
            <div key={d.date} className={v.structured ? 'nv-pane' : undefined} style={v.structured ? { padding: '14px 18px' } : css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:14px 18px;background:rgba(255,255,255,.02)")}>
              {/* A DAY, WITH ITS WEIGHT. The row led with an ISO date in mono
                  and a bare `N entries ▼`, so today looked like any other and
                  the whole screen read as a date table (review finding 14).
                  Now: the day in the serif face, today larger and accented,
                  the count drawn as one dot per entry so a month's rhythm is
                  visible down the list, and a 44pt row to tap. */}
              <Interactive as="div" onClick={d.toggle} aria-expanded={d.open}
                base="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:44px"
                hoverStyle={{}}>
                <span style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                  <span style={{ font: `400 ${d.isToday ? 19 : 16}px var(--nv-font-serif)`, lineHeight: 1.1,
                    color: d.isToday ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{d.dayLabel}</span>
                  {d.isToday && <Meta tone="accent" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>Today</Meta>}
                </span>
                <Meta tone="faint" style={{ textAlign: 'right', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0 }}>{d.open ? '' : d.preview}</Meta>
                <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span aria-label={`${d.count} ${d.count === 1 ? 'entry' : 'entries'}`} title={`${d.count} ${d.count === 1 ? 'entry' : 'entries'}`}
                    style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    {Array.from({ length: Math.min(d.count, 6) }).map((_, i) => (
                      <i key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', display: 'block',
                        background: d.isToday ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 38%, transparent)' }} />
                    ))}
                    {d.count > 6 && <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>+{d.count - 6}</Meta>}
                  </span>
                  <Chevron open={d.open} />
                </span>
              </Interactive>
              {d.open && (
                <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent);padding-top:12px")}>
                  {d.sections.map((s, i) => (
                    <div key={i}>
                      <Meta as="div" tone="faint" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', textTransform: 'none', letterSpacing: 0 }}>
                        <span>{s.time}</span>
                        {s.categoryMeta && <Tag hue={s.categoryMeta.hue}>{s.categoryMeta.label}</Tag>}
                        {s.heading && <span>— {s.heading}</span>}
                      </Meta>
                      <div style={css("margin-top:4px;font-size:13px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{s.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
