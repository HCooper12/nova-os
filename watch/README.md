# Nova on the wrist (watchOS)

The first iteration of the native watch app, built to mockup 119
(`design/mockups/119-nova-wrist-round-two.html`): Talk (Home), Fuel,
Estimate, the Digital Crown portion, "Kept on the watch", "I can't reach
the Mac", plus complications and Smart Stack cards. Watch-only: it talks
HTTPS straight to the wrist door on the Mac; there is no iPhone companion.

## Generate and build

The Xcode project is generated from `project.yml` and is not committed.

```sh
brew install xcodegen          # once
cd watch
xcodegen generate              # writes NovaWatch.xcodeproj
xcodebuild -project NovaWatch.xcodeproj -scheme NovaWatch \
  -destination 'platform=watchOS Simulator,name=<simulator>' build
xcodebuild -project NovaWatch.xcodeproj -scheme NovaWatch \
  -destination 'platform=watchOS Simulator,name=<simulator>' test
```

Targets: `NovaWatch` (app, `com.haydencooper.novaos.watch`),
`NovaWatchWidgets` (WidgetKit, `.widgets`), `NovaWatchTests` (Swift Testing).
Team `Q4N3XZ4J9T` (free personal team), App Group
`group.com.haydencooper.novaos.watch`, Keychain group
`$(AppIdentifierPrefix)com.haydencooper.novaos.watch.shared`. watchOS 26.0,
Swift 6 language mode, complete concurrency checking.

## Where the watch connects

Set by build configuration, never typed on the watch (`Config/*.xcconfig`
→ `NovaDoorURL` in Info.plist):

- Debug: `http://127.0.0.1:4195`, the scratch server's door
  (`node scripts/scratch-server.mjs --port 4174`). Debug alone allows local
  networking (`Info-Debug.plist`).
- Release: `https://haydens-macbook-pro.taild050ac.ts.net:10000`.

## Proof fixtures (Debug only)

`-novaFixture <name>` draws one screen with the mockup's exact content so
it can be photographed beside the mockup. The code is in
`NovaWatch/Debug/FixtureModels.swift`, inside `#if DEBUG`; a Release build
contains none of it.

```sh
xcrun simctl launch <udid> com.haydencooper.novaos.watch -novaFixture fuel
```

Names: `talk-rest`, `talk-listening`, `talk-thinking`, `talk-speaking`,
`talk-done`, `fuel`, `estimate`, `portion`, `offline-kept`, `unreachable`,
`pairing`, `widgets` (the face, w15), `widgets-stack` (w16).

Two more Debug-only arguments drive a live walk against the scratch server:
`-novaDoorURL <url>` (a dead port, to show the Mac out of reach) and
`-novaAction log-first|fuel`.

## Words that differ from the mockup on purpose

- w17 says "Your phone is out of reach." The watch reaches the Mac
  directly, so live it says "I can't reach the Mac. I will send this when
  it is back." (the fixture shows the mockup's sentence).
- w18 says "Logging and capture still work here." Capture is not built
  yet, so live it says "Logging still works here."
