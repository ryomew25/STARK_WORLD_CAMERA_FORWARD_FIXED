import { useEffect, useRef, useState } from "react"

type RecognitionEventLike = Event & {
  results: { [key: number]: { [key: number]: { transcript: string; isFinal?: boolean } } }
  resultIndex: number
}
type RecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives?: number
  start: () => void
  stop: () => void
  onstart: (() => void) | null
  onresult: ((event: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}
type Props = { onCommand: (text: string) => void; soundEnabled: boolean; onSoundChange: (v: boolean) => void; compact?: boolean }

type VoicePhase = "off" | "starting" | "standby" | "conversation"

function getRecognition(): RecognitionLike | null {
  const w = window as Window & { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike }
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

const WAKE_WORD = /^(?:hey\s*stark|hey\s*starck|ヘイ\s*スターク|ヘイ、?スターク)\b[\s、,。:：-]*/i
const WAKE_ANYWHERE = /(?:hey\s*stark|hey\s*starck|ヘイ\s*スターク|ヘイ、?スターク)/i

export default function VoiceControl({ onCommand, soundEnabled, onSoundChange, compact = false }: Props) {
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const listeningRef = useRef(false)
  const phaseRef = useRef<VoicePhase>("off")
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalBufferRef = useRef("")
  const lastSubmittedRef = useRef("")
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeSessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [phase, setPhase] = useState<VoicePhase>("off")
  const [transcript, setTranscript] = useState("")
  const [supported, setSupported] = useState(true)

  const setVoicePhase = (next: VoicePhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const armWakeSession = () => {
    setVoicePhase("conversation")
    if (wakeSessionTimer.current) clearTimeout(wakeSessionTimer.current)
    wakeSessionTimer.current = setTimeout(() => {
      if (listeningRef.current) {
        setVoicePhase("standby")
        setTranscript("")
      }
    }, 12000)
  }

  useEffect(() => {
    const r = getRecognition()
    setSupported(!!r)
    if (!r) return

    r.lang = "ja-JP"
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 3

    r.onstart = () => {
      if (listeningRef.current) {
        setVoicePhase(phaseRef.current === "starting" ? "standby" : phaseRef.current)
      }
    }

    r.onresult = (event) => {
      let finalText = ""
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i]?.[0]?.transcript || ""
        if (event.results[i]?.[0]?.isFinal) finalText += text
        else interim += text
      }

      if (!finalText.trim()) {
        setTranscript((finalBufferRef.current ? `${finalBufferRef.current} ${interim}` : interim).trim())
        return
      }

      finalBufferRef.current = `${finalBufferRef.current} ${finalText.trim()}`.trim()
      const phrase = finalBufferRef.current
      setTranscript(phrase)

      // Wake-word gate: while in standby, do not send ordinary speech to STARK.
      if (phaseRef.current === "standby") {
        const match = phrase.match(WAKE_ANYWHERE)
        if (!match) {
          // Keep only a small tail so unrelated speech does not grow forever.
          finalBufferRef.current = phrase.slice(-80)
          setTranscript("")
          return
        }

        const afterWake = phrase.slice((match.index ?? 0) + match[0].length).trim()
        finalBufferRef.current = afterWake
        setTranscript(afterWake)
        armWakeSession()

        if (!afterWake) {
          onCommand("__STARK_WAKE__")
          finalBufferRef.current = ""
          setTranscript("")
          return
        }
      }

      if (submitTimerRef.current) clearTimeout(submitTimerRef.current)
      submitTimerRef.current = setTimeout(() => {
        const current = finalBufferRef.current.trim()
        if (!current || current === lastSubmittedRef.current) return
        lastSubmittedRef.current = current
        finalBufferRef.current = ""
        setTranscript("")
        onCommand(current)
        if (phaseRef.current === "conversation") armWakeSession()
      }, 650)
    }

    r.onend = () => {
      if (listeningRef.current) {
        restartTimer.current = setTimeout(() => {
          try { r.start() } catch { /* browser may already be restarting */ }
        }, 220)
      } else {
        setVoicePhase("off")
      }
    }

    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        listeningRef.current = false
        setVoicePhase("off")
      }
    }

    recognitionRef.current = r

    // Voice-first mode: automatically arm the microphone so the user can say
    // "Hey Stark" without pressing the mic button. Browsers may still require
    // a user gesture; in that case the existing mic button remains available.
    const autoArmTimer = window.setTimeout(() => {
      if (listeningRef.current) return
      listeningRef.current = true
      finalBufferRef.current = ""
      setTranscript("")
      setVoicePhase("starting")
      try {
        r.start()
      } catch {
        listeningRef.current = false
        setVoicePhase("off")
      }
    }, 650)

    return () => {
      window.clearTimeout(autoArmTimer)
      listeningRef.current = false
      if (restartTimer.current) clearTimeout(restartTimer.current)
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current)
      if (wakeSessionTimer.current) clearTimeout(wakeSessionTimer.current)
      r.stop()
      recognitionRef.current = null
    }
  }, [onCommand])

  const toggleListening = () => {
    const r = recognitionRef.current
    if (!r) return

    if (listeningRef.current) {
      listeningRef.current = false
      if (restartTimer.current) clearTimeout(restartTimer.current)
      if (wakeSessionTimer.current) clearTimeout(wakeSessionTimer.current)
      r.stop()
      setVoicePhase("off")
      setTranscript("")
      finalBufferRef.current = ""
      return
    }

    finalBufferRef.current = ""
    lastSubmittedRef.current = ""
    setTranscript("")
    listeningRef.current = true
    setVoicePhase("starting")
    try {
      r.start()
    } catch {
      listeningRef.current = false
      setVoicePhase("off")
    }
  }

  const submitTranscript = () => {
    const text = transcript.trim()
    if (!text) return
    onCommand(text)
    setTranscript("")
    finalBufferRef.current = ""
  }

  const statusText = !supported
    ? "UNSUPPORTED"
    : phase === "starting"
      ? "STARTING MICROPHONE…"
      : phase === "standby"
        ? "STANDBY · SAY HEY STARK"
        : phase === "conversation"
          ? "LISTENING · CONVERSATIONAL"
          : "READY"

  if (compact) {
    return (
      <div className="voice-control voice-control-compact">
        <div className={`voice-state ${phase === "conversation" ? "live" : ""}`}><span />{statusText}</div>
        <button className={`voice-mic ${phase === "conversation" ? "active" : ""}`} onClick={toggleListening} disabled={!supported} aria-label="Toggle microphone">
          <span>{listeningRef.current ? "■" : "◉"}</span>
        </button>
        <div className="voice-compact-label">WAKE · HEY STARK</div>
      </div>
    )
  }

  return (
    <div className="voice-control">
      <div className="voice-control-head">
        <div>
          <div className="voice-kicker">VOICE INTERFACE</div>
          <div className="voice-title">STARK CONVERSATION LAYER</div>
        </div>
        <div className={`voice-state ${phase === "conversation" ? "live" : ""}`}><span />{statusText}</div>
      </div>
      <div className="voice-main">
        <button className={`voice-mic ${phase === "conversation" ? "active" : ""}`} onClick={toggleListening} disabled={!supported} aria-label="Toggle microphone">
          <span>{listeningRef.current ? "■" : "◉"}</span>
        </button>
        <div className="voice-transcript">
          <div className="voice-label">LIVE TRANSCRIPT</div>
          <div className={transcript ? "voice-text" : "voice-placeholder"}>
            {transcript || (supported
              ? phase === "standby" ? "「Hey Stark」で呼びかけてください" : phase === "starting" ? "マイクを準備しています…" : "マイクを押して開始"
              : "このブラウザでは音声認識を利用できません")}
          </div>
        </div>
      </div>
      <div className="voice-actions">
        <button className="voice-send" onClick={submitTranscript} disabled={!transcript.trim()}>SEND</button>
        <button className={`voice-sound ${soundEnabled ? "on" : ""}`} onClick={() => onSoundChange(!soundEnabled)}>SPEAK · {soundEnabled ? "ON" : "OFF"}</button>
      </div>
      <div className="voice-hint">常時待機 · 「Hey Stark」で会話開始 · 「何が見えてる？」 · 「マップ開いて」</div>
    </div>
  )
}
