import { useCallback, useEffect, useRef, useState } from 'react'
import { get, set, del } from 'idb-keyval'
import { DEFAULT_SETTINGS, sortByStart, type PeriodEntry, type Settings } from './cycle'
import { mergeDocs, type SyncDoc } from './merge'
import { todayISO } from './dates'

const KEY = 'cycle-data-v1'

export interface AppData {
  entries: PeriodEntry[]
  /** Tombstones for deleted entries (id -> time), so deletions sync to other devices. */
  deleted: Record<string, number>
  settings: Settings
  settingsUpdatedAt: number
  /** Dedupe key of the last reminder shown, e.g. "2026-12-06@3". Cleared when a period is logged. */
  lastNotified: string | null
}

const empty = (): AppData => ({ entries: [], deleted: {}, settings: { ...DEFAULT_SETTINGS }, settingsUpdatedAt: 0, lastNotified: null })
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))
const now = () => Date.now()

/** The synced part of the data. notificationsOn is per-device, so it is never shared. */
export const toDoc = (d: AppData): SyncDoc => ({
  v: 1,
  entries: d.entries,
  deleted: d.deleted,
  settings: { ...d.settings, notificationsOn: false },
  settingsUpdatedAt: d.settingsUpdatedAt,
})

export function useStore() {
  const [data, setData] = useState<AppData | null>(null)
  const ref = useRef<AppData | null>(null)

  useEffect(() => {
    get<AppData>(KEY).then((d) => {
      const base = empty()
      const loaded: AppData = d
        ? { ...base, ...d, deleted: d.deleted ?? {}, settings: { ...DEFAULT_SETTINGS, ...d.settings } }
        // entries created before sync existed get a timestamp so they can be merged
        : base
      loaded.entries = loaded.entries.map((e) => (e.updatedAt === undefined ? { ...e, updatedAt: now() } : e))
      ref.current = loaded
      setData(loaded)
    })
  }, [])

  const commit = useCallback((fn: (d: AppData) => AppData) => {
    const next = fn(ref.current ?? empty())
    next.entries = sortByStart(next.entries)
    ref.current = next
    setData(next)
    void set(KEY, next)
  }, [])

  return {
    data,
    /** Returns false if a period already starts on that date. */
    addPeriod: (start: string, end?: string) => {
      if (ref.current?.entries.some((e) => e.start === start)) return false
      commit((d) => ({ ...d, lastNotified: null, entries: [...d.entries, { id: newId(), start, end, updatedAt: now() }] }))
      return true
    },
    updatePeriod: (id: string, start: string, end?: string) => {
      if (ref.current?.entries.some((e) => e.id !== id && e.start === start)) return false
      commit((d) => ({
        ...d, lastNotified: null,
        entries: d.entries.map((e) => (e.id === id ? { ...e, start, end, updatedAt: now() } : e)),
      }))
      return true
    },
    deletePeriod: (id: string) =>
      commit((d) => ({
        ...d, lastNotified: null,
        entries: d.entries.filter((e) => e.id !== id),
        deleted: { ...d.deleted, [id]: now() },
      })),
    updateSettings: (patch: Partial<Settings>) =>
      commit((d) => {
        const onlyLocal = Object.keys(patch).every((k) => k === 'notificationsOn')
        return { ...d, lastNotified: null, settings: { ...d.settings, ...patch }, settingsUpdatedAt: onlyLocal ? d.settingsUpdatedAt : now() }
      }),
    markNotified: (key: string) => commit((d) => ({ ...d, lastNotified: key })),
    /** Current synced snapshot (always the latest, even inside async code). */
    getDoc: (): SyncDoc => toDoc(ref.current ?? empty()),
    /** Merge a document from the cloud into local data. */
    applyDoc: (doc: SyncDoc) =>
      commit((d) => {
        const m = mergeDocs(toDoc(d), doc)
        return { ...d, entries: m.entries, deleted: m.deleted, settings: { ...m.settings, notificationsOn: d.settings.notificationsOn }, settingsUpdatedAt: m.settingsUpdatedAt }
      }),
    /** Delete everything. When synced, deletions are kept as tombstones so other devices clear too. */
    deleteAll: async (synced: boolean) => {
      if (!synced) {
        await del(KEY)
        const fresh = empty()
        ref.current = fresh
        setData(fresh)
        return
      }
      commit((d) => ({
        ...empty(),
        deleted: { ...d.deleted, ...Object.fromEntries(d.entries.map((e) => [e.id, now()])) },
        settingsUpdatedAt: now(),
      }))
    },
    exportJson: () => {
      const d = ref.current ?? empty()
      return new Blob(
        [JSON.stringify({ app: 'cycle', version: 1, exportedOn: todayISO(), entries: d.entries.map(({ id, start, end }) => ({ id, start, end })), settings: d.settings }, null, 2)],
        { type: 'application/json' },
      )
    },
  }
}

export type Store = ReturnType<typeof useStore>
