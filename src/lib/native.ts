/**
 * Bridge to the Android app's own camera (RaqCamera, android/app/.../RaqCameraPlugin.java).
 * In the browser none of this runs; the web camera path is used instead.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core"
import type { Lens } from "./types"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CamState {
  facing: "back" | "front"
  lens: string
  /** How the lens was reached: zoom on the main camera, a separate camera, a physical camera, or not at all. */
  mode: "zoom" | "camera" | "physical" | "front" | "none"
  cameraId: string
  zoom?: number
  zoomMin?: number
  zoomMax?: number
  torch: boolean
}

export interface RecordResult {
  path: string
  size: number
  durationMs: number
  galleryUri?: string
  galleryError?: string
}

export interface LensReport {
  cameras: {
    id: string
    facing: "back" | "front"
    focal: number
    fov: number
    zoomMin?: number
    zoomMax?: number
    physical: { id: string; fov: number }[]
  }[]
}

interface RaqCameraPlugin {
  start(o: { facing: "back" | "front"; lens: Lens; rect: Rect }): Promise<CamState>
  setPreview(o: { visible: boolean; rect?: Rect }): Promise<void>
  stop(): Promise<void>
  setZoom(o: { ratio: number }): Promise<{ zoom: number }>
  setTorch(o: { on: boolean }): Promise<void>
  focus(o: { x: number; y: number }): Promise<void>
  startRecording(o: { name: string }): Promise<void>
  stopRecording(): Promise<RecordResult>
  deleteTake(o: { path?: string; galleryUri?: string }): Promise<{ ok: boolean }>
  openInGallery(o: { uri: string }): Promise<void>
  share(o: { uri: string }): Promise<void>
  snapshot(o: { width: number }): Promise<{ dataUrl: string }>
  lenses(): Promise<LensReport>
  voice(): Promise<{ arabic: boolean }>
  speak(o: { text: string }): Promise<{ spoken: boolean }>
  stopSpeaking(): Promise<void>
  vibrate(o: { pattern: number[] }): Promise<void>
  addListener(event: "frame", cb: (f: { w: number; h: number; luma: string }) => void): Promise<PluginListenerHandle>
}

export const RaqCamera = registerPlugin<RaqCameraPlugin>("RaqCamera")

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** URL the web view can play for a file the app wrote. */
export const fileUrl = (path: string) => Capacitor.convertFileSrc(path)

/** Base64 grayscale bytes from the camera → the float luma the checks use. */
export function decodeLuma(b64: string): Float32Array {
  const s = atob(b64)
  const out = new Float32Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}
