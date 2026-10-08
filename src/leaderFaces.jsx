import { agentHue } from './leaderAgents.js';

// THE FACES ON THE LEADER'S PAGE — one species (a helmet, a screen, two ear
// pods), one feature and one artefact each, as mockup 67 drew them and
// mockup 82 (Blend 1) uses them. The Leader is beings.js's: a mirror for a
// face, soft eyes lit through it, the listening ear lit, and the question it
// holds as its artefact. The Researcher a lens and a brief; the Librarian
// three spines and a page. Anyone else the Leader asks wears the plain body
// in its own hue (glassMarks.FINDERS), so a consult is never faceless.

const TICK = <g className="tick"><circle cx="40" cy="8" r="7.5" /><path d="M36.4 8.2l2.4 2.4 4.6-4.8" /></g>;
const BADGE = <circle className="badge" cx="40" cy="40" r="8.5" />;
const BODY = (
  <>
    <circle className="pod" cx="5" cy="24" r="3.4" /><circle className="pod" cx="43" cy="24" r="3.4" />
    <rect className="shell" x="5" y="6" width="38" height="35" rx="15" /><rect className="scr" x="10" y="13" width="28" height="21" rx="9" />
  </>
);

const FACE = {
  leader: (
    <>
      <circle className="pod" cx="5" cy="24" r="3.4" /><circle className="ear" cx="43" cy="24" r="3.9" />
      <rect className="shell" x="5" y="6" width="38" height="35" rx="15" /><rect className="fs" x="10" y="13" width="28" height="21" rx="9" />
      <path className="sheen" d="M12.5 17q5-4 13-3.4L16 31q-4.6-5.2-3.5-14z" />
      <ellipse className="soft" cx="19" cy="23.8" rx="4.6" ry="5" /><ellipse className="soft" cx="29" cy="23.8" rx="4.6" ry="5" />
      <ellipse className="eye" cx="19" cy="23.8" rx="2.3" ry="2.9" /><ellipse className="eye" cx="29" cy="23.8" rx="2.3" ry="2.9" />
      {BADGE}<circle className="ripple" cx="40" cy="40" r="8.5" />
      <path className="art" d="M37.7 37.6a2.5 2.5 0 1 1 3.3 2.4c-.6.3-1 .8-1 1.4" /><circle className="dot" cx="40" cy="44.3" r="1.05" />
      {TICK}
    </>
  ),
  researcher: (
    <>
      {BODY}
      <path className="line" d="M17.6 15.6q6.4-2.6 12.8 0" /><circle className="lens" cx="24" cy="23.6" r="6.6" /><circle className="eye" cx="24" cy="23.6" r="3.3" />
      <circle cx="22.6" cy="22.2" r="1" fill="#fff" opacity=".85" />
      {BADGE}<path className="art" d="M36.6 35.4h4.6l2.6 2.6v6.6h-7.2zM38.6 39.6h3.2M38.6 41.9h3.2" />
      {TICK}
    </>
  ),
  librarian: (
    <>
      <rect className="spine" x="14" y="2.4" width="5.4" height="8" rx="1.2" /><rect className="spine" x="20.4" y=".8" width="5.4" height="9.6" rx="1.2" /><rect className="spine" x="26.8" y="2" width="5.4" height="8.4" rx="1.2" />
      {BODY}
      <path className="line" d="M15.8 19.6q3.2-1.8 6.4 0M25.8 19.6q3.2-1.8 6.4 0" /><circle className="eye" cx="19" cy="24.2" r="2.8" /><circle className="eye" cx="29" cy="24.2" r="2.8" />
      <path className="line" d="M21.8 29.2q2.2 1.6 4.4 0" />
      {BADGE}<path className="art" d="M35 36.6h10v7H35zM37.2 39.2h5.6M37.2 41.4h3.4" />
      {TICK}
    </>
  ),
  plain: (
    <>
      {BODY}
      <circle className="eye" cx="19" cy="24" r="2.6" /><circle className="eye" cx="29" cy="24" r="2.6" />
      {BADGE}<circle className="dot" cx="40" cy="40" r="2.4" />
      {TICK}
    </>
  ),
};


export function Face({ who = 'leader', size = 28, work = false, back = false, className = '', style }) {
  const shape = FACE[who] || FACE.plain;
  return (
    <span className={`nv-ld-face${work ? ' work' : ''}${back ? ' back' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--s': `${size}px`, '--h': agentHue(who), ...style }} aria-hidden="true">
      <svg viewBox="0 0 48 48">{shape}</svg>
    </span>
  );
}

const P = {
  back: <path d="M15 5l-7 7 7 7" />,
  more: <><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>,
  chev: <path d="M9 5l7 7-7 7" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  up: <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  q: <><path d="M9.2 9.3a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.7v.6" /><path d="M12 17.6v.2" /></>,
  knot: <path d="M2.5 15.5c5 0 6.5-8.5 10.5-8.5 2.8 0 3.8 3 1.8 4.8s-6 .2-5.8-2.8M13.4 12.3c2 2.2 4.8 3.2 8.1 3.2" />,
  book: <path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9.5" />,
  flask: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />,
  fresh: <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5" />,
};

export function Ico({ k, className = '' }) {
  return <svg className={`i${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true">{P[k]}</svg>;
}
