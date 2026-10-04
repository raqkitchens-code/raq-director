import { useEffect, useState } from "react"
import { markLensSetupDone } from "../lib/camera"
import { arNum } from "../lib/labels"
import { RaqCamera, type LensReport } from "../lib/native"

/**
 * Android app: the app picks the lens by itself, so this page only reports what the
 * phone gives it. A screenshot of it tells us why a lens is missing.
 */
export function NativeLenses({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<LensReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    RaqCamera.lenses()
      .then(setReport)
      .catch(() => setError("مش قادر أقرا الكاميرات. اسمح بالكاميرا من إعدادات التطبيق."))
  }, [])

  const cams = report?.cameras ?? []
  const back = cams.filter((c) => c.facing === "back")
  const wide = back.some((c) => (c.zoomMin ?? 1) < 0.95) || back.length > 1 || back.some((c) => c.physical.length > 1)

  return (
    <div className="page">
      <header className="page-head">
        <button className="ghost-btn" onClick={onBack} aria-label="رجوع">
          →
        </button>
        <h1 className="h-sm grow">العدسات</h1>
      </header>
      <p className="muted">التطبيق بيختار العدسة لوحده حسب اللقطة، وتقدر تغيّرها من الأزرار اللي على يمين الكاميرا.</p>
      {error && <div className="banner warn">{error}</div>}
      {!report && !error && <p className="muted">بقرا الكاميرات…</p>}
      {report && (
        <div className={`banner ${wide ? "" : "warn"}`}>
          {wide ? "العدسة الواسعة متاحة للتطبيق." : "الموبايل مش مدّي التطبيق غير عدسة خلفية واحدة. ابعت صورة من الصفحة دي."}
        </div>
      )}
      <ul className="cams">
        {cams.map((c, i) => (
          <li key={c.id} className="card">
            <b>
              كاميرا {arNum(i + 1)}: {c.facing === "front" ? "أمامية" : "خلفية"}
            </b>
            <p className="muted small" dir="ltr">
              id {c.id} · fov {c.fov}° · f {c.focal.toFixed(1)}mm
              {c.zoomMin !== undefined && ` · zoom ${c.zoomMin.toFixed(2)}–${(c.zoomMax ?? 0).toFixed(1)}`}
              {c.physical.length > 0 && ` · physical ${c.physical.map((p) => `${p.id}:${p.fov}°`).join(", ")}`}
            </p>
          </li>
        ))}
      </ul>
      <button
        className="btn primary wide"
        onClick={() => {
          markLensSetupDone()
          onBack()
        }}
      >
        تمام
      </button>
    </div>
  )
}
