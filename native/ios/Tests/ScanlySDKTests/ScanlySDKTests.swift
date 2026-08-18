import XCTest
import CoreVideo
import CScanlyCore
@testable import ScanlySDK

final class ScanlySDKTests: XCTestCase {
    private struct Manifest: Decodable { let fixtures: [Fixture] }
    private struct Fixture: Decodable {
        let id: String
        let file: String
        let expectedResultCount: Int
        let requiredResults: [RequiredResult]
        let width: Int
        let height: Int
        let rowStride: Int
        let pixelStride: Int
    }
    private struct RequiredResult: Decodable { let format: ScanlyBarcodeFormat; let payload: String }

    private var repositoryRoot: URL {
        var location = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<4 { location.deleteLastPathComponent() }
        return location
    }

    func testPublicFormatContract() {
        XCTAssertEqual(Set(ScanlyBarcodeFormat.allCases), [.qrCode, .dataMatrix, .pdf417, .code128, .ean13, .ean8, .upcA, .upcE])
        XCTAssertEqual(ScanlyOptions.balanced.maxResults, 16)
    }

    func testMalformedInputMapsToTypedError() throws {
        let decoder = try ScanlyDecoder()
        XCTAssertThrowsError(try Data().withUnsafeBytes { try decoder.decodeYPlane($0, width: 0, height: 1, rowStride: 0) }) { error in
            XCTAssertEqual(error as? ScanlyError, .invalidInput)
        }
        decoder.dispose()
        XCTAssertThrowsError(try Data([0]).withUnsafeBytes { try decoder.decodeYPlane($0, width: 1, height: 1, rowStride: 1) }) { error in
            XCTAssertEqual(error as? ScanlyError, .internalError)
        }
    }

    func testLifecycleStateMachine() throws {
        let session = ScanlyScannerSession(decoder: try ScanlyDecoder())
        XCTAssertEqual(session.state, .idle)
        session.start(); XCTAssertEqual(session.state, .running)
        session.pause(); XCTAssertEqual(session.state, .paused)
        session.resume(); XCTAssertEqual(session.state, .running)
        session.stop(); XCTAssertEqual(session.state, .stopped)
        session.dispose(); XCTAssertEqual(session.state, .disposed)
        session.start(); XCTAssertEqual(session.state, .disposed)
    }

    func testSharedNativeFixturesIncludingMultiResult() throws {
        let root = repositoryRoot
        let manifestData = try Data(contentsOf: root.appendingPathComponent("fixtures/native/manifest.json"))
        let manifest = try JSONDecoder().decode(Manifest.self, from: manifestData)
        XCTAssertEqual(manifest.fixtures.count, 9)
        let decoder = try ScanlyDecoder()
        for fixture in manifest.fixtures {
            let bytes = try Data(contentsOf: root.appendingPathComponent(fixture.file))
            let results = try bytes.withUnsafeBytes {
                try decoder.decodeYPlane($0, width: fixture.width, height: fixture.height,
                                         rowStride: fixture.rowStride, pixelStride: fixture.pixelStride)
            }
            XCTAssertEqual(results.count, fixture.expectedResultCount, fixture.id)
            for expected in fixture.requiredResults {
                XCTAssertTrue(results.contains { $0.format == expected.format && $0.payload == expected.payload }, fixture.id)
            }
            XCTAssertTrue(results.allSatisfy { result in
                result.cornerPoints.count == 4 && result.boundingBox.x >= 0 && result.boundingBox.y >= 0 &&
                result.boundingBox.x + result.boundingBox.width <= Double(fixture.width + 2) &&
                result.boundingBox.y + result.boundingBox.height <= Double(fixture.height + 2)
            }, fixture.id)
        }
    }
}
