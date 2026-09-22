import { useState } from 'react';
import { subjectOf } from '../inboxDigest.js';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { useDictation } from '../useDictation.js';
import { SkeletonList } from '../Skeleton.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { SwipeRow } from '../SwipeRow.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, Segmented, isAppleStyle, ScreenHead, Button, Select } from '../Controls.jsx';

// The Nova Inbox: one place to drop any loose thought — typed or dictated —
// and let Nova route it (shopping / journal / to-do / note / food log).
// The classifier only ever proposes; deterministic code files; history and
// undo keep every filing reversible. The filing-mode ladder and the
// "proposed rule" banner implement graduated autonomy: Nova earns trust from
// the history and proposes its own promotion — you ratify.

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";
const S = "var(--nv-font-serif)";

// Sentence case for a word the view model hands up in caps ("RESEARCHER",
// "MORNING") — the Apple styles read it as a word, Command re-uppercases.
const cap = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

// A secondary button: under the Apple styles a tinted fill (iOS spends no
// outline on a button); under Command the hairline it always had.
const secondary = (color, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', font: `600 14px ${R}`, padding: '9px 16px', borderRadius: '999px', background: `color-mix(in srgb, ${color} 12%, transparent)`, color, border: '1px solid transparent', ...extra }
  : { cursor: 'pointer', font: `600 12.5px ${R}`, padding: '7px 16px', borderRadius: '8px', border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, color, ...extra });

function RouteBadge({ route, confidence }) {
  if (!route) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
      <Tag hue={route.hue}>{route.label}</Tag>
      {confidence === 'low' && <Tag tone="warn">Low confidence</Tag>}
    </span>
  );
}

const STATUS_META = {
  classifying: { label: 'Routing…', color: 'var(--nv-ink60)' },
  filed: { label: 'Filed', color: 'var(--nv-good)' },
  discarded: { label: 'Discarded', color: 'var(--nv-ink40)' },
  undone: { label: 'Undone', color: 'var(--nv-gold)' },
  error: { label: 'Error', color: 'var(--nv-warn)' },
};

export function Inbox({ v }) {
  const dict = useDictation(
    () => v.inboxInput,
    (text) => v.setInboxInput(text),
    null,
  );
  const [dictated, setDictated] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);
  // A1, his pick from the 4 Sep audit (5 Sep): one card at a time. Nine
  // items used to be nine full reads and eighteen buttons; the deck makes
  // them nine thumb-flicks on the swipe engine that already existed. LIST is
  // one tap away for when he wants the overview, and the choice sticks.
  const [deck, setDeck] = useState(() => { try { return localStorage.getItem('novaos.inboxDeck') !== 'list'; } catch { return true; } });
  const setDeckMode = (on) => { setDeck(on); try { localStorage.setItem('novaos.inboxDeck', on ? 'deck' : 'list'); } catch { /* best-effort */ } };
  // A3: SEE ALL on a pattern shows just that subject's items, as a list —
  // the pattern gets one read and one set of answers instead of surfacing
  // one card at a time between unrelated ones. Session-only; a focus that
  // outlived the items would be a filter on nothing.
  const [focus, setFocus] = useState(null);
  const focused = focus ? v.inboxPending.filter((i) => subjectOf(i) === focus) : null;
  const shown = focused && focused.length ? focused : (deck ? v.inboxPending.slice(0, 1) : v.inboxPending);
  const showingFocus = !!(focused && focused.length);
  // History is unbounded and he has 246 records — rendering every one cost
  // ~211ms on EVERY inbox change (3,239 DOM nodes reconciled to tick one
  // box). The recent slice is what anyone actually reads; the rest are one
  // tap away and the count is stated, so nothing is hidden.
  const [historyLimit, setHistoryLimit] = useState(25);
  const shownHistory = v.inboxHistory.slice(0, historyLimit);
  const hiddenHistoryCount = v.inboxHistory.length - shownHistory.length;
  const micToggle = () => { if (!dict.on) setDictated(true); dict.toggle(); };
  // `text` arrives from LocalInput on Cmd+Enter (the live value, which may
  // not have reached App state yet); the toolbar buttons call submit() with
  // nothing and fall back to state, which is correct for them — a button
  // click blurs the field first, flushing it.
  const submit = (text) => {
    v.submitInboxCapture(dictated ? 'voice' : 'text', typeof text === 'string' ? text : undefined);
    setDictated(false);
  };

  return (
    <div style={v.wrapInbox} data-screen-label="Inbox">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <ScreenHead numeral="V." label="Self · Inbox" />
        <Meta tone="faint">{v.inboxHeaderLabel}</Meta>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:var(--nv-display-track)")}>Drop the thought, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>Nova files it.</span></h1>

      {/* capture composer */}
      <div className="nv-pane" style={{ marginTop: '20px', padding: '18px 20px' }}>
        <div style={css("display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px")}>
          <Eyebrow as="span" tone="cyan">Capture</Eyebrow>
          <Meta tone="faint">Routes · shopping / journal / to-do / note / food log</Meta>
        </div>
        {/* LOCAL ECHO: the text lives in this component while typing, so a
            keystroke no longer re-renders ~300 inbox rows (measured 37ms
            median / 98ms p90 / 311ms worst before this). onChange still
            pushes to App state on a 150ms debounce so the toolbar buttons
            and the draft mirror keep working; Cmd+Enter hands the live
            value straight to submit, so nothing can be lost to that race. */}
        <LocalInput
          multiline
          value={v.inboxInput}
          onChange={(text) => v.setInboxInput(text)}
          submitWhen={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey)}
          onSubmit={submit}
          placeholder={v.inboxConnected ? 'Anything — "buy tomatoes", "idea: cold open with the drone shot", "ate a protein bar"…' : 'Connect a backend in Settings to start capturing'}
          disabled={!v.inboxConnected}
          style={css(`margin-top:12px;width:100%;box-sizing:border-box;height:84px;resize:vertical;background:var(--nv-well);border:1px solid ${dict.on ? 'var(--nv-acc-border)' : 'color-mix(in srgb, var(--nv-ink) 12%, transparent)'};border-radius:9px;padding:12px 14px;color:var(--nv-ink);font:500 14px var(--nv-font-ui);line-height:1.5;outline:none`)}
        />
        <div style={css("margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap")}>
          {dict.supported && (
            <Chip tone="cyan" active={dict.on} disabled={!v.inboxConnected} onClick={v.inboxConnected ? micToggle : undefined}>
              {dict.on ? '◉ Listening — tap to stop' : '● Dictate'}
            </Chip>
          )}
          {/* RESEARCH / WATCH / WATCH + ANALYSE used to live here — three ways to
              start work that the conversation now starts by itself (Phase 4,
              5 Sep). They also forced the lane decision before he had finished
              describing the task. Capture stays: it is the two-second "buy
              tomatoes" path and routing it through a chat would make the
              fastest thing in Nova slower. */}
          <Meta tone="faint" style={{ marginLeft: 'auto' }}>links · research · videos → just say it in the chat</Meta>
          <Button onClick={submit} disabled={!v.inboxConnected || v.inboxCaptureBusy}
          >{v.inboxCaptureBusy ? 'Routing…' : '✦ Capture'}</Button>
        </div>

        {/* IT LANDED. His report, 15 Sep: "I'm still not seeing it clearly on
            Nova whether my captures are landing… I need some sort of
            confirmation within nova itself so I can see it's been filed and
            analysed." The record existed — as a toast gone in seconds, and as
            a History panel at the very bottom of this screen, below eleven
            others. Neither survives a capture made from the Shortcut while he
            is not looking. Same record, directly under the box he captured
            into: capture, and watch it land. */}
        {v.inboxLanded?.recent?.length > 0 && (
          <div style={css('margin-top:14px;padding-top:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)')}>
            <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap')}>
              <Eyebrow as="span" tone="good">Landed</Eyebrow>
              <Meta tone="faint">
                {v.inboxLanded.today > 0
                  ? `${v.inboxLanded.today} today · ${v.inboxLanded.filedToday} filed`
                  : 'nothing yet today — the most recent below'}
              </Meta>
            </div>
            <div style={css('margin-top:8px;display:flex;flex-direction:column;gap:7px')}>
              {v.inboxLanded.recent.map((h) => (
                <Interactive key={h.id} as="div" onClick={h.open} ariaLabel={`Open ${h.title}`}
                  /* 25px rows, and every one of them is a tap into a filed
                     capture (measured 23 Sep). The padding buys the floor
                     without moving the list: the negative margin gives it
                     straight back. */
                  base={css('cursor:pointer;display:flex;align-items:center;gap:9px;min-width:0;min-height:30px;border-radius:8px;padding:5px;margin:0 -5px')}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 06%, transparent)' }}>
                  <span style={css(`flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${h.status === 'filed' ? 'var(--nv-good)' : h.status === 'error' ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-ink) 38%, transparent)'}`)}>
                    {h.status === 'filed' ? '✓' : h.status === 'error' ? '!' : '—'}
                  </span>
                  <span style={css('flex:1;min-width:0;font-size:12.5px;line-height:1.5;color:var(--nv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{h.title}</span>
                  {/* "filed AND analysed" is the half he asked for by name, so
                      it gets its own slot — appended to the destination it was
                      the first thing the ellipsis ate */}
                  {h.analysed && h.status === 'filed' && (
                    <span style={css('flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:var(--nv-cy)')}>analysed</span>
                  )}
                  <span style={css('flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 42%, transparent);max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>
                    {h.status === 'filed' ? (h.destination || 'filed') : h.status === 'error' ? 'failed' : 'left alone'}
                  </span>
                </Interactive>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FILING MODE. Three cards, ~230px of the first screen, for a setting
          he changes a handful of times a year — while the nine items the tab
          badge points at started below the fold. It stays a real control (it
          always was one, not an explainer), but collapsed to the one line
          that answers "what is Nova allowed to do right now". */}
      <div style={{ marginTop: '14px' }}>
        <Interactive as="div" onClick={() => setModesOpen(!modesOpen)}
          base={css(`cursor:pointer;display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:12px;background:var(--nv-glass)`)}
          hoverStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 10%, transparent)' }}>
          <Eyebrow as="span">Filing</Eyebrow>
          <span style={{ font: `600 14px ${R}`, color: 'var(--nv-acc)' }}>
            {(v.inboxModes.find((m) => m.active) || {}).label || '—'}
          </span>
          <Meta tone="faint" style={{ marginLeft: 'auto' }}>{modesOpen ? 'Close' : 'Change ›'}</Meta>
        </Interactive>
        {modesOpen && (
          <div style={css("margin-top:8px;display:flex;gap:8px;flex-wrap:wrap")}>
            {v.inboxModes.map((m) => (
              <Interactive key={m.value} onClick={() => { m.pick(); setModesOpen(false); }}
                base={{
                  cursor: 'pointer', flex: '1 1 200px', padding: '10px 14px', borderRadius: '9px',
                  border: m.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
                  background: m.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
                  boxShadow: m.active ? 'var(--nv-glow-tab)' : 'none',
                }}
                hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
              >
                <Eyebrow tone={m.active ? 'accent' : 'faint'}>Step {m.step}</Eyebrow>
                <span style={{ display: 'block', marginTop: '3px', font: `600 13.5px ${R}`, color: m.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{m.label}</span>
                <span style={{ display: 'block', marginTop: '2px', font: `500 11px ${R}`, color: 'var(--nv-ink60)' }}>{m.hint}</span>
              </Interactive>
            ))}
          </div>
        )}
      </div>

      {/* Skeleton ONLY while the inbox has genuinely never loaded — never
          over real data, and never offline (that path shows last-known
          history under its own banner). `inboxLoaded` already carries the
          null-vs-empty distinction, so an empty inbox keeps its honest
          "nothing captured yet" copy rather than shimmering forever. */}
      {!v.inboxLoaded && v.inboxConnected && !v.isOffline && (
        <div style={{ marginTop: '18px' }}>
          <Eyebrow>Loading…</Eyebrow>
          <div style={{ marginTop: '10px' }}><SkeletonList rows={3} lines={2} /></div>
        </div>
      )}

      {/* pending approvals — THE daily action, straight under the composer.
          They used to sit below two screens of loop config; the thing the
          badge points at must be the first thing the screen shows. */}
      {v.inboxPending.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <div style={css("display:flex;align-items:center;gap:10px")}>
            <Eyebrow tone="gold">Waiting for your call · {v.inboxPending.length}</Eyebrow>
            <span style={css("margin-left:auto;display:flex")}>
              <Segmented ariaLabel="How the queue is shown" options={[['deck', 'Deck'], ['list', 'List']]} value={deck ? 'deck' : 'list'} onChange={(mode) => setDeckMode(mode === 'deck')} />
            </span>
          </div>
          {/* A3 — THE TRIAGE STRIP. Before the first card, what the pile IS:
              how many are routine (one tap files them all), which subjects
              repeat (one look answers the pattern), how many need a real
              decision. Deterministic — see src/inboxDigest.js. */}
          {v.inboxDigest && !showingFocus && (
            <div style={css("margin-top:10px;padding:12px 14px;border-radius:14px;background:var(--nv-glass)")}>
              <div style={css(`font:500 13.5px/1.45 var(--nv-font-ui);color:var(--nv-ink80)`)}>{v.inboxDigest.summary}</div>
              <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:10px")}>
                {v.inboxDigest.routine.length > 0 && (
                  <Chip tone="accent" disabled={v.inboxDigest.routineBusy} onClick={v.inboxDigest.routineBusy ? undefined : v.inboxDigest.fileRoutine}>
                    {v.inboxDigest.routineBusy ? 'Filing…' : `File ${v.inboxDigest.routine.length} routine`}
                  </Chip>
                )}
                {v.inboxDigest.patterns.map((p) => (
                  <Chip key={p.subject} tone="gold" onClick={() => { setFocus(p.subject); }}>
                    {p.members.length} × {cap(p.subject)} · See all
                  </Chip>
                ))}
                {v.inboxDigest.decide.length > 0 && (
                  <Chip tone="faint">{v.inboxDigest.decide.length} to decide</Chip>
                )}
              </div>
            </div>
          )}
          {showingFocus && (
            <div style={css("display:flex;align-items:center;gap:8px;margin-top:10px")}>
              <Eyebrow as="span" tone="gold">Showing {focus} · {focused.length}</Eyebrow>
              <TextAction tone="quiet" onClick={() => setFocus(null)} style={{ marginLeft: 'auto' }}>Back to the deck</TextAction>
            </div>
          )}
          {/* THE DECK: only the top card is live. The two behind it are drawn
              as edges so the depth of the queue is visible without being
              readable — what is left, not what it says. Filing or discarding
              removes the record, the next one rises, no state to manage. */}
          <div style={css(`margin-top:10px;position:relative;${deck && !showingFocus ? 'padding-top:12px' : ''}`)}>
            {deck && !showingFocus && v.inboxPending.length > 1 && (
              <div aria-hidden="true" style={css("position:absolute;left:6px;right:6px;top:6px;height:40px;border-radius:12px;background:var(--nv-glass);border:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);opacity:.55")} />
            )}
            {deck && !showingFocus && v.inboxPending.length > 2 && (
              <div aria-hidden="true" style={css("position:absolute;left:12px;right:12px;top:0;height:40px;border-radius:12px;background:var(--nv-glass);border:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent);opacity:.3")} />
            )}
          <div style={css("position:relative;display:flex;flex-direction:column;gap:10px")}>
            {shown.map((item) => (
              /* SWIPE: right approves, left discards — additive, the buttons
                 below are untouched. A model-choice card has no single
                 "approve" (it needs a model picked), so it gets no swipe;
                 discard-with-a-reason cards route through their ask-why
                 panel exactly as the button does. Safety: a gesture that
                 locks vertical can never commit (swipeCore.js + its test). */
              /* the deck: a card that has just risen to the top settles in
                 (keyed by record, so only a NEW top card animates) */
              <div key={item.id} className={deck && !showingFocus ? 'nv-deck-rise' : undefined}>
              <SwipeRow
                right={item.isModelChoice ? null : { label: 'FILE', icon: '✓', tone: 'var(--nv-good)', run: () => { if (!item.busy) item.approve(); } }}
                left={{ label: 'DISCARD', icon: '✕', tone: 'var(--nv-warn)', run: () => { if (!item.busy) item.discard(); } }}
              >
              <div className="nv-pane" style={{ padding: '14px 18px' }}>
                <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px")}>
                  <RouteBadge route={item.route} confidence={item.confidence} />
                  <Meta tone="faint" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.seen && <Tag tone="faint" dashed>Seen</Tag>}
                    <span>{item.time} · {cap(item.source)}</span>
                  </Meta>
                </div>
                {/* WHAT APPROVING DOES, FIRST. His report, 21 Sep: "I don't
                    actually know what will change or occur after I have
                    clicked approved on something in my inbox." It is the one
                    line on the card written for him rather than for the
                    machine, so it leads, in full ink, above the body. */}
                {/* THE TL;DR, FIRST OF ALL. Code's reading of what the card
                    is telling him: the verdict in one line and the actionable
                    steps when the body carries them. His ask, 21 Sep — so he
                    never files a thing assuming it was for Nova, not him. */}
                {item.tldr && (
                  <div style={css('margin-top:10px;min-width:0;border-left:2px solid color-mix(in srgb, var(--nv-gold) 55%, transparent);padding:2px 0 2px 11px')}>
                    <Eyebrow as="div" tone="gold">TL;DR</Eyebrow>
                    {item.tldr.line && <div style={css(`margin-top:4px;min-width:0;font:400 15px/1.45 var(--nv-font-serif);color:var(--nv-ink);text-wrap:pretty`)}>{item.tldr.line}</div>}
                    {item.tldr.items.length > 0 && (
                      <ol style={css(`margin:6px 0 0;padding-left:18px;font:500 13px/1.5 ${R};color:var(--nv-ink)`)}>
                        {item.tldr.items.map((t, i) => <li key={i} style={{ minWidth: 0 }}>{t}</li>)}
                        {item.tldr.more > 0 && <li style={{ listStyle: 'none', marginLeft: '-18px' }}><Meta tone="faint">and {item.tldr.more} more in the report</Meta></li>}
                      </ol>
                    )}
                  </div>
                )}
                {item.approveLine && (
                  <div style={css(`margin-top:9px;min-width:0;font:500 13.5px/1.5 ${R};color:var(--nv-ink)`)}>{item.approveLine}</div>
                )}
                {/* A continue card's whole question is the money. */}
                {item.isContinue && item.spentUsd != null && (
                  <div style={css('margin-top:7px;display:flex;gap:14px;flex-wrap:wrap')}>
                    <Meta tone="quiet">Spent so far US${item.spentUsd.toFixed(2)}</Meta>
                    {item.nextBudgetUsd != null && <Meta tone="gold">Up to US${item.nextBudgetUsd.toFixed(2)} more</Meta>}
                  </div>
                )}
                <div onClick={item.canExpand ? item.toggleExpand : undefined} style={{ cursor: item.canExpand ? 'pointer' : 'default' }}
                  title={item.canExpand ? (item.expanded ? 'Collapse' : 'Tap to see exactly what approving will file') : undefined}>
                  {/* Two lines, then a real ellipsis. A decision title can be
                      any length and an unclamped one pushed the actions off
                      the card; a character-clamped one cut mid-word. */}
                  <div style={css(`margin-top:9px;font:600 15px ${R};display:-webkit-box;-webkit-line-clamp:${item.expanded ? 'unset' : '2'};-webkit-box-orient:vertical;overflow:hidden`)}>
                    {item.title}
                  </div>
                  {/* The bare ▸ said nothing about what tapping would do, and
                      a report is not "what gets filed" — it says which long
                      thing is behind it. stopPropagation because the whole
                      title block toggles too, and two toggles is no toggle. */}
                  {item.canExpand && (
                    <TextAction compact tone="cyan" onClick={(e) => { e?.stopPropagation?.(); item.toggleExpand(); }} style={{ marginTop: '5px' }}>
                      {item.expanded ? '▾ Show less' : `▸ ${item.expandLabel}`}
                    </TextAction>
                  )}
                  {/* a plan or a report is pages long — the 220-character
                      dribble of it under the title told him nothing and
                      buried the two lines that did */}
                  {!item.expanded && !item.longForm && item.previewShort && <div style={css(`margin-top:3px;font:500 13px/1.5 ${R};color:var(--nv-ink60);white-space:pre-wrap`)}>{item.previewShort}</div>}
                  {item.expanded && (
                    <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:8px")}>
                      {item.captured && (
                        <div>
                          <Eyebrow>You captured</Eyebrow>
                          <div style={css(`margin-top:3px;font:500 13px/1.55 ${R};color:var(--nv-ink60);white-space:pre-wrap`)}>{item.captured}</div>
                        </div>
                      )}
                      {item.full && (
                        <div>
                          <Eyebrow tone="gold">Will be filed</Eyebrow>
                          <div style={css(`margin-top:3px;font:500 13px/1.55 ${R};white-space:pre-wrap;overflow-wrap:break-word`)}>{item.full}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* The reason is the densest text in the product — 40-60 words
                    on every card, nine cards deep. Italic serif is Nova's
                    speaking voice and earns one or two lines; at this length
                    it was the slowest possible setting for the text he has to
                    read most. Same colour and weight, UI face, wider leading. */}
                {item.reason && <div style={css(`margin-top:7px;font:400 13px/1.55 ${R};color:color-mix(in srgb, var(--nv-ink) 62%, transparent)`)}>{item.reason}</div>}
                {item.adjustments && (
                  <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
                    {item.adjustments.map((a, i) => (
                      <div key={i} style={css(`display:flex;gap:10px;align-items:baseline;padding:7px 0${i < item.adjustments.length - 1 ? ';border-bottom:1px solid rgba(130,175,255,.09)' : ''}`)}>
                        <span style={{ font: `600 12px ${M}`, color: 'var(--nv-gold)', flex: 'none' }}>{i + 1}</span>
                        <span style={{ minWidth: 0, flex: '1 1 auto', opacity: a.outcome ? 0.55 : 1 }}>
                          <span style={{ display: 'block', font: `500 13.5px/1.45 ${R}`, textDecoration: a.outcome === 'done' ? 'line-through' : 'none' }}>{a.text}</span>
                          {a.why && <span style={{ display: 'block', font: `500 12px/1.5 ${R}`, color: 'var(--nv-ink60)' }}>{a.why}</span>}
                        </span>
                        <span style={{ flex: 'none', display: 'flex', gap: '6px' }}>
                          <TextAction compact tone={a.outcome === 'done' ? 'good' : 'quiet'} onClick={() => a.mark('done')}>Done</TextAction>
                          <TextAction compact tone={a.outcome === 'skipped' ? 'warn' : 'quiet'} onClick={() => a.mark('skipped')}>Not today</TextAction>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {item.error && <div style={css(`margin-top:6px;font:500 12px ${R};color:var(--nv-warn)`)}>{item.error}</div>}
                <div style={css("margin-top:12px;display:flex;gap:10px;flex-wrap:wrap")}>
                  {/* THE MODEL CHOICE GATE — this card files nothing itself,
                      so it gets a model tap instead of approve/file. Discard
                      (below, unchanged) still skips the week normally. */}
                  {item.isModelChoice ? (
                    <>
                      <Button onClick={item.pickOpus} disabled={item.busy}
                      >{item.busy ? 'Working…' : 'Opus — deeper'}</Button>
                      <Button onClick={item.pickSonnet} disabled={item.busy} variant="quiet" tone="ink"
                      >Sonnet — default</Button>
                    </>
                  ) : (
                    <Button onClick={item.approve} disabled={item.busy}
                    >{item.busy ? 'Working…' : item.approveLabel}</Button>
                  )}
                  <Interactive as="span" onClick={item.busy ? undefined : item.discard}
                    base={secondary('var(--nv-ink60)', { opacity: item.busy ? 0.5 : 1 })}
                    hoverStyle={{ filter: 'brightness(1.1)' }}
                  >{item.isModelChoice ? 'Skip this week' : item.discardLabel}</Interactive>
                  {/* THE THIRD VERB — looked at, not decided. The record stays
                      pending; it only stops counting as new. One tap back. */}
                  {item.markSeen && (
                    <TextAction compact tone={item.seen ? 'good' : 'quiet'} onClick={item.busy ? undefined : item.markSeen}
                      ariaLabel={item.seen ? 'Mark as not seen' : 'Mark as seen, decide later'} title="Seen, deciding later — it stays here">
                      {item.seen ? '✓ Seen' : 'Seen'}
                    </TextAction>
                  )}
                  {item.askingWhy && (
                    <div style={css("flex-basis:100%;margin-top:10px;padding:12px 14px;border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);border-radius:10px;background:color-mix(in srgb, var(--nv-gold) 04%, transparent)")}>
                      <Eyebrow tone="gold" style={{ marginBottom: '9px' }}>{item.whyTitle}</Eyebrow>
                      <div style={css("display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px")}>
                        {item.whyChips.map((c) => (
                          <Interactive key={c} as="span" onClick={() => item.submitWhy(c)}
                            base={{ cursor: 'pointer', font: `500 11.5px ${R}`, padding: '6px 12px', borderRadius: '999px', border: '1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent)', color: 'var(--nv-ink)' }}
                            hoverStyle={{ borderColor: 'var(--nv-gold)', color: 'var(--nv-gold)' }}
                          >{c}</Interactive>
                        ))}
                      </div>
                      <div style={css("display:flex;gap:8px;align-items:center")}>
                        <input value={item.whyText} onChange={item.onWhyText} placeholder="Or say it in your own words…"
                          onKeyDown={(e) => { if (e.key === 'Enter') item.submitWhy(); }}
                          style={css(`flex:1;min-width:0;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:8px;padding:8px 11px;font:400 12.5px ${R};color:var(--nv-ink)`)} />
                        <Button compact onClick={() => item.submitWhy()}
                        >{(item.whyText || '').trim() ? 'Discard with reason' : 'Discard anyway'}</Button>
                        <Interactive as="span" onClick={item.cancelWhy}
                          base={{ cursor: 'pointer', font: `500 12px ${R}`, padding: '8px 10px', color: 'var(--nv-ink60)' }}
                          hoverStyle={{ color: 'var(--nv-ink)' }}
                        >Keep it</Interactive>
                      </div>
                    </div>
                  )}
                  {item.openBriefing && (
                    <Interactive as="span" onClick={item.openBriefing}
                      title="Read it, or have Nova read it to you with the visuals"
                      base={secondary('var(--nv-cy)')}
                      hoverStyle={{ filter: 'brightness(1.1)' }}
                    >{item.status === 'classifying' ? 'Watch it being made' : '▶ Open the briefing'}</Interactive>
                  )}
                  {item.deepAnalyse && (
                    <Interactive as="span" onClick={item.busy ? undefined : item.deepAnalyse}
                      title="Run the full vault weave on this video — every concept, person, and idea into your second brain, shown as a diff to approve"
                      base={secondary('var(--nv-cy)', { opacity: item.busy ? 0.5 : 1 })}
                      hoverStyle={{ filter: 'brightness(1.1)' }}
                    >Deep weave</Interactive>
                  )}
                  {item.researchBooks && (
                    <Interactive as="span" onClick={item.researchBooks}
                      title="Dispatch the Researcher: the best-regarded books on this concept, cited — the brief lands in your Inbox"
                      base={secondary('var(--nv-gold)')}
                      hoverStyle={{ filter: 'brightness(1.1)' }}
                    >Research the books</Interactive>
                  )}
                </div>
              </div>
              </SwipeRow>
              </div>
            ))}
          </div>
          {deck && !showingFocus && (
            <Meta as="div" tone="faint" style={{ marginTop: '10px', textAlign: 'center' }}>
              {/* a model-choice card has no right swipe — it needs a model picked —
                  so the footer must not promise one. Nor does a paused one
                  FILE anything: swiping it right spends money and resumes
                  work, and the footer has to say that out loud. */}
              1 of {v.inboxPending.length} · {v.inboxPending[0]?.isModelChoice ? 'pick a model above'
                : v.inboxPending[0]?.isContinue ? 'swipe right to continue it' : 'swipe right to file'} · left to {v.inboxPending[0]?.isContinue ? 'stop here' : 'discard'}{v.inboxPending.length > 1 ? ' · the next rises' : ''}
            </Meta>
          )}
          </div>
        </div>
      )}

      {/* proposed rules — Nova asks to change its own operating rules; you ratify */}
      {v.inboxProposals.map((p) => (
        <div key={p.key} className="nv-pane nv-focus" style={{ marginTop: '16px', padding: '16px 20px' }}>
          <Eyebrow tone="gold">Proposed rule</Eyebrow>
          <div style={css(`margin-top:8px;font:400 17px/1.4 ${S};text-wrap:pretty`)}>{p.text}</div>
          <div style={css("margin-top:12px;display:flex;gap:10px")}>
            <Interactive as="span" onClick={p.accept} base={css(`cursor:pointer;font:600 13px ${R};padding:7px 16px;border-radius:8px;background:var(--nv-gold);color:#1a1206`)} hoverStyle={{ filter: 'brightness(1.1)' }}>{p.acceptLabel || 'Accept'}</Interactive>
            {p.altLabel && (
              <Interactive as="span" onClick={p.alt} base={css(`cursor:pointer;font:600 13px ${R};padding:7px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)`)} hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' }}>{p.altLabel}</Interactive>
            )}
            <Interactive as="span" onClick={p.skip} base={css(`cursor:pointer;font:600 13px ${R};padding:7px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent);color:var(--nv-ink60)`)} hoverStyle={{ background: 'rgba(255,255,255,.05)' }}>Skip</Interactive>
          </div>
        </div>
      ))}

      {/* the loops — dispatch and compost run on schedules; controls live here */}
      {v.inboxConnected && (
        <div style={{ marginTop: '24px' }}>
          <Eyebrow>Loops</Eyebrow>

          {/* the flagship: the Daily Review reasons across everything, once a day */}
          <div className="nv-pane" style={{ marginTop: '10px', padding: '16px 18px', border: '1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent)', background: 'color-mix(in srgb, var(--nv-cy) 04%, transparent)' }}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap")}>
              <Eyebrow as="span" tone="cyan">◆ Daily review</Eyebrow>
              <Meta tone="faint">Nova reasons across your whole day · one coached read + adjustments</Meta>
            </div>
            <div style={css("margin-top:11px;display:flex;gap:6px;flex-wrap:wrap;align-items:center")}>
              {v.dailyReview.modes.map((m) => (
                <Chip key={m.value} tone={m.active ? 'accent' : 'quiet'} active={m.active} onClick={m.pick}>{m.label}</Chip>
              ))}
              <Select value={v.dailyReview.hour} onChange={v.dailyReview.setHour} ariaLabel="Daily review time"
                style={{ flex: 'none', marginLeft: 'auto' }}
                options={v.dailyReview.hourOptions.map((h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))} />
            </div>
            <div style={css("margin-top:9px;display:flex;justify-content:space-between;align-items:center;gap:8px")}>
              <span style={css(`font:500 11.5px ${R};color:var(--nv-ink60)`)}>{v.dailyReview.status}</span>
              <TextAction tone="cyan" disabled={v.dailyReview.busy} onClick={v.dailyReview.run} style={{ flex: 'none' }}>{v.dailyReview.busy ? 'Reasoning…' : 'Run now'}</TextAction>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>

            <div className="nv-pane" style={{ flex: '1 1 320px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="cyan">Briefs</Eyebrow>
                <Meta tone="faint">Real data only</Meta>
              </div>
              {v.dispatchSlots.map((s, i) => (
                <div key={s.slot} style={i > 0 ? { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' } : { marginTop: '10px' }}>
                  {/* THE NAME AND ITS TIME ON ONE LINE, the modes on the
                      next. At 375px a label, three mode pills and a time
                      cannot share a row, and `margin-left:auto` in a wrapping
                      flex orphans the time onto a line of its own — which is
                      what broke the rhythm of this panel (review finding 19).
                      Two deliberate lines beat one that wraps by accident. */}
                  <div style={css('display:flex;gap:8px;align-items:center;justify-content:space-between')}>
                    <Meta tone="quiet" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap(s.label)}</Meta>
                    <Select value={s.hour} onChange={s.setHour} ariaLabel={`${s.label} time`}
                      style={{ flex: 'none' }}
                      options={s.hourOptions.map((h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))} />
                  </div>
                  <div style={css('margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;align-items:center')}>
                    {s.modes.map((m) => (
                      <Chip key={m.value} tone={m.active ? 'accent' : 'quiet'} active={m.active} onClick={m.pick}>{m.label}</Chip>
                    ))}
                  </div>
                  <div style={css(`margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px`)}>
                    <span style={css(`font:500 11.5px ${R};color:var(--nv-ink60)`)}>{s.status}</span>
                    <TextAction tone="cyan" disabled={v.dispatchBusy} onClick={s.run} style={{ flex: 'none' }}>{v.dispatchBusy ? 'Composing…' : 'Run now'}</TextAction>
                  </div>
                </div>
              ))}
            </div>

            <div className="nv-pane" style={{ flex: '1 1 320px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="good">Compost loop</Eyebrow>
                <Meta tone="faint">Weekly · read-only scan</Meta>
              </div>
              <div style={css(`margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px`)}>
                <span style={css(`font:500 11.5px ${R};color:var(--nv-ink60)`)}>last pass {v.compostLastRun} · {v.compostProposals.length} open proposal{v.compostProposals.length === 1 ? '' : 's'}</span>
                <TextAction tone="good" disabled={v.compostBusy} onClick={v.runCompostNow} style={{ flex: 'none' }}>{v.compostBusy ? 'Scanning…' : 'Run now'}</TextAction>
              </div>
              {v.compostProposals.length > 0 && (
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
                  {v.compostProposals.map((p) => (
                    <div key={p.id} style={css("padding:10px 12px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);background:var(--nv-well)")}>
                      <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                        <Tag hue={p.badge.hue}>{p.badge.label}</Tag>
                        <span style={css(`font:600 13px ${R}`)}>{p.title}</span>
                      </div>
                      <div style={css(`margin-top:4px;font:500 11.5px/1.5 ${R};color:var(--nv-ink60)`)}>{p.detail}</div>
                      <div style={css("margin-top:8px;display:flex;gap:8px")}>
                        {p.actionable && (
                          <Button compact onClick={p.accept} disabled={p.busy}
                          >{p.busy ? '…' : 'Accept'}</Button>
                        )}
                        {p.open && (
                          <Button variant="quiet" compact tone="violet" onClick={p.open}>Open</Button>
                        )}
                        <Button variant="quiet" compact tone="quiet" onClick={p.dismiss} disabled={p.busy}>Dismiss</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="nv-pane" style={{ flex: '1 1 320px', padding: '16px 18px', minWidth: 0 }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="gold">Open promises</Eyebrow>
                <Meta tone="faint">Fortnightly · read-only scan</Meta>
              </div>
              <div style={css(`margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px`)}>
                <span style={css(`font:500 11.5px ${R};color:var(--nv-ink60);min-width:0`)}>last pass {v.commitmentsLastRun} · {v.commitmentProposals.length} still open</span>
                <TextAction tone="gold" disabled={v.commitmentsBusy} onClick={v.runCommitmentsNow} style={{ flex: 'none' }}>{v.commitmentsBusy ? 'Scanning…' : 'Run now'}</TextAction>
              </div>
              {v.commitmentProposals.length === 0 && v.commitmentsLoaded && (
                <div style={css(`margin-top:8px;font:500 11.5px/1.5 ${R};color:var(--nv-ink60)`)}>Nothing you wrote down has been left hanging — every promise is closed, tracked, or written about since.</div>
              )}
              {v.commitmentProposals.length > 0 && (
                <div className="nv-stagger" style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
                  {v.commitmentProposals.map((p) => (
                    <div key={p.id} style={css("padding:10px 12px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);background:var(--nv-well);min-width:0")}>
                      <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                        <Tag hue={p.badge.hue}>{p.badge.label}</Tag>
                        <span style={css(`font:600 13px ${R};min-width:0`)}>{p.title}</span>
                      </div>
                      <div style={css(`margin-top:4px;font:500 11.5px/1.5 ${R};color:var(--nv-ink60)`)}>{p.detail}</div>
                      <div style={css("margin-top:8px;display:flex;gap:8px;flex-wrap:wrap")}>
                        <Button compact onClick={p.accept} disabled={p.busy}
                        >{p.busy ? '…' : p.acceptLabel}</Button>
                        {p.open && (
                          <Interactive as="span" onClick={p.open}
                            base={{ cursor: 'pointer', font: `600 11.5px ${R}`, padding: '4px 12px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-vi) 45%, transparent)', color: 'var(--nv-vi)' }}
                            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-vi) 08%, transparent)' }}
                          >Open the note</Interactive>
                        )}
                        <Interactive as="span" onClick={p.busy ? undefined : p.dismiss}
                          base={{ cursor: 'pointer', font: `600 11.5px ${R}`, padding: '4px 12px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent)', color: 'var(--nv-ink60)', opacity: p.busy ? 0.5 : 1 }}
                          hoverStyle={{ background: 'rgba(255,255,255,.05)' }}
                        >Let it go</Interactive>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="nv-pane" style={{ flex: '1 1 320px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="violet">Todoist sync</Eyebrow>
                <Meta tone="faint">{v.todoist.configured ? 'Two-way · every 10 min' : 'Not connected'}</Meta>
              </div>
              <div style={css(`margin-top:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px`)}>
                <span style={css(`font:500 11.5px/1.5 ${R};color:var(--nv-ink60)`)}>{v.todoist.status}</span>
                {v.todoist.configured && (
                  <TextAction tone="violet" disabled={v.todoist.busy} onClick={v.todoist.sync} style={{ flex: 'none' }}>{v.todoist.busy ? 'Syncing…' : 'Sync now'}</TextAction>
                )}
              </div>
              {v.todoist.configured && (
                <div style={css(`margin-top:8px;font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 35%, transparent)`)}>To-dos filed here appear in Todoist's Inbox; tasks added or completed there flow back. Nothing is ever deleted on either side.</div>
              )}
            </div>

            <div className="nv-pane" style={{ flex: '1 1 320px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="var(--nv-pk, #ff7ad9)">Meal prep</Eyebrow>
                <Meta tone="faint">Thursdays · same meals by design</Meta>
              </div>
              <div style={css(`margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px`)}>
                <span style={css(`font:500 11.5px/1.5 ${R};color:var(--nv-ink60)`)}>Keeps this week's rotation, checks the protein floor, and drafts the shopping list those meals need — one Accept fills the list.</span>
                <TextAction tone="#ff7ad9" disabled={v.mealPrep.busy} onClick={v.mealPrep.run} style={{ flex: 'none' }}>{v.mealPrep.busy ? 'Composing…' : 'Run now'}</TextAction>
              </div>
            </div>

            <div className="nv-pane" style={{ flex: '1 1 320px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="gold">Guardian</Eyebrow>
                <Meta tone="faint">Daily · read-only checks</Meta>
              </div>
              <div style={css(`margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px`)}>
                <span style={css(`display:flex;align-items:center;gap:8px;font:500 11.5px ${R};color:var(--nv-ink60)`)}>
                  {v.guardian.loaded && <span style={{ width: '7px', height: '7px', borderRadius: '50%', flex: 'none', background: v.guardian.statusColor, boxShadow: `0 0 8px ${v.guardian.statusColor}` }}></span>}
                  {v.guardian.loaded ? `${v.guardian.status.toUpperCase()} · ${v.guardian.checkedLabel}` : v.guardian.checkedLabel}
                </span>
                <span style={css("display:flex;gap:6px;flex:none")}>
                  <TextAction tone="gold" disabled={v.guardian.busy} onClick={v.guardian.run}>{v.guardian.busy ? 'Checking…' : 'Run checks'}</TextAction>
                  <TextAction tone="quiet" disabled={v.guardian.busy} onClick={v.guardian.report}>Report</TextAction>
                  <TextAction tone="quiet" disabled={v.guardian.busy} onClick={v.guardian.exportVault} title={`Zip vault + data to the Desktop · ${v.guardian.lastExportLabel}`}>Export</TextAction>
                </span>
              </div>
              {v.guardian.checks.length > 0 && (
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:7px")}>
                  {v.guardian.checks.map((c) => (
                    <div key={c.id} style={css("display:flex;gap:9px;align-items:baseline")}>
                      <Meta tone={c.color} style={{ flex: 'none', width: '44px' }}>{c.statusLabel}</Meta>
                      <span style={css(`font:500 11.5px/1.5 ${R};color:var(--nv-ink60)`)}><span style={css("color:var(--nv-ink)")}>{c.label}.</span> {c.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* history */}
      <div style={{ marginTop: '26px' }}>
        <div style={css(`display:flex;justify-content:space-between;align-items:baseline`)}>
          <Eyebrow as="span">History</Eyebrow>
          <Meta tone="faint">Every filing is on the record — and undoable</Meta>
        </div>
        {v.inboxHistory.length === 0 ? (
          <div style={css(`margin-top:20px;text-align:center;font:500 13px ${R};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>
            {!v.inboxConnected ? 'Connect a backend in Settings — captures write to your real vault.'
              : !v.inboxLoaded ? 'Loading your capture history…'
              : 'Nothing captured yet — drop your first thought above.'}
          </div>
        ) : (
          <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
            {shownHistory.map((item, i) => {
              const meta = STATUS_META[item.status] || STATUS_META.error;
              return (
                <div key={item.id} data-record={item.id} style={css(`padding:10px 4px${i < shownHistory.length - 1 ? ';border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)' : ''}`)}>
                {/* THE ROW WRAPS. Badge + title + status + up to four action
                    pills on one unwrapped line ran 115px past a 375px screen
                    and took the whole page sideways with it (measured 23 Sep).
                    The title keeps most of the width and the pills drop to
                    their own line when they no longer fit. */}
                <div style={css('display:flex;gap:10px;align-items:center;flex-wrap:wrap;row-gap:8px')}>
                  <Meta tone="faint" style={{ width: '76px', flex: 'none' }}>{item.time}</Meta>
                  <span style={{ flex: 'none' }}><RouteBadge route={item.route} confidence={null} /></span>
                  <span onClick={item.canExpand ? item.toggleExpand : undefined} style={{ minWidth: 0, flex: '1 1 60%', cursor: item.canExpand ? 'pointer' : 'default' }}
                    title={item.canExpand ? (item.expanded ? 'Collapse' : 'Tap to see what was captured and filed') : undefined}>
                    <span style={css(`font:600 13.5px ${R};display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{item.title}</span>
                    <span style={css(`font:500 11.5px ${R};color:var(--nv-ink60);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>
                      {item.status === 'filed' && item.destination ? `${item.auto ? 'auto-filed' : 'approved'} → ${item.destination}` : ''}
                      {item.status === 'undone' ? (item.undoSummary || 'reverted') : ''}
                      {item.status === 'error' ? (item.error || 'classification failed') : ''}
                      {item.status === 'classifying' ? 'Nova is routing this…' : ''}
                      {item.status === 'discarded' ? 'discarded without writing' : ''}
                    </span>
                  </span>
                  <Meta tone={meta.color} style={{ flex: 'none' }}>{meta.label}</Meta>
                  {item.canUndo && (
                    <Button variant="quiet" compact tone="quiet" onClick={item.undo} disabled={item.busy}
                      style={{ flex: 'none' }}>{item.busy ? '…' : 'Undo'}</Button>
                  )}
                  {item.canRetry && (
                    <Button variant="quiet" compact tone="quiet" onClick={item.retry} disabled={item.busy}
                      style={{ flex: 'none' }}>{item.busy ? '…' : 'Retry'}</Button>
                  )}
                  {item.deepAnalyse && item.status === 'filed' && (
                    <Button variant="quiet" compact onClick={item.deepAnalyse} disabled={item.busy}
                      title="Run the full vault weave on this video — every concept and idea into your second brain"
                      style={{ flex: 'none' }}>Deep weave</Button>
                  )}
                  {item.canDiscard && (
                    <Button variant="quiet" compact tone="warn" onClick={item.discard} disabled={item.busy}
                      style={{ flex: 'none' }}>{item.busy ? '…' : 'Dismiss'}</Button>
                  )}
                </div>
                {item.expanded && (
                  <div style={css("margin:8px 0 2px 88px;display:flex;flex-direction:column;gap:8px")}>
                    {item.captured && (
                      <div>
                        <Eyebrow>You captured</Eyebrow>
                        <div style={css(`margin-top:3px;font:500 12.5px/1.55 ${R};color:var(--nv-ink60);white-space:pre-wrap`)}>{item.captured}</div>
                      </div>
                    )}
                    {item.full && (
                      <div>
                        <Eyebrow tone="gold">{item.status === 'filed' ? 'What was filed' : 'The filing'}</Eyebrow>
                        <div style={css(`margin-top:3px;font:500 12.5px/1.55 ${R};white-space:pre-wrap;overflow-wrap:break-word`)}>{item.full}</div>
                      </div>
                    )}
                  </div>
                )}
                </div>
              );
            })}
            {hiddenHistoryCount > 0 && (
              <TextAction tone="quiet" onClick={() => setHistoryLimit((n) => n + 100)} style={{ alignSelf: 'flex-start', marginTop: '12px' }}>
                Show {Math.min(100, hiddenHistoryCount)} more · {hiddenHistoryCount} older
              </TextAction>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
