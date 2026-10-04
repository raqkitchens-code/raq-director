import { extFor } from "./camera"
import type { ShootPack, Take } from "./types"

/**
 * File names follow RAQ_NAMING_AND_FOLDERS (RAQ-docs/master):
 *  - general shots:  MKT_{topic}_v01_{date}.ext            → Dropbox /RAQ/03_Marketing/Reels/
 *  - client project: {project_code}_PHOTO_v01_{suffix}.ext → Dropbox /RAQ/06_Projects/{code}/
 * (PHOTO is the only media DOC code in the naming file today; video uses it too.)
 */
export function takeFileName(pack: ShootPack, take: Take): string {
  const date = take.created_at.slice(0, 10)
  const n = String(take.n).padStart(2, "0")
  const ext = extFor(take.mime)
  const shot = take.shot_id.toLowerCase().replace(/[^a-z0-9-]/g, "")
  if (pack.project_code) return `${pack.project_code}_PHOTO_v01_${shot}-take${n}.${ext}`
  const packTag = pack.id.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24)
  return `MKT_${packTag}-${shot}-take${n}_v01_${date}.${ext}`
}

/** Hands the file to Android's share sheet (Gallery, Dropbox, WhatsApp ...). Falls back to a download. */
export async function exportTake(blob: Blob, name: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return "shared"
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled"
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return "downloaded"
}

/** Grabs one frame of a video blob as a small JPEG data URL (poster or reference). */
export function posterFrom(video: HTMLVideoElement, maxW = 360): string {
  const w = Math.min(maxW, video.videoWidth || maxW)
  const h = Math.round((w * (video.videoHeight || 16)) / (video.videoWidth || 9))
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  c.getContext("2d")?.drawImage(video, 0, 0, w, h)
  return c.toDataURL("image/jpeg", 0.7)
}

/** Reads a picked image file and shrinks it into a data URL for use as a reference. */
export function imageFileToDataUrl(file: File, maxSide = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement("canvas")
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL("image/jpeg", 0.8))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("الصورة مش بتفتح"))
    }
    img.src = url
  })
}

export function readTextFile(file: File): Promise<string> {
  return file.text()
}
