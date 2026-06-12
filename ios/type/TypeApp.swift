import SwiftUI

// type for iPhone — a native shell around the same single sheet of paper
// the desktop app wraps. The web layer does all the writing; this side
// owns the keyboard chrome, iCloud saving, and the share of feedback.
@main
struct TypeApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @ObservedObject private var theme = ThemeStore.shared

    var body: some View {
        TypeWebView()
            .ignoresSafeArea()
            .background(theme.bg)                              // last session's paper color
            .preferredColorScheme(theme.dark ? .dark : .light) // status bar legible on dark paper
    }
}
