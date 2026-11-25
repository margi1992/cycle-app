import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS as S, type PeriodEntry } from '../src/lib/cycle'
import { canonical, mergeDocs, type SyncDoc } from '../src/lib/merge'
import { decryptJson, derive, encryptJson } from '../src/lib/crypto'

const doc = (entries: PeriodEntry[], deleted: Record<string, number> = {}, settingsUpdatedAt = 0, settings = S): SyncDoc =>
  ({ v: 1, entries, deleted, settings, settingsUpdatedAt })
const e = (id: string, start: string, updatedAt: number, end?: string): PeriodEntry => ({ id, start, end, updatedAt })

describe('merge', () => {
  it('unions entries from both devices', () => {
    const m = mergeDocs(doc([e('a', '2026-01-01', 1)]), doc([e('b', '2026-02-01', 2)]))
    expect(m.entries.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('newer edit wins', () => {
    const m = mergeDocs(doc([e('a', '2026-01-01', 1)]), doc([e('a', '2026-01-01', 5, '2026-01-05')]))
    expect(m.entries[0].end).toBe('2026-01-05')
  })
  it('a deletion propagates and is not resurrected by an older copy', () => {
    const m = mergeDocs(doc([e('a', '2026-01-01', 1)]), doc([], { a: 9 }))
    expect(m.entries).toHaveLength(0)
    expect(m.deleted.a).toBe(9)
  })
  it('an edit after a deletion on another device wins', () => {
    expect(mergeDocs(doc([e('a', '2026-01-01', 10)]), doc([], { a: 9 })).entries).toHaveLength(1)
  })
  it('same start date logged on two devices collapses to one, deterministically', () => {
    const a = doc([e('x', '2026-03-01', 1)])
    const b = doc([e('y', '2026-03-01', 2)])
    const m1 = mergeDocs(a, b)
    const m2 = mergeDocs(b, a)
    expect(m1.entries).toHaveLength(1)
    expect(canonical(m1)).toBe(canonical(m2))
  })
  it('is commutative and idempotent', () => {
    const a = doc([e('a', '2026-01-01', 3), e('c', '2026-03-01', 1)], { d: 4 }, 5)
    const b = doc([e('a', '2026-01-02', 2), e('b', '2026-02-01', 2)], { c: 6 }, 1)
    const ab = mergeDocs(a, b)
    expect(canonical(ab)).toBe(canonical(mergeDocs(b, a)))
    expect(canonical(mergeDocs(ab, a))).toBe(canonical(ab))
    expect(canonical(mergeDocs(ab, b))).toBe(canonical(ab))
  })
  it('newer settings win', () => {
    const m = mergeDocs(doc([], {}, 1, { ...S, periodLength: 5 }), doc([], {}, 2, { ...S, periodLength: 6 }))
    expect(m.settings.periodLength).toBe(6)
  })
})

describe('crypto', () => {
  it('round-trips and rejects a wrong passphrase', async () => {
    const a = await derive('correct horse battery staple')
    const b = await derive('correct horse battery stapleX')
    expect(a.id).toHaveLength(32)
    expect(a.token).toHaveLength(64)
    expect(a.id).not.toBe(b.id)
    const blob = await encryptJson({ hello: 'world' }, a.keyB64)
    expect(blob).not.toContain('world')
    expect(await decryptJson(blob, a.keyB64)).toEqual({ hello: 'world' })
    await expect(decryptJson(blob, b.keyB64)).rejects.toThrow()
  }, 20000)
})
