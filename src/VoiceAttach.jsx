import { Chip, Meta, TextAction } from './Controls.jsx';

// WHAT THE CONVERSATION IS ABOUT (1 Nov 2026). A quiet line at the top of the
// Voice conversation while a project is attached ("Talking about Room
// redesign ×") or being set up by voice ("Setting up New project ×"). The ×
// lets it go: detached, every ask is an ordinary Nova ask again; a setup is
// called off and its pending card withdrawn. One component for the phone
// thread, the Mac page and the classic Voice screen (v.voiceAttach).
export function VoiceAttach({ a, where = 'mob' }) {
  if (!a) return null;
  return (
    <div className={`nv-vattach ${where}`} role="status" aria-live="polite">
      <Meta>{a.intake ? 'Setting up' : 'Talking about'}</Meta>
      <Chip onClick={a.detach} ariaLabel={a.intake ? 'Call off the new project' : `Stop talking about ${a.name}`}
        title={a.intake ? 'Call it off; nothing is made' : 'Detach: Nova answers as usual'}>
        <span className="nm">{a.name}</span><span aria-hidden="true" className="x">×</span>
      </Chip>
      {a.open && <TextAction onClick={a.open}>Open</TextAction>}
    </div>
  );
}
