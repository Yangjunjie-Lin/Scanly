package io.scanly.sdk

import android.content.Context
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ScanlyCameraXAdapter(
    private val context: Context,
    private val session: ScanlyScannerSession,
    private val executor: ExecutorService = Executors.newSingleThreadExecutor(),
) : AutoCloseable {
    private val analysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()
        .also { useCase -> useCase.setAnalyzer(executor) { image -> try { session.analyze(image) } finally { image.close() } } }
    private var provider: ProcessCameraProvider? = null
    @Volatile private var closed = false
    var camera: Camera? = null; private set

    fun bind(owner: LifecycleOwner, selector: CameraSelector = CameraSelector.DEFAULT_BACK_CAMERA) {
        check(!closed) { "ScanlyCameraXAdapter is closed" }
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (closed) return@addListener
            provider = future.get().also { it.unbind(analysis); camera = it.bindToLifecycle(owner, selector, analysis) }
            session.start()
        }, androidx.core.content.ContextCompat.getMainExecutor(context))
    }

    fun pause() = session.pause()
    fun resume() = session.resume()
    fun stop() { session.stop(); provider?.unbind(analysis) }
    fun enableTorch(enabled: Boolean) { camera?.cameraControl?.enableTorch(enabled) }
    override fun close() {
        if (closed) return
        closed = true
        stop()
        session.close()
        executor.shutdownNow()
    }
}
