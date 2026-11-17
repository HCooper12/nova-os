import SwiftUI

// MARK: Estimate (w03)

/// "Say it": Nova itemises what the Mac heard; one tick logs it; a tap on a
/// line drops it and the total follows.
struct EstimateView: View {
    @Environment(AppModel.self) private var model
    private let c = Nova.or

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c)
            ScreenTitle(text: "Estimate", c: c)
            Page { content }
        }
        .screenFrame()
        .toolbar(.hidden, for: .navigationBar)
    }

    @ViewBuilder private var content: some View {
        switch model.estimate {
        case .recording:
            VStack(alignment: .leading, spacing: 8) {
                StatusLine(text: "Listening", c: Nova.vi, pulsing: true)
                NovaCoreView(size: 64, state: CoreState(listening: true, level: model.talkLevel))
                    .frame(maxWidth: .infinity)
            }
            Spacer(minLength: 4)
            PillButton(title: "Done", kind: .tinted(Nova.vi)) { model.finishEstimateRecording() }
        case .waiting:
            // the real wait: the plate's own shape while the Mac hears and adds it up
            StatusLine(text: "Adding it up", c: c, pulsing: true)
            VStack(alignment: .leading, spacing: 7) {
                Bone(width: 110, height: 12); Bone(width: 130, height: 12); Bone(width: 90, height: 12)
                Bone(width: 70, height: 20).padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 9).padding(.horizontal, 11)
            .background(RoundedRectangle(cornerRadius: 16).fill(Nova.plate(c)))
            .padding(.top, 7)
            Spacer(minLength: 4)
            buttons(enabled: false)
        case let .ready(e, dropped), let .logging(e, dropped):
            ready(e, dropped: dropped)
        case let .failed(sentence):
            Text(sentence).font(.serif(17, .medium)).foregroundStyle(.white).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            PillButton(title: "Close", kind: .neutral) { model.cancelEstimate() }
        }
    }

    @ViewBuilder private func ready(_ e: Estimate, dropped: Set<Int>) -> some View {
        if let heard = e.heard {
            Text("\"\(heard)\"").font(.ui(13, .medium)).lineHeight(.exact(points: 13 * 1.25)).foregroundStyle(Nova.t2(c))
                .lineLimit(Screen.small ? 1 : nil)
                .fixedSize(horizontal: false, vertical: true)
        }
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(e.lines.enumerated()), id: \.offset) { i, line in
                let off = dropped.contains(i)
                HStack(spacing: 8) {
                    Text(line.name).foregroundStyle(.white).strikethrough(off).lineLimit(1)
                    Spacer(minLength: 0)
                    if let k = line.kcal { Text(Fmt.int(k)).foregroundStyle(Nova.t2(c)).strikethrough(off) }
                }
                .font(.ui(13, .medium))
                .frame(height: 19)
                .opacity(off ? 0.4 : 1)
                .contentShape(Rectangle())
                .onTapGesture { model.toggleLine(i) }
            }
            let total = e.total(dropping: dropped)
            HStack(alignment: .lastTextBaseline) {
                if let k = total.kcal {
                    HStack(alignment: .lastTextBaseline, spacing: 3) {
                        Text(Fmt.int(k)).font(.ui(22, .bold)).tracking(-0.44).foregroundStyle(Nova.kcal.color)
                            .contentTransition(.numericText(value: k))
                        Text("kcal").font(.ui(12, .semibold)).foregroundStyle(.white)
                    }
                }
                Spacer(minLength: 0)
                if let p = total.protein {
                    Text("\(Fmt.int(p)) g protein").font(.ui(12, .semibold)).foregroundStyle(Nova.protein.color)
                }
            }
            .padding(.top, 3) // the mockup's 5, less the line box SwiftUI adds
        }
        .padding(.vertical, 9).padding(.horizontal, 11)
        .background(RoundedRectangle(cornerRadius: 16).fill(Nova.plate(c)))
        .padding(.top, 7)
        Spacer(minLength: 4)
        buttons(enabled: { if case .ready = model.estimate { true } else { false } }())
    }

    private func buttons(enabled: Bool) -> some View {
        HStack(spacing: 6) {
            RoundButton(glyph: .x, label: "Discard") { model.cancelEstimate() }
            PillButton(title: "Log it", kind: .go) { model.logEstimate() }
                .disabled(!enabled)
                .opacity(enabled ? 1 : 0.5)
        }
    }
}

// MARK: Portion (w04)

/// Hold a usual, turn the crown: a quarter serve each click.
struct PortionView: View {
    @Environment(AppModel.self) private var model
    var usual: Usual
    @State var times: Double = 1
    @State private var crown: Double = 1
    private let c = Nova.protein

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c)
            ScreenTitle(text: "Fuel", c: c)
            CrownTicks(on: tickIndex, c: c)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.trailing, 5).padding(.top, 46)
            VStack(spacing: 0) {
                Text(usual.name).font(.ui(15, .semibold)).tracking(-0.15).lineLimit(1).foregroundStyle(.white)
                Spacer(minLength: 4)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("×").font(.ui(30, .semibold)).opacity(0.7)
                    Text(Portion.label(times)).font(.ui(60, .heavy)).tracking(-1.8)
                        .contentTransition(.numericText(value: times))
                }
                .foregroundStyle(Nova.protein.color)
                .frame(height: 60)
                .offset(y: -2)
                if let line = Fmt.macrosLine(usual.macros?.scaled(times)) {
                    Text(line).font(.ui(12.5, .medium)).foregroundStyle(Nova.t2(c)).padding(.top, 8)
                        .contentTransition(.numericText())
                }
                Spacer(minLength: 4)
                PillButton(title: "Log", kind: .go) {
                    model.path.removeAll { if case .portion = $0 { true } else { false } }
                    model.log(usual, times: times)
                }
            }
            .padding(EdgeInsets(top: 34, leading: 10, bottom: 10, trailing: 10))
        }
        .screenFrame()
        .toolbar(.hidden, for: .navigationBar)
        .focusable()
        .digitalCrownRotation($crown, from: Portion.min, through: Portion.max, by: Portion.step,
                              sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { _, v in withAnimation(.snappy(duration: 0.3)) { times = Portion.clamp(v) } }
        .onAppear { crown = times }
    }

    /// nine ticks, the lit one following the serve (×1.5 lights the fourth)
    private var tickIndex: Int { max(0, min(8, Int(((times - 0.75) / Portion.step).rounded()))) }
}

/// `.crown`: the Digital Crown's position, drawn beside it.
struct CrownTicks: View {
    var on: Int
    var c: RGB
    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            ForEach(0..<9, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1)
                    .fill(i == on ? c.color : Nova.crownOff.color)
                    .frame(width: i == on ? 9 : 4, height: 2)
            }
        }
        .animation(.snappy(duration: 0.25), value: on)
    }
}

// MARK: Kept on the watch (w17)

/// A log the Mac could not take yet: kept here, orange, and sent with its
/// own key when the Mac answers again.
struct KeptView: View {
    @Environment(AppModel.self) private var model
    /// the sentence: the mockup's words under a fixture, and what is true live
    var sentence: String { FixtureText.keptSentence ?? "I can't reach the Mac. I will send this when it is back." }
    private let c = Nova.or

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c)
            ScreenTitle(text: "Fuel", c: c)
            Page {
                StatusLine(text: model.kept.isEmpty ? "Sent" : "Kept on the watch", c: model.kept.isEmpty ? Nova.say : c)
                Balanced {
                    Text(model.kept.isEmpty ? "The Mac has it now." : sentence)
                        .font(.serif(17, .medium)).lineHeight(.exact(points: 17 * 1.2 - 0.5)).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .offset(y: -2)
                .padding(.top, 8)
                Spacer(minLength: 4)
                if let w = model.kept.last {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(w.name).font(.ui(15, .semibold)).lineLimit(1).foregroundStyle(.white)
                            if let m = Fmt.macrosLine(w.macros) {
                                Text(m).font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(c))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text(model.kept.count > 1 ? "\(model.kept.count) waiting" : "Waiting")
                            .font(.ui(11.5, .semibold)).foregroundStyle(c.color)
                    }
                    .padding(.vertical, 9).padding(.horizontal, 11)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Nova.plate(c)))
                    .transition(.opacity)
                }
            }
        }
        .screenFrame()
        .toolbar(.hidden, for: .navigationBar)
        .task {
            // try again while this screen is up
            while !Task.isCancelled, !model.kept.isEmpty, !model.isFixture {
                try? await Task.sleep(for: .seconds(15))
                await model.drain()
            }
        }
    }
}

// MARK: The Mac out of reach (w18)

struct UnreachableView: View {
    var lastSeen: Date?
    var retry: () -> Void
    private let c = Nova.grey

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c)
            ScreenTitle(text: "Nova", c: c)
            VStack(spacing: 0) {
                NovaCoreView(size: 64 * Screen.k, still: true)
                    .grayscale(1).opacity(0.5)
                Balanced(alignment: .center) {
                    Text("I can't reach the Mac.")
                        .font(.serif(19, .medium)).lineHeight(.exact(points: 19 * 1.2 - 0.5)).foregroundStyle(.white).multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 2) // the mockup's 4, less the serif's extra half-leading
                Text(FixtureText.unreachableNote ?? "Logging still works here. Questions need the Mac awake.")
                    .font(.ui(12.5, .medium)).lineHeight(.exact(points: 12.5 * 1.3)).foregroundStyle(Nova.t2(c)).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 5)
                Spacer(minLength: 4)
                if let lastSeen {
                    Text("Last seen \(FixtureText.time ?? Fmt.clock(lastSeen))")
                        .font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(c))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 34, leading: 10, bottom: 10, trailing: 10))
        }
        .screenFrame()
        .contentShape(Rectangle())
        .onTapGesture(perform: retry)
        .accessibilityAction(named: "Try again", retry)
    }
}

// MARK: Pairing (not in the mockup; the one invented screen)

/// Pairing in Nova's own language: the core, Nova's sentence in the serif,
/// the six-digit code big in tabular figures, one quiet line on where to
/// approve it.
struct PairingView: View {
    @Environment(AppModel.self) private var model
    var fixtureCode: String? = nil
    private let c = Nova.nova

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c)
            ScreenTitle(text: "Nova", c: c)
            VStack(spacing: 0) {
                NovaCoreView(size: 44 * Screen.k, still: model.pairing == nil && fixtureCode == nil)
                if let code = fixtureCode ?? model.pairing?.code {
                    Balanced(alignment: .center) {
                        Text("Pair this watch with me.")
                            .font(.serif(17, .medium)).lineHeight(.exact(points: 17 * 1.2 - 0.5))
                            .multilineTextAlignment(.center).foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 4)
                    Text(spaced(code))
                        .font(.ui(Screen.small ? 30 : 34, .bold)).monospacedDigit().tracking(1)
                        .foregroundStyle(.white)
                        .padding(.top, 6)
                    Spacer(minLength: 4)
                    Text("Open Pair a watch in Nova on your phone and enter this code.")
                        .font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(c)).multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                } else if let s = model.pairSentence {
                    Balanced(alignment: .center) {
                        Text(s).font(.serif(17, .medium)).lineHeight(.exact(points: 17 * 1.2 - 0.5)).foregroundStyle(.white)
                            .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 4)
                    Spacer(minLength: 4)
                    PillButton(title: "Try again", kind: .tinted(c)) { model.startPairing() }
                } else {
                    Text("Asking the Mac for a code.").font(.serif(17, .medium)).foregroundStyle(.white).padding(.top, 4)
                    Bone(width: 130, height: 30).padding(.top, 8)
                    Spacer(minLength: 4)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 34, leading: 10, bottom: 10, trailing: 10))
        }
        .screenFrame()
    }

    private func spaced(_ code: String) -> String {
        guard code.count == 6 else { return code }
        return "\(code.prefix(3)) \(code.suffix(3))"
    }
}
