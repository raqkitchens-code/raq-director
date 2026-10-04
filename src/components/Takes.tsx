import { useEffect, useState } from "react"
import { db, storageUsage } from "../lib/db"
import { exportTake, takeFileName } from "../lib/files"
import { arNum } from "../lib/labels"
import { RaqCamera, isNative } from "../lib/native"
import type { ShootPack, Take } from "../lib/types"

interface Props {
  packs: ShootPack[]
  takes: Take[]
  onBack: () => void
  onDeleted: (id: string) => void
}

const mb = (b: number) => arNum((b / 1_048_576).toFixed(1))

export function Takes({ packs, takes, onBack, onDeleted }: Props) {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)

  useEffect(() => {
    storageUsage().then(setUsage)
  }, [takes.length])

  useEffect(
    () => () => {
      if (playing) URL.revokeObjectURL(playing.url)
    },
    [playing],
  )

  const kept = takes.filter((t) => t.kept).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const packOf = (t: Take) => packs.find((p) => p.id === t.pack_id)
  const shotTitle = (t: Take) => packOf(t)?.shots.find((s) => s.id === t.shot_id)?.title ?? t.shot_id

  const doExport = async (t: Take) => {
    if (t.gallery_uri) {
      RaqCamera.share({ uri: t.gallery_uri }).catch(() => setMsg("مش عارف أفتح قايمة المشاركة"))
      return
    }
    const p = packOf(t)
    const blob = await db.blob(t.id)
    if (!blob || !p) return setMsg("الملف مش موجود")
    setBusy(t.id)
    const r = await exportTake(blob, takeFileName(p, t))
    setBusy(null)
    if (r === "downloaded") setMsg("اتنزلت في التنزيلات")
  }

  const play = async (t: Take) => {
    if (t.gallery_uri) {
      RaqCamera.openInGallery({ uri: t.gallery_uri }).catch(() => setMsg("اللقطة مش موجودة في الجاليري"))
      return
    }
    const blob = await db.blob(t.id)
    if (!blob) return
    setPlaying({ id: t.id, url: URL.createObjectURL(blob) })
  }

  const remove = async (t: Take) => {
    const q = t.gallery_uri ? "تمسح اللقطة دي من الأداة ومن الجاليري؟" : "تمسح اللقطة دي من الموبايل؟ لو مش متصدّرة هتضيع."
    if (!window.confirm(q)) return
    if (t.gallery_uri) await RaqCamera.deleteTake({ galleryUri: t.gallery_uri }).catch(() => {})
    await db.deleteTake(t.id)
    onDeleted(t.id)
  }

  return (
    <div className="page">
      <header className="page-head">
        <button className="ghost-btn" onClick={onBack} aria-label="رجوع">
          →
        </button>
        <div className="grow">
          <h1 className="h-sm">اللقطات المحفوظة</h1>
          {usage && (
            <div className="muted small">
              مستخدم {mb(usage.used)} ميجا من المساحة المتاحة للأداة
            </div>
          )}
        </div>
      </header>
      {isNative() ? (
        <p className="muted small">
          كل لقطة بتتحفظ في الجاليري على طول، في فولدر راق. «شارك» بتفتح قايمة المشاركة: دروب بوكس أو واتساب.
        </p>
      ) : (
      <p className="muted small">
        اللقطات محفوظة على الموبايل ده بس. «صدّر» بتفتح قايمة المشاركة: احفظها في المعرض، أو ارفعها على دروب بوكس في فولدر التسويق
        أو فولدر المشروع.
      </p>
      )}
      {msg && <div className="banner">{msg}</div>}
      {kept.length === 0 && <p className="card">لسه مفيش لقطات.</p>}
      <ul className="takes">
        {kept.map((t) => (
          <li key={t.id} className="take">
            {playing?.id === t.id ? (
              <video src={playing.url} controls autoPlay playsInline />
            ) : (
              <button className="poster" onClick={() => play(t)}>
                {t.poster ? <img src={t.poster} alt="" /> : <div className="ph">▶</div>}
              </button>
            )}
            <div className="take-info">
              <b>{shotTitle(t)}</b>
              <div className="muted small">
                {packOf(t)?.title} · محاولة {arNum(t.n)} · {arNum(t.duration_s)} ث · {mb(t.size)} ميجا
              </div>
              <span className={`badge ${t.verdict === "accepted" ? "ok" : "warn"}`}>
                {t.verdict === "accepted" ? "مقبولة" : "محتاجة إعادة"}
              </span>
              <div className="row">
                <button className="btn small" disabled={busy === t.id} onClick={() => doExport(t)}>
                  {t.gallery_uri ? "شارك" : "صدّر"}
                </button>
                <button className="btn small danger subtle" onClick={() => remove(t)}>
                  امسح
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
