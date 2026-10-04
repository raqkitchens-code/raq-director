import { LIBRARY_PACK } from "../lib/library"
import { FRAMING_AR, LENS_AR, arNum } from "../lib/labels"
import { nextShots, packProgress } from "../lib/progress"
import type { ShootPack, Take } from "../lib/types"

interface Props {
  packs: ShootPack[]
  takes: Take[]
  onOpenPack: (id: string) => void
  onShoot: (packId: string, index: number) => void
  onNew: () => void
  onImport: () => void
  onTakes: () => void
  onLensSetup: () => void
  onLock: () => void
}

export function Home({ packs, takes, onOpenPack, onShoot, onNew, onImport, onTakes, onLensSetup, onLock }: Props) {
  const imported = packs.filter((p) => p.id !== LIBRARY_PACK.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const active = imported.find((p) => {
    const pr = packProgress(takes, p)
    return pr.done < pr.total
  })
  const today = active ? { pack: active, shots: nextShots(takes, active) } : { pack: LIBRARY_PACK, shots: nextShots(takes, LIBRARY_PACK) }

  return (
    <div className="page">
      <header className="page-head">
        <div className="brand inline">
          <div className="brand-mark">راق</div>
          <div className="brand-sub">المخرج</div>
        </div>
        <button className="ghost-btn" onClick={onLock} aria-label="اقفل">
          🔒
        </button>
      </header>

      <section className="card hero">
        <h1>هنصور إيه النهارده؟</h1>
        <p className="muted">
          {active ? `من خطة «${active.title}»` : "لقطات عامة ناقصة في مكتبة راق"}
        </p>
        {today.shots.length === 0 ? (
          <p>كل اللقطات اتصوّرت. استلم خطة جديدة من العقل.</p>
        ) : (
          <ol className="todo">
            {today.shots.map(({ shot, index }) => (
              <li key={shot.id}>
                <button className="todo-item" onClick={() => onShoot(today.pack.id, index)}>
                  <b>{shot.title}</b>
                  <span className="muted">
                    {FRAMING_AR[shot.framing]} · {LENS_AR[shot.lens]}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {today.shots[0] && (
          <button className="btn primary wide" onClick={() => onShoot(today.pack.id, today.shots[0].index)}>
            ابدأ التصوير
          </button>
        )}
      </section>

      <div className="grid-2">
        <button className="tile" onClick={onImport}>
          <b>استلم خطة من العقل</b>
          <span className="muted">الصق رد عقل راق أو افتح ملف الخطة</span>
        </button>
        <button className="tile" onClick={onNew}>
          <b>طلب جديد</b>
          <span className="muted">مشروع، أو فيديو بسكريبت، أو لقطات عامة</span>
        </button>
        <button className="tile" onClick={() => onOpenPack(LIBRARY_PACK.id)}>
          <b>مكتبة لقطات راق</b>
          <span className="muted">
            {arNum(packProgress(takes, LIBRARY_PACK).done)} من {arNum(LIBRARY_PACK.shots.length)} متصوّرة
          </span>
        </button>
        <button className="tile" onClick={onTakes}>
          <b>اللقطات المحفوظة</b>
          <span className="muted">{arNum(takes.filter((t) => t.kept).length)} لقطة على الموبايل</span>
        </button>
        <button className="tile" onClick={onLensSetup}>
          <b>ظبط العدسات</b>
          <span className="muted">مرة واحدة: عرّف المخرج الواسعة والتقريب بالصور</span>
        </button>
      </div>

      {imported.length > 0 && (
        <section className="card">
          <h2>الخطط</h2>
          <ul className="list">
            {imported.map((p) => {
              const pr = packProgress(takes, p)
              return (
                <li key={p.id}>
                  <button className="list-item" onClick={() => onOpenPack(p.id)}>
                    <span>
                      <b>{p.title}</b>
                      {p.project_code && <span className="code">{p.project_code}</span>}
                    </span>
                    <span className="muted">
                      {arNum(pr.done)} / {arNum(pr.total)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
