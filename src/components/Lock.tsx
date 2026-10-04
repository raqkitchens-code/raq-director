import { useEffect, useState } from "react"
import { arNum } from "../lib/labels"
import { PIN_RE, checkPin, hasPin, setPin, waitMs } from "../lib/lock"

export function Lock({ onUnlock }: { onUnlock: () => void }) {
  const setup = !hasPin()
  const [pin, setPinText] = useState("")
  const [confirm, setConfirm] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [wait, setWait] = useState(waitMs())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const t = window.setInterval(() => setWait(waitMs()), 500)
    return () => window.clearInterval(t)
  }, [wait])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      if (setup) {
        if (confirm === null) {
          if (!PIN_RE.test(pin)) {
            setMsg("اختار رقم سري من ٦ لـ ٨ أرقام")
          } else {
            setConfirm(pin)
            setPinText("")
          }
        } else if (confirm !== pin) {
          setMsg("الرقمين مش زي بعض. ابدأ تاني")
          setConfirm(null)
          setPinText("")
        } else {
          await setPin(pin)
          onUnlock()
        }
      } else if (await checkPin(pin)) {
        onUnlock()
      } else {
        setPinText("")
        setWait(waitMs())
        setMsg("الرقم غلط")
      }
    } finally {
      setBusy(false)
    }
  }

  const press = (d: string) => setPinText((p) => (p.length < 8 ? p + d : p))

  return (
    <div className="lock">
      <div className="brand">
        <div className="brand-mark">راق</div>
        <div className="brand-sub">المخرج</div>
      </div>
      <p className="lock-title">
        {setup ? (confirm === null ? "اختار رقم سري للأداة" : "اكتب الرقم السري تاني للتأكيد") : "اكتب الرقم السري"}
      </p>
      <div className="dots" aria-live="polite">
        {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
          <span key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>
      {msg && <p className="lock-msg">{msg}</p>}
      {wait > 0 && <p className="lock-msg">استنى {arNum(Math.ceil(wait / 1000))} ثانية</p>}
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} disabled={wait > 0}>
            {arNum(d)}
          </button>
        ))}
        <button onClick={() => setPinText((p) => p.slice(0, -1))} aria-label="امسح">
          ⌫
        </button>
        <button onClick={() => press("0")} disabled={wait > 0}>
          {arNum(0)}
        </button>
        <button className="ok" onClick={submit} disabled={wait > 0 || pin.length < 6 || busy} aria-label="تمام">
          ✓
        </button>
      </div>
      {setup && (
        <p className="muted small center">
          الرقم ده بيتحفظ على الموبايل ده بس، ومحدش يقدر يرجّعه. لو نسيته، لازم تمسح بيانات الأداة من المتصفح.
        </p>
      )}
    </div>
  )
}
