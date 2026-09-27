import { Interactive } from './Interactive.jsx';
import { Ico } from './InboxSumIcons.jsx';

// ✓ · Talk about it · ✕ — the card's, and the report sheet's (on the parent)
export function Verbs({ verbs, busy, tight, talkOn }) {
  if (!verbs) return null;
  const { yes, talk, no } = verbs;
  return (
    <div className={`nv-sum-ib-answer${tight ? ' tight' : ''}`}>
      {yes && (
        <Interactive as="button" className="nv-sum-ib-yes" onClick={busy ? undefined : yes.run} aria-label={yes.aria} haptic="commit" base={{ cursor: 'pointer' }}>
          <Ico name="check" /><span className="lbl">{busy ? 'Working…' : yes.label}</span>
        </Interactive>
      )}
      {talk && (
        <Interactive as="button" className={`nv-sum-ib-talk${talkOn ? ' on' : ''}`} onClick={talk.run} haptic="tick" base={{ cursor: 'pointer' }}>
          {!talk.open && !talk.plain && <Ico name="talk" />}{talk.label}{talk.open && <Ico name="right" />}
        </Interactive>
      )}
      <Interactive as="button" className="nv-sum-ib-no" onClick={busy ? undefined : no.run} aria-label={no.label} title={no.label} haptic="tick" base={{ cursor: 'pointer' }}>
        <Ico name="x" />
      </Interactive>
    </div>
  );
}
