/**
 * App lock: a PIN, stored only as a salted PBKDF2 hash on this phone.
 * Wrong attempts slow down; the app locks again when it goes to the background.
 */

const KEY = "raq-director.lock"
const ATTEMPTS = "raq-director.lock.fails"
const ITER = 210_000

interface Stored {
  salt: string
  hash: string
  iter: number
}

const enc = new TextEncoder()
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter },
    key,
    256,
  )
  return b64(bits)
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

export const hasPin = () => read() !== null
export const PIN_RE = /^\d{6,8}$/

export async function setPin(pin: string): Promise<void> {
  if (!PIN_RE.test(pin)) throw new Error("الرقم السري لازم ٦ لـ ٨ أرقام")
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITER)
  localStorage.setItem(KEY, JSON.stringify({ salt: b64(salt), hash, iter: ITER } satisfies Stored))
  localStorage.removeItem(ATTEMPTS)
}

interface Fails {
  count: number
  until: number
}

function fails(): Fails {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS) ?? "") as Fails
  } catch {
    return { count: 0, until: 0 }
  }
}

/** Milliseconds left before another attempt is allowed. */
export const waitMs = () => Math.max(0, fails().until - Date.now())

export async function checkPin(pin: string): Promise<boolean> {
  const s = read()
  if (!s || waitMs() > 0) return false
  // Constant-time-ish comparison of the derived hashes.
  const got = await derive(pin, unb64(s.salt), s.iter)
  let diff = got.length ^ s.hash.length
  for (let i = 0; i < Math.min(got.length, s.hash.length); i++) diff |= got.charCodeAt(i) ^ s.hash.charCodeAt(i)
  if (diff === 0) {
    localStorage.removeItem(ATTEMPTS)
    return true
  }
  const f = fails()
  const count = f.count + 1
  // 3 free tries, then 30s, 60s, 120s ... capped at 15 minutes.
  const until = count >= 3 ? Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (count - 3)) : 0
  localStorage.setItem(ATTEMPTS, JSON.stringify({ count, until } satisfies Fails))
  return false
}

/** Locks after the app has been in the background for this long. */
export const RELOCK_MS = 60_000
