import { CountUp } from './CountUp.jsx';
import { MediaImg } from './MediaImg.jsx';

// THE STAGE'S PANEL FORMS (mockup 114, round two). Drawn only on the Mac
// stage, from the view model src/stageFormFacts.js builds out of each card's
// own data; a card without the data for a form never reaches here (the plain
// StageCard draws it). Numbers count up as they arrive, rings close, bars
// rise and lines draw, all from CSS on the slot's arrival (novaMac.css), so
// nothing animates on a timer and reduced motion simply shows the end state.

const decimals = (s) => (String(s).split('.')[1] || '').length;
const Num = ({ value }) => {
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return <>{value}</>;
  const d = decimals(value);
  return <CountUp value={n} fromZero format={(x) => x.toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d })} />;
};
const Ic = ({ d }) => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

export function StageForm({ f, decide = null, onDiscuss = null }) {
  const body = formBody(f, decide, onDiscuss);
  return body ? <div className="nv-mac-sform" data-form={f.form}>{body}</div> : null;
}

function formBody(f, decide, onDiscuss) {
  switch (f.form) {
    case 'ring':
      return (
        <div className="ringrow">
          <svg className="ring" viewBox="0 0 100 100" aria-hidden="true"><circle className="tr" cx="50" cy="50" r="42" pathLength="100" /><circle className="fg" cx="50" cy="50" r="42" pathLength="100" style={{ '--v': f.pct }} /></svg>
          <div className="fig"><b><Num value={f.value} /><span className="u">of {f.of}</span></b>{f.small && <small>{f.small}</small>}</div>
        </div>
      );
    case 'fig':
      return (
        <>
          <div className="fig"><b><Num value={f.value} />{f.unit && <span className="u">{f.unit}</span>}</b>{f.small && <small>{f.small}</small>}</div>
          {f.spark && <svg className="trend" viewBox="0 0 280 84" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d={f.spark.d} /><circle cx={f.spark.end[0]} cy={f.spark.end[1]} r="4" /></svg>}
        </>
      );
    case 'bars':
      return (
        <>
          <div className={`bars${f.target != null ? ' tgt' : ''}`} style={f.target != null ? { '--t': `${f.target}%` } : undefined}>
            {f.rows.map((r, i) => <i key={i} className={r.low ? 'low' : undefined} style={{ '--v': `${r.pct}%`, '--i': i }} />)}
          </div>
          <div className="barl">{f.rows.map((r, i) => <span key={i}>{r.name}</span>)}</div>
          {(f.legend || f.foot) && <div className="pfoot">{f.legend || f.foot}</div>}
        </>
      );
    case 'rows':
      return <><ul className="rows">{f.items.map((it, i) => <li key={i}><i />{it.name}<span>{it.note}</span></li>)}</ul>{f.foot && <div className="pfoot">{f.foot}</div>}</>;
    case 'timeline':
      return <><ul className="tl">{f.items.map((it, i) => <li key={i} className={it.now ? 'now' : undefined}><time>{it.time}</time>{it.name}</li>)}</ul>{f.foot && <div className="pfoot">{f.foot}</div>}</>;
    case 'dots':
      return <><ul className="dots">{f.items.map((it, i) => <li key={i}>{it.name}</li>)}</ul>{f.foot && <div className="pfoot">{f.foot}</div>}</>;
    case 'agents':
      return <><ul className="drafts">{f.items.map((it, i) => <li key={i}><div><small style={{ '--c': it.hue }}>{it.who}</small>{it.name}</div></li>)}</ul>{f.foot && <div className="pfoot">{f.foot}</div>}</>;
    case 'week':
      return <div className="week">{f.days.map((d, i) => <div key={i} className={d.free ? 'free' : d.on ? 'on' : undefined}>{d.d}<b>{d.note || '·'}</b></div>)}</div>;
    case 'sources':
      return <ol className="srcs">{f.items.map((it, i) => <li key={i}>{it.name}{it.note && <span>{it.note}</span>}</li>)}</ol>;
    case 'quote':
      return <div className="quote"><div className="q">“{f.text}”</div>{f.who && <div className="w">{f.who}</div>}</div>;
    case 'page':
      return (
        <>
          <div className="pg">
            {f.image && <MediaImg className="img" src={f.image} alt="" />}
            <div><div className="t">{f.name}</div>{f.line && <div className="l">{f.line}</div>}</div>
          </div>
          {f.host && <div className="host">{f.host}</div>}
        </>
      );
    case 'video':
      return (
        <div className="vid">
          <div className="box">{f.poster && <MediaImg src={f.poster} alt="" />}<b aria-hidden="true">▶</b>{f.start && <time>{f.start}</time>}</div>
          <div className="t">{f.name}</div>
          {f.host && <div className="host">{f.host}</div>}
        </div>
      );
    case 'note':
      return <div className="pbody">{f.lines.map((l, i) => <p key={i}>{l}</p>)}</div>;
    case 'proposal': {
      // the real proposal's own actions (valsNovaThread: resolveVoiceProposal);
      // none, and the panel says what became of it
      const st = decide?.status || f.status;
      return (
        <>
          {f.body && <div className="pbody">{f.body}</div>}
          {st === 'pending' && decide?.approve ? (
            <div className="sacts">
              <button type="button" className="sact y" onClick={decide.approve} aria-label={`Yes: ${f.title}`}><Ic d="M5 12.5l4.5 4.5L19 7.5" />Yes</button>
              <button type="button" className="sact" onClick={decide.dismiss} aria-label="No"><Ic d="M6 6l12 12M18 6 6 18" />No</button>
              {onDiscuss && <button type="button" className="sact q" onClick={onDiscuss}>Discuss</button>}
            </div>
          ) : (
            <div className="pres">{st === 'done' ? 'Done on your word' : st === 'dismissed' ? 'Left as it was' : st === 'undone' ? 'Taken back' : 'Waiting in your Inbox'}</div>
          )}
        </>
      );
    }
    default:
      return null;
  }
}
