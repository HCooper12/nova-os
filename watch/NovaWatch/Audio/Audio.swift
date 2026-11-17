import AVFoundation
import Foundation

/// Records what he says as AAC in an m4a, mono, 16 kHz, for the Mac to hear.
/// The Mac transcribes; the watch never does.
@MainActor
final class Recorder {
    private var recorder: AVAudioRecorder?
    private(set) var url: URL?

    static func permission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [])
        try session.setActive(true)
        let url = FileManager.default.temporaryDirectory.appending(path: "nova-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32_000,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        let r = try AVAudioRecorder(url: url, settings: settings)
        r.isMeteringEnabled = true
        guard r.record(forDuration: 60) else { throw CocoaError(.fileWriteUnknown) }
        recorder = r
        self.url = url
    }

    /// 0...1 from the average power, for the core's level.
    var level: Double {
        guard let r = recorder, r.isRecording else { return 0 }
        r.updateMeters()
        let db = Double(r.averagePower(forChannel: 0))
        return max(0, min(1, (db + 50) / 45))
    }

    var isRecording: Bool { recorder?.isRecording ?? false }

    /// Stops and returns the recording (nil if nothing usable was recorded).
    func stop() -> Data? {
        recorder?.stop()
        recorder = nil
        guard let url, let d = try? Data(contentsOf: url), d.count > 1_000, d.count < 6_000_000 else { return nil }
        try? FileManager.default.removeItem(at: url)
        return d
    }

    func cancel() {
        recorder?.stop()
        recorder = nil
        if let url { try? FileManager.default.removeItem(at: url) }
    }
}

/// Speaks Nova's sentence on the watch and reports each word as it is said,
/// so the caption lights word by word with the voice.
@MainActor
final class Speaker: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private var onWord: ((Int) -> Void)?
    private var onDone: (() -> Void)?
    private var text = ""

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(_ text: String, onWord: @escaping (Int) -> Void, onDone: @escaping () -> Void) {
        self.text = text
        self.onWord = onWord
        self.onDone = onDone
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "en-AU") ?? AVSpeechSynthesisVoice(language: "en-US")
        synth.speak(u)
    }

    func stop() {
        onDone = nil
        synth.stopSpeaking(at: .immediate)
    }

    /// The index of the word that holds a character offset.
    nonisolated static func wordIndex(in text: String, at offset: Int) -> Int {
        let prefix = text.prefix(offset)
        return prefix.split(separator: " ", omittingEmptySubsequences: true).count - (prefix.hasSuffix(" ") || prefix.isEmpty ? 0 : 1)
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, willSpeakRangeOfSpeechString r: NSRange, utterance: AVSpeechUtterance) {
        let loc = r.location
        Task { @MainActor in
            self.onWord?(Self.wordIndex(in: self.text, at: loc))
        }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.onDone?()
            self.onDone = nil
        }
    }
}
