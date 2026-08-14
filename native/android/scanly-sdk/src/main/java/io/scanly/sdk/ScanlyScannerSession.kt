package io.scanly.sdk

import androidx.camera.core.ImageProxy

class ScanlyScannerSession(
    private val decoder: ScanlyDecoder,
    private val options: ScanlyOptions = ScanlyOptions.Balanced,
    private val repeatIntervalMillis: Long = 1_000,
) : AutoCloseable {
    private var stateStorage = ScanlyScannerState.IDLE
    private var generation = 0L
    private val lastPublished = mutableMapOf<String, Long>()
    var onResults: ((Result<List<ScanlyResult>>) -> Unit)? = null
    val state: ScanlyScannerState @Synchronized get() = stateStorage

    @Synchronized fun start() = transition(ScanlyScannerState.RUNNING)
    @Synchronized fun pause() = transition(ScanlyScannerState.PAUSED)
    @Synchronized fun resume() = transition(ScanlyScannerState.RUNNING)
    @Synchronized fun stop() = transition(ScanlyScannerState.STOPPED)
    @Synchronized fun dispose() = transition(ScanlyScannerState.DISPOSED)

    fun analyze(image: ImageProxy) {
        val decodeGeneration: Long
        synchronized(this) {
            if (stateStorage != ScanlyScannerState.RUNNING) return
            decodeGeneration = generation
        }
        val outcome = runCatching {
            require(image.format == android.graphics.ImageFormat.YUV_420_888)
            val plane = image.planes[0]
            decoder.decodeYPlane(plane.buffer, image.width, image.height, plane.rowStride, plane.pixelStride, options)
        }
        synchronized(this) {
            if (stateStorage != ScanlyScannerState.RUNNING || generation != decodeGeneration) return
            val filtered = outcome.map { results ->
                val now = android.os.SystemClock.elapsedRealtime()
                results.filter { result ->
                    val key = "${result.format}\u001f${result.payload}"
                    if (now - (lastPublished[key] ?: Long.MIN_VALUE) < repeatIntervalMillis) false
                    else { lastPublished[key] = now; true }
                }
            }
            if (filtered.isFailure || filtered.getOrDefault(emptyList()).isNotEmpty()) {
                val handler = onResults
                if (handler != null) android.os.Handler(android.os.Looper.getMainLooper()).post { handler(filtered) }
            }
        }
    }

    @Synchronized private fun transition(next: ScanlyScannerState) {
        if (stateStorage == ScanlyScannerState.DISPOSED) return
        generation++
        stateStorage = next
        if (next == ScanlyScannerState.STOPPED || next == ScanlyScannerState.DISPOSED) lastPublished.clear()
    }

    override fun close() { dispose(); decoder.close() }
}
