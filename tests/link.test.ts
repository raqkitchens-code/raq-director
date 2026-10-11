import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { LIBRARY_PACK, handoverPack, surveyPack } from "../src/lib/library"
import { decodePackLink, hasPackLink, packToLink, readPackText } from "../src/lib/link"
import { validatePack } from "../src/lib/pack"

const projectPack = () => handoverPack("RAQ-2026-000002", true, "")

describe("pack link", () => {
  it("round-trips a pack through a link, Arabic text intact", async () => {
    const { url, droppedImages } = await packToLink(LIBRARY_PACK)
    expect(url.startsWith("https://raq-director.vercel.app/p#1.")).toBe(true)
    expect(droppedImages).toBe(false)
    const r = await readPackText(url)
    expect(r.errors).toEqual([])
    expect(r.pack?.title).toBe(LIBRARY_PACK.title)
    expect(r.pack?.shots.map((s) => s.direction)).toEqual(LIBRARY_PACK.shots.map((s) => s.direction))
  })

  it("finds the link inside a chat message", async () => {
    const { url } = await packToLink(LIBRARY_PACK)
    expect(hasPackLink(`افتح الخطة دي:\n${url}\nبالتوفيق`)).toBe(true)
    expect((await readPackText(`افتح الخطة دي: ${url} بالتوفيق`)).pack?.shots.length).toBe(LIBRARY_PACK.shots.length)
  })

  it("reads the uncompressed form", async () => {
    const b64 = Buffer.from(JSON.stringify(LIBRARY_PACK), "utf8").toString("base64url")
    const r = await readPackText(`https://raq-director.vercel.app/p#0.${b64}`)
    expect(r.pack?.id).toBe(LIBRARY_PACK.id)
  })

  it("a client project by link always waits for consent on the phone", async () => {
    const { url } = await packToLink(projectPack())
    const r = await readPackText(url)
    expect(r.pack?.kind).toBe("project")
    expect(r.pack?.consent_confirmed).toBe(false)
  })

  it("explains a cut or damaged link instead of crashing", async () => {
    const { url } = await packToLink(LIBRARY_PACK)
    const cut = url.slice(0, Math.floor(url.length / 2))
    expect(await decodePackLink(cut)).toBeNull()
    const r = await readPackText(cut)
    expect(r.pack).toBeNull()
    expect(r.errors[0]).toContain("الرابط")
  })

  it("still reads a pasted brain answer", async () => {
    const r = await readPackText('```json\n{"format":"raq-director/1","shots":[{"title":"لقطة"}]}\n```')
    expect(r.pack?.shots[0].title).toBe("لقطة")
  })

  it("drops reference photos when the link would be too long", async () => {
    // Photos don't compress, so each shot gets its own random bytes.
    const img = () => `data:image/jpeg;base64,${randomBytes(4000).toString("base64")}`
    const p = { ...LIBRARY_PACK, shots: LIBRARY_PACK.shots.map((s) => ({ ...s, reference_image: img() })) }
    const { url, droppedImages } = await packToLink(p)
    expect(droppedImages).toBe(true)
    expect(url.length).toBeLessThan(30000)
  })

  it("the command line script makes links the app reads", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pack-"))
    const file = join(dir, "pack.json")
    writeFileSync(file, JSON.stringify(surveyPack("RAQ-2026-000002", false, "")))
    const url = execFileSync("node", ["scripts/pack-link.mjs", file], { encoding: "utf8" }).trim()
    const r = await readPackText(url)
    expect(r.errors).toEqual([])
    expect(r.pack?.shots).toHaveLength(12)
  })
})

describe("survey and handover templates", () => {
  for (const make of [surveyPack, handoverPack]) {
    it(`${make.name} is a valid client project pack`, () => {
      const p = make("RAQ-2026-000002", false, "")
      const r = validatePack(JSON.parse(JSON.stringify(p)))
      expect(r.errors).toEqual([])
      expect(r.pack?.kind).toBe("project")
      expect(r.pack?.project_code).toBe("RAQ-2026-000002")
      expect(new Set(p.shots.map((s) => s.id)).size).toBe(p.shots.length)
      expect(p.shots.every((s) => s.needs_consent && s.direction)).toBe(true)
    })
  }

  it("handover opens from the same spot as the survey", () => {
    const first = surveyPack("RAQ-2026-000002", false, "").shots[0]
    const again = handoverPack("RAQ-2026-000002", false, "").shots[1]
    expect([again.framing, again.lens, again.height, again.pitch_deg]).toEqual([
      first.framing,
      first.lens,
      first.height,
      first.pitch_deg,
    ])
  })
})
