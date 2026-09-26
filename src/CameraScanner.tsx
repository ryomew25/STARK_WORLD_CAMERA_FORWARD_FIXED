import { useCallback, useEffect, useRef, useState } from "react"
import * as cocoSsd from "@tensorflow-models/coco-ssd"
import "@tensorflow/tfjs"

export type Detection = {
  class: string
  score: number
  bbox: [number, number, number, number]
  sourceWidth?: number
  sourceHeight?: number
}

interface CameraScannerProps {
  onDetected?: (detections: Detection[]) => void
  onLog?: (message: string) => void
  performanceMode?: boolean
  compact?: boolean
  expanded?: boolean
}

const LABELS: Record<string, string> = {
  person: "PERSON", bicycle: "BICYCLE", car: "CAR", motorcycle: "MOTORCYCLE", airplane: "AIRPLANE",
  bus: "BUS", train: "TRAIN", truck: "TRUCK", boat: "BOAT", bird: "BIRD", cat: "CAT", dog: "DOG",
  horse: "HORSE", sheep: "SHEEP", cow: "COW", elephant: "ELEPHANT", bear: "BEAR", zebra: "ZEBRA",
  giraffe: "GIRAFFE", backpack: "BACKPACK", umbrella: "UMBRELLA", handbag: "HANDBAG", tie: "TIE",
  suitcase: "SUITCASE", frisbee: "FRISBEE", skis: "SKIS", snowboard: "SNOWBOARD", sports_ball: "SPORTS BALL",
  kite: "KITE", baseball_bat: "BASEBALL BAT", baseball_glove: "BASEBALL GLOVE", skateboard: "SKATEBOARD",
  surfboard: "SURFBOARD", tennis_racket: "TENNIS RACKET", bottle: "BOTTLE", wine_glass: "GLASS",
  cup: "CUP", fork: "FORK", knife: "KNIFE", spoon: "SPOON", bowl: "BOWL", banana: "BANANA",
  apple: "APPLE", sandwich: "SANDWICH", orange: "ORANGE", broccoli: "BROCCOLI", carrot: "CARROT",
  hot_dog: "HOT DOG", pizza: "PIZZA", donut: "DONUT", cake: "CAKE", chair: "CHAIR", couch: "COUCH",
  potted_plant: "PLANT", bed: "BED", dining_table: "TABLE", toilet: "TOILET", tv: "TV", laptop: "LAPTOP",
  mouse: "MOUSE", remote: "REMOTE", keyboard: "KEYBOARD", cell_phone: "PHONE", microwave: "MICROWAVE",
  oven: "OVEN", toaster: "TOASTER", sink: "SINK", refrigerator: "REFRIGERATOR", book: "BOOK", clock: "CLOCK",
  vase: "VASE", scissors: "SCISSORS", teddy_bear: "TEDDY BEAR", hair_drier: "HAIR DRIER", toothbrush: "TOOTHBRUSH",
}

function prettyLabel(label: string) { return LABELS[label] ?? label.toUpperCase().replaceAll("_", " ") }

export default function CameraScanner({ onDetected, onLog, performanceMode = false, compact = false, expanded = false }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastInferenceRef = useRef(0)
  const lastSignatureRef = useRef("")
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [secure, setSecure] = useState(true)
  const [error, setError] = useState("")
  const [detections, setDetections] = useState<Detection[]>([])
  const [facing, setFacing] = useState<"environment" | "user">("environment")
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [fps, setFps] = useState(0)

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setRunning(false)
    setLoading(false)
    setFps(0)
    setDetections([])
    const canvas = overlayRef.current
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const draw = useCallback((items: Detection[]) => {
    const video = videoRef.current
    const canvas = overlayRef.current
    if (!video || !canvas || video.videoWidth === 0) return
    const rect = video.getBoundingClientRect()
    const scaleX = rect.width / video.videoWidth
    const scaleY = rect.height / video.videoHeight
    canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio))
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace"
    items.forEach(item => {
      const [x, y, w, h] = item.bbox
      const bx = x * scaleX, by = y * scaleY, bw = w * scaleX, bh = h * scaleY
      ctx.strokeStyle = "rgba(56,189,248,0.95)"
      ctx.lineWidth = 1.5
      ctx.strokeRect(bx, by, bw, bh)
      const label = `${prettyLabel(item.class)}  ${Math.round(item.score * 100)}%`
      const tw = ctx.measureText(label).width + 12
      ctx.fillStyle = "rgba(5,15,25,0.82)"
      ctx.fillRect(bx, Math.max(0, by - 18), tw, 18)
      ctx.fillStyle = "#67e8f9"
      ctx.fillText(label, bx + 6, Math.max(12, by - 6))
      const s = 7
      ctx.strokeStyle = "rgba(103,232,249,0.95)"
      ctx.beginPath(); ctx.moveTo(bx, by+s); ctx.lineTo(bx, by); ctx.lineTo(bx+s, by); ctx.moveTo(bx+bw-s, by); ctx.lineTo(bx+bw, by); ctx.lineTo(bx+bw, by+s); ctx.moveTo(bx, by+bh-s); ctx.lineTo(bx, by+bh); ctx.lineTo(bx+s, by+bh); ctx.moveTo(bx+bw-s, by+bh); ctx.lineTo(bx+bw, by+bh); ctx.lineTo(bx+bw, by+bh-s); ctx.stroke()
    })
  }, [])

  const start = useCallback(async () => {
    setError("")
    setDetections([])
    if (!window.isSecureContext) { setSecure(false); setError("CAMERA REQUIRES HTTPS OR LOCALHOST"); return }
    if (!navigator.mediaDevices?.getUserMedia) { setError("THIS BROWSER DOES NOT SUPPORT CAMERA ACCESS"); return }
    stop()
    setLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error("VIDEO ELEMENT UNAVAILABLE")
      video.srcObject = stream
      await video.play()
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter(d => d.kind === "videoinput"))
      onLog?.("CAMERA INPUT ONLINE")
      if (!modelRef.current) {
        onLog?.("OBJECT MODEL LOADING")
        modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" })
        onLog?.("OBJECT MODEL READY · LOCAL INFERENCE")
      }
      setLoading(false)
      setRunning(true)
      let frameCount = 0
      let fpsStart = performance.now()
      const loop = async (now: number) => {
        if (!streamRef.current || !videoRef.current || !modelRef.current) return
        rafRef.current = requestAnimationFrame(loop)
        const interval = performanceMode ? 220 : 130
        if (now - lastInferenceRef.current < interval || video.readyState < 2) return
        lastInferenceRef.current = now
        try {
          const raw = await modelRef.current.detect(video, 20, 0.42)
          const next = raw.map(d => ({
            class: d.class,
            score: d.score,
            bbox: d.bbox as [number, number, number, number],
            sourceWidth: video.videoWidth,
            sourceHeight: video.videoHeight,
          }))
          setDetections(next)
          draw(next)
          onDetected?.(next)
          const signature = next.map(d => `${d.class}:${Math.round(d.score * 100 / 5) * 5}`).join("|")
          if (signature && signature !== lastSignatureRef.current) {
            lastSignatureRef.current = signature
            const top = next[0]
            onLog?.(`OBJECT DETECTED · ${prettyLabel(top.class)} · ${Math.round(top.score * 100)}%`)
          }
          frameCount++
          const elapsed = performance.now() - fpsStart
          if (elapsed > 1000) { setFps(Math.round(frameCount * 1000 / elapsed)); frameCount = 0; fpsStart = performance.now() }
        } catch (e) {
          console.error(e)
        }
      }
      lastInferenceRef.current = 0
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      setLoading(false); setRunning(false)
      const message = e instanceof DOMException ? (e.name === "NotAllowedError" ? "CAMERA PERMISSION WAS DENIED" : e.name === "NotFoundError" ? "NO CAMERA WAS FOUND" : e.message) : "UNABLE TO ACTIVATE VISION"
      setError(message.toUpperCase())
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null
      onLog?.("CAMERA START FAILED")
    }
  }, [draw, facing, onDetected, onLog, performanceMode, stop])

  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent).detail
      if (value === "environment" || value === "user") setFacing(value)
    }
    window.addEventListener("stark-camera-facing", handler)
    return () => window.removeEventListener("stark-camera-facing", handler)
  }, [])

  useEffect(() => {
    setSecure(window.isSecureContext)
    const timer = window.setTimeout(() => {
      void start()
    }, 450)
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [])

  useEffect(() => {
    if (running) void start()
  }, [facing]) // user-triggered switch

  return (
    <div className={`camera-scanner ${compact ? "camera-scanner-compact" : ""} ${expanded ? "camera-scanner-expanded" : ""}`}>
      <div className="camera-header">
        <div>
          <div className="font-mono text-[8px] tracking-[0.2em] text-slate-600">REAL-TIME CAMERA INPUT</div>
          <div className="font-display text-[12px] tracking-[0.12em] text-white mt-1">VISION · OBJECT RECOGNITION</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`camera-dot ${running ? "active" : ""}`} />
          <span className="font-mono text-[8px] tracking-widest text-slate-500">{loading ? "LOADING" : running ? `LIVE · ${fps} FPS` : "STANDBY"}</span>
        </div>
      </div>
      <div className="camera-frame">
        <video ref={videoRef} muted playsInline autoPlay className="camera-video" />
        <canvas ref={overlayRef} className="camera-overlay" />
        {!running && !loading && <div className="camera-placeholder"><div className="camera-icon">◎</div><div className="font-mono text-[9px] tracking-widest text-slate-500">VISION STANDBY</div></div>}
        {loading && <div className="camera-placeholder"><div className="camera-icon pulse">◌</div><div className="font-mono text-[9px] tracking-widest text-cyan-400">INITIALIZING VISION MODEL...</div></div>}
        {(running || loading) && <div className="camera-reticle"><span /><i /></div>}
        {running && <div className="camera-scanline" />}
      </div>
      {!secure && <div className="camera-error">CAMERA REQUIRES HTTPS OR LOCALHOST</div>}
      {error && <div className="camera-error">{error}</div>}
      {!compact && <div className="camera-actions">
        {!running ? <button className="btn-primary flex-1" onClick={() => void start()} disabled={loading}>{loading ? "LOADING MODEL" : "ACTIVATE VISION"}</button> : <button className="btn-secondary flex-1" onClick={stop}>STOP VISION</button>}
      </div>}
      {!compact && <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          className={facing === "environment" ? "btn-primary" : "btn-secondary"}
          onClick={() => setFacing("environment")}
          disabled={loading || devices.length < 2 && running}
          title="Use the phone's outward-facing/rear camera"
        >
          FORWARD CAMERA
        </button>
        <button
          className={facing === "user" ? "btn-primary" : "btn-secondary"}
          onClick={() => setFacing("user")}
          disabled={loading || devices.length < 2 && running}
          title="Use the phone's selfie/front camera"
        >
          SELF CAMERA
        </button>
      </div>}
      {!compact && <div className="font-mono text-[8px] tracking-widest text-slate-600 mt-2">
        CAMERA MODE · {facing === "environment" ? "FORWARD / WORLD VIEW" : "SELF / USER VIEW"}
      </div>}
      {!compact && <div className="mt-3 rounded-md p-3" style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.12)" }}>
        <div className="font-mono text-[8px] tracking-widest text-slate-600 mb-2">DETECTED OBJECTS · IN-BROWSER AI</div>
        {detections.length === 0 ? <div className="font-mono text-[9px] text-slate-700">{running ? "ANALYZING CAMERA FEED..." : "NO OBJECTS DETECTED"}</div> : <div className="space-y-1.5">{detections.slice(0, 8).map((d, i) => <div key={`${d.class}-${i}`} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 4px #34d399" }} /><span className="font-mono text-[10px] tracking-widest text-slate-300">{prettyLabel(d.class)}</span></div><span className="font-mono text-[10px] text-cyan-300">{Math.round(d.score * 100)}%</span></div>)}</div>}
      </div>}
      {!compact && <div className="font-mono text-[7px] leading-relaxed tracking-wider text-slate-700 mt-2">AI OFFLINE · VISION · OBJECT RECOGNITION RUNS IN THIS BROWSER. No image is sent to an external AI API. The model is downloaded when first started.</div>}
    </div>
  )
}
