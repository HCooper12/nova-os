import SwiftUI

/// Nova's tokens, as mockup 119 writes them (`:root` and `.scr`), in sRGB.
/// `mix` is CSS `color-mix(in srgb, a p%, b)`, which the mockup uses for every
/// tinted surface, so the surfaces here are worked out the same way.
struct RGB: Equatable, Sendable {
    var r: Double, g: Double, b: Double

    init(_ hex: UInt32) {
        r = Double((hex >> 16) & 0xff) / 255
        g = Double((hex >> 8) & 0xff) / 255
        b = Double(hex & 0xff) / 255
    }

    init(r: Double, g: Double, b: Double) { self.r = r; self.g = g; self.b = b }

    var color: Color { Color(.sRGB, red: r, green: g, blue: b) }

    /// color-mix(in srgb, self p, other (1 - p))
    func mix(_ p: Double, _ other: RGB) -> RGB {
        RGB(r: r * p + other.r * (1 - p), g: g * p + other.g * (1 - p), b: b * p + other.b * (1 - p))
    }
}

enum Nova {
    // --nv-*
    static let cy = RGB(0x59e6ff)
    static let vi = RGB(0x8f7bff)
    static let gold = RGB(0xe0b26a)
    static let nova = RGB(0xc9d8ff)
    static let say = RGB(0x50e4a8)
    static let contest = RGB(0xff5460)
    static let or = RGB(0xffa257)
    static let grey = RGB(0x8b90a0)  // the "can't reach the Mac" screen's --c
    // --m-*
    static let protein = RGB(0x5fe8a8)
    static let kcal = RGB(0xffb35c)
    static let steps = RGB(0x59e6ff)

    static let ink = RGB(0xeef1f8)       // the base of --t2 / pill text mixes
    static let t3Base = RGB(0x9aa0b0)    // the base of --t3
    static let well = RGB(0x0e0f14)      // the base of plates and panels
    static let btnBase = RGB(0x101116)   // the base of .bt
    static let row = RGB(0x17181e)       // .urow, .plat.n, .wd.n
    static let buttonN = RGB(0x1d1f27)   // .bt.n, the plus base
    static let compBG = RGB(0x15161b)    // .comp
    static let crownOff = RGB(0x3a3e4b)  // .crown i

    /// --t2: color-mix(--c 42%, #eef1f8)
    static func t2(_ c: RGB) -> Color { c.mix(0.42, ink).color }
    /// --t3: color-mix(--c 30%, #9aa0b0)
    static func t3(_ c: RGB) -> Color { c.mix(0.30, t3Base).color }
    /// .plat: a vertical gradient of --c 21% to 13% over #0e0f14
    static func plate(_ c: RGB) -> LinearGradient {
        LinearGradient(colors: [c.mix(0.21, well).color, c.mix(0.13, well).color], startPoint: .top, endPoint: .bottom)
    }
}

/// The two faces the mockup asks for: `--w-ui` (ui-rounded: SF Rounded) and
/// `--w-serif` (ui-serif: New York). Both are system faces on watchOS.
extension Font {
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static func serif(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

/// `.scr::before`: the screen's colour at 22%, fading down the screen
/// (mask: 100% at the top, 30% at 46%, gone by 78%) over black.
struct ScreenTint: View {
    var c: RGB
    var body: some View {
        ZStack {
            Color.black
            LinearGradient(stops: [
                .init(color: c.color.opacity(0.22), location: 0),
                .init(color: c.color.opacity(0.22 * 0.3), location: 0.46),
                .init(color: c.color.opacity(0), location: 0.78),
            ], startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
    }
}

/// `.sb`: the screen's name at the top left in its colour. watchOS draws the
/// time at the top right itself, where the mockup draws it.
struct ScreenTitle: View {
    var text: String
    var c: RGB
    var dot: Bool = false
    var body: some View {
        HStack(spacing: 6) {
            if dot { Circle().fill(c.color).frame(width: 6, height: 6) }
            Text(text).font(.ui(15, .semibold)).foregroundStyle(c.color)
        }
        .frame(height: 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 24)
        .padding(.top, 10)
    }
}

/// The page body, `.pg`: inset 34 at the top, 10 at the sides and bottom.
struct Page<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(EdgeInsets(top: 34, leading: 10, bottom: 10, trailing: 10))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

/// A ring drawn as the mockup's SVG rings are: a track at 22% and an arc
/// from twelve o'clock with round caps.
struct Ring: View {
    var fraction: Double
    var color: RGB
    var width: CGFloat
    var track = true
    var body: some View {
        ZStack {
            if track { Circle().stroke(color.color.opacity(0.22), lineWidth: width) }
            Circle()
                .trim(from: 0, to: max(0, min(1, fraction)))
                .stroke(color.color, style: StrokeStyle(lineWidth: width, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

/// The mockup's 24-unit stroke icons (`#i-*`), drawn as paths.
enum Glyph {
    case tick, x, plus, undo, mic

    func path(in r: CGRect) -> Path {
        let s = r.width / 24
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * s, y: r.minY + y * s) }
        var path = Path()
        switch self {
        case .tick:
            path.move(to: p(5, 12.5)); path.addLine(to: p(9.5, 17)); path.addLine(to: p(19, 7.5))
        case .x:
            path.move(to: p(6.5, 6.5)); path.addLine(to: p(17.5, 17.5))
            path.move(to: p(17.5, 6.5)); path.addLine(to: p(6.5, 17.5))
        case .plus:
            path.move(to: p(12, 6)); path.addLine(to: p(12, 18))
            path.move(to: p(6, 12)); path.addLine(to: p(18, 12))
        case .undo:
            path.move(to: p(9.5, 5.5)); path.addLine(to: p(5, 10)); path.addLine(to: p(9.5, 14.5))
            path.move(to: p(5, 10)); path.addLine(to: p(14, 10))
            path.addArc(center: p(14, 15), radius: 5 * s, startAngle: .degrees(-90), endAngle: .degrees(90), clockwise: false)
            path.addLine(to: p(11, 20))
        case .mic:
            path.addRoundedRect(in: CGRect(origin: p(9, 3), size: CGSize(width: 6 * s, height: 11 * s)), cornerSize: CGSize(width: 3 * s, height: 3 * s))
            path.move(to: p(5.5, 11.5))
            path.addArc(center: p(12, 11.5), radius: 6.5 * s, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: true)
            path.move(to: p(12, 18)); path.addLine(to: p(12, 21))
        }
        return path
    }
}

struct GlyphView: View {
    var glyph: Glyph
    var size: CGFloat = 18
    var lineWidth: CGFloat = 2.4
    var body: some View {
        Canvas { ctx, sz in
            ctx.stroke(glyph.path(in: CGRect(origin: .zero, size: sz)), with: .foreground,
                       // the stroke width is set on the outer svg, so it scales with the symbol's 24-unit box
                       style: StrokeStyle(lineWidth: lineWidth * sz.width / 24, lineCap: .round, lineJoin: .round))
        }
        .frame(width: size, height: size)
    }
}
