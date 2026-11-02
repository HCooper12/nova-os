import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { TabIcon } from './TabIcon.jsx';
import { Interactive } from './Interactive.jsx';
import { VoiceHalo } from './VoiceHalo.jsx';
import { NovaCore } from './NovaCore.jsx';
import { CaptureSheet } from './CaptureSheet.jsx';
import { useHoldRing } from './motion/holdToTalk.js';
import { HoldRing } from './motion/HoldRing.jsx';

// THE iOS 26 TAB BAR (P3, 26 Sep 2026 — design/HOME-REDESIGN-PLAN.md §1.4,
// drawn in every round of mockups he liked). Under the `summary` style only:
// MobileChrome renders this in place of the floating dock, and the dock's
// own markup is left exactly as it was for every other style.
//
// A glass pill of five slots — the first FOUR screens of his saved tab order
// (Settings → Tab order, the same order the Mac sidebar reads), then More,
// which is the Index — and Nova detached beside it as its own round button,
// with the dock's exact semantics: tap to talk, hold for the words.
//
// The lit tab is ONE lens that glides to the tab he picks, stretching a little
// on the way, the way the iOS 26 tab bar does (his "native transitions
// between sections", 14 Oct 2026). Only the lens moves: the icons, the labels
// and the screen's own rise are unchanged, so nothing waits on it. The press
// answers the finger through Interactive — the 2% dip, and the haptic tick,
// which on his iPhone only a real element under the finger can give.
// All of it is drawn by the `.nv-sum-dock` block in index.css.

// Interactive's default focus ring is inline and set on ANY focus, a tap
// included — and this bar never unmounts, so the tab he last tapped kept a
// ring round it on every screen after. The ring is drawn by :focus-visible in
// index.css instead, which the keyboard gets and a finger does not.
const NO_TAP_RING = {};

// THE ORB FILLS ITS CIRCLE (30 Sep, his: "fill the orb further so it takes
// up the whole circle space it currently sits in"). The circle is 60px of
// glass with a 1px specular rim inside its edge (.nv-sum-nova::after), so
// its inner diameter is 58px, measured at 375px; the core is drawn at that.
// It was 46, which left a 7px ring of empty glass. Its turn colours are
// NovaCore's own (since 5 Oct: violet listening, cyan thinking, jade
// speaking, red pushing back), and in a turn it becomes the grain body.
const ORB = 58;

// the stretch rides `scale`, the glide rides `translate` (a CSS spring in
// index.css), so the two never fight over one property
function useLensStretch(index) {
  const ref = useRef(null);
  const prev = useRef(index);
  useEffect(() => {
    const from = prev.current;
    prev.current = index;
    const el = ref.current;
    if (from === index || !el?.animate) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const far = Math.min(Math.abs(index - from), 3);
    try {
      el.animate(
        [{ scale: '1 1' }, { scale: `${1 + 0.08 * far} ${1 - 0.03 * far}`, offset: 0.35 }, { scale: '1 1' }],
        { duration: 420, easing: 'cubic-bezier(.32,.72,0,1)' },
      );
    } catch { /* motion is never a requirement */ }
  }, [index]);
  return ref;
}

// A TAB RE-RENDERS WHEN WHAT IT SHOWS CHANGES (the fluidity audit, round 3,
// 3 Nov 2026). The bar is on screen on every page and was re-rendered by every
// App commit (five tabs, five icons, five Interactives a commit, ~10 commits a
// set tick). Its handlers are now stable (SummaryDock reads the live ones
// through a ref), so a tab whose screen, label, count and lit state are the
// same is skipped.
const Tab = memo(function Tab({ screen, label, count, active, go, warm, press }) {
  return (
    <Interactive as="div" onClick={go} onPointerDown={(e) => { press?.(e); warm?.(e); }}
      onPointerCancel={press ? () => press(null) : undefined} haptic="tick"
      className={active ? 'nv-sum-tab on' : 'nv-sum-tab'}
      aria-current={active ? 'page' : undefined}
      aria-label={count != null ? `${label}, ${count}` : label}
      base={{ cursor: 'pointer' }} focusStyle={NO_TAP_RING}>
      <span className="nv-sum-tab-ico">
        <TabIcon name={screen} size={22} />
        {count != null && <span className="nv-sum-tbadge" aria-hidden="true">{count}</span>}
      </span>
      <span className="nv-sum-tab-lbl" aria-hidden="true">{label}</span>
    </Interactive>
  );
});

// FULL SCREEN HAS NO TAB BAR (his call, 4 Oct 2026). While the full-screen
// Nova is open the bar slides away, and once it is out of sight the orb is
// unmounted so its canvas stops drawing; it is back the moment he returns.
const AWAY_MS = 320;
function useAway(away) {
  const [gone, setGone] = useState(away);
  useEffect(() => {
    if (!away) { setGone(false); return undefined; }
    const id = setTimeout(() => setGone(true), AWAY_MS);
    return () => clearTimeout(id);
  }, [away]);
  return gone;
}

export function SummaryDock({ v }) {
  // the Briefing plays on the full-screen stage (round 2, 9 Oct 2026); the
  // Nova page's own stage (29 Oct) keeps the bar
  const away = !!v.briefingStage;
  const gone = useAway(away);
  // the same press ring and core bounce as the cupertino dock (holdToTalk.js);
  // this hold still opens the Nova page, so there is no panel to grow here
  const hold = useHoldRing();
  const tabs = v.tabs.slice(0, 4);
  // More is lit on the Index AND on any screen reached through it, the way an
  // iOS More tab stays selected while you are inside it — so the bar always
  // says which branch he is in (the floating dock lit its More the same way)
  const moreOn = !!v.isIndex || !tabs.some((t) => t.active);
  const capture = v.inboxSummary?.capture;
  const listening = !!(v.novaListening || v.novaThread?.micOpen);
  const litIndex = moreOn ? 4 : tabs.findIndex((t) => t.active);
  // THE LENS ANSWERS THE FINGER, NOT THE SCREEN (the fluidity audit, 2 Nov
  // 2026, finding 5): it used to move only once the new screen had committed,
  // 121-199 ms after touch end at 4x, so the one thing under his finger waited
  // for the slowest part of the switch. Now the press itself sets where the
  // lens is going (local state: only this bar re-renders, and the glide is a
  // compositor transition that keeps running while the screen renders); it
  // lets go when the screen catches up, when the touch is cancelled, or after
  // a beat if the press led nowhere.
  const [pending, setPending] = useState(null);
  useEffect(() => { setPending(null); }, [litIndex]);
  useEffect(() => {
    if (pending == null) return undefined;
    const id = setTimeout(() => setPending(null), 900);
    return () => clearTimeout(id);
  }, [pending]);
  // stable per slot, made once: each reads the live tabs at call time, so a
  // memoised Tab never holds a stale screen's go (see Tab)
  const live = useRef(null);
  live.current = { tabs, goIndex: v.goIndex };
  const slots = useMemo(() => [0, 1, 2, 3, 4].map((idx) => ({
    go: (...a) => (idx === 4 ? live.current.goIndex?.(...a) : live.current.tabs[idx]?.go?.(...a)),
    warm: (...a) => live.current.tabs[idx]?.warm?.(...a),
    press: (e) => setPending(e ? idx : null),
  })), []);
  const lensAt = pending ?? litIndex;
  const lens = useLensStretch(lensAt);
  return (
    <>
    <div className="nv-sum-dock" data-away={away ? 'true' : undefined} aria-hidden={away || undefined} inert={away}>
      <nav className="nv-sum-tabbar" aria-label="Tabs">
        <span ref={lens} className="nv-sum-lens" style={{ '--i': lensAt }} aria-hidden="true" />
        {tabs.map((t, idx) => (
          <Tab key={t.screen} screen={t.screen} label={t.label} count={t.count} active={t.active} go={slots[idx].go} warm={slots[idx].warm} press={slots[idx].press} />
        ))}
        <Tab screen="more" label="More" count={null} active={moreOn} go={slots[4].go} press={slots[4].press} />
      </nav>
      {/* NOVA, detached. The same Interactive the dock's centre orb is: tap
          starts talking right here. While the mic is open the orb steps up
          and says so — "Talk" — under itself.
          HOLD OPENS NOVA, LISTENING (1 Oct 2026, his "holding the nova core
          should allow me to capture anything through nova no matter how I
          speak with it"): the hold takes him to the Nova page with its core
          full screen and the microphone open (App.holdNovaCore). From 27 Sep
          it raised the capture composer (CaptureSheet.jsx); capture is now
          something he says to Nova, and the composer stays reachable from
          the Inbox's hint line, so nothing is lost. Before that the hold
          opened the live transcript (toggleLiveText), which is the Voice
          screen itself and stays reachable there. */}
      {/* ON THE NOVA TAB (29 Sep, mockup 63 D) the tap opens that page's own
          microphone (the thread registers it), and the orb says so while it
          is open: that page's mic is reported as voiceScreenMic, not as the
          presence's liveMicOpen. Everywhere else, exactly as before. */}
      <Interactive onClick={v.novaThread?.dockTalk || v.startLiveTalk} onLongPress={v.holdNovaCore || v.holdNovaText} aria-label="Talk to Nova. Hold to open Nova, listening" onHoldPhase={hold.onHoldPhase} data-nova-core=""
        className="nv-sum-nova" data-listening={listening ? 'true' : undefined}
        base={{ cursor: 'pointer' }} focusStyle={NO_TAP_RING}>
        {!gone && <VoiceHalo speaking={v.novaSpeaking} listening={listening} inset="-3px" />}
        <span className="nv-sum-nova-orb" data-hold-bounce="">
          {/* under the wall (Ambient covers the bar) it holds one still frame: an
              orb nobody can see drew every frame there (audit 21 §5) */}
          {!gone && <NovaCore size={ORB} variant="mini" engine={v.coreStyle} speaking={v.novaSpeaking} listening={listening} thinking={!!v.novaThinking} contest={!!v.novaContest} still={!!v.isAmbient} restFps={30} pauseOnScroll style={{ pointerEvents: 'none' }} />}
        </span>
        <span className="nv-sum-nova-cap" aria-hidden="true">Talk</span>
        <HoldRing ringRef={hold.ringRef} inset="-3px" />
      </Interactive>
    </div>
    {capture?.open && <CaptureSheet c={capture} />}
    </>
  );
}
