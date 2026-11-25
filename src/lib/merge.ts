import type { PeriodEntry, Settings } from './cycle'

/** Everything that is synced between devices. Deletions are kept as tombstones (id -> time) so they propagate. */
export interface SyncDoc {
  v: 1
  entries: PeriodEntry[]
  deleted: Record<string, number>
  settings: Settings
  settingsUpdatedAt: number
}

const t = (e?: PeriodEntry) => e?.updatedAt ?? 0

/** Deterministic, order-independent merge: per-entry last-writer-wins, deletions win ties. */
export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  const ids = new Set([
    ...a.entries.map((e) => e.id), ...b.entries.map((e) => e.id),
    ...Object.keys(a.deleted), ...Object.keys(b.deleted),
  ])
  const live = new Map<string, PeriodEntry>()
  const deleted: Record<string, number> = {}

  for (const id of ids) {
    const ea = a.entries.find((e) => e.id === id)
    const eb = b.entries.find((e) => e.id === id)
    const best = t(ea) >= t(eb) ? ea : eb
    const tomb = Math.max(a.deleted[id] ?? -1, b.deleted[id] ?? -1)
    if (best && t(best) > tomb) live.set(id, best)
    else if (tomb >= 0) deleted[id] = tomb
  }

  // Two devices may have logged the same start date under different ids: keep the most recently edited one.
  const byStart = new Map<string, PeriodEntry>()
  for (const e of live.values()) {
    const cur = byStart.get(e.start)
    if (!cur || t(e) > t(cur) || (t(e) === t(cur) && e.id > cur.id)) byStart.set(e.start, e)
  }
  const winners = new Set([...byStart.values()].map((e) => e.id))
  for (const e of [...live.values()]) {
    if (!winners.has(e.id)) {
      const w = byStart.get(e.start)!
      live.delete(e.id)
      deleted[e.id] = Math.max(t(e), t(w))
    }
  }

  const useA = a.settingsUpdatedAt >= b.settingsUpdatedAt
  return {
    v: 1,
    entries: [...live.values()].sort((x, y) => x.start.localeCompare(y.start)),
    deleted,
    settings: useA ? a.settings : b.settings,
    settingsUpdatedAt: useA ? a.settingsUpdatedAt : b.settingsUpdatedAt,
  }
}

/** Stable string form for comparing documents. */
export function canonical(d: SyncDoc): string {
  return JSON.stringify({
    v: 1,
    entries: [...d.entries].sort((x, y) => x.id.localeCompare(y.id)).map((e) => ({ id: e.id, start: e.start, end: e.end ?? null, updatedAt: t(e) })),
    deleted: Object.keys(d.deleted).sort().map((k) => [k, d.deleted[k]]),
    settings: Object.keys(d.settings).sort().map((k) => [k, (d.settings as unknown as Record<string, unknown>)[k]]),
    settingsUpdatedAt: d.settingsUpdatedAt,
  })
}
