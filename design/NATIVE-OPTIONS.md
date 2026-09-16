# Publishing Nova as a real app — and what that buys

Written 16 Sep 2026, after shipping the CSS glass material, to answer one
question: *can Nova use Apple's actual shipped components instead of a
re-creation of them?*

## The honest answer, first

**Partly — and the split is sharp.**

| | Real Apple glass? |
|---|---|
| **Chrome** — tab bar, nav bar, sheets, toolbars | **Yes.** These become real UIKit views. A standard `UITabBar` adopts Liquid Glass automatically the moment the app is compiled against the iOS 26 SDK. Nothing to write. |
| **Content** — Home, Train, Fuel, Inbox, every screen | **No.** They are React DOM. Inside any wrapper they still render in a WKWebView, where `UIGlassEffect` does not reach. `.nv-liquid` remains the only glass there. |

So this is not "replace the re-creation". It is **"stop re-creating the
chrome, keep the material for the content"** — the two are complementary, and
the CSS material is not wasted work under any of the routes below.

Anyone claiming a web app can get real Liquid Glass throughout is selling the
chrome and quietly not mentioning the content.

## What is already true

`capacitor.config.json`, `ios/` and the four `@capacitor/*` packages are
already in this repo (6 Sep). The shell loads the **live URL**, not a bundled
copy:

```json
"server": { "url": "https://hcooper12.github.io/nova-os/" }
```

That one line is why this is cheap: every GitHub Pages deploy still reaches
the app on next open, with **no App Store review in between**. Only a change
to the *native* chrome needs a rebuild. Nova's shipping cadence does not
change.

The only blocker is that this Mac has Command Line Tools, not Xcode
(`xcode-select -p` → `/Library/Developer/CommandLineTools`). Every route below
removes that blocker by building on someone else's Mac — which is exactly the
reel's own point about EAS.

---

## Route A — Capacitor + native chrome (smallest, keeps everything)

The shell already exists. Add one plugin and the tab bar stops being a div.

```bash
npm install @capgo/capacitor-native-navigation
npx cap sync
```

`src/MobileChrome.jsx` keeps its dock for the browser PWA, and defers to the
real one inside the shell:

```js
import { NativeNavigation } from '@capgo/capacitor-native-navigation';

// window.Capacitor is the same live check src/haptics.js already uses
const inShell = typeof window !== 'undefined' && !!window.Capacitor;

if (inShell) {
  await NativeNavigation.setTabbar({
    selectedId: 'home',
    colors: { dynamic: true, tint: '#59e6ff', inactiveTint: '#8E8E93' },
    tabs: [
      { id: 'home',  title: 'Home',  icon: { ios: { sfSymbol: 'house' } },
        selectedIcon: { ios: { sfSymbol: 'house.fill' } } },
      { id: 'voice', title: 'Voice', icon: { ios: { sfSymbol: 'mic' } } },
      { id: 'train', title: 'Train', icon: { ios: { sfSymbol: 'figure.strengthtraining.traditional' } } },
      { id: 'fuel',  title: 'Fuel',  icon: { ios: { sfSymbol: 'fork.knife' } } },
      { id: 'inbox', title: 'Inbox', icon: { ios: { sfSymbol: 'tray' } } },
    ],
  });
}
```

**What he would actually see:** the dock becomes a real iOS 26 tab bar — true
squircle corners, genuine rim refraction that bends the content scrolling
under it, the system's own scroll-edge behaviour, SF Symbols that animate on
selection, and the tab bar minimising on scroll the way Safari's does. None of
that is reachable from CSS, and the difference is obvious in motion rather
than in a screenshot.

**What it costs:** the tab order editor (`src/tabOrder.js`, `TabOrderEditor.jsx`)
would need to push its order into `setTabbar` rather than only into React
state, and the raised centre ✦ Nova core is not a shape a `UITabBar` offers —
it would either move into the bar as an ordinary tab or stay as a floating web
element above it. **That is the real design decision in this route**, not the
plumbing.

Also available and worth a look: `alistairheath/stay-liquid`, which exposes
`UIGlassEffect` to arbitrary Ionic/Capacitor elements rather than only the tab
bar.

## Route B — Expo DOM components (incremental, much larger)

Expo SDK 52+ lets a React **web** component render inside a native app via a
`'use dom'` directive, so the app is genuinely native and each screen is a web
island you can replace one at a time.

```jsx
// src/screens/Home.jsx — unchanged Nova React, now hosted natively
'use dom';
export default function Home({ dom }) { /* … exactly what is there today … */ }
```

```jsx
// App.tsx — real native chrome, real expo-glass-effect, web content inside
import { GlassView } from 'expo-glass-effect';
import Home from './src/screens/Home';

<GlassView style={{ position: 'absolute', bottom: 0 }} glassEffectStyle="regular">
  <Tabs />
</GlassView>
<Home dom={{ scrollEnabled: true }} />
```

**Why it is attractive:** it is the only route where screens can migrate to
truly native views *one at a time* instead of in a big-bang rewrite, and
`expo-glass-effect` — the reel's package — works directly.

**Why it is not the first move:** it means adopting Expo Router, Metro and a
second build system alongside Vite, and Expo's own documentation says DOM
components "shouldn't be used for your entire app" because each one carries
web-view overhead. Nova is ~20 screens. Starting here means paying the whole
migration cost before seeing a single benefit that Route A does not give.

## Route C — full React Native rewrite

Real glass everywhere, including content. Also: re-implementing `Body3D`,
`NovaCore`, the canvas instruments, every `vals/*` view model's DOM
assumptions, and the entire Command/cupertino dual-idiom system. Months, and
it throws away the thing that makes Nova cheap to change. **Not recommended,
and listed only so the trade is explicit.**

---

## Getting it onto his phone without Xcode

The build runs on a rented Mac; the install comes through TestFlight, over
the air, no cable.

```yaml
# codemagic.yaml — builds ios/ on a cloud Mac and ships it to TestFlight
workflows:
  nova-ios:
    name: Nova OS iOS
    instance_type: mac_mini_m2
    environment:
      xcode: latest            # iOS 26 SDK — this is what turns on Liquid Glass
      node: 22
      ios_signing:
        distribution_type: app_store
        bundle_identifier: com.haydencooper.novaos
    scripts:
      - npm ci
      - npm run build
      - npx cap sync ios
      - xcode-project build-ipa --project ios/App/App.xcodeproj --scheme App
    artifacts: [build/ios/ipa/*.ipa]
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

**What this requires that nothing above does: an Apple Developer Program
membership, USD $99/year.** TestFlight is not available without it, and it is
the only way to install on his own phone without a local Xcode. That is the
single gate on this whole document — everything else is work, this one is a
decision.

Free alternative, stated for completeness and not recommended: a free personal
signing team produces a build that expires after 7 days **and requires Xcode
on a Mac to install it**, which is the blocker this route exists to remove.

## What I would do

**Route A, and only if the $99 is a yes.** It reuses a shell that already
exists, keeps the live-URL deploy loop exactly as it is, gets real Liquid
Glass on the one surface he touches most, and leaves every screen and the
whole design system untouched. Route B is a real option later, once a screen
exists that genuinely wants to be native. Route C is a trap.

The CSS material stays either way — it is what the content is made of.
