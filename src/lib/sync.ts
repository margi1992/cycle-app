import { get, set, del } from 'idb-keyval'
import { decryptJson, derive, encryptJson } from './crypto'
import { canonical, mergeDocs, type SyncDoc } from './merge'

const CFG = 'cycle-sync-config-v1'

/** URL of your deployed sync Worker. Filled in after deployment; can also be typed into Settings. */
export const DEFAULT_SYNC_URL = 'https://cycle-sync.period-tracker.workers.dev'

export interface SyncConfig {
  url: string
  id: string
  token: string
  keyB64: string
  /** server-side version we last saw (for conflict detection) */
  version: number
  lastSynced: number | null
}

export const loadConfig = () => get<SyncConfig>(CFG)
export const saveConfig = (c: SyncConfig) => set(CFG, c)
export const clearConfig = () => del(CFG)

export async function makeConfig(url: string, passphrase: string): Promise<SyncConfig> {
  const d = await derive(passphrase)
  return { url: url.trim().replace(/\/+$/, ''), id: d.id, token: d.token, keyB64: d.keyB64, version: 0, lastSynced: null }
}

const headers = (c: SyncConfig) => ({ Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' })

export interface SyncResult {
  doc: SyncDoc
  /** true if the cloud had data when we looked */
  hadRemote: boolean
  config: SyncConfig
}

/** Pull, merge, push. Returns the merged document to apply locally. */
export async function syncOnce(config: SyncConfig, local: SyncDoc): Promise<SyncResult> {
  let cfg = config
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${cfg.url}/v1/${cfg.id}`, { headers: headers(cfg) })
    let remote: SyncDoc | null = null
    let version = 0
    if (r.status === 404) {
      remote = null
    } else if (r.ok) {
      const body = (await r.json()) as { blob: string; version: number }
      version = body.version
      try {
        remote = await decryptJson<SyncDoc>(body.blob, cfg.keyB64)
      } catch {
        throw new Error('Could not decrypt the cloud copy — the passphrase may be different.')
      }
    } else if (r.status === 401) {
      throw new Error('The sync server rejected this passphrase.')
    } else {
      throw new Error(`Sync server error (${r.status}).`)
    }

    const merged = remote ? mergeDocs(local, remote) : local
    const needPush = !remote || canonical(merged) !== canonical(remote)
    if (needPush) {
      const put = await fetch(`${cfg.url}/v1/${cfg.id}`, {
        method: 'PUT',
        headers: headers(cfg),
        body: JSON.stringify({ blob: await encryptJson(merged, cfg.keyB64), baseVersion: version }),
      })
      if (put.status === 409) { local = merged; continue } // someone else wrote meanwhile: re-read and merge again
      if (!put.ok) throw new Error(`Sync server error (${put.status}).`)
      version = ((await put.json()) as { version: number }).version
    }
    cfg = { ...cfg, version, lastSynced: Date.now() }
    await saveConfig(cfg)
    return { doc: merged, hadRemote: remote !== null, config: cfg }
  }
  throw new Error('Sync is busy — try again in a moment.')
}

export async function deleteCloudCopy(config: SyncConfig): Promise<void> {
  const r = await fetch(`${config.url}/v1/${config.id}`, { method: 'DELETE', headers: headers(config) })
  if (!r.ok && r.status !== 404) throw new Error(`Sync server error (${r.status}).`)
}
