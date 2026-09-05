import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// THE CONFIRM STEP for a Coach plan change — his rule, verbatim: "it should
// always confirm this if I press the button and give me an opportunity to
// type to nova to tell it more information". Nothing touches the plan until
// CONFIRM; typing a note routes the change through Coach instead of the
// one-tap deterministic apply, and his words win over the proposal.
const M = 'var(--nv-font-mono)';

export function CoachApplySheet({ c }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm the Coach's change" onClick={c.busy ? undefined : c.cancel}
      style={css('position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(8,5,12,.7);backdrop-filter:blur(6px);padding:20px')}>
      <div onClick={(e) => e.stopPropagation()}
        style={css('width:520px;max-width:94vw;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);border-radius:16px;background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95);padding:20px 22px;animation:fadeUp .25s ease-out')}>
        <div style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track-wide);color:var(--nv-gold)`)}>◆ COACH · CONFIRM THE CHANGE</div>
        <div style={css('margin-top:10px;font-size:13.5px;line-height:1.55')}>{c.proposal}</div>
        <div style={css('margin-top:8px;font-size:12px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)')}>{c.changeLine} It shows as a ◆ COACH highlight in your plan, and undo lives in your Inbox.</div>
        <textarea
          value={c.note}
          onChange={c.setNote}
          disabled={c.busy}
          placeholder='Tell Nova more — optional. e.g. "add the new exercise but don’t take the old one out"'
          style={css('margin-top:12px;width:100%;box-sizing:border-box;height:64px;resize:vertical;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);line-height:1.5;outline:none')}
        />
        {c.note.trim() && (
          <div style={css('margin-top:6px;font-size:11px;color:var(--nv-cy)')}>With a note, Coach reads your words and shapes the change around them — your instruction wins.</div>
        )}
        <div style={css('margin-top:14px;display:flex;gap:10px;justify-content:flex-end')}>
          <Interactive as="span" onClick={c.busy ? undefined : c.cancel}
            base={`cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:10px 16px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 60%, transparent);opacity:${c.busy ? 0.5 : 1}`}
            hoverStyle="background:rgba(255,255,255,.05)">CANCEL</Interactive>
          <Interactive as="span" onClick={c.busy ? undefined : c.confirm}
            base={{ cursor: c.busy ? 'default' : 'pointer', font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', padding: '10px 20px', borderRadius: '9px', background: 'var(--nv-gold)', color: '#1a1322', opacity: c.busy ? 0.6 : 1 }}
            hoverStyle={{ filter: 'brightness(1.08)' }}>{c.busy ? 'APPLYING…' : 'CONFIRM'}</Interactive>
        </div>
      </div>
    </div>
  );
}
