import Foundation

public enum ScanlyBarcodeFormat: String, CaseIterable, Codable, Sendable {
    case qrCode = "qr_code"
    case dataMatrix = "data_matrix"
    case pdf417
    case code128 = "code_128"
    case ean13 = "ean_13"
    case ean8 = "ean_8"
    case upcA = "upc_a"
    case upcE = "upc_e"
}

public struct ScanlyPoint: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
}

public struct ScanlyBoundingBox: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public enum ScanlyChecksumStatus: String, Equatable, Sendable {
    case unknown, notApplicable, valid, invalid
}

public struct ScanlyResult: Equatable, Sendable {
    public let payload: String
    public let rawBytes: Data
    public let format: ScanlyBarcodeFormat
    public let boundingBox: ScanlyBoundingBox
    public let cornerPoints: [ScanlyPoint]
    public let orientationDegrees: Double?
    public let checksumStatus: ScanlyChecksumStatus
    public let isValidated: Bool
    public let structuredMetadataJSON: String?
    public let engine: String
    public let diagnosticsJSON: String?
}

public struct ScanlyOptions: Equatable, Sendable {
    public var formats: Set<ScanlyBarcodeFormat>
    public var maxResults: UInt32

    public init(formats: Set<ScanlyBarcodeFormat> = Set(ScanlyBarcodeFormat.allCases), maxResults: UInt32 = 16) {
        self.formats = formats
        self.maxResults = maxResults
    }

    public static let balanced = ScanlyOptions()
}

public enum ScanlyError: Error, Equatable, Sendable {
    case invalidInput
    case unsupportedFormat
    case decodeFailed
    case engineInitializationFailed
    case engineExecutionFailed
    case cancelled
    case outOfMemory
    case internalError
}

public enum ScanlyScannerState: String, Equatable, Sendable {
    case idle, running, paused, stopped, disposed
}
