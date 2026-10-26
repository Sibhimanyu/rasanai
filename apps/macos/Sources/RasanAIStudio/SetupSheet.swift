import SwiftUI

/// The four parts of "Set up your film". Rows and chips on the review page open the sheet on one of them.
enum SetupSection: String, CaseIterable, Identifiable {
    case film, how, material, reference
    var id: String { rawValue }
    var title: String {
        switch self {
        case .film: "Film"
        case .how: "How RasanAI works"
        case .material: "Material"
        case .reference: "Reference"
        }
    }
    var symbol: String {
        switch self {
        case .film: "film"
        case .how: "slider.horizontal.3"
        case .material: "folder"
        case .reference: "film.stack"
        }
    }
    var blurb: String {
        switch self {
        case .film: "What you are making, how long it runs and what shape it is."
        case .how: "How fast, how careful, how much motion, which brand and who directs."
        case .material: "Your footage and files, and the brief in your own words."
        case .reference: "An edit you like, or moves from Inspiration. They are studied, never cut in."
        }
    }
}

/// One window for every setting: sections on the left, everything in the chosen section on the right, one Done button.
/// Changes are live as they are made; Done (or Esc) only closes it.
struct SetupSheet: View {
    @Binding var section: SetupSection
    let film: AnyView
    let how: AnyView
    let material: AnyView
    let reference: AnyView
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Set up your film").font(.system(size: 15, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 10).padding(.bottom, 10).accessibilityAddTraits(.isHeader)
                    ForEach(SetupSection.allCases) { item in sidebarRow(item) }
                    Spacer(minLength: 0)
                }
                .padding(14).frame(width: 210).frame(maxHeight: .infinity, alignment: .top)
                .background(Workspace.panel)
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(section.title).font(.system(size: 22, weight: .semibold, design: .rounded)).accessibilityAddTraits(.isHeader)
                            Text(section.blurb).font(.system(size: 13)).foregroundStyle(.secondary)
                        }
                        switch section {
                        case .film: film
                        case .how: how
                        case .material: material
                        case .reference: reference
                        }
                    }
                    .padding(26).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Divider()
            HStack {
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(.rasanPrimary).keyboardShortcut(.defaultAction)
                    .help("Close (Return). Your changes are already kept.")
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
        }
        .frame(width: 860, height: 620)
        .background(Color.appBackground)
        .tint(.rasan)
    }

    private func sidebarRow(_ item: SetupSection) -> some View {
        let on = item == section
        return Button { section = item } label: {
            HStack(spacing: 10) {
                Image(systemName: item.symbol).font(.system(size: 13, weight: .medium)).frame(width: 18)
                Text(item.title).font(.system(size: 13, weight: on ? .semibold : .regular))
                Spacer(minLength: 0)
            }
            .foregroundStyle(on ? Color.primary : Color.secondary)
            .padding(.horizontal, 10).frame(height: 32)
            .background(on ? Color.primary.opacity(0.10) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
