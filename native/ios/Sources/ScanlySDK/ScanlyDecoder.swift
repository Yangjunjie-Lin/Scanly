import CoreVideo
import Foundation
@_implementationOnly import CScanlyCore

public final class ScanlyDecoder: @unchecked Sendable {
    private let lock = NSLock()
    private var context: OpaquePointer?

    public init() throws {
        var options = scanly_context_options_t()
        scanly_context_options_init(&options)
        options.backend = UInt32(SCANLY_BACKEND_ZXING_CPP)
        var created: OpaquePointer?
        try Self.throwIfFailed(scanly_context_create(&options, &created))
        context = created
    }

    deinit { dispose() }

    public func dispose() {
        lock.lock()
        defer { lock.unlock() }
        if let context {
            scanly_context_destroy(context)
            self.context = nil
        }
    }

    public func decode(_ pixelBuffer: CVPixelBuffer, options: ScanlyOptions = .balanced) throws -> [ScanlyResult] {
        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else {
            throw ScanlyError.invalidInput
        }
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
        if format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange || format == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange {
            guard CVPixelBufferGetPlaneCount(pixelBuffer) > 0, let address = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { throw ScanlyError.invalidInput }
            return try decodeYPlane(
                UnsafeRawBufferPointer(start: address, count: CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0) * CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)),
                width: CVPixelBufferGetWidthOfPlane(pixelBuffer, 0),
                height: CVPixelBufferGetHeightOfPlane(pixelBuffer, 0),
                rowStride: CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0),
                pixelStride: 1,
                options: options
            )
        }
        if format == kCVPixelFormatType_32BGRA, let address = CVPixelBufferGetBaseAddress(pixelBuffer) {
            return try decodeBGRA(
                UnsafeRawBufferPointer(start: address, count: CVPixelBufferGetBytesPerRow(pixelBuffer) * CVPixelBufferGetHeight(pixelBuffer)),
                width: CVPixelBufferGetWidth(pixelBuffer),
                height: CVPixelBufferGetHeight(pixelBuffer),
                rowStride: CVPixelBufferGetBytesPerRow(pixelBuffer),
                options: options
            )
        }
        throw ScanlyError.invalidInput
    }

    public func decodeYPlane(_ bytes: UnsafeRawBufferPointer, width: Int, height: Int, rowStride: Int, pixelStride: Int = 1, options: ScanlyOptions = .balanced) throws -> [ScanlyResult] {
        guard width > 0, height > 0, rowStride > 0, pixelStride > 0,
              width <= Int(UInt32.max), height <= Int(UInt32.max) else { throw ScanlyError.invalidInput }
        return try withLockedContext { context in
            try decode(options: options) { nativeOptions, output in
                scanly_decode_y_plane(context, bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count, UInt32(width), UInt32(height), rowStride, pixelStride, nativeOptions, output)
            }
        }
    }

    public func decodeBGRA(_ bytes: UnsafeRawBufferPointer, width: Int, height: Int, rowStride: Int, options: ScanlyOptions = .balanced) throws -> [ScanlyResult] {
        guard width > 0, height > 0, rowStride > 0,
              width <= Int(UInt32.max), height <= Int(UInt32.max) else { throw ScanlyError.invalidInput }
        return try withLockedContext { context in
            var view = scanly_image_view_t()
            scanly_image_view_init(&view)
            view.data = bytes.bindMemory(to: UInt8.self).baseAddress
            view.data_len = bytes.count
            view.width = UInt32(width)
            view.height = UInt32(height)
            view.row_stride = rowStride
            view.pixel_stride = 4
            view.pixel_format = UInt32(SCANLY_PIXEL_BGRA)
            return try decode(options: options) { nativeOptions, output in scanly_decode(context, &view, nativeOptions, output) }
        }
    }

    private func withLockedContext<T>(_ body: (OpaquePointer) throws -> T) throws -> T {
        lock.lock(); defer { lock.unlock() }
        guard let context else { throw ScanlyError.internalError }
        return try body(context)
    }

    private func decode(options: ScanlyOptions, operation: (UnsafePointer<scanly_decode_options_t>, UnsafeMutablePointer<OpaquePointer?>) -> scanly_status_t) throws -> [ScanlyResult] {
        var nativeOptions = scanly_decode_options_t()
        scanly_decode_options_init(&nativeOptions)
        nativeOptions.format_mask = Self.mask(options.formats)
        nativeOptions.max_results = options.maxResults
        var resultSet: OpaquePointer?
        let status = operation(&nativeOptions, &resultSet)
        defer { if let resultSet { scanly_result_set_destroy(resultSet) } }
        try Self.throwIfFailed(status)
        guard let resultSet else { return [] }
        return try (0..<scanly_result_set_count(resultSet)).map { index in
            var view = scanly_result_view_t()
            scanly_result_view_init(&view)
            try Self.throwIfFailed(scanly_result_get(resultSet, index, &view))
            let payload = Self.string(view.payload_utf8, view.payload_len) ?? ""
            let raw = view.raw_bytes.map { Data(bytes: $0, count: view.raw_bytes_len) } ?? Data()
            let corners = view.corner_points.map { pointer in (0..<Int(view.corner_count)).map { ScanlyPoint(x: pointer[$0].x, y: pointer[$0].y) } } ?? []
            return ScanlyResult(
                payload: payload,
                rawBytes: raw,
                format: try Self.format(view.format),
                boundingBox: ScanlyBoundingBox(x: view.bounding_box.x, y: view.bounding_box.y, width: view.bounding_box.width, height: view.bounding_box.height),
                cornerPoints: corners,
                orientationDegrees: (view.flags & UInt32(SCANLY_RESULT_FLAG_HAS_ORIENTATION)) != 0 ? view.orientation_degrees : nil,
                checksumStatus: Self.checksumStatus(view.checksum_status),
                isValidated: (view.flags & UInt32(SCANLY_RESULT_FLAG_VALIDATED)) != 0,
                structuredMetadataJSON: Self.string(view.structured_metadata_json, view.structured_metadata_json_len),
                engine: Self.string(view.engine_id, view.engine_id_len) ?? "unknown",
                diagnosticsJSON: Self.string(view.diagnostics_json, view.diagnostics_json_len)
            )
        }
    }

    private static func string(_ pointer: UnsafePointer<CChar>?, _ length: Int) -> String? {
        pointer.map { String(decoding: UnsafeRawBufferPointer(start: $0, count: length).bindMemory(to: UInt8.self), as: UTF8.self) }
    }

    private static func mask(_ formats: Set<ScanlyBarcodeFormat>) -> UInt32 { formats.reduce(0) { $0 | nativeFormat($1) } }
    private static func nativeFormat(_ format: ScanlyBarcodeFormat) -> UInt32 {
        switch format {
        case .qrCode: return UInt32(SCANLY_FORMAT_QR_CODE)
        case .dataMatrix: return UInt32(SCANLY_FORMAT_DATA_MATRIX)
        case .pdf417: return UInt32(SCANLY_FORMAT_PDF417)
        case .code128: return UInt32(SCANLY_FORMAT_CODE_128)
        case .ean13: return UInt32(SCANLY_FORMAT_EAN_13)
        case .ean8: return UInt32(SCANLY_FORMAT_EAN_8)
        case .upcA: return UInt32(SCANLY_FORMAT_UPC_A)
        case .upcE: return UInt32(SCANLY_FORMAT_UPC_E)
        }
    }
    private static func format(_ value: UInt32) throws -> ScanlyBarcodeFormat {
        guard let result = ScanlyBarcodeFormat.allCases.first(where: { nativeFormat($0) == value }) else { throw ScanlyError.unsupportedFormat }
        return result
    }
    private static func checksumStatus(_ value: UInt32) -> ScanlyChecksumStatus {
        switch value {
        case UInt32(SCANLY_CHECKSUM_NOT_APPLICABLE): return .notApplicable
        case UInt32(SCANLY_CHECKSUM_VALID): return .valid
        case UInt32(SCANLY_CHECKSUM_INVALID): return .invalid
        default: return .unknown
        }
    }
    private static func throwIfFailed(_ status: scanly_status_t) throws {
        switch status { case UInt32(SCANLY_STATUS_OK): return; case UInt32(SCANLY_STATUS_INVALID_INPUT): throw ScanlyError.invalidInput; case UInt32(SCANLY_STATUS_UNSUPPORTED_FORMAT): throw ScanlyError.unsupportedFormat; case UInt32(SCANLY_STATUS_DECODE_FAILED): throw ScanlyError.decodeFailed; case UInt32(SCANLY_STATUS_ENGINE_INITIALIZATION_FAILED): throw ScanlyError.engineInitializationFailed; case UInt32(SCANLY_STATUS_ENGINE_EXECUTION_FAILED): throw ScanlyError.engineExecutionFailed; case UInt32(SCANLY_STATUS_CANCELLED): throw ScanlyError.cancelled; case UInt32(SCANLY_STATUS_OUT_OF_MEMORY): throw ScanlyError.outOfMemory; default: throw ScanlyError.internalError }
    }
}
