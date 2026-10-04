// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RasanAIStudio",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "RasanAIStudio", targets: ["RasanAIStudio"])],
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0")],
    targets: [
        .target(name: "StudioCore"),
        .executableTarget(name: "RasanAIStudio", dependencies: ["StudioCore", .product(name: "Sparkle", package: "Sparkle")], resources: [.process("Resources")],
            linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
        .testTarget(name: "StudioCoreTests", dependencies: ["StudioCore"]),
        .testTarget(name: "StudioRuntimeTests", dependencies: ["RasanAIStudio", "StudioCore"])
    ]
)
