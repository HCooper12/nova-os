import { TabIcon } from './TabIcon.jsx';
import { Interactive } from './Interactive.jsx';
import { VoiceHalo } from './VoiceHalo.jsx';
import { NovaCore } from './NovaCore.jsx';

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

export function SummaryDock({ v }) {
  const tabs = v.tabs.slice(0, 4);
  // More is lit on the Index AND on any screen reached through it, the way an
  // iOS More tab stays selected while you are inside it — so the bar always
  // says which branch he is in (the floating dock lit its More the same way)
  const moreOn = !!v.isIndex || !tabs.some((t) => t.active);
  return (
    <div className="nv-sum-dock">
      <nav className="nv-sum-tabbar" aria-label="Tabs">
        {tabs.map((t) => (
          <Tab key={t.screen} screen={t.screen} label={t.label} count={t.count} active={t.active} go={t.go} warm={t.warm} />
        ))}
        <Tab screen="more" label="More" count={null} active={moreOn} go={v.goIndex} />
      </nav>
      {/* NOVA, detached. The same Interactive the dock's centre orb is: tap
          starts talking right here, hold opens the words. While the mic is
          open the orb steps up and says so — "Talk" — under itself. */}
      <Interactive onClick={v.startLiveTalk} onLongPress={v.holdNovaText} aria-label="Talk to Nova"
        className="nv-sum-nova" data-listening={v.novaListening ? 'true' : undefined}
        base={{ cursor: 'pointer' }} focusStyle={NO_TAP_RING}>
        <VoiceHalo speaking={v.novaSpeaking} listening={v.novaListening} inset="-6px" />
        <span className="nv-sum-nova-orb">
          <NovaCore size={46} variant="mini" engine={v.coreStyle} speaking={v.novaSpeaking} listening={v.novaListening} style={{ pointerEvents: 'none' }} />
        </span>
        <span className="nv-sum-nova-cap" aria-hidden="true">Talk</span>
      </Interactive>
    </div>
  );
}
