import { useEffect, useRef, useState } from 'react';
import { Chip, Meta, Button, Rail } from './Controls.jsx';
import { Interactive } from './Interactive.jsx';
import { ChatMarkdown } from './ChatMarkdown.jsx';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { SkeletonBar } from './Skeleton.jsx';
import { CoverTile, KindGlyph } from './ArtifactCard.jsx';
import { docSegments } from './artifactBlocks.js';
import { enrichBody } from './glassBeats.js';
import { api, getConnection } from './api.js';
import { agentOf, KIND_LABEL, longDate, wordsLabel, readLabel, rememberArtifacts, markArtifactMissing, obsidianUrl } from './artifactClient.js';
import './documents.css';

// THE VIEWER (28 Sep 2026) — a document, opened. His ask was the thing Claude
// gives him and Nova did not: "a document or artefact that I can open up
// instead to view", presented "with the glass panel design philosophy" and
// "the Apple-like aesthetic approach".
//
// So this is an Apple document page: a large serif title, a meta row (who ·
// when · what · how long), the summary as a lede, then the body. A document
// ('doc') is markdown drawn natively — its ```nova panels rise as the same
// glass panels the Voice screen draws (StageCard, behind SafeVisual so a panel
// that cannot draw leaves the words standing). An interactive page ('html')
// runs in a sandboxed frame WITHOUT allow-same-origin: it gets an opaque
// origin, so it can never read Nova's localStorage, and with it the token.
//
// It is a page of its own: a history entry (App.openArtifact), the root marked
// data-edge-page so the back swipe slides it off like an iOS detail page, and
// Back / Escape both go back through history rather than around it.
//
// Every action is a Controls.jsx chip. Delete is a move to the trash with an
// Undo on the island; nothing here writes except through App.

const UI = 'var(--nv-font-ui)';
const SERIF = 'var(--nv-font-serif)';
const MONO = 'var(--nv-font-mono)';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// A ```nova panel in a document is the SAME spec the glass draws. A few kinds
// need what only a live reply has (a fetched image, his routine); those are
// drawn as the words they carry rather than vanishing.
function panelCard(spec) {
  if (!spec) return null;
  if (spec.kind === 'bars') {
    const max = Math.max(...spec.bars.map((b) => Math.abs(b.value)), 1);
    return { ...spec, bars: spec.bars.map((b) => ({ ...b, name: `${b.name} · ${b.value}`, pct: Math.max(3, Math.round((Math.abs(b.value) / max) * 100)) })) };
  }
  if (spec.kind === 'steps') return { ...spec, decide: false, revealed: spec.items.length };
  if (spec.kind === 'body') return enrichBody(spec);
  if (spec.kind === 'image') return spec.caption || spec.query ? { kind: 'key', label: spec.label, caption: spec.caption || spec.query } : null;
  if (spec.kind === 'media') return spec.title || spec.caption ? { kind: 'key', label: spec.label || 'LISTEN', caption: [spec.title, spec.moment].filter(Boolean).join(' · ') || spec.caption } : null;
  if (spec.kind === 'program') return spec.routine ? { kind: 'list', label: spec.label || spec.routine.toUpperCase(), items: [...(spec.remove || []).map((n) => ({ name: n, note: 'drop' })), ...(spec.keep || []).map((n) => ({ name: n, note: 'keep' }))] } : null;
  return spec;
}

// A model's document usually opens with its own title as a heading; the page
// already set it large above, so a first heading that says the same thing is
// dropped rather than printed twice.
const fold = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function withoutTitle(body, title) {
  const m = /^\s*#\s+(.+?)\s*(\n|$)/.exec(body);
  return m && fold(m[1]) === fold(title) ? body.slice(m[0].length) : body;
}

function Glyph({ d, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>{d}</svg>
  );
}
const G = {
  pin: <path d="M15.5 3.5 20.5 8.5 17 10l-3.2 3.2.4 4.3-1.5 1.5-4-4-4.2 4.2-1.1-1.1 4.2-4.2-4-4 1.5-1.5 4.3.4L14 5.5Z" />,
  ask: <><path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5Z" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.4" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  share: <><path d="M12 15V4M8 7.5 12 3.5l4 4" /><path d="M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1" /></>,
  vault: <><path d="M4.5 7.5A1.5 1.5 0 0 1 6 6h4l2 2h6a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18Z" /></>,
  trash: <><path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7" /><path d="M6.5 7l.9 11.2A1.5 1.5 0 0 0 8.9 19.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7" /></>,
};

function copy(text) {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch { /* fall through */ }
  return Promise.resolve(false);
}

export function ArtifactViewer({ d }) {
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState(() => (getConnection() ? 'loading' : 'offline'));
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const closing = useRef(false);

  useEffect(() => {
    const conn = getConnection();
    if (!conn) return undefined;
    let live = true;
    api.artifact(conn, d.id)
      .then((full) => { if (!live) return; setDoc(full); setStatus('ready'); rememberArtifacts([full]); })
      .catch((e) => {
        if (!live) return;
        if (e?.status === 404) { setStatus('missing'); markArtifactMissing(d.id); } else { setStatus('error'); setError(e?.message || 'it could not be read'); }
      });
    return () => { live = false; };
  }, [d.id]);

  // Back, ✕ and Escape leave the way the swipe does: the page slides down and
  // goes, then history closes it — never a hard cut
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = panelRef.current;
    if (!el || reduced() || !el.animate) { d.close(); return; }
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(24px)' }], { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
      .finished.catch(() => {}).then(() => d.close());
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bound each render so it closes over the current handler

  const meta = doc || d.meta || null;
  const agent = agentOf(meta?.agent);
  const kind = meta?.kind === 'html' ? 'html' : 'doc';
  const body = typeof doc?.body === 'string' ? doc.body : '';
  const mob = d.mobile;
  const pinned = !!meta?.pinned;
  const [pinShown, setPinShown] = useState(null);
  const isPinned = pinShown ?? pinned;
  const vaultLink = obsidianUrl(meta);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const onPin = () => {
    if (!meta) return;
    const next = !isPinned;
    setPinShown(next);
    Promise.resolve(d.pin(meta, next)).then((m) => { if (!m) setPinShown(!next); else if (doc) setDoc({ ...doc, pinned: !!m.pinned }); });
  };
  const onCopy = () => copy(body || meta?.summary || '').then((ok) => d.toast(ok ? (kind === 'html' ? 'Page source copied' : 'Copied the text') : 'Copy is not available here'));
  const onCopyPath = () => copy(meta?.path || '').then((ok) => d.toast(ok ? 'Vault path copied' : 'Copy is not available here'));
  const onShare = () => {
    if (!meta) return;
    const title = meta.title || 'Document';
    let payload = { title, text: kind === 'html' ? (meta.summary || title) : `${title}\n\n${body}` };
    if (kind === 'html' && typeof File === 'function') {
      try {
        const file = new File([body], `${title.replace(/[^\w\s-]/g, '').trim() || 'page'}.html`, { type: 'text/html' });
        if (navigator.canShare?.({ files: [file] })) payload = { title, files: [file] };
      } catch { /* text share it is */ }
    }
    navigator.share(payload).catch(() => { /* he cancelled the sheet */ });
  };

  const metaBits = meta ? [agent.name, longDate(meta.created), KIND_LABEL[kind], kind === 'doc' ? wordsLabel(meta.words) : '', kind === 'doc' ? readLabel(meta.words) : ''].filter(Boolean) : [];

  const wrap = mob
    ? { position: 'fixed', inset: 0, zIndex: 82, background: 'var(--nv-void)', display: 'flex' }
    : { position: 'fixed', inset: 0, zIndex: 82, background: 'rgba(8,5,12,.66)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vh 24px' };
  const panel = mob
    ? { position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', background: `radial-gradient(120% 60% at 50% -10%, color-mix(in srgb, ${agent.hue} 12%, transparent), transparent 60%), var(--nv-void)`, WebkitOverflowScrolling: 'touch' }
    : { position: 'relative', width: '880px', maxWidth: '100%', height: '94vh', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', borderRadius: 'calc(var(--nv-radius) + 8px)', background: `radial-gradient(120% 50% at 50% -8%, color-mix(in srgb, ${agent.hue} 12%, transparent), transparent 60%), var(--nv-glass2)`, backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--nv-edge)', boxShadow: '0 40px 90px -30px rgba(0,0,0,.9), inset 0 1px 0 var(--nv-spec)' };
  const gutter = mob ? '20px' : '44px';

  return (
    // data-edge-page: the back swipe pops this like an iOS detail page (src/edgeBack.js)
    <div role="dialog" aria-modal="true" aria-label={meta?.title ? `Document: ${meta.title}` : 'Document'} data-edge-page="" onClick={close} style={wrap}>
      <div ref={panelRef} className="nv-doc-viewer" onClick={(e) => e.stopPropagation()} style={{ ...panel, '--nv-doc-hue': agent.hue }}>
        {/* THE BAR: Back on the left, where his thumb and iOS put it; the
            glass is on the element that owns the buttons, nothing layered */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2, flex: 'none', display: 'flex', alignItems: 'center', gap: '8px',
          padding: mob ? 'calc(6px + env(safe-area-inset-top)) 10px 6px' : '10px 16px 8px',
          background: 'color-mix(in srgb, var(--nv-void) 72%, transparent)', backdropFilter: 'blur(18px) saturate(1.3)', WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
          boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--nv-ink) 7%, transparent)',
        }}>
          <Interactive as="span" onClick={close} data-edge-close="" aria-label="Back" haptic="tick"
            base={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minHeight: '44px', padding: '0 10px 0 6px', borderRadius: '12px', cursor: 'pointer', color: 'var(--nv-acc)', font: `600 16px ${UI}` }}>
            <svg width="11" height="18" viewBox="0 0 11 18" aria-hidden="true"><path d="M9 2 2 9l7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back
          </Interactive>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'center', font: `600 14px ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta ? `${agent.name} · ${KIND_LABEL[kind]}` : ''}</span>
          <Interactive as="span" onClick={meta ? onPin : undefined} aria-label={isPinned ? 'Unpin' : 'Pin'} aria-pressed={isPinned} haptic="tick"
            base={{ width: '44px', height: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', cursor: meta ? 'pointer' : 'default', color: isPinned ? agent.hue : 'var(--nv-ink50)', opacity: meta ? 1 : 0.4 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">{G.pin}</svg>
          </Interactive>
        </div>

        {status === 'missing' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `40px ${gutter}` }}>
            <CoverTile agent="nova" kind="doc" w={64} h={82} glyph={28} style={{ opacity: 0.5, filter: 'grayscale(1)' }} />
            <div style={{ marginTop: '18px', font: `400 26px/1.2 ${SERIF}`, color: 'var(--nv-ink)' }}>This document was moved or deleted</div>
            <div style={{ marginTop: '8px', maxWidth: '34ch', font: `400 15px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>If you deleted it, it is in the trash in your vault. Nothing else was touched.</div>
            <div style={{ marginTop: '18px' }}><Button onClick={close} variant="quiet">Back</Button></div>
          </div>
        ) : (
          <>
            {/* THE HEAD: who and what, the title, the lede */}
            <header style={{ flex: 'none', padding: `${mob ? 18 : 26}px ${gutter} 0`, maxWidth: '760px', width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
              {meta ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CoverTile agent={agent.key} kind={kind} w={34} h={42} glyph={16} />
                    <span style={{ font: `600 13px ${UI}`, letterSpacing: '.02em', color: agent.hue }}>{agent.name}<span style={{ color: 'var(--nv-ink50)', fontWeight: 500 }}> wrote this</span></span>
                  </div>
                  <h1 style={{ margin: '14px 0 0', font: `400 ${mob ? 34 : 44}px/1.08 ${SERIF}`, letterSpacing: '-.018em', color: 'var(--nv-ink)', textWrap: 'balance', overflowWrap: 'anywhere' }}>{meta.title || 'Untitled document'}</h1>
                  <Meta tone="quiet" style={{ display: 'block', marginTop: '10px', lineHeight: 1.5 }}>{metaBits.join(' · ')}</Meta>
                  {meta.summary ? <p style={{ margin: '16px 0 0', font: `400 ${mob ? 18 : 19.5}px/1.5 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 76%, transparent)', textWrap: 'pretty' }}>{meta.summary}</p> : null}
                  {meta.question ? (
                    <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <span aria-hidden="true" style={{ flex: 'none', width: '3px', alignSelf: 'stretch', borderRadius: '2px', background: `color-mix(in srgb, ${agent.hue} 55%, transparent)` }} />
                      <Meta tone="faint" style={{ lineHeight: 1.45 }}>You asked: “{meta.question}”</Meta>
                    </div>
                  ) : null}
                </>
              ) : (
                <div aria-label="Loading the document" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <SkeletonBar w="30%" h="13px" />
                  <SkeletonBar w="86%" h="34px" radius="9px" />
                  <SkeletonBar w="58%" h="34px" radius="9px" />
                  <SkeletonBar w="44%" h="12px" />
                </div>
              )}

              {/* THE ACTIONS, one rail of chips — Delete last, in the warning hue */}
              {meta ? (
                <Rail ariaLabel="Document actions" gap="8px" style={{ marginTop: '18px', padding: '2px 0 4px' }}>
                  <Chip onClick={() => d.ask(meta)} tone={agent.hue} active style={{ flex: 'none' }}><Glyph d={G.ask} />Ask about this</Chip>
                  <Chip onClick={onPin} tone={agent.hue} style={{ flex: 'none' }}><Glyph d={G.pin} />{isPinned ? 'Unpin' : 'Pin'}</Chip>
                  <Chip onClick={onCopy} tone="quiet" disabled={status !== 'ready'} style={{ flex: 'none' }}><Glyph d={G.copy} />{kind === 'html' ? 'Copy source' : 'Copy text'}</Chip>
                  {canShare ? <Chip onClick={onShare} tone="quiet" disabled={status !== 'ready'} style={{ flex: 'none' }}><Glyph d={G.share} />Share</Chip> : null}
                  {vaultLink
                    ? <Chip onClick={() => { window.location.href = vaultLink; }} tone="quiet" style={{ flex: 'none' }}><Glyph d={G.vault} />Open in Obsidian</Chip>
                    : meta.path ? <Chip onClick={onCopyPath} tone="quiet" style={{ flex: 'none' }}><Glyph d={G.vault} />Copy vault path</Chip> : null}
                  <Chip onClick={() => d.trash(meta)} tone="warn" style={{ flex: 'none' }}><Glyph d={G.trash} />Delete</Chip>
                </Rail>
              ) : null}
            </header>

            {/* THE BODY */}
            {status === 'loading' && (
              <div style={{ padding: `26px ${gutter}`, maxWidth: '760px', width: '100%', boxSizing: 'border-box', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '11px' }}>
                {[92, 100, 84, 96, 70, 0, 88, 94, 60].map((w, i) => (w ? <SkeletonBar key={i} w={`${w}%`} h="14px" /> : <span key={i} style={{ height: '10px' }} />))}
              </div>
            )}
            {(status === 'error' || status === 'offline') && (
              <div style={{ padding: `26px ${gutter}`, maxWidth: '760px', width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
                <div className="nv-pane" style={{ padding: '16px 18px' }}>
                  <div style={{ font: `400 20px/1.25 ${SERIF}`, color: 'var(--nv-ink)' }}>{status === 'offline' ? 'Not connected to your Mac' : "Couldn't open it"}</div>
                  <div style={{ marginTop: '6px', font: `400 14.5px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>
                    {status === 'offline' ? 'The document lives in your vault. Connect Nova in Settings to read it here.' : `${String(error || '').replace(/[.\s]*$/, '')}. The file is safe in your vault.`}
                  </div>
                </div>
              </div>
            )}
            {status === 'ready' && kind === 'doc' && (
              <article style={{ padding: `22px ${gutter} ${mob ? 'calc(40px + env(safe-area-inset-bottom))' : '48px'}`, maxWidth: '760px', width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
                <div aria-hidden="true" style={{ height: '1px', margin: '0 0 22px', background: `linear-gradient(90deg, color-mix(in srgb, ${agent.hue} 50%, transparent), transparent 70%)` }} />
                {docSegments(withoutTitle(body, meta?.title)).map((seg, i) => {
                  if (seg.type === 'md') return <ChatMarkdown key={i} text={seg.text} variant="doc" />;
                  const card = panelCard(seg.spec);
                  if (!card) return null;
                  return (
                    <SafeVisual key={i} what={`document panel ${seg.spec.kind}`} resetKey={`${d.id}:${i}`}>
                      <div style={{ margin: '6px 0 24px' }}><StageCard card={card} /></div>
                    </SafeVisual>
                  );
                })}
                {meta?.path ? (
                  <div style={{ marginTop: '30px', paddingTop: '14px', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 8%, transparent)', display: 'flex', gap: '8px', alignItems: 'flex-start', color: 'var(--nv-ink50)' }}>
                    <Glyph d={G.vault} size={14} />
                    <span style={{ minWidth: 0, font: `400 12px/1.5 ${MONO}`, overflowWrap: 'anywhere' }}>{meta.path}</span>
                  </div>
                ) : null}
              </article>
            )}
            {status === 'ready' && kind === 'html' && (
              <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', padding: `18px ${mob ? '12px' : gutter} ${mob ? 'calc(12px + env(safe-area-inset-bottom))' : '24px'}` }}>
                <div style={{ height: mob ? '76dvh' : 'max(480px, 68vh)', display: 'flex', borderRadius: '16px', overflow: 'hidden', background: '#fff', boxShadow: `0 0 0 1px color-mix(in srgb, ${agent.hue} 30%, transparent), 0 22px 44px -26px color-mix(in srgb, ${agent.hue} 70%, transparent)` }}>
                  {/* no allow-same-origin: an opaque origin, so the page can
                      never read Nova's storage (and the token in it) */}
                  <iframe title={meta?.title || 'Interactive page'} sandbox="allow-scripts allow-forms" srcDoc={body} referrerPolicy="no-referrer"
                    style={{ flex: 1, width: '100%', height: '100%', border: 'none', background: '#fff', display: 'block' }} />
                </div>
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', color: 'var(--nv-ink50)' }}>
                  <KindGlyph kind="html" size={14} />
                  <Meta tone="faint">Runs on its own, sealed off from the rest of Nova</Meta>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
