import { useCallback, useEffect, useRef, useState } from 'react'
import { clearConfig, deleteCloudCopy, loadConfig, makeConfig, saveConfig, syncOnce, type SyncConfig } from './sync'
import type { Store } from './store'
import type { AppData } from './store'

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'

export function useSync(store: Store, data: AppData | null) {
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [state, setState] = useState<SyncState>('off')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const running = useRef(false)
  const cfgRef = useRef<SyncConfig | null>(null)

  const setCfg = (c: SyncConfig | null) => { cfgRef.current = c; setConfig(c) }

  useEffect(() => {
    loadConfig().then((c) => { setCfg(c ?? null); setState(c ? 'idle' : 'off'); setLoaded(true) })
  }, [])

  const syncNow = useCallback(async () => {
    const c = cfgRef.current
    if (!c || running.current) return null
    running.current = true
    setState('syncing')
    try {
      const res = await syncOnce(c, store.getDoc())
      store.applyDoc(res.doc) // re-merges with whatever changed while we were waiting
      setCfg(res.config)
      setState('idle')
      setError('')
      return res
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? (e.message === 'Failed to fetch' ? 'Can’t reach the sync server (offline?).' : e.message) : 'Sync failed.')
      return null
    } finally {
      running.current = false
    }
  }, [store])

  /** Connect this device using a passphrase; returns what happened on the first sync. */
  const connect = useCallback(async (url: string, passphrase: string) => {
    const cfg = await makeConfig(url, passphrase)
    await saveConfig(cfg)
    setCfg(cfg)
    const res = await syncNow()
    return res ? { ok: true as const, hadRemote: res.hadRemote, periods: res.doc.entries.length } : { ok: false as const }
  }, [syncNow])

  const disconnect = useCallback(async () => {
    await clearConfig()
    setCfg(null)
    setState('off')
    setError('')
  }, [])

  const removeCloudCopy = useCallback(async () => {
    const c = cfgRef.current
    if (!c) return
    await deleteCloudCopy(c)
    await disconnect()
  }, [disconnect])

  // Sync after local changes (debounced), when the app regains focus / comes online, and periodically.
  useEffect(() => {
    if (!loaded || !config) return
    const t = setTimeout(() => void syncNow(), 1500)
    return () => clearTimeout(t)
  }, [data, loaded, config?.id, syncNow]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!config) return
    const go = () => { if (document.visibilityState === 'visible') void syncNow() }
    document.addEventListener('visibilitychange', go)
    window.addEventListener('online', go)
    const iv = setInterval(go, 60_000)
    return () => { document.removeEventListener('visibilitychange', go); window.removeEventListener('online', go); clearInterval(iv) }
  }, [config?.id, syncNow]) // eslint-disable-line react-hooks/exhaustive-deps

  return { config, state, error, connect, disconnect, syncNow, removeCloudCopy }
}

export type SyncApi = ReturnType<typeof useSync>
