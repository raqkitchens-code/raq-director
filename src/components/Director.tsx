import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ANALYSIS_H, ANALYSIS_W, edgeMap, frameStats, lumaFromRGBA, ncc, type FrameStats } from "../lib/analysis"
import {
  LENS_ZOOM,
  applyZoom,
  capabilities,
  focusAt,
  listCameras,
  openCamera,
  pickMime,
  readLensMap,
  rememberLens,
  setTorch,
  type CameraDevice,
} from "../lib/camera"
import { evaluateTake, readiness } from "../lib/checks"
import { db } from "../lib/db"
import { FRAMING_AR, HEIGHT_AR, HEIGHT_CM, LENS_AR, MOVE_AR, arNum, pitchAr } from "../lib/labels"
import {
  readCalibration,
  requestMotionPermission,
  saveCalibration,
  startMotion,
  type MotionSample,
} from "../lib/motion"
import { consentBlocked } from "../lib/pack"
import type { CheckResult, ShootPack, Take } from "../lib/types"

interface Props {
  pack: ShootPack
  shotIndex: number
  takes: Take[]
  onSaved: (t: Take) => void
  onPackChange: (p: ShootPack) => void
  onGo: (index: number) => void
  onExit: () => void
}

type Phase = "framing" | "countdown" | "recording" | "review"

interface Review {
  blob: Blob
  url: string
  duration: number
  checks: CheckResult[]
  verdict: "accepted" | "retake"
  poster: string
  mime: string
}

/** Draws the centre 9:16 part of the source into a small canvas. */
function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, w: number, h: number) {
  const target = w / h
  let cw = sw
  let ch = sh
  if (sw / sh > target) cw = sh * target
  else ch = sw / target
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h)
}

export function Director({ pack, shotIndex, takes, onSaved, onPackChange, onGo, onExit }: Props) {
  const shot = pack.shots[shotIndex]
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const samples = useRef<{ motion: MotionSample[]; frames: FrameStats[]; matches: number[] }>({
    motion: [],
    frames: [],
    matches: [],
  })
  const att = useRef<MotionSample | null>(null)
  const refEdges = useRef<Float32Array | null>(null)
  const prompterRef = useRef<HTMLDivElement>(null)
  const readySince = useRef(0)

  const [phase, setPhase] = useState<Phase>("framing")
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(() =>
    shot.lens === "front" ? undefined : readLensMap()[shot.lens],
  )
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [torch, setTorchOn] = useState(false)
  const [attitude, setAttitude] = useState<MotionSample | null>(null)
  const [stats, setStats] = useState<FrameStats | null>(null)
  const [match, setMatch] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [review, setReview] = useState<Review | null>(null)
  const [showPrompter, setShowPrompter] = useState(Boolean(shot.prompter))
  const [prompterSpeed, setPrompterSpeed] = useState(40)
  const [ghost, setGhost] = useState(0.35)
  const [autoStart, setAutoStart] = useState(false)
  const [focusPt, setFocusPt] = useState<{ x: number; y: number } | null>(null)
  const [motionOk, setMotionOk] = useState(true)

  const blocked = consentBlocked(pack, shot)
  const shotTakes = takes.filter((t) => t.pack_id === pack.id && t.shot_id === shot.id)

  // Camera
  useEffect(() => {
    let cancelled = false
    setError(null)
    openCamera({ lens: shot.lens, deviceId: shot.lens === "front" ? undefined : deviceId, audio: true })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        const track = stream.getVideoTracks()[0]
        const z = capabilities(track).zoom ?? null
        setZoomCaps(z)
        // No dedicated camera chosen for this lens yet: get close with zoom.
        const wanted = deviceId ? 1 : LENS_ZOOM[shot.lens]
        const applied = await applyZoom(track, wanted)
        setZoom(applied ?? 1)
        setDevices((await listCameras()).filter((d) => d.back))
      })
      .catch((e: DOMException) => {
        setError(
          e.name === "NotAllowedError"
            ? "الكاميرا مقفولة. افتح إعدادات الموقع في المتصفح واسمح بالكاميرا والميكروفون."
            : "الكاميرا مش بتفتح. اقفل أي برنامج تاني بيستخدمها وجرّب تاني.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [shot.lens, deviceId])

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (review) URL.revokeObjectURL(review.url)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Keep the screen on while directing.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {})
    return () => {
      lock?.release().catch(() => {})
    }
  }, [])

  // Motion
  useEffect(() => {
    let stop = () => {}
    let raf = 0
    let last = 0
    requestMotionPermission().then((ok) => {
      setMotionOk(ok)
      stop = startMotion((s) => {
        att.current = s
        if (recRef.current?.state === "recording") samples.current.motion.push(s)
      })
      const tick = (t: number) => {
        if (t - last > 100 && att.current) {
          last = t
          setAttitude(att.current)
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    return () => {
      stop()
      cancelAnimationFrame(raf)
    }
  }, [])

  // Reference frame edges
  useEffect(() => {
    refEdges.current = null
    setMatch(null)
    if (!shot.reference_image) return
    const img = new Image()
    img.onload = () => {
      const c = document.createElement("canvas")
      c.width = ANALYSIS_W
      c.height = ANALYSIS_H
      const ctx = c.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      drawCover(ctx, img, img.width, img.height, ANALYSIS_W, ANALYSIS_H)
      const l = lumaFromRGBA(ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H).data, ANALYSIS_W, ANALYSIS_H)
      refEdges.current = edgeMap(l, ANALYSIS_W, ANALYSIS_H)
    }
    img.src = shot.reference_image
  }, [shot.reference_image])

  // Frame analysis, 4 times a second
  useEffect(() => {
    const c = document.createElement("canvas")
    c.width = ANALYSIS_W
    c.height = ANALYSIS_H
    const ctx = c.getContext("2d", { willReadFrequently: true })
    const id = window.setInterval(() => {
      const v = videoRef.current
      if (!ctx || !v || v.readyState < 2 || !v.videoWidth) return
      drawCover(ctx, v, v.videoWidth, v.videoHeight, ANALYSIS_W, ANALYSIS_H)
      const l = lumaFromRGBA(ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H).data, ANALYSIS_W, ANALYSIS_H)
      const f = frameStats(l, ANALYSIS_W, ANALYSIS_H)
      setStats(f)
      let m: number | null = null
      if (refEdges.current) {
        m = ncc(edgeMap(l, ANALYSIS_W, ANALYSIS_H), refEdges.current)
        setMatch(m)
      }
      if (recRef.current?.state === "recording") {
        samples.current.frames.push(f)
        if (m !== null) samples.current.matches.push(m)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  const ready = useMemo(() => readiness(shot, attitude, stats, match), [shot, attitude, stats, match])

  const stopRecording = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop()
  }, [])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const mime = pickMime()
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 12_000_000 })
    } catch {
      setError("التسجيل مش مدعوم على المتصفح ده. استخدم كروم.")
      setPhase("framing")
      return
    }
    chunks.current = []
    samples.current = { motion: [], frames: [], matches: [] }
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    rec.onstop = () => {
      const duration = (performance.now() - startedAt.current) / 1000
      const type = rec.mimeType || mime || "video/webm"
      const blob = new Blob(chunks.current, { type })
      const { checks, verdict } = evaluateTake(shot, { duration, ...samples.current })
      let poster = ""
      const v = videoRef.current
      if (v && v.videoWidth) {
        const c = document.createElement("canvas")
        c.width = 270
        c.height = 480
        const ctx = c.getContext("2d")
        if (ctx) {
          drawCover(ctx, v, v.videoWidth, v.videoHeight, 270, 480)
          poster = c.toDataURL("image/jpeg", 0.7)
        }
      }
      setReview({ blob, url: URL.createObjectURL(blob), duration, checks, verdict, poster, mime: type })
      setPhase("review")
    }
    recRef.current = rec
    rec.start(1000)
    startedAt.current = performance.now()
    setElapsed(0)
    setPhase("recording")
  }, [shot])

  // Countdown then record
  useEffect(() => {
    if (phase !== "countdown") return
    if (count <= 0) {
      startRecording()
      return
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [phase, count, startRecording])

  // Recording timer, auto-stop at the shot's maximum, teleprompter scroll
  useEffect(() => {
    if (phase !== "recording") return
    let raf = 0
    let lastT = performance.now()
    let offset = 0
    const tick = (t: number) => {
      const s = (t - startedAt.current) / 1000
      setElapsed(s)
      if (prompterRef.current) {
        offset += ((t - lastT) / 1000) * prompterSpeed
        prompterRef.current.style.transform = `translateY(${-offset}px)`
      }
      lastT = t
      if (s >= shot.duration_s[1]) {
        stopRecording()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, prompterSpeed, shot.duration_s, stopRecording])

  // Optional: start by itself once the frame has been green for a moment
  useEffect(() => {
    if (!autoStart || phase !== "framing" || blocked) return
    if (!ready.ready) {
      readySince.current = 0
      return
    }
    if (!readySince.current) readySince.current = performance.now()
    else if (performance.now() - readySince.current > 1200) {
      readySince.current = 0
      setCount(3)
      setPhase("countdown")
    }
  }, [autoStart, phase, ready.ready, blocked])

  useEffect(() => {
    if (phase === "framing" && prompterRef.current) prompterRef.current.style.transform = "translateY(0)"
  }, [phase])

  const onRecordButton = () => {
    if (blocked) return
    if (phase === "framing") {
      setCount(3)
      setPhase("countdown")
    } else if (phase === "countdown") setPhase("framing")
    else if (phase === "recording") stopRecording()
  }

  const onTapVideo = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || phase === "review") return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    setFocusPt({ x, y })
    focusAt(track, x, y)
    window.setTimeout(() => setFocusPt(null), 1200)
  }

  const finishReview = async (keep: boolean, asReference = false) => {
    if (!review) return
    if (keep) {
      const take: Take = {
        id: crypto.randomUUID(),
        pack_id: pack.id,
        shot_id: shot.id,
        n: shotTakes.length + 1,
        created_at: new Date().toISOString(),
        duration_s: Math.round(review.duration * 10) / 10,
        mime: review.mime,
        size: review.blob.size,
        checks: review.checks,
        verdict: review.verdict,
        kept: true,
        poster: review.poster,
      }
      try {
        await db.addTake(take, review.blob)
        onSaved(take)
      } catch {
        setError("مفيش مساحة كفاية على الموبايل لحفظ اللقطة. صدّر اللقطات القديمة وامسحها.")
        return
      }
      if (asReference && review.poster) {
        const shots = pack.shots.map((s, i) => (i === shotIndex ? { ...s, reference_image: review.poster } : s))
        onPackChange({ ...pack, shots })
      }
    }
    URL.revokeObjectURL(review.url)
    setReview(null)
    setPhase("framing")
  }

  const calibrate = () => {
    if (!att.current) return
    const old = readCalibration()
    saveCalibration({ pitch: att.current.pitch + old.pitch, roll: att.current.roll + old.roll })
  }

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (track && (await setTorch(track, !torch))) setTorchOn(!torch)
  }

  const onZoom = async (z: number) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const v = await applyZoom(track, z)
    if (v !== null) setZoom(v)
  }

  const pickDevice = (id: string) => {
    if (shot.lens !== "front") rememberLens(shot.lens, id)
    setDeviceId(id)
  }

  const hints: string[] = []
  if (attitude) {
    if (ready.level === false) hints.push("عدّل الميزان: خلّي الخط الأبيض أفقي")
    if (ready.pitch === false)
      hints.push(attitude.pitch > shot.pitch_deg ? "وطّي الكاميرا لتحت شوية" : "ارفع الكاميرا لفوق شوية")
  }
  if (ready.light === false) hints.push(stats && stats.mean < 55 ? "المكان ضلمة: زوّد النور أو شغّل الكشاف" : "فيه نور جامد: غيّر مكانك أو قفّل الستارة")
  if (ready.sharp === false) hints.push("اضغط على الحاجة المهمة في الشاشة عشان تبقى واضحة")
  if (ready.match === false) hints.push("قرّب الكادر من صورة المرجع")

  const pitchPos = (p: number) => 50 - Math.max(-45, Math.min(45, p)) * (50 / 45)

  return (
    <div className="director">
      <div className={`viewport ${phase === "review" ? "reviewing" : ready.ready ? "is-ready" : "is-off"}`} onClick={onTapVideo}>
        <video ref={videoRef} playsInline muted autoPlay className={shot.lens === "front" ? "mirror" : ""} />

        {shot.reference_image && phase !== "review" && (
          <img className="ghost" src={shot.reference_image} style={{ opacity: ghost }} alt="" />
        )}
        <div className="grid" />
        {attitude && phase !== "review" && (
          <div className={`horizon ${ready.level ? "ok" : ""}`} style={{ transform: `rotate(${-attitude.roll}deg)` }} />
        )}
        {attitude && phase !== "review" && (
          <div className="pitch-scale" aria-hidden>
            <div
              className="pitch-target"
              style={{
                top: `${pitchPos(shot.pitch_deg + shot.pitch_tol)}%`,
                height: `${pitchPos(shot.pitch_deg - shot.pitch_tol) - pitchPos(shot.pitch_deg + shot.pitch_tol)}%`,
              }}
            />
            <div className={`pitch-dot ${ready.pitch ? "ok" : ""}`} style={{ top: `${pitchPos(attitude.pitch)}%` }} />
          </div>
        )}
        {focusPt && <div className="focus-ring" style={{ left: `${focusPt.x * 100}%`, top: `${focusPt.y * 100}%` }} />}

        {showPrompter && shot.prompter && phase !== "review" && (
          <div className="prompter">
            <div ref={prompterRef} className="prompter-text">
              {shot.prompter}
            </div>
          </div>
        )}

        {phase === "countdown" && <div className="countdown">{arNum(count)}</div>}
        {phase === "recording" && (
          <div className="rec-badge">
            ● {arNum(elapsed.toFixed(1))} / {arNum(shot.duration_s[1])} ث
          </div>
        )}

        <div className="top-bar" onClick={(e) => e.stopPropagation()}>
          <button className="ghost-btn" onClick={onExit} aria-label="رجوع">
            →
          </button>
          <div className="shot-head">
            <div className="shot-n">
              لقطة {arNum(shotIndex + 1)} من {arNum(pack.shots.length)}
            </div>
            <div className="shot-title">{shot.title}</div>
          </div>
          <div className="nav">
            <button className="ghost-btn" disabled={shotIndex === 0 || phase !== "framing"} onClick={() => onGo(shotIndex - 1)}>
              ‹
            </button>
            <button
              className="ghost-btn"
              disabled={shotIndex >= pack.shots.length - 1 || phase !== "framing"}
              onClick={() => onGo(shotIndex + 1)}
            >
              ›
            </button>
          </div>
        </div>

        {phase !== "review" && (
          <div className="record-row" onClick={(e) => e.stopPropagation()}>
            <button
              className={`record ${phase === "recording" ? "on" : ""}`}
              disabled={blocked || !!error}
              onClick={onRecordButton}
              aria-label="تسجيل"
            />
          </div>
        )}
        {phase !== "review" && (
          <div className="status-strip" onClick={(e) => e.stopPropagation()}>
            {ready.ready ? (
              <div className="state ok">الكادر مظبوط. صوّر</div>
            ) : (
              hints.slice(0, 2).map((h) => (
                <div key={h} className="state warn">
                  {h}
                </div>
              ))
            )}
            {!motionOk && <div className="state warn">حساس الحركة مش شغال: الميزان والزاوية مش هيتقاسوا</div>}
          </div>
        )}
      </div>

      {phase === "review" && review ? (
        <section className="review">
          <div className={`verdict ${review.verdict === "accepted" ? "ok" : "warn"}`}>
            {review.verdict === "accepted" ? "اللقطة مقبولة" : "اللقطة محتاجة تتعاد"}
          </div>
          <video src={review.url} controls playsInline className="review-video" />
          <ul className="checks">
            {review.checks.map((c) => (
              <li key={c.key} className={c.ok ? "ok" : "bad"}>
                <span>{c.ok ? "✓" : "✗"}</span>
                <b>{c.label}</b>
                <span>{c.detail}</span>
              </li>
            ))}
          </ul>
          <div className="row">
            {review.verdict === "accepted" ? (
              <>
                <button className="btn primary" onClick={() => finishReview(true)}>
                  احتفظ بيها
                </button>
                <button className="btn" onClick={() => finishReview(false)}>
                  امسحها وأعد
                </button>
              </>
            ) : (
              <>
                <button className="btn primary" onClick={() => finishReview(false)}>
                  أعد اللقطة
                </button>
                <button className="btn" onClick={() => finishReview(true)}>
                  احتفظ بيها برضه
                </button>
              </>
            )}
          </div>
          {!shot.reference_image && review.poster && (
            <button className="btn subtle" onClick={() => finishReview(true, true)}>
              احتفظ بيها وخليها مرجع اللقطة دي
            </button>
          )}
        </section>
      ) : (
        <section className="controls">
          {blocked && (
            <div className="banner warn">
              التصوير في بيت العميل محتاج موافقته الأول (القرار ٥١). أكّد الموافقة من صفحة الخطة.
            </div>
          )}
          {error && <div className="banner warn">{error}</div>}

          <div className="brief">
            <div>
              <b>الكادر:</b> {FRAMING_AR[shot.framing]}
            </div>
            <div>
              <b>العدسة:</b> {LENS_AR[shot.lens]}
            </div>
            <div>
              <b>الارتفاع:</b> {HEIGHT_AR[shot.height]} ({HEIGHT_CM[shot.height]})
            </div>
            <div>
              <b>الزاوية:</b> {pitchAr(shot.pitch_deg)}
            </div>
            <div>
              <b>الحركة:</b> {MOVE_AR[shot.move]}
            </div>
            <div>
              <b>المدة:</b> من {arNum(shot.duration_s[0])} لـ {arNum(shot.duration_s[1])} ثانية
            </div>
            {shot.direction && <div className="direction">{shot.direction}</div>}
            {shotTakes.length > 0 && (
              <div className="muted">
                محفوظ {arNum(shotTakes.length)} لقطة، منهم {arNum(shotTakes.filter((t) => t.verdict === "accepted").length)} مقبولة
              </div>
            )}
          </div>

          {shot.lens !== "front" && devices.length > 1 && (
            <div className="lens-row">
              <span className="muted">اختار الكاميرا اللي هي {LENS_AR[shot.lens]}:</span>
              <div className="chips">
                {devices.map((d, i) => (
                  <button
                    key={d.deviceId}
                    className={`chip ${deviceId === d.deviceId ? "on" : ""}`}
                    onClick={() => pickDevice(d.deviceId)}
                    disabled={phase !== "framing"}
                  >
                    {arNum(i + 1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {zoomCaps && (
            <label className="slider">
              <span>التقريب {arNum(zoom.toFixed(1))}×</span>
              <input
                type="range"
                min={zoomCaps.min}
                max={Math.min(zoomCaps.max, 10)}
                step={zoomCaps.step || 0.1}
                value={zoom}
                onChange={(e) => onZoom(Number(e.target.value))}
              />
            </label>
          )}
          {shot.prompter && (
            <label className="slider">
              <span>سرعة الملقّن</span>
              <input type="range" min={10} max={120} value={prompterSpeed} onChange={(e) => setPrompterSpeed(Number(e.target.value))} />
            </label>
          )}
          {shot.reference_image && (
            <label className="slider">
              <span>شفافية المرجع</span>
              <input type="range" min={0} max={0.8} step={0.05} value={ghost} onChange={(e) => setGhost(Number(e.target.value))} />
            </label>
          )}
          <div className="chips">
            {shot.prompter && (
              <button className={`chip ${showPrompter ? "on" : ""}`} onClick={() => setShowPrompter(!showPrompter)}>
                الملقّن
              </button>
            )}
            <button className={`chip ${autoStart ? "on" : ""}`} onClick={() => setAutoStart(!autoStart)}>
              يبدأ لوحده لما ينوّر أخضر
            </button>
            <button className={`chip ${torch ? "on" : ""}`} onClick={toggleTorch}>
              الكشاف
            </button>
            <button className="chip" onClick={calibrate}>
              صفّر الميزان
            </button>
          </div>
          <p className="muted small">
            «صفّر الميزان»: اسند الموبايل واقف على حيطة مستقيمة، واضغط مرة واحدة.
          </p>
        </section>
      )}
    </div>
  )
}
