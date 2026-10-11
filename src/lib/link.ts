/**
 * Shoot pack by link. The whole pack rides in the link's fragment (after "#"),
 * which the browser never sends to any server: opening the link is still fully local.
 *
 *   https://raq-director.vercel.app/p#1.<base64url of deflate-raw(JSON)>
 *   https://raq-director.vercel.app/p#0.<base64url of the UTF-8 JSON>   (no compression, easier to write by hand)
 *
 * Spec for the brain: docs/PACK_FORMAT.md. Command line: scripts/pack-link.mjs.
 */
import { parsePack, type ParseResult } from "./pack"
import type { ShootPack } from "./types"

export const APP_ORIGIN = "https://raq-director.vercel.app"
export const LINK_PATH = "/p"
/** Links above this length are cut by some chat apps; reference photos are dropped first. */
const MAX_LINK = 30000
/** A decoded pack larger than this is refused (a pack with images is far smaller). */
const MAX_JSON = 2_000_000

const LINK_RE = /#([01])\.([A-Za-z0-9_-]+)/

function toB64url(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error("too big")
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** True when the text holds a pack link (a whole URL, or just its "#1.…" part). */
export function hasPackLink(text: string): boolean {
  return LINK_RE.test(text)
}

/** The pack JSON carried by a link, or null when there is none or it is damaged. */
export async function decodePackLink(text: string): Promise<string | null> {
  const m = text.match(LINK_RE)
  if (!m) return null
  try {
    const raw = fromB64url(m[2])
    const bytes = m[1] === "1" ? await pipe(raw, new DecompressionStream("deflate-raw"), MAX_JSON) : raw
    if (bytes.length > MAX_JSON) return null
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * Reads whatever arrived: a pack link, or a pasted brain answer.
 * A client project that arrives by link always waits for Khaled to confirm consent on the phone (DEC-51).
 */
export async function readPackText(text: string): Promise<ParseResult> {
  if (!hasPackLink(text)) return parsePack(text)
  const json = await decodePackLink(text)
  if (!json) return { pack: null, errors: ["الرابط ناقص أو متقطع. اطلب من العقل يبعته تاني كامل."] }
  const r = parsePack(json)
  if (r.pack?.kind === "project") r.pack.consent_confirmed = false
  return r
}

/** A link that opens this pack on any phone with the app. Reference photos are dropped if the link gets too long. */
export async function packToLink(pack: ShootPack, origin = APP_ORIGIN): Promise<{ url: string; droppedImages: boolean }> {
  const make = async (p: ShootPack) => {
    const json = new TextEncoder().encode(JSON.stringify(p))
    const packed = await pipe(json, new CompressionStream("deflate-raw"))
    return `${origin}${LINK_PATH}#1.${toB64url(packed)}`
  }
  const full = await make(pack)
  if (full.length <= MAX_LINK || !pack.shots.some((s) => s.reference_image)) return { url: full, droppedImages: false }
  return { url: await make({ ...pack, shots: pack.shots.map((s) => ({ ...s, reference_image: null })) }), droppedImages: true }
}

/** The pack link the app was opened with (web), removed from the address bar so a reload doesn't bring it back. */
export function takeLaunchLink(): string | null {
  if (typeof window === "undefined" || !hasPackLink(window.location.hash)) return null
  const link = window.location.href
  try {
    window.history.replaceState(null, "", "/")
  } catch {
    /* ignore */
  }
  return link
}
