import AVFoundation
import Foundation

public final class ScanlyScannerSession: NSObject, @unchecked Sendable {
    public typealias ResultHandler = @Sendable (Result<[ScanlyResult], ScanlyError>) -> Void

    private let decoder: ScanlyDecoder
    private let decodeQueue = DispatchQueue(label: "io.scanly.sdk.decode", qos: .userInitiated)
    private let stateQueue = DispatchQueue(label: "io.scanly.sdk.session")
    private let callbackQueue: DispatchQueue
    private var stateStorage: ScanlyScannerState = .idle
    private var generation: UInt64 = 0
    private var decoding = false
    private var latestFrame: CVPixelBuffer?
    private var lastPublished = [String: TimeInterval]()
    private let repeatInterval: TimeInterval
    private let options: ScanlyOptions

    public var onResults: ResultHandler?
    public var state: ScanlyScannerState { stateQueue.sync { stateStorage } }

    public init(decoder: ScanlyDecoder, options: ScanlyOptions = .balanced, repeatInterval: TimeInterval = 1.0, callbackQueue: DispatchQueue = .main) {
        self.decoder = decoder
        self.options = options
        self.repeatInterval = repeatInterval
        self.callbackQueue = callbackQueue
    }

    public func start() { transition(to: .running) }
    public func pause() { transition(to: .paused) }
    public func resume() { transition(to: .running) }
    public func stop() { transition(to: .stopped) }
    public func dispose() {
        transition(to: .disposed)
        decoder.dispose()
    }

    public func submit(_ pixelBuffer: CVPixelBuffer) {
        stateQueue.async {
            guard self.stateStorage == .running else { return }
            self.latestFrame = pixelBuffer
            self.scheduleIfNeeded()
        }
    }

    private func transition(to state: ScanlyScannerState) {
        stateQueue.sync {
            guard stateStorage != .disposed else { return }
            generation &+= 1
            stateStorage = state
            latestFrame = nil
            if state == .stopped || state == .disposed { lastPublished.removeAll() }
        }
    }

    private func scheduleIfNeeded() {
        guard !decoding, let frame = latestFrame else { return }
        decoding = true
        latestFrame = nil
        let decodeGeneration = generation
        decodeQueue.async {
            let outcome: Result<[ScanlyResult], ScanlyError>
            do { outcome = .success(try self.decoder.decode(frame, options: self.options)) }
            catch let error as ScanlyError { outcome = .failure(error) }
            catch { outcome = .failure(.internalError) }
            self.stateQueue.async {
                self.decoding = false
                guard self.stateStorage == .running, self.generation == decodeGeneration else { self.scheduleIfNeeded(); return }
                self.publish(outcome)
                self.scheduleIfNeeded()
            }
        }
    }

    private func publish(_ outcome: Result<[ScanlyResult], ScanlyError>) {
        let filtered = outcome.map { results in
            let now = ProcessInfo.processInfo.systemUptime
            return results.filter { result in
                let key = "\(result.format.rawValue)\u{1f}\(result.payload)"
                guard now - (lastPublished[key] ?? -.infinity) >= repeatInterval else { return false }
                lastPublished[key] = now
                return true
            }
        }
        guard case .success(let values) = filtered, !values.isEmpty || outcome.isFailure else { return }
        if let handler = onResults { callbackQueue.async { handler(filtered) } }
    }
}

private extension Result {
    var isFailure: Bool {
        if case .failure = self { return true }
        return false
    }
}

public final class ScanlyCameraAdapter: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    public let captureSession = AVCaptureSession()
    public let output = AVCaptureVideoDataOutput()
    private let session: ScanlyScannerSession
    private let cameraQueue = DispatchQueue(label: "io.scanly.sdk.camera")

    public init(session: ScanlyScannerSession) {
        self.session = session
        super.init()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        output.setSampleBufferDelegate(self, queue: cameraQueue)
    }

    public func bind(device: AVCaptureDevice) throws {
        captureSession.beginConfiguration(); defer { captureSession.commitConfiguration() }
        captureSession.inputs.forEach(captureSession.removeInput)
        let input = try AVCaptureDeviceInput(device: device)
        let needsOutput = !captureSession.outputs.contains(output)
        guard captureSession.canAddInput(input), !needsOutput || captureSession.canAddOutput(output) else { throw ScanlyError.invalidInput }
        captureSession.addInput(input)
        if needsOutput { captureSession.addOutput(output) }
    }

    public func start() { session.start(); cameraQueue.async { self.captureSession.startRunning() } }
    public func pause() { session.pause(); cameraQueue.async { self.captureSession.stopRunning() } }
    public func resume() { session.resume(); cameraQueue.async { self.captureSession.startRunning() } }
    public func stop() { session.stop(); cameraQueue.async { self.captureSession.stopRunning() } }
    public func dispose() {
        session.dispose()
        output.setSampleBufferDelegate(nil, queue: nil)
        cameraQueue.async { self.captureSession.stopRunning() }
    }

    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) { session.submit(pixelBuffer) }
    }
}
