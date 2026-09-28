import { useEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { useDictation } from '../useDictation.js';
import { SwipeRow } from '../SwipeRow.jsx';
import { GlassSheet } from '../GlassSheet.jsx';
import { SafeVisual } from '../SafeVisual.jsx';
import { VoicePanel } from '../VoicePanels.jsx';
import { Button, Eyebrow, Meta } from '../Controls.jsx';
import { Pill } from '../AppleLayout.jsx';
import { PickItUpPanel } from './PickItUp.jsx';
import { CrossBars } from './Recipes.jsx';
import { FIcon } from '../FuelIcon.jsx';

// THE SUMMARY FUEL PAGE — mockup 59, variation A ("Fuel is the plate"), his
// pick on 27 Sep 2026. Recipes.jsx returns this under the `summary` style;
// cupertino and command keep Recipes.jsx exactly as it was.
//
// Top to bottom: the title; the plate (ONE instrument — protein a ring
// against its target, calories a bar against theirs, carbs and fat plain
// grams); the composer (type, photo, barcode, talk) with "Log it again"
// under it; the day's log as rows that swipe (right logs again, left
// deletes and leaves a 30-second Undo); one rotation row; two doors,
// Recipes and Pick it up. The bank is its own page (A · 2) and a recipe is
// a sheet (src/RecipeSheet.jsx, A · 3). The audit it answers is
// design/audits/redesign-2026-09/04-fuel.md: every inventoried feature is
// here, moved, never dropped.
//
// Everything it shows is v.fuelSummary (src/vals/valsFuelSummary.js), which
// reshapes the view model valsRecipes built; every action it calls is an
// existing app method. Nothing here fetches, posts or computes a total.

const NO_RING = {};
const PRESSED = { background: 'color-mix(in srgb, var(--nv-ink) 8%, transparent)' };
const kc = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');

// A text action in the house's sizes: 44pt tall, sentence case.
function Act({ children, onClick, tone, label, disabled }) {
  return (
    <Interactive as="span" className={`nv-fs-ta${tone ? ` ${tone}` : ''}`} onClick={disabled ? undefined : onClick} haptic="tick"
      aria-label={label} aria-disabled={disabled || undefined} focusStyle={NO_RING} base={disabled ? { opacity: 0.45, cursor: 'default' } : undefined}>{children}</Interactive>
  );
}

// ---------------------------------------------------------------- the plate --
const RING = 128;
const STROKE = 12;
function PlateRing({ protein }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const said = protein.state === 'dashed'
    ? `Protein ${protein.value} grams, no target set`
    : `Protein ${protein.value} of ${protein.target} grams`;
  return (
    <span className="nv-fs-ring" role="img" aria-label={said}>
      <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true">
        {protein.state === 'dashed' ? (
          // no target: a dashed ring and no arc, never a zero drawn as a verdict
          <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="var(--nv-fs-p)" strokeOpacity=".75" strokeWidth="6" strokeDasharray="3 6" />
        ) : (
          <>
            <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="var(--nv-sum-track)" strokeWidth={STROKE} />
            {protein.pct > 0 && (
              <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="var(--nv-fs-p)" strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - protein.pct / 100)}
                style={{ filter: 'drop-shadow(0 0 5px color-mix(in srgb, var(--nv-fs-p) 55%, transparent))', '--nv-arc-full': c,
                  animation: 'nvArcIn .9s cubic-bezier(.2,.8,.2,1) .12s backwards', transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
            )}
          </>
        )}
      </svg>
      <span className="nv-fs-ring-c" aria-hidden="true">
        <b>{protein.value > 0 || protein.target != null ? protein.value : '—'}</b>
        <small>{protein.target != null ? <>of {protein.target} g<br />protein</> : <>g protein<br />no target</>}</small>
      </span>
    </span>
  );
}

function Plate({ p, onOpen, openRef }) {
  const k = p.kcal;
  const right = k.target == null ? 'no target' : k.over > 0 ? `${kc(k.over)} over` : `${kc(k.left)} left`;
  return (
    <Interactive as="section" className="nv-sum-card nv-sum-rise nv-fs-plate" style={{ '--i': 1 }} onClick={onOpen} haptic="tick"
      aria-label={`Today's plate. ${p.line}. Open the week`} focusStyle={NO_RING}>
      <span ref={openRef} style={{ display: 'contents' }} />
      <div className="nv-sum-ch" style={{ color: 'var(--nv-fs-k)' }}>
        <FIcon n="fork" className="nv-sum-ico" />
        <span>Today's plate</span>
        <span className="nv-sum-ch-meta">{p.when}</span>
      </div>
      <div className="nv-fs-pl">
        <PlateRing protein={p.protein} />
        <div className="nv-fs-side">
          <div>
            <div className="nv-fs-kh"><span>Calories</span><span>{right}</span></div>
            <span className="nv-fs-kv">{kc(k.value)}{k.target != null ? <small> of {kc(k.target)}</small> : <small> kcal</small>}</span>
            {k.target != null && (
              <div className="nv-fs-kbar" role="img" aria-label={`${kc(k.value)} of ${kc(k.target)} kilocalories`}>
                <i style={{ width: `${k.pct}%` }} />
              </div>
            )}
          </div>
          <div className="nv-fs-mf">
            <span><b>{p.carbs.value}<small> g</small></b>carbs</span>
            <span><b>{p.fat.value}<small> g</small></b>fat</span>
          </div>
        </div>
      </div>
      <div className="nv-fs-gap">
        <b className={p.protein.target == null ? 'none' : undefined}>{p.line}</b>
        {p.hasWeek && <span className="nv-fs-go">The week<FIcon n="right" /></span>}
      </div>
    </Interactive>
  );
}

// ---------------------------------------------------------------- composer --
function Composer({ c }) {
  const dict = useDictation(c.dictBase, (text) => c.set(text), null);
  const [manualOpen, setManualOpen] = useState(false);
  const manualVisible = manualOpen || c.manual.hasData;
  const sending = c.canSend && !dict.on;
  return (
    <>
      <div className="nv-fs-comp nv-sum-rise" style={{ '--i': 2 }}>
        <input value={c.value} onChange={c.set} onKeyDown={c.onKey} disabled={c.busy} enterKeyHint="search"
          placeholder="What did you eat?" aria-label="What did you eat?" autoComplete="off" />
        {/* the camera is a label wrapping the input: on iOS that one element
            offers Take Photo or the library (Recipes.jsx has the reason) */}
        <label className="nv-fs-ib" aria-label="Shoot or add photos">
          <FIcon n="photo" />
          <input type="file" accept="image/*" multiple onChange={c.addPhotos} disabled={c.busy} />
        </label>
        <Interactive as="span" className="nv-fs-ib" onClick={c.busy ? undefined : c.openBarcode} aria-label="Scan a barcode" haptic="tick" focusStyle={NO_RING}>
          <FIcon n="code" />
        </Interactive>
        {sending ? (
          <Interactive as="span" className="nv-fs-ib send" onClick={c.send} aria-label="Look this food up" haptic="commit" focusStyle={NO_RING}>
            <FIcon n="up" />
          </Interactive>
        ) : dict.supported ? (
          <Interactive as="span" className="nv-fs-ib talk" data-on={dict.on ? 'true' : undefined} onClick={dict.toggle}
            aria-label={dict.on ? 'Stop dictating' : 'Say it'} haptic="tick" focusStyle={NO_RING}>
            <FIcon n="mic" />
          </Interactive>
        ) : null}
      </div>

      {/* the line under the well, only when it has news: the tap landed,
          or the entry lands on a day that is not today */}
      {(c.busy || c.logsTo) && (
        <div className={`nv-fs-status${c.busy ? ' busy' : ''}`} role="status">
          <i aria-hidden="true" />
          <span style={{ minWidth: 0 }}>{c.busy ? (c.slow ? 'Still looking. A named product can take a moment.' : 'Looking it up…') : c.logsTo}</span>
        </div>
      )}

      {c.recipeMatches.length > 0 && (
        <div className="nv-sum-card nv-fs-list" style={{ marginTop: '10px' }} aria-label="From your recipes">
          {c.recipeMatches.map((r) => (
            <Interactive key={r.id} as="div" className="nv-fs-lrow" onClick={r.open} haptic="tick" activeStyle={PRESSED} focusStyle={NO_RING}
              aria-label={`${r.name}, from your recipes. Open it to choose a portion`} base={{ gridTemplateColumns: '30px minmax(0, 1fr) 14px' }}>
              <span className="nv-fs-tile"><FIcon n="book" /></span>
              <span className="nv-fs-lx"><span className="nv-fs-nm">{r.name}</span><span className="nv-fs-sv">From your recipes · {r.sub}</span></span>
              <FIcon n="right" className="nv-fs-cv" />
            </Interactive>
          ))}
        </div>
      )}

      {c.again.length > 0 && (
        <div className="nv-fs-rail nv-sum-rise" style={{ '--i': 2 }} role="group" aria-label="Log it again">
          {c.again.map((it) => (
            <Interactive key={it.key} as="span" className="nv-fs-again" onClick={it.log} haptic="commit" focusStyle={NO_RING}
              aria-label={`Log ${it.name} again, ${it.p} grams protein, ${it.kcal} kilocalories`}>
              <FIcon n="again" />{it.name}{it.p > 0 && <b className="nv-fs-p">{it.p} g</b>}
            </Interactive>
          ))}
        </div>
      )}

      {/* the slower way in, typing the macros by hand, a quiet word under the rail */}
      <div style={{ display: 'flex', margin: '2px 0 -12px -6px' }}>
        <Act tone="quiet" onClick={() => setManualOpen((o) => !o)}>{manualVisible ? 'Hide the macros' : 'Type the macros'}</Act>
      </div>
      <InProgress c={c} manualVisible={manualVisible} />
    </>
  );
}

// WHAT GROWS UNDER THE WELL, and only while a log is in progress: the
// photos waiting to be read, Nova's question, the lines it found, "say
// what's different", the macros by hand. Each is the view model's own.
function InProgress({ c, manualVisible }) {
  return (
    <>
      {c.photoCount > 0 && (
        <div className="nv-sum-card nv-fs-work nv-deck-rise">
          <span className="nv-fs-work-h">{c.photoCount} photo{c.photoCount === 1 ? '' : 's'} to read</span>
          <div className="nv-fs-thumbs">
            {c.photos.map((ph, i) => (
              <span key={`${i}-${ph.src.slice(-24)}`}>
                <img src={ph.src} alt="" />
                <button type="button" onClick={ph.remove} aria-label="Take this photo out"><i><FIcon n="x" /></i></button>
              </span>
            ))}
          </div>
          <div className="nv-fs-frow">
            <input className="nv-fs-field" value={c.note} onChange={c.setNote} placeholder="A note, like “ate half” (optional)" aria-label="A note for the photos" />
            <Button tone="good" onClick={c.canRunScan ? c.runScan : undefined} disabled={!c.canRunScan}>{c.busy ? 'Reading…' : 'Read them'}</Button>
          </div>
          <Meta as="div" tone="faint" style={{ marginTop: '8px' }}>Up to five: labels and the food itself. More photos and a note give a sharper estimate.</Meta>
        </div>
      )}
      {c.question && (
        <div className="nv-sum-card nv-fs-work nv-deck-rise" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--nv-gold) 36%, transparent)' }}>
          {/* gold is earned here: Nova asked, and files nothing until he answers */}
          <span className="nv-fs-work-h ask">Nova asks</span>
          <p style={{ margin: '6px 0 0', font: '400 17px/1.35 var(--nv-font-serif)', color: 'var(--nv-ink)' }}>{c.question.text}</p>
          {c.question.canAnswer ? (
            <div className="nv-fs-frow">
              <input className="nv-fs-field" value={c.question.answer} onChange={c.question.setAnswer} aria-label="Your answer"
                onKeyDown={(e) => { if (e.key === 'Enter' && !c.busy) c.question.send(); }} placeholder="“the whole packet”, “about 300 g”" />
              <Button tone="undecided" onClick={c.question.send} disabled={c.busy || !String(c.question.answer || '').trim()}>{c.busy ? 'Refining…' : 'Answer'}</Button>
            </div>
          ) : <Meta as="div" tone="faint" style={{ marginTop: '6px' }}>Adjust the numbers below if they need it. Saving works either way.</Meta>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Act tone="quiet" onClick={c.question.dismiss}>Keep it as it is</Act></div>
        </div>
      )}
      {c.pending && (
        <div className="nv-sum-card nv-fs-work nv-deck-rise">
          <span className="nv-fs-work-h" style={{ color: 'var(--nv-fs-k)' }}>Found {c.pending.count} lines</span>
          <div className="nv-fs-lines">
            {c.pending.lines.map((l) => (
              <div key={l.key} className={`nv-fs-line${l.fresh ? ' fresh nv-deck-rise' : ''}`} title={l.source || undefined}>
                <span>{l.name}{l.grams ? `, ${l.grams} g` : ''}</span>
                <span>{l.macros.replace(/(\d+)P · /, '$1 g protein · ')}</span>
              </div>
            ))}
          </div>
          <Meta as="div" tone="faint" style={{ marginTop: '6px' }}>They ride with the entry. Any one of them can go after it is logged.</Meta>
        </div>
      )}
      {c.refine && (
        <div className="nv-sum-card nv-fs-work nv-deck-rise">
          <span className="nv-fs-work-h">Say what’s different</span>
          {c.refine.thread.map((t) => (
            <div key={t.key} className="nv-fs-turn nv-deck-rise" style={{ marginTop: '8px' }}>
              <span className="nv-fs-said">{t.said}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'baseline' }}>
                {t.removed.map((n) => <span key={`r-${n}`} className="gone">{n}</span>)}
                {t.added.map((n) => <span key={`a-${n}`} className="came">{n}</span>)}
                {t.delta && <span className="nv-fs-k">{t.delta}</span>}
              </span>
              {t.changes && <Meta tone="faint">{t.changes}</Meta>}
            </div>
          ))}
          <div className="nv-fs-frow">
            <input className="nv-fs-field" value={c.refine.value} onChange={c.refine.set} aria-label="Correct the estimate"
              onKeyDown={(e) => { if (e.key === 'Enter' && !c.refine.busy) c.refine.send(); }}
              placeholder={c.refine.thread.length ? 'Anything else different?' : 'Anything different? “the rissole was vegetarian”'} />
            <Button tone="cyan" onClick={c.refine.send} disabled={c.refine.busy || !String(c.refine.value || '').trim()}>{c.refine.busy ? 'Refining…' : 'Refine'}</Button>
          </div>
          <Meta as="div" tone="faint" style={{ marginTop: '6px' }}>Correct it as often as you like. Nothing is logged until Add.</Meta>
        </div>
      )}
      {manualVisible && (
        <div className="nv-sum-card nv-fs-work nv-deck-rise">
          <span className="nv-fs-work-h">The macros, by hand</span>
          <input className="nv-fs-field" style={{ marginTop: '8px' }} value={c.manual.name} onChange={c.manual.setName} placeholder="What did you eat?" aria-label="What you ate" />
          <div className="nv-fs-macros">
            {c.manual.fields.map((f) => (
              <label key={f.key}>{f.label}
                <input className="nv-fs-field" type="number" inputMode="decimal" value={f.value} onChange={f.set} aria-label={f.label} />
              </label>
            ))}
          </div>
          <div className="nv-fs-frow" style={{ justifyContent: 'space-between' }}>
            {c.saveToRecipe ? <Act tone="quiet" onClick={c.saveToRecipe}>Save to my recipes</Act> : <span />}
            <Button tone="good" onClick={c.manual.submit} disabled={c.manual.busy}>{c.manual.busy ? 'Adding…' : 'Add'}</Button>
          </div>
        </div>
      )}
      {c.error && <p className="nv-fs-err" role="alert">{c.error}</p>}
    </>
  );
}

// ------------------------------------------------------------------- the log --
// A countdown drawn as a ring that empties over the seconds App keeps the
// Undo for; it starts where the clock already is when it mounts.
function Countdown({ at, icon, tone }) {
  const [delay] = useState(() => -Math.min(30000, Math.max(0, Date.now() - at)));
  return (
    <span className={`nv-fs-cd${tone ? ` ${tone}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="12.5" fill="none" stroke="currentColor" strokeOpacity=".9" strokeWidth="2" strokeDasharray="78.54" style={{ animationDelay: `${delay}ms` }} /></svg>
      <FIcon n={icon} />
    </span>
  );
}

function Receipt({ r, icon = 'trash', tone }) {
  return (
    <div className="nv-fs-receipt" role="status">
      <Countdown at={r.at} icon={icon} tone={tone} />
      <span className="nv-fs-rx"><b>{r.title}</b><span>{r.sub}</span></span>
      <Act onClick={r.undo} label={`Undo: ${r.title}`}>Undo</Act>
    </div>
  );
}

function LogRow({ row, open, onToggle, edit }) {
  const time = row.time;
  const lineCount = row.lines.length;
  return (
    <div>
      <div className="nv-fs-swipe">
        <SwipeRow style={{ borderRadius: 0 }}
          right={{ label: 'Log again', icon: '↻', tone: 'var(--nv-fs-k)', run: row.relog }}
          left={{ label: 'Delete', icon: '✕', tone: 'var(--nv-fs-rm)', run: row.remove }}>
          <Interactive as="div" className="nv-fs-lrow" onClick={onToggle} haptic="tick" activeStyle={PRESSED} focusStyle={NO_RING}
            aria-expanded={open} aria-label={`${row.name}, ${row.p} grams protein, ${row.kcal} kilocalories${lineCount > 1 ? `, ${lineCount} lines` : ''}. Swipe right to log it again, left to delete.`}>
            <span className="nv-fs-tm">{time ? <>{time.clock}<small>{time.ampm}</small></> : <small>—</small>}</span>
            <span className="nv-fs-lx">
              <span className="nv-fs-nm">{row.name}</span>
              <span className="nv-fs-sv"><span className="nv-fs-p">{row.p} g</span> protein · <span className="nv-fs-k">{kc(row.kcal)}</span> kcal{row.tail ? ` · ${row.tail}` : ''}{row.edited ? ' · edited' : ''}</span>
            </span>
            <FIcon n="right" className="nv-fs-cv" />
          </Interactive>
        </SwipeRow>
      </div>
      {open && (
        <div className="nv-fs-open">
          {/* THE ITEMISED PLATE: its lines, each droppable; the entry's figures
              are the server's sum of what is left */}
          {row.lines.map((l) => (
            <div key={l.id} className="nv-fs-ln">
              <span className="nv-fs-lx"><span className="nv-fs-nm">{l.name}</span><span className="nv-fs-sv">{l.sub}</span></span>
              <Interactive as="span" className="nv-fs-x" onClick={l.remove} aria-label={`Drop ${l.name} from ${row.name}`} haptic="tick" focusStyle={NO_RING}><FIcon n="x" /></Interactive>
            </div>
          ))}
          {edit && row.editing ? (
            <div className="nv-deck-rise" style={{ paddingTop: '8px' }}>
              <input className="nv-fs-field" value={edit.name} onChange={edit.setName} aria-label="Name" />
              <div className="nv-fs-macros">
                {edit.fields.map((f) => (
                  <label key={f.key}>{f.key === 'p' ? 'Protein' : f.key === 'c' ? 'Carbs' : f.key === 'f' ? 'Fat' : 'kcal'}
                    <input className="nv-fs-field" inputMode="decimal" value={f.value} onChange={f.set} aria-label={f.label} />
                  </label>
                ))}
              </div>
              <Eyebrow as="div" style={{ marginTop: '10px' }}>Ate less</Eyebrow>
              <div className="nv-fs-chips" style={{ marginTop: '6px' }}>
                {edit.quick.map((q) => <Interactive key={q.label} as="span" onClick={q.apply} haptic="tick" focusStyle={NO_RING}>{q.label}</Interactive>)}
              </div>
              <div className="nv-fs-frow" style={{ justifyContent: 'flex-end' }}>
                <Act tone="quiet" onClick={edit.cancel}>Cancel</Act>
                <Button onClick={edit.save}>Save</Button>
              </div>
            </div>
          ) : (
            <div className="nv-fs-acts">
              <Act onClick={row.edit} label={`Edit ${row.name}, or say you ate less of it`}>Edit or ate less</Act>
              <Act tone="quiet" onClick={row.toRecipe}>Save to my recipes</Act>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function History({ h }) {
  return (
    <>
      <div className="nv-sum-card nv-fs-doors" style={{ marginTop: '12px' }}>
        <Interactive as="div" className="nv-fs-door" onClick={h.toggle} haptic="tick" focusStyle={NO_RING} aria-expanded={h.open}>
          <span className="nv-fs-tile"><FIcon n="list" /></span>
          <span className="nv-fs-lx"><span className="nv-fs-nm">Everything you’ve logged</span><span className="nv-fs-sv">Log again, or save to your recipes</span></span>
          <span />
          <FIcon n="right" className="nv-fs-cv" />
        </Interactive>
        {h.open && (
          <div className="nv-fs-rpanel">
            {!h.loaded && <div className="nv-fs-sk" aria-hidden="true"><span><i /><i /></span><b /></div>}
            {h.loaded && !h.items.length && <p className="nv-fs-empty" style={{ padding: '8px 0' }}>Nothing logged yet. Foods you log collect here, and the newest ride the rail under the field.</p>}
            {h.items.map((it) => (
              <div key={it.key} className="nv-fs-ln" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                <span className="nv-fs-lx"><span className="nv-fs-nm">{it.name}</span><span className="nv-fs-sv">{it.sub}{it.seen ? ` · ${it.seen}` : ''}</span></span>
                <span style={{ display: 'flex' }}>
                  <Act tone="fuel" onClick={it.relog} label={`Log ${it.name} again`}>Log</Act>
                  <Act tone="quiet" onClick={it.toRecipe} label={`Save ${it.name} to your recipes`}>Save</Act>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Log({ log }) {
  const [openId, setOpenId] = useState(null);
  return (
    <>
      <div className="nv-fs-lhead nv-sum-rise" style={{ '--i': 3 }}>
        <h2>{log.heading}</h2>
        {log.prev && (
          <Interactive as="span" className="nv-fs-lnk" onClick={log.prev.go} haptic="tick" focusStyle={NO_RING} aria-label={`Show ${log.prev.label}'s log`}>
            <FIcon n="left" />{log.prev.label}
          </Interactive>
        )}
      </div>
      {log.days && (
        <div className="nv-fs-drail" role="group" aria-label="Which day">
          {log.days.map((d) => (
            <Interactive key={d.key} as="span" onClick={d.pick} aria-pressed={d.active} haptic="tick" focusStyle={NO_RING} aria-label={d.label}>
              <b>{d.num}</b>{d.short}
            </Interactive>
          ))}
        </div>
      )}
      <div className="nv-sum-card nv-sum-rise nv-fs-list" style={{ '--i': 3 }}>
        {log.rows.length === 0 && <p className="nv-fs-empty" style={{ margin: 0 }}>{log.empty}</p>}
        {log.rows.map((row) => (
          <LogRow key={row.id} row={row} open={openId === row.id} edit={log.edit}
            onToggle={() => setOpenId((o) => (o === row.id ? null : row.id))} />
        ))}
      </div>
      {log.receipts.map((r) => <Receipt key={r.key} r={r} />)}
      {log.total && <p className="nv-fs-total">{log.total}</p>}
      <History h={log.history} />
    </>
  );
}

// ------------------------------------------------------------ the rotation --
function RotationRow({ rot, onOpen, onTicked }) {
  const t = rot.tonight;
  if (!t) {
    return (
      <Interactive as="div" className="nv-sum-card nv-fs-rot nv-sum-rise nv-fs-press" style={{ '--i': 5 }} onClick={onOpen} haptic="tick" focusStyle={NO_RING}
        aria-label={`Rotation: ${rot.eatenLine}. Open the rotation`}>
        <span className={`nv-fs-tk${rot.state === 'done' ? ' on' : ''}`} aria-hidden="true"><FIcon n={rot.state === 'done' ? 'check' : 'plus'} /></span>
        <span className="nv-fs-lx"><span className="nv-fs-nm">{rot.state === 'done' ? 'The rotation is eaten' : 'Nothing in the rotation today'}</span><span className="nv-fs-sv">{rot.state === 'done' ? rot.eatenLine : 'Plan a dish from Recipes'}</span></span>
        <FIcon n="right" className="nv-fs-cv" />
      </Interactive>
    );
  }
  return (
    <div className="nv-sum-card nv-fs-rot nv-sum-rise" style={{ '--i': 5 }}>
      <Interactive as="span" className="nv-fs-tk" onClick={() => { rot.tick(); onTicked(t); }} haptic="commit" focusStyle={NO_RING}
        aria-label={`Tick it: log ${t.name}${t.portionsLeft != null ? ', one comes out of the fridge' : ''}`}>
        <FIcon n="check" />
      </Interactive>
      <Interactive as="span" className="nv-fs-press" onClick={onOpen} haptic="tick" focusStyle={NO_RING} aria-label={`${t.label}: ${t.name}. Open the rotation`}
        base={{ gridColumn: '2 / 4', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 14px', gap: '12px', alignItems: 'center', minHeight: '48px', minWidth: 0 }}>
        <span className="nv-fs-lx">
          <span className="nv-fs-nm">{t.label}: {t.name}{t.variant ? ` · ${t.variant}` : ''}</span>
          <span className="nv-fs-sv"><span className="nv-fs-p">{t.p} g</span> protein · <span className="nv-fs-k">{kc(t.kcal)}</span> kcal
            {t.portionsLeft != null ? (t.out ? ' · none in the fridge' : ` · ${t.portionsLeft} in the fridge`) : ''}</span>
        </span>
        <FIcon n="right" className="nv-fs-cv" />
      </Interactive>
    </div>
  );
}

// THE ROTATION, WHOLE: every slot and its options, behind the one row.
// Everything the rotation card did on the old page — tick, make it the one
// that counts, swap to a version, drop, rename, add a meal — in words and
// 44pt targets, with no hold menus and no window.prompt.
function KitchenSheet({ rot, onClose, openRecipes, originEl }) {
  const [naming, setNaming] = useState(null);   // a slot key being renamed, or 'new'
  const [label, setLabel] = useState('');
  const commit = (fn) => { const l = label.trim(); if (l) fn(l); setNaming(null); setLabel(''); };
  return (
    <GlassSheet label="The rotation" onClose={onClose} originEl={originEl}>
      <div className="nv-fs" style={{ padding: '0 2px' }}>
        <div className="nv-fs-rhead"><div><h2>The rotation</h2><p>{rot.eatenLine}</p></div></div>
        {rot.slots.map((s) => (
          <section key={s.key} style={{ marginTop: '16px' }} aria-label={s.name}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span className="nv-fs-hk" style={{ margin: '0 0 0 4px' }}>{s.name}</span>
              <span style={{ display: 'flex' }}>
                {s.rename && <Act tone="quiet" onClick={() => { setNaming(s.key); setLabel(s.name); }}>Rename</Act>}
                {s.removeSlot && <Act tone="rm" onClick={s.removeSlot}>Remove</Act>}
              </span>
            </div>
            {naming === s.key && (
              <div className="nv-fs-frow">
                <input className="nv-fs-field" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} aria-label={`Name for ${s.name}`}
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(s.rename); }} />
                <Button onClick={() => commit(s.rename)}>Save</Button>
              </div>
            )}
            <div className="nv-sum-card nv-fs-list" style={{ marginTop: '6px' }}>
              {s.options.length === 0 && (
                <Interactive as="div" className="nv-fs-lrow" onClick={() => { onClose(); openRecipes(); }} haptic="tick" focusStyle={NO_RING}
                  base={{ gridTemplateColumns: 'minmax(0, 1fr) 14px' }}>
                  <span className="nv-fs-sv" style={{ whiteSpace: 'normal' }}>Empty. Plan a dish for it from Recipes.</span>
                  <FIcon n="right" className="nv-fs-cv" />
                </Interactive>
              )}
              {s.options.map((o) => (
                <div key={o.id} style={{ padding: '4px 10px 6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 44px', gap: '10px', alignItems: 'center' }}>
                    <Interactive as="span" className={`nv-fs-tk${o.eaten ? ' on' : ''}`} onClick={o.tick} haptic={o.eaten ? 'tick' : 'commit'} focusStyle={NO_RING}
                      aria-label={o.eaten ? `Mark ${o.name} not eaten` : `Tick it: log ${o.name}`}><FIcon n="check" /></Interactive>
                    <Interactive as="span" className="nv-fs-lx nv-fs-press" onClick={() => { onClose(); o.open(); }} haptic="tick" focusStyle={NO_RING} aria-label={`Open ${o.name}`}>
                      <span className="nv-fs-nm">{o.name}{o.variant ? ` · ${o.variant}` : ''}</span>
                      {/* wraps rather than cuts: "out" must never be left to colour alone (the audit's finding 6) */}
                      <span className="nv-fs-sv" style={{ whiteSpace: 'normal' }}>
                        <span className="nv-fs-p">{o.p} g</span> protein · <span className="nv-fs-k">{kc(o.kcal)}</span> kcal
                        {o.portionsLeft != null ? (o.out ? ' · out, cook more' : ` · ${o.portionsLeft} in the fridge`) : ''}
                        {s.options.length > 1 ? (o.focus ? ' · counts today' : '') : ''}
                      </span>
                    </Interactive>
                    <Interactive as="span" className="nv-fs-x" onClick={o.remove} haptic="tick" focusStyle={NO_RING} aria-label={`Drop ${o.name} from ${s.name}`}><FIcon n="x" /></Interactive>
                  </div>
                  {(s.options.length > 1 && !o.focus) || o.alts.length > 0 || o.variantId ? (
                    <div className="nv-fs-acts" style={{ marginLeft: '44px' }}>
                      {s.options.length > 1 && !o.focus && <Act onClick={o.focusIt}>Make it the one that counts</Act>}
                      {o.alts.slice(0, 3).map((a) => <Act key={a.id} tone="quiet" onClick={() => o.setVariant(a.id)}>Swap to {a.label}</Act>)}
                      {o.variantId && <Act tone="quiet" onClick={() => o.setVariant(null)}>Back to the original</Act>}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
        {rot.addMeal && (
          naming === 'new' ? (
            <div className="nv-fs-frow" style={{ marginTop: '16px' }}>
              <input className="nv-fs-field" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pre-workout, second breakfast…" aria-label="Name the meal"
                onKeyDown={(e) => { if (e.key === 'Enter') commit(rot.addMeal); }} />
              <Button onClick={() => commit(rot.addMeal)}>Add</Button>
            </div>
          ) : (
            <div style={{ marginTop: '12px' }}><Act onClick={() => { setNaming('new'); setLabel(''); }}>Add a meal</Act></div>
          )
        )}
      </div>
    </GlassSheet>
  );
}

// ------------------------------------------------------------------ the week --
// "Where did my protein go?", the seven days and the training × fuel check,
// one tap behind the plate.
function WeekSheet({ week, onClose, originEl }) {
  const x = week.cross;
  return (
    <GlassSheet label="The week" onClose={onClose} originEl={originEl}>
      <div className="nv-fs" style={{ padding: '0 2px' }}>
        <div className="nv-fs-rhead"><div><h2>The week</h2><p>The last seven days{x ? ', and the check against training' : ''}</p></div></div>
        <div style={{ marginTop: '12px' }}>
          {week.data
            ? <SafeVisual what="panel:nutrition-week"><VoicePanel panel={{ type: 'nutrition-week', data: week.data }} /></SafeVisual>
            : <p className="nv-fs-note">No week yet: the archive has not answered.</p>}
        </div>
        {x && (
          <section className="nv-sum-card" style={{ marginTop: '14px', padding: '14px 16px' }} aria-label="Training and fuel">
            <Eyebrow tone={x.couldntLook ? 'warn' : 'violet'}>Training × fuel{x.couldntLook ? ', couldn’t check' : ''}</Eyebrow>
            {x.bars && <CrossBars bars={x.bars} severity={x.severity} />}
            <p className="nv-fs-note" style={{ margin: '8px 0 0' }}>{x.line}</p>
            {x.draft && <div style={{ marginTop: '6px' }}><Act onClick={() => { onClose(); x.draft(); }}>Draft the fix with Coach</Act></div>}
          </section>
        )}
        {week.askProtein && (
          <div style={{ marginTop: '14px' }}><Pill tone="quiet" label="Where did my protein go?" onClick={() => { onClose(); week.askProtein(); }} /></div>
        )}
      </div>
    </GlassSheet>
  );
}

// No origin rect for this one: the finder's Segmented measures its clip with
// getBoundingClientRect on every render, and a re-render landing mid-morph
// measured the scaled sheet and left the highlight in the wrong place. It
// fades in instead.
function PickSheet({ s }) {
  return (
    <GlassSheet label="Pick it up" onClose={s.close} originEl={null}>
      <div className="nv-fs">
        <div className="nv-fs-rhead" style={{ gridTemplateColumns: '30px minmax(0, 1fr)', alignItems: 'center', padding: '0 2px' }}>
          <span className="nv-fs-tile"><FIcon n="bag" /></span>
          <div><h2>Pick it up</h2><p>What fits the rest of today</p></div>
        </div>
        <div style={{ margin: '4px -14px 0' }}><PickItUpPanel k={s.k} /></div>
      </div>
    </GlassSheet>
  );
}

// ------------------------------------------------------------ Recipes page --
function RecipesPage({ page }) {
  const [planFor, setPlanFor] = useState(null);
  const dict = useDictation(() => page.search || '', (text) => page.setSearch(text), null);
  return (
    <>
      <Interactive as="span" className="nv-fs-back nv-sum-rise" style={{ '--i': 0 }} onClick={page.back} haptic="tick" focusStyle={NO_RING} aria-label="Back to Fuel">
        <FIcon n="left" />Fuel
      </Interactive>
      <div className="nv-fs-titlerow nv-sum-rise" style={{ '--i': 0 }}>
        <h1 className="nv-fs-title">Recipes</h1>
        {page.addNew && <Act onClick={page.addNew} label="A new recipe"><FIcon n="plus" />&nbsp;New</Act>}
      </div>
      <div className="nv-fs-srch nv-sum-rise" style={{ '--i': 1 }}>
        <FIcon n="search" />
        {/* local echo: typing re-renders this field, not the app */}
        <LocalInput value={page.search} onChange={(t) => page.setSearch(t)} submitOnEnter={false} placeholder={page.placeholder} aria-label={page.placeholder} enterKeyHint="search" />
        {dict.supported && (
          <Interactive as="span" className={`nv-fs-ib${dict.on ? ' talk' : ''}`} data-on={dict.on ? 'true' : undefined} onClick={dict.toggle} haptic="tick" focusStyle={NO_RING}
            aria-label={dict.on ? 'Stop dictating' : 'Say it'}><FIcon n="mic" /></Interactive>
        )}
      </div>
      {page.scope.length > 0 && (
        <div className="nv-fs-scope nv-sum-rise" style={{ '--i': 1 }} role="group" aria-label="Which recipes">
          {page.scope.map((f) => (
            <Interactive key={f.key} as="span" className={f.fits ? 'fits' : undefined} onClick={f.pick} aria-pressed={!!f.active} haptic="tick" focusStyle={NO_RING}>{f.label}</Interactive>
          ))}
        </div>
      )}
      {page.bankState === 'loading' && (
        <div className="nv-sum-card nv-fs-rlist" aria-label="Loading your recipes">
          {[0, 1, 2, 3].map((i) => <div key={i} className="nv-fs-sk" aria-hidden="true"><span><i /><i /></span><b /></div>)}
        </div>
      )}
      {page.bankNote && <p className="nv-fs-note" role="status">{page.bankNote}</p>}
      {page.rows.length > 0 && (
        <div className="nv-sum-card nv-fs-rlist nv-sum-rise" style={{ '--i': 2 }}>
          {page.rows.map((r) => {
            const open = planFor === r.key;
            return (
              <div key={r.key}>
                <div className={`nv-fs-rr${r.photoUrl ? ' ph' : ''}`}>
                  {r.photoUrl && <span className="nv-fs-thumb"><img src={r.photoUrl} alt="" /></span>}
                  <Interactive as="span" className="open" onClick={r.open} haptic="tick" focusStyle={NO_RING} aria-label={`Open ${r.name}`}>
                    <span className="nv-fs-nm">{r.name}</span>
                    {r.pending
                      ? <span className="nv-fs-sv"><span style={{ color: 'var(--nv-gold)' }}>Macros not set</span>{r.makes ? ` · ${r.makes}` : ''}</span>
                      : <span className="nv-fs-sv"><span className="nv-fs-p">{r.p} g</span> protein · <span className="nv-fs-k">{kc(r.kcal)}</span> kcal{r.makes ? ` · ${r.makes}` : ''}</span>}
                  </Interactive>
                  {r.slot ? (
                    <Interactive as="span" className={`nv-fs-slot${r.slot.letter ? '' : ' no'}`} onClick={() => setPlanFor(open ? null : r.key)} haptic="tick" focusStyle={NO_RING}
                      aria-expanded={open} aria-label={r.slot.letter ? `In the ${r.slot.names.join(' and ').toLowerCase()} rotation. Plan it` : 'Not in the rotation. Plan it for…'}>
                      {r.slot.letter || <FIcon n="plus" />}
                    </Interactive>
                  ) : <span />}
                </div>
                {open && r.slot && (
                  <div className="nv-fs-planfor">
                    <span>Plan it for a meal. Tap it again to take it out.</span>
                    <div className="nv-fs-pf" style={{ gridTemplateColumns: `repeat(${Math.min(5, r.slot.choices.length)}, minmax(0, 1fr))` }}>
                      {r.slot.choices.map((c) => (
                        <Interactive key={c.key} as="span" onClick={c.toggle} aria-pressed={c.active} haptic="tick" focusStyle={NO_RING} aria-label={`${c.name}${c.active ? ', planned' : ''}`}>
                          {c.letter}<small>{c.name.split(' ')[0]}</small>
                        </Interactive>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {page.rows.length === 0 && page.bankState !== 'loading' && !page.bankNote && (
        <p className="nv-fs-note">{page.search ? 'No recipe matches that.' : 'Nothing in this list.'}</p>
      )}
      {page.demo && <p className="nv-fs-note">Demo recipes. Connect Nova to your Mac and your own bank replaces them.</p>}
    </>
  );
}

// ------------------------------------------------------------------ Fuel ---
function FuelPage({ F, sheets }) {
  const [ticked, setTicked] = useState(null);
  const tickT = useRef(0);
  useEffect(() => () => clearTimeout(tickT.current), []);
  const onTicked = (t) => {
    setTicked({ ...t, at: Date.now() });
    clearTimeout(tickT.current);
    tickT.current = setTimeout(() => setTicked(null), 30000);
  };
  const live = F.state === 'live';
  return (
    <>
      <h1 className="nv-fs-title nv-sum-rise" style={{ '--i': 0 }}>Fuel</h1>

      {live && <Plate p={F.plate} onOpen={sheets.openWeek} openRef={sheets.plateRef} />}
      {F.state === 'loading' && (
        <div className="nv-sum-card" style={{ padding: '6px 0' }} aria-label="Loading today's plate">
          {[0, 1, 2].map((i) => <div key={i} className="nv-fs-sk" aria-hidden="true"><span><i /><i /></span><b /></div>)}
        </div>
      )}
      {!live && F.state !== 'loading' && (
        <div className="nv-sum-card nv-sum-rise" style={{ '--i': 1, padding: '14px 16px' }}>
          <div className="nv-sum-ch" style={{ color: 'var(--nv-fs-k)' }}><FIcon n="fork" className="nv-sum-ico" /><span>Today's plate</span></div>
          <p className="nv-fs-note" style={{ margin: '8px 0 0' }}>
            {F.state === 'demo'
              ? 'Demo mode. Your plate, your log and your rotation appear once Nova is connected to your Mac; Recipes holds the demo bank until then.'
              : F.bankNote || 'Today’s plate is not here yet.'}
          </p>
        </div>
      )}

      {F.composer && <Composer c={F.composer} />}
      {F.log && <Log log={F.log} />}

      {F.rotation && (
        <>
          <span className="nv-fs-hk nv-sum-rise" style={{ '--i': 5 }}>Rotation</span>
          <RotationRow rot={F.rotation} onOpen={sheets.openKitchen} onTicked={onTicked} />
          {ticked && (
            <Receipt tone="fuel" icon="check" r={{
              at: ticked.at, title: `${ticked.name} logged`,
              sub: `${ticked.p} g and ${kc(ticked.kcal)} kcal went on the plate${ticked.portionsLeft != null ? ', one came out of the fridge' : ''}`,
              undo: () => { F.rotation.untick(ticked.slot, ticked.id); setTicked(null); },
            }} />
          )}
        </>
      )}

      <div className="nv-sum-card nv-fs-doors nv-sum-rise" style={{ '--i': 6 }}>
        <Interactive as="div" className="nv-fs-door" onClick={F.doors.recipes.open} haptic="tick" activeStyle={PRESSED} focusStyle={NO_RING}
          aria-label={`Recipes${F.doors.recipes.count != null ? `, ${F.doors.recipes.count}` : ''}`}>
          <span className="nv-fs-tile"><FIcon n="book" /></span>
          <span className="nv-fs-lx"><span className="nv-fs-nm">Recipes</span><span className="nv-fs-sv">{F.doors.recipes.sub}</span></span>
          <span className="cnt">{F.doors.recipes.count ?? ''}</span>
          <FIcon n="right" className="nv-fs-cv" />
        </Interactive>
        {F.doors.pickItUp && (
          <Interactive as="div" className="nv-fs-door" onClick={F.doors.pickItUp.open} haptic="tick" activeStyle={PRESSED} focusStyle={NO_RING}
            aria-label="Pick it up: takeaway and shop food that fits what is left">
            <span className="nv-fs-tile"><FIcon n="bag" /></span>
            <span className="nv-fs-lx"><span className="nv-fs-nm">Pick it up</span><span className="nv-fs-sv">{F.doors.pickItUp.sub}</span></span>
            <span className="cnt" />
            <FIcon n="right" className="nv-fs-cv" />
          </Interactive>
        )}
      </div>
    </>
  );
}

export function FuelSummary({ v }) {
  const F = v.fuelSummary;
  const [weekOpen, setWeekOpen] = useState(false);
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const plateRef = useRef(null);
  const sheets = {
    openWeek: () => setWeekOpen(true),
    openKitchen: () => setKitchenOpen(true),
    plateRef,
  };
  const page = F.recipesPage;
  return (
    <div className="nv-fs" style={v.wrapRecipes} data-screen-label="Recipes">
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {page.open ? <RecipesPage key="recipes" page={page} /> : <FuelPage key="fuel" F={F} sheets={sheets} />}
      </div>
      {weekOpen && F.plate && <WeekSheet week={F.week} onClose={() => setWeekOpen(false)} originEl={plateRef.current?.parentElement || null} />}
      {kitchenOpen && F.rotation && <KitchenSheet rot={F.rotation} onClose={() => setKitchenOpen(false)} openRecipes={F.doors.recipes.open} />}
      {F.pickItUpSheet?.open && !page.open && <PickSheet s={F.pickItUpSheet} />}
    </div>
  );
}
