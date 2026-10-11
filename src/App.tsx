import { useCallback, useEffect, useRef, useState } from "react"
import { Director } from "./components/Director"
import { Home } from "./components/Home"
import { Import } from "./components/Import"
import { LensSetup } from "./components/LensSetup"
import { NativeLenses } from "./components/NativeLenses"
import { Lock } from "./components/Lock"
import { NewRequest } from "./components/NewRequest"
import { PackView } from "./components/PackView"
import { Takes } from "./components/Takes"
import { db, persistStorage } from "./lib/db"
import { LIBRARY_PACK } from "./lib/library"
import { unlockAudio } from "./lib/feedback"
import { RELOCK_MS } from "./lib/lock"
import { takeLaunchLink } from "./lib/link"
import { RaqCamera, isNative } from "./lib/native"
import type { ShootPack, Take } from "./lib/types"

type View =
  | { name: "home" }
  | { name: "pack"; id: string }
  | { name: "shoot"; id: string; index: number }
  | { name: "new" }
  | { name: "import"; link?: string }
  | { name: "takes" }
  | { name: "lens"; back: View }

export function App() {
  const [unlocked, setUnlocked] = useState(false)
  const [view, setView] = useState<View>({ name: "home" })
  const [packs, setPacks] = useState<ShootPack[]>([LIBRARY_PACK])
  const [takes, setTakes] = useState<Take[]>([])
  const hiddenAt = useRef(0)
  // A pack link waits here until the PIN is entered.
  const [incoming, setIncoming] = useState<string | null>(() => takeLaunchLink())

  // Links that arrive while the app is open: a new link in the browser tab, or the Android app opened from a link.
  useEffect(() => {
    const onHash = () => {
      const l = takeLaunchLink()
      if (l) setIncoming(l)
    }
    window.addEventListener("hashchange", onHash)
    if (!isNative()) return () => window.removeEventListener("hashchange", onHash)
    RaqCamera.takeLink()
      .then((r) => r.url && setIncoming(r.url))
      .catch(() => {})
    const sub = RaqCamera.addListener("link", (r) => r.url && setIncoming(r.url))
    return () => {
      window.removeEventListener("hashchange", onHash)
      sub.then((h) => h.remove()).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!unlocked || !incoming) return
    setView({ name: "import", link: incoming })
    setIncoming(null)
  }, [unlocked, incoming])

  // Lock again after the app sat in the background.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_MS) setUnlocked(false)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    persistStorage()
    Promise.all([db.packs(), db.takes()]).then(([ps, ts]) => {
      const saved = ps.find((p) => p.id === LIBRARY_PACK.id)
      setPacks([saved ?? LIBRARY_PACK, ...ps.filter((p) => p.id !== LIBRARY_PACK.id)])
      setTakes(ts)
    })
  }, [unlocked])

  const savePack = useCallback(async (p: ShootPack) => {
    setPacks((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]))
    await db.savePack(p)
  }, [])

  if (!unlocked)
    return (
      <Lock
        onUnlock={() => {
          unlockAudio()
          setUnlocked(true)
        }}
      />
    )

  const pack = "id" in view ? packs.find((p) => p.id === view.id) : undefined
  const home = () => setView({ name: "home" })

  switch (view.name) {
    case "pack":
      return pack ? (
        <PackView
          pack={pack}
          takes={takes}
          onBack={home}
          onShoot={(index) => setView({ name: "shoot", id: pack.id, index })}
          onChange={savePack}
          onDelete={async () => {
            await db.deletePack(pack.id)
            setPacks((ps) => ps.filter((p) => p.id !== pack.id))
            home()
          }}
        />
      ) : null
    case "shoot":
      return pack ? (
        <Director
          key={`${pack.id}:${view.index}`}
          pack={pack}
          shotIndex={view.index}
          takes={takes}
          onSaved={(t) => setTakes((ts) => [...ts, t])}
          onPackChange={savePack}
          onGo={(index) => setView({ name: "shoot", id: pack.id, index })}
          onExit={() => setView({ name: "pack", id: pack.id })}
          onLensSetup={() => setView({ name: "lens", back: view })}
        />
      ) : null
    case "new":
      return (
        <NewRequest
          onBack={home}
          onImport={() => setView({ name: "import" })}
          onCreate={async (p) => {
            await savePack(p)
            setView({ name: "pack", id: p.id })
          }}
        />
      )
    case "import":
      return (
        <Import
          key={view.link ?? "paste"}
          link={view.link}
          onBack={home}
          onSave={async (p) => {
            await savePack(p)
            setView({ name: "pack", id: p.id })
          }}
        />
      )
    case "takes":
      return (
        <Takes packs={packs} takes={takes} onBack={home} onDeleted={(id) => setTakes((ts) => ts.filter((t) => t.id !== id))} />
      )
    case "lens":
      return isNative() ? <NativeLenses onBack={() => setView(view.back)} /> : <LensSetup onBack={() => setView(view.back)} />
    default:
      return (
        <Home
          packs={packs}
          takes={takes}
          onOpenPack={(id) => setView({ name: "pack", id })}
          onShoot={(id, index) => setView({ name: "shoot", id, index })}
          onNew={() => setView({ name: "new" })}
          onImport={() => setView({ name: "import" })}
          onTakes={() => setView({ name: "takes" })}
          onLensSetup={() => setView({ name: "lens", back: { name: "home" } })}
          onLock={() => setUnlocked(false)}
        />
      )
  }
}
