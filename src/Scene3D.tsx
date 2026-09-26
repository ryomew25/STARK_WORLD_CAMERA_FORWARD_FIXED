import { useRef, useEffect, useCallback } from "react"

export type NodeId = "arc-core" | "north" | "east" | "west" | "south"

export interface FocusTarget { id: NodeId; az: number; el: number; zoom: number }

interface Scene3DProps {
  selectedNode: NodeId | null
  showGrid: boolean
  autoRotate: boolean
  safeMode: boolean
  performanceMode: boolean
  scanRunning: boolean
  scanProgress: number
  focusTarget: FocusTarget | null
  onNodeClick: (id: NodeId) => void
  onFocusComplete: () => void
  onFpsUpdate: (fps: number) => void
}

interface Ring { radius: number; tilt: number; rotation: number; speed: number; phase: number }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; freq: number }

const NODE_POSITIONS: Record<string, [number, number, number]> = {
  "arc-core": [0, 0, 0],
  north: [0, 0, -195],
  south: [0, 0, 195],
  east: [195, 0, 0],
  west: [-195, 0, 0],
}

const NODE_PHASES: Record<string, number> = {
  "arc-core": 0, north: 1.2, south: 2.4, east: 3.6, west: 4.8,
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  return diff
}

function project(
  x: number, y: number, z: number,
  az: number, el: number, zoom: number,
  w: number, h: number
): [number, number, number] {
  const cosEl = Math.cos(el), sinEl = Math.sin(el)
  const y1 = y * cosEl - z * sinEl
  const z1 = y * sinEl + z * cosEl
  const cosAz = Math.cos(az), sinAz = Math.sin(az)
  const x2 = x * cosAz - z1 * sinAz
  const z2 = x * sinAz + z1 * cosAz
  const camDist = 460
  const depth = camDist - z2
  const fov = 420 * zoom
  const scale = fov / Math.max(depth, 8)
  return [x2 * scale + w / 2, -y1 * scale + h / 2, scale]
}

function initParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 520,
    y: (Math.random() - 0.5) * 160,
    z: (Math.random() - 0.5) * 520,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.15,
    vz: (Math.random() - 0.5) * 0.25,
    size: Math.random() * 1.6 + 0.4,
    freq: 0.8 + Math.random() * 1.2,
  }))
}

function initRings(): Ring[] {
  return [
    { radius: 58, tilt: 0.12, rotation: 0, speed: 0.014, phase: 0 },
    { radius: 78, tilt: Math.PI / 2.6, rotation: 0.9, speed: -0.008, phase: 2.1 },
    { radius: 98, tilt: Math.PI / 1.8, rotation: 1.8, speed: 0.005, phase: 4.2 },
    { radius: 115, tilt: Math.PI / 4, rotation: 3.0, speed: -0.0035, phase: 1.0 },
  ]
}

export default function Scene3D({
  selectedNode, showGrid, autoRotate, safeMode, performanceMode,
  scanRunning, scanProgress, focusTarget, onNodeClick, onFocusComplete, onFpsUpdate,
}: Scene3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef({ azimuth: 0.55, elevation: 0.28, zoom: 1.0 })
  const ringsRef = useRef<Ring[]>(initRings())
  const particlesRef = useRef<Particle[]>(initParticles(70))
  const nodeScreenRef = useRef<Record<string, [number, number, number]>>({})
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: false })
  const pinchRef = useRef({ active: false, lastDist: 0 })

  // Stable refs for props used in animation loop
  const selectedNodeRef = useRef(selectedNode)
  const showGridRef = useRef(showGrid)
  const autoRotateRef = useRef(autoRotate)
  const safeModeRef = useRef(safeMode)
  const performanceModeRef = useRef(performanceMode)
  const scanRunningRef = useRef(scanRunning)
  const scanProgressRef = useRef(scanProgress)
  const focusTargetRef = useRef(focusTarget)
  const onFocusCompleteRef = useRef(onFocusComplete)
  const onFpsUpdateRef = useRef(onFpsUpdate)
  const onNodeClickRef = useRef(onNodeClick)

  useEffect(() => { selectedNodeRef.current = selectedNode }, [selectedNode])
  useEffect(() => { showGridRef.current = showGrid }, [showGrid])
  useEffect(() => { autoRotateRef.current = autoRotate }, [autoRotate])
  useEffect(() => { safeModeRef.current = safeMode }, [safeMode])
  useEffect(() => { performanceModeRef.current = performanceMode }, [performanceMode])
  useEffect(() => { scanRunningRef.current = scanRunning }, [scanRunning])
  useEffect(() => { scanProgressRef.current = scanProgress }, [scanProgress])
  useEffect(() => { focusTargetRef.current = focusTarget }, [focusTarget])
  useEffect(() => { onFocusCompleteRef.current = onFocusComplete }, [onFocusComplete])
  useEffect(() => { onFpsUpdateRef.current = onFpsUpdate }, [onFpsUpdate])
  useEffect(() => { onNodeClickRef.current = onNodeClick }, [onNodeClick])

  // Adjust particle pool when safe/perf mode changes
  useEffect(() => {
    const count = (safeMode || performanceMode) ? (safeMode && performanceMode ? 15 : 25) : 70
    particlesRef.current = initParticles(count)
  }, [safeMode, performanceMode])

  const getDpr = useCallback(() => {
    if (performanceModeRef.current) return Math.min(window.devicePixelRatio || 1, 1)
    return Math.min(window.devicePixelRatio || 1, 2)
  }, [])

  const drawRing = (
    ctx: CanvasRenderingContext2D,
    ring: Ring, az: number, el: number, zoom: number, w: number, h: number,
    alpha: number, safe: boolean
  ) => {
    const N = safe ? 48 : 80
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2
      const rx = Math.cos(a) * ring.radius
      const ry = Math.sin(a) * ring.radius * Math.sin(ring.tilt)
      const rz = Math.sin(a) * ring.radius * Math.cos(ring.tilt)
      const rotX = rx * Math.cos(ring.rotation) - rz * Math.sin(ring.rotation)
      const rotZ = rx * Math.sin(ring.rotation) + rz * Math.cos(ring.rotation)
      const [sx, sy] = project(rotX, ry, rotZ, az, el, zoom, w, h)
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
    }
    ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`
    ctx.lineWidth = 1.2
    if (!safe) { ctx.shadowColor = "rgba(56, 189, 248, 0.4)"; ctx.shadowBlur = 4 }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  const drawGrid = (ctx: CanvasRenderingContext2D, az: number, el: number, zoom: number, w: number, h: number) => {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.055)"
    ctx.lineWidth = 0.5
    const size = 380, step = 76, gridY = -105
    for (let x = -size; x <= size; x += step) {
      ctx.beginPath(); let s = false
      for (let z = -size; z <= size; z += step) {
        const [sx, sy] = project(x, gridY, z, az, el, zoom, w, h)
        if (!s) { ctx.moveTo(sx, sy); s = true } else ctx.lineTo(sx, sy)
      }
      ctx.stroke()
    }
    for (let z = -size; z <= size; z += step) {
      ctx.beginPath(); let s = false
      for (let x = -size; x <= size; x += step) {
        const [sx, sy] = project(x, gridY, z, az, el, zoom, w, h)
        if (!s) { ctx.moveTo(sx, sy); s = true } else ctx.lineTo(sx, sy)
      }
      ctx.stroke()
    }
  }

  const drawConnection = (
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    time: number, active: boolean, safe: boolean
  ) => {
    ctx.beginPath()
    ctx.strokeStyle = `rgba(56, 189, 248, ${active ? 0.28 : 0.1})`
    ctx.lineWidth = 1
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    if (safe) return
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 20) return
    for (let i = 0; i < 5; i++) {
      const t = ((time * 0.00038) + i / 5) % 1
      const fade = Math.sin(t * Math.PI)
      ctx.beginPath()
      ctx.fillStyle = `rgba(56, 189, 248, ${fade * (active ? 0.95 : 0.5)})`
      ctx.arc(x1 + dx * t, y1 + dy * t, active ? 2.5 : 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const drawNode = (
    ctx: CanvasRenderingContext2D,
    sx: number, sy: number, scale: number,
    isSelected: boolean, pulse: number, label: string, safe: boolean
  ) => {
    const r = Math.max(14 * scale, 6)
    if (!safe) {
      const glowR = r * 3.5 * pulse
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR)
      g.addColorStop(0, `rgba(56, 189, 248, ${0.22 * pulse})`)
      g.addColorStop(1, "rgba(56, 189, 248, 0)")
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, Math.PI * 2); ctx.fill()
    }
    const cg = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.35, 0, sx, sy, r)
    cg.addColorStop(0, "#e0f2fe"); cg.addColorStop(0.4, "#7dd3fc"); cg.addColorStop(1, "#0369a1")
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2)
    if (!safe) { ctx.shadowColor = "rgba(56, 189, 248, 0.7)"; ctx.shadowBlur = 10 }
    ctx.fill(); ctx.shadowBlur = 0
    if (isSelected) {
      ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(sx, sy, r + 7, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = "rgba(56, 189, 248, 0.3)"; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(sx, sy, r + 14, 0, Math.PI * 2); ctx.stroke()
    }
    if (scale > 0.4) {
      ctx.fillStyle = `rgba(148, 163, 184, ${Math.min(scale, 1) * 0.7})`
      ctx.font = `500 ${Math.round(9 * Math.min(scale, 1))}px 'JetBrains Mono'`
      ctx.textAlign = "center"
      ctx.fillText(label.toUpperCase(), sx, sy + r + 12)
    }
  }

  const drawCore = (
    ctx: CanvasRenderingContext2D,
    sx: number, sy: number, scale: number,
    rings: Ring[], time: number, isSelected: boolean,
    az: number, el: number, zoom: number, w: number, h: number, safe: boolean
  ) => {
    const r = Math.max(38 * scale, 18)
    if (!safe) {
      const outerGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 5.5)
      outerGlow.addColorStop(0, "rgba(14, 165, 233, 0.18)")
      outerGlow.addColorStop(0.4, "rgba(14, 165, 233, 0.06)")
      outerGlow.addColorStop(1, "rgba(14, 165, 233, 0)")
      ctx.fillStyle = outerGlow; ctx.beginPath(); ctx.arc(sx, sy, r * 5.5, 0, Math.PI * 2); ctx.fill()
    }
    for (const ring of rings) {
      const alpha = 0.45 + 0.2 * Math.sin(time * 0.0009 + ring.phase)
      drawRing(ctx, ring, az, el, zoom, w, h, alpha, safe)
    }
    const cg = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.38, 0, sx, sy, r)
    cg.addColorStop(0, "#f0f9ff"); cg.addColorStop(0.2, "#bae6fd"); cg.addColorStop(0.55, "#0ea5e9"); cg.addColorStop(1, "#075985")
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2)
    if (!safe) { ctx.shadowColor = "rgba(56, 189, 248, 0.9)"; ctx.shadowBlur = 20 }
    ctx.fill(); ctx.shadowBlur = 0
    const sp = ctx.createRadialGradient(sx - r * 0.38, sy - r * 0.4, 0, sx - r * 0.2, sy - r * 0.2, r * 0.75)
    sp.addColorStop(0, "rgba(255,255,255,0.65)"); sp.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
    if (isSelected) {
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(sx, sy, r + 10, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)"; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(sx, sy, r + 20, 0, Math.PI * 2); ctx.stroke()
    }
    if (scale > 0.5) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)"
      ctx.font = `500 ${Math.round(9 * Math.min(scale, 1))}px 'JetBrains Mono'`
      ctx.textAlign = "center"
      ctx.fillText("ARC CORE", sx, sy + r + 14)
    }
  }

  const render = useCallback((time: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = getDpr()
    const w = canvas.width / dpr, h = canvas.height / dpr
    const safe = safeModeRef.current

    ctx.save(); ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75)
    bg.addColorStop(0, "#040f22"); bg.addColorStop(0.5, "#020c1a"); bg.addColorStop(1, "#010810")
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)

    const { azimuth: az, elevation: el, zoom } = cameraRef.current
    const sel = selectedNodeRef.current
    const rings = ringsRef.current

    if (showGridRef.current) drawGrid(ctx, az, el, zoom, w, h)

    const ns: Record<string, [number, number, number]> = {}
    for (const [id, [x, y, z]] of Object.entries(NODE_POSITIONS)) {
      ns[id] = project(x, y, z, az, el, zoom, w, h)
    }
    nodeScreenRef.current = ns
    const [csx, csy] = ns["arc-core"]

    for (const id of ["north", "south", "east", "west"]) {
      const [nx, ny] = ns[id]
      drawConnection(ctx, csx, csy, nx, ny, time, sel === id || sel === "arc-core", safe)
    }

    for (const p of particlesRef.current) {
      const [px, py, ps] = project(p.x, p.y, p.z, az, el, zoom, w, h)
      if (ps > 0.05) {
        const alpha = (0.12 + 0.18 * Math.sin(time * p.freq * 0.001)) * Math.min(ps * 2, 1)
        ctx.beginPath()
        ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`
        ctx.arc(px, py, p.size * Math.min(ps * 8, 2.5), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const id of ["north", "south", "east", "west"]) {
      const [nx, ny, ns_scale] = ns[id]
      const pulse = 0.65 + 0.35 * Math.sin(time * 0.0018 + NODE_PHASES[id])
      drawNode(ctx, nx, ny, ns_scale, sel === id, pulse, id, safe)
    }

    const [csx2, csy2, cs] = ns["arc-core"]
    drawCore(ctx, csx2, csy2, cs, rings, time, sel === "arc-core", az, el, zoom, w, h, safe)

    if (scanRunningRef.current && scanProgressRef.current > 0) {
      const prog = scanProgressRef.current / 100
      const maxR = Math.min(w, h) * 0.46 * prog
      const alpha = 0.65 * (1 - prog * 0.6)
      ctx.beginPath()
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`
      ctx.lineWidth = 2
      if (!safe) { ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 12 }
      ctx.arc(csx2, csy2, maxR, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0
      if (maxR > 30) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.3})`
        ctx.lineWidth = 1; ctx.arc(csx2, csy2, maxR - 22, 0, Math.PI * 2); ctx.stroke()
      }
    }

    ctx.restore()
  }, [getDpr])

  // Animation loop with FPS measurement and focus lerp
  useEffect(() => {
    let animId: number
    let frameCount = 0
    let lastFpsTime = 0

    const loop = (time: number) => {
      // FPS measurement
      frameCount++
      if (time - lastFpsTime >= 1000) {
        const fps = Math.round(frameCount * 1000 / (time - lastFpsTime))
        onFpsUpdateRef.current(fps)
        frameCount = 0
        lastFpsTime = time
      }

      const ft = focusTargetRef.current
      if (ft) {
        // Lerp camera toward focus target, suppressing auto-rotate
        const cam = cameraRef.current
        const t = 0.045
        cam.azimuth += shortestAngleDiff(cam.azimuth, ft.az) * t
        cam.elevation += (ft.el - cam.elevation) * t
        cam.zoom += (ft.zoom - cam.zoom) * t
        const done =
          Math.abs(shortestAngleDiff(cam.azimuth, ft.az)) < 0.015 &&
          Math.abs(cam.elevation - ft.el) < 0.008 &&
          Math.abs(cam.zoom - ft.zoom) < 0.008
        if (done) { focusTargetRef.current = null; onFocusCompleteRef.current() }
      } else {
        if (autoRotateRef.current) cameraRef.current.azimuth += 0.0028
      }

      for (const ring of ringsRef.current) ring.rotation += ring.speed
      for (const p of particlesRef.current) {
        p.x += p.vx; p.y += p.vy; p.z += p.vz
        if (Math.abs(p.x) > 285) p.vx *= -1
        if (Math.abs(p.y) > 105) p.vy *= -1
        if (Math.abs(p.z) > 285) p.vz *= -1
      }

      render(time)
      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [render])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = getDpr()
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [getDpr])

  // Click detection
  const handleClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = clientX - rect.left, cy = clientY - rect.top
    let closest: NodeId | null = null
    let minD = 44
    for (const [id, [sx, sy, scale]] of Object.entries(nodeScreenRef.current)) {
      const hitR = Math.max(18 * scale, 10) + 8
      const d = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2)
      if (d < hitR && d < minD) { minD = d; closest = id as NodeId }
    }
    if (closest) onNodeClickRef.current(closest)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d.active) return
    const dx = e.clientX - d.lastX, dy = e.clientY - d.lastY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true
    cameraRef.current.azimuth += dx * 0.006
    cameraRef.current.elevation = Math.max(-0.05, Math.min(Math.PI / 2.2, cameraRef.current.elevation - dy * 0.005))
    dragRef.current.lastX = e.clientX; dragRef.current.lastY = e.clientY
  }, [])

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d.moved) handleClick(e.clientX, e.clientY)
    d.active = false; d.moved = false
  }, [handleClick])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    cameraRef.current.zoom = Math.max(0.45, Math.min(2.5, cameraRef.current.zoom - e.deltaY * 0.001))
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY, moved: false }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchRef.current = { active: true, lastDist: Math.sqrt(dx * dx + dy * dy) }
      dragRef.current.active = false
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length === 1 && dragRef.current.active) {
      const dx = e.touches[0].clientX - dragRef.current.lastX
      const dy = e.touches[0].clientY - dragRef.current.lastY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true
      cameraRef.current.azimuth += dx * 0.007
      cameraRef.current.elevation = Math.max(-0.05, Math.min(Math.PI / 2.2, cameraRef.current.elevation - dy * 0.006))
      dragRef.current.lastX = e.touches[0].clientX; dragRef.current.lastY = e.touches[0].clientY
    } else if (e.touches.length === 2 && pinchRef.current.active) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      cameraRef.current.zoom = Math.max(0.45, Math.min(2.5, cameraRef.current.zoom + (dist - pinchRef.current.lastDist) * 0.003))
      pinchRef.current.lastDist = dist
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches.length === 1 && !dragRef.current.moved) {
      handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
    }
    dragRef.current.active = false; dragRef.current.moved = false
    pinchRef.current.active = false
  }, [handleClick])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ touchAction: "none", cursor: "crosshair" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { dragRef.current.active = false }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  )
}
