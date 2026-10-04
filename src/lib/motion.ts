/**
 * Phone attitude from the accelerometer, for a phone held upright (portrait).
 * Android Chrome reports accelerationIncludingGravity pointing up:
 * upright → y ≈ +9.8, flat face-up → z ≈ +9.8.
 */

export interface Attitude {
  /** Camera pitch in degrees: 0 = level, negative = back camera looking down. */
  pitch: number
  /** Horizon tilt in degrees: positive = phone turned clockwise. */
  roll: number
}

const DEG = 180 / Math.PI

export function attitudeFromGravity(x: number, y: number, z: number): Attitude {
  return {
    pitch: -Math.atan2(z, Math.hypot(x, y)) * DEG,
    roll: Math.atan2(-x, y) * DEG,
  }
}

export interface MotionSample extends Attitude {
  /** Rotation speed in degrees per second (how shaky the hand is). */
  rot: number
  t: number
}

export interface MotionState {
  available: boolean
  latest: MotionSample | null
}

const CAL = "raq-director.calibration"

export function readCalibration(): Attitude {
  try {
    return { pitch: 0, roll: 0, ...(JSON.parse(localStorage.getItem(CAL) ?? "{}") as Partial<Attitude>) }
  } catch {
    return { pitch: 0, roll: 0 }
  }
}

let current: Attitude | null = null

export function saveCalibration(a: Attitude) {
  current = a
  localStorage.setItem(CAL, JSON.stringify(a))
}

/**
 * Starts listening. Returns a stop function. `onSample` gets smoothed values
 * with the saved calibration already applied.
 */
export function startMotion(onSample: (s: MotionSample) => void): () => void {
  let px = 0
  let py = 9.8
  let pz = 0
  let first = true
  current = readCalibration()
  const handler = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity
    if (!g || g.x == null || g.y == null || g.z == null) return
    // Low-pass filter so the indicator is calm but still responsive.
    const k = first ? 1 : 0.2
    first = false
    px += (g.x - px) * k
    py += (g.y - py) * k
    pz += (g.z - pz) * k
    const a = attitudeFromGravity(px, py, pz)
    const r = e.rotationRate
    const rot = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0
    const cal = current ?? { pitch: 0, roll: 0 }
    onSample({ pitch: a.pitch - cal.pitch, roll: a.roll - cal.roll, rot, t: performance.now() })
  }
  window.addEventListener("devicemotion", handler)
  return () => window.removeEventListener("devicemotion", handler)
}

/** iOS asks for permission; Android does not. Safe to call everywhere. */
export async function requestMotionPermission(): Promise<boolean> {
  const D = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
  if (typeof D?.requestPermission === "function") {
    try {
      return (await D.requestPermission()) === "granted"
    } catch {
      return false
    }
  }
  return typeof DeviceMotionEvent !== "undefined"
}
