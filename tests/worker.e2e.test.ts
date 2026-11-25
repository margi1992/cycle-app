// Runs only when a Worker is available: SYNC_URL=http://127.0.0.1:8787 npx vitest run tests/worker.e2e.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { DEFAULT_SETTINGS as S } from '../src/lib/cycle'
import { mergeDocs, type SyncDoc } from '../src/lib/merge'
import { deleteCloudCopy, makeConfig, syncOnce } from '../src/lib/sync'

const URL_ = process.env.SYNC_URL
const doc = (entries: SyncDoc['entries'], deleted: SyncDoc['deleted'] = {}): SyncDoc => ({ v: 1, entries, deleted, settings: S, settingsUpdatedAt: 0 })

describe.skipIf(!URL_)('worker end to end', () => {
  it('two devices converge, wrong passphrase is isolated, delete works', async () => {
    const pass = 'a long test passphrase ' + Date.now()
    const phone = await makeConfig(URL_!, pass)
    const desktop = await makeConfig(URL_!, pass)

    // phone uploads two periods; cloud was empty
    const r1 = await syncOnce(phone, doc([{ id: 'p1', start: '2026-10-26', updatedAt: 1 }, { id: 'p2', start: '2026-11-23', updatedAt: 2 }]))
    expect(r1.hadRemote).toBe(false)

    // desktop has a different period; after sync it sees all three
    const r2 = await syncOnce(desktop, doc([{ id: 'd1', start: '2026-09-28', updatedAt: 3 }]))
    expect(r2.hadRemote).toBe(true)
    expect(r2.doc.entries.map((e) => e.start)).toEqual(['2026-09-28', '2026-10-26', '2026-11-23'])

    // phone deletes p1, edits p2; desktop picks both up
    const r3 = await syncOnce(r1.config, mergeDocs(r1.doc, doc([{ id: 'p2', start: '2026-11-23', end: '2026-11-27', updatedAt: 10 }], { p1: 10 })))
    const r4 = await syncOnce(r2.config, r2.doc)
    expect(r3.doc.entries).toHaveLength(2)
    expect(r4.doc.entries.map((e) => e.id).sort()).toEqual(['d1', 'p2'])
    expect(r4.doc.entries.find((e) => e.id === 'p2')?.end).toBe('2026-11-27')

    // a different passphrase sees nothing
    const other = await makeConfig(URL_!, pass + 'x')
    const r5 = await syncOnce(other, doc([]))
    expect(r5.hadRemote).toBe(false)

    // correct id with a wrong token is rejected
    const forged = { ...phone, token: 'f'.repeat(64) }
    await expect(syncOnce(forged, doc([]))).rejects.toThrow()

    await deleteCloudCopy(r4.config)
    await deleteCloudCopy(r5.config)
    const r6 = await syncOnce(r4.config, doc([]))
    expect(r6.hadRemote).toBe(false)
    await deleteCloudCopy(r6.config)
  }, 60000)
})
