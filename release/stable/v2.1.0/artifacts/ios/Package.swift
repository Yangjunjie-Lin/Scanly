// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    // Scanly SDK v2.1.0 Stable; package manifests do not carry semantic versions.
    name: "ScanlySDK",
    platforms: [.iOS(.v13), .macOS(.v13)],
    products: [.library(name: "ScanlySDK", targets: ["ScanlySDK"])],
    dependencies: [
        .package(url: "https://github.com/zxing-cpp/zxing-cpp.git", revision: "6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861")
    ],
    targets: [
        .target(
            name: "CScanlyCore",
            dependencies: [.product(name: "ZXingCpp", package: "zxing-cpp")],
            path: "Core",
            sources: ["scanly_core.cpp"],
            publicHeadersPath: "include",
            cxxSettings: [.define("SCANLY_ENABLE_ZXING_CPP", to: "1")]
        ),
        .target(
            name: "ScanlySDK",
            dependencies: ["CScanlyCore"],
            path: "Sources/ScanlySDK",
            swiftSettings: [.define("SCANLY_STABLE")]
        ),
        .testTarget(
            name: "ScanlySDKTests",
            dependencies: ["ScanlySDK", "CScanlyCore"],
            path: "Tests/ScanlySDKTests"
        )
    ],
    cxxLanguageStandard: .cxx20
)
