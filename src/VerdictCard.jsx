import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

const M = 'var(--nv-font-mono)';

// The verdict card (A1) — a question answered as an EXPERIENCE, not a
// paragraph. Draws entirely from the server's deterministic payload
// (server/lib/verdicts.js): a ring, the arithmetic written out, numbered
// evidence, the verdict line, and Nova's honesty footer (basis, staleness,
// caveats). A new card type needs zero new code here.
export function VerdictCard({ v: verdict, onClose, onSpeak }) {
  if (!verdict) return null;
  const tone = (t) => (t === 'warn' ? 'var(--nv-warn)' : t === 'good' ? 'var(--nv-good)' : 'var(--nv-cy)');
  const m = verdict.metric;
  const pct = m?.pct != null ? Math.max(0, Math.min(100, m.pct)) : null;
  const R = 92, C = 2 * Math.PI * R;

  return (
    <div role="dialog" aria-modal="true" aria-label={verdict.question}
      onClick={onClose}
      style={css('position:fixed;inset:0;z-index:130;background:rgba(4,3,8,.86);backdrop-filter:blur(8px);overflow-y:auto;display:flex;justify-content:center;padding:24px 14px;animation:fadeIn .2s ease-out')}>
      <div onClick={(e) => e.stopPropagation()}
        style={css('width:min(760px,100%);height:fit-content;border:1px solid color-mix(in srgb, var(--nv-cy) 26%, transparent);border-radius:22px;padding:26px 24px 20px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 07%, transparent),rgba(0,0,0,.35));box-shadow:0 40px 120px -30px rgba(0,0,0,.95);animation:fadeUp .3s cubic-bezier(.2,.8,.2,1)')}>

        <div style={css('display:flex;justify-content:space-between;align-items:flex-start;gap:12px')}>
          <div>
            <div style={css(`font:600 9px ${M};letter-spacing:.24em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>{verdict.question.toUpperCase()} // NOVA VERDICT</div>
            <h2 style={css('margin:6px 0 0;font:700 clamp(21px,5vw,32px)/1.08 var(--nv-font-ui);letter-spacing:.01em')}>{verdict.title}</h2>
          </div>
          <Interactive as="span" onClick={onClose} aria-label="Close"
            base={css(`cursor:pointer;flex:none;font:400 20px/1 ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent);padding:4px 8px`)}
            hoverStyle="color:var(--nv-ink)">×</Interactive>
        </div>

        {m && (
          <div style={css('margin-top:18px;display:flex;justify-content:center;position:relative')}>
            <svg viewBox="0 0 220 220" style={{ width: 'min(220px,58vw)', height: 'min(220px,58vw)', transform: 'rotate(-90deg)' }}>
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="10" />
              {pct != null && (
                <circle cx="110" cy="110" r={R} fill="none" stroke={tone(verdict.evidence?.[0]?.tone)} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
                  style={{ filter: 'drop-shadow(0 0 10px rgba(89,230,255,.5))', transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)' }} />
              )}
            </svg>
            <div style={css('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center')}>
              <b style={css('font:600 clamp(28px,8vw,44px)/1 var(--nv-font-ui);color:var(--nv-cy);font-variant-numeric:tabular-nums')}>{m.value}<span style={css('font-size:.45em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)')}>{m.unit}</span></b>
              <span style={css(`margin-top:5px;font:600 8.5px ${M};letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 42%, transparent)`)}>{m.caption}</span>
            </div>
          </div>
        )}

        {/* F1: the day-curve — peak band, trough, and a NOW marker */}
        {verdict.curve?.points?.length > 0 && (() => {
          const pts = verdict.curve.points;
          const X = (h) => ((h - 6) / 16) * 300 + 10;
          const Y = (v2) => 86 - (v2 / 100) * 72;
          const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.h).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
          const [ps, pe] = verdict.curve.peak || [];
          const nowH = verdict.curve.now;
          return (
            <div style={css('margin-top:16px')}>
              <svg viewBox="0 0 320 100" style={{ width: '100%', height: 'auto' }} aria-label="Performance curve through the day">
                {ps != null && <rect x={X(ps)} y="8" width={X(pe) - X(ps)} height="82" fill="color-mix(in srgb, var(--nv-cy) 10%, transparent)" rx="4" />}
                {verdict.curve.trough != null && <line x1={X(verdict.curve.trough)} y1="8" x2={X(verdict.curve.trough)} y2="90" stroke="color-mix(in srgb, var(--nv-warn) 45%, transparent)" strokeDasharray="3 4" />}
                <path d={line} fill="none" stroke="var(--nv-cy)" strokeWidth="2.4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(89,230,255,.5))' }} />
                {nowH >= 6 && nowH <= 22 && (() => {
                  const np = pts.find((p) => p.h === nowH);
                  return np ? <circle cx={X(np.h)} cy={Y(np.v)} r="4.5" fill="var(--nv-gold)" style={{ filter: 'drop-shadow(0 0 6px rgba(224,178,106,.8))' }} /> : null;
                })()}
                {[6, 10, 14, 18, 22].map((h) => (
                  <text key={h} x={X(h)} y="99" textAnchor="middle" style={{ font: '500 7px var(--nv-font-mono)', fill: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{((h + 11) % 12) + 1}{h < 12 ? 'a' : 'p'}</text>
                ))}
              </svg>
            </div>
          );
        })()}

        {verdict.equation && (
          <div style={css(`margin-top:16px;text-align:center;font:500 clamp(10px,2.6vw,12.5px) ${M};letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 62%, transparent);border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding:11px 4px`)}>{verdict.equation}</div>
        )}

        {verdict.evidence?.length > 0 && (
          <div style={css('margin-top:16px;display:flex;gap:10px;flex-wrap:wrap')}>
            {verdict.evidence.map((e) => (
              <div key={e.n} style={{ flex: '1 1 200px', minWidth: 0, border: `1px solid color-mix(in srgb, ${tone(e.tone)} 32%, transparent)`, borderRadius: '13px', padding: '13px 15px', background: 'rgba(0,0,0,.25)' }}>
                <div style={css(`font:600 8.5px ${M};letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>{String(e.n).padStart(2, '0')} // {e.label}</div>
                <div style={{ font: '600 22px var(--nv-font-ui)', marginTop: '4px', color: tone(e.tone), fontVariantNumeric: 'tabular-nums' }}>{e.value}</div>
                <div style={css('margin-top:3px;font-size:11.5px;line-height:1.45;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>{e.note}</div>
              </div>
            ))}
          </div>
        )}

        <div style={css('margin-top:18px;border-left:2px solid var(--nv-cy);padding:2px 0 2px 14px')}>
          <div style={css(`font:600 8.5px ${M};letter-spacing:.2em;color:var(--nv-cy)`)}>NOVA VERDICT{verdict.insufficient ? ' // INSUFFICIENT EVIDENCE' : ' // EVIDENCE COMPLETE'}</div>
          <p style={css('margin:7px 0 0;font-size:14.5px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 92%, transparent)')}>{verdict.verdict}</p>
        </div>

        {/* the honesty footer — what it was computed from, how fresh, what it
            is NOT. Their card says "not a diagnosis"; ours says that AND
            shows its sources and blind spots. */}
        <div style={css('margin-top:18px;padding-top:13px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);display:flex;gap:12px;flex-wrap:wrap;align-items:center')}>
          <span style={css(`font:400 10px ${M};color:color-mix(in srgb, var(--nv-ink) 38%, transparent);flex:1;min-width:200px;line-height:1.5`)}>
            {verdict.basis}{verdict.asOf ? ` · as of ${verdict.asOf}` : ''}
            {verdict.caveats?.length ? ` · ${verdict.caveats.join(' ')}` : ''}
          </span>
          {onSpeak && !verdict.insufficient && (
            <Interactive as="span" onClick={() => onSpeak(verdict.verdict)}
              base={css(`cursor:pointer;flex:none;font:600 10px ${M};letter-spacing:.1em;padding:8px 14px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent);color:var(--nv-cy)`)}
              hoverStyle="background:color-mix(in srgb, var(--nv-cy) 12%, transparent)">▶ SPEAK IT</Interactive>
          )}
        </div>
      </div>
    </div>
  );
}
