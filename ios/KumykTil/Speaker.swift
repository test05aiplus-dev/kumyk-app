import AVFoundation

/// Синтез речи. Кумыкского голоса в iOS нет, поэтому берём турецкий
/// (близкая фонетика, текст приходит в латинской транскрипции), иначе русский.
final class Speaker: NSObject, AVSpeechSynthesizerDelegate {
    let engine: String
    private let voice: AVSpeechSynthesisVoice?
    private let synth = AVSpeechSynthesizer()
    private var ids: [ObjectIdentifier: String] = [:]
    /// Вызывается на главном потоке, когда фраза договорена или прервана.
    var onDone: (@MainActor (String) -> Void)?

    override init() {
        if let tr = AVSpeechSynthesisVoice(language: "tr-TR") {
            engine = "tr"; voice = tr
        } else if let ru = AVSpeechSynthesisVoice(language: "ru-RU") {
            engine = "ru"; voice = ru
        } else {
            engine = "none"; voice = nil
        }
        super.init()
        synth.delegate = self
    }

    /// cyrillic — исходный текст, latin — транскрипция для турецкого голоса.
    /// Возвращает false, если произнести нечем.
    func speak(cyrillic: String, latin: String, pitch: Float, id: String) -> Bool {
        let text = engine == "tr" ? latin : cyrillic
        guard let voice = voice, !text.isEmpty else { return false }
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        try? AVAudioSession.sharedInstance().setActive(true)
        let u = AVSpeechUtterance(string: text)
        u.voice = voice
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        u.pitchMultiplier = max(0.5, min(2.0, pitch))
        if !id.isEmpty { ids[ObjectIdentifier(u)] = id }
        synth.speak(u)
        return true
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finished(utterance)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finished(utterance)
    }

    private func finished(_ u: AVSpeechUtterance) {
        let key = ObjectIdentifier(u)
        DispatchQueue.main.async {
            guard let id = self.ids.removeValue(forKey: key) else { return }
            self.onDone?(id)
        }
    }
}
