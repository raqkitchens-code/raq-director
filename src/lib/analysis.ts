/**
 * Frame measurements on a small grayscale copy of the camera image.
 * Pure functions (no DOM) so they can be tested.
 */

export const ANALYSIS_W = 90
export const ANALYSIS_H = 160

export interface FrameStats {
  /** Mean brightness 0..255. */
  mean: number
  /** Share of pixels that are blown out or crushed (0..1). */
  clipped: number
  /** Variance of the Laplacian: higher = sharper. */
  sharpness: number
}

export function lumaFromRGBA(data: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return out
}

export function frameStats(l: Float32Array, w: number, h: number): FrameStats {
  let sum = 0
  let clip = 0
  for (let i = 0; i < l.length; i++) {
    sum += l[i]
    if (l[i] > 250 || l[i] < 8) clip++
  }
  let lsum = 0
  let lsq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = l[i - 1] + l[i + 1] + l[i - w] + l[i + w] - 4 * l[i]
      lsum += v
      lsq += v * v
      n++
    }
  }
  const lm = n ? lsum / n : 0
  return { mean: sum / l.length, clipped: clip / l.length, sharpness: n ? lsq / n - lm * lm : 0 }
}

/** Sobel edge strength, normalised so lighting changes matter less than shapes. */
export function edgeMap(l: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = l[i - w + 1] + 2 * l[i + 1] + l[i + w + 1] - l[i - w - 1] - 2 * l[i - 1] - l[i + w - 1]
      const gy = l[i + w - 1] + 2 * l[i + w] + l[i + w + 1] - l[i - w - 1] - 2 * l[i - w] - l[i - w + 1]
      out[i] = Math.hypot(gx, gy)
    }
  }
  return blur(out, w, h)
}

/** 3x3 box blur, so a shot a few pixels off still counts as the same framing. */
function blur(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[(y + dy) * w + x + dx]
      out[y * w + x] = s / 9
    }
  }
  return out
}

/** Normalised cross-correlation, -1..1. 1 = the same picture. */
export function ncc(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  const den = Math.sqrt(da * db)
  return den > 0 ? num / den : 0
}

export const LIMITS = {
  /** Mean brightness band that edits well. */
  meanMin: 55,
  meanMax: 205,
  clippedMax: 0.12,
  /** Laplacian variance at 90x160 below this looks soft or out of focus. */
  sharpMin: 60,
  /** Edge similarity to the reference that counts as "same framing". */
  matchMin: 0.55,
  /** Hand shake (deg/s) allowed while holding still. */
  steadyStatic: 12,
  /** For moving shots: average speed allowed (slow, smooth moves only). */
  steadyMoving: 35,
}
