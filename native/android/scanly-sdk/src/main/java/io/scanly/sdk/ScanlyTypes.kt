package io.scanly.sdk

enum class ScanlyBarcodeFormat(val nativeFlag: Int, val wireName: String) {
    QR_CODE(1 shl 0, "qr_code"), DATA_MATRIX(1 shl 1, "data_matrix"), PDF417(1 shl 2, "pdf417"), CODE_128(1 shl 3, "code_128"),
    EAN_13(1 shl 4, "ean_13"), EAN_8(1 shl 5, "ean_8"), UPC_A(1 shl 6, "upc_a"), UPC_E(1 shl 7, "upc_e");

    companion object { internal fun fromNative(value: Int) = entries.first { it.nativeFlag == value } }
}

data class ScanlyPoint(val x: Double, val y: Double)
data class ScanlyBoundingBox(val x: Double, val y: Double, val width: Double, val height: Double)
enum class ScanlyChecksumStatus { UNKNOWN, NOT_APPLICABLE, VALID, INVALID;
    companion object { internal fun fromNative(value: Int) = entries.getOrElse(value) { UNKNOWN } }
}
data class ScanlyResult(
    val payload: String,
    val rawBytes: ByteArray,
    val format: ScanlyBarcodeFormat,
    val boundingBox: ScanlyBoundingBox,
    val cornerPoints: List<ScanlyPoint>,
    val orientationDegrees: Double?,
    val checksumStatus: ScanlyChecksumStatus,
    val isValidated: Boolean,
    val structuredMetadataJson: String?,
    val engine: String,
    val diagnosticsJson: String?,
)

data class ScanlyOptions(
    val formats: Set<ScanlyBarcodeFormat> = ScanlyBarcodeFormat.entries.toSet(),
    val maxResults: Int = 16,
) {
    internal val formatMask: Int get() = formats.fold(0) { mask, format -> mask or format.nativeFlag }
    companion object { val Balanced = ScanlyOptions() }
}

enum class ScanlyErrorCode(val wireName: String) {
    INVALID_INPUT("invalid_input"), UNSUPPORTED_FORMAT("unsupported_format"), DECODE_FAILED("decode_failed"),
    ENGINE_INITIALIZATION_FAILED("engine_initialization_failed"), ENGINE_EXECUTION_FAILED("engine_execution_failed"),
    CANCELLED("cancelled"), OUT_OF_MEMORY("out_of_memory"), INTERNAL_ERROR("internal_error");

    companion object { fun fromWire(value: String) = entries.firstOrNull { it.wireName == value } ?: INTERNAL_ERROR }
}

class ScanlyException(message: String) : Exception(message) {
    val code: ScanlyErrorCode = ScanlyErrorCode.fromWire(message)
}

enum class ScanlyScannerState { IDLE, RUNNING, PAUSED, STOPPED, DISPOSED }

internal data class NativeResult(
    val payload: String,
    val rawBytes: ByteArray,
    val format: Int,
    val corners: DoubleArray,
    val x: Double,
    val y: Double,
    val width: Double,
    val height: Double,
    val orientationDegrees: Double,
    val checksumStatus: Int,
    val flags: Int,
    val structuredMetadataJson: String?,
    val engine: String?,
    val diagnosticsJson: String?,
)
