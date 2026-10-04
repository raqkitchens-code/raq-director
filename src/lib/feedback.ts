/**
 * Hands-free direction: vibration, short tones, and spoken Arabic when the
 * phone has an Arabic voice. Everything runs on the phone; nothing is sent out.
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Must be called from a tap once, so the browser allows sound later. */
export function unlockAudio() {
  audio()
  try {
    speechSynthesis.getVoices()
  } catch {
    /* no speech on this browser */
  }
}

export function tone(freq: number, ms = 120, gain = 0.15) {
  const a = audio()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000)
  o.connect(g).connect(a.destination)
  o.start()
  o.stop(a.currentTime + ms / 1000)
}

export const chimeReady = () => {
  tone(880, 110)
  setTimeout(() => tone(1320, 160), 120)
}
export const beepCount = () => tone(660, 90)
export const beepGo = () => tone(990, 220)

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

let voice: SpeechSynthesisVoice | null | undefined

function arabicVoice(): SpeechSynthesisVoice | null {
  if (voice !== undefined && voice !== null) return voice
  try {
    const all = speechSynthesis.getVoices()
    voice = all.find((v) => v.lang === "ar-EG") ?? all.find((v) => v.lang.startsWith("ar")) ?? null
  } catch {
    voice = null
  }
  return voice
}

export const hasArabicVoice = () => arabicVoice() !== null

export function speak(text: string) {
  const v = arabicVoice()
  if (!v) return false
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = v
    u.lang = v.lang
    u.rate = 1.05
    speechSynthesis.speak(u)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  try {
    speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}

/** Person's choices for the director, kept on this phone. */
export interface Prefs {
  voice: boolean
  vibrate: boolean
  autoStart: boolean
  autoNext: boolean
}

const PREFS = "raq-director.prefs"
export const DEFAULT_PREFS: Prefs = { voice: true, vibrate: true, autoStart: true, autoNext: true }

export function readPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS) ?? "{}") as Partial<Prefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: Prefs) {
  localStorage.setItem(PREFS, JSON.stringify(p))
}
