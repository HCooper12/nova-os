import { useRef, useState } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

// The Nova Inbox: one place to drop any loose thought — typed or dictated —
// and let Nova route it (shopping / journal / to-do / note / food log).
// The classifier only ever proposes; deterministic code files; history and
// undo keep every filing reversible. The filing-mode ladder and the
// "proposed rule" banner implement graduated autonomy: Nova earns trust from
// the history and proposes its own promotion — you ratify.

const M = "'IBM Plex Mono',monospace";
const R = "'Rajdhani',sans-serif";
const S = "'Instrument Serif',serif";

// Real dictation via the browser's speech engine (on-device / OS-provided).
// Feature-detected: the mic button only renders where it actually works.
function useDictation(getBase, onText, onDone) {
  const recRef = useRef(null);
  const baseRef = useRef('');
  const [on, setOn] = useState(false);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const toggle = () => {
    if (on) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-AU';
    baseRef.current = getBase();
    let finals = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals += t;
        else interim += t;
      }
      const joined = (baseRef.current + ' ' + finals + interim).replace(/\s+/g, ' ').trim();
      onText(joined);
    };
    rec.onend = () => { setOn(false); onDone?.(); };
    rec.onerror = () => setOn(false);
    recRef.current = rec;
    rec.start();
    setOn(true);
  };
  return { supported: !!SR, on, toggle };
}

function RouteBadge({ route, confidence }) {
  if (!route) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
      <span style={{ font: `600 8.5px ${M}`, letterSpacing: '.14em', padding: '3px 8px', borderRadius: '5px', color: `rgb(${route.hue})`, background: `rgba(${route.hue},.08)`, border: `1px solid rgba(${route.hue},.4)` }}>{route.label}</span>
      {confidence === 'low' && (
        <span style={{ font: `600 8.5px ${M}`, letterSpacing: '.14em', padding: '3px 8px', borderRadius: '5px', color: 'var(--nv-warn)', background: 'color-mix(in srgb, var(--nv-warn) 08%, transparent)', border: '1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)' }}>LOW CONFIDENCE</span>
      )}
    </span>
  );
}

const STATUS_META = {
  classifying: { label: 'ROUTING…', color: 'var(--nv-ink60)' },
  filed: { label: 'FILED', color: 'var(--nv-good)' },
  discarded: { label: 'DISCARDED', color: 'var(--nv-ink40)' },
  undone: { label: 'UNDONE', color: 'var(--nv-gold)' },
  error: { label: 'ERROR', color: 'var(--nv-warn)' },
};

export function Inbox({ v }) {
  const dict = useDictation(
    () => v.inboxInput,
    (text) => v.setInboxInput(text),
    null,
  );
  const [dictated, setDictated] = useState(false);
  const micToggle = () => { if (!dict.on) setDictated(true); dict.toggle(); };
  const submit = () => {
    v.submitInboxCapture(dictated ? 'voice' : 'text');
    setDictated(false);
  };

  return (
    <div style={v.wrapInbox} data-screen-label="Inbox">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-acc)")}>V.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>SELF · INBOX</span>
        </div>
        <span style={css("font:400 10px 'IBM Plex Mono',monospace;letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.inboxHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>Drop the thought, <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>Nova files it.</span></h1>

      {/* capture composer */}
      <div className="nv-pane" style={{ marginTop: '20px', padding: '18px 20px' }}>
        <div style={css("display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px")}>
          <span style={css(`font:500 9.5px ${M};letter-spacing:.22em;color:var(--nv-cy)`)}>CAPTURE</span>
          <span style={css(`font:400 8.5px ${M};letter-spacing:.14em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>ROUTES · SHOPPING / JOURNAL / TO-DO / NOTE / FOOD LOG</span>
        </div>
        <textarea
          value={v.inboxInput}
          onChange={v.setInboxInput}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder={v.inboxConnected ? 'Anything — "buy tomatoes", "idea: cold open with the drone shot", "ate a protein bar"…' : 'Connect a backend in Settings to start capturing'}
          disabled={!v.inboxConnected}
          style={css(`margin-top:12px;width:100%;box-sizing:border-box;height:84px;resize:vertical;background:rgba(0,0,0,.3);border:1px solid ${dict.on ? 'var(--nv-acc-border)' : 'color-mix(in srgb, var(--nv-ink) 12%, transparent)'};border-radius:9px;padding:12px 14px;color:var(--nv-ink);font:500 14px 'Rajdhani',sans-serif;line-height:1.5;outline:none`)}
        />
        <div style={css("margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap")}>
          {dict.supported && (
            <Interactive as="span" onClick={v.inboxConnected ? micToggle : undefined}
              base={{
                cursor: 'pointer', font: `600 10.5px ${M}`, letterSpacing: '.1em', padding: '9px 16px', borderRadius: '8px',
                border: dict.on ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)',
                color: 'var(--nv-cy)', background: dict.on ? 'var(--nv-acc-bg)' : 'transparent',
                opacity: v.inboxConnected ? 1 : 0.4,
              }}
              hoverStyle={{ background: 'var(--nv-acc-bg)' }}
            >{dict.on ? '◉ LISTENING — TAP TO STOP' : '● DICTATE'}</Interactive>
          )}
          <Interactive as="span" onClick={v.inboxConnected && !v.inboxCaptureBusy ? submit : undefined}
            base={{ cursor: 'pointer', marginLeft: 'auto', font: `600 11px ${M}`, letterSpacing: '.14em', padding: '10px 22px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1206', opacity: v.inboxConnected && !v.inboxCaptureBusy ? 1 : 0.5 }}
            hoverStyle={{ filter: 'brightness(1.1)' }}
          >{v.inboxCaptureBusy ? 'ROUTING…' : '✦ CAPTURE'}</Interactive>
        </div>
      </div>

      {/* autonomy ladder */}
      <div style={css("margin-top:16px;display:flex;gap:8px;flex-wrap:wrap")}>
        {v.inboxModes.map((m) => (
          <Interactive key={m.value} onClick={m.pick}
            base={{
              cursor: 'pointer', flex: '1 1 200px', padding: '10px 14px', borderRadius: '9px',
              border: m.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
              background: m.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
              boxShadow: m.active ? 'var(--nv-glow-tab)' : 'none',
            }}
            hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
          >
            <span style={{ display: 'block', font: `600 9px ${M}`, letterSpacing: '.18em', color: m.active ? 'var(--nv-acc)' : 'var(--nv-ink40)' }}>STEP {m.step}</span>
            <span style={{ display: 'block', marginTop: '3px', font: `600 13.5px ${R}`, color: m.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{m.label}</span>
            <span style={{ display: 'block', marginTop: '2px', font: `500 11px ${R}`, color: 'var(--nv-ink60)' }}>{m.hint}</span>
          </Interactive>
        ))}
      </div>

      {/* proposed rule — Nova asks to move on the ladder; you ratify */}
      {v.inboxProposal && (
        <div className="nv-pane nv-focus" style={{ marginTop: '16px', padding: '16px 20px' }}>
          <div style={css(`font:500 9.5px ${M};letter-spacing:.26em;color:var(--nv-gold)`)}>PROPOSED RULE</div>
          <div style={css(`margin-top:8px;font:400 17px/1.4 ${S};text-wrap:pretty`)}>{v.inboxProposal.text}</div>
          <div style={css("margin-top:12px;display:flex;gap:10px")}>
            <Interactive as="span" onClick={v.inboxProposal.accept} base={css(`cursor:pointer;font:600 13px ${R};padding:7px 16px;border-radius:8px;background:var(--nv-gold);color:#1a1206`)} hoverStyle={{ filter: 'brightness(1.1)' }}>Accept</Interactive>
            <Interactive as="span" onClick={v.inboxProposal.skip} base={css(`cursor:pointer;font:600 13px ${R};padding:7px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent);color:var(--nv-ink60)`)} hoverStyle={{ background: 'rgba(255,255,255,.05)' }}>Skip</Interactive>
          </div>
        </div>
      )}

      {/* pending approvals */}
      {v.inboxPending.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={css(`font:500 9.5px ${M};letter-spacing:.22em;color:var(--nv-gold)`)}>WAITING FOR YOUR CALL · {v.inboxPending.length}</div>
          <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:10px")}>
            {v.inboxPending.map((item) => (
              <div key={item.id} className="nv-pane" style={{ padding: '14px 18px' }}>
                <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px")}>
                  <RouteBadge route={item.route} confidence={item.confidence} />
                  <span style={css(`font:400 9px ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>{item.time} · {item.source}</span>
                </div>
                <div style={css(`margin-top:9px;font:600 15px ${R}`)}>{item.title}</div>
                {item.preview && <div style={css(`margin-top:3px;font:500 13px/1.5 ${R};color:var(--nv-ink60)`)}>{item.preview}</div>}
                {item.reason && <div style={css(`margin-top:6px;font:italic 400 13px ${S};color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`)}>{item.reason}</div>}
                {item.error && <div style={css(`margin-top:6px;font:500 12px ${R};color:var(--nv-warn)`)}>{item.error}</div>}
                <div style={css("margin-top:12px;display:flex;gap:10px")}>
                  <Interactive as="span" onClick={item.busy ? undefined : item.approve}
                    base={{ cursor: 'pointer', font: `600 12.5px ${R}`, padding: '7px 16px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1206', opacity: item.busy ? 0.5 : 1 }}
                    hoverStyle={{ filter: 'brightness(1.1)' }}
                  >{item.busy ? 'Working…' : 'Approve & file'}</Interactive>
                  <Interactive as="span" onClick={item.busy ? undefined : item.discard}
                    base={{ cursor: 'pointer', font: `600 12.5px ${R}`, padding: '7px 16px', borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent)', color: 'var(--nv-ink60)', opacity: item.busy ? 0.5 : 1 }}
                    hoverStyle={{ background: 'rgba(255,255,255,.05)' }}
                  >Discard</Interactive>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* history */}
      <div style={{ marginTop: '26px' }}>
        <div style={css(`display:flex;justify-content:space-between;align-items:baseline`)}>
          <span style={css(`font:500 9.5px ${M};letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>HISTORY</span>
          <span style={css(`font:400 8.5px ${M};letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)`)}>EVERY FILING IS ON THE RECORD — AND UNDOABLE</span>
        </div>
        {v.inboxHistory.length === 0 ? (
          <div style={css(`margin-top:20px;text-align:center;font:500 13px ${R};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>
            {v.inboxConnected ? 'Nothing captured yet — drop your first thought above.' : 'Connect a backend in Settings — captures write to your real vault.'}
          </div>
        ) : (
          <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
            {v.inboxHistory.map((item, i) => {
              const meta = STATUS_META[item.status] || STATUS_META.error;
              return (
                <div key={item.id} style={css(`display:flex;gap:12px;align-items:baseline;padding:10px 4px${i < v.inboxHistory.length - 1 ? ';border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)' : ''}`)}>
                  <span style={css(`font:400 9.5px ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent);width:76px;flex:none`)}>{item.time}</span>
                  <span style={{ flex: 'none' }}><RouteBadge route={item.route} confidence={null} /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={css(`font:600 13.5px ${R};display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{item.title}</span>
                    <span style={css(`font:500 11.5px ${R};color:var(--nv-ink60);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>
                      {item.status === 'filed' && item.destination ? `${item.auto ? 'auto-filed' : 'approved'} → ${item.destination}` : ''}
                      {item.status === 'undone' ? (item.undoSummary || 'reverted') : ''}
                      {item.status === 'error' ? (item.error || 'classification failed') : ''}
                      {item.status === 'classifying' ? 'Nova is routing this…' : ''}
                      {item.status === 'discarded' ? 'discarded without writing' : ''}
                    </span>
                  </span>
                  <span style={{ font: `600 8.5px ${M}`, letterSpacing: '.14em', color: meta.color, flex: 'none' }}>{meta.label}</span>
                  {item.canUndo && (
                    <Interactive as="span" onClick={item.busy ? undefined : item.undo}
                      base={{ cursor: 'pointer', flex: 'none', font: `600 11px ${R}`, padding: '4px 12px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent)', color: 'var(--nv-ink60)', opacity: item.busy ? 0.5 : 1 }}
                      hoverStyle={{ borderColor: 'var(--nv-acc-border)', color: 'var(--nv-ink)' }}
                    >{item.busy ? '…' : 'Undo'}</Interactive>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
