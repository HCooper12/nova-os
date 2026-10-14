import SwiftUI
import WidgetKit

@main
struct NovaLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        NovaLiveActivityWidget()
        NovaRingsWidget()
        NovaNumberWidget()
        NovaFuelWidget()
        NovaTodayWidget()
    }
}
