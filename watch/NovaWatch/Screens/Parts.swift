import SwiftUI
import WatchKit

/// The 45 mm screen is the mockup's size (198 x 242). On a smaller watch
/// the fixed vertical positions scale by `k` and the densest screens drop
/// their least important line, so nothing is cut off at 41 mm.
@MainActor
enum Screen {
    static var height: CGFloat { WKInterfaceDevice.current().screenBounds.height }
    static var k: CGFloat { min(1, height / 242) }
    static var small: Bool { height < 230 }
}

extension View {
    /// Pins a screen to the display's own size, top-left. A vertical page is
    /// laid out taller than the display (251 pt on a 242 pt 45 mm screen),
    /// so anything placed from the bottom would sit below the glass.
    func screenFrame() -> some View {
        let b = WKInterfaceDevice.current().screenBounds
        return frame(width: b.width, height: b.height, alignment: .topLeading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .ignoresSafeArea()
    }
}

/// Words that light one by one (the mockup's `span.on`): lit words at full
/// strength, the rest at `dim`.
func litText(_ text: String, lit: Int, color: Color, dim: Double) -> Text {
    let words = text.split(separator: " ", omittingEmptySubsequences: true)
    var out = Text("")
    for (i, w) in words.enumerated() {
        let piece = Text(String(w) + (i < words.count - 1 ? " " : "")).foregroundStyle(color.opacity(i < lit ? 1 : dim))
        out = Text("\(out)\(piece)")
    }
    return out
}

/// `.bt`: a 38 pt pill in the screen's colour (`go` is jade with dark ink).
struct PillButton: View {
    enum Kind { case tinted(RGB), go, neutral }
    var title: String
    var kind: Kind
    var glyph: Glyph? = nil
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let glyph { GlyphView(glyph: glyph, size: 18) }
                Text(title).font(.ui(16, .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 38)
            .foregroundStyle(fg)
            .background(Capsule().fill(bg))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScale())
    }

    private var fg: Color {
        switch kind {
        case let .tinted(c): c.mix(0.7, RGB(0xffffff)).color
        case .go: RGB(0x03170e).color
        case .neutral: .white
        }
    }
    private var bg: Color {
        switch kind {
        case let .tinted(c): c.mix(0.24, Nova.btnBase).color
        case .go: Nova.say.color
        case .neutral: Nova.buttonN.color
        }
    }
}

/// `.bt.o.n`: the 42 pt round neutral button.
struct RoundButton: View {
    var glyph: Glyph
    var label: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            GlyphView(glyph: glyph, size: 18)
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(Circle().fill(Nova.buttonN.color))
        }
        .buttonStyle(PressScale())
        .accessibilityLabel(label)
    }
}

/// `:active { transform: scale(.97) }`, on the press.
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.snappy(duration: 0.16), value: configuration.isPressed)
    }
}

/// `.sw`: a small coloured status line with a dot.
struct StatusLine: View {
    var text: String
    var c: RGB
    var pulsing = false
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(c.color).frame(width: 6, height: 6)
                .opacity(pulsing && dim ? 0.35 : 1)
            Text(text).font(.ui(12, .semibold)).foregroundStyle(c.color)
        }
        .onAppear {
            guard pulsing, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { dim = true }
        }
    }
}

/// A skeleton bar: the shape of what is loading, in the plate colour.
struct Bone: View {
    var width: CGFloat
    var height: CGFloat
    var body: some View {
        RoundedRectangle(cornerRadius: height / 2).fill(Nova.row.color).frame(width: width, height: height)
    }
}

/// CSS `text-wrap: balance`: the narrowest width that keeps the same number
/// of lines, so the lines come out even, as the mockup's serif lines do.
struct Balanced: Layout {
    var alignment: HorizontalAlignment = .leading

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let s = subviews.first else { return .zero }
        guard let w = proposal.width else { return s.sizeThatFits(proposal) }
        let h = s.sizeThatFits(ProposedViewSize(width: w, height: nil)).height
        return CGSize(width: w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let s = subviews.first else { return }
        let w = bounds.width
        let h = s.sizeThatFits(ProposedViewSize(width: w, height: nil)).height
        var lo = 0.0, hi = w
        for _ in 0..<14 {
            let mid = (lo + hi) / 2
            if s.sizeThatFits(ProposedViewSize(width: mid, height: nil)).height > h + 0.5 { lo = mid } else { hi = mid }
        }
        let x: CGFloat = alignment == .center ? bounds.minX + (w - hi) / 2 : bounds.minX
        s.place(at: CGPoint(x: x, y: bounds.minY), proposal: ProposedViewSize(width: hi, height: nil))
    }
}
