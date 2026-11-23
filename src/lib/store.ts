import { useCallback, useEffect, useRef, useState } from 'react'
import { get, set, del } from 'idb-keyval'
import { DEFAULT_SETTINGS, sortByStart, type PeriodEntry, type Settings } from './cycle'
import { todayISO } from './dates'

const KEY = 'cycle-data-v1'

export interface AppData {
  entries: PeriodEntry[]
  settings: Settings
  /** Dedupe key of the last reminder shown, e.g. "2026-12-06@3". Cleared when a period is logged. */
  lastNotified: string | null
}

const empty = (): AppData => ({ entries: [], settings: { ...DEFAULT_SETTINGS }, lastNotified: null })

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

export function useStore() {
  const [data, setData] = useState<AppData | null>(null)
  const ref = useRef<AppData | null>(null)

  useEffect(() => {
    get<AppData>(KEY).then((d) => {
      const loaded = d ? { ...empty(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } } : empty()
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
      commit((d) => ({ ...d, lastNotified: null, entries: [...d.entries, { id: newId(), start, end }] }))
      return true
    },
    updatePeriod: (id: string, start: string, end?: string) => {
      if (ref.current?.entries.some((e) => e.id !== id && e.start === start)) return false
      commit((d) => ({
        ...d, lastNotified: null,
        entries: d.entries.map((e) => (e.id === id ? { ...e, start, end } : e)),
      }))
      return true
    },
    deletePeriod: (id: string) =>
      commit((d) => ({ ...d, lastNotified: null, entries: d.entries.filter((e) => e.id !== id) })),
    updateSettings: (patch: Partial<Settings>) =>
      commit((d) => ({ ...d, lastNotified: null, settings: { ...d.settings, ...patch } })),
    markNotified: (key: string) => commit((d) => ({ ...d, lastNotified: key })),
    deleteAll: async () => {
      await del(KEY)
      const fresh = empty()
      ref.current = fresh
      setData(fresh)
    },
    exportJson: () => {
      const d = ref.current ?? empty()
      const blob = new Blob(
        [JSON.stringify({ app: 'cycle', version: 1, exportedOn: todayISO(), entries: d.entries, settings: d.settings }, null, 2)],
        { type: 'application/json' },
      )
      return blob
    },
  }
}

export type Store = ReturnType<typeof useStore>
