# 64 — NovaBar (Mac menu bar)

Audited 2026-09-01. Read-only. Files opened: `mac/NovaBar/main.swift`
(1-176, full), `design/WRIST-PLAN.md:45-70` (context + Phase 3
ownership). Deployment verified live this session: `launchctl list`
shows application.com.novaos.novabar running (PID present). Phone-width
n/a (native Mac surface).

## 1. What it is (verified)

"Nova in the menu bar — presence, not an app you visit": a status item
and a global ⌥Space hotkey summon a floating WKWebView panel loading
the PWA's own Voice screen, mic already granted, HUD material behind.
**The thin-shell doctrine is stated and kept** (5-11): "no duplicated
logic, no second source of truth — the same PWA, the same server, the
same conversation. Closing it leaves the conversation exactly where it
was, because the web app owns the state." No parallel rail exists to
audit — that's the point. Build is swiftc-only, "no Xcode project, no
signing needed" — maintainability as a design property.

## 2. Workflow traced + the craft

⌥Space anywhere → toggle → showPanel. For 176 lines, the
incident-comment density is exceptional, and every edge is a survived
bug:
- Status item built one run-loop turn late (31-34: built too early,
  "ZERO height that never lands in the menu bar").
- SF Symbol over hand-drawn image (54-58: the template conversion
  "lost the strokes… the worst kind of bug: running, reachable by
  hotkey, and apparently absent"), with a fallback chain
  symbol → sparkle → "◉" ("always something to click").
- Show-once-on-launch because "the hotkey is the real interface, and
  this proves it is alive" (39-43) — honest degradation, menu-bar
  edition.
- Anchor trusts the status item only if the system GENUINELY placed it
  in the bar ("a nonzero height alone isn't enough", 140-147),
  otherwise top-right fallback; clamped so it can never sit off-screen
  (148-150).
- canBecomeKey override with its reason (typing breaks without it);
  mic granted once at the OS prompt rather than per-summon.
- The known blocker — icon under the notch on a full menu bar — is
  documented in place (77-80) AND owned as WRIST-PLAN Phase 3's
  feature ("turns NovaBar's blocker into the feature").

## 3. Pros / Cons

Pros: all of §2; zero second-source-of-truth by construction.

Cons (all small):
1. **Mic auto-grant is origin-blind** (118-124): `.grant` for whatever
   the webview loads, and the URL is configurable via UserDefaults —
   if novaBarURL were ever repointed, that page inherits the mic. One
   `origin.host` check scopes it to Nova.
2. **No quit affordance** — no status-item menu, .accessory policy, so
   quitting means Activity Monitor or launchctl.
3. A failed page load shows a silent blank panel — navigationDelegate
   is wired but no didFail handler (the PWA's service worker masks
   most of this once cached; the honest-state gap is first-run only).
4. Fixed 420×620, no .resizable; ⌥Space not rebindable. Noted only.

## 5. Mission test

**Daily: earns its keep** — zero-friction summon of Voice from inside
any app on the Mac is exactly "the one app he opens every day" made
ambient, at ~0 maintenance cost thanks to the thin shell.

## 6. Improvement plan

1. **[Refine — hardening]** Scope the media-capture grant to the
   configured Nova origin. **Impact/effort:** M / L.
2. **[Add]** Right-click menu on the status item: Reload · current URL
   · Quit. **Impact/effort:** L / L.
3. **[Refine]** didFailProvisionalNavigation → inline "Nova
   unreachable — retry" instead of a blank panel. **Impact/effort:**
   L / L.
4. **[Owned]** The notch HUD evolution is WRIST-PLAN Phase 3's —
   deliberately not re-planned here.
5. **[Empty categories]** No other ADD — growing the shell would break
   its one design rule.

## 7. UI recommendations

Plan 2-3 are the UI items. Nothing else — the shell's UI IS the PWA's,
audited across items 01-63.

## 8. Verdict

**Keep as-is / Refine** — a model thin shell whose every workaround
carries its scar tissue in a comment, running live right now; three
L-effort refinements (origin-scoped mic, a quit menu, an honest
failed-load state) close everything found.
