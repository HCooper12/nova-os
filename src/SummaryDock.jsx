import { useEffect, useState } from 'react';
import { TabIcon } from './TabIcon.jsx';
import { Interactive } from './Interactive.jsx';
import { VoiceHalo } from './VoiceHalo.jsx';
import { NovaCore } from './NovaCore.jsx';
import { CaptureSheet } from './CaptureSheet.jsx';

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
// No motion on a tab switch: this is touched dozens of times a day, and an
// animation there only makes the app feel slower (emil-design-eng). The press
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
// It was 46, which left a 7px ring of empty glass. The gold (speaking) and
// violet (listening) tints are NovaCore's own and unchanged.
const ORB = 58;

function Tab({ screen, label, count, active, go, warm }) {
  return (
    <Interactive as="div" onClick={go} onPointerDown={warm} haptic="tick"
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
}

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
  const away = !!v.novaThread?.focus;
  const gone = useAway(away);
  const tabs = v.tabs.slice(0, 4);
  // More is lit on the Index AND on any screen reached through it, the way an
  // iOS More tab stays selected while you are inside it — so the bar always
  // says which branch he is in (the floating dock lit its More the same way)
  const moreOn = !!v.isIndex || !tabs.some((t) => t.active);
  const capture = v.inboxSummary?.capture;
  const listening = !!(v.novaListening || v.novaThread?.micOpen);
  return (
    <>
    <div className="nv-sum-dock" data-away={away ? 'true' : undefined} aria-hidden={away || undefined} inert={away}>
      <nav className="nv-sum-tabbar" aria-label="Tabs">
        {tabs.map((t) => (
          <Tab key={t.screen} screen={t.screen} label={t.label} count={t.count} active={t.active} go={t.go} warm={t.warm} />
        ))}
        <Tab screen="more" label="More" count={null} active={moreOn} go={v.goIndex} />
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
      <Interactive onClick={v.novaThread?.dockTalk || v.startLiveTalk} onLongPress={v.holdNovaCore || v.holdNovaText} aria-label="Talk to Nova. Hold to open Nova, listening"
        className="nv-sum-nova" data-listening={listening ? 'true' : undefined}
        base={{ cursor: 'pointer' }} focusStyle={NO_TAP_RING}>
        {!gone && <VoiceHalo speaking={v.novaSpeaking} listening={listening} inset="-3px" />}
        <span className="nv-sum-nova-orb">
          {!gone && <NovaCore size={ORB} variant="mini" engine={v.coreStyle} speaking={v.novaSpeaking} listening={listening} style={{ pointerEvents: 'none' }} />}
        </span>
        <span className="nv-sum-nova-cap" aria-hidden="true">Talk</span>
      </Interactive>
    </div>
    {capture?.open && <CaptureSheet c={capture} />}
    </>
  );
}
