import SwiftUI

/// Home: the talk hero (mockup 119, the first watch). One tap and he is
/// listening; the core shrinks to the top, what he heard and what he says
/// take its place, and an optional panel rises from the bottom.
struct TalkView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if case let .unreachable(seen) = model.talk {
            UnreachableView(lastSeen: seen) { model.tapTalk() }
        } else {
            hero
        }
    }

    private var phase: TalkPhase { model.talk }

    private var c: RGB {
        switch phase {
        case .listening: Nova.vi
        case .thinking: Nova.cy
        case .speaking: Nova.say
        default: Nova.nova
        }
    }

    private var label: String {
        switch phase {
        case .listening: "Listening"
        case .thinking: "Thinking"
        case .speaking: "Speaking"
        default: "Nova"
        }
    }

    private var dotOn: Bool {
        switch phase {
        case .listening, .thinking, .speaking: true
        default: false
        }
    }

    var hero: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c).animation(.easeInOut(duration: 0.5), value: c)
            ListeningGlow(on: phase == .listening, c: c)

            // .sb: the dot slides in, the name moves over by 12 pt
            HStack(spacing: 6) {
                PulseDot(c: c, pulsing: phase == .listening || isThinking).opacity(dotOn ? 1 : 0)
                Text(label).font(.ui(15, .semibold)).foregroundStyle(c.color)
                    .contentTransition(.opacity)
            }
            .offset(x: dotOn ? 0 : -12)
            .animation(.smooth(duration: 0.4), value: dotOn)
            .frame(height: 20)
            .padding(.leading, 24)
            .padding(.top, 10)

            // the core: 104 pt at rest, half that and lifted during a turn
            NovaCoreView(size: 104 * Screen.k, state: coreState)
                .scaleEffect(phase.isRest ? 1 : 0.5, anchor: .top)
                .offset(y: phase.isRest ? 0 : -2)
                .frame(maxWidth: .infinity)
                .offset(y: 32 * Screen.k)
                .animation(reduceMotion ? nil : .smooth(duration: 0.62), value: phase.isRest)

            restBlock
            talkBlock
            panelView
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenFrame()
        .contentShape(Rectangle())
        .onTapGesture { model.tapTalk() }
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Talk to Nova") { model.tapTalk() }
    }

    private var isThinking: Bool { if case .thinking = phase { true } else { false } }

    private var coreState: CoreState {
        var s = phase.core
        if s.listening { s.level = model.talkLevel }
        return s
    }

    // .hrest: the news line and three rings, at rest only
    @ViewBuilder private var restBlock: some View {
        let t = model.today
        VStack(spacing: 0) {
            if let line = restLine(t) {
                Balanced(alignment: .center) {
                    Text(line)
                        .font(.serif(18, .medium))
                        .lineHeight(.exact(points: 18 * 1.16))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .offset(y: -2) // CSS puts half the leading above the first line; SwiftUI less
            } else if model.todayLoading {
                VStack(spacing: 5) { Bone(width: 120, height: 14); Bone(width: 150, height: 14) }
            }
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                if let p = t?.protein?.progress { SmallRing(fraction: p, c: Nova.protein) }
                if let k = t?.kcal?.progress { SmallRing(fraction: k, c: Nova.kcal) }
                if let s = t?.steps?.progress { SmallRing(fraction: s, c: Nova.steps) }
            }
            .frame(height: 24)
        }
        .frame(height: 91 * Screen.k)
        .padding(.horizontal, 12)
        .offset(y: 138 * Screen.k)
        .opacity(phase.isRest ? 1 : 0)
        .offset(y: phase.isRest ? 0 : 8)
        .animation(.smooth(duration: 0.5), value: phase.isRest)
    }

    /// "Pull A today. / 132 g protein to go." from what the Mac knows; nothing invented.
    private func restLine(_ t: Today?) -> String? {
        if let fixture = FixtureText.restLine { return fixture }
        var lines: [String] = []
        if let s = t?.session, !s.isEmpty { lines.append("\(s) today.") }
        if let left = t?.protein?.left { lines.append("\(Fmt.int(left)) g protein to go.") }
        return lines.isEmpty ? nil : lines.joined(separator: "\n")
    }

    // .htalk: what he heard, then what Nova says, in the same place
    @ViewBuilder private var talkBlock: some View {
        ZStack(alignment: .topLeading) {
            let heard: String? = {
                switch phase {
                case let .thinking(h): h ?? FixtureText.heard
                case .listening: FixtureText.heard
                default: nil
                }
            }()
            if let heard {
                Text("\(heard)")
                    .font(.ui(16, .semibold))
                    .tracking(-0.08)
                    .lineHeight(.exact(points: 16 * 1.22))
                    .offset(y: -1)
                    .foregroundStyle(RGB(0xefeaff).color)
                    .opacity(phase == .listening ? 1 : 0.45)
                    .transition(.opacity.animation(.easeOut(duration: 0.14)))
            }
            switch phase {
            case let .speaking(_, text, lit):
                caption(litText(text, lit: lit, color: .white, dim: 0.3))
            case let .done(text):
                caption(Text(text).foregroundStyle(.white))
            case let .failed(sentence):
                caption(Text(sentence).foregroundStyle(.white))
            default:
                EmptyView()
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(.horizontal, 14)
        .offset(y: 88 * Screen.k)
    }

    private func caption(_ t: Text) -> some View {
        Balanced {
            t.font(.serif(Screen.small ? 18 : 20, .medium))
                .lineHeight(.exact(points: (Screen.small ? 18 : 20) * 1.14 - 0.6))
                .fixedSize(horizontal: false, vertical: true)
        }
        .offset(y: -2)
        .transition(.opacity.animation(.easeOut(duration: 0.3).delay(0.14)))
    }

    @ViewBuilder private var panelView: some View {
        let show: Bool = {
            switch phase {
            case .speaking, .done: model.panel != nil
            default: false
            }
        }()
        VStack {
            Spacer(minLength: 0)
            if let p = model.panel {
                ProteinPanel(panel: p)
                    .frame(height: 70)
                    .padding(6)
                    .offset(y: show ? 0 : 70 * 1.18 + 6)
                    .animation(reduceMotion ? nil : .snappy(duration: 0.56, extraBounce: 0.05), value: show)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
    }
}

/// `.panel`: jade plate with the protein ring and the number.
struct ProteinPanel: View {
    var panel: TalkPanel
    @State private var shown = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        let pc = Nova.say
        HStack(spacing: 12) {
            // .pr: 44 pt, r 19 of 48, stroke 5
            Ring(fraction: shown, color: Nova.protein, width: 5 * 44 / 48)
                .frame(width: 38 * 44 / 48, height: 38 * 44 / 48)
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .lastTextBaseline, spacing: 1) {
                    Text(panel.number).font(.ui(28, .bold)).tracking(-0.56)
                    Text(panel.unit).font(.ui(15, .semibold))
                }
                .foregroundStyle(Nova.protein.color)
                Text(panel.label).font(.ui(12, .medium)).foregroundStyle(pc.mix(0.45, Nova.ink).color)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .frame(maxHeight: .infinity)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 24, bottomLeadingRadius: 40, bottomTrailingRadius: 40, topTrailingRadius: 24)
                .fill(LinearGradient(colors: [pc.mix(0.26, Nova.well).color, pc.mix(0.15, Nova.well).color], startPoint: .top, endPoint: .bottom))
        )
        .onAppear {
            if reduceMotion { shown = panel.progress } else {
                withAnimation(.smooth(duration: 0.9).delay(0.1)) { shown = panel.progress }
            }
        }
    }
}

/// `.hrings svg`: 24 pt, r 8 of 22, stroke 3.5.
struct SmallRing: View {
    var fraction: Double
    var c: RGB
    var body: some View {
        Ring(fraction: fraction, color: c, width: 3.5 * 24 / 22)
            .frame(width: 16 * 24 / 22, height: 16 * 24 / 22)
            .frame(width: 24, height: 24)
    }
}

/// The status dot, pulsing while he listens or thinks.
struct PulseDot: View {
    var c: RGB
    var pulsing: Bool
    @State private var low = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Circle().fill(c.color).frame(width: 6, height: 6)
            .opacity(pulsing && low ? 0.35 : 1)
            .onChange(of: pulsing, initial: true) { _, on in
                guard !reduceMotion else { return }
                if on {
                    withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { low = true }
                } else {
                    withAnimation(.easeOut(duration: 0.2)) { low = false }
                }
            }
    }
}

/// `.hero[data-state=listening]::after`: an inner glow in the listening
/// colour that breathes (opacity .75 to .4 over 1.8 s).
struct ListeningGlow: View {
    var on: Bool
    var c: RGB
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        RoundedRectangle(cornerRadius: 46)
            .strokeBorder(c.color, lineWidth: 10)
            .blur(radius: 9)
            .clipShape(RoundedRectangle(cornerRadius: 46))
            .opacity(on ? (breathe ? 0.4 : 0.75) : 0)
            .animation(.easeInOut(duration: 0.4), value: on)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .onChange(of: on, initial: true) { _, v in
                guard v, !reduceMotion else { breathe = false; return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { breathe = true }
            }
    }
}
