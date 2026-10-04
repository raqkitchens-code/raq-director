import type { Shot, ShootPack, Take } from "./types"

export function keptFor(takes: Take[], pack: ShootPack, shot: Shot): Take[] {
  return takes.filter((t) => t.pack_id === pack.id && t.shot_id === shot.id && t.kept)
}

export function isDone(takes: Take[], pack: ShootPack, shot: Shot): boolean {
  return keptFor(takes, pack, shot).some((t) => t.verdict === "accepted")
}

export function packProgress(takes: Take[], pack: ShootPack): { done: number; total: number } {
  return { done: pack.shots.filter((s) => isDone(takes, pack, s)).length, total: pack.shots.length }
}

/** What to shoot next: shots with no accepted take yet, in plan order. */
export function nextShots(takes: Take[], pack: ShootPack, limit = 4): { shot: Shot; index: number }[] {
  return pack.shots
    .map((shot, index) => ({ shot, index }))
    .filter(({ shot }) => !isDone(takes, pack, shot))
    .slice(0, limit)
}
