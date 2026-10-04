import {
  PACK_FORMAT,
  type Framing,
  type Height,
  type Lens,
  type Move,
  type PackKind,
  type Pillar,
  type Shot,
  type ShootPack,
} from "./types"

const FRAMINGS: Framing[] = ["wide", "medium", "close", "detail"]
const LENSES: Lens[] = ["0.6", "1", "2", "3", "front"]
const HEIGHTS: Height[] = ["floor", "knee", "waist", "chest", "eye", "high"]
const MOVES: Move[] = ["static", "pan_left", "pan_right", "tilt_up", "tilt_down", "push_in", "pull_out", "slide"]
const PILLARS: Pillar[] = [
  "durability_execution",
  "comfort_design",
  "system_trust",
  "real_projects",
  "showroom_materials",
  "foundation_mistakes",
]
const KINDS: PackKind[] = ["library", "project", "script"]

export const PROJECT_CODE_RE = /^RAQ-\d{4}-\d{6}$/
/** Only embedded images are accepted, never remote links (the app makes no network calls). */
const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_SHOTS = 60
const MAX_TEXT = 2000

export interface ParseResult {
  pack: ShootPack | null
  errors: string[]
}

/** Pulls the JSON object out of whatever was pasted (a Claude answer may wrap it in a code fence). */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  return body.slice(start, end + 1)
}

function str(v: unknown, max = MAX_TEXT): string | undefined {
  if (typeof v !== "string") return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  const s = typeof v === "number" ? String(v) : v
  return allowed.includes(s as T) ? (s as T) : fallback
}

export function normalizeShot(raw: unknown, index: number, errors: string[]): Shot | null {
  if (!raw || typeof raw !== "object") {
    errors.push(`اللقطة رقم ${index + 1} مش مكتوبة صح`)
    return null
  }
  const r = raw as Record<string, unknown>
  const title = str(r.title, 120)
  if (!title) {
    errors.push(`اللقطة رقم ${index + 1} من غير عنوان`)
    return null
  }
  const d = Array.isArray(r.duration_s) ? r.duration_s : [3, 8]
  let dmin = num(d[0], 3, 1, 120)
  let dmax = num(d[1], Math.max(dmin, 8), 1, 180)
  if (dmax < dmin) [dmin, dmax] = [dmax, dmin]
  const ref = typeof r.reference_image === "string" && DATA_IMAGE_RE.test(r.reference_image) ? r.reference_image : null
  if (typeof r.reference_image === "string" && r.reference_image && !ref) {
    errors.push(`صورة المرجع في «${title}» اتشالت: لازم تكون صورة مدمجة، مش رابط`)
  }
  return {
    id: str(r.id, 40) ?? `S${String(index + 1).padStart(2, "0")}`,
    title,
    purpose: str(r.purpose),
    framing: pick(r.framing, FRAMINGS, "medium"),
    lens: pick(r.lens, LENSES, "1"),
    height: pick(r.height, HEIGHTS, "chest"),
    pitch_deg: num(r.pitch_deg, 0, -90, 90),
    pitch_tol: num(r.pitch_tol, 4, 1, 30),
    roll_tol: num(r.roll_tol, 2, 0.5, 15),
    move: pick(r.move, MOVES, "static"),
    duration_s: [dmin, dmax],
    prompter: str(r.prompter, 4000),
    direction: str(r.direction),
    reference_image: ref,
    pillar: PILLARS.includes(r.pillar as Pillar) ? (r.pillar as Pillar) : undefined,
    needs_consent: r.needs_consent === true,
  }
}

export function parsePack(text: string): ParseResult {
  const errors: string[] = []
  const json = extractJson(text)
  if (!json) return { pack: null, errors: ["مفيش خطة في النص ده. الصق رد العقل كله زي ما هو."] }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { pack: null, errors: ["الخطة متقطعة أو فيها غلطة في الكتابة. اطلب من العقل يبعتها تاني كاملة."] }
  }
  return validatePack(raw, errors)
}

export function validatePack(raw: unknown, errors: string[] = []): ParseResult {
  if (!raw || typeof raw !== "object") return { pack: null, errors: ["الخطة فاضية"] }
  const r = raw as Record<string, unknown>
  if (r.format !== PACK_FORMAT) errors.push("نوع الخطة مش معروف، هنحاول نقراها برضه")
  const shotsRaw = Array.isArray(r.shots) ? r.shots.slice(0, MAX_SHOTS) : []
  const shots = shotsRaw.map((s, i) => normalizeShot(s, i, errors)).filter((s): s is Shot => s !== null)
  if (!shots.length) return { pack: null, errors: [...errors, "الخطة مفيهاش ولا لقطة"] }
  const seen = new Set<string>()
  for (const s of shots) {
    while (seen.has(s.id)) s.id = `${s.id}b`
    seen.add(s.id)
  }
  const kind = pick(r.kind, KINDS, "library")
  let project_code = str(r.project_code, 20) ?? null
  if (project_code && !PROJECT_CODE_RE.test(project_code)) {
    errors.push("كود المشروع مش بالشكل الصح، فاتشال")
    project_code = null
  }
  if (kind === "project" && !project_code) errors.push("خطة مشروع من غير كود مشروع")
  return {
    pack: {
      format: PACK_FORMAT,
      id: str(r.id, 60) ?? `PK-${Date.now().toString(36)}`,
      title: str(r.title, 120) ?? "خطة تصوير",
      kind,
      project_code,
      consent_confirmed: r.consent_confirmed === true,
      notes: str(r.notes),
      created_at: str(r.created_at, 40) ?? new Date().toISOString(),
      shots,
    },
    errors,
  }
}

/** True when the pack can be shot now. Client sites need consent first (DEC-51). */
export function consentBlocked(pack: ShootPack, shot?: Shot): boolean {
  const needs = pack.kind === "project" || shot?.needs_consent === true
  return needs && !pack.consent_confirmed
}

export interface BrainRequest {
  kind: PackKind
  projectCode?: string
  notes: string
  references: number
}

/**
 * The message the person copies into the RAQ brain (the Claude project).
 * The brain answers with one JSON pack in the format below.
 */
export function buildBrainPrompt(req: BrainRequest): string {
  const what =
    req.kind === "project"
      ? `خطة تصوير لمشروع ${req.projectCode ?? "(الكود ناقص)"}.`
      : req.kind === "script"
        ? "خطة تصوير لفيديو فيه كلام على الكاميرا (سكريبت + لقطات)."
        : "لقطات عامة لمكتبة راق (مش مشروع عميل)."
  return [
    "مخرج راق محتاج خطة تصوير.",
    what,
    req.notes.trim() ? `ملاحظاتي وقواعدي:\n${req.notes.trim()}` : "",
    req.references > 0 ? `معايا ${req.references} صورة مرجعية هبعتها لك.` : "",
    "",
    "اتبع قواعد الهوية (BR_brand-rules-text) وقرارات التسويق، وممنوع ادعاءات DEC-52 وأي سعر أو عرض.",
    "رد بخطة واحدة بس في كتلة json بالشكل ده:",
    "```json",
    JSON.stringify(
      {
        format: PACK_FORMAT,
        id: "PK-2026-10-04-01",
        title: "عنوان الخطة",
        kind: req.kind,
        project_code: req.kind === "project" ? (req.projectCode ?? "RAQ-2026-000002") : null,
        consent_confirmed: false,
        notes: "ملاحظة عامة للمصوّر",
        shots: [
          {
            id: "S01",
            title: "اسم اللقطة",
            purpose: "ليه اللقطة دي",
            framing: "wide | medium | close | detail",
            lens: "0.6 | 1 | 2 | 3 | front",
            height: "floor | knee | waist | chest | eye | high",
            pitch_deg: -10,
            pitch_tol: 4,
            roll_tol: 2,
            move: "static | pan_left | pan_right | tilt_up | tilt_down | push_in | pull_out | slide",
            duration_s: [3, 6],
            prompter: "الكلام اللي يتقال (فاضي لو لقطة صامتة)",
            direction: "تعليمات المخرج وقت التصوير",
            pillar: "durability_execution | comfort_design | system_trust | real_projects | showroom_materials | foundation_mistakes",
            needs_consent: false,
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ]
    .filter((l) => l !== "")
    .join("\n")
}
