/**
 * Shoot pack: the instructions the RAQ brain sends to the director.
 * Format id: "raq-director/1". Full spec in docs/PACK_FORMAT.md.
 */

export const PACK_FORMAT = "raq-director/1"

export type PackKind = "library" | "project" | "script"
export type Framing = "wide" | "medium" | "close" | "detail"
export type Lens = "0.6" | "1" | "2" | "3" | "front"
export type Height = "floor" | "knee" | "waist" | "chest" | "eye" | "high"
export type Move =
  | "static"
  | "pan_left"
  | "pan_right"
  | "tilt_up"
  | "tilt_down"
  | "push_in"
  | "pull_out"
  | "slide"
export type Pillar =
  | "durability_execution"
  | "comfort_design"
  | "system_trust"
  | "real_projects"
  | "showroom_materials"
  | "foundation_mistakes"

export interface Shot {
  id: string
  title: string
  /** Why this shot exists (what the viewer should feel or learn). */
  purpose?: string
  framing: Framing
  lens: Lens
  height: Height
  /** Camera pitch target in degrees. 0 = level, negative = looking down. */
  pitch_deg: number
  /** Allowed pitch error in degrees. */
  pitch_tol: number
  /** Allowed horizon tilt in degrees. */
  roll_tol: number
  move: Move
  /** [min, max] seconds. */
  duration_s: [number, number]
  /** Words to read on camera (teleprompter). Empty = silent shot. */
  prompter?: string
  /** Director's note: what to do while shooting. */
  direction?: string
  /** Reference frame as a data: URL (from a reference video or an earlier take). */
  reference_image?: string | null
  pillar?: Pillar
  /** Shooting this needs the client's consent (DEC-51). */
  needs_consent?: boolean
}

export interface ShootPack {
  format: typeof PACK_FORMAT
  id: string
  title: string
  kind: PackKind
  project_code?: string | null
  consent_confirmed?: boolean
  notes?: string
  created_at: string
  shots: Shot[]
}

export interface CheckResult {
  key: "duration" | "level" | "pitch" | "steady" | "light" | "sharp" | "match"
  ok: boolean
  /** Arabic line shown to the person. */
  label: string
  detail: string
}

export interface Take {
  id: string
  pack_id: string
  shot_id: string
  /** Sequential number for this shot (1, 2, 3...). */
  n: number
  created_at: string
  duration_s: number
  mime: string
  size: number
  checks: CheckResult[]
  verdict: "accepted" | "retake"
  /** Person's choice after review. */
  kept: boolean
  /** Small poster frame (data URL) for lists. */
  poster?: string
}
