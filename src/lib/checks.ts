import { LIMITS, type FrameStats } from "./analysis"
import { arNum } from "./labels"
import type { Attitude, MotionSample } from "./motion"
import type { CheckResult, Shot } from "./types"

export interface Readiness {
  level: boolean | null
  pitch: boolean | null
  light: boolean | null
  sharp: boolean | null
  match: boolean | null
  /** Everything that can be measured is right: the frame turns green. */
  ready: boolean
}

const isMoving = (s: Shot) => s.move !== "static"
/** Pans and tilts change the angle on purpose, so the target only applies at the start. */
const movesAngle = (s: Shot) => s.move === "tilt_up" || s.move === "tilt_down"

export function lightOk(f: FrameStats) {
  return f.mean >= LIMITS.meanMin && f.mean <= LIMITS.meanMax && f.clipped <= LIMITS.clippedMax
}

export function readiness(shot: Shot, a: Attitude | null, f: FrameStats | null, match: number | null): Readiness {
  const level = a ? Math.abs(a.roll) <= shot.roll_tol : null
  const pitch = a ? Math.abs(a.pitch - shot.pitch_deg) <= shot.pitch_tol : null
  const light = f ? lightOk(f) : null
  const sharp = f ? f.sharpness >= LIMITS.sharpMin : null
  const m = shot.reference_image && match !== null ? match >= LIMITS.matchMin : null
  const all = [level, pitch, light, sharp, m].filter((v) => v !== null)
  return { level, pitch, light, sharp, match: m, ready: all.length > 0 && all.every(Boolean) }
}

export interface Recording {
  duration: number
  motion: MotionSample[]
  frames: FrameStats[]
  matches: number[]
}

const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : 1)
const pct = (x: number) => `${arNum(Math.round(x * 100))}٪`

/** Judges a finished take against the shot's criteria. */
export function evaluateTake(shot: Shot, r: Recording): { checks: CheckResult[]; verdict: "accepted" | "retake" } {
  const checks: CheckResult[] = []
  const [dmin, dmax] = shot.duration_s
  checks.push({
    key: "duration",
    ok: r.duration >= dmin && r.duration <= dmax + 0.5,
    label: "المدة",
    detail:
      r.duration < dmin
        ? `قصيرة: ${arNum(r.duration.toFixed(1))} ث والمطلوب ${arNum(dmin)} ث على الأقل`
        : r.duration > dmax + 0.5
          ? `طويلة: ${arNum(r.duration.toFixed(1))} ث والمطلوب لحد ${arNum(dmax)} ث`
          : `${arNum(r.duration.toFixed(1))} ث`,
  })

  if (r.motion.length >= 5) {
    const level = share(r.motion.map((m) => Math.abs(m.roll) <= shot.roll_tol + 1))
    checks.push({
      key: "level",
      ok: level >= 0.85,
      label: "الميزان",
      detail: level >= 0.85 ? `مستقيم ${pct(level)} من الوقت` : `مايل في ${pct(1 - level)} من الوقت`,
    })
    const window = movesAngle(shot) ? r.motion.slice(0, Math.max(3, Math.floor(r.motion.length / 5))) : r.motion
    const pitch = share(window.map((m) => Math.abs(m.pitch - shot.pitch_deg) <= shot.pitch_tol + 2))
    checks.push({
      key: "pitch",
      ok: pitch >= 0.8,
      label: "زاوية الكاميرا",
      detail: pitch >= 0.8 ? "في الزاوية المتفق عليها" : `خرجت عن الزاوية في ${pct(1 - pitch)} من الوقت`,
    })
    const avg = r.motion.reduce((s, m) => s + m.rot, 0) / r.motion.length
    const limit = isMoving(shot) ? LIMITS.steadyMoving : LIMITS.steadyStatic
    checks.push({
      key: "steady",
      ok: avg <= limit,
      label: isMoving(shot) ? "نعومة الحركة" : "ثبات الإيد",
      detail: avg <= limit ? "ثابتة" : isMoving(shot) ? "الحركة سريعة أو متقطعة" : "الإيد بتهتز",
    })
  }

  if (r.frames.length >= 3) {
    const light = share(r.frames.map(lightOk))
    checks.push({
      key: "light",
      ok: light >= 0.8,
      label: "الإضاءة",
      detail: light >= 0.8 ? "كويسة" : r.frames[0].mean < LIMITS.meanMin ? "ضلمة" : "فيها حتت محروقة أو ضلمة",
    })
    const sharp = share(r.frames.map((f) => f.sharpness >= LIMITS.sharpMin))
    checks.push({
      key: "sharp",
      ok: sharp >= 0.7,
      label: "الوضوح",
      detail: sharp >= 0.7 ? "واضحة" : "مش واضحة: اضغط على الشاشة على الحاجة المهمة واثبت",
    })
  }

  if (shot.reference_image && r.matches.length >= 3) {
    const best = Math.max(...r.matches)
    checks.push({
      key: "match",
      ok: best >= LIMITS.matchMin,
      label: "مطابقة المرجع",
      detail: `أقرب تطابق ${pct(Math.max(0, best))}`,
    })
  }

  return { checks, verdict: checks.every((c) => c.ok) ? "accepted" : "retake" }
}

export type Arrow = "up" | "down" | "turn_left" | "turn_right" | "light" | "focus" | "match"

export interface Guide {
  arrow: Arrow | null
  /** Short spoken/shown instruction. */
  say: string
}

/** The single most important correction right now, in the order a camera operator would fix it. */
export function nextCorrection(shot: Shot, a: Attitude | null, r: Readiness, f: FrameStats | null): Guide {
  if (r.ready) return { arrow: null, say: "تمام، صوّر" }
  if (a && r.level === false)
    return a.roll > 0
      ? { arrow: "turn_left", say: "ميّل راس الموبايل ناحية الشمال" }
      : { arrow: "turn_right", say: "ميّل راس الموبايل ناحية اليمين" }
  if (a && r.pitch === false)
    return a.pitch > shot.pitch_deg ? { arrow: "down", say: "وطّي الكاميرا شوية" } : { arrow: "up", say: "ارفع الكاميرا شوية" }
  if (r.light === false)
    return { arrow: "light", say: f && f.mean < LIMITS.meanMin ? "المكان ضلمة، زوّد النور" : "النور جامد، غيّر مكانك" }
  if (r.sharp === false) return { arrow: "focus", say: "دوس على الحاجة المهمة عشان تبقى واضحة" }
  if (r.match === false) return { arrow: "match", say: "قرّب الكادر من صورة المرجع" }
  return { arrow: null, say: "" }
}
