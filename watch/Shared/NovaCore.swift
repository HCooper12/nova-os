import SwiftUI

// Nova's core on the watch: the hologram engine of src/NovaCore.jsx and the
// grain body of src/coreGrains.js, redrawn in a SwiftUI Canvas from the same
// maths and the same seeds, so the same scene comes out.
//
// What is the same: the seeded scene (rings, arcs, embers, the fibonacci
// shell), the tumble, the depth fog, the colour axis and its tint toward the
// turn's colour, the HUD rings, the halo, the heart, and the grain forms
// (listening sphere, thinking strata then knot, speaking strata then shell).
// What is simplified, and why: the web batcher fills each run of one line
// separately so crossings add light; here each colour shade is filled as
// three interleaved paths (lines alternate between them), so most crossings
// still add while a frame stays near 60 fills for a Series 7. Pushing back
// (contest) and the gold stage are not used on the wrist and are left out.

struct CoreState: Equatable, Sendable {
    var listening = false
    var thinking = false
    var speaking = false
    /// the live level of his voice while listening (0...1); 0 otherwise
    var level: Double = 0

    static let rest = CoreState()
    var turn: Int { listening ? 1 : speaking ? 3 : thinking ? 2 : 0 }
}

// MARK: shared constants (the web engine's)

private let TAU = 6.2832
private let A_LEVELS = 12
private let A_MIN = 0.012
private let A_STEP = log(1 / A_MIN) / Double(A_LEVELS - 1)
private let A_VAL: [Double] = (0..<A_LEVELS).map { $0 == A_LEVELS - 1 ? 1 : A_MIN * exp(A_STEP * Double($0)) }
private let E_DROP = 0.0015
private let HOLO_DEPTHS = 5
private let CAM_D = 6.0
private let COMET_K = 30
private let COMET_FADE: [Double] = (0..<COMET_K).map { pow(1 - Double($0) / Double(COMET_K), 1.6) }
private let GLOBE_LATS = [-1.05, -0.55, 0, 0.55, 1.05]
private let PATHS_PER_SHADE = 3

private func aLevel(_ e: Double) -> Int {
    let i = Int((log(e / A_MIN) / A_STEP).rounded())
    return i < 0 ? 0 : i >= A_LEVELS ? A_LEVELS - 1 : i
}
private func depthMult(_ dp: Double) -> Double { 0.3 + 0.7 * pow(max(0, dp), 1.35) }
private func thinLight(_ dw: Double) -> Double { dw >= 1 ? 1 : 1 / (0.71 + 0.3625 * ((dw > 0.2 ? dw : 0.2) - 0.2)) }

private func hslToRGB(_ h: Double, _ s: Double, _ l: Double) -> (Double, Double, Double) {
    let c = (1 - abs(2 * l - 1)) * s
    let hp = h.truncatingRemainder(dividingBy: 360) / 60
    let x = c * (1 - abs(hp.truncatingRemainder(dividingBy: 2) - 1))
    var r = 0.0, g = 0.0, b = 0.0
    if hp < 1 { r = c; g = x } else if hp < 2 { r = x; g = c } else if hp < 3 { g = c; b = x }
    else if hp < 4 { g = x; b = c } else if hp < 5 { r = x; b = c } else { r = c; b = x }
    let m = l - c / 2
    return (r + m, g + m, b + m)
}
private func hslLuma(_ h: Double, _ s: Double, _ l: Double) -> Double {
    let (r, g, b) = hslToRGB(h, s, l)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

private struct Seeded {
    var s: Double
    mutating func next() -> Double { s = (s * 16807).truncatingRemainder(dividingBy: 2147483647); return s / 2147483647 }
}

private func planeAxes(_ tx: Double, _ ty: Double) -> [Double] {
    let ctX = cos(tx), stx = sin(tx), cty = cos(ty), sty = sin(ty)
    return [cty, 0, -sty, sty * stx, ctX, cty * stx]
}

private func circleTable(_ n: Int) -> ([Double], [Double]) {
    ((0...n).map { cos(Double($0) / Double(n) * TAU) }, (0...n).map { sin(Double($0) / Double(n) * TAU) })
}

private func tintHue(_ hue0: Double, _ mS: Double, _ mL: Double, _ mT: Double) -> Double {
    var hue = hue0
    hue += (145 - hue) * mS * 0.82
    hue += (185 - hue) * mT * 0.82
    hue += (272 - hue) * mL * 0.82
    return hue
}

// MARK: the engine

/// One core of one size. Not shared between views; a view owns its engine.
final class HoloEngine {
    struct Preset { var rings, arcs, parts, embers: Int; var ringStep = 1, gratSeg = 48, arcSeg = 9, innerSeg = 48, dashSub = 3 }
    static func preset(_ size: Double) -> Preset {
        if size <= 72 { return Preset(rings: 7, arcs: 150, parts: 300, embers: 200, ringStep: 2, gratSeg: 24, arcSeg: 5, innerSeg: 24, dashSub: 1) }
        if size < 260 { return Preset(rings: 7, arcs: 150, parts: 300, embers: 200) }
        return Preset(rings: 9, arcs: 220, parts: 420, embers: 260)
    }

    private struct RingS { var f, tx, ty, w, al, spin: Double; var style: String; var tickEvery: Int; var comet: Bool; var cometSp, cometPh: Double; var ax: [Double] = [] }
    private struct InnerS { var f, tx, ty, spin, prec, ph: Double }
    private struct ArcS { var f, tx, ty, a0, len, drift, al, w, fl, fs: Double; var ax: [Double] = []; var cd = 0.0, sd = 0.0 }
    private struct EmberS { var x, y, z, sp, sz, al, tw, ts: Double }
    private struct PartS { var x, y, z: Double; var hot: Bool; var tw, ts: Double }

    let size: Double
    private let cx, cy, R, CR: Double
    private let dev: Double
    private let pre: Preset
    private var rings: [RingS] = []
    private var inner: [InnerS] = []
    private var arcs: [ArcS] = []
    private var embers: [EmberS] = []
    private var parts: [PartS] = []
    private let C96, S96, CG, SG, CI, SI: [Double]
    private let lats: [(Double, Double)]

    // live
    private var mixS = 0.0, mixL = 0.0, mixT = 0.0, clock = 0.0, last: Double?, lvl = 0.0
    private var g00 = 1.0, g01 = 0.0, g02 = 0.0, g11 = 1.0, g12 = 0.0, g20 = 0.0, g21 = 0.0, g22 = 1.0
    private var ux = 0.0, uy = 0.0, uz = 0.0, vx = 0.0, vy = 0.0, vz = 0.0
    private var PX, PY, PD, PS: [Double]
    private var shadePaths: [Path]
    private var lineKey = 0
    private var flare = 1.0
    private var lumQ = [Double](repeating: 1, count: HOLO_DEPTHS)
    private let grains: Grains

    init(size: Double, scale: Double = 2) {
        self.size = size
        cx = size / 2; cy = size / 2; R = size * 0.46; CR = CAM_D * R
        dev = scale
        pre = Self.preset(size)
        (C96, S96) = circleTable(96)
        (CG, SG) = circleTable(pre.gratSeg)
        (CI, SI) = circleTable(pre.innerSeg)
        let n = max(97, pre.gratSeg + 1, pre.innerSeg + 1, pre.arcSeg + 1, COMET_K + 1)
        PX = .init(repeating: 0, count: n); PY = PX; PD = PX; PS = PX
        shadePaths = .init(repeating: Path(), count: HOLO_DEPTHS * A_LEVELS * PATHS_PER_SHADE)
        lats = GLOBE_LATS.map { (size * 0.46 * 0.42 * cos($0), size * 0.46 * 0.42 * sin($0)) }
        grains = Grains(size: size, ringCount: pre.rings, cam: CAM_D * size * 0.46, R: size * 0.46)
        buildScene()
    }

    private func buildScene() {
        var r = Seeded(s: 7)
        let styles = ["tick", "dash", "solid", "double", "dash", "tick"]
        for i in 0..<pre.rings {
            let f = 0.55 + 0.35 * (Double(i) / Double(max(1, pre.rings - 1))) + (r.next() - 0.5) * 0.05
            let tx = (r.next() - 0.5) * 2.6, ty = r.next() * 6.28
            let w = 0.7 + r.next() * 0.8, al = 0.45 + r.next() * 0.3
            let spin = (r.next() < 0.5 ? -1.0 : 1.0) * (0.10 + r.next() * 0.28)
            let tickEvery = 6 + Int(floor(r.next() * 6))
            let cometSp = (r.next() < 0.5 ? -1.0 : 1.0) * (0.5 + r.next() * 0.5)
            let cometPh = r.next() * 6.28
            var g = RingS(f: f, tx: tx, ty: ty, w: w, al: al, spin: spin, style: styles[i % styles.count], tickEvery: tickEvery, comet: i % 3 == 1, cometSp: cometSp, cometPh: cometPh)
            g.ax = planeAxes(tx, ty)
            rings.append(g)
        }
        for i in 0..<3 {
            let tx = (r.next() - 0.5) * 3, ty = r.next() * 6.28
            let spin = (r.next() < 0.5 ? -1.0 : 1.0) * (0.9 + r.next() * 0.8)
            let prec = 0.3 + r.next() * 0.4, ph = r.next() * 6.28
            inner.append(InnerS(f: 0.13 + Double(i) * 0.045, tx: tx, ty: ty, spin: spin, prec: prec, ph: ph))
        }
        for _ in 0..<pre.arcs {
            let f = 0.48 + r.next() * 0.44, tx = (r.next() - 0.5) * 3.1, ty = r.next() * 6.28
            let a0 = r.next() * 6.28
            let len = 0.15 + r.next() * r.next() * 1.1
            let drift = (r.next() - 0.5) * 0.35
            let al = 0.16 + r.next() * 0.3, w = 0.5 + r.next() * 0.9, fl = r.next() * 6.28, fs = 0.5 + r.next() * 1.8
            var a = ArcS(f: f, tx: tx, ty: ty, a0: a0, len: len, drift: drift, al: al, w: w, fl: fl, fs: fs)
            a.ax = planeAxes(tx, ty)
            a.cd = cos(len / Double(pre.arcSeg)); a.sd = sin(len / Double(pre.arcSeg))
            arcs.append(a)
        }
        for _ in 0..<pre.embers {
            let u = r.next() * 6.2832, v = acos(2 * r.next() - 1)
            let rad = 0.06 + 0.34 * pow(r.next(), 1.4)
            let sp = (r.next() < 0.5 ? -1.0 : 1.0) * (0.1 + r.next() * 0.22)
            let sz = 0.5 + r.next() * 1.1, al = 0.22 + r.next() * 0.4, tw = r.next() * 6.28, ts = 0.6 + r.next() * 2.4
            embers.append(EmberS(x: sin(v) * cos(u) * rad * R, y: cos(v) * rad * R, z: sin(v) * sin(u) * rad * R, sp: sp, sz: sz, al: al, tw: tw, ts: ts))
        }
        let Rp = R * 0.46
        for i in 0..<pre.parts {
            let y = 1 - 2 * (Double(i) + 0.5) / Double(pre.parts), rad = (1 - y * y).squareRoot(), ph = Double(i) * 2.399963
            let tw = r.next() * 6.28, ts = 0.6 + r.next() * 2.2
            parts.append(PartS(x: rad * cos(ph) * Rp, y: y * Rp, z: rad * sin(ph) * Rp, hot: i % 9 == 0, tw: tw, ts: ts))
        }
    }

    // colour along the depth axis, with the turn's tint
    private func hsl(_ dp: Double) -> (Double, Double, Double) {
        (tintHue(222 - 28 * dp, mixS, mixL, mixT).truncatingRemainder(dividingBy: 360), 90 - 6 * dp, min(44 + 38 * dp + lvl * 10, 90))
    }
    private func lum(_ dp: Double) -> Double { let (h, s, l) = hsl(min(1, max(0, dp))); return hslLuma(h, s / 100, l / 100) }
    private func col(_ dp: Double, _ a: Double) -> Color {
        let (h, s, l) = hsl(dp)
        let (r, g, b) = hslToRGB(h, s / 100, l / 100)
        return Color(.sRGB, red: r, green: g, blue: b, opacity: max(0, min(1, a)))
    }

    // projection
    @inline(__always) private func put(_ i: Int, _ X: Double, _ Y: Double, _ Z: Double) {
        let s = CR / (CR - Z)
        PX[i] = cx + X * s; PY[i] = cy + Y * s; PD[i] = (Z / R + 1) / 2; PS[i] = s
    }
    @inline(__always) private func putG(_ i: Int, _ x: Double, _ y: Double, _ z: Double) {
        put(i, g00 * x + g01 * y + g02 * z, g11 * y + g12 * z, g20 * x + g21 * y + g22 * z)
    }
    private func plane(_ ax: [Double]) {
        ux = g00 * ax[0] + g01 * ax[1] + g02 * ax[2]; uy = g11 * ax[1] + g12 * ax[2]; uz = g20 * ax[0] + g21 * ax[1] + g22 * ax[2]
        vx = g00 * ax[3] + g01 * ax[4] + g02 * ax[5]; vy = g11 * ax[4] + g12 * ax[5]; vz = g20 * ax[3] + g21 * ax[4] + g22 * ax[5]
    }
    @inline(__always) private func onPlane(_ i: Int, _ r: Double, _ c: Double, _ s: Double) {
        put(i, r * (c * ux + s * vx), r * (c * uy + s * vy), r * (c * uz + s * vz))
    }

    @inline(__always) private func depthIndex(_ dp: Double) -> Int { dp <= 0 ? 0 : dp >= 1 ? HOLO_DEPTHS - 1 : Int(dp * Double(HOLO_DEPTHS)) }

    private func seg(_ i: Int, _ j: Int, _ alpha: Double, _ w: Double) {
        let dp = (PD[i] + PD[j]) / 2
        let a = min(1, alpha * depthMult(dp) * flare)
        let di = depthIndex(dp)
        let wl = w * (PS[i] + PS[j]) / 2
        let e = a * lum(dp) / lumQ[di] * thinLight(wl * dev)
        if e < E_DROP { return }
        let ai = aLevel(e)
        let hw = wl / 2 * (e / A_VAL[ai])
        let x1 = PX[i], y1 = PY[i], x2 = PX[j], y2 = PY[j]
        let dx = x2 - x1, dy = y2 - y1, len = (dx * dx + dy * dy).squareRoot()
        if len < 1e-6 { return }
        let nx = -dy * hw / len, ny = dx * hw / len
        let k = ((di * A_LEVELS + ai) * PATHS_PER_SHADE) + lineKey % PATHS_PER_SHADE
        shadePaths[k].move(to: CGPoint(x: x1 + nx, y: y1 + ny))
        shadePaths[k].addLine(to: CGPoint(x: x1 - nx, y: y1 - ny))
        shadePaths[k].addLine(to: CGPoint(x: x2 - nx, y: y2 - ny))
        shadePaths[k].addLine(to: CGPoint(x: x2 + nx, y: y2 + ny))
        shadePaths[k].closeSubpath()
    }

    private func strip(_ n: Int, _ alpha: Double, _ w: Double) {
        lineKey += 1
        for j in 0..<n { seg(j, j + 1, alpha, w) }
    }

    private var dotCount = 0
    private func dot(_ i: Int, _ alpha: Double, _ r: Double) {
        let dp = PD[i]
        let di = depthIndex(dp)
        let e = min(1, alpha) * lum(dp) / lumQ[di]
        if e < E_DROP { return }
        let ai = aLevel(e)
        let rr = r * PS[i] * (e / A_VAL[ai]).squareRoot()
        dotCount += 1
        let k = ((di * A_LEVELS + ai) * PATHS_PER_SHADE) + dotCount % PATHS_PER_SHADE
        shadePaths[k].addEllipse(in: CGRect(x: PX[i] - rr, y: PY[i] - rr, width: rr * 2, height: rr * 2))
    }

    /// Draws one frame. `t` in seconds; `still` draws the state's final form
    /// (the reduced-motion frame), as the web core does at t = 3.2.
    func draw(_ ctx: inout GraphicsContext, t: Double, state: CoreState, still: Bool = false) {
        lvl = still ? 0 : max(0, min(1, state.level))
        let dt = last.map { min(t - $0, 0.1) } ?? 0
        last = t
        let k = still ? 1 : 0.07
        let turn = state.turn
        mixS += ((turn == 3 ? 1 : 0) - mixS) * k
        mixL += ((turn == 1 ? 1 : 0) - mixL) * k
        mixT += ((turn == 2 ? 1 : 0) - mixT) * k
        clock += max(0, dt) * (1 + lvl * 2.6 + (mixS + mixL + mixT) * 0.4)

        let axT = 0.5 + 0.22 * sin(t * 0.09)
        let ayT = clock * 0.06
        let ca = cos(axT), sa = sin(axT), cb = cos(ayT), sb = sin(ayT)
        g00 = cb; g01 = sb * sa; g02 = sb * ca; g11 = ca; g12 = -sa; g20 = -sb; g21 = cb * sa; g22 = cb * ca

        grains.update(t: t, turn: turn, level: lvl, still: still) { [unowned self] tab in self.fillRingTab(&tab) }
        let ringsA = grains.ringsA

        ctx.blendMode = .plusLighter
        if ringsA > 0.003 {
            var rc = ctx
            rc.opacity = ringsA
            drawRings(&rc, t: t)
        }
        grains.draw(&ctx, cx: cx, cy: cy) { [unowned self] tab in self.fillRingTab(&tab) }
        // the breathing heart
        let pulse = 1 + 0.06 * sin(t * 1.8) + lvl * 1.15
        drawHeart(&ctx, hr: R * 0.125 * pulse * grains.heartScale, tint: grains.tint, k: grains.tintK)
        ctx.blendMode = .normal
    }

    private func fillRingTab(_ tab: inout [Double]) {
        for (j, g) in rings.enumerated() {
            plane(g.ax)
            let fr = g.f * R, off = g.spin * clock, o = j * 8
            tab[o] = fr * ux; tab[o + 1] = fr * uy; tab[o + 2] = fr * uz
            tab[o + 3] = fr * vx; tab[o + 4] = fr * vy; tab[o + 5] = fr * vz
            tab[o + 6] = cos(off); tab[o + 7] = sin(off)
        }
    }

    private func drawRings(_ ctx: inout GraphicsContext, t: Double) {
        for d in 0..<HOLO_DEPTHS { let (h, s, l) = hsl((Double(d) + 0.5) / Double(HOLO_DEPTHS)); lumQ[d] = hslLuma(h, s / 100, l / 100) }
        flare = 1 + lvl * 0.9
        for i in shadePaths.indices { shadePaths[i] = Path() }

        // graticule globe
        let Rg = R * 0.42, gs = clock * 0.12, cgs = cos(gs), sgs = sin(gs)
        for (rc, z0) in lats {
            for k in 0...pre.gratSeg {
                let c = CG[k] * cgs - SG[k] * sgs, s = SG[k] * cgs + CG[k] * sgs
                putG(k, rc * c, z0, rc * s)
            }
            strip(pre.gratSeg, 0.17, 0.55)
        }
        for l in 0..<6 {
            let ph = Double(l) * .pi / 6 + gs, cph = cos(ph), sph = sin(ph)
            for k in 0...pre.gratSeg { putG(k, Rg * SG[k] * cph, Rg * CG[k], Rg * SG[k] * sph) }
            strip(pre.gratSeg, 0.12, 0.55)
        }

        // the halo, filled straight away (it is a gradient, not a shade)
        let hr = R * 0.56
        ctx.fill(Path(ellipseIn: CGRect(x: cx - hr, y: cy - hr, width: hr * 2, height: hr * 2)),
                 with: .radialGradient(Gradient(stops: [
                    .init(color: col(0.5, 0.12 + lvl * 0.2), location: 0),
                    .init(color: col(0.5, 0.05 + lvl * 0.08), location: 0.6),
                    .init(color: Color(.sRGB, red: 20 / 255, green: 60 / 255, blue: 140 / 255, opacity: 0), location: 1),
                 ]), center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: hr))

        // ember cloud
        let eFlare = 1 + lvl * 1.2
        for e in embers {
            let ang = clock * e.sp * 4, c = cos(ang), s = sin(ang)
            putG(0, c * e.x + s * e.z, e.y, -s * e.x + c * e.z)
            let tw = 0.5 + 0.5 * abs(sin(clock * e.ts + e.tw))
            dot(0, e.al * tw * depthMult(PD[0]) * eFlare, e.sz)
        }
        // particle shell
        do {
            let c = cgs, s = sgs
            let m00 = g00 * c - g02 * s, m01 = g01, m02 = g00 * s + g02 * c
            let m10 = -g12 * s, m11 = g11, m12 = g12 * c
            let m20 = g20 * c - g22 * s, m21 = g21, m22 = g20 * s + g22 * c
            for p in parts {
                put(0, m00 * p.x + m01 * p.y + m02 * p.z, m10 * p.x + m11 * p.y + m12 * p.z, m20 * p.x + m21 * p.y + m22 * p.z)
                let tw = 0.55 + 0.45 * sin(clock * p.ts + p.tw)
                dot(0, (p.hot ? 0.95 : 0.5) * tw * depthMult(PD[0]) * flare, p.hot ? 1.6 : 0.95)
            }
        }
        // filament arcs
        for a in arcs {
            plane(a.ax)
            let fr = a.f * R, base = a.a0 + clock * a.drift
            let fl = 0.55 + 0.45 * sin(clock * a.fs + a.fl)
            var c = cos(base), s = sin(base)
            for k in 0...pre.arcSeg {
                onPlane(k, fr, c, s)
                let c2 = c * a.cd - s * a.sd
                s = s * a.cd + c * a.sd
                c = c2
            }
            strip(pre.arcSeg, a.al * fl * 0.85, a.w)
        }
        // gyro rings
        let cStep = cos(0.05), sStep = sin(0.05)
        for g in rings {
            plane(g.ax)
            let fr = g.f * R, off = g.spin * clock, co = cos(off), so = sin(off)
            if g.style == "solid" || g.style == "tick" || g.style == "double" {
                let alp = g.style == "tick" ? g.al * 0.55 : g.al
                let two = g.style == "double"
                for pass in 0..<(two ? 2 : 1) {
                    let rr = two ? fr + (pass == 1 ? 1 : -1) * R * 0.012 : fr
                    var n = 0
                    for k in stride(from: 0, through: 96, by: pre.ringStep) {
                        onPlane(n, rr, C96[k] * co - S96[k] * so, S96[k] * co + C96[k] * so); n += 1
                    }
                    strip(n - 1, two ? alp * 0.7 : alp, two ? g.w * 0.8 : g.w)
                }
            }
            if g.style == "dash" {
                for k in stride(from: 0, to: 96, by: 6) {
                    var n = 0
                    for j in stride(from: 0, through: 3, by: 3 / pre.dashSub) {
                        let m = k + j
                        onPlane(n, fr, C96[m] * co - S96[m] * so, S96[m] * co + C96[m] * so); n += 1
                    }
                    strip(n - 1, g.al * 1.15, g.w * 1.25)
                }
            }
            if g.style == "tick" {
                let n = Int((96.0 / Double(g.tickEvery)).rounded()) * g.tickEvery
                for k in stride(from: 0, to: n, by: g.tickEvery) where k <= 96 {
                    let c = C96[k] * co - S96[k] * so, s = S96[k] * co + C96[k] * so
                    let long = (k / g.tickEvery) % 4 == 0
                    let tl = R * (long ? 0.034 : 0.018)
                    onPlane(0, fr - tl, c, s)
                    onPlane(1, fr + tl, c, s)
                    lineKey += 1
                    seg(0, 1, g.al * (long ? 1.3 : 0.9), g.w * (long ? 1.1 : 0.8))
                }
            }
            if g.comet {
                let ah = g.cometPh + g.cometSp * clock
                let sd = -(g.cometSp < 0 ? -1.0 : 1.0) * sStep
                var c = cos(ah), s = sin(ah)
                for k in 0...COMET_K {
                    onPlane(k, fr, c, s)
                    let c2 = c * cStep - s * sd
                    s = s * cStep + c * sd
                    c = c2
                }
                lineKey += 1
                for k in 0..<COMET_K { seg(k, k + 1, 0.85 * COMET_FADE[k], 2.2 * COMET_FADE[k] + 0.5) }
                dot(0, 0.95 * depthMult(PD[0]), 2.4)
            }
        }
        // inner reactor
        for n in inner {
            let fr = n.f * R, off = n.spin * clock
            plane(planeAxes(n.tx + 0.6 * sin(t * n.prec + n.ph), n.ty + clock * 0.25))
            let co = cos(off), so = sin(off)
            for k in 0...pre.innerSeg { onPlane(k, fr, CI[k] * co - SI[k] * so, SI[k] * co + CI[k] * so) }
            strip(pre.innerSeg, 0.62, 1.05)
        }

        // fill shade by shade
        for di in 0..<HOLO_DEPTHS {
            let (h, s, l) = hsl((Double(di) + 0.5) / Double(HOLO_DEPTHS))
            let (r, g, b) = hslToRGB(h, s / 100, l / 100)
            for ai in 0..<A_LEVELS {
                let shade = Color(.sRGB, red: r, green: g, blue: b, opacity: A_VAL[ai])
                for q in 0..<PATHS_PER_SHADE {
                    let p = shadePaths[(di * A_LEVELS + ai) * PATHS_PER_SHADE + q]
                    if !p.isEmpty { ctx.fill(p, with: .color(shade)) }
                }
            }
        }

        // billboard HUD rings
        var hud1 = Path(), hud2 = Path()
        // each dash as a short polyline (a canvas arc, drawn the same way round)
        func dash(_ p: inout Path, _ r: Double, _ a0: Double, _ len: Double) {
            for q in 0...3 {
                let a = a0 + len * Double(q) / 3
                let pt = CGPoint(x: cx + r * cos(a), y: cy + r * sin(a))
                if q == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
        }
        let r1 = R * 0.985, l1 = TAU / 40 * 0.5
        for k in 0..<40 { dash(&hud1, r1, Double(k) / 40 * TAU + clock * 0.12, l1) }
        let r2 = R * 0.93, l2 = TAU / 64 * 0.32
        for k in 0..<64 { dash(&hud2, r2, -clock * 0.08 + Double(k) / 64 * TAU, l2) }
        ctx.stroke(hud1, with: .color(Color(.sRGB, red: 89 / 255, green: 230 / 255, blue: 1, opacity: 0.4)), lineWidth: 1.2)
        ctx.stroke(hud2, with: .color(Color(.sRGB, red: 143 / 255, green: 123 / 255, blue: 1, opacity: 0.22)), lineWidth: 0.9)

        // the state-tinted bloom round the heart
        let bloomA = (mixS + mixL + mixT) * (0.22 + lvl * 0.5)
        if bloomA > 0.02 {
            let br = R * (0.30 + lvl * 0.26)
            ctx.fill(Path(ellipseIn: CGRect(x: cx - br, y: cy - br, width: br * 2, height: br * 2)),
                     with: .radialGradient(Gradient(colors: [col(0.9, min(bloomA, 0.8)), col(0.1, 0)]),
                                           center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: br))
        }
    }

    private func drawHeart(_ ctx: inout GraphicsContext, hr: Double, tint: (Double, Double, Double), k: Double) {
        func m(_ v: Double, _ c: Double) -> Double { (v + (c - v) * k) / 255 }
        let mid: Color, outer: Color
        if k > 0 {
            mid = Color(.sRGB, red: m(158, tint.0), green: m(240, tint.1), blue: m(255, tint.2), opacity: 0.8)
            outer = Color(.sRGB, red: m(64, tint.0), green: m(170, tint.1), blue: m(238, tint.2), opacity: 0.35)
        } else {
            mid = Color(.sRGB, red: 158 / 255, green: 240 / 255, blue: 1, opacity: 0.8)
            outer = Color(.sRGB, red: 64 / 255, green: 170 / 255, blue: 238 / 255, opacity: 0.35)
        }
        let rr = hr * 3.2
        ctx.fill(Path(ellipseIn: CGRect(x: cx - rr, y: cy - rr, width: rr * 2, height: rr * 2)),
                 with: .radialGradient(Gradient(stops: [
                    .init(color: Color(.sRGB, red: 240 / 255, green: 252 / 255, blue: 1, opacity: 0.95), location: 0),
                    .init(color: mid, location: 0.18),
                    .init(color: outer, location: 0.45),
                    .init(color: Color(.sRGB, red: 20 / 255, green: 60 / 255, blue: 140 / 255, opacity: 0), location: 1),
                 ]), center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: rr))
    }
}

// MARK: the grain body (coreGrains.js)

private final class Grains {
    static func count(_ size: Double) -> Int { size >= 260 ? 1400 : size > 72 ? 560 : size > 40 ? 240 : 160 }
    private static let DL_MAX = 110.0
    private static let STILL_T = 6400.0
    // forms
    private static let F_REST = 0, F_LISTEN = 1, F_STRATA = 2, F_KNOT = 3, F_MEMBRANE = 4, F_SNAP = 5
    private static let STEPS: [[(Int, Double, Double)]] = [
        [(F_REST, 0, 1100)],
        [(F_LISTEN, 0, 700)],
        [(F_STRATA, 0, 220), (F_KNOT, 220 + DL_MAX, 600)],
        [(F_STRATA, 0, 220), (F_MEMBRANE, 220 + DL_MAX, 450)],
    ]
    private static let C_REST: (Double, Double, Double) = (120, 190, 255)
    private static let STATE_C: [(Double, Double, Double)] = [(120, 190, 255), (176, 160, 255), (89, 230, 255), (80, 228, 168)]
    private static let C_JADE_RIM: (Double, Double, Double) = (150, 250, 240)
    private static let C_JADE_GLOW: (Double, Double, Double) = (30, 200, 140)

    let N: Int
    let U: Double
    let side: Double
    let orbits: Bool
    let cam: Double
    let RH: Double
    let ringCount: Int
    var tab: [Double]

    private var built = false
    private var X = [Double](), Y = [Double](), Z = [Double](), CRA = [Double](), SRA = [Double](), C11 = [Double](), S11 = [Double](), W1 = [Double](), W2 = [Double]()
    private var SY = [Double](), SR = [Double](), SX = [Double](), CA = [Double](), SA = [Double](), CU = [Double](), SU = [Double](), CW = [Double](), SW = [Double](), KW = [Double]()
    private var C2T = [Double](), S2T = [Double](), C3P = [Double](), S3P = [Double](), DL = [Double](), AL = [Double](), SZ = [Double]()
    private var RING = [Int](), ORBIT = [Int]()
    private var LX = [Double](), LY = [Double](), LZ = [Double](), LA = [Double](), LT = [Int]()
    private var FX = [Double](), FY = [Double](), FZ = [Double](), FA = [Double](), FT = [Int]()

    // the turn
    private var turn = 0, turnAt = -1e12, step = 0
    private var form = 0, fromF = 0, formAt = -1e12, formD = 1.0, stag = 0.4, settledAt = -1e12
    private var T = 0.0, lvl = 0.0, still = false
    private struct Tw { var a: Double, b: Double, at = 0.0, d = 1.0 }
    private var ringsW = Tw(a: 1, b: 1), spW = Tw(a: 0, b: 0), glowW = Tw(a: 0, b: 0)
    private var cFrom = C_REST, cNow = C_REST, cTo = C_REST, cAt = 0.0, cD = 1.0
    private var body = C_REST, rim = C_REST
    private var ringsNow = 1.0, glowNow = 0.0
    private var breathAt = -1e12

    // what the engine reads
    var ringsA = 1.0
    var active = false
    var heartScale = 1.0
    var tint: (Double, Double, Double) = C_REST
    var tintK = 0.0

    init(size: Double, ringCount: Int, cam: Double, R: Double) {
        N = Self.count(size)
        U = size * 0.43
        let u = U
        side = u >= 112 ? (1.25 * u) / 112 : u >= 90 ? 1.25 : u >= 25 ? 1 + (0.25 * (u - 25)) / 65 : u > 15.5 ? 0.9 + (0.1 * (u - 15.5)) / 9.5 : 0.9
        orbits = size > 72
        self.cam = cam
        RH = R
        self.ringCount = ringCount
        tab = .init(repeating: 0, count: ringCount * 8)
    }

    private static func eo(_ x: Double) -> Double { 1 - (1 - x) * (1 - x) * (1 - x) }
    private static func eio(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - (2 - 2 * x) * (2 - 2 * x) * (2 - 2 * x) / 2 }
    private func tv(_ w: Tw) -> Double {
        let p = (T - w.at) / w.d
        return p >= 1 ? w.b : p <= 0 ? w.a : w.a + (w.b - w.a) * Self.eio(p)
    }
    private func aim(_ w: inout Tw, _ b: Double, _ d: Double, _ delay: Double = 0) {
        if b == w.b { return }
        w.a = tv(w); w.b = b; w.at = T + delay; w.d = d
    }
    private static func mix(_ a: (Double, Double, Double), _ b: (Double, Double, Double), _ k: Double) -> (Double, Double, Double) {
        (a.0 + (b.0 - a.0) * k, a.1 + (b.1 - a.1) * k, a.2 + (b.2 - a.2) * k)
    }

    private func build() {
        func f() -> [Double] { .init(repeating: 0, count: N) }
        X = f(); Y = f(); Z = f(); CRA = f(); SRA = f(); C11 = f(); S11 = f(); W1 = f(); W2 = f()
        SY = f(); SR = f(); SX = f(); CA = f(); SA = f(); CU = f(); SU = f(); CW = f(); SW = f(); KW = f()
        C2T = f(); S2T = f(); C3P = f(); S3P = f(); DL = f(); AL = f(); SZ = f()
        RING = .init(repeating: 0, count: N); ORBIT = RING
        LX = f(); LY = f(); LZ = f(); LA = f(); LT = .init(repeating: 0, count: N)
        FX = f(); FY = f(); FZ = f(); FA = f(); FT = LT
        var r = Seeded(s: 11)
        let phi = Double.pi * (3 - 5.0.squareRoot())
        let l0 = (0.45 * 0.45 + 0.8 * 0.8 + 0.35 * 0.35).squareRoot()
        let DIR = (0.45 / l0, -0.8 / l0, 0.35 / l0)
        for i in 0..<N {
            let y0 = 1 - (2 * (Double(i) + 0.5)) / Double(N), rad = (1 - y0 * y0).squareRoot(), th0 = phi * Double(i)
            var x = cos(th0) * rad + (r.next() - 0.5) * 0.07
            var y = y0 + (r.next() - 0.5) * 0.07
            var z = sin(th0) * rad + (r.next() - 0.5) * 0.07
            let l = (x * x + y * y + z * z).squareRoot()
            x /= l; y /= l; z /= l
            X[i] = x; Y[i] = y; Z[i] = z
            let ra = r.next() * 6.283, u = r.next(), v = r.next() * 2 - 1, s1 = 0.5 + r.next() * 2, s2 = r.next() * 6.28
            AL[i] = 0.55 + r.next() * 0.45
            SZ[i] = 0.75 + r.next() * 0.75
            CRA[i] = cos(ra); SRA[i] = sin(ra)
            RING[i] = i % ringCount
            ORBIT[i] = i % 9 == 0 ? (i % 2 == 1 ? 1 : 2) : 0
            DL[i] = ((1 - y) / 2) * Self.DL_MAX
            let d = 11 * (x * DIR.0 + y * DIR.1 + z * DIR.2)
            C11[i] = cos(d); S11[i] = sin(d)
            W1[i] = 0.0015 * s1; W2[i] = s2
            let k = min(8, Int(floor(((y + 1) / 2) * 9))), ly = -0.74 + (1.48 * Double(k)) / 8
            SY[i] = ly
            SR[i] = max(0.06, 1 - ly * ly).squareRoot() * 0.92
            SX[i] = k % 2 == 1 ? 0.2 : -0.2
            let th = atan2(z, x), ph = acos(max(-1, min(1, y)))
            CA[i] = cos(th); SA[i] = sin(th)
            CU[i] = cos(u * TAU); SU[i] = sin(u * TAU)
            CW[i] = cos(u * TAU * 1.2); SW[i] = sin(u * TAU * 1.2)
            KW[i] = 0.15 * ((v * 2).rounded() / 2)
            C2T[i] = cos(2 * th); S2T[i] = sin(2 * th)
            C3P[i] = cos(3 * ph); S3P[i] = sin(3 * ph)
        }
        built = true
    }

    private func begin(_ si: Int) {
        let prevF = form
        let live = T >= settledAt - 1
        if !live { FX = LX; FY = LY; FZ = LZ; FA = LA; FT = LT }
        let s = Self.STEPS[turn][si]
        step = si
        form = s.0
        formAt = turnAt + s.1
        formD = s.2
        fromF = live ? prevF : Self.F_SNAP
        stag = form == Self.F_STRATA || prevF == Self.F_STRATA ? 1 : 0.4
        settledAt = formAt + formD + Self.DL_MAX * stag
        if form == Self.F_MEMBRANE { breathAt = formAt + 230 }
    }

    func update(t: Double, turn want: Int, level: Double, still isStill: Bool, fill: (inout [Double]) -> Void) {
        T = isStill ? Self.STILL_T : t * 1000
        if !built {
            if want == 0 { return }
            build()
        }
        if want == 0 && turn == 0 && !active && !isStill { return }
        still = isStill
        lvl = isStill ? 0 : level
        if isStill {
            turn = want
            step = Self.STEPS[want].count - 1
            form = Self.STEPS[want][step].0
            fromF = form
            formAt = -1e12; settledAt = -1e12; formD = 1
            ringsW = Tw(a: want == 0 ? 1 : 0, b: want == 0 ? 1 : 0)
            spW = Tw(a: want == 3 ? 1 : 0, b: want == 3 ? 1 : 0)
            glowW = Tw(a: form == Self.F_MEMBRANE ? 1 : 0, b: form == Self.F_MEMBRANE ? 1 : 0)
            cTo = Self.STATE_C[want]; cFrom = cTo; cAt = -1e12
        } else {
            let home = want == 0
            aim(&ringsW, home ? 1 : 0, home ? 700 : 450, home ? 300 : 0)
            aim(&spW, want == 3 ? 1 : 0, home ? 900 : 420)
            let ct = Self.STATE_C[want]
            if ct != cTo {
                cFrom = cNow; cTo = ct; cAt = T; cD = home ? 900 : 420
            }
            if want != turn { turn = want; turnAt = T; step = -1 }
            let steps = Self.STEPS[turn]
            var si = 0
            for k in 1..<max(1, steps.count) where T >= turnAt + steps[k].1 { si = k }
            if si != step { begin(si) }
            aim(&glowW, form == Self.F_MEMBRANE ? 1 : 0, form == Self.F_MEMBRANE ? 450 : 300)
        }
        ringsNow = tv(ringsW)
        let sp = tv(spW)
        glowNow = tv(glowW)
        let cp = max(0, min(1, (T - cAt) / cD))
        cNow = Self.mix(cFrom, cTo, cp >= 1 ? 1 : Self.eio(cp))
        let sw = sp
        body = cNow
        rim = Self.mix(body, (255, 255, 255), 0.5)
        if sw > 0 { rim = Self.mix(rim, Self.C_JADE_RIM, sw) }
        tint = Self.mix(body, Self.C_JADE_GLOW, sw)
        ringsA = ringsNow
        heartScale = 1 + 0.12 * sp
        tintK = (0.45 + 0.4 * sw) * (1 - ringsNow)
        active = isStill ? want != 0 : !(turn == 0 && T >= settledAt && ringsNow >= 1)
    }

    // this frame's terms
    private var lc = 0.0, ls = 0.0, lyC = 0.0, lyS = 0.0, lAmp = 0.0, lA = 0.0, sc = 0.0, ss = 0.0, kc = 0.0, ks = 0.0
    private var kwc = 0.0, kws = 0.0, kyC = 0.0, kyS = 0.0, kpC = 0.0, kpS = 0.0
    private var m1c = 0.0, m1s = 0.0, m2c = 0.0, m2s = 0.0, myC = 0.0, myS = 0.0, o1c = 0.0, o1s = 0.0, o2c = 0.0, o2s = 0.0
    private var sweep = 0.0, shrink = 1.0, lip = 0.0
    private let LP = (cos(0.32), sin(0.32)), MP = (cos(0.22), sin(0.22))
    private let ORB1 = [cos(1.15), sin(1.15), cos(0.4), sin(0.4)], ORB2 = [cos(-0.75), sin(-0.75), cos(1.9), sin(1.9)]

    private func prep() {
        lc = cos(T * 0.0075); ls = sin(T * 0.0075)
        lyC = cos(T * 0.00018); lyS = sin(T * 0.00018)
        lAmp = 0.05 * (0.25 + lvl * 1.3)
        lA = 0.3 + lvl
        sc = cos(T * 0.0005); ss = sin(T * 0.0005)
        kc = cos(T * 0.00032); ks = sin(T * 0.00032)
        kwc = cos(T * 0.000784); kws = sin(T * 0.000784)
        kyC = cos(T * 0.00045); kyS = sin(T * 0.00045)
        let kp = 0.5 + 0.15 * sin(T * 0.0003)
        kpC = cos(kp); kpS = sin(kp)
        m1c = cos(T * 0.0013); m1s = sin(T * 0.0013)
        m2c = cos(T * 0.0009); m2s = sin(T * 0.0009)
        myC = cos(T * 0.00012); myS = sin(T * 0.00012)
        o1c = cos(T * 0.0006); o1s = sin(T * 0.0006)
        o2c = cos(T * -0.00048); o2s = sin(T * -0.00048)
        lip = still ? 0 : min(1, lvl * 1.3)
        let sa = T - breathAt
        let breath = still || sa < 0 || sa >= 490 ? 1 : sa < 90 ? 1 - 0.07 * Self.eo(sa / 90) : 0.93 + 0.07 * Self.eo((sa - 90) / 400)
        shrink = breath
        sweep = -1.15 + (T * 0.00035).truncatingRemainder(dividingBy: 1) * 2.4
    }

    private func proj(_ x: Double, _ y: Double, _ z: Double, _ cy: Double, _ sy: Double, _ cp: Double, _ sp: Double) -> (Double, Double, Double) {
        let x1 = x * cy + z * sy, z1 = -x * sy + z * cy
        let y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp
        let k = 1 + z2 * 0.14
        return (x1 * k, y1 * k, z2)
    }

    /// [x, y, depth, alpha, tone] of grain i in form f
    private func at(_ f: Int, _ i: Int) -> (Double, Double, Double, Double, Int) {
        switch f {
        case Self.F_REST:
            let j = RING[i] * 8
            let c = CRA[i] * tab[j + 6] - SRA[i] * tab[j + 7], s = SRA[i] * tab[j + 6] + CRA[i] * tab[j + 7]
            let px = c * tab[j] + s * tab[j + 3], py = c * tab[j + 1] + s * tab[j + 4], pz = c * tab[j + 2] + s * tab[j + 5]
            let k = cam > 0 ? cam / (cam - pz) : 1
            let z = pz / RH, dp = (z + 1) / 2
            return (px * k / U, py * k / U, z, 0.55 * (0.3 + 0.7 * pow(max(0, dp), 1.35)), 0)
        case Self.F_LISTEN:
            let rip = S11[i] * lc - C11[i] * ls
            let r = 0.8 * (1 + rip * lAmp) + 0.02 * sin(T * W1[i] + W2[i])
            let o = proj(X[i] * r, Y[i] * r, Z[i] * r, lyC, lyS, LP.0, LP.1)
            return (o.0, o.1, o.2, (0.26 + 0.6 * (0.5 + 0.5 * rip) * lA) * (0.5 + 0.25 * (o.2 + 1)), 0)
        case Self.F_STRATA:
            let ca = CA[i] * sc - SA[i] * ss, sa = SA[i] * sc + CA[i] * ss
            return (SR[i] * ca + SX[i], SY[i] + sa * 0.03, sa, 0.5 + 0.15 * (sa + 1), 0)
        case Self.F_KNOT:
            let cu = CU[i] * kc - SU[i] * ks, su = SU[i] * kc + CU[i] * ks
            let c2 = cu * cu - su * su, s2 = 2 * su * cu
            let c3 = cu * (4 * cu * cu - 3), s3 = su * (3 - 4 * su * su)
            let kx = (su + 2 * s2) * 0.3, ky = (cu - 2 * c2) * 0.3 + 0.15, kz = -s3 * 0.3
            var tx = cu + 4 * c2, ty = 4 * s2 - su, tz = -3 * c3
            let tl = (tx * tx + ty * ty + tz * tz).squareRoot()
            if tl > 0 { tx /= tl; ty /= tl; tz /= tl }
            var nx = ty - tz * 0.35, ny = -tx, nz = tx * 0.35
            let nl = (nx * nx + ny * ny + nz * nz).squareRoot()
            if nl > 0 { nx /= nl; ny /= nl; nz /= nl }
            let bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx
            let ct = CW[i] * kwc - SW[i] * kws, st = SW[i] * kwc + CW[i] * kws
            let cw = ct * KW[i], sw = st * KW[i] * 0.35
            let o = proj(kx + nx * cw + bx * sw, ky + ny * cw + by * sw, kz + nz * cw + bz * sw, kyC, kyS, kpC, kpS)
            return (o.0, o.1, o.2, 0.45 + 0.25 * (o.2 + 1), 0)
        case Self.F_MEMBRANE:
            let ob = orbits ? ORBIT[i] : 0
            if ob != 0 {
                let oc = ob == 1 ? o1c : o2c, os = ob == 1 ? o1s : o2s, q = ob == 1 ? ORB1 : ORB2
                let px = (CRA[i] * oc - SRA[i] * os) * 1.12, py = (SRA[i] * oc + CRA[i] * os) * 1.12
                let py2 = q[0] * py, pz2 = q[1] * py
                let o = proj(q[2] * px + q[3] * pz2, py2, -q[3] * px + q[2] * pz2, myC, myS, MP.0, MP.1)
                return (o.0, o.1, o.2, 0.42 * (0.45 + 0.275 * (o.2 + 1)), 1)
            }
            let y = Y[i]
            var r = 0.84 + lvl * 0.075 + 0.05 * (S2T[i] * m1c + C2T[i] * m1s) + 0.04 * (S3P[i] * m2c - C3P[i] * m2s)
            if y > 0.55 { let q = (y - 0.55) / 0.45; r += 0.11 * lip * q * q }
            r *= shrink
            let o = proj(X[i] * r, y * r, Z[i] * r, myC, myS, MP.0, MP.1)
            let edge = 1 - abs(o.2)
            var a = (0.24 + 0.66 * edge * edge) * (0.8 + 0.2 * o.2)
            let ds = o.1 - sweep
            if ds > -0.21 && ds < 0.21 { a += 0.3 * exp(-(ds * ds) / 0.0049) }
            return (o.0, o.1, o.2, a, edge > 0.66 ? 1 : 0)
        default:
            return (0, 0, 0, 0, 0)
        }
    }

    func draw(_ ctx: inout GraphicsContext, cx: Double, cy: Double, fill: (inout [Double]) -> Void) {
        guard active else { return }
        if glowNow > 0.004 {
            let a = (0.12 + 0.28 * lvl) * glowNow
            let g = tint
            let rr = U * 0.86
            ctx.fill(Path(ellipseIn: CGRect(x: cx - rr, y: cy - rr, width: rr * 2, height: rr * 2)),
                     with: .radialGradient(Gradient(colors: [Color(.sRGB, red: g.0 / 255, green: g.1 / 255, blue: g.2 / 255, opacity: a),
                                                             Color(.sRGB, red: g.0 / 255, green: g.1 / 255, blue: g.2 / 255, opacity: 0)]),
                                           center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: rr))
        }
        prep()
        if form == Self.F_REST || fromF == Self.F_REST { fill(&tab) }
        let ga = 1 - ringsNow
        let settled = still || T >= settledAt
        // grains are bucketed by tone and 16 alpha steps, one fill each
        var buckets = [Path](repeating: Path(), count: 32)
        for i in 0..<N {
            var v: (Double, Double, Double, Double, Int)
            let pr = settled ? 1 : (T - formAt - DL[i] * stag) / formD
            if pr >= 1 {
                v = at(form, i)
            } else {
                let q = fromF == Self.F_SNAP ? (FX[i], FY[i], FZ[i], FA[i], FT[i]) : at(fromF, i)
                if pr <= 0 { v = q } else {
                    let o = at(form, i), k = Self.eio(pr)
                    v = (q.0 + (o.0 - q.0) * k, q.1 + (o.1 - q.1) * k, q.2 + (o.2 - q.2) * k, q.3 + (o.3 - q.3) * k, k > 0.5 ? o.4 : q.4)
                }
            }
            LX[i] = v.0; LY[i] = v.1; LZ[i] = v.2; LA[i] = v.3; LT[i] = v.4
            var al = v.3 * AL[i] * ga
            if al < 0.02 { continue }
            if al > 1 { al = 1 }
            let s = side * SZ[i] * (1 + v.2 * 0.15)
            let b = v.4 * 16 + min(15, Int(al * 16))
            buckets[b].addRect(CGRect(x: cx + v.0 * U - s / 2, y: cy + v.1 * U - s / 2, width: s, height: s))
        }
        let bodyC = body, rimC = rim
        for b in 0..<32 where !buckets[b].isEmpty {
            let c = b >= 16 ? rimC : bodyC
            let alpha = (Double(b % 16) + 0.5) / 16
            ctx.fill(buckets[b], with: .color(Color(.sRGB, red: c.0 / 255, green: c.1 / 255, blue: c.2 / 255, opacity: alpha)))
        }
    }
}

// MARK: the view

/// The core as a view. It animates at up to 30 frames a second while the
/// app is frontmost and the wrist is raised, and draws one still frame
/// under Reduce Motion, in the Always On state, or when `still` is set.
struct NovaCoreView: View {
    var size: CGFloat
    var state: CoreState = .rest
    var still: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isLuminanceReduced) private var luminanceReduced
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.displayScale) private var displayScale
    @State private var box = EngineBox()

    private var paused: Bool { still || reduceMotion || luminanceReduced || scenePhase != .active }

    var body: some View {
        Group {
            if paused {
                Canvas { ctx, _ in
                    box.engine(size: size, scale: displayScale).draw(&ctx, t: 3.2, state: state, still: true)
                }
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: false)) { tl in
                    Canvas { ctx, _ in
                        box.engine(size: size, scale: displayScale).draw(&ctx, t: box.time(tl.date), state: state)
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Holds the engine across renders (a class so drawing can mutate it).
final class EngineBox {
    private var e: HoloEngine?
    private let start = Date()
    func engine(size: CGFloat, scale: CGFloat) -> HoloEngine {
        if let e, e.size == Double(size) { return e }
        let n = HoloEngine(size: Double(size), scale: Double(scale))
        e = n
        return n
    }
    /// seconds since this core appeared, begun at the still frame's moment
    func time(_ d: Date) -> Double { 3.2 + d.timeIntervalSince(start) }
}
