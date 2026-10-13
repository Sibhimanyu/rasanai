import AppKit
import StudioCore
import SwiftUI

/// Which films a library page shows.
enum LibraryMode: String, Hashable {
    case all, needsReview
    var title: String { self == .all ? "All films" : "Needs review" }
}

// MARK: Sidebar

/// The app's sidebar: the places in the studio, with Queue and Settings at the foot. It folds to a rail of icons
/// (⌃⌘S, or the button at the bottom) and remembers which way the person left it.
struct AppSidebar: View {
    @Bindable var store: StudioStore
    @Binding var collapsed: Bool
    @Environment(\.openSettings) private var openSettings

    private enum Place: Hashable { case home, all, needsReview, brands, templates, inspire, queue }

    private var current: Place? {
        switch store.path.last {
        case nil: .home
        case .library(.all)?: .all
        case .library(.needsReview)?: .needsReview
        case .brands?, .brand?: .brands
        case .templates?: .templates
        case .inspire?: .inspire
        case .queue?: .queue
        default: nil
        }
    }
    private var needsYouCount: Int { store.visibleProjects.filter { store.summary(for: $0.1).phase.needsYou }.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Color.clear.frame(height: 30)   // the window's traffic lights sit here
            brand.padding(.bottom, 14)
            item(.home, "Home", "house")
            item(.all, "All films", "film.stack")
            item(.needsReview, "Needs review", "clock", badge: needsYouCount)
            item(.brands, "Brands", "tag")
            item(.templates, "Templates", "square.grid.2x2")
            item(.inspire, "Inspiration", "sparkles")
            Spacer(minLength: 12)
            Divider().padding(.horizontal, collapsed ? 10 : 14).padding(.bottom, 8)
            item(.queue, "Queue", "list.bullet.rectangle", badge: store.settings.filmQueue.count)
            row(nil, "Settings", "gearshape") { openSettings() }
            row(nil, collapsed ? "Expand sidebar" : "Collapse sidebar", collapsed ? "sidebar.right" : "sidebar.left", quiet: true) {
                withAnimation(.snappy(duration: 0.22)) { collapsed.toggle() }
            }
            .keyboardShortcut("s", modifiers: [.control, .command])
        }
        .padding(.horizontal, 10).padding(.bottom, 14)
        .frame(width: collapsed ? 76 : 236)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Workspace.sidebar)
        .overlay(alignment: .trailing) { Rectangle().fill(Workspace.hairline).frame(width: 1) }
    }

    private var brand: some View {
        HStack(spacing: 10) {
            RasanMark().fill(Color.rasan).frame(width: 20, height: 25)
            if !collapsed { Text("RasanAI Studio").font(.system(size: 16, weight: .semibold)).lineLimit(1).fixedSize() }
        }
        .padding(.horizontal, collapsed ? 0 : 10)
        .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
        .accessibilityElement(children: .combine).accessibilityLabel("RasanAI Studio")
    }

    private func item(_ place: Place, _ title: String, _ symbol: String, badge: Int = 0) -> some View {
        row(place, title, symbol, badge: badge) { go(place) }
    }

    private func row(_ place: Place?, _ title: String, _ symbol: String, badge: Int = 0, quiet: Bool = false, action: @escaping () -> Void) -> some View {
        let on = place != nil && place == current
        return Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.system(size: 15, weight: on ? .semibold : .regular)).frame(width: 22)
                    .overlay(alignment: .topTrailing) {
                        if collapsed && badge > 0 { Circle().fill(Color.rasan).frame(width: 7, height: 7).offset(x: 4, y: -2) }
                    }
                if !collapsed {
                    Text(title).font(.system(size: 13.5, weight: on ? .semibold : .regular)).lineLimit(1).fixedSize()
                    Spacer(minLength: 4)
                    if badge > 0 {
                        Text("\(badge)").font(.system(size: 11.5, weight: .semibold)).monospacedDigit()
                            .foregroundStyle(Color.rasan).padding(.horizontal, 7).frame(minWidth: 22, minHeight: 20)
                            .background(Color.rasan.opacity(0.14), in: Capsule())
                    }
                }
            }
            .foregroundStyle(on ? Color.rasan : quiet ? Color.secondary : Color.primary)
            .padding(.horizontal, collapsed ? 0 : 10).frame(height: 36)
            .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
            .background(on ? Color.rasan.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .help(collapsed ? title : "")
        .accessibilityLabel(badge > 0 ? "\(title), \(badge)" : title)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func go(_ place: Place) {
        switch place {
        case .home: store.path = []
        case .all: store.path = [.library(.all)]
        case .needsReview: store.path = [.library(.needsReview)]
        case .brands: store.path = [.brands]
        case .templates: store.path = [.templates]
        case .inspire: store.path = [.inspire]
        case .queue: store.path = [.queue]
        }
    }
}

// MARK: Page header

/// The header row every page draws in place of a window toolbar: the page's name on the left, its tools on the right.
struct PageHeader<Trailing: View>: View {
    let title: String
    var showsBack = false
    var onBack: () -> Void = {}
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            if showsBack {
                Button(action: onBack) { Image(systemName: "chevron.left").font(.system(size: 14, weight: .medium)).frame(width: 26, height: 26).contentShape(Rectangle()) }
                    .buttonStyle(.plain).help("Back").accessibilityLabel("Back")
                    .keyboardShortcut("[", modifiers: .command)
            }
            Text(title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
            Spacer(minLength: 12)
            trailing
        }
        .padding(.horizontal, 24).frame(height: 56)
        .overlay(alignment: .bottom) { Rectangle().fill(Workspace.hairline).frame(height: 1) }
    }
}

/// The search field in a page header.
struct HeaderSearchField: View {
    @Binding var text: String
    var prompt = "Search films"
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(prompt, text: $text).textFieldStyle(.plain)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }.buttonStyle(.plain).accessibilityLabel("Clear search")
            }
        }
        .font(.system(size: 13))
        .padding(.horizontal, 12).frame(width: 260, height: 34)
        .background(Workspace.panel, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Workspace.hairline, lineWidth: 1) }
    }
}

/// "+ New film", the studio's one loud button, in page headers.
struct NewFilmHeaderButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label("New film", systemImage: "plus").font(.system(size: 14, weight: .semibold)).padding(.horizontal, 4).frame(minHeight: 26)
        }
        .buttonStyle(.borderedProminent).controlSize(.large)
        .keyboardShortcut("n", modifiers: .command)
    }
}

// MARK: Status bar

/// The studio's status bar under every page but a film's (a film page has its own action bar): whether the director can
/// take a film, which director and pace, and the queue.
struct AppStatusBar: View {
    @Bindable var store: StudioStore
    private var agent: LocalAgent { store.settings.agent }

    var body: some View {
        let ready = store.settings.isReady(agent)
        let busy = store.runtime.isRunning || store.runtime.isPreparing
        let queued = store.settings.filmQueue.count
        HStack(spacing: 12) {
            Circle().fill(busy ? Color.rasan : ready ? Color(nsColor: .systemGreen) : Color(nsColor: .systemOrange)).frame(width: 9, height: 9)
            Text(busy ? "Director working" : ready ? "Director available" : "Director not set up").font(.system(size: 13, weight: .medium))
            Rectangle().fill(Workspace.hairline).frame(width: 1, height: 14)
            Text("\(agent.title) · \(store.settings.pace.title) pace").font(.system(size: 12.5)).foregroundStyle(.secondary)
            Spacer()
            Button(queued == 0 ? "No films queued" : queued == 1 ? "1 film queued" : "\(queued) films queued") { store.path = [.queue] }
                .buttonStyle(.plain).font(.system(size: 12.5)).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24).frame(height: 40)
        .overlay(alignment: .top) { Rectangle().fill(Workspace.hairline).frame(height: 1) }
    }
}

extension View {
    /// Puts the page header above the page (pages draw their own header; the window has no toolbar).
    func pageHeader<Trailing: View>(_ title: String, onBack: (() -> Void)? = nil, @ViewBuilder trailing: () -> Trailing) -> some View {
        VStack(spacing: 0) {
            PageHeader(title: title, showsBack: onBack != nil, onBack: onBack ?? {}, trailing: trailing)
            self.frame(maxHeight: .infinity)
        }
    }
    func pageHeader(_ title: String, onBack: (() -> Void)? = nil) -> some View { pageHeader(title, onBack: onBack) { EmptyView() } }
}
