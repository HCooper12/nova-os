import SwiftUI

/// Fuel (mockup 119, w02): what is left today, the usuals for this hour as
/// one-tap rows, and "Say it" for anything new.
struct FuelView: View {
    @Environment(AppModel.self) private var model
    private let c = Nova.protein

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScreenTint(c: c)
            ScreenTitle(text: "Fuel", c: c)
            Page {
                FuelHero(protein: model.today?.protein, kcal: model.today?.kcal, loading: model.today == nil)
                    .padding(.bottom, 8)
                usuals
                Spacer(minLength: 4)
                PillButton(title: "Say it", kind: .tinted(Nova.vi), glyph: .mic) { model.startEstimate() }
            }
        }
        .screenFrame()
    }

    @ViewBuilder private var usuals: some View {
        if let list = model.today?.usuals {
            ForEach(list.prefix(Screen.small ? 1 : 2)) { u in
                UsualRow(usual: u, state: model.rows[u.key] ?? .idle,
                         tap: { model.tapUsual(u) },
                         hold: { model.path.append(.portion(u)) })
                    .padding(.bottom, 4)
            }
            if list.isEmpty {
                Text("Nothing usual at this hour yet.").font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(c)).padding(.top, 4)
            }
        } else if let err = model.today?.usualsError {
            Text(err).font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(c)).padding(.top, 4)
        } else if model.today == nil {
            // loading: the rows' own shapes, empty
            ForEach(0..<(Screen.small ? 1 : 2), id: \.self) { _ in
                RoundedRectangle(cornerRadius: 15).fill(Nova.row.color).frame(height: 42).padding(.bottom, 4)
            }
        }
    }
}

/// `.fhero`: the two rings and the two numbers left today.
struct FuelHero: View {
    var protein: Metric?
    var kcal: Metric?
    var loading: Bool
    private let c = Nova.protein

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                // .fring: 58 pt; r 28 and 19.5 of 66, stroke 6.5
                Ring(fraction: protein?.progress ?? 0, color: Nova.protein, width: 6.5 * 58 / 66)
                    .frame(width: 56 * 58 / 66, height: 56 * 58 / 66)
                    .opacity(protein?.progress == nil && !loading ? 0 : 1)
                Ring(fraction: kcal?.progress ?? 0, color: Nova.kcal, width: 6.5 * 58 / 66)
                    .frame(width: 39 * 58 / 66, height: 39 * 58 / 66)
                    .opacity(kcal?.progress == nil && !loading ? 0 : 1)
            }
            .frame(width: 58, height: 58)

            VStack(alignment: .leading, spacing: 0) {
                Text("Left today").font(.ui(11, .medium)).foregroundStyle(Nova.t3(c))
                    .frame(height: 11).padding(.bottom, 5)
                if loading {
                    Bone(width: 70, height: 22).padding(.vertical, 2)
                    Bone(width: 60, height: 13).padding(.top, 7)
                } else {
                    if let left = protein?.left {
                        number(left, unit: "g protein", size: 26, color: Nova.protein)
                    }
                    if let left = kcal?.left {
                        number(left, unit: "kcal", size: 16, color: Nova.kcal).padding(.top, 5)
                    }
                }
            }
            .lineLimit(1)
        }
        .frame(height: 60)
    }

    private func number(_ v: Double, unit: String, size: CGFloat, color: RGB) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(Fmt.int(v))
                .font(.ui(size, .bold)).tracking(-0.02 * size).monospacedDigit()
                .contentTransition(.numericText(value: v))
            Text(unit).font(.ui(12, .semibold))
        }
        .foregroundStyle(color.color)
        .frame(height: size)
    }
}

/// `.urow`: tap logs it, tap again within five seconds takes it back, hold
/// opens the portion screen.
struct UsualRow: View {
    var usual: Usual
    var state: RowState
    var tap: () -> Void
    var hold: () -> Void

    private let c = Nova.protein

    private var logged: Bool {
        switch state { case .undo, .done: true; default: false }
    }

    var body: some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                Text(usual.name).font(.ui(15, .semibold)).lineLimit(1).truncationMode(.tail)
                    .foregroundStyle(.white)
                Group {
                    switch state {
                    case .undo: Text("tap to undo").foregroundStyle(Nova.say.color)
                    case let .said(s): Text(s).foregroundStyle(Nova.or.color)
                    default: Text(Fmt.macrosLine(usual.macros) ?? " ").foregroundStyle(Nova.t3(c))
                    }
                }
                .font(.ui(11.5, .medium)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            RowBadge(state: state)
        }
        .padding(.leading, 11).padding(.trailing, 6)
        .frame(height: 42)
        .background(
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 15).fill(Nova.row.color)
                // the jade wipe from the left when it is logged (.45 s)
                GeometryReader { g in
                    Rectangle().fill(Nova.say.mix(0.22, Nova.row).color)
                        .frame(width: logged ? g.size.width : 0)
                        .animation(.timingCurve(0.32, 0.72, 0, 1, duration: 0.45), value: logged)
                }
                .clipShape(RoundedRectangle(cornerRadius: 15))
            }
        )
        .contentShape(RoundedRectangle(cornerRadius: 15))
        .onTapGesture(perform: tap)
        .onLongPressGesture(minimumDuration: 0.5, perform: hold)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Logs it. Hold to change the portion.")
    }
}

/// `.r`: the plus, the five-second undo ring, or the tick.
struct RowBadge: View {
    var state: RowState
    var body: some View {
        ZStack {
            switch state {
            case .undo(_, _, let until):
                UndoCountdown(until: until).transition(.scale(scale: 0.7).combined(with: .opacity))
            case .done:
                GlyphView(glyph: .tick, size: 16)
                    .foregroundStyle(RGB(0x03170e).color)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Nova.say.color))
                    .transition(.scale(scale: 0.7).combined(with: .opacity))
            case .sending:
                ProgressView().controlSize(.mini).tint(Nova.say.color).frame(width: 30, height: 30)
            default:
                GlyphView(glyph: .plus, size: 16)
                    .foregroundStyle(Nova.say.color)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Nova.say.mix(0.22, Nova.buttonN).color))
                    .transition(.scale(scale: 0.7).combined(with: .opacity))
            }
        }
        .frame(width: 30, height: 30)
        .animation(.bouncy(duration: 0.4), value: state)
    }
}

/// `.un`: a ring that drains over the five seconds he has to take it back.
struct UndoCountdown: View {
    var until: Date
    @State private var left = 1.0
    var body: some View {
        ZStack {
            Circle().trim(from: 0, to: left)
                .stroke(Nova.say.color, style: StrokeStyle(lineWidth: 2.5))
                .rotationEffect(.degrees(-90))
                .frame(width: 27, height: 27)
            GlyphView(glyph: .undo, size: 15).foregroundStyle(Nova.say.color)
        }
        .frame(width: 30, height: 30)
        .onAppear {
            left = max(0, until.timeIntervalSinceNow / 5)
            withAnimation(.linear(duration: max(0, until.timeIntervalSinceNow))) { left = 0 }
        }
    }
}
