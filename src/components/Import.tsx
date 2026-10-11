import { useEffect, useRef, useState } from "react"
import { arNum } from "../lib/labels"
import { hasPackLink, readPackText } from "../lib/link"
import type { ParseResult } from "../lib/pack"
import type { ShootPack } from "../lib/types"

interface Props {
  /** A pack link the app was opened with. */
  link?: string
  onBack: () => void
  onSave: (p: ShootPack) => void
}

export function Import({ link, onBack, onSave }: Props) {
  const [text, setText] = useState("")
  const [result, setResult] = useState<ParseResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const read = async (t: string) => {
    const n = ++seq.current
    const r = t.trim() ? await readPackText(t) : null
    if (n === seq.current) setResult(r)
  }

  const check = (t: string) => {
    setText(t)
    void read(t)
  }

  useEffect(() => {
    if (link) void read(link)
  }, [link])

  const paste = async () => {
    try {
      check(await navigator.clipboard.readText())
    } catch {
      /* the person can paste by hand */
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <button className="ghost-btn" onClick={onBack} aria-label="رجوع">
          →
        </button>
        <h1 className="h-sm grow">{link ? "خطة وصلت برابط" : "استلم خطة من العقل"}</h1>
      </header>

      {!link && (
        <section className="card form">
          <div className="row">
            <button className="btn" onClick={paste}>
              الصق
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              افتح ملف
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) check(await f.text())
            }}
          />
          <textarea
            rows={hasPackLink(text) ? 3 : 10}
            dir="auto"
            placeholder="الصق رد العقل أو رابط الخطة هنا"
            value={text}
            onChange={(e) => check(e.target.value)}
          />
        </section>
      )}

      {result && (
        <section className="card">
          {result.pack ? (
            <>
              <h2>{result.pack.title}</h2>
              <p className="muted">
                {arNum(result.pack.shots.length)} لقطة
                {result.pack.project_code ? ` · ${result.pack.project_code}` : ""}
              </p>
              <ol className="mini">
                {result.pack.shots.map((s) => (
                  <li key={s.id}>{s.title}</li>
                ))}
              </ol>
            </>
          ) : null}
          {result.errors.length > 0 && (
            <ul className="errors">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result.pack && (
            <button className="btn primary wide" onClick={() => result.pack && onSave(result.pack)}>
              احفظ الخطة
            </button>
          )}
        </section>
      )}
    </div>
  )
}
