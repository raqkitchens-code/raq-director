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
  lensSetupDone,
  readLensMap,
  rememberLens,
  setTorch,
  type CameraDevice,
} from "../lib/camera"
import { evaluateTake, nextCorrection, readiness, type Arrow } from "../lib/checks"
import {
  beepCount,
  beepGo,
  chimeReady,
  hasArabicVoice,
  readPrefs,
  savePrefs,
  speak,
  stopSpeaking,
  vibrate,
  type Prefs,
} from "../lib/feedback"
import { isDone } from "../lib/progress"
import { db } from "../lib/db"
import { FRAMING_AR, HEIGHT_AR, HEIGHT_CM, LENS_AR, LENS_SHORT, MOVE_AR, MOVE_SHORT, arNum, pitchAr } from "../lib/labels"
import {
  readCalibration,
  requestMotionPermission,
  saveCalibration,
  startMotion,
  type MotionSample,
} from "../lib/motion"
import { RaqCamera, decodeLuma, fileUrl, isNative, rectOf, type CamState } from "../lib/native"
import { takeFileName } from "../lib/files"
import { consentBlocked } from "../lib/pack"
import type { CheckResult, Lens, ShootPack, Take } from "../lib/types"

interface Props {
  pack: ShootPack
  shotIndex: number
  takes: Take[]
  onSaved: (t: Take) => void
  onPackChange: (p: ShootPack) => void
  onGo: (index: number) => void
  onLensSetup: () => void
  onExit: () => void
}

type Phase = "framing" | "countdown" | "recording" | "review"

interface Review {
  /** Web: the recorded video. In the app the file is on the phone instead (native). */
  blob?: Blob
  native?: { path: string; galleryUri?: string }
  size: number
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

export function Director({ pack, shotIndex, takes, onSaved, onPackChange, onGo, onLensSetup, onExit }: Props) {
  const shot = pack.shots[shotIndex]
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const recording = useRef(false)
  const native = useMemo(isNative, [])
  const viewportRef = useRef<HTMLDivElement>(null)
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
  // Set when the person cancels a countdown; auto-start waits until the frame leaves green.
  const [autoHeld, setAutoHeld] = useState(false)

  const [phase, setPhase] = useState<Phase>("framing")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [deviceId, setDeviceId] = useState<string | undefined>(() =>
    shot.lens === "front" ? undefined : readLensMap()[shot.lens],
  )
  // The person can flip to the front camera on any shot (stories, talking to camera).
  const [facing, setFacing] = useState<"back" | "front">(shot.lens === "front" ? "front" : "back")
  const useFront = facing === "front"
  const firstLens: Lens = shot.lens === "front" ? "1" : shot.lens
  // App only: the lens shown to the person, and the one the camera was opened for.
  const [activeLens, setActiveLens] = useState<Lens>(firstLens)
  const [bindLens, setBindLens] = useState<Lens>(firstLens)
  const [cam, setCam] = useState<CamState | null>(null)
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
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs)
  const setPref = (k: keyof Prefs, v: boolean) => {
    const next = { ...prefs, [k]: v }
    savePrefs(next)
    setPrefsState(next)
  }
  const autoStart = prefs.autoStart
  const lastSaid = useRef({ text: "", at: 0 })
  const wasReady = useRef(false)
  const [focusPt, setFocusPt] = useState<{ x: number; y: number } | null>(null)
  const [motionOk, setMotionOk] = useState(true)

  const blocked = consentBlocked(pack, shot)
  const shotTakes = takes.filter((t) => t.pack_id === pack.id && t.shot_id === shot.id)

  // Camera (browser)
  useEffect(() => {
    if (native) return
    let cancelled = false
    setError(null)
    openCamera({ lens: useFront ? "front" : shot.lens, deviceId: useFront ? undefined : deviceId, audio: true })
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
        const wanted = deviceId || useFront ? 1 : LENS_ZOOM[shot.lens]
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
  }, [native, shot.lens, deviceId, useFront])

  // Camera (Android app): the phone's own camera drawn behind the page, in the viewport's place.
  useEffect(() => {
    if (!native) return
    const el = viewportRef.current
    if (!el) return
    let cancelled = false
    setError(null)
    RaqCamera.start({ facing, lens: bindLens, rect: rectOf(el) })
      .then((st) => {
        if (cancelled) return
        setCam(st)
        setZoom(st.zoom ?? 1)
        setZoomCaps(st.zoomMin !== undefined ? { min: st.zoomMin, max: st.zoomMax ?? st.zoomMin, step: 0.1 } : null)
      })
      .catch((e: { code?: string }) => {
        setError(
          e?.code === "NotAllowedError"
            ? "الكاميرا مقفولة. افتح إعدادات التطبيق واسمح بالكاميرا والميكروفون."
            : "الكاميرا مش بتفتح. اقفل أي تطبيق كاميرا تاني وجرّب تاني.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [native, facing, bindLens])

  useEffect(() => {
    if (!native) return
    const root = document.documentElement
    root.classList.add("cam-through")
    return () => {
      root.classList.remove("cam-through")
      RaqCamera.stop().catch(() => {})
    }
  }, [native])

  // Keep the native picture exactly under the viewport, hide it while reviewing.
  useEffect(() => {
    if (!native) return
    const el = viewportRef.current
    if (!el) return
    const place = () => {
      RaqCamera.setPreview({ visible: phase !== "review", rect: rectOf(el) }).catch(() => {})
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener("scroll", place, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", place)
    }
  }, [native, phase])

  const selectLens = (l: Lens) => {
    setActiveLens(l)
    const ratio = LENS_ZOOM[l]
    const zoomable = cam && cam.mode === "zoom" && cam.zoomMin !== undefined && ratio >= cam.zoomMin - 0.05
    if (zoomable) {
      RaqCamera.setZoom({ ratio })
        .then((r) => setZoom(r.zoom))
        .catch(() => {})
    } else setBindLens(l)
  }

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
        if (recording.current) samples.current.motion.push(s)
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

  const analyzeLuma = useCallback((l: Float32Array) => {
    const f = frameStats(l, ANALYSIS_W, ANALYSIS_H)
    setStats(f)
    let m: number | null = null
    if (refEdges.current) {
      m = ncc(edgeMap(l, ANALYSIS_W, ANALYSIS_H), refEdges.current)
      setMatch(m)
    }
    if (recording.current) {
      samples.current.frames.push(f)
      if (m !== null) samples.current.matches.push(m)
    }
  }, [])

  // Frame analysis (browser), 4 times a second
  useEffect(() => {
    if (native) return
    const c = document.createElement("canvas")
    c.width = ANALYSIS_W
    c.height = ANALYSIS_H
    const ctx = c.getContext("2d", { willReadFrequently: true })
    const id = window.setInterval(() => {
      const v = videoRef.current
      if (!ctx || !v || v.readyState < 2 || !v.videoWidth) return
      drawCover(ctx, v, v.videoWidth, v.videoHeight, ANALYSIS_W, ANALYSIS_H)
      analyzeLuma(lumaFromRGBA(ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H).data, ANALYSIS_W, ANALYSIS_H))
    }, 250)
    return () => window.clearInterval(id)
  }, [native, analyzeLuma])

  // Frame analysis (app): the camera sends a small grayscale picture a few times a second.
  useEffect(() => {
    if (!native) return
    let handle: { remove: () => Promise<void> } | null = null
    let gone = false
    RaqCamera.addListener("frame", (f) => {
      if (f.w === ANALYSIS_W && f.h === ANALYSIS_H) analyzeLuma(decodeLuma(f.luma))
    }).then((h) => {
      if (gone) h.remove()
      else handle = h
    })
    return () => {
      gone = true
      handle?.remove()
    }
  }, [native, analyzeLuma])

  const ready = useMemo(() => readiness(shot, attitude, stats, match), [shot, attitude, stats, match])

  const stopRecording = useCallback(() => {
    if (!native) {
      if (recRef.current?.state === "recording") recRef.current.stop()
      return
    }
    if (!recording.current) return
    recording.current = false
    const wall = (performance.now() - startedAt.current) / 1000
    const snap = RaqCamera.snapshot({ width: 270 }).catch(() => ({ dataUrl: "" }))
    RaqCamera.stopRecording()
      .then(async (r) => {
        const duration = r.durationMs > 0 ? r.durationMs / 1000 : wall
        const { checks, verdict } = evaluateTake(shot, { duration, ...samples.current })
        const poster = (await snap).dataUrl
        setNotice(r.galleryUri ? null : "اللقطة اتسجلت بس ماتحفظتش في الجاليري. فيه مساحة على الموبايل؟")
        setReview({
          url: fileUrl(r.path),
          native: { path: r.path, galleryUri: r.galleryUri },
          size: r.size,
          duration,
          checks,
          verdict,
          poster,
          mime: "video/mp4",
        })
        setPhase("review")
      })
      .catch(() => {
        setError("التسجيل وقف بغلط. جرّب تاني.")
        setPhase("framing")
      })
  }, [native, shot])

  const startRecording = useCallback(() => {
    if (native) {
      samples.current = { motion: [], frames: [], matches: [] }
      const draft: Take = {
        id: "",
        pack_id: pack.id,
        shot_id: shot.id,
        n: shotTakes.length + 1,
        created_at: new Date().toISOString(),
        duration_s: 0,
        mime: "video/mp4",
        size: 0,
        checks: [],
        verdict: "retake",
        kept: false,
      }
      const name = takeFileName(pack, draft).replace(/\.mp4$/, "") + "-" + Date.now().toString(36)
      RaqCamera.startRecording({ name })
        .then(() => {
          recording.current = true
          startedAt.current = performance.now()
          setElapsed(0)
          setPhase("recording")
        })
        .catch(() => {
          setError("التسجيل مابدأش. جرّب تاني.")
          setPhase("framing")
        })
      return
    }
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
      recording.current = false
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
      setReview({ blob, size: blob.size, url: URL.createObjectURL(blob), duration, checks, verdict, poster, mime: type })
      setPhase("review")
    }
    recRef.current = rec
    rec.start(1000)
    recording.current = true
    startedAt.current = performance.now()
    setElapsed(0)
    setPhase("recording")
  }, [native, pack, shot, shotTakes.length])

  // Countdown then record
  useEffect(() => {
    if (phase !== "countdown") return
    if (count <= 0) {
      beepGo()
      startRecording()
      return
    }
    if (count === 3) stopSpeaking()
    beepCount()
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

  const guide = useMemo(() => nextCorrection(shot, attitude, ready, stats), [shot, attitude, ready, stats])

  // Hands-free direction: speak the next correction, celebrate when the frame locks.
  useEffect(() => {
    if (phase !== "framing" || blocked) {
      wasReady.current = false
      return
    }
    if (ready.ready && !wasReady.current) {
      wasReady.current = true
      if (prefs.vibrate) vibrate(80)
      chimeReady()
      if (prefs.voice) speak(autoStart ? "تمام، اثبت" : "تمام، صوّر")
      lastSaid.current = { text: "ready", at: performance.now() }
      return
    }
    if (!ready.ready) wasReady.current = false
    if (!prefs.voice || !guide.say || ready.ready) return
    const now = performance.now()
    if (guide.say !== lastSaid.current.text && now - lastSaid.current.at > 2500) {
      lastSaid.current = { text: guide.say, at: now }
      speak(guide.say)
    }
  }, [phase, blocked, ready.ready, guide.say, prefs.voice, prefs.vibrate, autoStart])

  // Optional: start by itself once the frame has stayed green for a moment
  useEffect(() => {
    if (!ready.ready) {
      setAutoHeld(false)
      return
    }
    if (!autoStart || autoHeld || phase !== "framing" || blocked) return
    const t = window.setTimeout(() => {
      setCount(3)
      setPhase("countdown")
    }, 1200)
    return () => window.clearTimeout(t)
  }, [autoStart, autoHeld, phase, ready.ready, blocked])

  useEffect(() => {
    if (phase === "framing" && prompterRef.current) prompterRef.current.style.transform = "translateY(0)"
  }, [phase])

  const onRecordButton = () => {
    if (blocked) return
    if (phase === "framing") {
      setCount(3)
      setPhase("countdown")
    } else if (phase === "countdown") {
      setAutoHeld(true)
      setPhase("framing")
    } else if (phase === "recording") stopRecording()
  }

  const onTapVideo = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if ((!track && !native) || phase === "review") return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    setFocusPt({ x, y })
    if (native) RaqCamera.focus({ x, y }).catch(() => {})
    else if (track) focusAt(track, x, y)
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
        size: review.size,
        checks: review.checks,
        verdict: review.verdict,
        kept: true,
        poster: review.poster,
        gallery_uri: review.native?.galleryUri,
      }
      try {
        if (review.blob) await db.addTake(take, review.blob)
        else await db.saveTake(take)
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
    const accepted = keep && review.verdict === "accepted"
    if (review.native) {
      // The gallery copy is the take. The working copy goes; a dropped take leaves the gallery too.
      RaqCamera.deleteTake({ path: review.native.path, galleryUri: keep ? undefined : review.native.galleryUri }).catch(() => {})
    } else URL.revokeObjectURL(review.url)
    setReview(null)
    setPhase("framing")
    if (accepted && prefs.autoNext) {
      const doneNow = (i: number) => i === shotIndex || isDone(takes, pack, pack.shots[i])
      const order = [...pack.shots.keys()]
      const next = order.slice(shotIndex + 1).find((i) => !doneNow(i)) ?? order.find((i) => !doneNow(i))
      if (next === undefined) {
        if (prefs.voice) speak("خلصنا كل اللقطات")
        onExit()
      } else onGo(next)
    }
  }

  const calibrate = () => {
    if (!att.current) return
    const old = readCalibration()
    saveCalibration({ pitch: att.current.pitch + old.pitch, roll: att.current.roll + old.roll })
  }

  const toggleTorch = async () => {
    if (native) {
      RaqCamera.setTorch({ on: !torch })
        .then(() => setTorchOn(!torch))
        .catch(() => {})
      return
    }
    const track = streamRef.current?.getVideoTracks()[0]
    if (track && (await setTorch(track, !torch))) setTorchOn(!torch)
  }

  const onZoom = async (z: number) => {
    if (native) {
      RaqCamera.setZoom({ ratio: z })
        .then((r) => setZoom(r.zoom))
        .catch(() => {})
      return
    }
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

  const lensMissing =
    !native &&
    !useFront && shot.lens !== "front" && shot.lens !== "1" && !readLensMap()[shot.lens] && devices.length > 1 && !lensSetupDone()
  // Browsers on most phones only give the main back lens, which cannot zoom out below 1x.
  const noWide = native
    ? !useFront && activeLens === "0.6" && cam?.mode === "none"
    : !useFront && shot.lens === "0.6" && !deviceId && zoomCaps !== null && zoomCaps.min >= 1
  const lensNow: Lens = useFront ? "front" : native ? activeLens : shot.lens
  const LENS_PILLS: Lens[] = ["0.6", "1", "2", "3"]

  const pitchPos = (p: number) => 50 - Math.max(-45, Math.min(45, p)) * (50 / 45)

  return (
    <div className="director">
      <div
        ref={viewportRef}
        className={`viewport ${phase === "review" ? "reviewing" : ready.ready ? "is-ready" : "is-off"}`}
        onClick={onTapVideo}
      >
        {!native && <video ref={videoRef} playsInline muted autoPlay className={useFront ? "mirror" : ""} />}

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
        {phase === "framing" && guide.arrow && <GuideArrow arrow={guide.arrow} />}
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
          <button
            className="ghost-btn"
            onClick={() => setFacing(useFront ? "back" : "front")}
            disabled={phase !== "framing"}
            aria-label={useFront ? "الكاميرا الخلفية" : "الكاميرا الأمامية"}
          >
            ⟲
          </button>
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

        {native && !useFront && phase === "framing" && (
          <div className="lens-pills" onClick={(e) => e.stopPropagation()}>
            {LENS_PILLS.map((l) => (
              <button key={l} className={`pill ${activeLens === l ? "on" : ""}`} onClick={() => selectLens(l)}>
                {l === "0.6" ? "٫٦" : arNum(l)}
              </button>
            ))}
          </div>
        )}
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
              <div className="state ok">{autoStart && !autoHeld ? "الكادر مظبوط. اثبت، هيصوّر لوحده" : "الكادر مظبوط. صوّر"}</div>
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
          {notice && <div className="banner warn">{notice}</div>}
          {review.native?.galleryUri && <p className="muted small">اتحفظت في الجاليري، في فولدر راق.</p>}
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
          {notice && <div className="banner warn">{notice}</div>}
          {lensMissing && (
            <button className="banner warn as-btn" onClick={onLensSetup}>
              {LENS_AR[shot.lens]} لسه مش متظبطة. دوس هنا واختارها مرة واحدة.
            </button>
          )}

          {noWide && (
            <div className="banner">
              {native
                ? "الموبايل مش مدّي التطبيق العدسة الواسعة. صوّر بالعادية وارجع لورا خطوتين، وابعتلي صورة من صفحة ظبط العدسات."
                : "العدسة الواسعة مش متاحة من المتصفح. صوّر بالعادية وارجع لورا خطوتين عشان المكان كله يدخل."}
            </div>
          )}

          <div className="essentials">
            <div className="ess">
              <span className="muted small">العدسة</span>
              <b>{noWide ? "١× وارجع لورا" : LENS_SHORT[lensNow]}</b>
            </div>
            <div className="ess">
              <span className="muted small">الارتفاع</span>
              <b>{HEIGHT_CM[shot.height]}</b>
            </div>
            <div className="ess">
              <span className="muted small">الحركة</span>
              <b>{MOVE_SHORT[shot.move]}</b>
            </div>
          </div>
          {shot.direction && <p className="direction">{shot.direction}</p>}

          <div className="chips">
            <button className={`chip ${prefs.autoStart ? "on" : ""}`} onClick={() => setPref("autoStart", !prefs.autoStart)}>
              يصوّر لوحده لما ينوّر
            </button>
            <button className={`chip ${prefs.voice ? "on" : ""}`} onClick={() => setPref("voice", !prefs.voice)}>
              المخرج بيتكلم
            </button>
            {shot.prompter && (
              <button className={`chip ${showPrompter ? "on" : ""}`} onClick={() => setShowPrompter(!showPrompter)}>
                الملقّن
              </button>
            )}
          </div>
          {prefs.voice && !hasArabicVoice() && (
            <p className="muted small">
              الموبايل مفيهوش صوت عربي للمتصفح، فالمخرج هيوجهك بالأسهم والصفارات. تقدر تنزّل الصوت العربي من إعدادات تحويل النص لكلام في الموبايل.
            </p>
          )}

          <details className="more">
            <summary>تفاصيل وأدوات</summary>
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
              {shotTakes.length > 0 && (
                <div className="muted">
                  محفوظ {arNum(shotTakes.length)} لقطة، منهم {arNum(shotTakes.filter((t) => t.verdict === "accepted").length)} مقبولة
                </div>
              )}
            </div>
            {!useFront && devices.length > 1 && (
              <div className="lens-row">
                <span className="muted">الكاميرا اللي شغالة دلوقتي:</span>
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
                  <button className="chip" onClick={onLensSetup}>
                    ظبط العدسات
                  </button>
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
              <button className={`chip ${prefs.autoNext ? "on" : ""}`} onClick={() => setPref("autoNext", !prefs.autoNext)}>
                يروح للقطة الجاية لوحده
              </button>
              <button className={`chip ${prefs.vibrate ? "on" : ""}`} onClick={() => setPref("vibrate", !prefs.vibrate)}>
                رعشة لما ينوّر
              </button>
              <button className={`chip ${torch ? "on" : ""}`} onClick={toggleTorch}>
                الكشاف
              </button>
              <button className="chip" onClick={calibrate}>
                صفّر الميزان
              </button>
            </div>
            <p className="muted small">«صفّر الميزان»: اسند الموبايل واقف على حيطة مستقيمة، واضغط مرة واحدة.</p>
          </details>
        </section>
      )}
    </div>
  )
}

const ARROWS: Record<Arrow, { icon: string; cls: string }> = {
  up: { icon: "⬆", cls: "" },
  down: { icon: "⬇", cls: "" },
  turn_left: { icon: "↺", cls: "" },
  turn_right: { icon: "↻", cls: "" },
  light: { icon: "☀", cls: "small-icon" },
  focus: { icon: "◎", cls: "small-icon" },
  match: { icon: "▣", cls: "small-icon" },
}

function GuideArrow({ arrow }: { arrow: Arrow }) {
  const a = ARROWS[arrow]
  return <div className={`guide-arrow ${a.cls}`}>{a.icon}</div>
}
