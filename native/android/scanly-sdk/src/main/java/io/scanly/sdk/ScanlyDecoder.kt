package io.scanly.sdk

import java.io.Closeable
import java.nio.ByteBuffer
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

internal object NativeBridge {
    init { System.loadLibrary("scanly_jni") }
    external fun create(): Long
    external fun destroy(handle: Long)
    external fun decodeYPlane(handle: Long, buffer: ByteBuffer, dataLength: Int, width: Int, height: Int, rowStride: Int, pixelStride: Int, formatMask: Int, maxResults: Int): Array<NativeResult>
}

class ScanlyDecoder : Closeable {
    private val lock = ReentrantLock()
    private var handle: Long = NativeBridge.create()

    fun decodeYPlane(
        buffer: ByteBuffer,
        width: Int,
        height: Int,
        rowStride: Int,
        pixelStride: Int = 1,
        options: ScanlyOptions = ScanlyOptions.Balanced,
    ): List<ScanlyResult> = lock.withLock {
        if (handle == 0L) throw ScanlyException(ScanlyErrorCode.CANCELLED.wireName)
        if (!buffer.isDirect || width <= 0 || height <= 0 || rowStride <= 0 || pixelStride <= 0) {
            throw ScanlyException(ScanlyErrorCode.INVALID_INPUT.wireName)
        }
        val view = buffer.slice()
        val minimumBytes = try {
            Math.addExact(Math.multiplyExact(height - 1, rowStride), Math.addExact(Math.multiplyExact(width - 1, pixelStride), 1))
        } catch (_: ArithmeticException) {
            throw ScanlyException(ScanlyErrorCode.INVALID_INPUT.wireName)
        }
        if (view.remaining() < minimumBytes) throw ScanlyException(ScanlyErrorCode.INVALID_INPUT.wireName)
        NativeBridge.decodeYPlane(handle, view, view.remaining(), width, height, rowStride, pixelStride, options.formatMask, options.maxResults).map { native ->
            ScanlyResult(
                payload = native.payload,
                rawBytes = native.rawBytes,
                format = ScanlyBarcodeFormat.fromNative(native.format),
                boundingBox = ScanlyBoundingBox(native.x, native.y, native.width, native.height),
                cornerPoints = native.corners.asList().chunked(2).map { ScanlyPoint(it[0], it[1]) },
                orientationDegrees = native.orientationDegrees.takeIf { native.flags and 1 != 0 },
                checksumStatus = ScanlyChecksumStatus.fromNative(native.checksumStatus),
                isValidated = native.flags and (1 shl 2) != 0,
                structuredMetadataJson = native.structuredMetadataJson,
                engine = native.engine ?: "unknown",
                diagnosticsJson = native.diagnosticsJson,
            )
        }
    }

    override fun close() = lock.withLock {
        if (handle != 0L) { NativeBridge.destroy(handle); handle = 0 }
    }
}
