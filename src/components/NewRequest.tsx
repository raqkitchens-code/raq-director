import { useState } from "react"
import { arNum } from "../lib/labels"
import { handoverPack, projectTourPack, scriptPack, surveyPack } from "../lib/library"
import { PROJECT_CODE_RE, buildBrainPrompt } from "../lib/pack"
import type { PackKind, ShootPack } from "../lib/types"

interface Props {
  onBack: () => void
  onCreate: (p: ShootPack) => void
  onImport: () => void
}

const KINDS: { kind: PackKind; label: string }[] = [
  { kind: "project", label: "مشروع" },
  { kind: "script", label: "فيديو بسكريبت" },
  { kind: "library", label: "لقطات عامة" },
]

const TEMPLATES = [
  { label: "معاينة", make: surveyPack },
  { label: "تسليم", make: handoverPack },
  { label: "جولة مشروع", make: projectTourPack },
]

export function NewRequest({ onBack, onCreate, onImport }: Props) {
  const [kind, setKind] = useState<PackKind>("project")
  const [code, setCode] = useState("RAQ-2026-")
  const [consent, setConsent] = useState(false)
  const [notes, setNotes] = useState("")
  const [refs, setRefs] = useState(0)
  const [title, setTitle] = useState("")
  const [script, setScript] = useState("")
  const [copied, setCopied] = useState(false)

  const codeOk = PROJECT_CODE_RE.test(code.trim())
  const prompt = buildBrainPrompt({
    kind,
    projectCode: kind === "project" ? code.trim() : undefined,
    notes: kind === "script" && script.trim() ? `${notes}\n\nالسكريبت:\n${script}` : notes,
    references: refs,
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt("انسخ الطلب ده:", prompt)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <button className="ghost-btn" onClick={onBack} aria-label="رجوع">
          →
        </button>
        <h1 className="h-sm grow">طلب تصوير جديد</h1>
      </header>

      <div className="tabs">
        {KINDS.map((k) => (
          <button key={k.kind} className={`tab ${kind === k.kind ? "on" : ""}`} onClick={() => setKind(k.kind)}>
            {k.label}
          </button>
        ))}
      </div>

      {kind === "project" && (
        <section className="card form">
          <label>
            <span>كود المشروع</span>
            <input dir="ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            {!codeOk && <small className="muted">الشكل: RAQ-2026-000002</small>}
          </label>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>العميل وافق على التصوير والنشر (القرار ٥١)</span>
          </label>
        </section>
      )}

      {kind === "script" && (
        <section className="card form">
          <label>
            <span>اسم الفيديو</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            <span>السكريبت (كل فقرة = لقطة على الملقّن)</span>
            <textarea rows={8} value={script} onChange={(e) => setScript(e.target.value)} />
          </label>
        </section>
      )}

      <section className="card form">
        <label>
          <span>قواعدك أو برومبت للعقل</span>
          <textarea
            rows={5}
            placeholder="مثلا: عايز فيديو شبه فيديو شركة مطابخ عالمية، هادي، لقطات قريبة على الخامات، ٣٠ ثانية…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label>
          <span>عدد الصور المرجعية اللي هتبعتها للعقل</span>
          <input type="number" min={0} max={20} value={refs} onChange={(e) => setRefs(Number(e.target.value) || 0)} />
        </label>
      </section>

      <section className="card">
        <h2>١. ابعت الطلب للعقل</h2>
        <p className="muted">
          انسخ الطلب، والصقه في مشروع «عقل راق» على كلود مع الصور المرجعية ({arNum(refs)}). العقل هيرد بخطة.
        </p>
        <button className="btn primary wide" onClick={copy} disabled={kind === "project" && !codeOk}>
          {copied ? "اتنسخ ✓" : "انسخ الطلب"}
        </button>
        <h2>٢. استلم الخطة</h2>
        <button className="btn wide" onClick={onImport}>
          الصق رد العقل
        </button>
      </section>

      <section className="card">
        <h2>أو ابدأ دلوقتي من غير العقل</h2>
        {kind === "project" && (
          <div className="stack">
            {TEMPLATES.map((t) => {
              const sample = t.make("RAQ-2026-000000", false, "")
              return (
                <button
                  key={t.label}
                  className="btn wide"
                  disabled={!codeOk}
                  onClick={() => onCreate(t.make(code.trim(), consent, notes.trim()))}
                >
                  قالب {t.label} ({arNum(sample.shots.length)} لقطة)
                </button>
              )
            })}
            {!codeOk && <small className="muted">اكتب كود المشروع الأول.</small>}
          </div>
        )}
        {kind === "script" && (
          <button className="btn wide" disabled={!script.trim()} onClick={() => onCreate(scriptPack(title.trim(), script))}>
            حوّل السكريبت لخطة
          </button>
        )}
        {kind === "library" && <p className="muted">مكتبة لقطات راق جاهزة في الصفحة الرئيسية.</p>}
      </section>
    </div>
  )
}
