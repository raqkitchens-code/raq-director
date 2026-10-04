/**
 * On-device storage (IndexedDB). Nothing here ever leaves the phone unless the
 * person exports a take themselves. The app has no server and makes no network calls.
 */
import type { ShootPack, Take } from "./types"

const DB_NAME = "raq-director"
const VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore("packs", { keyPath: "id" })
      const takes = db.createObjectStore("takes", { keyPath: "id" })
      takes.createIndex("by_shot", ["pack_id", "shot_id"])
      db.createObjectStore("blobs")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const db = {
  packs: () => run<ShootPack[]>("packs", "readonly", (s) => s.getAll()),
  savePack: (p: ShootPack) => run("packs", "readwrite", (s) => s.put(p)),
  deletePack: (id: string) => run("packs", "readwrite", (s) => s.delete(id)),
  takes: () => run<Take[]>("takes", "readonly", (s) => s.getAll()),
  saveTake: (t: Take) => run("takes", "readwrite", (s) => s.put(t)),
  async addTake(t: Take, blob: Blob) {
    const d = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(["takes", "blobs"], "readwrite")
      tx.objectStore("takes").put(t)
      tx.objectStore("blobs").put(blob, t.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  },
  blob: (id: string) => run<Blob | undefined>("blobs", "readonly", (s) => s.get(id)),
  async deleteTake(id: string) {
    const d = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(["takes", "blobs"], "readwrite")
      tx.objectStore("takes").delete(id)
      tx.objectStore("blobs").delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}

/** Asks the browser not to evict our data when the phone runs low on space. */
export async function persistStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null
  } catch {
    return null
  }
}
