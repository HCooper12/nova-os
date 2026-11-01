import { Interactive } from './Interactive.jsx';
import { Ico } from './InboxSumIcons.jsx';

// ✓ · Talk about it · ✕ — the card's, and the report sheet's (on the parent)
export function Verbs({ verbs, busy, tight, talkOn }) {
  if (!verbs) return null;
  const { yes, talk, no } = verbs;
  return (
    <div className={`nv-sum-ib-answer${tight ? ' tight' : ''}`}>
      {yes && (
        // a tick that waits on another card is shown, named and not pressable
        <Interactive as="button" className="nv-sum-ib-yes" onClick={busy || yes.disabled ? undefined : yes.run} aria-label={yes.aria} aria-disabled={yes.disabled ? 'true' : undefined}
          haptic={yes.disabled ? undefined : 'commit'} base={{ cursor: yes.disabled ? 'default' : 'pointer' }}>
          {!yes.disabled && <Ico name="check" />}<span className="lbl">{busy ? 'Working…' : yes.label}</span>
        </Interactive>
      )}
      {talk && (
        // beside a long "Waiting on Upper C" the label is one word, so it is never cut (375 px)
        <Interactive as="button" className={`nv-sum-ib-talk${talkOn ? ' on' : ''}`} onClick={talk.run} haptic="tick" base={{ cursor: 'pointer' }} data-grow={talk.grow || undefined}
          aria-label={talk.label}>
          {!talk.open && !talk.plain && <Ico name="talk" />}{yes?.disabled && talk.label === 'Talk about it' ? 'Talk' : talk.label}{talk.open && <Ico name="right" />}
        </Interactive>
      )}
      <Interactive as="button" className="nv-sum-ib-no" onClick={busy ? undefined : no.run} aria-label={no.label} title={no.label} haptic="tick" base={{ cursor: 'pointer' }}>
        <Ico name="x" />
      </Interactive>
    </div>
  );
}
