import { useState, useEffect, useRef, useCallback } from "react"
import Scene3D, { type NodeId, type FocusTarget } from "./Scene3D"
import CameraScanner from "./CameraScanner"
import VoiceControl from "./VoiceControl"

type Page = "home" | "system" | "core" | "map" | "scan" | "command" | "settings"

interface Notification { id: number; message: string }
interface CmdEntry { cmd: string; result: string; ok: boolean }
interface DiagStep { label: string; status: "pending" | "running" | "ok" | "fail" }
interface VisionDetection {
  class: string
  score: number
  bbox: [number, number, number, number]
  sourceWidth?: number
  sourceHeight?: number
}

const DIAG_STEPS: string[] = ["POWER CHECK", "NETWORK CHECK", "THERMAL CHECK", "CORE CHECK"]

const FOCUS_ANGLES: Record<string, FocusTarget> = {
  "arc-core": { id: "arc-core", az: 0.55, el: 0.35, zoom: 1.4 },
  north:      { id: "north",    az: Math.PI,       el: 0.25, zoom: 1.1 },
  south:      { id: "south",    az: 0,             el: 0.25, zoom: 1.1 },
  east:       { id: "east",     az: Math.PI / 2,   el: 0.25, zoom: 1.1 },
  west:       { id: "west",     az: -Math.PI / 2,  el: 0.25, zoom: 1.1 },
}

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "home",     label: "HOME",     icon: "⬡" },
  { id: "system",   label: "SYSTEM",   icon: "◈" },
  { id: "core",     label: "CORE",     icon: "◎" },
  { id: "map",      label: "MAP",      icon: "⊞" },
  { id: "scan",     label: "VISION",   icon: "◉" },
  { id: "command",  label: "COMMAND",  icon: ">" },
  { id: "settings", label: "SETTINGS", icon: "⚙" },
]

const NODE_LABELS: Record<string, string> = {
  "arc-core": "ARC CORE", north: "NORTH NODE", east: "EAST NODE", west: "WEST NODE", south: "SOUTH NODE",
}
const NODE_TYPE: Record<string, string> = {
  "arc-core": "ENERGY CORE", north: "RELAY NODE", east: "RELAY NODE", west: "RELAY NODE", south: "RELAY NODE",
}
const NODE_COORDS: Record<string, [number, number, number]> = {
  "arc-core": [0, 0, 0], north: [0, 0, -195], east: [195, 0, 0], west: [-195, 0, 0], south: [0, 0, 195],
}
const NODE_DIST: Record<string, number> = {
  "arc-core": 0, north: 195, east: 195, west: 195, south: 195,
}
const BASE_NODE_ENERGY: Record<string, number> = {
  "arc-core": 87, north: 72, east: 91, west: 65, south: 83,
}
const MINIMAP_POS: Record<string, { x: number; y: number; r: number; label: string }> = {
  "arc-core": { x: 120, y: 120, r: 14, label: "CORE" },
  north:      { x: 120, y: 38,  r: 9,  label: "N" },
  south:      { x: 120, y: 202, r: 9,  label: "S" },
  east:       { x: 202, y: 120, r: 9,  label: "E" },
  west:       { x: 38,  y: 120, r: 9,  label: "W" },
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`toggle ${on ? "on" : "off"}`} onClick={() => onChange(!on)}>
      <div className="toggle-knob" />
    </div>
  )
}

function ProgressBar({ value, color = "#38bdf8", height = 2 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="progress-bar" style={{ height }}>
      <div className="progress-fill" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
    </div>
  )
}

function StatRow({ label, value, unit = "%" }: { label: string; value: number; unit?: string }) {
  const color = value > 80 ? "#34d399" : value > 50 ? "#38bdf8" : "#f59e0b"
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-mono text-[10px] tracking-widest text-slate-400">{label}</span>
        <span className="font-mono text-[12px] font-medium" style={{ color }}>{value}{unit}</span>
      </div>
      <ProgressBar value={value} color={color} />
    </div>
  )
}

function MapMinimap({ selectedNode, onSelect }: { selectedNode: NodeId | null; onSelect: (id: NodeId) => void }) {
  const peripheralIds: NodeId[] = ["north", "south", "east", "west"]
  return (
    <div style={{ background: "rgba(1,6,18,0.95)", border: "1px solid rgba(56,189,248,0.14)", borderRadius: 10, padding: 6 }}>
      <div className="flex justify-between items-center px-1 mb-1">
        <span className="font-mono text-[8px] tracking-[0.25em] text-slate-700">SPATIAL OVERVIEW</span>
        <span className="font-mono text-[8px] tracking-[0.15em] text-cyan-400/40">TOP-DOWN</span>
      </div>
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "auto", display: "block" }}>
        {[-80, -40, 0, 40, 80].map(off => (
          <g key={off}>
            <line x1={120+off} y1={8} x2={120+off} y2={232} stroke="rgba(56,189,248,0.045)" strokeWidth={0.5} />
            <line x1={8} y1={120+off} x2={232} y2={120+off} stroke="rgba(56,189,248,0.045)" strokeWidth={0.5} />
          </g>
        ))}
        <circle cx={120} cy={120} r={82} fill="none" stroke="rgba(56,189,248,0.05)" strokeWidth={0.5} strokeDasharray="3 5" />
        <circle cx={120} cy={120} r={50} fill="none" stroke="rgba(56,189,248,0.06)" strokeWidth={0.5} />
        {[{ l:"N",x:120,y:18 },{ l:"S",x:120,y:228 },{ l:"E",x:228,y:122 },{ l:"W",x:12,y:122 }].map(c => (
          <text key={c.l} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(56,189,248,0.22)" fontSize={7} fontFamily="JetBrains Mono">{c.l}</text>
        ))}
        {peripheralIds.map(id => {
          const n = MINIMAP_POS[id]
          const isActive = selectedNode === id || selectedNode === "arc-core"
          return (
            <g key={id}>
              <line x1={120} y1={120} x2={n.x} y2={n.y} stroke={isActive ? "rgba(56,189,248,0.25)" : "rgba(56,189,248,0.1)"} strokeWidth={1} />
              <line x1={120} y1={120} x2={n.x} y2={n.y} stroke={isActive ? "rgba(56,189,248,0.8)" : "rgba(56,189,248,0.35)"}
                strokeWidth={1} strokeDasharray="4 6" style={{ animation: "flow 1.1s linear infinite" }} />
            </g>
          )
        })}
        {(Object.entries(MINIMAP_POS) as [NodeId, typeof MINIMAP_POS[string]][]).map(([id, n]) => {
          const isSel = selectedNode === id
          const isCore = id === "arc-core"
          const en = BASE_NODE_ENERGY[id]
          const ec = en > 80 ? "#34d399" : en > 60 ? "#38bdf8" : "#f59e0b"
          const circ = 2 * Math.PI * (n.r + 2)
          return (
            <g key={id} onClick={() => onSelect(id)} style={{ cursor: "pointer" }}>
              {isSel && <circle cx={n.x} cy={n.y} r={n.r+4} fill="none" stroke="rgba(56,189,248,0.5)" strokeWidth={1}
                style={{ transformOrigin: `${n.x}px ${n.y}px`, animation: "ping-ring 1.4s ease-out infinite" }} />}
              <circle cx={n.x} cy={n.y} r={n.r+6} fill={`rgba(56,189,248,${isSel ? 0.1 : 0.04})`} />
              <circle cx={n.x} cy={n.y} r={n.r+2} fill="none" stroke={isSel ? ec : "rgba(56,189,248,0.3)"} strokeWidth={1.5}
                strokeDasharray={`${(en/100)*circ} ${circ}`} strokeLinecap="round"
                style={{ transform: "rotate(-90deg)", transformOrigin: `${n.x}px ${n.y}px` }} />
              <circle cx={n.x} cy={n.y} r={n.r} fill={isCore ? "rgba(14,165,233,0.45)" : "rgba(56,189,248,0.2)"}
                stroke={isSel ? "#38bdf8" : "rgba(56,189,248,0.5)"} strokeWidth={isSel ? 1.5 : 1} />
              {isCore && <circle cx={n.x-4} cy={n.y-4} r={5} fill="rgba(255,255,255,0.18)" />}
              <text x={n.x} y={n.y+0.5} textAnchor="middle" dominantBaseline="middle"
                fill={isSel ? "#fff" : "rgba(224,242,254,0.85)"} fontSize={isCore ? 7 : 6}
                fontFamily="JetBrains Mono" fontWeight="600">{n.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="flex items-center gap-2 px-2 pb-1">
        <div style={{ width: 32, height: 1, background: "rgba(56,189,248,0.3)" }} />
        <span className="font-mono text-[7px] tracking-wider text-slate-700">195 u</span>
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const s = localStorage.getItem("stark-world-v1")
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

type StarkMemory = {
  facts: string[]
  recent: { user: string; stark: string; at: number }[]
}

function loadMemory(): StarkMemory {
  try {
    const raw = localStorage.getItem("stark-world-memory-v1")
    if (!raw) return { facts: [], recent: [] }
    const parsed = JSON.parse(raw)
    return { facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 50) : [], recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 30) : [] }
  } catch {
    return { facts: [], recent: [] }
  }
}

export default function App() {
  const saved = loadSettings()

  const [page, setPage] = useState<Page>("home")
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null)
  const [autoRotate, setAutoRotate] = useState<boolean>(saved.autoRotate ?? true)
  const [showGrid, setShowGrid] = useState<boolean>(saved.showGrid ?? true)
  const [safeMode, setSafeMode] = useState<boolean>(saved.safeMode ?? false)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(saved.soundEnabled ?? false)
  const [performanceMode, setPerformanceMode] = useState<boolean>(saved.performanceMode ?? false)

  // VISION is the shared reality layer: detections found by the camera are
  // kept in the app so MAP and VISION can display the same live objects.
  const [visionDetections, setVisionDetections] = useState<VisionDetection[]>([])
  const [visionLive, setVisionLive] = useState(false)
  const [visionLastUpdate, setVisionLastUpdate] = useState(0)

  const [commandInput, setCommandInput] = useState("")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [cmdHistory, setCmdHistory] = useState<CmdEntry[]>([])

  const [statusLog, setStatusLog] = useState<string[]>([
    "STARK WORLD INITIALIZED", "LOCAL CORE ONLINE", "SYSTEM READY",
  ])

  const [stats, setStats] = useState({ energy: 87, signal: 94, stability: 98, fps: 60 })
  // Derived system display value (must exist before callbacks that reference it)
  const energyDisplay = Math.round(stats.energy)

  const [diagRunning, setDiagRunning] = useState(false)
  const [diagSteps, setDiagSteps] = useState<DiagStep[]>([])
  const [diagMsg, setDiagMsg] = useState("")

  const [restartConfirm, setRestartConfirm] = useState(false)
  const [coreRestarting, setCoreRestarting] = useState(false)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const notifIdRef = useRef(0)

  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [panelKey, setPanelKey] = useState(0)

  const diagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)
  const conversationRef = useRef({ lastTopic: "", lastUser: "", turnCount: 0 })
  const memoryRef = useRef<StarkMemory>(loadMemory())
  const replyIndexRef = useRef(0)

  // Persist settings
  useEffect(() => {
    localStorage.setItem("stark-world-v1", JSON.stringify({
      autoRotate, showGrid, safeMode, soundEnabled, performanceMode,
    }))
  }, [autoRotate, showGrid, safeMode, soundEnabled, performanceMode])

  // Fluctuate system stats (smooth)
  useEffect(() => {
    const id = setInterval(() => {
      setStats(s => ({
        energy:    Math.max(60, Math.min(99, s.energy    + (Math.random()-0.5)*4)),
        signal:    Math.max(70, Math.min(99, s.signal    + (Math.random()-0.5)*3)),
        stability: Math.max(80, Math.min(99, s.stability + (Math.random()-0.5)*2)),
        fps: s.fps, // updated by Scene3D callback
      }))
    }, 2400)
    return () => clearInterval(id)
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────

  const notify = useCallback((message: string) => {
    const id = ++notifIdRef.current
    setNotifications(prev => [...prev.slice(-4), { id, message }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3200)
  }, [])

  const addLog = useCallback((msg: string) => {
    setStatusLog(prev => [msg, ...prev].slice(0, 10))
  }, [])

  const navigate = useCallback((p: Page) => {
    setPage(p)
    setPanelKey(k => k + 1)
  }, [])

  const handleFpsUpdate = useCallback((fps: number) => {
    setStats(s => ({ ...s, fps }))
  }, [])

  const handleFocusComplete = useCallback(() => {
    setFocusTarget(null)
  }, [])

  const handleVisionDetections = useCallback((detections: VisionDetection[]) => {
    setVisionDetections(detections)
    setVisionLive(detections.length > 0)
    setVisionLastUpdate(Date.now())
  }, [])

  const prettyVisionLabel = useCallback((label: string) => {
    return label.toUpperCase().replaceAll("_", " ")
  }, [])

  const focusNode = useCallback((id: NodeId) => {
    setFocusTarget(FOCUS_ANGLES[id])
  }, [])

  const selectNode = useCallback((id: NodeId, options?: { focus?: boolean; navigate?: Page }) => {
    setSelectedNode(id)
    addLog(`TARGET LOCKED: ${NODE_LABELS[id]}`)
    notify(`TARGET LOCKED · ${NODE_LABELS[id]}`)
    if (options?.focus) focusNode(id)
    if (options?.navigate) navigate(options.navigate)
  }, [addLog, notify, focusNode, navigate])

  const handleNodeClick = useCallback((id: NodeId) => {
    setSelectedNode(id)
    addLog(`TARGET LOCKED: ${NODE_LABELS[id]}`)
    notify(`TARGET LOCKED · ${NODE_LABELS[id]}`)
  }, [addLog, notify])

  // Diagnostics (step-by-step)
  const runDiagnostics = useCallback((targetLabel?: string) => {
    if (diagRunning) return
    const label = targetLabel || (selectedNode ? NODE_LABELS[selectedNode] : "ARC CORE")
    setDiagRunning(true)
    setDiagMsg(`RUNNING DIAGNOSTICS ON ${label}`)
    setDiagSteps(DIAG_STEPS.map(s => ({ label: s, status: "pending" })))
    addLog("DIAGNOSTICS STARTED")
    notify("DIAGNOSTICS STARTED")

    let i = 0
    const next = () => {
      if (i >= DIAG_STEPS.length) {
        setDiagRunning(false)
        setDiagMsg("DIAGNOSTICS COMPLETE · ALL SYSTEMS NOMINAL")
        addLog("DIAGNOSTICS COMPLETE")
        notify("DIAGNOSTICS COMPLETE")
        return
      }
      setDiagSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "running" } : s))
      diagTimerRef.current = setTimeout(() => {
        setDiagSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "ok" } : s))
        i++
        diagTimerRef.current = setTimeout(next, 150)
      }, 620)
    }
    next()
  }, [diagRunning, selectedNode, addLog, notify])

  useEffect(() => () => { if (diagTimerRef.current) clearTimeout(diagTimerRef.current) }, [])

  // Restart core
  const confirmRestart = useCallback(() => {
    setRestartConfirm(false)
    setCoreRestarting(true)
    addLog("CORE RESTARTING...")
    notify("CORE RESTART INITIATED")
    setTimeout(() => {
      setCoreRestarting(false)
      addLog("CORE ONLINE")
      notify("CORE ONLINE")
      setDiagMsg("")
      setDiagSteps([])
    }, 3000)
  }, [addLog, notify])

  // Commands
  const runCommandText = useCallback((input?: string) => {
    const raw = (input ?? commandInput).trim()
    if (!raw) return
    const cmd = raw.toLowerCase()
    let result = ""
    let ok = true

    if (cmd === "scan") {
      navigate("scan")
      addLog("CAMERA OBJECT SCAN READY")
      result = "CAMERA OBJECT SCAN READY"
    } else if (cmd === "core") {
      navigate("core"); setSelectedNode("arc-core"); focusNode("arc-core")
      result = "ARC CORE SELECTED"
    } else if (cmd === "map") {
      navigate("map"); result = "MAP LOADED"
    } else if (cmd === "system") {
      navigate("system"); result = "SYSTEM STATUS LOADED"
    } else if (cmd === "home") {
      navigate("home"); result = "NAVIGATED TO HOME"
    } else if (cmd === "settings") {
      navigate("settings"); result = "SETTINGS OPENED"
    } else if (cmd === "grid") {
      setShowGrid(v => { const n = !v; addLog(`SPATIAL GRID: ${n ? "ENABLED" : "DISABLED"}`); return n })
      result = "SPATIAL GRID TOGGLED"
    } else if (cmd === "rotate") {
      setAutoRotate(v => { const n = !v; addLog(`AUTO ROTATION: ${n ? "ENABLED" : "DISABLED"}`); return n })
      result = "AUTO ROTATION TOGGLED"
    } else if (cmd === "safe") {
      setSafeMode(v => { const n = !v; addLog(`SAFE MODE: ${n ? "ENABLED" : "DISABLED"}`); return n })
      result = "SAFE MODE TOGGLED"
    } else if (cmd === "diagnostics") {
      navigate("core")
      setTimeout(() => runDiagnostics(), 100)
      result = "DIAGNOSTICS INITIATED"
    } else if (cmd === "clear") {
      setCmdHistory([]); result = "COMMAND LOG CLEARED"
    } else if (cmd.startsWith("target ")) {
      const t = cmd.split(" ")[1]
      const idMap: Record<string, NodeId> = { north: "north", east: "east", west: "west", south: "south", core: "arc-core" }
      if (idMap[t]) {
        const id = idMap[t]
        setSelectedNode(id); focusNode(id)
        addLog(`TARGET LOCKED: ${NODE_LABELS[id]}`)
        notify(`TARGET LOCKED · ${NODE_LABELS[id]}`)
        result = `TARGET LOCKED: ${NODE_LABELS[id]}`
      } else {
        result = `UNKNOWN TARGET: ${t}`; ok = false
      }
    } else {
      result = `UNKNOWN COMMAND: ${raw}`; ok = false
    }

    setCmdHistory(prev => [{ cmd: raw, result, ok }, ...prev].slice(0, 14))
    setCommandInput("")
    if (ok) { addLog(`CMD: ${result}`); notify("COMMAND EXECUTED") }
  }, [commandInput, navigate, focusNode, addLog, notify, runDiagnostics])

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = "ja-JP"
    // Faster, natural Japanese delivery while keeping words intelligible.
    u.rate = 1.18
    u.pitch = 0.94
    const voices = window.speechSynthesis.getVoices()
    const ja = voices.find(v => v.lang?.toLowerCase() === "ja-jp") || voices.find(v => v.lang?.toLowerCase().startsWith("ja"))
    if (ja) u.voice = ja
    window.speechSynthesis.speak(u)
  }, [voiceEnabled])

  const runCommand = useCallback(() => {
    runCommandText(commandInput)
  }, [commandInput, runCommandText])

  const runVoiceCommand = useCallback((text: string) => {
    const original = text.trim()
    if (!original) return

    if (original === "__STARK_WAKE__") {
      speak("はい。どうしました？")
      return
    }

    // Local conversation layer: no API key is required. It combines intent
    // detection, short-term context, system state and varied responses.
    const normalized = original
      .toLowerCase()
      .replace(/[。！？!?、,]/g, "")
      .replace(/^(ねえ|ねぇ|ちょっと|もしもし)\s*/g, "")
      .replace(/^(stark|スターク)[\s、,]*/i, "")
      .trim()
    if (!normalized) {
      speak("はい。どうしました？")
      return
    }

    const memory = conversationRef.current
    memory.lastUser = original
    memory.turnCount += 1

    const persistent = memoryRef.current
    const persistMemory = () => {
      try { localStorage.setItem("stark-world-memory-v1", JSON.stringify(persistent)) } catch { /* storage may be unavailable */ }
    }

    const reply = (message: string, topic = memory.lastTopic) => {
      memory.lastTopic = topic
      persistent.recent.unshift({ user: original, stark: message, at: Date.now() })
      persistent.recent = persistent.recent.slice(0, 30)
      persistMemory()
      setCmdHistory(prev => [{ cmd: original, result: message, ok: true }, ...prev].slice(0, 14))
      addLog(`VOICE: ${message}`)
      speak(message)
    }

    // Explicit long-term memory. Only remember what the user directly asks STARK to remember.
    const rememberMatch = original.match(/(?:覚えて|記憶して|記憶に入れて|忘れないで|メモして)[:：]?\s*(.+)$/)
    if (rememberMatch?.[1]) {
      const fact = rememberMatch[1].trim()
      if (fact && !persistent.facts.includes(fact)) {
        persistent.facts.unshift(fact)
        persistent.facts = persistent.facts.slice(0, 50)
        persistMemory()
      }
      reply(`覚えておきます。「${fact}」ですね。`, "memory")
      return
    }
    if (/何を覚えてる|覚えてること|記憶してること|長期記憶/.test(normalized)) {
      if (!persistent.facts.length) {
        reply("まだ長期記憶には何も登録されていません。『これを覚えて』と言ってくれれば保存します。", "memory")
      } else {
        reply(`現在覚えているのは、${persistent.facts.slice(0, 8).join("、")}です。`, "memory")
      }
      return
    }

    const pick = (items: string[]) => {
      const value = items[replyIndexRef.current % items.length]
      replyIndexRef.current += 1
      return value
    }

    // Follow-up questions use the previous topic instead of treating every
    // sentence as an isolated command.
    if (/^(それ|それって|それは|じゃあ|では|あと|ちなみに)/.test(normalized) && memory.lastTopic) {
      if (memory.lastTopic === "vision") {
        if (/何|どんな|見え/.test(normalized)) {
          const labels = visionDetections.map(d => prettyVisionLabel(d.class))
          reply(labels.length ? `今のVISIONでは、${labels.slice(0, 5).join("、")}を認識しています。` : "今のところ、はっきり認識できる対象はありません。", "vision")
          return
        }
      }
      if (memory.lastTopic === "system" && /もっと|詳しく|詳しい/.test(normalized)) {
        reply(`もう少し詳しく見ると、エネルギー${energyDisplay}パーセント、信号${Math.round(stats.signal)}パーセント、安定性${Math.round(stats.stability)}パーセントです。動作は安定しています。`, "system")
        return
      }
    }

    // Greetings and social conversation.
    if (/^(こんにちは|こんばんは|おはよう|やあ|よろしく|元気|元気？|調子どう)/.test(normalized)) {
      reply(pick([
        "こんにちは。今日もSTARK WORLDは正常に動作しています。どうしましょう？",
        "こんにちは。準備できています。話すだけで大丈夫ですよ。",
        "はい、オンラインです。何か手伝えることはありますか？",
      ]), "greeting")
      return
    }
    if (/ありがとう|助かった|サンキュー|感謝/.test(normalized)) {
      reply(pick(["どういたしまして。", "もちろんです。いつでも呼んでください。", "こちらこそ。次は何をしましょう？"]), "social")
      return
    }
    if (/疲れ|眠い|暇|退屈|つまらない/.test(normalized)) {
      reply(pick([
        "そういう時間もありますね。何か試してみますか？VISIONで周囲を確認することもできます。",
        "なるほど。では、少し遊びますか？画面を操作したり、VISIONを使ったりできますよ。",
      ]), "social")
      return
    }

    // Time/date and simple local calculations.
    if (/何時|時間教えて|現在時刻|今の時間/.test(normalized)) {
      const now = new Date()
      reply(`現在は${now.getHours()}時${String(now.getMinutes()).padStart(2,"0")}分です。`, "time")
      return
    }
    if (/今日.*(何日|日付)|日付教えて|今日は何月何日|何曜日/.test(normalized)) {
      const now = new Date()
      const days = ["日","月","火","水","木","金","土"]
      reply(`今日は${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日、${days[now.getDay()]}曜日です。`, "time")
      return
    }
    const math = normalized.match(/^(?:計算して|計算|いくつ|いくら)?\s*(\d+(?:\.\d+)?)\s*([+\-×x*÷/]?)\s*(\d+(?:\.\d+)?)$/)
    if (math && math[2]) {
      const a = Number(math[1]), b = Number(math[3])
      const op = math[2]
      const value = op === "+" ? a+b : op === "-" ? a-b : op === "×" || op === "x" || op === "*" ? a*b : op === "÷" || op === "/" ? (b === 0 ? NaN : a/b) : NaN
      if (Number.isFinite(value)) { reply(`計算結果は${Number(value.toFixed(6))}です。`, "math"); return }
    }

    // System-aware conversation.
    if (/何ができる|何できる|できること|機能|あなたは何|何をしてくれる/.test(normalized)) {
      reply("私はSTARK WORLDのローカルアシスタントです。普通の会話に加えて、画面操作、システム状態、VISION、Spatial Map、CORE、診断、設定変更などを声で扱えます。", "capabilities")
      return
    }
    if (/誰|名前|自己紹介|何者/.test(normalized)) {
      reply("私はSTARK WORLD。あなたの画面とシステムを操作するための音声アシスタントです。今は端末内で動くローカル版です。", "identity")
      return
    }
    if (/どうやって|使い方|話しかけ|話せる/.test(normalized)) {
      reply("難しい言い方は必要ありません。普通に話してください。例えば、何が見えてる、システム大丈夫、マップ開いて、みたいな言い方で大丈夫です。", "help")
      return
    }

    // Camera / VISION controls. These are intentionally broad so natural Japanese works.
    if (/カメラ.*(止|オフ|切)|ビジョン.*(止|オフ|切)|映像.*(止|オフ|切)/.test(normalized)) {
      navigate("scan")
      reply("VISIONを停止するには画面の停止操作を使えます。ブラウザのカメラ仕様上、音声だけで強制停止するより安全な操作を残しています。", "vision")
      return
    }
    if (/前方カメラ|背面カメラ|外側カメラ|後ろのカメラ|ワールドカメラ/.test(normalized)) {
      navigate("scan")
      window.dispatchEvent(new CustomEvent("stark-camera-facing", { detail: "environment" }))
      reply("前方カメラに切り替えます。", "vision")
      return
    }
    if (/自撮りカメラ|前面カメラ|自分側カメラ|インカメラ/.test(normalized)) {
      navigate("scan")
      window.dispatchEvent(new CustomEvent("stark-camera-facing", { detail: "user" }))
      reply("自分側のカメラに切り替えます。", "vision")
      return
    }

    // Voice-first navigation and controls.
    if (/コマンド.*(開|表示)|操作画面|音声コマンド/.test(normalized)) { navigate("command"); reply("COMMAND画面を開きました。声だけでも操作できます。", "command"); return }
    if (/ホーム.*(戻|開)|最初の画面/.test(normalized)) { navigate("home"); reply("ホームに戻りました。", "home"); return }
    if (/画面.*(閉じ|消)|パネル.*(閉じ|消)/.test(normalized)) { navigate("home"); reply("ホーム表示に戻しました。", "home"); return }
    if (/回転.*(速|遅)|回転速度/.test(normalized)) { reply("回転速度の細かな調整は今後の拡張対象です。現在は自動回転のオン・オフに対応しています。", "settings"); return }

    // Vision: report actual detections, not just navigate.
    if (/何が見えて|何が見える|何が映って|何を認識|周りに何|周囲に何|見えてる/.test(normalized)) {
      navigate("scan")
      const labels = visionDetections.map(d => prettyVisionLabel(d.class))
      const unique = [...new Set(labels)]
      if (unique.length) {
        reply(`今のVISIONでは、${unique.slice(0, 6).join("、")}を認識しています。`, "vision")
      } else {
        reply("VISIONを開きました。今のところ、はっきり認識できる対象はありません。", "vision")
      }
      return
    }
    if (/ビジョン|カメラ|スキャン/.test(normalized)) {
      navigate("scan")
      reply(pick(["了解。VISIONを開きます。", "もちろん。VISIONを表示します。", "VISIONを起動しました。"]), "vision")
      return
    }
    if (/マップ|地図|空間|スペース|位置/.test(normalized)) {
      navigate("map")
      reply("Spatial Mapを表示しました。VISIONの認識情報とリンクしています。", "map")
      return
    }
    if (/システム|状態|ステータス|調子|大丈夫|正常/.test(normalized)) {
      navigate("system")
      reply(`今の状態は良好です。エネルギー${energyDisplay}パーセント、信号${Math.round(stats.signal)}パーセント、安定性${Math.round(stats.stability)}パーセントです。`, "system")
      return
    }
    if (/コア|core|中心/.test(normalized)) {
      navigate("core"); setSelectedNode("arc-core"); focusNode("arc-core")
      reply(`ARC COREを表示しました。エネルギーは${energyDisplay}パーセントです。`, "core")
      return
    }
    if (/設定|セッティング/.test(normalized)) {
      navigate("settings")
      reply("設定を開きました。自動回転やグリッド、セーフモードなどを変更できます。", "settings")
      return
    }
    if (/ホーム|最初|戻って|ホームに戻|戻る/.test(normalized)) {
      navigate("home")
      reply("ホームに戻りました。", "home")
      return
    }
    if (/診断|チェック|点検|調べて/.test(normalized)) {
      navigate("core"); setTimeout(() => runDiagnostics(), 100)
      reply("了解。システム診断を開始します。", "diagnostics")
      return
    }
    if (/再起動|リスタート/.test(normalized)) {
      navigate("core"); setRestartConfirm(true)
      reply("COREの再起動を準備しました。安全のため、最後の確認は画面で行います。", "core")
      return
    }
    if (/回転.*(止|オフ)|自動回転.*(止|オフ)/.test(normalized)) { setAutoRotate(false); reply("自動回転を止めました。", "settings"); return }
    if (/回転.*(開始|オン)|自動回転.*(開始|オン)/.test(normalized)) { setAutoRotate(true); reply("自動回転を再開しました。", "settings"); return }
    if (/グリッド.*(消|オフ)|グリッド.*非表示/.test(normalized)) { setShowGrid(false); reply("空間グリッドを非表示にしました。", "settings"); return }
    if (/グリッド.*(表示|オン)|グリッド.*出して/.test(normalized)) { setShowGrid(true); reply("空間グリッドを表示しました。", "settings"); return }
    if (/セーフモード.*(オン|開始)|安全モード.*(オン|開始)/.test(normalized)) { setSafeMode(true); reply("セーフモードを有効にしました。", "settings"); return }
    if (/セーフモード.*(オフ|解除)/.test(normalized)) { setSafeMode(false); reply("セーフモードを解除しました。", "settings"); return }
    if (/音声.*(オフ|切)|しゃべらない|黙って/.test(normalized)) { setVoiceEnabled(false); return }
    if (/音声.*(オン|入)|しゃべって|話して/.test(normalized)) { setVoiceEnabled(true); setTimeout(() => speak("了解しました。音声出力を有効にします。"), 0); return }

    // Natural fallback. It is intentionally honest: without a remote LLM,
    // the browser cannot know arbitrary world facts. It still keeps the tone conversational.
    reply(pick([
      `なるほど。「${original}」ですね。今のSTARKはローカル版なので、その質問の内容そのものを調べる機能はまだありません。でも、画面操作やVISION、システム確認ならそのまま頼めます。`,
      `わかりました。「${original}」についてですね。そこは今のローカルAIの範囲外です。STARK WORLDの操作に関することなら、かなり自然な言い方でも理解できます。`,
      `その話、面白いですね。今は外部の知識AIには接続していないので、一般知識については答えられない場合があります。代わりに、STARK WORLDの状態やVISIONなら確認できます。`,
    ]), "fallback")
  }, [runCommandText, speak, navigate, focusNode, addLog, runDiagnostics, energyDisplay, stats.signal, stats.stability, visionDetections])

  const saveSettings = useCallback(() => {
    addLog("SETTINGS SAVED")
    notify("SETTINGS SAVED")
  }, [addLog, notify])

  // ── Derived values ────────────────────────────────────────────────────────

  const currentTargetEnergy = selectedNode ? BASE_NODE_ENERGY[selectedNode] : 0
  const currentTargetLabel = selectedNode ? NODE_LABELS[selectedNode] : "NONE"

  // ── Page panels ───────────────────────────────────────────────────────────

  const renderPage = () => {
    switch (page) {
      case "home":
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.25em] text-cyan-400/60">STARK WORLD OS · v2.4.1</div>
            <h1 className="font-display text-3xl font-300 tracking-[0.06em] text-white mb-1 leading-tight">WELCOME</h1>
            <h2 className="font-display text-xl font-600 tracking-[0.12em] text-cyan-300 mb-4 glow-text">STARK WORLD</h2>
            <p className="font-display text-sm font-300 text-slate-300 italic mb-1 tracking-wide">"Your World."</p>
            <p className="text-xs text-slate-500 leading-relaxed mb-6 max-w-[240px]">
              A spatial personal interface built for exploration, control and future expansion.
            </p>
            <button className="btn-primary" onClick={() => navigate("system")}>ENTER SYSTEM</button>
          </div>
        )

      case "system":
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">SYSTEM MONITOR</div>
            <h2 className="font-display text-lg font-600 tracking-[0.1em] text-white mb-5">SYSTEM STATUS</h2>
            <StatRow label="ENERGY"    value={energyDisplay} />
            <StatRow label="SIGNAL"    value={Math.round(stats.signal)} />
            <StatRow label="STABILITY" value={Math.round(stats.stability)} />
            <StatRow label="FPS"       value={stats.fps} unit="" />
            <div className="mt-4 p-3 rounded-md" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
              <div className="flex items-center gap-2">
                <div className="status-dot online" />
                <span className="font-mono text-[10px] tracking-widest text-emerald-400">ALL SYSTEMS NOMINAL</span>
              </div>
            </div>
          </div>
        )

      case "core": {
        const node = selectedNode || "arc-core"
        const nodeEnergy = node === "arc-core" ? energyDisplay : BASE_NODE_ENERGY[node]
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">{NODE_TYPE[node]} · STABLE</div>
            <h2 className="font-display text-lg font-600 tracking-[0.1em] text-white mb-0.5">{NODE_LABELS[node]}</h2>
            <div className="font-display text-4xl font-300 text-cyan-300 glow-text mb-1 tracking-tight">
              {coreRestarting ? <span className="text-amber-400 text-2xl animate-blink">RESTARTING...</span> : `${nodeEnergy}%`}
            </div>
            {coreRestarting && (
              <div className="mb-3">
                <ProgressBar value={100} color="#f59e0b" />
              </div>
            )}
            {!coreRestarting && <StatRow label="ENERGY" value={nodeEnergy} />}

            {/* Diagnostics */}
            {!coreRestarting && (
              <div className="flex gap-2 mb-3">
                <button className="btn-primary" onClick={() => runDiagnostics()} disabled={diagRunning}
                  style={{ opacity: diagRunning ? 0.6 : 1 }}>
                  {diagRunning ? "RUNNING..." : "RUN DIAGNOSTICS"}
                </button>
                {!restartConfirm && (
                  <button className="btn-secondary" onClick={() => setRestartConfirm(true)}>RESTART CORE</button>
                )}
              </div>
            )}

            {/* Restart confirmation */}
            {restartConfirm && !coreRestarting && (
              <div className="mb-3 p-3 rounded-md animate-fade-up" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="font-mono text-[9px] tracking-widest text-amber-400 mb-2">CONFIRM CORE RESTART?</div>
                <div className="text-[9px] text-slate-500 mb-3">This will interrupt all active connections.</div>
                <div className="flex gap-2">
                  <button className="btn-primary" style={{ borderColor: "rgba(245,158,11,0.5)", color: "#fbbf24" }} onClick={confirmRestart}>CONFIRM</button>
                  <button className="btn-secondary" onClick={() => setRestartConfirm(false)}>CANCEL</button>
                </div>
              </div>
            )}

            {/* Step-by-step diag */}
            {diagSteps.length > 0 && (
              <div className="space-y-1.5 mt-1">
                {diagSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-[9px] tracking-widest">
                    <span style={{
                      color: step.status === "ok" ? "#34d399" : step.status === "running" ? "#38bdf8" : "rgba(100,116,139,0.4)",
                      fontSize: 10,
                    }}>
                      {step.status === "ok" ? "✓" : step.status === "running" ? "›" : "·"}
                    </span>
                    <span style={{
                      color: step.status === "ok" ? "rgba(148,163,184,0.7)"
                        : step.status === "running" ? "#7dd3fc"
                        : "rgba(100,116,139,0.4)"
                    }}>{step.label}</span>
                    {step.status === "running" && <span className="text-cyan-400 animate-blink">...</span>}
                    {step.status === "ok" && <span className="text-emerald-400">OK</span>}
                  </div>
                ))}
              </div>
            )}
            {diagMsg && diagSteps.length > 0 && !diagRunning && (
              <div className="mt-3 font-mono text-[9px] tracking-widest px-3 py-2 rounded"
                style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}>
                {diagMsg}
              </div>
            )}
          </div>
        )
      }

      case "map":
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">SPATIAL MAP · VISION LINK</div>
            <h2 className="font-display text-lg font-600 tracking-[0.1em] text-white mb-3">LIVE SPACE</h2>

            <div className="vision-map-shell">
              <div className="vision-map-grid" />
              <div className="vision-map-radar" />
              <div className="vision-map-crosshair" />
              <div className="vision-map-you">
                <span>YOU</span>
                <div className="vision-map-you-dot" />
              </div>
              <div className="vision-map-direction n">N</div>
              <div className="vision-map-direction e">E</div>
              <div className="vision-map-direction s">S</div>
              <div className="vision-map-direction w">W</div>

              {visionDetections.slice(0, 12).map((d, i) => {
                const [x, y, w, h] = d.bbox
                // Detection coordinates are normalized into a stable top-down
                // pseudo-space for the phone prototype. This becomes true
                // spatial anchoring when moved to AR/Meta hardware later.
                const sw = d.sourceWidth || 1280
                const sh = d.sourceHeight || 720
                const px = Math.max(12, Math.min(88, 50 + ((x + w / 2) / sw - 0.5) * 70))
                const py = Math.max(12, Math.min(88, 50 + ((y + h / 2) / sh - 0.5) * 70))
                return (
                  <button
                    key={`${d.class}-${i}`}
                    className="vision-map-object"
                    style={{ left: `${px}%`, top: `${py}%` }}
                    onClick={() => {
                      addLog(`VISION TARGET · ${prettyVisionLabel(d.class)} · ${Math.round(d.score * 100)}%`)
                      notify(`TARGET LOCKED · ${prettyVisionLabel(d.class)}`)
                      navigate("scan")
                    }}
                  >
                    <span className="vision-map-object-pulse" />
                    <span className="vision-map-object-dot" />
                    <span className="vision-map-object-label">
                      {prettyVisionLabel(d.class)}
                      <b>{Math.round(d.score * 100)}%</b>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2 mt-3 mb-3">
              {[
                { l:"VISIBLE",v:String(visionDetections.length) },
                { l:"LIVE",v:visionLive ? "YES" : "NO" },
                { l:"LINK",v:visionLastUpdate ? "SYNC" : "IDLE" }
              ].map(({ l,v }) => (
                <div key={l} className="flex-1 rounded-md px-2 py-2 text-center" style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.1)" }}>
                  <div className="font-mono text-[14px] font-500 text-cyan-300">{v}</div>
                  <div className="font-mono text-[7px] tracking-widest text-slate-600 mt-0.5">{l}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md p-3 mb-3" style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.1)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[8px] tracking-[0.2em] text-slate-600">VISION OBJECT REGISTRY</span>
                <span className={`font-mono text-[8px] tracking-widest ${visionLive ? "text-emerald-400" : "text-slate-700"}`}>{visionLive ? "LIVE" : "STANDBY"}</span>
              </div>
              {visionDetections.length === 0 ? (
                <div className="font-mono text-[9px] text-slate-700">ACTIVATE VISION TO MAP THE ENVIRONMENT</div>
              ) : (
                <div className="space-y-1.5">
                  {visionDetections.slice(0, 8).map((d, i) => (
                    <button key={`${d.class}-row-${i}`} className="vision-object-row" onClick={() => navigate("scan")}>
                      <span className="vision-object-index">{String(i + 1).padStart(2, "0")}</span>
                      <span className="vision-object-name">{prettyVisionLabel(d.class)}</span>
                      <span className="vision-object-score">{Math.round(d.score * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <MapMinimap
              selectedNode={selectedNode}
              onSelect={(id) => { selectNode(id, { focus: true }) }}
            />
            <div className="font-mono text-[7px] leading-relaxed tracking-wider text-slate-700 mt-2">
              VISION LINK · CAMERA OBJECTS ARE PROJECTED INTO THE PHONE'S SPATIAL PROTOTYPE. TRUE AR WORLD ANCHORING IS RESERVED FOR THE GLASSES BUILD.
            </div>
          </div>
        )

      case "scan":
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">VISION SYSTEM · ALWAYS-ON PROTOTYPE</div>
            <h2 className="font-display text-lg font-600 tracking-[0.1em] text-white mb-3">REALITY LAYER</h2>

            <div className="vision-status-strip">
              <div><span className="vision-status-dot" /> VISION {visionLive ? "LIVE" : "STANDBY"}</div>
              <div>{visionDetections.length} OBJECTS</div>
              <div>AI OFFLINE</div>
            </div>

            <div className="vision-glasses-note">
              <span className="font-mono text-[8px] tracking-[0.2em] text-cyan-400/60">GLASSES ARCHITECTURE</span>
              <div className="font-display text-[11px] tracking-widest text-slate-200 mt-1">CAMERA → VISION → SPATIAL MAP → HUD</div>
              <div className="font-mono text-[8px] leading-relaxed text-slate-600 mt-2">
                THIS PHONE BUILD IS THE PROTOTYPE FOR THE FUTURE WEARABLE LAYER. THE CAMERA FEED IS THE REALITY BACKGROUND; STARK WORLD IS THE INFORMATION LAYER ABOVE IT.
              </div>
            </div>
          </div>
        )

      case "command":
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">COMMAND CONSOLE</div>
            <h2 className="font-display text-lg font-600 tracking-[0.1em] text-white mb-3">EXECUTE</h2>
            <div className="flex gap-2 mb-2">
              <input ref={cmdInputRef} className="cmd-input flex-1" value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runCommand()}
                placeholder="scan / core / map / system..." />
              <button className="btn-primary px-4" onClick={runCommand}>RUN</button>
            </div>
            <div className="font-mono text-[8px] tracking-widest text-slate-700 mb-3 leading-relaxed">
              scan · core · map · system · home · grid · rotate · safe · diagnostics · target [n/e/w/s/core] · clear
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {cmdHistory.map((h, i) => (
                <div key={i} className="rounded px-2.5 py-2" style={{ background: "rgba(2,8,23,0.9)", border: "1px solid rgba(56,189,248,0.07)" }}>
                  <div className="font-mono text-[10px] text-cyan-400 mb-0.5">
                    <span className="text-cyan-600 mr-1">›</span>{h.cmd}
                  </div>
                  <div className={`font-mono text-[9px] ${h.ok ? "text-slate-500" : "text-amber-600"}`}>{h.result}</div>
                </div>
              ))}
              {cmdHistory.length === 0 && (
                <div className="font-mono text-[9px] text-slate-700 px-2">No commands executed</div>
              )}
            </div>
          </div>
        )

      case "settings":
        return (
          <div className="animate-fade-up">
            <div className="mb-1 font-mono text-[9px] tracking-[0.2em] text-cyan-400/60">CONFIGURATION</div>
            <h2 className="font-display text-lg font-600 tracking-[0.1em] text-white mb-5">SETTINGS</h2>
            <div className="space-y-0.5">
              {[
                { label: "AUTO ROTATION",    sub: "Continuous orbit",      val: autoRotate,      set: setAutoRotate },
                { label: "SPATIAL GRID",     sub: "Floor reference grid",  val: showGrid,        set: setShowGrid },
                { label: "SAFE MODE",        sub: "Reduce heavy effects",  val: safeMode,        set: setSafeMode },
                { label: "SOUND",            sub: "UI audio feedback",     val: soundEnabled,    set: setSoundEnabled },
                { label: "PERFORMANCE MODE", sub: "Limit DPR & particles", val: performanceMode, set: setPerformanceMode },
              ].map(({ label, sub, val, set }) => (
                <div key={label} className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(56,189,248,0.07)" }}>
                  <div>
                    <div className="font-display text-[11px] tracking-widest text-slate-200 font-500">{label}</div>
                    <div className="font-mono text-[9px] tracking-wider text-slate-600 mt-0.5">{sub}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] tracking-widest" style={{ color: val ? "#38bdf8" : "rgba(148,163,184,0.4)" }}>
                      {val ? "ON" : "OFF"}
                    </span>
                    <Toggle on={val} onChange={v => {
                      set(v)
                      addLog(`${label}: ${v ? "ON" : "OFF"}`)
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-primary mt-5 w-full" onClick={saveSettings}>SAVE SETTINGS</button>
            <div className="mt-3 font-mono text-[8px] tracking-widest text-slate-700 text-center">
              Settings auto-saved · localStorage
            </div>
          </div>
        )
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col" style={{ background: "#010810", userSelect: "none" }}>

      {/* Toast notifications */}
      <div className="fixed top-14 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 240 }}>
        {notifications.map(n => (
          <div key={n.id} className="animate-fade-up glass-bright rounded-lg px-3 py-2.5" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 0 12px rgba(56,189,248,0.08)" }}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-none" style={{ boxShadow: "0 0 6px #38bdf8" }} />
              <span className="font-mono text-[9px] tracking-widest text-cyan-300">{n.message}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Header - desktop */}
      <header className="flex-none flex items-center justify-between px-5 py-3 desktop-only"
        style={{ background: "rgba(1,8,16,0.95)", borderBottom: "1px solid rgba(56,189,248,0.08)", height: 52 }}>
        <div>
          <span className="font-display font-700 text-sm tracking-[0.18em] text-white">STARK</span>
          <span className="font-mono text-[10px] text-slate-500 ml-2 tracking-[0.12em]">WORLD / PERSONAL INTERFACE</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <div className="status-dot offline" />
            <span className="font-mono text-[9px] tracking-widest text-slate-600">AI OFFLINE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="status-dot online" />
            <span className="font-mono text-[9px] tracking-widest text-emerald-400">SYSTEM ONLINE</span>
          </div>
        </div>
      </header>

      {/* Header - mobile */}
      <header className="mobile-only flex-none flex items-center justify-between px-4 py-2.5"
        style={{ background: "rgba(1,8,16,0.98)", borderBottom: "1px solid rgba(56,189,248,0.1)", height: 46 }}>
        <span className="font-display font-700 text-sm tracking-[0.2em] text-white">STARK WORLD</span>
        <div className="flex items-center gap-1.5">
          <div className="status-dot online" />
          <span className="font-mono text-[9px] tracking-widest text-emerald-400">ONLINE</span>
        </div>
      </header>

      {/* Persistent voice layer: wake-word listening remains mounted across every page. */}
      <div className="persistent-voice">
        <VoiceControl
          onCommand={runVoiceCommand}
          soundEnabled={voiceEnabled}
          onSoundChange={setVoiceEnabled}
          compact={page !== "command"}
        />
      </div>

      {/* Persistent reality layer: camera remains mounted across every page. */}
      <div className={`persistent-vision ${page === "scan" ? "expanded" : ""}`}>
        <CameraScanner
          performanceMode={performanceMode}
          onDetected={handleVisionDetections}
          onLog={addLog}
          compact={page !== "scan"}
          expanded={page === "scan"}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left nav */}
        <nav className="desktop-only flex-none flex flex-col py-4 px-2 gap-1"
          style={{ width: 178, background: "rgba(1,6,18,0.92)", borderRight: "1px solid rgba(56,189,248,0.07)" }}>
          <div className="px-2 mb-3">
            <div className="font-mono text-[8px] tracking-[0.3em] text-slate-700">NAVIGATION</div>
          </div>
          {NAV_ITEMS.map(item => (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => navigate(item.id)}>
              <span className="text-[14px] leading-none" style={{ fontFamily: "monospace" }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <div className="mt-auto px-2 pt-4 border-t" style={{ borderColor: "rgba(56,189,248,0.06)" }}>
            <div className="font-mono text-[8px] tracking-[0.2em] text-slate-700 mb-2">ENVIRONMENT</div>
            {safeMode && (
              <div className="rounded px-2 py-1.5 mb-1" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <span className="font-mono text-[9px] tracking-widest text-amber-400">SAFE MODE</span>
              </div>
            )}
            {performanceMode && (
              <div className="rounded px-2 py-1.5" style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)" }}>
                <span className="font-mono text-[9px] tracking-widest text-cyan-500">PERF MODE</span>
              </div>
            )}
          </div>
        </nav>

        {/* 3D scene */}
        <div className="flex-1 relative overflow-hidden">
          <Scene3D
            selectedNode={selectedNode}
            showGrid={showGrid}
            autoRotate={autoRotate}
            safeMode={safeMode}
            performanceMode={performanceMode}
            focusTarget={focusTarget}
            onNodeClick={handleNodeClick}
            onFocusComplete={handleFocusComplete}
            onFpsUpdate={handleFpsUpdate}
          />

          {/* Page panel - desktop */}
          <div className="absolute left-4 bottom-16 desktop-only"
            style={{ width: 294, maxHeight: "calc(100% - 90px)", overflowY: "auto" }}>
            <div key={panelKey} className="glass rounded-xl p-5"
              style={{ border: "1px solid rgba(56,189,248,0.13)", boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(56,189,248,0.04)" }}>
              {renderPage()}
            </div>
          </div>

          {/* Page panel - mobile */}
          <div className="mobile-only absolute left-3 right-3 bottom-20"
            style={{ maxHeight: "44vh", overflowY: "auto" }}>
            <div key={panelKey} className="glass rounded-xl p-4"
              style={{ border: "1px solid rgba(56,189,248,0.13)" }}>
              {renderPage()}
            </div>
          </div>

          {/* Status log */}
          <div className="absolute right-4 bottom-16 desktop-only" style={{ width: 224 }}>
            <div className="mb-1 font-mono text-[8px] tracking-[0.25em] text-slate-700">STATUS LOG</div>
            <div className="space-y-0.5">
              {statusLog.slice(0, 7).map((msg, i) => (
                <div key={i} className="font-mono text-[9px] tracking-widest flex items-center gap-1.5"
                  style={{ opacity: 1 - i * 0.12, color: i === 0 ? "#7dd3fc" : "rgba(100,116,139,0.8)" }}>
                  <span style={{ color: i === 0 ? "#38bdf8" : "rgba(56,189,248,0.3)" }}>›</span>
                  {msg}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right telemetry */}
        <aside className="desktop-only flex-none py-4 px-3 overflow-y-auto"
          style={{ width: 218, background: "rgba(1,6,18,0.92)", borderLeft: "1px solid rgba(56,189,248,0.07)" }}>
          <div className="font-mono text-[8px] tracking-[0.3em] text-slate-700 mb-4 px-1">LIVE TELEMETRY</div>
          <div className="glass rounded-lg p-3 mb-3" style={{ border: "1px solid rgba(56,189,248,0.1)" }}>
            <StatRow label="CORE LOAD" value={energyDisplay} />
            <StatRow label="SIGNAL"    value={Math.round(stats.signal)} />
            <StatRow label="MEMORY"    value={38} />
            <StatRow label="FPS"       value={stats.fps} unit="" />
          </div>
          <div className="glass rounded-lg p-3 mb-3" style={{ border: "1px solid rgba(56,189,248,0.1)" }}>
            <div className="font-mono text-[8px] tracking-[0.2em] text-slate-600 mb-2">CURRENT TARGET</div>
            <div className="font-display text-[11px] font-600 tracking-widest text-white mb-0.5">{currentTargetLabel}</div>
            {selectedNode ? (
              <>
                <div className="font-mono text-[9px] tracking-wider text-slate-500">{NODE_TYPE[selectedNode]} · STABLE</div>
                <div className="mt-2">
                  <ProgressBar value={currentTargetEnergy} />
                  <div className="flex justify-end mt-1">
                    <span className="font-mono text-[10px] text-cyan-400">{currentTargetEnergy}%</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="font-mono text-[9px] tracking-wider text-slate-600">NO TARGET</div>
            )}
          </div>
          <div className="glass rounded-lg p-3" style={{ border: "1px solid rgba(56,189,248,0.1)" }}>
            <div className="font-mono text-[8px] tracking-[0.2em] text-slate-600 mb-3">QUICK CONTROLS</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] tracking-widest text-slate-400">ROTATION</span>
                <Toggle on={autoRotate} onChange={v => { setAutoRotate(v); addLog(`AUTO ROTATION: ${v?"ON":"OFF"}`) }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] tracking-widest text-slate-400">GRID</span>
                <Toggle on={showGrid} onChange={v => { setShowGrid(v); addLog(`SPATIAL GRID: ${v?"ON":"OFF"}`) }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] tracking-widest text-slate-400">SAFE MODE</span>
                <Toggle on={safeMode} onChange={v => { setSafeMode(v); addLog(`SAFE MODE: ${v?"ENABLED":"DISABLED"}`) }} />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom bar */}
      <div className="flex-none flex items-center justify-between px-4"
        style={{ height: 48, background: "rgba(1,5,14,0.98)", borderTop: "1px solid rgba(56,189,248,0.08)" }}>
        <div className="desktop-only flex items-center gap-2">
          <button className="btn-secondary py-1.5 px-3 text-[9px]" onClick={() => navigate("home")}>HOME</button>
          <button className={`py-1.5 px-3 text-[9px] font-display font-500 tracking-[0.1em] uppercase rounded-md cursor-pointer transition-all duration-200 ${autoRotate ? "btn-primary" : "btn-secondary"}`}
            onClick={() => { setAutoRotate(v => !v); addLog(`AUTO ROTATION: ${!autoRotate?"ON":"OFF"}`) }}>
            {autoRotate ? "PAUSE ROTATION" : "AUTO ROTATE"}
          </button>
          <button className={`py-1.5 px-3 text-[9px] font-display font-500 tracking-[0.1em] uppercase rounded-md cursor-pointer transition-all duration-200 ${showGrid ? "btn-secondary" : "btn-primary"}`}
            onClick={() => { setShowGrid(v => !v); addLog(`SPATIAL GRID: ${!showGrid?"ON":"OFF"}`) }}>
            {showGrid ? "HIDE GRID" : "SHOW GRID"}
          </button>
          <button className="btn-primary py-1.5 px-3 text-[9px]"
            onClick={() => navigate("scan")}>SCAN</button>
        </div>

        {/* Center: target */}
        <div className="flex items-center gap-3">
          {selectedNode ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full animate-blink" style={{ background: "#38bdf8", boxShadow: "0 0 6px #38bdf8" }} />
              <span className="font-mono text-[9px] tracking-widest text-cyan-400">{NODE_LABELS[selectedNode]}</span>
              <span className="font-mono text-[9px] text-slate-600">·</span>
              <span className="font-mono text-[9px] tracking-widest text-slate-500">{currentTargetEnergy}% · STABLE</span>
              <button className="font-mono text-[9px] tracking-widest text-slate-700 hover:text-slate-500 ml-1"
                onClick={() => setSelectedNode(null)}>✕</button>
            </>
          ) : (
            <span className="font-mono text-[9px] tracking-widest text-slate-700">NO TARGET SELECTED</span>
          )}
        </div>

        <div className="font-mono text-[9px] tracking-widest text-slate-700">{stats.fps} FPS</div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-only flex-none flex items-center justify-around px-2 py-1"
        style={{ background: "rgba(1,5,14,0.99)", borderTop: "1px solid rgba(56,189,248,0.1)", height: 56 }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all duration-200"
            style={{ color: page === item.id ? "#38bdf8" : "rgba(100,116,139,0.5)" }}
            onClick={() => navigate(item.id)}>
            <span className="text-base leading-none">{item.icon}</span>
            <span className="font-mono text-[7px] tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
