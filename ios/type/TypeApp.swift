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
    var body: some View {
        TypeWebView()
            .ignoresSafeArea()
            .background(Color(red: 1, green: 1, blue: 1)) // paper, until the page paints its theme
    }
}
