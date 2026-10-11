import { useRef, useState } from "react"
import { imageFileToDataUrl } from "../lib/files"
import { FRAMING_AR, LENS_AR, PILLAR_AR, arNum } from "../lib/labels"
import { LIBRARY_PACK } from "../lib/library"
import { packToLink } from "../lib/link"
import { isDone, keptFor, packProgress } from "../lib/progress"
import type { ShootPack, Take } from "../lib/types"

interface Props {
  pack: ShootPack
  takes: Take[]
  onBack: () => void
  onShoot: (index: number) => void
  onChange: (p: ShootPack) => void
  onDelete: () => void
}

export function PackView({ pack, takes, onBack, onShoot, onChange, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [refFor, setRefFor] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shared, setShared] = useState<string | null>(null)
  const pr = packProgress(takes, pack)
  const needsConsent = pack.kind === "project" || pack.shots.some((s) => s.needs_consent)
  const builtIn = pack.id === LIBRARY_PACK.id

  const pickRef = (i: number) => {
    setRefFor(i)
    fileRef.current?.click()
  }

  const onFile = async (f: File | undefined) => {
    if (!f || refFor === null) return
    try {
      const url = await imageFileToDataUrl(f)
      onChange({ ...pack, shots: pack.shots.map((s, i) => (i === refFor ? { ...s, reference_image: url } : s)) })
    } catch (e) {
      setError((e as Error).message)
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  const shareLink = async () => {
    const { url, droppedImages } = await packToLink(pack)
    const note = droppedImages ? "الرابط اتبعت من غير صور المرجع عشان يفضل قصير." : null
    try {
      if (navigator.share) {
        await navigator.share({ title: pack.title, url })
        setShared(note ?? "اتبعت ✓")
        return
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return
    }
    try {
      await navigator.clipboard.writeText(url)
      setShared(note ?? "الرابط اتنسخ ✓ ابعته على الواتساب")
    } catch {
      window.prompt("انسخ الرابط ده:", url)
    }
  }

  const clearRef = (i: number) =>
    onChange({ ...pack, shots: pack.shots.map((s, j) => (j === i ? { ...s, reference_image: null } : s)) })

  return (
    <div className="page">
      <header className="page-head">
        <button className="ghost-btn" onClick={onBack} aria-label="رجوع">
          →
        </button>
        <div className="grow">
          <h1 className="h-sm">{pack.title}</h1>
          <div className="muted">
            {pack.project_code && <span className="code">{pack.project_code}</span>} متصوّر {arNum(pr.done)} من{" "}
            {arNum(pr.total)}
          </div>
        </div>
      </header>

      {pack.notes && <p className="card note">{pack.notes}</p>}

      {needsConsent && !builtIn && (
        <label className={`card consent ${pack.consent_confirmed ? "ok" : "warn"}`}>
          <input
            type="checkbox"
            checked={Boolean(pack.consent_confirmed)}
            onChange={(e) => onChange({ ...pack, consent_confirmed: e.target.checked })}
          />
          <span>العميل وافق على تصوير مشروعه ونشره (بند في العقد، القرار ٥١). من غير الموافقة دي التصوير مقفول.</span>
        </label>
      )}
      {error && <div className="banner warn">{error}</div>}

      <ol className="shots">
        {pack.shots.map((s, i) => {
          const kept = keptFor(takes, pack, s)
          const done = isDone(takes, pack, s)
          return (
            <li key={s.id} className={`shot-card ${done ? "done" : ""}`}>
              <button className="shot-main" onClick={() => onShoot(i)}>
                {s.reference_image ? <img src={s.reference_image} alt="" /> : <div className="ph">{arNum(i + 1)}</div>}
                <div>
                  <b>{s.title}</b>
                  <div className="muted">
                    {FRAMING_AR[s.framing]} · {LENS_AR[s.lens]}
                  </div>
                  {s.pillar && <div className="muted small">{PILLAR_AR[s.pillar]}</div>}
                  {s.prompter && <div className="muted small">فيها كلام على الملقّن</div>}
                </div>
                <span className={`badge ${done ? "ok" : ""}`}>{done ? "✓" : kept.length ? arNum(kept.length) : "○"}</span>
              </button>
              <div className="shot-actions">
                <button className="link" onClick={() => pickRef(i)}>
                  {s.reference_image ? "غيّر صورة المرجع" : "حط صورة مرجع"}
                </button>
                {s.reference_image && (
                  <button className="link" onClick={() => clearRef(i)}>
                    شيل المرجع
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {!builtIn && (
        <section className="card">
          <button className="btn wide" onClick={shareLink}>
            ابعت الخطة برابط
          </button>
          {shared && <p className="muted small">{shared}</p>}
        </section>
      )}

      {!builtIn && (
        <button
          className="btn danger subtle"
          onClick={() => {
            if (window.confirm("تمسح الخطة دي؟ اللقطات المحفوظة مش هتتمسح.")) onDelete()
          }}
        >
          امسح الخطة
        </button>
      )}
    </div>
  )
}
