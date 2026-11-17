#if DEBUG
import SwiftUI

// `-novaFixture <name>` draws one screen with exactly the mockup's content
// (times aside: the simulator's clock is set when it is photographed), so
// it can be photographed beside mockup 119. Debug builds only: this file is
// compiled out of Release, and nothing else reads the launch argument.

extension Fixture {
    static var gallery: AnyView? = nil

    static let ask = "How much protein have I got left?"
    static let answer = "Forty-eight grams. Dinner covers it."

    static func model(named name: String) -> AppModel {
        let m = AppModel(fixture: true)
        let mockToday = Today(at: nil, date: nil,
                              protein: Metric(value: 76, goal: 172), kcal: Metric(value: 1180, goal: 2600),
                              steps: nil, stepsAt: nil, hrv: nil, session: nil,
                              usuals: [
                                Usual(key: "chicken", name: "Chicken rice bowl", macros: Macros(p: 48, c: nil, f: nil, kcal: 610), count: nil, lastDate: nil),
                                Usual(key: "tuna", name: "Tuna wrap", macros: Macros(p: 34, c: nil, f: nil, kcal: 430), count: nil, lastDate: nil),
                              ], usualsError: nil)
        let panel = TalkPanel(number: "48", unit: "g", label: "protein left", progress: 0.72)
        switch name {
        case "talk-rest":
            FixtureText.restLine = "Push at 5:30.\n48 g protein to go."
            // the rest rings: 36.2, 34.6 and 27 of 50.3
            m.today = Today(protein: Metric(value: 36.2, goal: 50.3), kcal: Metric(value: 34.6, goal: 50.3), steps: Metric(value: 27, goal: 50.3))
        case "talk-listening":
            FixtureText.heard = ask
            m.talk = .listening
        case "talk-thinking":
            m.talk = .thinking(heard: ask)
        case "talk-speaking":
            m.talk = .speaking(heard: ask, text: answer, lit: 6)
            m.panel = panel
        case "talk-done":
            m.talk = .done(text: answer)
            m.panel = panel
        case "fuel":
            m.today = mockToday
            m.page = 1
        case "estimate":
            m.today = mockToday
            m.page = 1
            m.estimate = .ready(Estimate(estimateId: "fixture", heard: "Two eggs on toast and a long black", name: nil,
                                         lines: [EstimateLine(name: "2 eggs", kcal: 148), EstimateLine(name: "Toast, 2 slices", kcal: 190), EstimateLine(name: "Long black", kcal: 4)],
                                         macros: Macros(p: 19, c: nil, f: nil, kcal: 342)), dropped: [])
            m.path = [.estimate]
        case "portion":
            m.today = mockToday
            m.page = 1
            portionTimes = 1.5
            m.path = [.portion(Usual(key: "chicken", name: "Chicken rice bowl", macros: Macros(p: 48, c: nil, f: nil, kcal: 610), count: nil, lastDate: nil))]
        case "offline-kept":
            FixtureText.keptSentence = "Your phone is out of reach. I will send this when it is back."
            m.today = mockToday
            m.page = 1
            m.kept = [PendingWrite(idempotencyKey: "fixture-kept-0001", kind: .usual(key: "tuna", times: 1), name: "Tuna wrap",
                                   macros: Macros(p: 34, c: nil, f: nil, kcal: 430), keptAt: .now)]
            m.path = [.kept]
        case "unreachable":
            FixtureText.time = "1:52 pm"
            FixtureText.unreachableNote = "Logging and capture still work here. Questions need the Mac awake."
            m.talk = .unreachable(lastSeen: .now)
        case "pairing":
            m.paired = false
            pairCode = "482913"
        case "widgets", "widgets-face":
            gallery = AnyView(FaceGallery())
        case "widgets-stack":
            gallery = AnyView(StackGallery())
        default:
            break
        }
        return m
    }
}

extension Today {
    init(protein: Metric?, kcal: Metric?, steps: Metric?) {
        self.init(at: nil, date: nil, protein: protein, kcal: kcal, steps: steps, stepsAt: nil, hrv: nil, session: nil, usuals: nil, usualsError: nil)
    }
}

/// w15: the complications as he would compose them on a face. Apple draws
/// the face and its clock; this draws the clock where the mockup sketches
/// it, and leaves the job slot empty (that kind waits for a jobs endpoint).
struct FaceGallery: View {
    private let today = Today(at: nil, date: nil, protein: Metric(value: 40, goal: 172), kcal: nil, steps: Metric(value: 3200, goal: 10000),
                              stepsAt: nil, hrv: nil, session: "Push at 5:30 pm", usuals: nil, usualsError: nil)
    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            HStack {
                CoreCircular(size: 44)
                Spacer()
                Text("10:09").font(.ui(40, .semibold)).tracking(-1.2).monospacedDigit().foregroundStyle(.white)
            }
            .padding(.horizontal, 18).padding(.top, 22)
            NextRectangular(today: today, paired: true)
                .padding(.horizontal, 18).padding(.top, 86)
            VStack {
                Spacer()
                HStack {
                    MetricCircular(value: today.protein?.value, progress: today.protein?.progress, c: Nova.protein, text: { Fmt.int($0) })
                    Spacer()
                    MetricCircular(value: today.steps?.value, progress: today.steps?.progress, c: Nova.steps, text: { Fmt.compact($0) }, fontSize: 13)
                    Spacer()
                    Color.clear.frame(width: 46, height: 46)
                }
                .padding(.horizontal, 16).padding(.bottom, 18)
            }
        }
        .screenFrame()
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// w16: the Smart Stack cards. The Forge card waits for a jobs endpoint, so
/// the Fuel card is the top one here.
struct StackGallery: View {
    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            VStack(spacing: 6) {
                StackPlate(c: Nova.protein) {
                    StackFuelContent(left: 132, usualName: "Oats and whey", paired: true) { PlusDisc() }
                }
                StackPlate(c: nil) { StackTalkContent() }
                Spacer(minLength: 0)
            }
            .padding(EdgeInsets(top: 34, leading: 8, bottom: 0, trailing: 8))
        }
        .screenFrame()
    }
}
#endif
