import { useEffect, useState } from "react"
import { listCameras, readLensMap, rememberLens, type LensMap } from "../lib/camera"
import { arNum } from "../lib/labels"
import type { Lens } from "../lib/types"

interface Cam {
  deviceId: string
  label: string
  shot: string | null
}

const SLOTS: { lens: Lens; label: string }[] = [
  { lens: "0.6", label: "الواسعة ٠٫٦" },
  { lens: "1", label: "العادية ١×" },
  { lens: "3", label: "التقريب ٣×" },
]

async function snapshot(deviceId: string): Promise<string | null> {
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false })
    const v = document.createElement("video")
    v.muted = true
    v.playsInline = true
    v.srcObject = stream
    await v.play()
    // Give auto-exposure a moment so the picture is not black.
    await new Promise((r) => setTimeout(r, 700))
    const c = document.createElement("canvas")
    c.width = 240
    c.height = Math.round((240 * v.videoHeight) / (v.videoWidth || 1)) || 320
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height)
    return c.toDataURL("image/jpeg", 0.7)
  } catch {
    return null
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
  }
}

/** Shows a picture from every back camera so the wide and zoom lenses can be picked by eye, once. */
export function LensSetup({ onBack }: { onBack: () => void }) {
  const [cams, setCams] = useState<Cam[]>([])
  const [map, setMap] = useState<LensMap>(readLensMap)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Labels and ids appear only after permission.
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
        s.getTracks().forEach((t) => t.stop())
        const back = (await listCameras()).filter((c) => c.back)
        const out: Cam[] = []
        for (const c of back) {
          if (cancelled) return
          out.push({ deviceId: c.deviceId, label: c.label, shot: await snapshot(c.deviceId) })
          setCams([...out])
        }
      } catch {
        setError("الكاميرا مقفولة. اسمح بالكاميرا من إعدادات الموقع.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const assign = (lens: Lens, id: string) => {
    rememberLens(lens, id)
    setMap(readLensMap())
  }

  return (
    <div className="page">
      <header className="page-head">
        <button className="ghost-btn" onClick={onBack} aria-label="رجوع">
          →
        </button>
        <h1 className="h-sm grow">ظبط العدسات</h1>
      </header>
      <p className="muted">
        وجّه الموبايل على حاجة فيها تفاصيل. تحت كل صورة اختار هي أنهي عدسة: الأوسع صورة هي الواسعة، والأقرب هي التقريب. بتتعمل مرة واحدة بس.
      </p>
      {error && <div className="banner warn">{error}</div>}
      {loading && <p className="muted">بجرّب الكاميرات واحدة واحدة…</p>}
      <ul className="cams">
        {cams.map((c, i) => (
          <li key={c.deviceId} className="card cam">
            {c.shot ? <img src={c.shot} alt="" /> : <div className="ph">مفيش صورة</div>}
            <div className="grow">
              <b>كاميرا {arNum(i + 1)}</b>
              <div className="chips">
                {SLOTS.map((s) => (
                  <button
                    key={s.lens}
                    className={`chip ${map[s.lens] === c.deviceId ? "on" : ""}`}
                    onClick={() => assign(s.lens, c.deviceId)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!loading && cams.length <= 1 && (
        <p className="card">المتصفح مش شايف غير كاميرا خلفية واحدة، فالأداة هتستخدم التقريب الرقمي بدل تغيير العدسة.</p>
      )}
      <button className="btn primary wide" onClick={onBack}>
        تمام
      </button>
    </div>
  )
}
