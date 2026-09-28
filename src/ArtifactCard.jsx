import { useEffect, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { Meta } from './Controls.jsx';
import { api, getConnection } from './api.js';
import {
  agentOf, KIND_LABEL, relativeDate, wordsLabel, artifactMeta, rememberArtifacts, markArtifactMissing,
  onArtifactMeta, openArtifact, pendingTitle, onPendingTitles,
} from './artifactClient.js';
import './documents.css';

// A DOCUMENT IN A CHAT BUBBLE (28 Sep 2026). His ask: "if I were to use
// Claude directly it would provide me with a document or artefact that I can
// open up instead to view." So when Coach, Nova or the Leader write one, the
// bubble carries this card where the document sits in the reply, and the
// whole card opens it.
//
// The card is glass with a bright top edge, and the agent's hue is its only
// colour — it says WHO wrote it (src/artifactClient.js AGENT, the hues the
// Agent World already gave each being). The cover tile carries the kind: a
// page for a document, a page with controls for something he can play with.
// The title is the serif news face; the summary two lines; the date and the
// length as Meta. It rises once when it arrives (transform and opacity, the
// house popIn), and the press dips it like every other surface in Nova.

const UI = 'var(--nv-font-ui)';
const SERIF = 'var(--nv-font-serif)';

/** The kind, drawn: a page with lines, or a page with two sliders on it. */
export function KindGlyph({ kind, size = 20, color = 'currentColor', strokeWidth = 1.6 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false', style: { display: 'block', flex: 'none' } };
  if (kind === 'html') {
    return (
      <svg {...common}>
        <rect x="4" y="3.5" width="16" height="17" rx="3.2" />
        <path d="M8 9.5h8M8 14.5h8" />
        <circle cx="13.5" cy="9.5" r="1.7" fill={color} stroke="none" />
        <circle cx="10" cy="14.5" r="1.7" fill={color} stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6.5 3.5h7.6L18 7.4v13.1H6.5Z" />
      <path d="M13.6 3.5v4.4H18" />
      <path d="M9.2 12h5.8M9.2 15.4h5.8M9.2 8.6h2.4" />
    </svg>
  );
}

/**
 * The cover: a small slab of the agent's hue with the kind on it. Used by the
 * chat card, every row of the Documents list and (large) the pinned covers,
 * so a document looks like itself wherever he meets it.
 */
export function CoverTile({ agent, kind, w = 44, h = 56, glyph = 20, style }) {
  const hue = agentOf(agent).hue;
  return (
    <span className="nv-doc-tile" aria-hidden="true" style={{
      position: 'relative', flex: 'none', width: w, height: h, borderRadius: Math.round(Math.min(w, h) * 0.2),
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: hue,
      background: `linear-gradient(160deg, color-mix(in srgb, ${hue} 30%, var(--nv-void)), color-mix(in srgb, ${hue} 9%, var(--nv-void)))`,
      boxShadow: `inset 0 1px 0 color-mix(in srgb, ${hue} 55%, transparent), inset 0 0 0 1px color-mix(in srgb, ${hue} 28%, transparent), 0 10px 22px -14px color-mix(in srgb, ${hue} 80%, transparent)`,
      ...(style || {}),
    }}>
      <KindGlyph kind={kind} size={glyph} />
    </span>
  );
}

/**
 * A document's meta by id: from the cache the job result filled, else fetched
 * once. `missing` when the server says it is gone (a 404), `null` while it is
 * still coming.
 */
function useArtifactMeta(id) {
  const [meta, setMeta] = useState(() => artifactMeta(id));
  useEffect(() => {
    const sync = () => setMeta(artifactMeta(id));
    const off = onArtifactMeta(sync);
    sync();
    if (!artifactMeta(id)) {
      const conn = getConnection();
      if (conn) {
        api.artifact(conn, id)
          .then((doc) => rememberArtifacts([doc]))
          .catch((e) => { if (e?.status === 404) markArtifactMissing(id); });
      }
    }
    return off;
  }, [id]);
  return meta;
}

const shell = (hue, extra) => ({
  position: 'relative', display: 'flex', alignItems: 'center', gap: '13px',
  width: '100%', maxWidth: '460px', minHeight: '44px', boxSizing: 'border-box',
  margin: '10px 0 4px', padding: '12px 14px 12px 12px', borderRadius: 'calc(var(--nv-radius) + 4px)',
  textAlign: 'left', color: 'var(--nv-ink)', cursor: 'pointer',
  background: `linear-gradient(180deg, color-mix(in srgb, ${hue} 9%, var(--nv-glass2)), color-mix(in srgb, ${hue} 3%, var(--nv-glass)))`,
  border: `1px solid color-mix(in srgb, ${hue} 26%, transparent)`,
  // the bright top edge is light catching the material; the bloom under it
  // is the agent's hue, so the card is lit by whoever wrote it
  boxShadow: `inset 0 1px 0 var(--nv-spec), 0 16px 34px -24px color-mix(in srgb, ${hue} 70%, transparent)`,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
  whiteSpace: 'normal',
  // backwards, not both: a filled end state would hold the transform and
  // swallow the press dip Interactive gives every surface
  animation: 'popIn var(--nv-dur-base) var(--nv-ease) backwards',
  ...extra,
});

/** The card itself. Needs only the id; everything else it finds. */
export function ArtifactCard({ id }) {
  const meta = useArtifactMeta(id);
  if (meta?.missing) {
    return (
      <span role="note" style={{ ...shell('var(--nv-ink40)', { cursor: 'default', animation: 'none' }), display: 'flex' }}>
        <CoverTile agent="nova" kind="doc" style={{ opacity: 0.45, filter: 'grayscale(1)' }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', font: `400 17px/1.25 ${SERIF}`, color: 'var(--nv-ink60)' }}>This document was moved or deleted</span>
          <Meta tone="faint" style={{ display: 'block', marginTop: '4px' }}>It may be in the trash on your Mac.</Meta>
        </span>
      </span>
    );
  }
  const agent = agentOf(meta?.agent);
  const kind = meta?.kind === 'html' ? 'html' : 'doc';
  const title = meta?.title || 'Opening the document…';
  const when = meta?.created ? relativeDate(meta.created) : '';
  const bits = [when, kind === 'doc' ? wordsLabel(meta?.words) : ''].filter(Boolean); // the eyebrow already names the kind
  return (
    <Interactive as="span" onClick={() => openArtifact(id)} haptic="tick"
      aria-label={`Open ${kind === 'html' ? 'interactive page' : 'document'}: ${title}`}
      base={{ ...shell(agent.hue), '--nv-doc-hue': agent.hue }}>
      <CoverTile agent={agent.key} kind={kind} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', font: `600 11.5px ${UI}`, letterSpacing: '.02em', color: agent.hue }}>
          {agent.name}<span style={{ color: 'var(--nv-ink40)' }}>·</span><span style={{ color: 'var(--nv-ink50)' }}>{KIND_LABEL[kind]}</span>
        </span>
        <span style={{ display: 'block', marginTop: '3px', font: `400 19px/1.2 ${SERIF}`, letterSpacing: '-.005em', color: 'var(--nv-ink)', textWrap: 'balance', overflowWrap: 'anywhere' }}>{title}</span>
        {meta?.summary ? (
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: '4px', font: `400 13.5px/1.4 ${UI}`, color: 'var(--nv-ink60)' }}>{meta.summary}</span>
        ) : null}
        {bits.length ? <Meta tone="faint" style={{ display: 'block', marginTop: '6px' }}>{bits.join(' · ')}</Meta> : null}
      </span>
      <svg width="9" height="15" viewBox="0 0 9 15" aria-hidden="true" style={{ flex: 'none', color: 'var(--nv-ink40)' }}>
        <path d="M1.5 1.5 7.5 7.5 1.5 13.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Interactive>
  );
}

/**
 * A document being written. Its body never streams into the bubble; this
 * stands where it will sit — the title as soon as the header names it, a
 * light passing over, the lines of a page being drafted. `index` is its place
 * among the documents in this reply, so two in one answer keep their names.
 */
export function ArtifactPending({ index = 0, title: given = '' }) {
  const [, tick] = useState(0);
  useEffect(() => onPendingTitles(() => tick((n) => n + 1)), []);
  const title = given || pendingTitle(index);
  const hue = 'var(--nv-cy)';
  return (
    <span role="status" aria-live="polite" aria-label={title ? `Writing a document: ${title}` : 'Writing a document'}
      style={{ ...shell(hue, { cursor: 'default', overflow: 'hidden' }), display: 'flex', '--nv-doc-hue': hue }}>
      <span className="nv-doc-sweep" />
      <CoverTile agent="nova" kind="doc" />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', font: `600 11.5px ${UI}`, letterSpacing: '.02em', color: hue }}>Writing a document</span>
        <span style={{ display: 'block', marginTop: '3px', font: `400 19px/1.2 ${SERIF}`, color: title ? 'var(--nv-ink)' : 'var(--nv-ink50)', overflowWrap: 'anywhere' }}>
          {title || 'Drafting'}<span className="nv-doc-caret" />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '9px' }} aria-hidden="true">
          <span className="nv-doc-line" style={{ width: '92%' }} />
          <span className="nv-doc-line" style={{ width: '68%', animationDelay: '.35s' }} />
        </span>
      </span>
    </span>
  );
}
