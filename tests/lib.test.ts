import { describe, expect, it } from "vitest"
import { edgeMap, frameStats, ncc } from "../src/lib/analysis"
import { evaluateTake, readiness } from "../src/lib/checks"
import { LIBRARY_PACK, projectTourPack, scriptPack } from "../src/lib/library"
import { attitudeFromGravity } from "../src/lib/motion"
import { buildBrainPrompt, consentBlocked, extractJson, parsePack } from "../src/lib/pack"
import type { Shot } from "../src/lib/types"

const shot: Shot = LIBRARY_PACK.shots[1] // static, pitch 0

describe("pack", () => {
  it("reads a pack wrapped in a Claude answer with a code fence", () => {
    const text = 'تمام، دي الخطة:\n```json\n{"format":"raq-director/1","title":"تجربة","kind":"library","shots":[{"title":"لقطة","lens":"0.6","duration_s":[3,5]}]}\n```\nبالتوفيق'
    const r = parsePack(text)
    expect(r.pack?.shots[0].lens).toBe("0.6")
    expect(r.pack?.shots[0].id).toBe("S01")
    expect(r.errors).toEqual([])
  })

  it("drops remote reference links and bad project codes", () => {
    const r = parsePack(
      JSON.stringify({
        format: "raq-director/1",
        kind: "project",
        project_code: "RAQ-26-2",
        shots: [{ title: "x", reference_image: "https://evil.example/x.jpg" }],
      }),
    )
    expect(r.pack?.shots[0].reference_image).toBeNull()
    expect(r.pack?.project_code).toBeNull()
    expect(r.errors.length).toBeGreaterThanOrEqual(2)
  })

  it("clamps numbers and fixes reversed durations", () => {
    const r = parsePack(JSON.stringify({ shots: [{ title: "x", pitch_deg: 500, duration_s: [9, 2] }] }))
    expect(r.pack?.shots[0].pitch_deg).toBe(90)
    expect(r.pack?.shots[0].duration_s).toEqual([2, 9])
  })

  it("rejects text with no pack", () => {
    expect(parsePack("مفيش حاجة هنا").pack).toBeNull()
    expect(extractJson("abc")).toBeNull()
  })

  it("blocks project shooting until consent (DEC-51)", () => {
    const p = projectTourPack("RAQ-2026-000002", false, "")
    expect(consentBlocked(p, p.shots[0])).toBe(true)
    expect(consentBlocked({ ...p, consent_confirmed: true }, p.shots[0])).toBe(false)
    expect(consentBlocked(LIBRARY_PACK, LIBRARY_PACK.shots[0])).toBe(false)
  })

  it("splits a script into teleprompter shots", () => {
    const p = scriptPack("تجربة", "الفقرة الأولى هنا.\n\nالفقرة التانية هنا.")
    expect(p.shots).toHaveLength(2)
    expect(p.shots[1].prompter).toBe("الفقرة التانية هنا.")
  })

  it("brain prompt carries the project code and the format", () => {
    const t = buildBrainPrompt({ kind: "project", projectCode: "RAQ-2026-000002", notes: "هادي", references: 2 })
    expect(t).toContain("RAQ-2026-000002")
    expect(t).toContain("raq-director/1")
    expect(t).toContain("DEC-52")
    expect(parsePack(t).pack).not.toBeNull()
  })
})

describe("motion", () => {
  it("upright phone is level", () => {
    const a = attitudeFromGravity(0, 9.8, 0)
    expect(Math.abs(a.pitch)).toBeLessThan(0.01)
    expect(Math.abs(a.roll)).toBeLessThan(0.01)
  })
  it("top tilted away = camera looks down", () => {
    const a = attitudeFromGravity(0, 9.8 * Math.cos(0.3), 9.8 * Math.sin(0.3))
    expect(a.pitch).toBeCloseTo(-17.19, 1)
  })
  it("turned clockwise = positive roll", () => {
    const a = attitudeFromGravity(-9.8 * Math.sin(0.1), 9.8 * Math.cos(0.1), 0)
    expect(a.roll).toBeCloseTo(5.73, 1)
  })
})

function img(w: number, h: number, f: (x: number, y: number) => number) {
  const l = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l[y * w + x] = f(x, y)
  return l
}

describe("analysis", () => {
  const W = 90
  const H = 160
  const sharp = img(W, H, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 200 : 60)
  const flat = img(W, H, () => 128)
  it("sharp pattern beats a flat grey frame", () => {
    expect(frameStats(sharp, W, H).sharpness).toBeGreaterThan(frameStats(flat, W, H).sharpness)
  })
  it("same picture matches, shifted picture matches less", () => {
    const a = edgeMap(img(W, H, (x) => (x > 45 ? 220 : 40)), W, H)
    const b = edgeMap(img(W, H, (x) => (x > 45 ? 200 : 50)), W, H)
    const c = edgeMap(img(W, H, (_, y) => (y > 80 ? 220 : 40)), W, H)
    expect(ncc(a, b)).toBeGreaterThan(0.9)
    expect(ncc(a, c)).toBeLessThan(0.3)
  })
})

describe("checks", () => {
  const steady = Array.from({ length: 20 }, (_, i) => ({ pitch: 0.5, roll: 0.3, rot: 3, t: i }))
  const good = { mean: 120, clipped: 0.01, sharpness: 150 }
  it("a steady, level, bright, sharp take of the right length is accepted", () => {
    const r = evaluateTake(shot, { duration: 4, motion: steady, frames: [good, good, good], matches: [] })
    expect(r.verdict).toBe("accepted")
  })
  it("too short and shaky = retake with reasons", () => {
    const shaky = steady.map((m) => ({ ...m, rot: 40 }))
    const r = evaluateTake(shot, { duration: 1.2, motion: shaky, frames: [good, good, good], matches: [] })
    expect(r.verdict).toBe("retake")
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key).sort()).toEqual(["duration", "steady"])
  })
  it("frame turns green only when everything measurable is right", () => {
    expect(readiness(shot, { pitch: 0, roll: 0 }, good, null).ready).toBe(true)
    expect(readiness(shot, { pitch: 0, roll: 6 }, good, null).ready).toBe(false)
    expect(readiness(shot, null, null, null).ready).toBe(false)
  })
})
