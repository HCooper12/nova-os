import SwiftUI

@main
struct NovaWatchApp: App {
    @State private var model: AppModel = {
        #if DEBUG
        if let name = UserDefaults.standard.string(forKey: "novaFixture") { return Fixture.model(named: name) }
        #endif
        return AppModel()
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var model = model
        Group {
            #if DEBUG
            if let gallery = Fixture.gallery { gallery } else { main }
            #else
            main
            #endif
        }
        .onChange(of: scenePhase, initial: true) { _, p in
            if p == .active { model.becameActive() }
        }
    }

    @ViewBuilder private var main: some View {
        @Bindable var model = model
        if !model.paired {
            PairingView(fixtureCode: Fixture.pairCode)
        } else {
            NavigationStack(path: $model.path) {
                // Home, then Fuel, a crown turn apart (the mockup's page order;
                // Train, Jobs and Inbox come in later iterations)
                TabView(selection: $model.page) {
                    TalkView()
                        .tag(0)
                        .userActivity("com.haydencooper.novaos.talk", isActive: model.page == 0) { a in
                            a.title = "Talk to Nova"
                            a.isEligibleForHandoff = true
                        }
                    FuelView()
                        .tag(1)
                        .userActivity("com.haydencooper.novaos.fuel", isActive: model.page == 1) { a in
                            a.title = "Fuel"
                            a.isEligibleForHandoff = true
                        }
                }
                .tabViewStyle(.verticalPage)
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: Route.self) { r in
                    switch r {
                    case .estimate: EstimateView()
                    case let .portion(u): PortionView(usual: u, times: Fixture.portionTimes ?? 1)
                    case .kept: KeptView()
                    }
                }
            }
            .onOpenURL { url in
                // novawatch://talk from the core complication and the stack card
                if url.host() == "talk" { model.path = []; model.page = 0; model.tapTalk() }
                if url.host() == "fuel" { model.path = []; model.page = 1 }
            }
        }
    }
}
