import type { Lens } from "./types"

/**
 * Camera access. On Android Chrome each physical back lens usually shows up as
 * its own camera ("camera2 0, facing back", "camera2 2, facing back" ...).
 * The browser does not say which one is the wide or the zoom lens, so the
 * person picks it once per lens and the app remembers the choice.
 */

const MAP_KEY = "raq-director.lens-map"

export type LensMap = Partial<Record<Lens, string>>

export function readLensMap(): LensMap {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) ?? "{}") as LensMap
  } catch {
    return {}
  }
}

export function rememberLens(lens: Lens, deviceId: string) {
  const m = readLensMap()
  m[lens] = deviceId
  localStorage.setItem(MAP_KEY, JSON.stringify(m))
}

const SETUP_KEY = "raq-director.lens-setup-done"

/** Lens setup was opened and closed once; stop nagging about unmapped lenses. */
export function lensSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === "1"
  } catch {
    return false
  }
}

export function markLensSetupDone() {
  try {
    localStorage.setItem(SETUP_KEY, "1")
  } catch {
    /* private mode */
  }
}

export interface CameraDevice {
  deviceId: string
  label: string
  back: boolean
}

export async function listCameras(): Promise<CameraDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `كاميرا ${i + 1}`,
      back: !/front|user|أمام/i.test(d.label),
    }))
}

export interface OpenOptions {
  lens: Lens
  deviceId?: string
  audio: boolean
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Android releases a camera a moment after its stream stops, so opening the
 * next lens right away often fails with NotReadableError. Try a few times.
 */
export async function getStreamRetry(c: MediaStreamConstraints, tries = 4): Promise<MediaStream> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await navigator.mediaDevices.getUserMedia(c)
    } catch (e) {
      last = e
      const name = (e as DOMException)?.name
      // Permission problems will not fix themselves.
      if (name === "NotAllowedError" || name === "SecurityError") break
      await wait(400 * (i + 1))
    }
  }
  throw last
}

/** Arabic reason for a camera error, for the person to act on. */
export function cameraErrorAr(e: unknown): string {
  switch ((e as DOMException)?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "الكاميرا مقفولة. اسمح بالكاميرا من إعدادات الموقع."
    case "NotReadableError":
    case "AbortError":
      return "الكاميرا دي مشغولة. اقفل أي تطبيق كاميرا تاني وجرّب تاني."
    case "OverconstrainedError":
      return "الكاميرا دي مش بتقبل الإعدادات المطلوبة."
    case "NotFoundError":
      return "الكاميرا دي مش موجودة دلوقتي."
    default:
      return "الكاميرا دي مافتحتش."
  }
}

export async function openCamera(o: OpenOptions): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  }
  if (o.deviceId) video.deviceId = { exact: o.deviceId }
  else video.facingMode = o.lens === "front" ? "user" : { ideal: "environment" }
  return getStreamRetry({
    video,
    audio: o.audio ? { echoCancellation: false, noiseSuppression: true, autoGainControl: true } : false,
  })
}

interface ExtCaps extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number }
  torch?: boolean
  focusMode?: string[]
}

export function capabilities(track: MediaStreamTrack): ExtCaps {
  try {
    return (track.getCapabilities?.() ?? {}) as ExtCaps
  } catch {
    return {}
  }
}

export async function applyZoom(track: MediaStreamTrack, zoom: number): Promise<number | null> {
  const z = capabilities(track).zoom
  if (!z) return null
  const v = Math.min(z.max, Math.max(z.min, zoom))
  try {
    await track.applyConstraints({ advanced: [{ zoom: v } as MediaTrackConstraintSet] })
    return v
  } catch {
    return null
  }
}

export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  if (!capabilities(track).torch) return false
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
    return true
  } catch {
    return false
  }
}

/** Tap to focus: point is 0..1 in the picture. Silently ignored where unsupported. */
export async function focusAt(track: MediaStreamTrack, x: number, y: number) {
  const caps = capabilities(track)
  const set: Record<string, unknown> = { pointsOfInterest: [{ x, y }] }
  if (caps.focusMode?.includes("single-shot")) set.focusMode = "single-shot"
  try {
    await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] })
    if (caps.focusMode?.includes("continuous")) {
      setTimeout(() => {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {})
      }, 1500)
    }
  } catch {
    /* not supported on this camera */
  }
}

/** Numeric zoom a lens asks for when it has no camera of its own. */
export const LENS_ZOOM: Record<Lens, number> = { "0.6": 0.6, "1": 1, "2": 2, "3": 3, front: 1 }

const MIMES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
]

export function pickMime(): string {
  for (const m of MIMES) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m
  return ""
}

export const extFor = (mime: string) => (mime.includes("mp4") ? "mp4" : "webm")
