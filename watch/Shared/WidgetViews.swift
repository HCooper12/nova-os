import SwiftUI

// The complication and Smart Stack faces (mockup 119, w15 and w16). Pure
// SwiftUI so the app's Debug gallery draws exactly what the widget draws.
// Every view takes optional data and draws nothing for what is unknown.

/// The core as a complication: one still frame (the face redraws a lowered
/// wrist about once a minute, so it never animates there).
struct CoreCircular: View {
    var size: CGFloat = 44
    var body: some View {
        NovaCoreView(size: size, still: true)
    }
}

/// `.frect`: Nova / the next thing / protein to go.
struct NextRectangular: View {
    var today: Today?
    var paired: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Nova").font(.ui(13, .semibold)).foregroundStyle(Nova.nova.color)
            if !paired {
                Text("Open Nova to pair").font(.ui(17, .semibold)).tracking(-0.17).foregroundStyle(.white)
            } else if let today {
                if let s = today.session, !s.isEmpty {
                    Text(s).font(.ui(17, .semibold)).tracking(-0.17).foregroundStyle(.white).lineLimit(1)
                }
                if let left = today.protein?.left {
                    Text("\(Fmt.int(left)) g protein to go").font(.ui(13, .medium)).foregroundStyle(Nova.protein.color).lineLimit(1)
                }
            } else {
                Text("Open Nova").font(.ui(17, .semibold)).tracking(-0.17).foregroundStyle(.white)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// `.comp`: a 46 pt circle with a ring (r 17 of 40, stroke 4) and the number.
struct MetricCircular: View {
    var value: Double?
    var progress: Double?
    var c: RGB
    var text: (Double) -> String
    var fontSize: CGFloat = 15

    var body: some View {
        ZStack {
            Circle().fill(Nova.compBG.color)
            if let progress {
                Ring(fraction: progress, color: c, width: 4 * 46 / 40)
                    .frame(width: 34 * 46 / 40, height: 34 * 46 / 40)
            }
            if let value {
                Text(text(value)).font(.ui(fontSize, .bold)).foregroundStyle(c.color).minimumScaleFactor(0.6).lineLimit(1)
                    .padding(.horizontal, 6)
            }
        }
        .frame(width: 46, height: 46)
    }
}

/// `.wd`: the Smart Stack plate (70 pt, radius 22).
struct StackPlate<Content: View>: View {
    var c: RGB?
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(.vertical, 9).padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 70, maxHeight: 70, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 22).fill(c.map { AnyShapeStyle(Nova.plate($0)) } ?? AnyShapeStyle(Nova.row.color))
            )
    }
}

/// The Fuel card: protein left, the usual for this hour, and the plus.
struct StackFuelContent<Plus: View>: View {
    var left: Double?
    var usualName: String?
    var paired: Bool
    @ViewBuilder var plus: Plus

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                if !paired {
                    Text("Fuel").font(.ui(20, .bold)).tracking(-0.4).foregroundStyle(Nova.protein.color)
                    Text("Open Nova to pair").font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(Nova.protein))
                } else {
                    if let left {
                        Text("\(Fmt.int(left)) g left").font(.ui(20, .bold)).tracking(-0.4).foregroundStyle(Nova.protein.color).lineLimit(1)
                    } else {
                        Text("Fuel").font(.ui(20, .bold)).tracking(-0.4).foregroundStyle(Nova.protein.color)
                    }
                    if let usualName {
                        Text(usualName).font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(Nova.protein)).lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if paired && usualName != nil { plus }
        }
    }
}

/// The plus drawn as `.plus` is (30 pt, jade on a jade-tinted disc).
struct PlusDisc: View {
    var body: some View {
        GlyphView(glyph: .plus, size: 16)
            .foregroundStyle(Nova.say.color)
            .frame(width: 30, height: 30)
            .background(Circle().fill(Nova.say.mix(0.22, Nova.buttonN).color))
    }
}

/// "Nova, Tap to talk".
struct StackTalkContent: View {
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            CoreCircular(size: 36)
            VStack(alignment: .leading, spacing: 0) {
                Text("Nova").font(.ui(15, .semibold)).foregroundStyle(.white)
                Text("Tap to talk").font(.ui(11.5, .medium)).foregroundStyle(Nova.t3(Nova.nova))
            }
            .padding(.top, 2)
        }
        .padding(.leading, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
