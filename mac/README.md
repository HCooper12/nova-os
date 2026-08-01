# NovaBar — Nova in the menu bar

Presence rather than an app you visit. A status-bar ring and a global **⌥Space**
summon a floating panel running Nova's own Voice screen — same PWA, same
server, same conversation. Closing it changes nothing; the web app owns the
state, so the conversation is exactly where you left it next time.

## Build / rebuild

```
./mac/build.sh
open ~/Applications/NovaBar.app
```

Requires only the Swift toolchain that ships with macOS — no Xcode project, no
Apple Developer account, no signing. The app is ad-hoc signed so macOS will
remember its microphone permission.

## First run

1. `⌥Space` (or click the ring) to open the panel.
2. Nova loads the published PWA, which starts unconfigured in a fresh
   web view — open **Settings** inside the panel and paste the same base URL
   and token the phone uses. One time only.
3. macOS will ask for microphone access the first time Nova listens. Allow it.

## Options

Point it somewhere else (a local build, say):

```
defaults write com.novaos.novabar novaBarURL 'https://your-url/#/voice'
```

Launch at login: System Settings → General → Login Items → **+** → NovaBar.

## Why a panel and not a window

`.nonactivatingPanel` + `.floating` means it appears over whatever you're doing
without stealing your place, and `LSUIElement` keeps it out of the Dock and the
app switcher. It is a presence, not a program you run.
