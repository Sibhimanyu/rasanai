import SwiftUI

/// The shared empty state: one crew character (never also a symbol), a title and a line of help.
/// Every empty state that shows the mascot goes through here so they share size and spacing.
struct CrewEmptyState: View {
    static let characterHeight: CGFloat = 128
    static let spacing: CGFloat = 16

    let title: String
    let message: String
    var character: CrewCharacter = .ra

    var body: some View {
        VStack(spacing: Self.spacing) {
            CrewAvatar(character, style: .full(height: Self.characterHeight), watching: true)
            VStack(spacing: 6) {
                Text(title).font(.title2.weight(.semibold)).multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(message).font(.callout).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: 380)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}
